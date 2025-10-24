//utils/printUtils.js 

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
      restaurantProfile?.restaurant_name || 
      restaurantProfile?.legal_name ||
      order?.restaurant_name || 
      'RESTAURANT'
    ).toUpperCase();
    
    // Build address - wrapped for 50mm width
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

    // Build text for 50mm (33 chars max)
    const W = 33; // Character width for 50mm thermal printer
    
    const center = (str) => {
      const padding = Math.max(0, Math.floor((W - str.length) / 2));
      return ' '.repeat(padding) + str;
    };
    
    const leftAlign = (str) => str;
    
    const rightAlign = (str) => {
      const padding = Math.max(0, W - str.length);
      return ' '.repeat(padding) + str;
    };

    // Build lines
    const lines = [
      // === HEADER (CENTER ALIGNED) ===
      center(restaurantName),
      ...wrapText(address, W).map(line => center(line)),
      gstin ? center(`GSTIN: ${gstin}`) : null,
      phone ? center(`Ph: ${phone}`) : null,
      '',
      center('=' .repeat(W)),
      
      // === ORDER INFO (LEFT + RIGHT ALIGNED) ===
      buildLRLine(leftAlign(`Order: #${orderId}`), rightAlign(dateStr), W),
      buildLRLine(leftAlign(`Type: ${orderType}`), rightAlign(timeStr), W),
      
      center('-'.repeat(W)),
      
      // === ITEMS HEADER (LEFT ALIGNED) ===
      buildItemHeader(W),
      
      // === ITEMS (LEFT ALIGNED) ===
      ...items.map(it => buildItemRow(it, W)),
      
      center('-'.repeat(W)),
      
      // === TOTALS (LEFT ALIGNED) ===
      buildLRLine(leftAlign('Net Amt:'), rightAlign(`₹${netAmount.toFixed(2)}`), W),
      ...(taxAmount > 0 ? [buildLRLine(leftAlign('Tax:'), rightAlign(`₹${taxAmount.toFixed(2)}`), W)] : []),
      buildLRLine(leftAlign('Total:'), rightAlign(`₹${grandTotal.toFixed(2)}`), W),
      
      center('='.repeat(W)),
      
      // === FOOTER (CENTER ALIGNED) ===
      '',
      center('THANK YOU!'),
      center('VISIT AGAIN'),
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

// Helper: Wrap text for 50mm width
function wrapText(text, width) {
  if (!text) return [];
  const lines = [];
  let currentLine = '';
  
  text.split(' ').forEach(word => {
    if ((currentLine + word).length <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  
  if (currentLine) lines.push(currentLine);
  return lines;
}

// Helper: Build left-right aligned line
function buildLRLine(left, right, width) {
  const gap = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

// Helper: Item header
function buildItemHeader(width) {
  return 'Item      Qty    Rate   Total';
}

// Helper: Build item row (LEFT ALIGNED)
function buildItemRow(item, width) {
  const name = (item.name || '').substring(0, 10).padEnd(10);
  const qty = String(item.quantity || 1).padStart(3);
  const rate = Number(item.price || 0).toFixed(2).padStart(5);
  const total = (Number(item.price || 0) * Number(item.quantity || 1))
    .toFixed(2)
    .padStart(6);
  
  return `${name}${qty}${rate}${total}`;
}

export async function downloadPdfAndShare(order, bill, restaurantProfile) {
  return downloadTextAndShare(order, bill, restaurantProfile);
}
