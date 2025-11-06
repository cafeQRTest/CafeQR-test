// pages/api/invoices/generate.js
import { InvoiceService } from '../../../services/invoiceService'; // ← three dots up
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { order_id, payment_method, mixed_payment_details, is_credit, credit_customer_id } = req.body || {};
    if (!order_id) return res.status(400).json({ error: 'order_id is required' });

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Infer restaurant_id from the order (so the client does not have to send it)
    const { data: ord, error: ordErr } = await supabase
      .from('orders')
      .select('id, restaurant_id, status, payment_method, actual_payment_method')
      .eq('id', order_id)
      .single();
    if (ordErr || !ord) return res.status(400).json({ error: 'Order not found' });

    // Optionally update order with final payment data before invoicing
    if (payment_method || mixed_payment_details || is_credit === true) {
      const patch = {};
      if (payment_method) {
        patch.payment_method = payment_method;
        patch.actual_payment_method = payment_method;
        if (payment_method !== 'credit') patch.status = 'completed';
      }
      if (mixed_payment_details) patch.mixed_payment_details = mixed_payment_details;
      if (is_credit === true && credit_customer_id) {
        patch.is_credit = true;
        patch.credit_customer_id = credit_customer_id;
      }
      if (Object.keys(patch).length) {
        const { error: updErr } = await supabase.from('orders').update(patch).eq('id', order_id);
        if (updErr) return res.status(400).json({ error: 'Failed updating order before invoice: ' + updErr.message });
      }
    }

    // Create invoice
    const { invoiceId, invoiceNo, pdfUrl } = await InvoiceService.createInvoiceFromOrder(order_id);
    return res.status(200).json({ invoice_id: invoiceId, invoice_no: invoiceNo, pdfUrl });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Invoice generation failed' });
  }
}
