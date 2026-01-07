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

      // 2. Fetch order details if not fully provided
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

      // 5. Determine GST settings
      const gstEnabled = (order.gst_enabled ?? profile?.gst_enabled) ?? false;
      const rawRate = restaurant.gst_rate || profile.default_tax_rate || 5;
      const gstRate = gstEnabled ? (Number(rawRate) / 100) : 0;
      const pricesIncludeTax = (order.prices_include_tax ?? profile?.prices_include_tax) ?? false;

      // 6. Process each item (Standard ERP calculation)
      let totalLineDiscounts = 0;
      let subtotalExGst = 0;

      const invoiceItems = items.map((item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const baseAmount = qty * price;

        // Line-wise discount
        let lineDiscountPct = Number(item.discount_percent || 0);
        let lineDiscountAmt = Number(item.discount_amount || 0);

        if (lineDiscountPct > 0 && lineDiscountAmt === 0) {
            lineDiscountAmt = baseAmount * (lineDiscountPct / 100);
        } else if (lineDiscountAmt > 0 && lineDiscountPct === 0 && baseAmount > 0) {
            lineDiscountPct = (lineDiscountAmt / baseAmount) * 100;
        }

        totalLineDiscounts += lineDiscountAmt;

        // Line net (Face Value after discount)
        const lineNet = baseAmount - lineDiscountAmt;

        // Line GST logic (Strip tax if inclusive)
        let lineGst = 0;
        let lineTaxRate = gstRate;
        let lineNetEx = 0; // The pure taxable base contribution
        
        if (gstEnabled) {
          if (pricesIncludeTax) {
            // Inclusive: Tax is inside lineNet
            const taxFactor = gstRate / (1 + gstRate);
            lineGst = lineNet * taxFactor;
            lineNetEx = lineNet - lineGst;
          } else {
            // Exclusive: Tax is on top
            lineGst = lineNet * gstRate;
            lineNetEx = lineNet;
          }
        } else {
            lineNetEx = lineNet;
            lineGst = 0;
            lineTaxRate = 0;
        }
        
        subtotalExGst += lineNetEx;

        return {
          item_name: item.item_name || item.name || item.menu_items?.name,
          quantity: qty,
          unit_price: price, 
          discount_percent: lineDiscountPct,
          discount_amount: Math.round(lineDiscountAmt * 100) / 100,
          line_net: Math.round(lineNetEx * 100) / 100, // Storing Ex-Tax Net for strict accounting
          tax_rate: lineTaxRate * 100,
          tax_amount: Math.round(lineGst * 100) / 100, 
          amount_inc_gst: Math.round((lineNetEx + lineGst) * 100) / 100, 
        };
      });

      // 7. Apply Order-Level Discount
      // Order Discount applies to the Subtotal Ex-Tax
      let orderDiscountPct = Number(order.total_discount_percent) || 0; 
      let orderDiscountAmt = Number(order.discount_amount) || 0;
      
      // Calculate derived amount if needed
      if (orderDiscountPct > 0) {
          orderDiscountAmt = subtotalExGst * (orderDiscountPct / 100);
      } else if (orderDiscountAmt > 0 && subtotalExGst > 0) {
           orderDiscountPct = (orderDiscountAmt / subtotalExGst) * 100;
      }
      
      const taxableAmount = Math.max(0, subtotalExGst - orderDiscountAmt);

      // 8. Calculate GST on Final Taxable Amount
      // (Simplified: Single rate on total taxable)
      const totalGst = gstEnabled ? Math.round(taxableAmount * gstRate * 100) / 100 : 0;

      // 9. Grand Total
      const roundOff = Number(order.round_off_amount || 0);
      const grandTotal = Math.round((taxableAmount + totalGst + roundOff) * 100) / 100;

      // 10. Generate Invoice Number
      const invoiceNo = await this.generateInvoiceNumber(restaurant.id);
      
      // 11. Prepare Invoice Header
      const invoiceData = {
        restaurant_id: finalRestId,
        order_id: order.id,
        invoice_no: invoiceNo,
        invoice_date: new Date().toISOString().split('T')[0],
        
        line_subtotal: Math.round(subtotalExGst * 100) / 100,
        line_discount_total: Math.round(totalLineDiscounts * 100) / 100,
        
        // Map to both possible column names for compatibility
        discount_amount: Math.round(orderDiscountAmt * 100) / 100,
        order_discount_percent: Math.round(orderDiscountPct * 100) / 100,
        order_discount_total: Math.round(orderDiscountAmt * 100) / 100,
        
        taxable_amount: Math.round(taxableAmount * 100) / 100,
        total_tax: totalGst,
        gst_rate: gstEnabled ? gstRate * 100 : 0,
        
        subtotal_ex_gst: Math.round(taxableAmount * 100) / 100, // Legacy/Compatible field for Taxable Amount
        total_inc_gst: grandTotal,
        total_inc_tax: grandTotal,
        round_off_amount: roundOff,
        
        payment_method: order.payment_method,
        created_at: new Date().toISOString(),
        customer_name: order.customer_name
      };

      // 12. Upsert Invoice
      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .upsert([invoiceData], { onConflict: 'order_id' })
        .select()
        .single();

      if (invErr) throw invErr;

      // 13. Insert Lines
      const invoiceLineItems = invoiceItems.map((item, idx) => ({
        invoice_id: invoice.id,
        line_no: idx + 1,
        item_name: item.item_name,
        qty: item.quantity,
        unit_rate_ex_tax: item.unit_price, // Fallback to face value if rigorous ex-tax unit calc not available
        discount_percent: item.discount_percent,
        discount_amount: item.discount_amount,
        line_net: item.line_net,
        // Populate redundant schema fields
        line_total_ex_tax: item.line_net, 
        line_total_inc_tax: item.amount_inc_gst,
        
        tax_rate: item.tax_rate,
        tax_amount: item.tax_amount,
        amount_inc_gst: item.amount_inc_gst
      }));

      await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id);
      
      const { error: lineErr } = await supabase
        .from('invoice_items')
        .insert(invoiceLineItems);

      if (lineErr) throw lineErr;

      return {
        invoiceId: invoice.id,
        invoiceNo: invoice.invoice_no,
        success: true
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

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    const { data } = await supabase
      .from('invoices')
      .select('invoice_no')
      .eq('restaurant_id', restaurantId)
      .ilike('invoice_no', `INV-%-${today}`)
      .order('invoice_no', { ascending: false })
      .limit(1);

    let nextSeq = 1;
    if (data && data.length > 0) {
       const parts = data[0].invoice_no.split('-');
       if (parts.length >= 2) {
          const num = parseInt(parts[1], 10);
          if (!isNaN(num)) nextSeq = num + 1;
       }
    }
    return `INV-${String(nextSeq).padStart(4, '0')}-${today}`;
  }
}

