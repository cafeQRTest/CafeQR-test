//utils/printUtils.js

import { jsPDF } from 'jspdf';

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

export function downloadTextAndShare(order, bill, restaurant) {
  try {
    const items = toDisplayItems(order);

    const restaurantName = (restaurant?.restaurant_name || order?.restaurant_name || 'Restaurant').toUpperCase();
    const address = restaurant?.restaurant_address || order?.restaurant_address || '';
    const fssai = restaurant?.fssai || order?.fssai || '';
    const gstin = restaurant?.gstin || order?.gstin || '';
    const phone = restaurant?.restaurant_phone || order?.restaurant_phone || '';

    const billNo = bill?.bill_number || order?.bill_number || '-';
    const serialNo = bill?.serial_number || order?.serial_number || '-';
    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || 'N/A';
    const orderType = getOrderTypeLabel(order);
    const time = order?.created_at ? new Date(order.created_at) : new Date();
    const date = time.toLocaleDateString('en-IN');
    const billTime = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const grandTotal = bill?.grand_total || bill?.total_inc_tax || order?.total_inc_tax || order?.total_amount || order?.total || 0;
    const netAmount = bill?.subtotal || order?.subtotal || order?.total_amount || order?.total || 0;
    const taxAmount = bill?.tax_total || bill?.total_tax || order?.tax_amount || order?.total_tax || 0;

    // Text formatting
    let text = '';
    text += `${restaurantName}\n`;
    if (address) text += `${address}\n`;
    if (fssai) text += `FSSAI: ${fssai}\n`;
    if (gstin) text += `GSTIN: ${gstin}\n`;
    if (phone) text += `Contact No.: ${phone}\n`;
    text += '-'.repeat(32) + '\n';
    text += `Serial No: ${serialNo}  ${date}\n`;
    text += `Bill No: ${billNo}  ${billTime}\n`;
    text += `Order: #${orderId}\n`;
    text += `Order Type: ${orderType}\n`;
    text += '-'.repeat(32) + '\n';
    text += `ITEM         QTY  RATE  AMT\n`;

    if (items.length) {
      for (let item of items) {
        let n = (item.name || '').substring(0, 10).padEnd(10, ' ');
        let q = String(item.quantity).padStart(3, ' ');
        let r = Number(item.price ?? 0).toFixed(2).padStart(5, ' ');
        let a = (Number(item.price ?? 0) * Number(item.quantity ?? 1)).toFixed(2).padStart(6, ' ');
        text += `${n} ${q} ${r} ${a}\n`;
      }
    } else {
      text += 'No items found\n';
    }

    text += '-'.repeat(32) + '\n';
    text += `Net: ${Number(netAmount).toFixed(2)}\n`;
    if (taxAmount && taxAmount > 0)
      text += `Tax: ${Number(taxAmount).toFixed(2)}\n`;
    text += `Total: ${Number(grandTotal).toFixed(2)}\n`;
    text += '-'.repeat(32) + '\n';
    text += `PLEASE CONSUME ALL FOOD WITHIN 1\nHOUR FROM COOKING TO KEEP IT SAFE\nFROM BACTERIA.\n"YOUR HEALTH IS OUR PRIORITY"\n`;
    text += '** THANK YOU! VISIT AGAIN !! **\n';

    // For web share API or download
    const blob = new Blob([text], { type: 'text/plain' });
    const fileName = `KOT-${orderId}.txt`;

    // Share if possible
    if (navigator.canShare) {
      const file = new File([blob], fileName, { type: 'text/plain' });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({
          title: 'KOT',
          text: 'Kitchen Order Ticket',
          files: [file],
        });
        return { success: true, method: 'share' };
      }
    }
    // Else, download file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; document.body.appendChild(a);
    a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);

    return { success: true, method: 'download' };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
}

