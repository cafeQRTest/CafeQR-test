// pages/api/invoices/download.js
import { createClient } from '@supabase/supabase-js';
import { generateBillPdf } from '../../../lib/generateBillPdf';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { order_id } = req.query;
    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }

    // 1) Load order with items (for header / fallbacks)
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(name))')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) {
      throw new Error('Order not found');
    }

    // 1b) Load invoice header
    const { data: invoice, error: invoiceErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('order_id', order_id)
      .maybeSingle();

    if (invoiceErr) {
      throw new Error('Failed to load invoice data');
    }

    // 1c) Load invoice line items – source of truth for print
    const { data: invoiceItems, error: invItemsErr } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice?.id);

    if (invItemsErr) {
      throw new Error('Failed to load invoice items');
    }

    // 2) Load restaurant + profile
    const { data: restaurant, error: restErr } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', order.restaurant_id)
      .single();
    if (restErr || !restaurant) throw new Error('Restaurant not found');

    const { data: profile } = await supabase
      .from('restaurant_profiles')
      .select('*')
      .eq('restaurant_id', order.restaurant_id)
      .maybeSingle();

    // 3) Build payloads for PDF Generator
    // Signature: generateBillPdf(invoice, items, totals)

    // A. Invoice Header
    const invoiceHeader = {
      invoice_no: invoice?.invoice_no || `ORD-${order_id.slice(0, 8)}`,
      invoice_date: new Date(invoice?.created_at || order.created_at).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      customer_name: invoice?.customer_name || order.customer_name || 'Guest',
      customer_phone: invoice?.customer_phone || order.customer_phone || ''
    };

    // B. Items
    const pdfItems = (invoiceItems || []).map((row, idx) => {
      let finalName = row.item_name;
      if (!finalName || finalName === 'Unknown Item') {
          const match = order.order_items?.[idx]; 
          if (match) finalName = match.menu_items?.name || match.item_name || 'Item';
      }

      const qty = Number(row.qty || 0);
      const rateEx = Number(row.unit_rate_ex_tax || 0);
      const taxRate = Number(row.tax_rate || 0);
      const discAmt = Number(row.discount_amount || 0);
      
      // Determine if we should show inclusive or exclusive based on profile
      const showInclusive = !!profile?.prices_include_tax;
      
      let displayRate = rateEx;
      let displayLineTotal = row.line_total_inc_tax ? Number(row.line_total_inc_tax) : Number(row.line_total_ex_tax || 0) + Number(row.tax_amount || 0);

      if (showInclusive && taxRate > 0) {
          // If we want to show inclusive, we add tax to the ex-tax rate
          displayRate = rateEx * (1 + taxRate / 100);
          // Amount col should be (Rate * Qty) - Discount
          // But wait, the discAmt is usually ex-tax if it was applied to ex-tax base.
          // In counter.js/create.js, line discount is applied to FACE VALUE (Inclusive).
          // So (Base Inclusive * Qty) - (Line Discount) is the finished inclusive line total.
          displayLineTotal = (displayRate * qty) - discAmt;
      } else {
          // Exclusive view: Rate is ex-tax, Amount is line_net (ex-tax)
          displayRate = rateEx;
          displayLineTotal = row.line_net ? Number(row.line_net) : (rateEx * qty - discAmt);
      }

      return {
        item_name: finalName,
        quantity: qty,
        unit_price: displayRate, 
        discount_amount: discAmt,
        line_net: displayLineTotal
      };
    });

    // C. Totals
    const totalTax = Number(invoice?.total_tax || order.total_tax || 0);
    const roundOff = Number(invoice?.round_off_amount || order.round_off_amount || 0);
    const grandTotal = Number(invoice?.total_amount || invoice?.total_inc_gst || order.total_amount || 0);
    
    // Calculate line subtotal (Sum of Ex-Tax Line Nets) for the summary breakdown
    const lineSubtotalEx = (invoiceItems || []).reduce((sum, row) => sum + Number(row.line_net || 0), 0);
    const lineDiscTotal = (invoiceItems || []).reduce((sum, row) => sum + Number(row.discount_amount || 0), 0);

    const orderDiscAmt = Number(invoice?.order_discount_total || order.discount_amount || 0);
    const taxableAmount = Math.max(0, lineSubtotalEx - orderDiscAmt);

    const totals = {
      line_subtotal: lineSubtotalEx,
      line_discount_total: lineDiscTotal,
      order_discount_total: orderDiscAmt,
      order_discount_percent: Number(invoice?.order_discount_percent || order.total_discount_percent || 0),
      taxable_amount: taxableAmount,
      total_tax: totalTax,
      gst_rate: Number(invoice?.gst_rate || profile?.default_tax_rate || 5),
      round_off_amount: roundOff,
      total_amount: grandTotal
    };

    // 4) Generate PDF
    const { buffer, filename } = await generateBillPdf(
      invoiceHeader,
      pdfItems,
      totals,
      {
        name: restaurant.name,
        address: [
          profile?.shipping_address_line1,
          profile?.shipping_address_line2,
          profile?.shipping_city,
          profile?.shipping_state,
          profile?.shipping_pincode,
        ].filter(Boolean).join(', '),
        phone: profile?.shipping_phone || profile?.phone || '',
        email: profile?.support_email || '',
        gstin: profile?.gstin || ''
      }
    );

    // 5) Send file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.setHeader('Content-Length', buffer.length);

    return res.status(200).end(buffer);
  } catch (e) {
    console.error('Download invoice error', e);
    return res
      .status(400)
      .json({ error: e.message || 'Failed to generate invoice PDF' });
  }
}
