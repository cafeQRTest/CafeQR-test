import PDFDocument from 'pdfkit';

export async function generateBillPdf(invoice, items, totals, restaurant = {}) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    autoFirstPage: true
  });

  const PRIMARY_COLOR = '#111827';
  const ACCENT_COLOR  = '#2563EB';
  const BORDER_COLOR  = '#E5E7EB';
  const TEXT_GRAY     = '#6B7280';
  const LIGHT_BG      = '#F9FAFB';

  const PAGE_WIDTH = doc.page.width;
  const PAGE_HEIGHT = doc.page.height;
  const MARGIN = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

  // 1. Accent Strip (Removed on user request)
  // doc.rect(0, 0, PAGE_WIDTH, 6).fill(ACCENT_COLOR);

  // 2. Global Border
  doc.rect(20, 20, PAGE_WIDTH - 40, PAGE_HEIGHT - 40)
     .lineWidth(0.5)
     .strokeColor(BORDER_COLOR)
     .stroke();

  let y = 60;

  // 3. Header Section
  doc.fillColor(PRIMARY_COLOR)
     .fontSize(22)
     .font('Helvetica-Bold')
     .text(restaurant.name || 'Restaurant Name', MARGIN, y);
  
  y += 28;
  doc.fontSize(9).font('Helvetica').fillColor(TEXT_GRAY);
  
  if (restaurant.address) {
     doc.text(restaurant.address, MARGIN, y, { width: 250, lineGap: 2 });
     y += doc.heightOfString(restaurant.address, { width: 250, lineGap: 2 }) + 6;
  }
  
  if (restaurant.phone) {
      doc.text(`Phone: ${restaurant.phone}`, MARGIN, y);
      y += 12;
  }
  if (restaurant.gstin) {
      doc.text(`GSTIN: ${restaurant.gstin}`, MARGIN, y);
      y += 12;
  }

  // Right Side: Invoice Meta
  let rightY = 60;
  doc.fontSize(26).font('Helvetica-Bold').fillColor(PRIMARY_COLOR)
     .text('INVOICE', PAGE_WIDTH - MARGIN - 200, rightY, { width: 200, align: 'right' });
  
  rightY += 35;
  
  const drawMeta = (label, value) => {
      doc.fontSize(9).font('Helvetica').fillColor(TEXT_GRAY)
         .text(label, PAGE_WIDTH - MARGIN - 200, rightY, { width: 80, align: 'right' });
      doc.font('Helvetica-Bold').fillColor(PRIMARY_COLOR)
         .text(value, PAGE_WIDTH - MARGIN - 110, rightY, { width: 110, align: 'right' });
      rightY += 14;
  };

  drawMeta('Invoice No:', invoice.invoice_no);
  drawMeta('Date:', invoice.invoice_date || new Date().toLocaleDateString());

  // Customer Section (Conditional)
  const cName = (invoice.customer_name || '').trim();
  const ignore = ['guest', 'walk-in', 'walk in', ''];
  const showCustomer = !ignore.includes(cName.toLowerCase());

  if (showCustomer) {
      rightY += 6; 
      drawMeta('Customer:', cName);
      if (invoice.customer_phone) {
          drawMeta('Phone:', invoice.customer_phone);
      }
  }

  y = Math.max(y, rightY) + 30;

  // Separator
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(0.5).strokeColor(BORDER_COLOR).stroke();
  y += 20;

  // 4. Items Table
  // Feature: Hide Discount Column if no discount
  const hasLineDisc = items.some(i => (Number(i.discount_amount) || 0) > 0);
  
  // Columns Layout
  const xItem   = MARGIN + 10;
  const xTotal  = PAGE_WIDTH - MARGIN - 10;
  // Dynamic columns
  const xDisc   = hasLineDisc ? PAGE_WIDTH - MARGIN - 110 : 0;
  const xRate   = hasLineDisc ? PAGE_WIDTH - MARGIN - 180 : PAGE_WIDTH - MARGIN - 120; // Shift Rate right if no disc
  const xQty    = hasLineDisc ? PAGE_WIDTH - MARGIN - 250 : PAGE_WIDTH - MARGIN - 190; // Shift Qty right if no disc
  
  // Header Bg
  doc.rect(MARGIN, y - 6, CONTENT_WIDTH, 24).fill(LIGHT_BG);
  
  const headerY = y + 2;
  doc.fillColor(PRIMARY_COLOR).fontSize(8).font('Helvetica-Bold');
  
  doc.text('ITEM DESCRIPTION', xItem, headerY);
  doc.text('QTY', xQty, headerY, { width: 40, align: 'center' });
  doc.text('RATE', xRate, headerY, { width: 60, align: 'right' });
  
  if (hasLineDisc) {
      doc.text('DISC', xDisc, headerY, { width: 60, align: 'right' });
  }
  
  doc.text('AMOUNT', xTotal - 80, headerY, { width: 80, align: 'right' });

  y += 30;

  // Items List
  doc.font('Helvetica').fontSize(9).fillColor(PRIMARY_COLOR);

  items.forEach((item) => {
    const name = item.item_name || item.name;
    const rate = Number(item.unit_price || item.price || 0);
    const qty = Number(item.quantity || 1);
    const discAmt = Number(item.discount_amount || 0);
    const lineNet = Number(item.line_net || 0);

    // Calc Height
    // Item width expands if no disc column
    const nameWidth = xQty - xItem - 10;
    const textHeight = doc.heightOfString(name, { width: nameWidth });
    
    // Check page break (Footer needs ~160px)
    if (y + textHeight > PAGE_HEIGHT - MARGIN - 160) {
        doc.addPage();
        y = MARGIN + 20;
    }

    doc.text(name, xItem, y, { width: nameWidth });
    doc.text(String(qty), xQty, y, { width: 40, align: 'center' });
    doc.text(rate.toFixed(2), xRate, y, { width: 60, align: 'right' });
    
    if (hasLineDisc) {
         doc.text(discAmt > 0 ? discAmt.toFixed(2) : '-', xDisc, y, { width: 60, align: 'right' });
    }
    
    doc.font('Helvetica-Bold')
       .text(lineNet.toFixed(2), xTotal - 80, y, { width: 80, align: 'right' });
    doc.font('Helvetica');

    y += textHeight + 10;
  });

  // 5. Bottom Section (Totals)
  const bottomHeight = 160;
  const bottomY = PAGE_HEIGHT - MARGIN - bottomHeight;
  
  // Force totals to bottom if possible, else new page
  if (y > bottomY) {
     doc.addPage();
  }
  
  let footerY = bottomY;

  // Divider
  doc.moveTo(MARGIN, footerY).lineTo(PAGE_WIDTH - MARGIN, footerY)
     .strokeColor(BORDER_COLOR).lineWidth(1).stroke();
  footerY += 20;

  const labelX = PAGE_WIDTH - MARGIN - 220;
  const valX   = PAGE_WIDTH - MARGIN - 100;
  const valW   = 100;

  const drawRow = (label, val, isBold=false, color=PRIMARY_COLOR, labelColor=TEXT_GRAY) => {
      doc.fontSize(9).font('Helvetica').fillColor(labelColor)
         .text(label, labelX, footerY, { width: 120, align: 'left' });
      doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fillColor(color)
         .text(val, valX, footerY, { width: valW, align: 'right' });
      footerY += 16;
  };

  drawRow('Subtotal', `₹${Number(totals.line_subtotal||0).toFixed(2)}`, true);

  if (Number(totals.order_discount_total) > 0) {
      drawRow('Order Discount', `- ₹${Number(totals.order_discount_total).toFixed(2)}`, false, '#DC2626');
  }

  if (Number(totals.total_tax) > 0) {
      drawRow(`GST (${totals.gst_rate}%)`, `+ ₹${Number(totals.total_tax).toFixed(2)}`);
  }

  if (Number(totals.round_off_amount) !== 0) {
     const ro = Number(totals.round_off_amount);
     const sign = ro > 0 ? '+ ' : '- ';
     const absVal = Math.abs(ro).toFixed(2);
     drawRow('Round Off', `${sign}₹${absVal}`, false, '#DC2626');
  }

  // Grand Total Pill
  footerY += 10;
  // Pill background
  doc.roundedRect(labelX - 10, footerY - 10, 240, 36, 4).fill(LIGHT_BG);
  
  // Vertically center text in pill
  // Box Top: footerY - 10. Height: 36. Mid: footerY - 10 + 18 = footerY + 8.
  // Text (approx 12pt) baseline needs adjustment.
  // Let's print text at footerY + 2.
  
  doc.fillColor(PRIMARY_COLOR).fontSize(12).font('Helvetica-Bold')
     .text('Total Payable', labelX, footerY + 2);
  
  doc.fontSize(14).text(`₹${Number(totals.total_amount || 0).toFixed(2)}`, valX, footerY, { width: valW, align: 'right' });

  // Thank you footer
  // Place immediately below totals with padding
  footerY += 40;
  doc.fontSize(9).font('Helvetica').fillColor(TEXT_GRAY)
     .text('Thank you for your business!', MARGIN, footerY, { width: CONTENT_WIDTH, align: 'center' });

  // Convert to buffer
  const chunks = [];
  return new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      resolve({
        buffer: Buffer.concat(chunks),
        filename: `${invoice.invoice_no}.pdf`,
      });
    });
    doc.on('error', reject);
    doc.end();
  });
}
