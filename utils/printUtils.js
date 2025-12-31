//utils/printUtils

function toDisplayItems(order) {
  if (Array.isArray(order.items) && order.items.length) return order.items;
  if (Array.isArray(order.order_items) && order.order_items.length) {
    return order.order_items.map(oi => ({
      name: oi.menu_items?.name || oi.item_name || 'Item',
      quantity: oi.quantity,
      price: oi.price,
      discount_amount: oi.discount_amount || 0, // Include item discount
      uom: oi.uom_short_code || '',
      uom_short_code: oi.uom_short_code || '',
      uom_precision: oi.uom_precision ?? 0
    }));
  }
  return [];
}

function getOrderTypeLabel(order) {
  if (!order) return '';
  if (order.table_number && order.table_number !== null) {
    return `Table ${order.table_number}`;
  }
  if (order.order_type === 'parcel') return 'Parcel';
  return '';
}

// Helper: Wrap text for 32 chars width
function wrapText(text, width) {
  if (!text) return [];
  const lines = [];
  let currentLine = '';
  
  text.split(' ').forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= width) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      // If single word is too long, truncate it
      currentLine = word.length > width ? word.substring(0, width) : word;
    }
  });
  
  if (currentLine) lines.push(currentLine);
  return lines;
}


// Helper: Right-align text
function rightAlign(str, width) {
  if (str.length > width) str = str.substring(0, width);
  const padding = Math.max(0, width - str.length);
  return ' '.repeat(padding) + str;
}

// Helper: Center text
function center(str, width) {
  if (str.length > width) str = str.substring(0, width);
  const padding = Math.max(0, Math.floor((width - str.length) / 2));
  return ' '.repeat(padding) + str;
}

// utils/printUtils.js

// Build ESC/POS bit image commands from print_logo_* fields
// utils/printUtils.js

// Build ESC/POS raster bit image (GS v 0) from print_logo_* fields
function buildLogoEscPos(restaurantProfile) {
  const bits = restaurantProfile?.print_logo_bitmap;
  const cols = Number(restaurantProfile?.print_logo_cols || 0);
  const rows = Number(restaurantProfile?.print_logo_rows || 0);

  // bits is row‑major: length must be cols * rows
  if (!bits || !cols || !rows || bits.length !== cols * rows) return '';

  const bytesPerRow = Math.ceil(cols / 8);
  const GS  = '\x1d';
  const ESC = '\x1b';

  let out = '';

  // Center alignment ON (ESC a 1)
  out += ESC + 'a' + '\x01';

  // GS v 0 m xL xH yL yH   (m = 0 → normal scale)
  const m  = 0;
  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = rows & 0xff;
  const yH = (rows >> 8) & 0xff;

  out += GS + 'v' + '0' + String.fromCharCode(m, xL, xH, yL, yH);

  // d1..dk = raster data: left→right, top→bottom, 8 horizontal dots per byte
  for (let y = 0; y < rows; y++) {
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < cols && bits[y * cols + x] === '1') {
          byte |= 0x80 >> bit;  // MSB = leftmost pixel
        }
      }
      out += String.fromCharCode(byte);
    }
  }

  // One line feed after image
  out += '\r\n';

  // Reset alignment to left (ESC a 0)
  out += ESC + 'a' + '\x00';

  return out;
}

// utils/printUtils.js (below center()/wrapText helpers)

function renderLogoFromBitmap(restaurantProfile, width) {
  const bits = restaurantProfile?.print_logo_bitmap;
  const cols = Number(restaurantProfile?.print_logo_cols || 0);
  const rows = Number(restaurantProfile?.print_logo_rows || 0);

  if (!bits || !cols || !rows || bits.length !== cols * rows) return [];

  const DARK = '#';   // ASCII only
  const LIGHT = ' ';  // space

  const lines = [];
  const cellWidth = Math.max(1, Math.floor(width / cols));

  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const bit = bits[y * cols + x] === '1';
      line += (bit ? DARK : LIGHT).repeat(cellWidth);
    }
    lines.push(center(line, width));
  }
  return lines;
}


