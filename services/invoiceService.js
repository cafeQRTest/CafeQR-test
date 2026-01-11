import { createClient } from '@supabase/supabase-js';
import { generateBillPdf } from '../lib/generateBillPdf';

export class InvoiceService {
  static async createInvoiceFromOrder(orderId, restaurantId = null) {
    try {
      // 1. Setup Supabase
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      // 2. Fetch order details
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderErr) throw orderErr;

      // 3. Fetch restaurant details
      const finalRestId = restaurantId || order.restaurant_id;
      const { data: restaurant, error: restErr } = await supabase
        .from('restaurants')
        .select('*, restaurant_profiles(gst_enabled, gst_rate, prices_include_tax, default_tax_rate)')
        .eq('id', finalRestId)
        .single();

      if (restErr) throw restErr;
      const profile = restaurant.restaurant_profiles;

      // 4. Fetch order items
      const { data: items, error: itemsErr } = await supabase
        .from('order_items')
        .select('*, menu_items(name)')
        .eq('order_id', orderId);

      if (itemsErr) throw itemsErr;

      // 5. GST settings (display only)
      const gstEnabled = (order.gst_enabled ?? profile?.gst_enabled) ?? false;
      const rawRate = restaurant.gst_rate || profile.default_tax_rate || 5;
      const gstRate = gstEnabled ? Number(rawRate) / 100 : 0;
      const pricesIncludeTax =
        (order.prices_include_tax ?? profile?.prices_include_tax) ?? false;

      // 6. Process line items (DISPLAY ONLY)
      let totalLineDiscounts = 0;
      let subtotalExGst = 0;

      const invoiceItems = items.map((item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const baseAmount = qty * price;

        let lineDiscountPct = Number(item.discount_percent || 0);
        let lineDiscountAmt = Number(item.discount_amount || 0);

        if (lineDiscountPct > 0 && lineDiscountAmt === 0) {
          lineDiscountAmt = baseAmount * (lineDiscountPct / 100);
        } else if (lineDiscountAmt > 0 && lineDiscountPct === 0 && baseAmount > 0) {
          lineDiscountPct = (lineDiscountAmt / baseAmount) * 100;
        }

        totalLineDiscounts += lineDiscountAmt;

        const lineNet = baseAmount - lineDiscountAmt;

        let lineGst = 0;
        let lineNetEx = 0;

        if (gstEnabled) {
          if (pricesIncludeTax) {
            const taxFactor = gstRate / (1 + gstRate);
            lineGst = lineNet * taxFactor;
            lineNetEx = lineNet - lineGst;
          } else {
            lineGst = lineNet * gstRate;
            lineNetEx = lineNet;
          }
        } else {
          lineNetEx = lineNet;
        }

        subtotalExGst += lineNetEx;

        return {
          item_name: item.item_name || item.name || item.menu_items?.name,
          quantity: qty,
          unit_price: price,
          discount_percent: Number(lineDiscountPct.toFixed(2)),
          discount_amount: Number(lineDiscountAmt.toFixed(2)),
          line_net: Number(lineNetEx.toFixed(2)),
          tax_rate: gstEnabled ? gstRate * 100 : 0,
          tax_amount: Number(lineGst.toFixed(2)),
          amount_inc_gst: Number((lineNetEx + lineGst).toFixed(2)),
        };
      });

      // ------------------------------------------------------------------
      // ✅ OVERRIDE TOTALS FROM ORDER (SOURCE OF TRUTH)
      // ------------------------------------------------------------------
      const orderDiscountAmt = Number(order.discount_amount || 0);
      const orderDiscountPct = Number(order.total_discount_percent || 0);
      const taxableAmount = Number(order.subtotal_ex_tax || 0);
      const totalGst = Number(order.total_tax || 0);
      const roundOff = Number(order.round_off_amount || 0);
      const grandTotal = Number(order.total_amount || 0);

      // 7. Generate Invoice Number and Bill Number
      const invoiceNo = await this.generateInvoiceNumber(finalRestId);
      const billNo = await this.generateBillNumber(finalRestId);

      // 8. Prepare Invoice Header (STRICT MIRROR OF ORDER)
      const invoiceData = {
        restaurant_id: finalRestId,
        order_id: order.id,
        invoice_no: invoiceNo,
        bill_no: billNo,
        invoice_date: new Date().toISOString().split('T')[0],

        line_subtotal: Number(subtotalExGst.toFixed(2)),
        line_discount_total: Number(totalLineDiscounts.toFixed(2)),

        discount_amount: Number(orderDiscountAmt.toFixed(2)),
        order_discount_percent: Number(orderDiscountPct.toFixed(2)),
        order_discount_total: Number(orderDiscountAmt.toFixed(2)),

        taxable_amount: Number(taxableAmount.toFixed(2)),
        subtotal_ex_gst: Number(taxableAmount.toFixed(2)),
        total_tax: Number(totalGst.toFixed(2)),
        gst_rate: gstEnabled ? rawRate : 0,

        total_inc_gst: Number(grandTotal.toFixed(2)),
        total_inc_tax: Number(grandTotal.toFixed(2)),
        round_off_amount: Number(roundOff.toFixed(2)),

        payment_method: order.payment_method,
        created_at: new Date().toISOString(),
        customer_name: order.customer_name,
      };

      // 9. Upsert Invoice
      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .upsert([invoiceData], { onConflict: 'order_id' })
        .select()
        .single();

      if (invErr) throw invErr;

      // 10. Insert Invoice Line Items
      const invoiceLineItems = invoiceItems.map((item, idx) => ({
        invoice_id: invoice.id,
        line_no: idx + 1,
        item_name: item.item_name,
        qty: item.quantity,
        unit_rate_ex_tax: item.unit_price,
        discount_percent: item.discount_percent,
        discount_amount: item.discount_amount,
        line_net: item.line_net,
        line_total_ex_tax: item.line_net,
        line_total_inc_tax: item.amount_inc_gst,
        tax_rate: item.tax_rate,
        tax_amount: item.tax_amount,
        amount_inc_gst: item.amount_inc_gst,
      }));

      await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id);

