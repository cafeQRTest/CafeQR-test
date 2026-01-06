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
      // Fallback if name is missing or "Unknown Item" (due to previous bug)
      if (!finalName || finalName === 'Unknown Item') {
          const match = order.order_items?.[idx]; 
          // Simple index match logic - risky but better than "Unknown"
          if (match) {
             finalName = match.menu_items?.name || match.item_name || 'Item';
          }
      }

      const qty = Number(row.qty || 0);
      const price = Number(row.unit_rate_ex_tax || 0);
      const discAmt = Number(row.discount_amount || 0);
      
      const lineNet = row.line_net ? Number(row.line_net) : (price * qty - discAmt);

      return {
        item_name: finalName,
        quantity: qty,
        unit_price: price, // generateBillPdf uses 'unit_price' or 'price'
        discount_percent: Number(row.discount_percent || 0),
        discount_amount: discAmt,
        line_net: lineNet
      };
    });

    // C. Totals
    const totalTax = Number(invoice?.total_tax || order.total_tax || 0);
    const roundOff = Number(invoice?.round_off_amount || order.round_off_amount || 0);
    const grandTotal = Number(invoice?.total_amount || invoice?.total_inc_gst || order.total_amount || 0);
    
    // Calculate line subtotal (Sum of Line Nets)
    const lineSubtotal = pdfItems.reduce((sum, it) => sum + it.line_net, 0);
    const lineDiscTotal = pdfItems.reduce((sum, it) => sum + it.discount_amount, 0);

    const totals = {
      line_subtotal: lineSubtotal,
      line_discount_total: lineDiscTotal,
      order_discount_total: Number(invoice?.discount_amount || order.discount_amount || 0),
      order_discount_percent: Number(order.total_discount_percent || 0),
      taxable_amount: Number(invoice?.taxable_amount || invoice?.subtotal_ex_gst || order.subtotal_ex_tax || 0),
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