// Helper: Build item row with word-wrapped name
function buildItemRow(item, width) {
  // Format: NAME (wrapped to 14 chars) | QTY | RATE | TOTAL
  
  const name = (item.name || '').substring(0, 14).padEnd(14);
  
  // Format quantity with UOM
  const qtyNum = Number(item.quantity || 0);
  const p = Number.isInteger(item.uom_precision) ? item.uom_precision : (qtyNum % 1 === 0 ? 0 : 2);
  let qtyStr = qtyNum.toFixed(p);
  if (p > 0 && qtyStr.includes('.')) {
    // Optional: remove trailing zeros if you want 1.5 instead of 1.500 even if precision is 3
    // But usually precision implies consistency. Let's keep it consistent with the UI.
  }
  
  // Append UOM if present. 
  // We check uom_short_code (from order_items snapshot) or fallback to uom name
  const uom = item.uom_short_code || item.uom || '';
  if (uom && uom.toLowerCase() !== 'pc') {
     qtyStr += ' ' + uom;
  }
  
  // Pad to 6 chars to fit "1.25kg"
  const qty = qtyStr.padStart(6).substring(0, 6); 

  const rateNum = Number(item.price || 0);
  const rate = rateNum % 1 === 0 
    ? rateNum.toFixed(0).padStart(4)
    : rateNum.toFixed(2).padStart(4);
  
  const totalNum = rateNum * qtyNum;
  const total = totalNum % 1 === 0
    ? totalNum.toFixed(0).padStart(5)
    : totalNum.toFixed(2).padStart(5);
  
  return `${name}${qty} ${rate} ${total}`;
}

function getReceiptWidth(restaurantProfile) {
  // 1) per-device override from localStorage
  let fromLocal = 0;
  if (typeof window !== 'undefined') {
    const raw = window.localStorage.getItem('PRINT_WIDTH_COLS') || '';
    fromLocal = Number(raw) || 0;
  }

  // 2) (optional later) per-restaurant profile column, if you add one
  const fromProfile = Number(restaurantProfile?.receipt_cols || 0) || 0;

  const cols = fromLocal || fromProfile || 32; // default 32 for 2"
  return Math.max(20, Math.min(64, cols));     // clamp to a sane range
}

export function buildKotText(order, restaurantProfile) {
  try {
    const items = toDisplayItems(order);
     const removedItems = Array.isArray(order.removed_items)
      ? order.removed_items.filter(ri => Number(ri.quantity) > 0)
      : [];
    const restaurantName = String(
      restaurantProfile?.restaurant_name ||
      order?.restaurant_name ||
      'RESTAURANT'
    ).toUpperCase();

    const addressParts = [
      restaurantProfile?.shipping_address_line1,
      restaurantProfile?.shipping_address_line2,
      restaurantProfile?.shipping_city,
      restaurantProfile?.shipping_state,
      restaurantProfile?.shipping_pincode
    ].filter(Boolean);
    const address = addressParts.length
      ? addressParts.join(', ')
      : (order?.restaurant_address || '');

    const phone =
      restaurantProfile?.shipping_phone ||
      restaurantProfile?.phone ||
      order?.restaurant_phone ||
      '';

    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || 'N/A';
    const tableLabel = getOrderTypeLabel(order);

    const orderDate = new Date( order.created_at);
    const dateStr = orderDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeStr = orderDate.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const W = getReceiptWidth(restaurantProfile);
    const dashes = () => '-'.repeat(W);
    const lines = [];

    // === HEADER ===
    lines.push(center(restaurantName, W));
    wrapText(address, W).forEach(l => lines.push(center(l, W)));
    if (phone) lines.push(center(`Contact No.: ${phone}`, W));
    lines.push(dashes());

    // === META: clearly mark as KOT ===
    lines.push(center('*** KITCHEN ORDER TICKET ***', W));
    lines.push(`${dateStr} ${timeStr}`);
    lines.push(`Order: #${orderId}`);
    if (tableLabel) lines.push(`For: ${tableLabel}`);
    if (order.number_of_customers) {
      lines.push(`No. of Customers: ${order.number_of_customers}`);
    }
    lines.push(dashes());

    // === ITEMS: name + qty only ===
      if (items.length) {
    lines.push('ITEM                     QTY');  // simple KOT header
    items.forEach(item => {
      const nameLines = wrapText(item.name || 'Item', W - 7); // Reserve 6 chars for qty + 1 space
      if (!nameLines.length) return;
      
      const qtyNum = Number(item.quantity || 1);
      const p = Number.isInteger(item.uom_precision) ? item.uom_precision : (qtyNum % 1 === 0 ? 0 : 2);
      let qtyStr = qtyNum.toFixed(p);
      
      // KOT: Do NOT show UOM (kitchen doesn't need it)
      const qty = qtyStr.padStart(6).substring(0,6);

      // first line: name + qty at end
      lines.push(nameLines[0].padEnd(W - 7) + ' ' + qty);

      // extra lines: just the continued name
      for (let i = 1; i < nameLines.length; i++) {
        lines.push(nameLines[i]);
      }
    });
  }
     if (removedItems.length) {
      lines.push(dashes());
      lines.push(center('*** REMOVED ITEMS ***', W));
      lines.push('ITEM                     QTY');

      removedItems.forEach(ri => {
        const nameLines = wrapText(ri.name || 'Item', W - 7);
        if (!nameLines.length) return;
        
        const qtyNum = Number(ri.quantity || 1);
        const p = Number.isInteger(ri.uom_precision) ? ri.uom_precision : (qtyNum % 1 === 0 ? 0 : 2);
        let qtyStr = qtyNum.toFixed(p);
        
        // KOT: Do NOT show UOM (kitchen doesn't need it)
        const qty = qtyStr.padStart(6).substring(0,6);

        // prefix with "-" 
        const firstName = ('- ' + nameLines[0]).substring(0, W - 7);
        lines.push(firstName.padEnd(W - 7) + ' ' + qty);

        for (let i = 1; i < nameLines.length; i++) {
          const cont = ('  ' + nameLines[i]).substring(0, W); // Indent continuation lines
          lines.push(cont);
        }
      });
    }

    lines.push(dashes());
    lines.push(center('*** SEND TO KITCHEN ***', W));
    lines.push('');

    return lines.join('\n');
  } catch (e) {
    console.error(e);
    return 'PRINT ERROR';
  }
}

