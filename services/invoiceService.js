// services/invoiceService.js - CORRECTED


import { createClient } from '@supabase/supabase-js'
import { generateBillPdf } from '../lib/generateBillPdf'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getFiscalYear(date = new Date()) {
  const d = new Date(date)
  const month = d.getMonth()
  const year = d.getFullYear()
  return month >= 3
    ? `FY${year % 100}-${(year + 1) % 100}`
    : `FY${(year - 1) % 100}-${year % 100}`
}

function getFiscalYearStartDate(fy) {
  const match = fy.match(/FY(\d+)-(\d+)/)
  if (!match) return new Date()
  const startYear = 2000 + parseInt(match[1])
  return new Date(startYear, 3, 1)
}

// --- UNIVERSAL INVOICE NUMBER GENERATOR ---
export async function getNextInvoiceNumber(restaurant_id, fy, fyStartDateStr) {
  // Get max invoice_no from existing invoices
  const { data: invData } = await supabase
    .from('invoices')
    .select('invoice_no')
    .eq('restaurant_id', restaurant_id)
    .like('invoice_no', `${fy}/%`)
    .order('invoice_no', { ascending: false })
    .limit(1)

  let maxIssued = 0
  if (invData?.[0]?.invoice_no) {
    const seq = String(invData[0].invoice_no).match(/(\d+)$/)
    maxIssued = seq ? parseInt(seq[1], 10) : 0
  }
  // Counter
  const { data: ctr } = await supabase
    .from('invoice_counters')
    .select('last_number')
    .eq('restaurant_id', restaurant_id)
    .eq('fy_start', fyStartDateStr)
    .maybeSingle()
  const counter = ctr ? parseInt(ctr.last_number, 10) : 0

  return Math.max(maxIssued, counter) + 1
}

// --- DAILY BILL NUMBER GENERATOR (Resets daily at 00:00 IST) ---
export async function getNextBillNumber(restaurant_id) {
  // Get current time in IST (UTC + 5:30)
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000 // IST is UTC+5:30
  const istTime = new Date(now.getTime() + istOffset)
  
  // Get start of day in IST (00:00 IST)
  const startOfDayIST = new Date(istTime)
  startOfDayIST.setUTCHours(0, 0, 0, 0)
  
  // Convert back to UTC for database query
  const startOfDayUTC = new Date(startOfDayIST.getTime() - istOffset)
  const startOfDay = startOfDayUTC.toISOString()
  
  // Get max bill_no from invoices created today (IST)
  const { data: invData } = await supabase
    .from('invoices')
    .select('bill_no')
    .eq('restaurant_id', restaurant_id)
    .gte('created_at', startOfDay)
    .order('bill_no', { ascending: false })
    .limit(1)

  const maxBillNo = invData?.[0]?.bill_no || 0
  return maxBillNo + 1
}

