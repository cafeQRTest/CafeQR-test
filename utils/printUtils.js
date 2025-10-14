// utils/printUtils.js
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

export async function downloadPdfAndShare(order) {
  try {
    const items = toDisplayItems(order);
    const pageWidth = 58;
    const centerX = pageWidth / 2;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pageWidth, Math.max(100, 40 + items.length * 8)]
    });
    doc.setFont('courier', 'normal');

    let y = 10;
    const lineSpacing = 6;

    // Header
    doc.setFontSize(14).setFont('courier','bold')
      .text('KITCHEN ORDER', centerX, y, { align: 'center' });
    y += lineSpacing;
    doc.text('TICKET', centerX, y, { align: 'center' });
    y += lineSpacing;

    // Separator
    doc.setFontSize(12).setFont('courier','normal')
      .text('==============================', centerX, y, { align: 'center' });
    y += lineSpacing;

    // Table / Order ID
    doc.setFontSize(13).setFont('courier','bold')
      .text('Table: ' + getOrderTypeLabel(order), centerX, y, { align: 'center' });
    y += lineSpacing;
    const oid = order.id?.slice(0,8)?.toUpperCase()||'N/A';
    doc.text('Order: #' + oid, centerX, y, { align: 'center' });
    y += lineSpacing;

    // Full date & time
    const dt = new Date(order.created_at)
      .toLocaleString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric',
                                 hour:'2-digit', minute:'2-digit', hour12:true });
    doc.setFontSize(13).setFont('courier','normal')
      .text('Time: ' + dt, centerX, y, { align: 'center' });
    y += lineSpacing;

    // Separator
    doc.setFontSize(12)
      .text('==============================', centerX, y, { align: 'center' });
    y += lineSpacing;

    // Items
    doc.setFontSize(13).setFont('courier','bold');
    if (items.length === 0) {
      doc.text('No items found', centerX, y, { align: 'center' });
      y += lineSpacing;
    } else {
      items.forEach(it => {
        const line = `${it.quantity||1}x  ${it.name}`;
        const wrapped = doc.splitTextToSize(line, pageWidth - 1);
        wrapped.forEach(l => {
          doc.text(l, centerX, y, { align: 'center' });
          y += 6;
        });
        y += 2;
      });
    }
    y += 2;

    // Separator
    doc.setFontSize(12).setFont('courier','normal')
      .text('==============================', centerX, y, { align: 'center' });
    y += lineSpacing;

    // Special instructions
    if (order.special_instructions) {
      doc.setFontSize(10).setFont('courier','bold')
        .text('Special:', centerX, y, { align: 'center' });
      y += 5;
      doc.setFont('courier','normal');
      const notes = doc.splitTextToSize(order.special_instructions, pageWidth - 2);
      notes.forEach(n => {
        doc.text(n, centerX, y, { align: 'center' });
        y += 5;
      });
      y += 2;
    }

    // Footer timestamp with full year
    const printed = new Date().toLocaleString('en-IN', 
      { day:'2-digit', month:'2-digit', year:'numeric', 
        hour:'2-digit', minute:'2-digit', hour12:true });
    doc.setFontSize(11)
      .text('Printed: ' + printed, centerX, y, { align: 'center' });

    // Output as PDF blob...
    const blob = doc.output('blob');
    const fileName = `KOT-${oid}.pdf`;

    if (navigator.canShare) {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title:'Kitchen Order Ticket', text:'Print this KOT', files:[file] });
        return { success:true, method:'share' };
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; document.body.appendChild(a);
    a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);

    return { success:true, method:'download' };
  } catch(err) {
    console.error(err);
    return { success:false, error:err.message };
  }
}

export async function downloadTextAndShare(order) {
  try {
    const items = toDisplayItems(order);
    const orderId = order.id?.slice(0,8)?.toUpperCase()||'N/A';
    // full timestamp
    const dt = new Date(order.created_at).toLocaleString('en-IN', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit', hour12:true
    });

    // Helper to center in 32-char width
    const center = (str, w=32) => {
      const p = Math.max(0, Math.floor((w - str.length)/2));
      return ' '.repeat(p) + str;
    };

    const lines = [
      center('KITCHEN ORDER'),
      center('TICKET'),
      center('=============================='),
      center(`Table: ${getOrderTypeLabel(order)}`),
      center(`Order: #${orderId}`),
      center(`Time: ${dt}`),
      center('=============================='),
      ...(
        items.length
          ? items.flatMap(it => center(`${it.quantity||1}x  ${it.name}`))
          : [ center('No items found') ]
      ),
      center('=============================='),
      ...(order.special_instructions
        ? [ center('Special:'), ...order.special_instructions.split('\n').map(l=>center(l)), center('==============================') ]
        : []),
      center(`Printed: ${new Date().toLocaleString('en-IN', {
        day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit', hour12:true
      })}`)
    ];

    const text = lines.join('\n');

    // Share via Web Share API (plain text) so Thermer can consume
    if (navigator.canShare && navigator.canShare({ text })) {
      await navigator.share({ title:`KOT-${orderId}`, text });
      return { success:true, method:'share' };
    }

    // Fallback to download if share unavailable
    const blob = new Blob([text], { type:'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `KOT-${orderId}.txt`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success:true, method:'download' };
  } catch(error) {
    console.error(error);
    return { success:false, error:error.message };
  }
}
