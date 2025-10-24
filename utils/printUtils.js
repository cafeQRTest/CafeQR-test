import { jsPDF } from 'jspdf';

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

// ============================================
// TEXT FORMAT (PROVEN WORKING METHOD)
// ============================================
export async function downloadTextAndShare(order, bill, restaurantProfile) {
  try {
    const items = toDisplayItems(order);
    
    // Get restaurant details (with fallbacks)
    const restaurantName = (
      restaurantProfile?.restaurant_name || 
      restaurantProfile?.legal_name ||
      order?.restaurant_name || 
      'Cafe\'s Menu'
    ).toUpperCase();
    
    // Build address from components
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
    const billNo = bill?.bill_number || '-';
    const serialNo = bill?.id?.slice(0, 8)?.toUpperCase() || '-';
    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || 'N/A';
    const orderType = getOrderTypeLabel(order);
    
    // Date & Time
    const dt = new Date(order.created_at).toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
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

    // Helper to center in 42-char width (58mm thermal)
    const center = (str, w = 42) => {
      const p = Math.max(0, Math.floor((w - str.length) / 2));
      return ' '.repeat(p) + str;
    };

    // Build lines array
    const lines = [
      center(restaurantName),
      center(address),
      gstin ? center(`GSTIN: ${gstin}`) : null,
      phone ? center(`Contact No.: ${phone}`) : null,
      '',
      center('----------------------------------------'),
      center(`Serial No: ${serialNo}   ${dt.split(',')[0]}`),
      center(`Bill No: ${billNo}    ${dt.split(',')[1].trim()}`),
      center(`Order: #${orderId}`),
      center(`Order Type: ${orderType}`),
      center('----------------------------------------'),
      center('ITEM           QTY   RATE   TOTAL'),
      ...(items.length
        ? items.flatMap(it => {
            const name = (it.name || '').substring(0, 12).padEnd(12);
            const qty = String(it.quantity || 1).padStart(3);
            const rate = Number(it.price || 0).toFixed(2).padStart(6);
            const amt = (Number(it.price || 0) * Number(it.quantity || 1))
              .toFixed(2)
              .padStart(7);
            return center(`${name}${qty}${rate}${amt}`);
          })
        : [center('No items found')]),
      center('----------------------------------------'),
      center(`Net Amt: ${netAmount.toFixed(2)}`),
      ...(taxAmount > 0 ? [center(`Tax: ${taxAmount.toFixed(2)}`)] : []),
      center(`Grand Total: ${grandTotal.toFixed(2)}`),
      center('----------------------------------------'),
      '',
      center('PLEASE CONSUME ALL FOOD WITHIN'),
      center('1 HOUR FROM COOKING TO KEEP'),
      center('IT SAFE FROM BACTERIA.'),
      center('"YOUR HEALTH IS OUR PRIORITY"'),
      center('** THANK YOU! VISIT AGAIN !! **'),
    ].filter(Boolean);

    const text = lines.join('\n');

    // Share via Web Share API (plain text)
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

// ============================================
// PDF FORMAT (FALLBACK ONLY)
// ============================================
export async function downloadPdfAndShare(order, bill, restaurantProfile) {
  return downloadTextAndShare(order, bill, restaurantProfile);
}