export class InvoiceService {
  static async createInvoiceFromOrder(orderId, regenerationReason = null) {
    try {
      // Load order, restaurant, profile
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single()
      if (orderErr || !order)
        throw new Error(`Order ${orderId} not found`)

      const { data: restaurant, error: restErr } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', order.restaurant_id)
        .single()
      if (restErr || !restaurant)
        throw new Error(`Restaurant ${order.restaurant_id} not found`)

      const { data: profile } = await supabase
        .from('restaurant_profiles')
        .select('*')
        .eq('restaurant_id', order.restaurant_id)
        .maybeSingle()

      // Correct fiscal year (use order.created_at if available)
      const fy = getFiscalYear(order.created_at || new Date())
      const fyStartDate = getFiscalYearStartDate(fy)
      const fyStartDateStr = fyStartDate.toISOString().split('T')[0]
      
      // Safe atomic sequence (retry max 5)
      let ok = false
      let invoiceNo, nextNum, inv, nextBillNo
      for (let tries = 0; tries < 5 && !ok; tries++) {
        nextNum = await getNextInvoiceNumber(restaurant.id, fy, fyStartDateStr)
        invoiceNo = `${fy}/${String(nextNum).padStart(6, '0')}`
        nextBillNo = await getNextBillNumber(restaurant.id)
        
        // ✅ FIXED: Declare payMethod BEFORE it's used in generateBillPdf
        const payMethod = order.payment_method || order.actual_payment_method || 'cash'
        
        const { data, error } = await supabase
          .from('invoices')
          .insert({
            restaurant_id: restaurant.id,
            order_id: order.id,
            invoice_no: invoiceNo,
            bill_no: nextBillNo,
            invoice_date: order.created_at || new Date().toISOString(),
            customer_name: order.customer_name || null,
            customer_gstin: order.customer_gstin || null,
            billing_address: order.billing_address || null,
            shipping_address: order.shipping_address || null,
            gst_enabled: order.gst_enabled ?? profile?.gst_enabled ?? false,
            prices_include_tax: profile?.prices_include_tax ?? true,
            subtotal_ex_tax: order.subtotal_ex_tax ?? order.subtotal ?? 0,
            total_tax: order.total_tax ?? order.tax_amount ?? 0,
            total_inc_tax: order.total_inc_tax ?? order.total_amount ?? 0,
            discount_amount: order.discount_amount || 0,
            cgst: (order.gst_enabled ?? profile?.gst_enabled) ? ((order.total_tax ?? order.tax_amount ?? 0) / 2) : 0,
            sgst: (order.gst_enabled ?? profile?.gst_enabled) ? ((order.total_tax ?? order.tax_amount ?? 0) / 2) : 0,
            igst: 0,
            payment_method: payMethod,
            status: payMethod === 'none' ? 'unpaid' : 'paid',
            // FIXED: Use total_amount (AFTER discount) not total_inc_tax (BEFORE discount)
            paid_amount: payMethod === 'none' ? 0 : (order.total_amount ?? order.total_inc_tax ?? 0),
            mixed_payment_details: order.mixed_payment_details || null,
            generation_method: regenerationReason ? 'regenerated' : 'auto',
            regenerated_from_invoice_id: null,
            regeneration_reason: regenerationReason || null,
            date_ordered: order.date_ordered || order.created_at || new Date().toISOString()
          })
          .select()
          .single()

        if (!error && data) {
          ok = true
          inv = data
          // Upsert invoice_counters
          await supabase.from('invoice_counters').upsert({
            restaurant_id: restaurant.id,
            fy_start: fyStartDateStr,
            last_number: nextNum
          }, { onConflict: 'restaurant_id,fy_start' })

        } else if (error?.message?.includes('unique') && !error?.message?.includes('bill_no')) {
          // If invoice_no duplicate, try again
          // Note: if bill_no is duplicate (unlikely with just insert), it might error but we don't have unique constraint on bill_no alone, usually it's fine unless we added unique index on bill_no+date+restaurant.
          // The retry loop is mainly for invoice_no.
          continue
        } else if (error) {
          throw new Error(error.message)
        }
      }
      if (!ok) throw new Error('Failed to produce unique invoice number')

      // Invoice line items
      await supabase.from('invoice_items').delete().eq('invoice_id', inv.id)
      let items = order.order_items || order.items || []
      if (!Array.isArray(items)) items = []
      let lineNo = 1
      for (const it of items) {
        const qty = Number(it.quantity ?? 1)
        const taxRate = Number(it.tax_rate ?? profile?.default_tax_rate ?? 0)

        let unitRateForDB, taxAmt, lineEx, lineInc

        // Use pre-calculated discounted values from order_items if available
        // This ensures the Invoice matches the Order exactly (including item discounts)
        if (it.unit_price_ex_tax !== undefined && it.unit_price_inc_tax !== undefined) {
             const unitEx = Number(it.unit_price_ex_tax);
             const unitInc = Number(it.unit_price_inc_tax);
             
             lineEx = Number((unitEx * qty).toFixed(2))
             lineInc = Number((unitInc * qty).toFixed(2))
             taxAmt = Number((lineInc - lineEx).toFixed(2))
             unitRateForDB = unitEx
        } else {
           // Fallback calculation for legacy items or non-standard payload
           const price = Number(it.is_packaged_good && !inv.prices_include_tax ? it.unit_price_ex_tax : (it.price ?? 0))
           const ex = price * qty
           const tax = (taxRate / 100) * ex
           const inc = ex + tax
           
           lineEx = Number(ex.toFixed(2))
           lineInc = Number(inc.toFixed(2))
           taxAmt = Number(tax.toFixed(2))
           unitRateForDB = price
        }

        await supabase.from('invoice_items').insert({
          invoice_id: inv.id,
          line_no: lineNo++,
          item_name: it.item_name || it.name || 'Item',
          hsn: it.hsn || null,
          qty,
          unit_rate_ex_tax: unitRateForDB,
          tax_rate: taxRate,
          tax_amount: taxAmt,
          line_total_ex_tax: lineEx,
          line_total_inc_tax: lineInc,
          uom_precision: it.uom_precision ?? 0,
          uom_short_code: it.uom_short_code || null,
          discount_amount: Number(it.discount_amount || 0)
        })
      }
      return { invoiceId: inv.id, invoiceNo }
    } catch (err) {
      console.error('Invoice generation error:', err)
      throw err
    }
  }
}
