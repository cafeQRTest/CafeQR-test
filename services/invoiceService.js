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

      // 5. Build Invoice Header (DIRECT MIRROR OF ORDER)
      // No recalculation here. Trust the 'order' and 'items' (order_items) as Source of Truth.
      const invoiceNo = await this.generateInvoiceNumber(finalRestId);
      const billNo = await this.generateBillNumber(finalRestId);

      const invoiceData = {
        restaurant_id: finalRestId,
        order_id: order.id,
        invoice_no: invoiceNo,
        bill_no: billNo,
        invoice_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),

        // Map from Order Header aggregates (using new audit fields for fidelity)
        line_subtotal: Number(order.line_subtotal || order.subtotal_ex_tax || 0),
        taxable_amount: Number(order.taxable_amount || 0),
        subtotal_ex_gst: Number(order.taxable_amount || 0),

        discount_amount: Number(order.discount_amount || 0),
        order_discount_total: Number(order.discount_amount || 0),
        order_discount_percent: Number(order.total_discount_percent || 0),
        
        line_discount_total: Number(order.line_discount_total || 0),
        
        total_tax: Number(order.total_tax || 0),
        gst_rate: order.gst_rate || profile.gst_rate || profile.default_tax_rate || 5,

        total_inc_gst: Number(order.total_amount || 0),
        total_inc_tax: Number(order.total_inc_tax || 0),
        round_off_amount: Number(order.round_off_amount || 0),

        payment_method: order.payment_method,
        paid_amount: Number(order.total_amount || 0),
        subtotal_ex_tax: Number(order.line_subtotal || order.subtotal_ex_tax || 0),
        created_at: new Date().toISOString(),
        customer_name: order.customer_name,
        discount_type: (order.total_discount_percent > 0) ? 'percent' : 'amount',
        place_of_supply: 'intra_state'
      };

      // 6. Upsert Invoice
      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .upsert([invoiceData], { onConflict: 'order_id' })
        .select()
        .single();

      if (invErr) throw invErr;

      // 7. Insert Invoice Line Items (DIRECT CLONE OF ORDER ITEMS)
      const invoiceLineItems = items.map((item, idx) => ({
        invoice_id: invoice.id,
        line_no: idx + 1,
        item_name: item.item_name || item.menu_items?.name,
        qty: item.quantity,
        
        unit_rate_ex_tax: Number(item.unit_price_ex_tax || 0), 
        unit_price_display: Number(item.price || 0), 
        
        discount_percent: Number(item.discount_percent || 0),
        discount_amount: Number(item.discount_amount || 0),
        
        // Final line totals derived from stored order snapshots
        line_net: Number((item.unit_price_ex_tax * item.quantity).toFixed(2)),          
        line_total_ex_tax: Number((item.unit_price_ex_tax * item.quantity).toFixed(2)), 
        line_total_inc_tax: Number(((item.unit_price_ex_tax + item.unit_tax_amount) * item.quantity).toFixed(2)), 
        
        tax_rate: item.tax_rate,
        tax_amount: Number((item.unit_tax_amount * item.quantity).toFixed(2)),
        amount_inc_gst: Number(((item.unit_price_ex_tax + item.unit_tax_amount) * item.quantity).toFixed(2)),
        
        is_packaged_good: !!item.is_packaged_good,
        variant_name: item.variant_name
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
