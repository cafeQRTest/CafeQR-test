// pages/api/invoices/generate.js
import { InvoiceService } from '../../../services/invoiceService'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { order_id } = req.body
  if (!order_id || typeof order_id !== 'string') {
    return res.status(400).json({ error: 'Valid Order ID is required' })
  }

  try {
    const result = await InvoiceService.createInvoiceFromOrder(order_id)

    // Ensure PDF URL is fully qualified for mobile browsers
    const fullUrl = result?.pdfUrl?.startsWith('http') 
      ? result.pdfUrl
      : `${process.env.NEXT_PUBLIC_BASE_URL || 'https://cafe-qr-app.vercel.app'}${result.pdfUrl}`

    return res.status(200).json({ pdf_url: fullUrl })
  } catch (error) {
    const msg = error?.message || ''
    const isDuplicate =
      error?.code === '23505' ||
      msg.includes('duplicate key value violates unique constraint') ||
      msg.includes('invoices_order_id_key')

    if (isDuplicate) {
      // Fetch and return existing invoice
      const { data, error: fetchErr } = await supabase
        .from('invoices')
        .select('pdf_url')
        .eq('order_id', order_id)
        .single()

      if (fetchErr) {
        console.error('Error fetching existing invoice:', fetchErr)
        return res.status(500).json({ error: 'Could not retrieve existing invoice' })
      }

      // Ensure existing PDF URL is also fully qualified
      const fullUrl = data?.pdf_url?.startsWith('http') 
        ? data.pdf_url
        : `${process.env.NEXT_PUBLIC_BASE_URL || 'https://cafe-qr-app.vercel.app'}${data.pdf_url}`

      return res.status(200).json({ pdf_url: fullUrl })
    }

    console.error('Invoice generation error:', error)
    return res.status(500).json({ error: msg || 'Failed to generate invoice' })
  }
}
