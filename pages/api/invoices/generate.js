// pages/api/invoices/generate.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'order_id is required' });

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id, invoice_no, pdf_url, payment_status, total_inc_tax')
      .eq('order_id', order_id)
      .maybeSingle();

    if (error || !invoice) {
      return res.status(400).json({ error: 'Invoice not found for order' });
    }

    return res.status(200).json({
      invoice_id: invoice.id,
      invoice_no: invoice.invoice_no,
      pdf_url: invoice.pdf_url,
      payment_status: invoice.payment_status,
      total_inc_tax: invoice.total_inc_tax,
      exists: true
    });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Invoice lookup failed' });
  }
}