      const { error: lineErr } = await supabase
        .from('invoice_items')
        .insert(invoiceLineItems);

      if (lineErr) throw lineErr;

      return {
        invoiceId: invoice.id,
        invoiceNo: invoice.invoice_no,
        success: true,
      };
    } catch (error) {
      console.error('Invoice creation error:', error);
      throw error;
    }
  }

  static async generateInvoiceNumber(restaurantId) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let startYear, endYear;
    if (currentMonth >= 3) {
      startYear = currentYear;
      endYear = currentYear + 1;
    } else {
      startYear = currentYear - 1;
      endYear = currentYear;
    }

    const prefix = `FY${String(startYear).slice(-2)}-${String(endYear).slice(-2)}/`;

    const { data } = await supabase
      .from('invoices')
      .select('invoice_no')
      .eq('restaurant_id', restaurantId)
      .ilike('invoice_no', `${prefix}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    let nextSeq = 1;
    if (data?.length) {
      const lastSeq = parseInt(data[0].invoice_no.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    return `${prefix}${String(nextSeq).padStart(6, '0')}`;
  }

  static async generateBillNumber(restaurantId) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get the highest bill_no for this restaurant
    const { data } = await supabase
      .from('invoices')
      .select('bill_no')
      .eq('restaurant_id', restaurantId)
      .not('bill_no', 'is', null)
      .order('bill_no', { ascending: false })
      .limit(1);

    let nextBillNo = 1;
    if (data?.length && data[0].bill_no) {
      nextBillNo = Number(data[0].bill_no) + 1;
    }

    return nextBillNo;
  }
}
