// pages/api/invoices/download.js
import { createClient } from '@supabase/supabase-js'
import { generateBillPdf } from '../../../lib/generateBillPdf'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { order_id } = req.query
    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' })
    }

    // 1) Load order with items (kept for header info / fallbacks)
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(name))')
      .eq('id', order_id)
      .single()

    if (orderErr || !order) {
      throw new Error('Order not found')
    }

    // 1b) Load invoice header
    const { data: invoice, error: invoiceErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('order_id', order_id)
      .maybeSingle()

    if (invoiceErr) {
      throw new Error('Failed to load invoice data')
    }

    // 1c) Load invoice line items – source of truth for print
    const { data: invoiceItems, error: invItemsErr } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice?.id)

    if (invItemsErr) {
      throw new Error('Failed to load invoice items')
    }

    // 2) Load restaurant + profile
    const { data: restaurant, error: restErr } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', order.restaurant_id)
      .single()
    if (restErr || !restaurant) throw new Error('Restaurant not found')

    const { data: profile } = await supabase
      .from('restaurant_profiles')
      .select('*')
      .eq('restaurant_id', order.restaurant_id)
      .maybeSingle()

    // 3) Build payload (now using invoice_items for lines)
    const pdfPayload = {
      invoice: {
        invoice_no: invoice?.invoice_no,
        invoice_date: order.created_at || new Date().toISOString(),
        customer_name: order.customer_name || null,
        customer_gstin: order.customer_gstin || null,
        payment_method:
          order.payment_method || order.actual_payment_method || 'cash',
        subtotal_ex_tax:
          invoice?.subtotal_ex_tax ??
          order.subtotal_ex_tax ??
          order.subtotal ??
          0,
        total_tax: invoice?.total_tax ?? order.total_tax ?? order.tax_amount ?? 0,
        total_inc_tax:
          invoice?.total_inc_tax ?? order.total_inc_tax ?? order.total_amount ?? 0,
        gst_enabled: profile?.gst_enabled ?? order.gst_enabled ?? false,
        prices_include_tax: profile?.prices_include_tax ?? true,
        mixed_payment_details: order.mixed_payment_details || null,
      },

      // Use invoice_items rows, which already have correct ex‑tax rate, tax, and totals
      items: (invoiceItems || []).map((row) => ({
        item_name: row.item_name,
        quantity: row.qty,
        // ex‑tax unit rate stored on invoice_items
        price: row.unit_rate_ex_tax,
        hsn: row.hsn || '',
        tax_rate: row.tax_rate || 0,
        tax_amount: row.tax_amount || 0,
        line_total_ex_tax: row.line_total_ex_tax || 0,
        line_total_inc_tax: row.line_total_inc_tax || 0,
      })),

      restaurant: {
        name: restaurant.name,
        address: [
          profile?.shipping_address_line1,
          profile?.shipping_address_line2,
          [
            profile?.shipping_city,
            profile?.shipping_state,
            profile?.shipping_pincode,
          ]
            .filter(Boolean)
            .join(' '),
        ]
          .filter(Boolean)
          .join(', '),
        gstin: profile?.gstin || '',
        phone: profile?.phone || '',
        email: profile?.support_email || '',
      },
    }

    // 4) Generate PDF buffer in memory
    const { buffer, filename } = await generateBillPdf(
      pdfPayload,
      restaurant.id
    )

    // 5) Send as downloadable file
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    )
    res.setHeader('Content-Length', buffer.length)

    return res.status(200).end(buffer)
  } catch (e) {
    console.error('Download invoice error', e)
    return res
      .status(400)
      .json({ error: e.message || 'Failed to generate invoice PDF' })
  }
}
