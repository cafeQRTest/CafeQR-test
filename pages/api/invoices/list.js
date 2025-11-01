//pages/api/invoices/list.js

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const { restaurant_id } = req.query
  if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id is required' })
  
  try {
    const { data, error } = await supabase
  .from('invoices')
  .select('id, invoice_no, order_id, payment_method, status, invoice_date, pdf_url, total_inc_tax, credit_customer_id, subtotal_ex_tax, total_tax, cgst, sgst, igst')
  .eq('restaurant_id', restaurant_id)
  .order('invoice_date', { ascending: false })
    
    if (error) throw error
    
    const invoices = (data || []).map(inv => ({
  id: inv.id,
  invoice_no: inv.invoice_no,
  order_id: inv.order_id,
  payment_method: inv.payment_method,
  status: inv.status || 'paid',
  invoice_date: inv.invoice_date,
  pdf_url: inv.pdf_url,
  amount: inv.total_inc_tax,
  credit_customer_id: inv.credit_customer_id,
  subtotal_ex_tax: inv.subtotal_ex_tax,
  total_tax: inv.total_tax,
  cgst: inv.cgst,
  sgst: inv.sgst,
  igst: inv.igst
}))
    
    res.status(200).json({ invoices })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to fetch invoices' })
  }
}
