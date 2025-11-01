//pages/api/invoices/generate.js

import { InvoiceService } from '../../../services/invoiceService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  
  const { order_id, payment_method = 'cash', is_credit = false, credit_customer_id } = req.body
  
  if (!order_id || typeof order_id !== 'string')
    return res.status(400).json({ error: 'Valid Order ID is required' })
  
  try {
    const result = await InvoiceService.createInvoiceFromOrder(order_id, null)
    
    // ✅ NEW: Update invoice with payment method and credit info
    if (result.invoiceId) {
      await supabase
        .from('invoices')
        .update({
          payment_method: payment_method,
          status: is_credit ? 'open' : 'paid',
          is_open: is_credit,
          credit_customer_id: credit_customer_id || null
        })
        .eq('id', result.invoiceId)
    }
    
    return res.status(200).json({ 
      pdf_url: result.pdfUrl,
      status: is_credit ? 'open' : 'paid'
    })
  } catch (error) {
    // Fallback to return old PDF if duplicate (race)
    if ((error?.message || '').includes('unique')) {
      const { data, error: fetchErr } = await supabase
        .from('invoices')
        .select('pdf_url')
        .eq('order_id', order_id)
        .single()
      if (fetchErr) return res.status(500).json({ error: 'Could not retrieve existing invoice' })
      return res.status(200).json({ pdf_url: data?.pdf_url })
    }
    return res.status(500).json({ error: error?.message || 'Failed to generate invoice' })
  }
}
