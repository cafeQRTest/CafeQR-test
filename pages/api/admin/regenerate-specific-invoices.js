//pages/api/admin/regenerate-specific-invoices.js

import { InvoiceService } from '../../../services/invoiceService'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { order_ids, admin_key } = req.body
  if (admin_key !== process.env.ADMIN_REGENERATE_KEY)
    return res.status(403).json({ error: 'Invalid admin key' })
  if (!Array.isArray(order_ids) || !order_ids.length)
    return res.status(400).json({ error: 'order_ids array is required' })

  let results = { success: [], failed: [], skipped: [] }
  for (const orderId of order_ids) {
    try {
      const { data: existingInv } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', orderId)
        .single()
      if (!existingInv) {
        results.skipped.push({ orderId, reason: 'No existing invoice' })
        continue
      }
      await supabase.from('invoice_items').delete().eq('invoice_id', existingInv.id)
      const result = await InvoiceService.createInvoiceFromOrder(orderId, 'manual_regeneration')
      results.success.push({ orderId, invoiceNo: result.invoiceNo })
      await new Promise(resolve => setTimeout(resolve, 200))
    } catch (err) {
      results.failed.push({ orderId, error: err.message })
    }
  }
  return res.status(200).json({ summary: {
    total: order_ids.length,
    successful: results.success.length,
    failed: results.failed.length,
    skipped: results.skipped.length }, details: results })
}