export async function downloadTextAndShare(order, bill, restaurantProfile) {
  try {
    const items = toDisplayItems(order);
    
    // Get restaurant details - ALWAYS use display name
    const restaurantName = (order?.restaurant_name || 'RESTAURANT').toUpperCase();
    
    // Build address - wrapped for 32 chars
    const addressParts = [
      restaurantProfile?.shipping_address_line1,    // ✅ Exists in schema
  restaurantProfile?.shipping_city,              // ✅ Exists in schema
  restaurantProfile?.shipping_state,             // ✅ Exists in schema
  restaurantProfile?.shipping_pincode  
    ].filter(Boolean);
    const address = addressParts.length > 0 
      ? addressParts.join(', ') 
      : (order?.restaurant_address || '');
    
    const phone = restaurantProfile?.phone || order?.restaurant_phone || '';
    
    // Bill details
    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || 'N/A';
    const orderType = getOrderTypeLabel(order);
    const invoiceNo = order?.invoice_no || bill?.invoice_no || '';
    const billNo = order?.bill_no || bill?.bill_no || '';
    
    // Date & Time
    const orderDate = new Date(order.created_at);
    const dateStr = orderDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeStr = orderDate.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Amounts
    // IMPORTANT: total_amount already has discount_amount subtracted (calculated by API)
    // total_inc_tax is the amount BEFORE discount
    // We should prioritize total_amount as it's the final payable amount
    const grandTotal = Number(
      order?.total_amount ||          // ← Primary: Final amount after discount (5.26)
      bill?.grand_total || 
      bill?.total_amount ||
      order?.total ||                 // Legacy fallback
      0
    );
    
    // If grandTotal is 0 or missing, fall back to calculated amount
    const calculatedTotal = Number(
      bill?.total_inc_tax || 
      order?.total_inc_tax || 
      0
    );
    
    // Use calculated total only if grandTotal is not available
    const effectiveGrandTotal = grandTotal > 0 ? grandTotal : calculatedTotal;
    
    const netAmount = Number(
      bill?.subtotal || 
      bill?.subtotal_ex_tax ||
      order?.subtotal || 
      order?.subtotal_ex_tax ||
      0
    );
    const taxAmount = Number(
      bill?.tax_total || 
      bill?.total_tax || 
      order?.tax_amount || 
      order?.total_tax || 
      0
    );

    // Discount
    const orderDiscount = Number(order?.discount_amount || bill?.discount_amount || 0);

    const W = getReceiptWidth(restaurantProfile);
    const dashes = () => '-'.repeat(W);

    // Build lines
    const lines = [];
    
    // === HEADER (CENTER ALIGNED) ===
    lines.push(center(restaurantName, W));
    
    // Address (wrapped & centered)
    wrapText(address, W).forEach(line => {
      lines.push(center(line, W));
    });
    
    if (phone) lines.push(center(`Contact No.: ${phone}`, W));
    
    // Add FSSAI if available
    if (restaurantProfile?.fssai_license) {
      lines.push(center(`FSSAI: ${restaurantProfile.fssai_license}`, W));
    }
    
    // Add GSTIN if GST is enabled and GSTIN exists
    if (restaurantProfile?.gst_enabled && restaurantProfile?.gstin) {
      lines.push(center(`GSTIN: ${restaurantProfile.gstin}`, W));
    }
    
    lines.push('');
    lines.push(dashes());
    lines.push('');
    
    // === DATE & TIME (RIGHT ALIGNED) ===
    lines.push(`${dateStr} ${timeStr}`);
        lines.push(`Invoice: ${invoiceNo}`);
    if (billNo) lines.push(`Bill No: ${billNo}`);
    // lines.push(`Order: #${orderId}`);
    if (orderType) lines.push(`Order Type: ${orderType}`);
    if (order?.number_of_customers) {
      lines.push(`No. of Customers: ${order.number_of_customers}`);
    }
    
    lines.push(dashes());
    lines.push('');
    
    // Check if any item has a discount
    const hasItemDiscounts = items.some(it => Number(it.discount_amount || 0) > 0);
    
    // === ITEMS HEADER ===
    if (hasItemDiscounts) {
      lines.push('ITEM       QTY RATE DISC TOTAL');
    } else {
      lines.push('ITEM         QTY  RATE  TOTAL');
    }
    
    // === ITEMS (with word-wrapping for names) ===
    items.forEach(item => {
      const itemName = item.name || 'Item';
      const nameWidth = hasItemDiscounts ? 10 : 14;
      const nameLines = wrapText(itemName, nameWidth);
      
      if (nameLines.length === 0) return;
      
      // First line with quantities/rates/totals
      const rateNum = Number(item.price || 0);
      const qtyNum = Number(item.quantity || 1);
      const itemDisc = Number(item.discount_amount || 0);
      const totalNum = (rateNum * qtyNum) - itemDisc;
      
      const rate = rateNum % 1 === 0 
        ? rateNum.toFixed(0).padStart(4)
        : rateNum.toFixed(2).padStart(4);
      
      const total = totalNum % 1 === 0
        ? totalNum.toFixed(0).padStart(5)
        : totalNum.toFixed(2).padStart(5);
      
      // Helper to format quantity
      const p = Number.isInteger(item.uom_precision) ? item.uom_precision : (qtyNum % 1 === 0 ? 0 : 2);
      let qtyStr = qtyNum.toFixed(p);
      const uom = item.uom_short_code || item.uom || '';
      if (uom && uom.toLowerCase() !== 'pc') {
          qtyStr += ' ' + uom;
      }
      
      if (hasItemDiscounts) {
        // Compact layout with DISC column: ITEM(10) QTY(4) RATE(4) DISC(4) TOTAL(5)
        const qty = qtyStr.padStart(4).substring(0, 4);
        const disc = itemDisc > 0 
          ? ('-' + itemDisc.toFixed(0)).padStart(4).substring(0, 4)
          : '   -'.padStart(4);
        const firstLine = nameLines[0].padEnd(10) + ' ' + qty + ' ' + rate + ' ' + disc + ' ' + total;
        lines.push(firstLine);
        
        for (let i = 1; i < nameLines.length; i++) {
          lines.push(nameLines[i].padEnd(10));
        }
      } else {
        // Original layout without DISC column
        const qty = qtyStr.padStart(6).substring(0, 6);
        const firstLine = nameLines[0].padEnd(14) + qty + ' ' + rate + ' ' + total;
        lines.push(firstLine);
        
        for (let i = 1; i < nameLines.length; i++) {
          lines.push(nameLines[i].padEnd(14));
        }
      }
    });
    
    lines.push('');
    lines.push(dashes());
    lines.push('');
    
    // === TOTALS (LEFT ALIGNED) ===
    // Calculate the final grand total (after all discounts)
    // Priority 1: Use total_amount (which already has discount subtracted)
    // Priority 2: Calculate from total_inc_tax - discount_amount
    let finalGrandTotal;
    
    if (order?.total_amount && order.total_amount > 0) {
      // Use the pre-calculated final amount (already has discount applied)
      finalGrandTotal = Number(order.total_amount);
    } else if (bill?.total_amount && bill.total_amount > 0) {
      finalGrandTotal = Number(bill.total_amount);
    } else {
      // Fallback: Calculate manually
      const baseTotal = effectiveGrandTotal || grandTotal;
      finalGrandTotal = baseTotal - orderDiscount;
    }
    
    if (taxAmount > 0) {
      // Work backward to show breakdown
      const grossTotal = finalGrandTotal + orderDiscount; // Add back discount to get gross
      const netAmt = grossTotal - taxAmount;
      
      lines.push(`Net Amt: ${netAmt.toFixed(2)}`);
      lines.push(`Tax: ${taxAmount.toFixed(2)}`);
      if (orderDiscount > 0) {
         lines.push(`Discount: -${orderDiscount.toFixed(2)}`);
      }
      lines.push(`Grand Total: ${finalGrandTotal.toFixed(2)}`);
    } else {
      if (orderDiscount > 0) {
         const beforeDiscount = finalGrandTotal + orderDiscount;
         lines.push(`Subtotal: ${beforeDiscount.toFixed(2)}`);
         lines.push(`Discount: -${orderDiscount.toFixed(2)}`);
      }
      lines.push(`Total: ${finalGrandTotal.toFixed(2)}`);
    }
    
    lines.push(dashes());
    lines.push('');
    
    // === FOOTER (CENTER ALIGNED) ===
    lines.push(center('** THANK YOU! VISIT AGAIN !! **', W));
    lines.push('');

    const text = lines.join('\n');

    // Share via Web Share API
    if (navigator.canShare && navigator.canShare({ text })) {
      await navigator.share({
        title: `BILL-${orderId}`,
        text: text
      });
      return { success: true, method: 'share' };
    }

    // Fallback to download
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BILL-${orderId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, method: 'download' };
  } catch (error) {
    console.error(error);
    return { success: false, error: error.message };
  }
}



