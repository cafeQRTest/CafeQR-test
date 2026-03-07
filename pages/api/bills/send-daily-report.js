// pages/api/bills/send-daily-report.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { restaurant_id } = req.body || {}
  if (!restaurant_id) {
    return res.status(400).json({ error: 'restaurant_id is required' })
  }

  // Build today’s UTC window
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const today = `${yyyy}-${mm}-${dd}`
  const startUTC = `${today}T00:00:00Z`
  const endUTC = `${today}T23:59:59Z`

  try {
    // Prevent duplicates
    const { data: existing } = await supabase
      .from('billing_reports')
      .select('id')
      .eq('restaurant_id', restaurant_id)
      .eq('report_date', today)
      .maybeSingle()
    if (existing) {
      return res.status(200).json({ mailed: false, reason: 'already_sent' })
    }

    // Fetch invoices
    const { data: invoices = [] } = await supabase
      .from('invoices')
      .select('invoice_no, order_id, payment_method, invoice_date, pdf_url, total_inc_tax')
      .eq('restaurant_id', restaurant_id)
      .gte('invoice_date', startUTC)
      .lte('invoice_date', endUTC)

    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.total_inc_tax || 0), 0)

    // Assemble email body
    const lines = invoices.map(inv => {
      const no = inv.invoice_no || '-'
      const ord = inv.order_id?.slice(0, 8).toUpperCase() || '—'
      const pm = inv.payment_method || '—'
      const amt = Number(inv.total_inc_tax || 0).toFixed(2)
      return `${no} • Order #${ord} • ${pm} • ₹${amt} • ${inv.pdf_url || '—'}`
    })
    const body = [
      `Daily Invoice Report for ${today}`,
      `Total Invoices: ${invoices.length}`,
      `Total Revenue: ₹${totalRevenue.toFixed(2)}`,
      '',
      'Invoice Details:',
      lines.length ? lines.join('\n') : 'No invoices today'
    ].join('\n')

    // Dynamically require the mailer at runtime (Webpack won’t statically bundle this)
    let emailSent = false
    try {
      const libPath = '../../lib/email'
      // eslint-disable-next-line no-eval
      const mailer = eval("require")(libPath)
      const sendMail = mailer?.sendMail
      if (typeof sendMail === 'function' && process.env.OWNER_EMAIL) {
        await sendMail({
          to: process.env.OWNER_EMAIL,
          subject: `Daily Invoice Report – ${today}`,
          text: body
        })
        emailSent = true
      }
    } catch (e) {
      console.warn('Mailer missing or failed, skipping email:', e.message)
    }

    // Log report
    await supabase
      .from('billing_reports')
      .insert({ restaurant_id, report_date: today })

    return res.status(200).json({
      mailed: emailSent,
      count: invoices.length,
      total: totalRevenue
    })
  } catch (error) {
    console.error('send-daily-report error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
