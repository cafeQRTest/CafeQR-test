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
    const W = 32;
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
    lines.push(`Order: #${orderId}`);
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

export async function downloadPdfAndShare(order, bill, restaurantProfile) {
  return downloadTextAndShare(order, bill, restaurantProfile);
}