// utils/printUtils.js

export function buildReceiptText(order, bill, restaurantProfile) {
  try {
    const items = toDisplayItems(order);

    const restaurantName = String(
      restaurantProfile?.restaurant_name ||
      order?.restaurant_name ||
      'RESTAURANT'
    ).toUpperCase();

    const addressParts = [
      restaurantProfile?.shipping_address_line1,
      restaurantProfile?.shipping_address_line2,
      restaurantProfile?.shipping_city,
      restaurantProfile?.shipping_state,
      restaurantProfile?.shipping_pincode,
    ].filter(Boolean);
    const address = addressParts.length
      ? addressParts.join(', ')
      : (order?.restaurant_address || '');

    const phone =
      restaurantProfile?.shipping_phone ||
      restaurantProfile?.phone ||
      order?.restaurant_phone ||
      '';

    const orderType = getOrderTypeLabel(order);
    const invoiceNo = order?.invoice_no || bill?.invoice_no || '';
    const billNo = order?.bill_no || bill?.bill_no || '';

    const orderDate = new Date(order.created_at);
    const dateStr = orderDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const timeStr = orderDate.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const grandTotal = Number(
      order?.total_amount ||  // Primary: has discount already subtracted
      bill?.grand_total ||
      bill?.total_amount ||
      order?.total ||
      0
    );
    
    const calculatedTotal = Number(
      bill?.total_inc_tax ||
      order?.total_inc_tax ||
      0
    );
    
    const effectiveGrandTotal = grandTotal > 0 ? grandTotal : calculatedTotal;
    
    const taxAmount = Number(
      bill?.tax_total ||
      bill?.total_tax ||
      order?.tax_amount ||
      order?.total_tax ||
      0
    );
    
    // Discount
    const orderDiscount = Number(order?.discount_amount || bill?.discount_amount || 0);

    const W = getReceiptWidth(restaurantProfile);
    const dashes = () => '-'.repeat(W);
    const lines = [];

    // HEADER
    lines.push(center(restaurantName, W));
    wrapText(address, W).forEach((l) => lines.push(center(l, W)));
    if (phone) lines.push(center(`Contact No.: ${phone}`, W));
    
    // Add FSSAI if available
    if (restaurantProfile?.fssai_license) {
      lines.push(center(`FSSAI: ${restaurantProfile.fssai_license}`, W));
    }
    
    // Add GSTIN if GST is enabled and GSTIN exists
    if (restaurantProfile?.gst_enabled && restaurantProfile?.gstin) {
      lines.push(center(`GSTIN: ${restaurantProfile.gstin}`, W));
    }
    
    lines.push(dashes());

    // META
    lines.push(`${dateStr} ${timeStr}`);
    if (invoiceNo) {
      lines.push(`Invoice: ${invoiceNo}`);
    }
    if (billNo) {
      lines.push(`Bill No: ${billNo}`);
    }
    if (orderType) lines.push(`Order Type: ${orderType}`);
    if (order?.number_of_customers) {
      lines.push(`No. of Customers: ${order.number_of_customers}`);
    }
    lines.push(dashes());

    // Check for item discounts
    const hasItemDiscounts = items.some(it => Number(it.discount_amount || 0) > 0);
    
    // ITEMS
    if (hasItemDiscounts) {
      lines.push('ITEM       QTY RATE DISC TOTAL');
    } else {
      lines.push('ITEM         QTY  RATE  TOTAL');
    }
    lines.push(dashes());

    items.forEach((item) => {
      const itemName = item.name || 'Item';
      const nameWidth = hasItemDiscounts ? 10 : 14;
      const nameLines = wrapText(itemName, nameWidth);
      if (!nameLines.length) return;

      const rateNum = Number(item.price || 0);
      const qtyNum = Number(item.quantity || 1);
      const itemDisc = Number(item.discount_amount || 0);
      const totalNum = (rateNum * qtyNum) - itemDisc;

      const rate =
        rateNum % 1 === 0
          ? rateNum.toFixed(0).padStart(4)
          : rateNum.toFixed(2).padStart(4);

      const total =
        totalNum % 1 === 0
          ? totalNum.toFixed(0).padStart(5)
          : totalNum.toFixed(2).padStart(5);

      const p = Number.isInteger(item.uom_precision) ? item.uom_precision : (qtyNum % 1 === 0 ? 0 : 2);
      let qtyStr = qtyNum.toFixed(p);
      const uom = item.uom_short_code || item.uom || '';
      if (uom && uom.toLowerCase() !== 'pc') {
          qtyStr += ' ' + uom;
      }
      
      if (hasItemDiscounts) {
        // Compact layout with DISC column
        const qty = qtyStr.padStart(4).substring(0, 4);
        const disc = itemDisc > 0 
          ? ('-' + itemDisc.toFixed(0)).padStart(4).substring(0, 4)
          : '   -'.padStart(4);
        const firstLine = nameLines[0].padEnd(10) + ' ' + qty + ' ' + rate + ' ' + disc + ' ' + total;
        lines.push(firstLine);

        for (let i = 1; i < nameLines.length; i++) {
          lines.push(nameLines[i].padEnd(10));
        }
      } else {
        // Original layout
        const qty = qtyStr.padStart(6).substring(0, 6);
        const firstLine = nameLines[0].padEnd(14) + qty + ' ' + rate + ' ' + total;
        lines.push(firstLine);

        for (let i = 1; i < nameLines.length; i++) {
          lines.push(nameLines[i].padEnd(14));
        }
      }
    });

    lines.push(dashes());

    // TOTALS
    let finalGrandTotal;
    
    if (order?.total_amount && order.total_amount > 0) {
      finalGrandTotal = Number(order.total_amount);
    } else if (bill?.total_amount && bill.total_amount > 0) {
      finalGrandTotal = Number(bill.total_amount);
    } else {
      const baseTotal = effectiveGrandTotal || grandTotal;
      finalGrandTotal = baseTotal - orderDiscount;
    }
    
    if (taxAmount > 0) {
      const grossTotal = finalGrandTotal + orderDiscount;
      const netAmt = grossTotal - taxAmount;
      lines.push(`Net Amt: ${netAmt.toFixed(2)}`);
      lines.push(`Tax: ${taxAmount.toFixed(2)}`);
      if (orderDiscount > 0) {
         lines.push(`Discount: -${orderDiscount.toFixed(2)}`);
      }
      lines.push(`Grand Total: ${finalGrandTotal.toFixed(2)}`);
    } else {
      if (orderDiscount > 0) {
         const beforeDiscount = finalGrandTotal + orderDiscount;
         lines.push(`Subtotal: ${beforeDiscount.toFixed(2)}`);
         lines.push(`Discount: -${orderDiscount.toFixed(2)}`);
      }
      lines.push(`Total: ${finalGrandTotal.toFixed(2)}`);
    }

    lines.push(dashes());
    lines.push(center('** THANK YOU! VISIT AGAIN !! **', W));
    lines.push('');
    lines.push('');
    

    const body = lines.join('\n');

    // ✅ prepend ESC/POS logo bytes if bitmap is configured
    const logoEsc = buildLogoEscPos(restaurantProfile);
    return logoEsc + body;
  } catch (e) {
    console.error(e);
    return 'PRINT ERROR';
  }
}

export async function downloadPdfAndShare(order, bill, restaurantProfile) {
  return downloadTextAndShare(order, bill, restaurantProfile);
}
