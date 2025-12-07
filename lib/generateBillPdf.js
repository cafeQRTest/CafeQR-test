// lib/generateBillPdf.js

import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

// Collect pdfkit output to Buffer
function pdfToBuffer(doc) {
  const chunks = []
  return new Promise((resolve, reject) => {
    doc.on('data', (d) => chunks.push(d))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

// Currency helper
const money = (n) => `₹${Number(n || 0).toFixed(2)}`

function twoCol(doc, left, right, xLeft, xRight, y, widthRight) {
  doc.text(left, xLeft, y)
  doc.text(right, xRight, y, { width: widthRight, align: 'right' })
}

function textEllipsis(doc, str, x, y, width, opts = {}) {
  const options = { width, ...opts }
  const metrics = doc.widthOfString(str)
  if (metrics <= width) { doc.text(str, x, y, options); return }
  let s = str
  while (s.length && doc.widthOfString(s + '…') > width) s = s.slice(0, -1)
  doc.text(s + '…', x, y, options)
}

export async function generateBillPdf(payload, restaurantId) {
  const invoice = payload?.invoice ?? {}
  const itemsIn = Array.isArray(payload?.items) ? payload.items : []
  const restaurant = payload?.restaurant ?? {}

  const payMethod = (invoice.payment_method || 'cash').toUpperCase()
  const mixed = invoice.mixed_payment_details

  const items = (itemsIn.length ? itemsIn : [
    { item_name: '—', quantity: 1, price: 0, hsn: '', tax_rate: 0, is_packaged_good: false },
  ]).map(it => ({
    name: it.item_name || 'Item',
    qty: Number(it.quantity ?? 1),
    rate: Number(it.price ?? 0),
    price: Number(it.price ?? 0), // Keep original price field for pre-calculated branch
    hsn: it.hsn || '',
    taxRate: Number(it.tax_rate ?? 0),
    isPackaged: !!it.is_packaged_good,
    // Preserve pre-calculated values from invoice_items
    use_precalculated: it.use_precalculated,
    line_total_inc_tax: it.line_total_inc_tax,
    line_total_ex_tax: it.line_total_ex_tax,
    tax_amount: it.tax_amount,
  }))

  const includeRaw = invoice?.prices_include_tax
  const servicePricesInclusive =
    includeRaw === true || includeRaw === 'true' || includeRaw === 1 || includeRaw === '1'

  let paymentDisplay = payMethod
  if (payMethod === 'MIXED' && mixed) {
    paymentDisplay =
      `MIXED (₹${mixed.cash_amount} Cash + ₹${mixed.online_amount} ` +
      `${mixed.online_method?.toUpperCase() || 'Online'})`
  }

  const computed = items.reduce((acc, it) => {
    const r = it.taxRate / 100
    if (servicePricesInclusive) {
      const inc = it.rate * it.qty
      const ex = r > 0 ? inc / (1 + r) : inc
      const tax = inc - ex
      acc.subtotal += ex
      acc.tax += tax
      acc.total += inc
    } else {
      const ex = it.rate * it.qty
      const tax = r * ex
      const inc = ex + tax
      acc.subtotal += ex
      acc.tax += tax
      acc.total += inc
    }
    return acc
  }, { subtotal: 0, tax: 0, total: 0 })

  const invSubtotal = Number(invoice.subtotal_ex_tax ?? computed.subtotal)
  const invTax = Number(invoice.total_tax ?? computed.tax)
  const invTotal = Number(invoice.total_inc_tax ?? invoice.total ?? computed.total)

  const invNo = invoice.invoice_no || '-'
  const invDate = invoice.invoice_date ? new Date(invoice.invoice_date) : new Date()

  const istDateString = invDate.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  // Document and fonts
  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  const REGULAR_FONT = path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Regular.ttf')
  const BOLD_FONT = path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Bold.ttf')
  if (fs.existsSync(REGULAR_FONT)) {
    doc.registerFont('Regular', REGULAR_FONT)
    if (fs.existsSync(BOLD_FONT)) doc.registerFont('Bold', BOLD_FONT)
    else doc.registerFont('Bold', REGULAR_FONT)
    doc.font('Regular')
  } else {
    doc.font('Helvetica')
  }

  const pageWidth = doc.page.width
  const contentWidth = pageWidth - 80
  const gray = '#666'
  const light = '#e5e7eb'
  const dark = '#111'
  const brand = '#111827'
  const leftX = 40
  const rightBoxW = 240
  const rightX = pageWidth - 40 - rightBoxW
  const topY = 40

  // Header
  doc.fillColor(brand).font('Bold').fontSize(18)
  doc.text(restaurant.name || 'Restaurant', leftX, topY)
  doc.moveDown(0.3)
  doc.font('Regular').fontSize(9).fillColor(gray)
  const addr = [restaurant.address, restaurant.phone, restaurant.email]
    .filter(Boolean)
    .join(' • ')
  if (addr) doc.text(addr, { width: contentWidth - (rightBoxW + 20) })
  if (restaurant.gstin) doc.text(`GSTIN: ${restaurant.gstin}`)

  const metaH = 64
  doc.roundedRect(rightX, topY, rightBoxW, metaH, 6)
    .strokeColor(light)
    .lineWidth(1)
    .stroke()

  // Title
  doc.font('Bold').fontSize(11).fillColor(dark).text('TAX INVOICE', rightX + 12, topY + 8)

  // Same small font for Invoice No, Date, Payment
  doc.font('Regular').fontSize(8)
  const metaWidth = rightBoxW - 24

  doc.text(`Invoice No: ${invNo}`, rightX + 12, topY + 24, {
    width: metaWidth,
  })
  doc.text(`Date: ${istDateString}`, rightX + 12, topY + 36, {
    width: metaWidth,
  })
  doc.text(`Payment: ${paymentDisplay}`, rightX + 12, topY + 48, {
    width: metaWidth,
  })

  const headerBottom = Math.max(doc.y + 12, topY + metaH + 8)
  doc.moveTo(leftX, headerBottom).lineTo(pageWidth - 40, headerBottom)
    .strokeColor(light)
    .stroke()

  // Table
  const tableTop = headerBottom + 14
  const col = {
    hsn:  { x: leftX, w: 70 },
    desc: { x: leftX + 74, w: contentWidth - (74 + 56 + 80 + 46 + 80 + 90) },
    qty:  { x: pageWidth - 40 - (56 + 80 + 46 + 80 + 90), w: 56 },
    rate: { x: pageWidth - 40 - (80 + 46 + 80 + 90), w: 80 },
    taxp: { x: pageWidth - 40 - (46 + 80 + 90), w: 46 },
    taxa: { x: pageWidth - 40 - (80 + 90), w: 80 },
    total:{ x: pageWidth - 40 - 90, w: 90 },
  }

  doc.font('Bold').fontSize(10).fillColor(dark)
  doc.text('HSN/SAC', col.hsn.x, tableTop, { width: col.hsn.w })
  doc.text('Description', col.desc.x, tableTop, { width: col.desc.w })
  doc.text('Qty', col.qty.x, tableTop, { width: col.qty.w, align: 'right' })
  doc.text('Rate (₹)', col.rate.x, tableTop, { width: col.rate.w, align: 'right' })
  doc.text('Tax %', col.taxp.x, tableTop, { width: col.taxp.w, align: 'right' })
  doc.text('Tax Amt (₹)', col.taxa.x, tableTop, { width: col.taxa.w, align: 'right' })
  doc.text('Total (₹)', col.total.x, tableTop, { width: col.total.w, align: 'right' })

  const lineY = tableTop + 14
  doc.moveTo(leftX, lineY).lineTo(pageWidth - 40, lineY)
    .strokeColor(light)
    .lineWidth(1)
    .stroke()

  // Rows
  doc.font('Regular').fontSize(10).fillColor(dark)
  let y = lineY + 6
  const rowH = 16
  const bottomLimit = doc.page.height - 150

  items.forEach((it) => {
    if (y + rowH > bottomLimit) { doc.addPage(); y = 40 }
    const r = it.taxRate / 100
    let taxAmt, lineTotal, unitAmt

    // Check if we have pre-calculated values from invoice_items (more accurate)
    if (it.use_precalculated && it.line_total_inc_tax !== undefined) {
      // Use the pre-calculated values from invoice_items table
      lineTotal = it.line_total_inc_tax
      taxAmt = it.tax_amount || 0
      unitAmt = it.price // This is already the ex-tax unit rate
    } else {
      // Fallback to calculation (for backwards compatibility)
      if (servicePricesInclusive) {
        unitAmt = r > 0 ? it.rate / (1 + r) : it.rate
        const lineInc = it.rate * it.qty
        const lineEx = r > 0 ? lineInc / (1 + r) : lineInc
        taxAmt = lineInc - lineEx
        lineTotal = lineInc
      } else {
        unitAmt = it.rate
        const lineEx = it.rate * it.qty
        taxAmt = r * lineEx
        lineTotal = lineEx + taxAmt
      }
    }

    textEllipsis(doc, String(it.hsn || ''), col.hsn.x, y, col.hsn.w)
    textEllipsis(doc, it.name, col.desc.x, y, col.desc.w)
    doc.text(it.qty.toFixed(0), col.qty.x, y, { width: col.qty.w, align: 'right' })
    doc.text(money(unitAmt), col.rate.x, y, { width: col.rate.w, align: 'right' })
    doc.text(it.taxRate.toFixed(2), col.taxp.x, y, { width: col.taxp.w, align: 'right' })
    doc.text(money(taxAmt), col.taxa.x, y, { width: col.taxa.w, align: 'right' })
    doc.text(money(lineTotal), col.total.x, y, { width: col.total.w, align: 'right' })

    y += rowH
    doc.moveTo(leftX, y + 2).lineTo(pageWidth - 40, y + 2)
      .strokeColor('#f3f4f6')
      .lineWidth(0.5)
      .stroke()
    y += 2
  })

  // Totals
  const totalsX = pageWidth - 40 - 260
  const totalsY = Math.max(y + 10, bottomLimit - 90)
  const totalsW = 260
  const totalsH = 96

  doc.roundedRect(totalsX, totalsY, totalsW, totalsH, 6)
    .strokeColor(light)
    .lineWidth(1)
    .stroke()
  doc.font('Regular').fontSize(10).fillColor(dark)
  twoCol(doc, 'Subtotal', money(invSubtotal), totalsX + 12, totalsX + 12, totalsY + 12, totalsW - 24)
  twoCol(doc, 'Total Tax', money(invTax), totalsX + 12, totalsX + 12, totalsY + 32, totalsW - 24)
  doc.font('Bold')
  twoCol(doc, 'Grand Total', money(invTotal), totalsX + 12, totalsX + 12, totalsY + 56, totalsW - 24)
  doc.font('Regular')

  // Footer
  const footY = totalsY + totalsH + 16
  doc.fontSize(8).fillColor(gray).text('This is a computer-generated invoice.', leftX, footY)

  // Buffer only – no storage
  const buffer = await pdfToBuffer(doc)
  const safeName = (invoice.invoice_no || `${Date.now()}`).replace(/[^\w\-./]/g, '_')
  const filename = `${safeName}.pdf`

  return {
    buffer,
    filename,
    subtotal: invSubtotal,
    tax: invTax,
    grandTotal: invTotal,
  }
}