// Core bill function for PDF (thermal friendly)
export async function downloadPdfAndShare(order, bill, restaurant) {
  try {
    const items = toDisplayItems(order);

    // --- Header Data
    const restaurantName = get(restaurant || order, 'restaurant_name', 'Restaurant');
    const restaurantAddr = get(restaurant || order, 'restaurant_address', '');
    const fssai = get(restaurant || order, 'fssai', '');
    const gstin = get(restaurant || order, 'gstin', '');
    const contactNo = get(restaurant || order, 'restaurant_phone', '');

    // --- Bill Details
    const billNo = get(bill || order, 'bill_number', '-');
    const serialNo = get(bill || order, 'serial_number', '-');
    const orderId = order?.id?.slice(0, 8)?.toUpperCase() || 'N/A';
    const orderType = getOrderTypeLabel(order);
    const orderTime = new Date(order.created_at);
    const billDate = orderTime.toLocaleDateString('en-IN');
    const billTime = orderTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const grandTotal =
      get(bill, 'grand_total') ??
      get(bill, 'total_inc_tax') ??
      get(order, 'total_inc_tax') ??
      get(order, 'total_amount') ??
      get(order, 'total') ??
      0;
    const netAmount =
      get(bill, 'subtotal') ??
      get(order, 'subtotal') ??
      get(order, 'total_amount') ??
      get(order, 'total') ??
      0;
    const taxAmount =
      get(bill, 'tax_total') ??
      get(bill, 'total_tax') ??
      get(order, 'tax_amount') ??
      get(order, 'total_tax') ??
      0;

    // --- Set up PDF doc
    const pageWidth = 58; // mm for thermal
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pageWidth, Math.max(120, 60 + items.length * 7)],
    });
    const centerX = pageWidth / 2;
    let y = 8;

    // --- Header
    doc.setFont('courier', 'bold').setFontSize(13);
    doc.text(restaurantName, centerX, y, { align: 'center' }); y += 5;
    if (restaurantAddr) { doc.setFontSize(11); doc.text(restaurantAddr, centerX, y, { align: 'center' }); y += 5; }
    if (fssai) { doc.setFontSize(10); doc.text(`FSSAI: ${fssai}`, centerX, y, { align: 'center' }); y += 4; }
    if (gstin) { doc.setFontSize(10); doc.text(`GSTIN: ${gstin}`, centerX, y, { align: 'center' }); y += 4; }
    if (contactNo) { doc.setFontSize(10); doc.text(`Contact No.: ${contactNo}`, centerX, y, { align: 'center' }); y += 5; }

    doc.setFontSize(10).text('-'.repeat(32), centerX, y, { align: 'center' }); y += 4;

    // --- Bill Details
    doc.setFont('courier', 'normal').setFontSize(9);
    doc.text(`Serial No: ${serialNo}  ${billDate}`, centerX, y, { align: 'center' }); y += 4;
    doc.text(`Bill No: ${billNo}  ${billTime}`, centerX, y, { align: 'center' }); y += 4;
    doc.text(`Order: #${orderId}`, centerX, y, { align: 'center' }); y += 4;
    doc.text(`Order Type: ${orderType}`, centerX, y, { align: 'center' }); y += 4;

    doc.setFontSize(10).text('-'.repeat(32), centerX, y, { align: 'center' }); y += 4;

    // --- Item Table Head
    doc.setFont('courier', 'bold').setFontSize(9);
    doc.text('ITEM         QTY  RATE  AMT', centerX, y, { align: 'center' }); y += 4;
    doc.setFont('courier', 'normal');

    // --- Items
    if (items.length) {
      items.forEach((item) => {
        let n = (item.name || '').substring(0, 10).padEnd(10); // truncate/pad name
        let q = String(item.quantity).padStart(3);
        let r = Number(item.price ?? 0).toFixed(2).padStart(5);
        let a = (Number(item.price ?? 0) * Number(item.quantity ?? 1)).toFixed(2).padStart(6);
        doc.text(`${n} ${q} ${r} ${a}`, centerX, y, { align: 'center' }); y += 4;
      });
    } else {
      doc.text('No items found', centerX, y, { align: 'center' }); y += 4;
    }

    doc.setFontSize(10).text('-'.repeat(32), centerX, y, { align: 'center' }); y += 4;

    // --- Amount section
    doc.setFont('courier', 'bold').setFontSize(10);
    doc.text(`Net: ${Number(netAmount).toFixed(2)}`, centerX, y, { align: 'center' }); y += 5;
    if (taxAmount && taxAmount > 0)
      { doc.text(`Tax: ${Number(taxAmount).toFixed(2)}`, centerX, y, { align: 'center' }); y += 4; }
    doc.text(`Total: ${Number(grandTotal).toFixed(2)}`, centerX, y, { align: 'center' }); y += 5;

    doc.setFont('courier', 'normal').setFontSize(9);

    // --- Footer
    doc.text('PLEASE CONSUME ALL FOOD WITHIN 1', centerX, y, { align: 'center' }); y += 4;
    doc.text('HOUR FROM COOKING TO KEEP IT SAFE', centerX, y, { align: 'center' }); y += 4;
    doc.text('FROM BACTERIA.', centerX, y, { align: 'center' }); y += 4;
    doc.text('"YOUR HEALTH IS OUR PRIORITY"', centerX, y, { align: 'center' }); y += 5;
    doc.setFont('courier', 'bold').setFontSize(11);
    doc.text('** THANK YOU! VISIT AGAIN !! **', centerX, y, { align: 'center' });

    // Output as PDF blob and share/download as in your current code
    const blob = doc.output('blob');
    const fileName = `BILL-${orderId}.pdf`;
    if (navigator.canShare) {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Bill',
          text: 'Print this bill',
          files: [file],
        });
        return { success: true, method: 'share' };
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; document.body.appendChild(a);
    a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);

    return { success: true, method: 'download' };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
}
