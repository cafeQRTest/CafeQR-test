//pages/api/admin/regenerate-all-invoices.js

import { InvoiceService, getNextInvoiceNumber } from '../../../services/invoiceService'
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { admin_key } = req.body
  if (admin_key !== process.env.ADMIN_REGENERATE_KEY) return res.status(403).json({ error: 'Invalid admin key' })

  try {
    // Find all restaurants
    const { data: restaurants } = await supabase.from('restaurants').select('id')
    let results = []
    for (const rest of restaurants) {
      // For each FY
      // Find unique FYs for which there are orders
      const { data: years } = await supabase
        .from('orders')
        .select('created_at')
        .eq('restaurant_id', rest.id)

      if (!years?.length) continue
      const fyears = Array.from(new Set(years.map((o) => getFiscalYear(o.created_at))))
      for (const fy of fyears) {
        const fyStart = getFiscalYearStartDate(fy)
        const fyStartStr = fyStart.toISOString().split('T')[0]
        // Delete existing invoices (danger!)
        await supabase.from('invoices')
          .delete()
          .eq('restaurant_id', rest.id)
          .like('invoice_no', `${fy}/%`)
        await supabase.from('invoice_counters')
          .upsert({ restaurant_id: rest.id, fy_start: fyStartStr, last_number: 0 }, { onConflict: 'restaurant_id,fy_start' })
        // Find completed orders in this FY, oldest first
        const { data: orders } = await supabase.from('orders')
          .select('id')
          .eq('restaurant_id', rest.id)
          .order('created_at', { ascending: true })
        for (const od of orders) {
          await InvoiceService.createInvoiceFromOrder(od.id, 'full_regeneration')
        }
      }
      results.push({ restaurant_id: rest.id, fiscal_years: fyears })
    }
    return res.status(200).json({ message: 'All invoices regenerated', details: results })
  } catch (err) {
    console.error('Full regen error', err)
    return res.status(500).json({ error: err.message })
  }
}
