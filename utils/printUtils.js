//utils/printUtils.js

// Helper to get value safely with fallback
function get(obj, path, fallback = "") {
  return path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : null), obj) ?? fallback;
}

// Unified: get order type label
function getOrderTypeLabel(order) {
  if (!order) return '';
  if (order.order_type === 'parcel') return 'Parcel';
  if (order.table_number) return `Table ${order.table_number}`;
  if (order.order_type === 'dine-in') return 'Dine-in';
  if (order.order_type === 'counter') return 'Counter';
  return '';
}

function toDisplayItems(order) {
  if (Array.isArray(order.items) && order.items.length) return order.items;
  if (Array.isArray(order.order_items) && order.order_items.length) {
    return order.order_items.map((oi) => ({
      name: oi.menu_items?.name || oi.item_name || 'Item',
      quantity: oi.quantity,
      price: oi.price,
    }));
  }
  return [];
}

// TEXT FORMAT (for Thermer / Thermal Printers)
export async function downloadTextAndShare(order, bill, restaurantProfile) {
  try {
    const items = toDisplayItems(order);

    // Restaurant Details - CORRECTED field names
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
    const address = addressParts.length > 0 ? addressParts.join(', ') : (order?.restaurant_address || '');
    
    // FSSAI doesn't exist in your schema - skip or use empty
    const fssai = ''; // No FSSAI field in your database
    
    // GSTIN from legal_gst field
    const gstin = restaurantProfile?.legal_gst || restaurantProfile?.gstin || '';
    
    // Phone from restaurant_profiles.phone
    const phone = restaurantProfile?.phone || order?.restaurant_phone || '';

    // Bill/Order Details  
    // Note: bill_number field exists in bills table ✓
    const billNo = bill?.bill_number || '-';
    
    // Note: serial_number does NOT exist in bills table! 
    // You might need to add this field or use alternative
    const serialNo = bill?.serial_number || bill?.id?.slice(0, 8)?.toUpperCase() || '-';
    
    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || 'N/A';
    const orderType = getOrderTypeLabel(order);
    
    // Date & Time
    const time = order?.created_at ? new Date(order.created_at) : new Date();
    const dateStr = time.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    // Calculate Amounts
    const grandTotal = Number(bill?.grand_total || bill?.total_inc_tax || order?.total_inc_tax || order?.total_amount || order?.total || 0);
    const netAmount = Number(bill?.subtotal || order?.subtotal || order?.total_amount || order?.total || 0);
    const taxAmount = Number(bill?.tax_total || bill?.total_tax || order?.tax_amount || order?.total_tax || 0);

    // Build Text (58mm width ~42 characters)
    let text = '';
    text += `${restaurantName}\n`;
    if (address) text += `${address}\n`;
    // Skip FSSAI as it doesn't exist in your schema
    // if (fssai) text += `FSSAI: ${fssai}\n`;
    if (gstin) text += `GSTIN: ${gstin}\n`;
    if (phone) text += `Contact No.: ${phone}\n`;
    text += '\n';
    text += `Serial No: ${serialNo}   ${dateStr}\n`;
    text += `Bill No: ${billNo}    ${timeStr}\n`;
    text += `Order: #${orderId}\n`;
    text += `Order Type: ${orderType}\n`;
    text += '----------------------------------------\n';
    text += `ITEM              QTY  RATE   AMT\n`;

    if (items.length) {
      for (let item of items) {
        const itemName = (item.name || '').substring(0, 16).padEnd(16, ' ');
        const qty = String(item.quantity || 1).padStart(3, ' ');
        const rate = Number(item.price || 0).toFixed(2).padStart(6, ' ');
        const amt = (Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2).padStart(7, ' ');
        text += `${itemName}${qty}${rate}${amt}\n`;
      }
    } else {
      text += 'No items found\n';
    }

    text += '----------------------------------------\n';
    text += `Net Amt: ${netAmount.toFixed(2)}\n`;
    if (taxAmount > 0) {
      text += `Tax: ${taxAmount.toFixed(2)}\n`;
    }
    text += `Grand Total: ${grandTotal.toFixed(2)}\n`;
    text += '----------------------------------------\n';
    text += '\n';
    text += 'PLEASE CONSUME ALL FOOD WITHIN 1 HOUR\n';
    text += 'FROM COOKING TO KEEP IT SAFE\n';
    text += 'FROM BACTERIA.\n';
    text += '"YOUR HEALTH IS OUR PRIORITY"\n';
    text += '** THANK YOU! VISIT AGAIN !! **\n';

    // Share or Download
    const blob = new Blob([text], { type: 'text/plain' });
    const fileName = `BILL-${orderId}.txt`;

    if (navigator.canShare) {
      const file = new File([blob], fileName, { type: 'text/plain' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Bill',
          text: 'Print this bill',
          files: [file],
        });
        return { success: true, method: 'share' };
      }
    }

    // Fallback: Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, method: 'download' };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
}

// PDF FORMAT (fallback)
export async function downloadPdfAndShare(order, bill, restaurantProfile) {
  return downloadTextAndShare(order, bill, restaurantProfile);
}
