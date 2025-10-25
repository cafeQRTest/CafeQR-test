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

export async function downloadTextAndShare(order, bill, restaurantProfile) {
  try {
    const items = toDisplayItems(order);
    
    // Get restaurant details
    const restaurantName = (
  order?.restaurant_name ||           // ✅ PRIMARY: Display name from restaurants.name
  'RESTAURANT'                        // Fallback only if not available
).toUpperCase();
    
    // Build address - wrapped for 32 chars
    const addressParts = [
      restaurantProfile?.profile_address_street1,
      restaurantProfile?.profile_address_street2,
      restaurantProfile?.profile_address_city,
      restaurantProfile?.profile_address_state,
      restaurantProfile?.profile_address_pincode
    ].filter(Boolean);
    const address = addressParts.length > 0 
      ? addressParts.join(', ') 
      : (order?.restaurant_address || '');
    
    const gstin = restaurantProfile?.legal_gst || restaurantProfile?.gstin || '';
    const fssai = restaurantProfile?.fssai || '';
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

    // ======= ADJUSTED WIDTH TO 32 CHARS =======
    const W = 32;
    
    const center = (str) => {
      if (str.length > W) str = str.substring(0, W);
      const padding = Math.max(0, Math.floor((W - str.length) / 2));
      return ' '.repeat(padding) + str;
    };
    
    const dashes = () => '-'.repeat(W);

    // Build lines
    const lines = [
      // === HEADER (CENTER ALIGNED) ===
      center(restaurantName),
      ...wrapText(address, W).map(line => center(line)),
      phone ? center(`Contact No.: ${phone}`) : null,
      '',
      center(dashes()),
      '',
      
      // === ORDER INFO (LEFT ALIGNED) ===
      `Serial No: - ${dateStr}`,
      `Bill No: - ${timeStr}`,
      `Order: #${orderId}`,
      `Order Type: ${orderType}`,
      center(dashes()),
      
      // === ITEMS HEADER ===
      'ITEM         QTY  RATE  TOTAL',
      
      // === ITEMS ===
      ...items.map(it => buildItemRow(it, W)),
      
      center(dashes()),
      '',
      
      // === TOTALS (LEFT ALIGNED) ===
      `Net Amt: ${netAmount.toFixed(2)}`,
      ...(taxAmount > 0 ? [`Tax: ${taxAmount.toFixed(2)}`] : []),
      `Grand Total: ${grandTotal.toFixed(2)}`,
      center(dashes()),
      '',
      
      // === FOOTER (CENTER ALIGNED) ===
      center('** THANK YOU! VISIT AGAIN !! **'),
      '',
    ].filter(Boolean);

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

// Helper: Build item row (SIMPLIFIED FOR 32 CHARS)
function buildItemRow(item, width) {
  // Item name: 12 chars max
  const name = (item.name || '').substring(0, 12).padEnd(13);
  
  // Quantity: 1 char + 'x'
  const qty = `${item.quantity}`.padStart(1);
  
  // Rate: show as integer if possible
  const rateNum = Number(item.price || 0);
  const rate = rateNum % 1 === 0 
    ? rateNum.toFixed(0).padStart(4)
    : rateNum.toFixed(2).padStart(4);
  
  // Total
  const totalNum = rateNum * Number(item.quantity || 1);
  const total = totalNum % 1 === 0
    ? totalNum.toFixed(0).padStart(5)
    : totalNum.toFixed(2).padStart(5);
  
  return `${name}${qty}${rate}.00${total}.00`;
}

export async function downloadPdfAndShare(order, bill, restaurantProfile) {
  return downloadTextAndShare(order, bill, restaurantProfile);
}
