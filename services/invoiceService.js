// services/invoiceService.js
import { createClient } from '@supabase/supabase-js'
import { generateBillPdf } from '../lib/generateBillPdf'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getFiscalYear(date = new Date()) {
  const month = date.getMonth()
  const year = date.getFullYear()
  if (month >= 3) {
    return `FY${year % 100}-${(year + 1) % 100}`
  } else {
    return `FY${(year - 1) % 100}-${year % 100}`
  }
}

function getFiscalYearStartDate(fy) {
  const match = fy.match(/FY(\d+)-(\d+)/)
  if (!match) return new Date()
  const startYear = 2000 + parseInt(match[1])
  return new Date(startYear, 3, 1) // April 1st
}

export class InvoiceService {
  static async createInvoiceFromOrder(orderId) {
    try {
      // Return if already exists
      const { data: existing, error: existingErr } = await supabase
        .from('invoices')
        .select('id, invoice_no, invoice_date, pdf_url, restaurant_id, order_id')
        .eq('order_id', orderId)
        .maybeSingle()
      if (!existingErr && existing) {
        return {
          invoiceId: existing.id,
          invoiceNo: existing.invoice_no,
          pdfUrl: existing.pdf_url
        }
      }

      // Fetch order, restaurant, profile
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single()
      if (orderError || !order) throw new Error(`Order ${orderId} not found`)
      const { data: restaurant, error: restErr } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', order.restaurant_id)
        .single()
      if (restErr || !restaurant) throw new Error(`Restaurant ${order.restaurant_id} not found`)
      const { data: profile } = await supabase
        .from('restaurant_profiles')
        .select('*')
        .eq('restaurant_id', order.restaurant_id)
        .maybeSingle()

      // Effective flags for restaurant service items
      const gstEnabled = (order.gst_enabled ?? profile?.gst_enabled) ?? false
      const baseRate = gstEnabled ? Number(profile?.default_tax_rate ?? 0) : 0;
      const includeFlag = profile?.prices_include_tax
      const servicePricesIncludeTax = gstEnabled
        ? (includeFlag === true || includeFlag === 'true' || includeFlag === 1 || includeFlag === '1')
        : false

      // 3) Normalize items with packaged branching
const orderItems = Array.isArray(order.order_items) 
  ? order.order_items 
  : (Array.isArray(order.items) ? order.items : [])

const enrichedItems = orderItems.map(oi => {
        const isPackaged = !!oi.is_packaged_good
        const qty = Number(oi.quantity ?? 1)
        const taxRate = Number(oi.tax_rate ?? 0)
        const unitIncStamped = Number(oi.unit_price_inc_tax ?? 0)
        const unitExStamped  = Number(oi.unit_price_ex_tax ?? 0)
        const legacy         = Number(oi.price ?? 0)
        let unitResolved
        unitResolved = servicePricesIncludeTax
          ? (unitIncStamped || legacy)
          : (unitExStamped || legacy)
        return {
          name: oi.item_name || oi.name || 'Item',
          qty,
          taxRate: gstEnabled
            ? (isPackaged ? taxRate : Number(isFinite(baseRate) ? baseRate : 0))
            : 0,
          unitResolved: Number(unitResolved),
          hsn: oi.hsn || '',
          isPackaged
        }
      })

      // 4) Compute totals with same branching
      const computed = enrichedItems.reduce((acc, it) => {
        const r = it.taxRate / 100
        if (servicePricesIncludeTax) {
          const inc = it.unitResolved * it.qty
          const ex  = r > 0 ? inc / (1 + r) : inc
          const tax = inc - ex
          acc.subtotal += ex
          acc.tax += tax
          acc.total += inc
        } else {
          const ex  = it.unitResolved * it.qty
          const tax = r * ex
          const inc = ex + tax
          acc.subtotal += ex
          acc.tax += tax
          acc.total += inc
        }
        return acc
      }, { subtotal: 0, tax: 0, total: 0 })

      const subtotalEx = Number(order.subtotal_ex_tax ?? order.subtotal ?? computed.subtotal)
      const totalTax   = Number(order.total_tax ?? order.tax_amount ?? computed.tax)
      const totalInc   = Number(order.total_inc_tax ?? order.total_amount ?? computed.total)

      // 5) GENERATE RESTAURANT-SPECIFIC INVOICE NUMBER
      const currentFY = getFiscalYear()
      const fyStartDate = getFiscalYearStartDate(currentFY)
      const { data: counter, error: counterReadErr } = await supabase
        .from('invoice_counters')
        .select('last_number')
        .eq('restaurant_id', restaurant.id)
        .eq('fy_start', fyStartDate.toISOString().split('T')[0])
        .maybeSingle()
      let nextInvoiceNum = 1
      if (!counterReadErr && counter) {
        nextInvoiceNum = (counter.last_number || 0) + 1
      }
      const { error: counterUpsertErr } = await supabase
        .from('invoice_counters')
        .upsert({
          restaurant_id: restaurant.id,
          fy_start: fyStartDate.toISOString().split('T')[0],
          last_number: nextInvoiceNum
        }, {
          onConflict: 'restaurant_id,fy_start'
        })
      if (counterUpsertErr) {
        console.error('Invoice counter update error:', counterUpsertErr)
        throw new Error('Failed to generate invoice number')
      }
      const invoiceNo = `${currentFY}/${String(nextInvoiceNum).padStart(6, '0')}`

      // 6) Create invoice header via UPSERT to avoid unique-constraint errors
      const { data: inv, error: invError } = await supabase
        .from('invoices')
        .upsert({
          restaurant_id: restaurant.id,
          order_id: order.id,
          invoice_no: invoiceNo, // Now restaurant-specific
          invoice_date: new Date().toISOString(),
          customer_name: order.customer_name || null,
          customer_gstin: order.customer_gstin || null,
          billing_address: order.billing_address || null,
          shipping_address: order.shipping_address || null,
          gst_enabled: gstEnabled,
          prices_include_tax: servicePricesIncludeTax,
          subtotal_ex_tax: subtotalEx,
          total_tax: totalTax,
          total_inc_tax: totalInc,
          cgst: gstEnabled ? totalTax / 2 : 0,
          sgst: gstEnabled ? totalTax / 2 : 0,
          igst: 0,
          payment_method: order.payment_method || 'cash'
        }, { onConflict: 'order_id' })
        .select()
        .single()
      if (invError || !inv) throw new Error(invError?.message || 'Failed to create invoice')

      // 7) Recreate invoice line items to avoid duplicates
      await supabase.from('invoice_items').delete().eq('invoice_id', inv.id)
      let lineNo = 1
      for (const it of enrichedItems) {
        const r = it.taxRate / 100
        let ex, inc, tax, unitExResolved
        if (it.isPackaged || servicePricesIncludeTax) {
          inc = it.unitResolved * it.qty
          ex  = r > 0 ? inc / (1 + r) : inc
          tax = inc - ex
          unitExResolved = r > 0 ? it.unitResolved / (1 + r) : it.unitResolved
        } else {
          ex  = it.unitResolved * it.qty
          tax = r * ex
          inc = ex + tax
          unitExResolved = it.unitResolved
        }
        const exR = Number(ex.toFixed(2))
        const taxR = Number(tax.toFixed(2))
        const incR = Number(inc.toFixed(2))
        const unitExR = Number(unitExResolved.toFixed(2))
        await supabase.from('invoice_items').insert({
          invoice_id: inv.id,
          line_no: lineNo++,
          item_name: it.name,
          hsn: it.hsn || null,
          qty: it.qty,
          unit_rate_ex_tax: unitExR,
          tax_rate: it.taxRate,
          tax_amount: taxR,
          line_total_ex_tax: exR,
          line_total_inc_tax: incR
        })
      }

      // 8) Generate PDF and update invoice with URL
      const pdfPayload = {
        invoice: {
          invoice_no: inv.invoice_no,
          invoice_date: inv.invoice_date,
          customer_name: inv.customer_name,
          customer_gstin: inv.customer_gstin,
          payment_method: inv.payment_method,
          subtotal_ex_tax: subtotalEx,
          total_tax: totalTax,
          total_inc_tax: totalInc,
          gst_enabled: gstEnabled,
          prices_include_tax: servicePricesIncludeTax
        },
        items: enrichedItems.map(it => ({
          item_name: it.name,
          quantity: it.qty,
          price: it.unitResolved,
          hsn: it.hsn,
          tax_rate: it.taxRate,
          is_packaged_good: it.isPackaged
        })),
                restaurant: {
          name: restaurant.name,
          address: [
            profile?.shipping_address_line1,
            profile?.shipping_address_line2,
            [profile?.shipping_city, profile?.shipping_state, profile?.shipping_pincode]
              .filter(Boolean).join(' ')
          ].filter(Boolean).join(', '),
          gstin: profile?.gstin || '',
          phone: profile?.phone || '',
          email: profile?.support_email || ''
        }
      }
      const { pdfUrl } = await generateBillPdf(pdfPayload, restaurant.id)
      await supabase.from('invoices').update({ pdf_url: pdfUrl }).eq('id', inv.id)
      return { invoiceId: inv.id, invoiceNo: inv.invoice_no, pdfUrl }
    } catch (error) {
      console.error('Invoice generation error:', error)
      throw error
    }
  }
}