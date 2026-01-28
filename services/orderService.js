import { createClient } from '@supabase/supabase-js';
import { InvoiceService } from './invoiceService';

/**
 * OrderService
 * Centralized service to persist calculated order results into Orders and Invoices tables.
 * This ensures consistency across Creation, Editing, and Settlement.
 */
export class OrderService {
  /**
   * Persists a calculated order results to the database.
   * Handles Orders, OrderItems, Invoices, and InvoiceItems.
   */
  static async persistCalculatedOrder(supabase, {
    orderId = null,
    restaurantId,
    calculationResult,
    metadata = {}
  }) {
    try {
      if (!restaurantId) throw new Error('restaurant_id is required');
      if (!calculationResult) throw new Error('calculationResult is required');

      const {
        processed_items,
        line_subtotal,
        line_discount_total,
        taxable_amount,
        total_tax,
        total_inc_tax,
        total_amount,
        round_off_amount,
        discount_amount, // Bill level face value
        order_discount_percent,
      } = calculationResult;

      const {
        status = 'new',
        payment_status = 'pending',
        payment_method = 'cash',
        customer_id = null,
        customer_name = null,
        customer_phone = null,
        number_of_customers = null,
        order_type = 'counter',
        table_number = null,
        is_credit = false,
        credit_customer_id = null,
        special_instructions = null,
        mixed_payment_details = null,
        created_at = null,
        prices_include_tax = false,
        base_tax_rate = null,
        gst_enabled = null,
      } = metadata;

      // 1. Prepare Order Payload
      const orderPayload = {
        restaurant_id: restaurantId,
        status,
        payment_status,
        payment_method,
        actual_payment_method: payment_method,
        customer_id,
        customer_name,
        customer_phone,
        number_of_customers,
        order_type,
        table_number,
        is_credit,
        credit_customer_id,
        special_instructions,
        mixed_payment_details,
        
        // Totals from Calculation Engine (Compliance focus)
        line_subtotal: calculationResult.subtotal_after_line_discounts || line_subtotal,
        line_discount_total,
        taxable_amount,
        discount_amount, // Face Value (Customer Payable Impact)
        total_discount_percent: order_discount_percent || 0,
        total_tax,
        total_inc_tax,
        round_off_amount,
        total_amount, // Final Payable
        
        updated_at: new Date().toISOString()
      };

      // Storing the base version of order discount for precise reporting if column exists
      if (calculationResult.total_order_discount_base !== undefined) {
         orderPayload.order_discount_base = calculationResult.total_order_discount_base;
      }

      if (created_at) orderPayload.created_at = created_at;
      if (status === 'completed') orderPayload.date_ordered = created_at || new Date().toISOString();

      let finalOrderId = orderId;

      let currentBillNo = null;

      // 2. Insert or Update Order
      if (finalOrderId) {
        const { data: updOrder, error: updErr } = await supabase
          .from('orders')
          .update(orderPayload)
          .eq('id', finalOrderId)
          .select('bill_no')
          .single();
        if (updErr) throw updErr;
        currentBillNo = updOrder?.bill_no;
      } else {
        const { data: newOrder, error: insErr } = await supabase
          .from('orders')
          .insert([orderPayload])
          .select()
          .single();
        if (insErr) throw insErr;
        finalOrderId = newOrder.id;
        currentBillNo = newOrder.bill_no;
      }

      // 3. Update Order Items
      // Delete existing and re-insert is safer for consistency than complex matching
      await supabase.from('order_items').delete().eq('order_id', finalOrderId);

      const orderItemsToInsert = processed_items.map(pi => ({
        order_id: finalOrderId,
        menu_item_id: pi.id,
        item_name: pi.item_name,
        quantity: pi.quantity,
        price: pi.unit_price, // MRP/Face
        variant_option_id: pi.variant_id || pi.variant_option_id || null,
        variant_name: pi.variant_name || null,
        
        unit_price_ex_tax: pi.unit_price_ex_tax,
        unit_price_inc_tax: pi.unit_price_inc_tax,
        unit_tax_amount: pi.unit_tax_amount,
        
        tax_rate: pi.tax_rate,
        hsn: pi.hsn || null,
        is_packaged_good: !!pi.is_packaged_good,
        uom_short_code: pi.uom_short_code,
        uom_precision: pi.uom_precision,
        
        // Granular Audit Fields
        discount_amount: pi.discount_amount, // Face Total (Line + Bill Share)
        line_discount_amount: pi.line_discount_face, // Face Line Discount
        order_discount_share: pi.order_discount_face_share, // Face Bill Share
        order_discount_base_share: pi.order_discount_share, // Base Bill Share (Audit)
        taxable_amount: pi.taxable_amount, // Final Taxable Base
        tax_amount: pi.tax_amount, // Final Tax
        line_total: pi.line_total // Final Total (Base + Tax)
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsToInsert);
      if (itemsErr) throw itemsErr;

      // 4. Upsert Invoice
      // Fetch or generate invoice number/bill number
      let { data: existingInvoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('order_id', finalOrderId)
        .maybeSingle();

      const invoiceData = {
        restaurant_id: restaurantId,
        order_id: finalOrderId,
        prices_include_tax: prices_include_tax ?? false,
        invoice_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        payment_method: payment_method,
        paid_amount: status === 'completed' ? total_amount : 0,
        status: status === 'completed' ? 'paid' : 'pending',
        customer_name,
      
        // Sync with Order Totals (Compliance Walk)
        line_subtotal: calculationResult.subtotal_after_line_discounts || line_subtotal,
        line_discount_total,
        taxable_amount,
        subtotal_ex_gst: taxable_amount,
        discount_amount, // Face Value (Customer Payable Impact)
        order_discount_total: discount_amount, // Face Value
        order_discount_base: calculationResult.total_order_discount_base || 0,
        order_discount_percent: order_discount_percent || 0,
        total_tax,
        total_inc_tax,
        total_inc_gst: total_amount,
        round_off_amount,
        subtotal_ex_tax: calculationResult.subtotal_after_line_discounts || line_subtotal, // Strict Base
        place_of_supply: 'intra_state'
      };

      if (!existingInvoice) {
        // Use bill_no from Order (likely set by DB Trigger)
        if (currentBillNo) {
           invoiceData.bill_no = currentBillNo;
        } else {
           invoiceData.bill_no = await InvoiceService.generateBillNumber(restaurantId);
        }
        
        invoiceData.invoice_no = await InvoiceService.generateInvoiceNumber(restaurantId);
        
        const { data: newInv, error: invInsErr } = await supabase
          .from('invoices')
          .insert([invoiceData])
          .select()
          .single();
        if (invInsErr) throw invInsErr;
        existingInvoice = newInv;
      } else {
        const { data: updInv, error: invUpdErr } = await supabase
          .from('invoices')
          .update(invoiceData)
          .eq('id', existingInvoice.id)
          .select()
          .single();
        if (invUpdErr) throw invUpdErr;
        existingInvoice = updInv;
      }

      // 5. Update Invoice Items
      await supabase.from('invoice_items').delete().eq('invoice_id', existingInvoice.id);

      const invoiceLineItems = processed_items.map((pi, idx) => ({
        invoice_id: existingInvoice.id,
        line_no: idx + 1,
        item_name: pi.item_name,
        variant_name: pi.variant_name,
        qty: pi.quantity,
        
        unit_rate_ex_tax: pi.unit_price_ex_tax,
        unit_price_display: pi.unit_price, // MRP
        
        discount_amount: pi.discount_amount, // Face Total
        line_discount_amount: pi.line_discount_face, // Face Line
        order_discount_share: pi.order_discount_face_share, // Face Bill Share
        order_discount_base_share: pi.order_discount_share, // Base Bill Share (Audit)
        
        line_net: pi.taxable_amount,
        line_total_ex_tax: pi.taxable_amount,
        line_total_inc_tax: pi.line_total,
        tax_rate: pi.tax_rate,
        tax_amount: pi.tax_amount,
        amount_inc_gst: pi.line_total,
        
        is_packaged_good: !!pi.is_packaged_good
      }));

      const { error: invItemsErr } = await supabase.from('invoice_items').insert(invoiceLineItems);
      if (invItemsErr) throw invItemsErr;

      return {
        orderId: finalOrderId,
        invoiceId: existingInvoice.id,
        invoiceNo: existingInvoice.invoice_no,
        billNo: existingInvoice.bill_no,
        invoice: existingInvoice,
        created_at: orderPayload.created_at || new Date().toISOString(),
        success: true
      };
    } catch (error) {
      console.error('[OrderService.persistCalculatedOrder] Error:', error);
      throw error;
    }
  }
}
