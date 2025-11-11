// pages/api/invoices/void.js
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const { invoice_id, restaurant_id, reason } = req.body || {}
    if (!invoice_id || !restaurant_id) return res.status(400).json({ error: 'invoice_id and restaurant_id are required' })

    const { data: inv, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .eq('restaurant_id', restaurant_id)
      .single()
    if (invErr || !inv) return res.status(404).json({ error: 'Invoice not found' })

    if (String(inv.status || '').toLowerCase() === 'void') {
      return res.status(200).json({ ok: true, alreadyVoided: true })
    }

    // 1) Mark invoice void (triggers will handle credit reversal)
    const { error: updInvErr } = await supabase
      .from('invoices')
      .update({
        status: 'void',
        is_open: false,
        regeneration_reason: reason ? `void: ${reason}` : 'void',
        closed_date: new Date().toISOString()
      })
      .eq('id', invoice_id)
      .eq('restaurant_id', restaurant_id)
    if (updInvErr) return res.status(400).json({ error: updInvErr.message })

    // 2) Cancel linked order; reverse_credit_on_cancel will fire if appropriate
    if (inv.order_id) {
      await supabase
        .from('orders')
        .update({ status: 'cancelled', payment_status: 'cancelled' })
        .eq('id', inv.order_id)
        .eq('restaurant_id', restaurant_id)
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to void invoice' })
  }
}
