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
  drawMeta('Date:', invoice.invoice_date || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));

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
  // 4. Items Table
  // Feature: Hide Discount Column if no discount
  const hasLineDisc = items.some(i => (Number(i.discount_amount) || 0) > 0);
  
  // Columns Layout
  const xRight = PAGE_WIDTH - MARGIN;
  const wTotal = 70;
  const wTax   = 50;
  const wDisc  = 50;
  const wRate  = 60;
  const wQty   = 40;
  
  const xTotal = xRight - wTotal;
  const xTax   = xTotal - wTax;
  const xDisc  = hasLineDisc ? (xTax - wDisc) : xTax; // If no disc, next col starts at xTax
  const xRate  = xDisc  - wRate;
  const xQty   = xRate  - wQty;
  const xItem  = MARGIN + 10;
  
  // Header Bg
  doc.rect(MARGIN, y - 6, CONTENT_WIDTH, 24).fill(LIGHT_BG);
  
  const headerY = y + 2;
  doc.fillColor(PRIMARY_COLOR).fontSize(8).font('Helvetica-Bold');
  
  doc.text('ITEM DESCRIPTION', xItem, headerY);
  doc.text('QTY', xQty, headerY, { width: wQty, align: 'center' });
  doc.text('RATE', xRate, headerY, { width: wRate, align: 'right' });
  
  if (hasLineDisc) {
      doc.text('DISC', xDisc, headerY, { width: wDisc, align: 'right' });
  }
  
  doc.text('GST', xTax, headerY, { width: wTax, align: 'right' });
  doc.text('TOTAL', xTotal, headerY, { width: wTotal, align: 'right' });

  y += 30;

  // Items List
  doc.font('Helvetica').fontSize(9).fillColor(PRIMARY_COLOR);

  items.forEach((item) => {
    const name = item.item_name || item.name;
    const rate = Number(item.unit_price || item.price || 0);
    const qty = Number(item.quantity || 1);
    const discAmt = Number(item.discount_amount || 0);
    // Use the inclusive total if available, else net
    const lineTotal = Number(item.line_total || item.line_net || 0);
    const taxAmt = Number(item.tax_amount || 0);

    // Calc Height
    const nameWidth = xQty - xItem - 10;
    const textHeight = doc.heightOfString(name, { width: nameWidth });
    
    // Check page break (Footer needs ~160px)
    if (y + textHeight > PAGE_HEIGHT - MARGIN - 160) {
        doc.addPage();
        y = MARGIN + 20;
    }

    doc.text(name, xItem, y, { width: nameWidth });
    doc.text(String(qty), xQty, y, { width: wQty, align: 'center' });
    doc.text(rate.toFixed(2), xRate, y, { width: wRate, align: 'right' });
    
    if (hasLineDisc) {
         doc.text(discAmt > 0 ? discAmt.toFixed(2) : '-', xDisc, y, { width: wDisc, align: 'right' });
    }
    
    doc.text(taxAmt > 0 ? taxAmt.toFixed(2) : '-', xTax, y, { width: wTax, align: 'right' });
    
    doc.font('Helvetica-Bold')
       .text(lineTotal.toFixed(2), xTotal, y, { width: wTotal, align: 'right' });
    doc.font('Helvetica');

    y += textHeight + 10;
  });

  // 5. Bottom Section (Totals)
  const bottomHeight = 220; // Increased to accommodate GST breakdown and footer text
  const bottomY = PAGE_HEIGHT - MARGIN - bottomHeight;
  
  // Force totals to bottom or new page
  // The logic is: If current Y is past the "start zone" of the footer, make a new page.
  // And standard "Footer Start" is bottomY.
  
  if (y > bottomY) {
     doc.addPage();
     // If we added a page, we should reset y, but footer draws relative to bottomY anyway?
     // No, footerY is initialized to bottomY below. 
     // BUT if variables like bottomY allow footer to start higher on a blank page, that's better?
     // For consistency, let's Stick to "Anchored at Bottom" style.
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

  // Standard GST Invoice Totals Structure
  // 1. Taxable Value (Explicit)
  // 2. Add: CGST
  // 3. Add: SGST
  // 4. Round Off
  // 5. Total
  
  const hasOrderDisc = Number(totals.order_discount_base || 0) > 0.01;

  if (hasOrderDisc) {
      // Walk: Gross Taxable -> Less: Discount -> Net Taxable
      drawRow('Gross Taxable', `₹${Number(totals.line_subtotal).toFixed(2)}`, false, TEXT_GRAY);
      drawRow('Less: Discount', `- ₹${Number(totals.order_discount_base).toFixed(2)}`, false, TEXT_GRAY);
      
      // Separator line for clarity
      doc.moveTo(labelX, footerY - 4).lineTo(PAGE_WIDTH - MARGIN, footerY - 4)
         .lineWidth(0.5).strokeColor('#E5E7EB').stroke();
  }

  // The Main Anchor: Taxable Value
  drawRow('Taxable Value', `₹${Number(totals.taxable_amount).toFixed(2)}`, true);

  // Taxes - Split Logic
  const hasSplitTax = (totals.total_tax_added > 0 || totals.total_tax_included > 0);

  if (hasSplitTax) {
      if (totals.total_tax_included > 0) {
          const halfInc = totals.total_tax_included / 2;
          const halfRate = (totals.packaged_tax_rate || totals.gst_rate || 5) / 2;
          drawRow(`CGST (Incl.) @ ${halfRate}%`, `₹${halfInc.toFixed(2)}`);
          drawRow(`SGST (Incl.) @ ${halfRate}%`, `₹${halfInc.toFixed(2)}`);
      }
      if (totals.total_tax_added > 0) {
          const halfAdd = totals.total_tax_added / 2;
          const halfRate = (totals.normal_tax_rate || totals.gst_rate || 5) / 2;
          drawRow(`CGST @ ${halfRate}%`, `+ ₹${halfAdd.toFixed(2)}`);
          drawRow(`SGST @ ${halfRate}%`, `+ ₹${halfAdd.toFixed(2)}`);
      }
  } else if (Number(totals.total_tax) > 0) {
      // Legacy / Simple Display - Fallback
      const halfTax = totals.total_tax / 2;
      const halfRate = (totals.gst_rate || 5) / 2;
      drawRow(`CGST @ ${halfRate}%`, `+ ₹${halfTax.toFixed(2)}`);
      drawRow(`SGST @ ${halfRate}%`, `+ ₹${halfTax.toFixed(2)}`);
  }

  // Round Off
  if (Number(totals.round_off_amount) !== 0) {
     const ro = Number(totals.round_off_amount);
     const sign = ro > 0 ? '+ ' : '- ';
     const absVal = Math.abs(ro).toFixed(2);
     const color = ro > 0 ? '#10B981' : '#DC2626'; 
     drawRow('Round Off', `${sign}₹${absVal}`, false, color);
  }



  // Grand Total Pill
  footerY += 16; // Bit more breathing room before the big total
  
  // Pill background
  const pillHeight = 40;
  const pillY = footerY - 12;
  
  // Draw Pill
  doc.roundedRect(labelX - 10, pillY, 240, pillHeight, 6).fill('#F3F4F6'); // Slightly darker gray for better contrast
  
  // Text Vertically Centered relative to Pill
  // Pill Top: pillY. Height: 40. Mid: pillY + 20.
  // Font Size 12 ~ 12pt height. Baseline shift ~ -4pt.
  const textY = pillY + 13;
  
  doc.fillColor(PRIMARY_COLOR).fontSize(12).font('Helvetica-Bold')
     .text('Total Payable', labelX, textY);
  
  doc.fontSize(16).text(`₹${Number(totals.total_amount || 0).toFixed(2)}`, valX, textY - 2, { width: valW, align: 'right' });

  // Update footerY to be below the pill
  footerY = pillY + pillHeight;

  // Thank you footer
  // Place immediately below totals with padding
  footerY += 20;
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
