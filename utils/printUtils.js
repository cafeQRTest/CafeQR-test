//utils/printUtils

function toDisplayItems(order) {
  if (Array.isArray(order.items) && order.items.length) return order.items;
  if (Array.isArray(order.order_items) && order.order_items.length) {
    return order.order_items.map(oi => ({
      name: oi.menu_items?.name || oi.item_name || 'Item',
      quantity: oi.quantity,
      price: oi.price,
    }));
  }
  return [];
}

function getOrderTypeLabel(order) {
  if (!order) return '';
  if (order.order_type === 'parcel') return 'Parcel';
  if (order.order_type === 'dine-in') return 'Dine-in';
  if (order.order_type === 'counter') {
    if (order.table_number && order.table_number !== null) {
      return `Table ${order.table_number}`;
    }
    return 'Counter';
  }
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
  // For now, first line only - we'll handle multi-line items separately
  
  const name = (item.name || '').substring(0, 14).padEnd(14);
  const qty = `${item.quantity}`.padStart(2);
  
  const rateNum = Number(item.price || 0);
  const rate = rateNum % 1 === 0 
    ? rateNum.toFixed(0).padStart(4)
    : rateNum.toFixed(2).padStart(4);
  
  const totalNum = rateNum * Number(item.quantity || 1);
  const total = totalNum % 1 === 0
    ? totalNum.toFixed(0).padStart(5)
    : totalNum.toFixed(2).padStart(5);
  
  return `${name}${qty}  ${rate}  ${total}`;
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
      console.log('Removed Items:', removedItems);
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
    const orderType = getOrderTypeLabel(order);
    const tableLabel =
      order?.order_type === 'counter' && order?.table_number
        ? `Table ${order.table_number}`
        : orderType;

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
    lines.push(`For: ${tableLabel}`);
    lines.push(dashes());

    // === ITEMS: name + qty only ===
    lines.push('ITEM                     QTY');  // simple KOT header
    items.forEach(item => {
      const nameLines = wrapText(item.name || 'Item', W - 5);
      if (!nameLines.length) return;
      const qty = String(item.quantity ?? 1).padStart(3);

      // first line: name + qty at end
      lines.push(nameLines[0].padEnd(W - 4) + ' ' + qty);

      // extra lines: just the continued name
      for (let i = 1; i < nameLines.length; i++) {
        lines.push(nameLines[i]);
      }
    });
     if (removedItems.length) {
      lines.push(dashes());
      lines.push(center('*** REMOVED ITEMS ***', W));
      lines.push('ITEM                     QTY');

      removedItems.forEach(ri => {
        const nameLines = wrapText(ri.name || 'Item', W - 5);
        if (!nameLines.length) return;
        const qty = String(ri.quantity ?? 1).padStart(3);

        // prefix with "-" so kitchen immediately sees it as cancellation
        const firstName = ('- ' + nameLines[0]).substring(0, W - 5);
        lines.push(firstName.padEnd(W - 4) + ' ' + qty);

        for (let i = 1; i < nameLines.length; i++) {
          const cont = ('  ' + nameLines[i]).substring(0, W);
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
    const grandTotal = Number(
      bill?.grand_total || 
      bill?.total_inc_tax || 
      order?.total_inc_tax || 
      order?.total_amount || 
      order?.total || 
      0
    );
    const netAmount = Number(
      bill?.subtotal || 
      order?.subtotal || 
      order?.total_amount || 
      order?.total || 
      0
    );
    const taxAmount = Number(
      bill?.tax_total || 
      bill?.total_tax || 
      order?.tax_amount || 
      order?.total_tax || 
      0
    );

    // ======= WIDTH = 32 CHARS =======
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
    
    lines.push('');
    lines.push(dashes());
    lines.push('');
    
    // === DATE & TIME (RIGHT ALIGNED) ===
    lines.push(`${dateStr} ${timeStr}`);
        lines.push(`Invoice: ${invoiceNo}`);
    // lines.push(`Order: #${orderId}`);
    lines.push(`Order Type: ${orderType}`);
    
    lines.push(dashes());
    lines.push('');
    
    // === ITEMS HEADER ===
    lines.push('ITEM         QTY  RATE  TOTAL');
    
    // === ITEMS (with word-wrapping for names) ===
    items.forEach(item => {
      const itemName = item.name || 'Item';
      const nameLines = wrapText(itemName, 14);
      
      if (nameLines.length === 0) return;
      
      // First line with quantities/rates/totals
      const rateNum = Number(item.price || 0);
      const totalNum = rateNum * Number(item.quantity || 1);
      
      const rate = rateNum % 1 === 0 
        ? rateNum.toFixed(0).padStart(4)
        : rateNum.toFixed(2).padStart(4);
      
      const total = totalNum % 1 === 0
        ? totalNum.toFixed(0).padStart(5)
        : totalNum.toFixed(2).padStart(5);
      
      const qty = `${item.quantity}`.padStart(2);
      const firstLine = nameLines[0].padEnd(14) + qty + '  ' + rate + '  ' + total;
      lines.push(firstLine);
      
      // Additional name lines (if wrapped to multiple lines)
      for (let i = 1; i < nameLines.length; i++) {
        lines.push(nameLines[i].padEnd(14));
      }
    });
    
    lines.push('');
    lines.push(dashes());
    lines.push('');
    
    // === TOTALS (LEFT ALIGNED) ===
        if (taxAmount > 0) {
      // Net Amt = Grand Total - Tax
      const netAmt = grandTotal - taxAmount;
      lines.push(`Net Amt: ${netAmt.toFixed(2)}`);
      lines.push(`Tax: ${taxAmount.toFixed(2)}`);
      lines.push(`Grand Total: ${grandTotal.toFixed(2)}`);
    } else {
      // If no tax, only show Grand Total
      lines.push(`Total: ${grandTotal.toFixed(2)}`);
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
    const orderType = getOrderTypeLabel(order);
    const invoiceNo = order?.invoice_no || bill?.invoice_no || '';


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

    const grandTotal = Number(
      bill?.grand_total ||
      bill?.total_inc_tax ||
      order?.total_inc_tax ||
      order?.total_amount ||
      order?.total ||
      0
    );
    const taxAmount = Number(
      bill?.tax_total ||
      bill?.total_tax ||
      order?.tax_amount ||
      order?.total_tax ||
      0
    );

    const W = getReceiptWidth(restaurantProfile);
    const dashes = () => '-'.repeat(W);
    const lines = [];

    // === HEADER (text only) ===
    lines.push(center(restaurantName, W));
    wrapText(address, W).forEach(l => lines.push(center(l, W)));
    if (phone) lines.push(center(`Contact No.: ${phone}`, W));
    lines.push(dashes());

    // === META ===
    lines.push(`${dateStr} ${timeStr}`);
    // lines.push(`Order: #${orderId}`);
     lines.push(`Invoice: ${invoiceNo}`);
    lines.push(`Order Type: ${orderType}`);

    // === ITEMS ===
    lines.push(dashes());
    lines.push('ITEM         QTY  RATE  TOTAL');

    items.forEach(item => {
      const nameLines = wrapText(item.name || 'Item', 14);
      if (!nameLines.length) return;

      const rateNum = Number(item.price || 0);
      const totalNum = rateNum * Number(item.quantity || 1);

      const rate = (rateNum % 1 === 0 ? rateNum.toFixed(0) : rateNum.toFixed(2)).padStart(4);
      const total = (totalNum % 1 === 0 ? totalNum.toFixed(0) : totalNum.toFixed(2)).padStart(5);
      const qty = String(item.quantity).padStart(2);

      lines.push(nameLines[0].padEnd(14) + qty + '  ' + rate + '  ' + total);
      for (let i = 1; i < nameLines.length; i++) {
        lines.push(nameLines[i].padEnd(14));
      }
    });

    // === TOTALS ===
    lines.push(dashes());
    if (taxAmount > 0) {
      const netAmt = grandTotal - taxAmount;
      lines.push(`Net Amt: ${netAmt.toFixed(2)}`);
      lines.push(`Tax: ${taxAmount.toFixed(2)}`);
      lines.push(`Grand Total: ${grandTotal.toFixed(2)}`);
    } else {
      lines.push(`Total: ${grandTotal.toFixed(2)}`);
    }
    lines.push(dashes());
    lines.push(center('** THANK YOU! VISIT AGAIN !! **', W));
    lines.push('');

    // === COMBINE TEXT + LOGO BYTES ===
    const bodyText = lines.join('\n');
    const logoEsc = buildLogoEscPos(restaurantProfile);  // uses print_logo_* from DB

    if (logoEsc) {
      return logoEsc + bodyText;   // logo printed first, then normal receipt
    }
    return bodyText;
  } catch (e) {
    console.error(e);
    return 'PRINT ERROR';
  }
}

export async function downloadPdfAndShare(order, bill, restaurantProfile) {
  return downloadTextAndShare(order, bill, restaurantProfile);
}
