// utils/printUtils.js
import { jsPDF } from 'jspdf';

function toDisplayItems(order) {
  if (Array.isArray(order.items) && order.items.length) {
    return order.items;
  }
  if (Array.isArray(order.order_items) && order.order_items.length) {
    return order.order_items.map((oi) => ({
      name: oi.menu_items?.name || oi.item_name || 'Item',
      quantity: oi.quantity,
      price: oi.price,
    }));
  }
  return [];
}

export async function downloadPdfAndShare(order) {
  try {
    const items = toDisplayItems(order);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [58, Math.max(100, 40 + items.length * 8)]
    });

    doc.setFont('courier', 'normal');

    let y = 10;
    const pageWidth = 58;
    const centerX = pageWidth / 2;
    const lineSpacing = 7;

    // Header
    doc.setFontSize(14);
    doc.setFont('courier', 'bold');
    doc.text('KITCHEN ORDER', centerX, y, { align: 'center' });
    y += lineSpacing;
    doc.text('TICKET', centerX, y, { align: 'center' });
    y += lineSpacing;

    // Separator line
    doc.setFontSize(12);
    doc.setFont('courier', 'normal');
    doc.text('==============================', centerX, y, { align: 'center' });
    y += lineSpacing;

    // Table info
    doc.setFontSize(13);
    doc.setFont('courier', 'bold');
    doc.text('Table: ' + (order.table_number || 'N/A'), centerX, y, { align: 'center' });
    y += lineSpacing;

    const orderId = order.id?.slice(0, 8)?.toUpperCase() || 'N/A';
    doc.text('Order: #' + orderId, centerX, y, { align: 'center' });
    y += lineSpacing;

const timeStr = new Date(order.created_at).toLocaleString('en-IN');
doc.text('Time: ' + timeStr, centerX, y, { align: 'center' });
y += lineSpacing;

    // Separator line
    doc.setFontSize(12);
    doc.setFont('courier', 'normal');
    doc.text('==============================', centerX, y, { align: 'center' });
    y += lineSpacing;

    doc.setFontSize(13);
    doc.setFont('courier', 'bold');

    // Items
    if (items.length === 0) {
      doc.text('No items found', centerX, y, { align: 'center' });
      y += lineSpacing;
    } else {
      items.forEach(item => {
        const qty = (item.quantity || 1).toString();
        const name = item.name || 'Item';
        const itemLine = qty + 'x  ' + name;

        // Wrap long item names
        const lines = doc.splitTextToSize(itemLine, pageWidth - 10); // fits well when centered
        lines.forEach(line => {
          doc.text(line, centerX, y, { align: 'center' });
          y += 6;
        });
        y += 2;
      });
    }
    y += 2;

    // Separator
    doc.setFontSize(12);
    doc.setFont('courier', 'normal');
    doc.text('==============================', centerX, y, { align: 'center' });
    y += lineSpacing;

    // Special instructions
    if (order.special_instructions) {
      doc.setFontSize(10);
      doc.setFont('courier', 'bold');
      doc.text('Special:', centerX, y, { align: 'center' });
      y += 5;
      doc.setFont('courier', 'normal');
      const instrLines = doc.splitTextToSize(order.special_instructions, pageWidth - 10);
      instrLines.forEach(line => {
        doc.text(line, centerX, y, { align: 'center' });
        y += 5;
      });
      y += 2;
    }

    // Timestamp
    doc.setFontSize(11);
    doc.setFont('courier', 'normal');
    const printTime = new Date().toLocaleString('en-IN');
    doc.text('Printed: ' + printTime, centerX, y, { align: 'center' });
    y += lineSpacing;

    // Generate PDF blob
    const pdfBlob = doc.output('blob');
    const fileName = `KOT-${orderId}.pdf`;

    if (navigator.canShare) {
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Kitchen Order Ticket',
          text: 'Print this KOT on thermal printer',
          files: [file]
        });
        return { success: true, method: 'share' };
      }
    }

    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, method: 'download' };

  } catch (error) {
    console.error('PDF generation error:', error);
    return { success: false, error: error.message };
  }
}

// Enhanced text version for thermal printers (items already centered as text lines)
export function downloadTextAndShare(order) {
  try {
    const items = toDisplayItems(order);
    const orderId = order.id?.slice(0, 8)?.toUpperCase() || 'N/A';
    const timeStr = new Date(order.created_at).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    function center(str, width = 32) {
      const padLength = Math.max(0, Math.floor((width - str.length) / 2));
      return ' '.repeat(padLength) + str;
    }

    const lines = [
      '', center('KITCHEN ORDER', 32),
      center('TICKET', 30), '',
      center('==============================', 32), '',
      center('Table: ' + (order.table_number || 'N/A'), 32),
      center('Order: #' + orderId, 30),
      center('Time: ' + timeStr, 30), '',
      center('==============================', 32), ''
    ];

    // Add items, center each line
    if (items.length === 0) {
      lines.push(center('No items found', 32));
    } else {
      items.forEach(item => {
        const qty = item.quantity || 1;
        const name = item.name || 'Item';
        lines.push(center(qty + 'x  ' + name, 32));
      });
    }

    lines.push('');
    lines.push(center('==============================', 32));

    // Special instructions
    if (order.special_instructions) {
      lines.push('');
      lines.push(center('Special: ' + order.special_instructions, 32));
      lines.push('');
      lines.push(center('==============================', 32));
    }

    lines.push('');
    lines.push(center('Printed: ' + new Date().toLocaleString('en-IN'), 32));
    lines.push('\n\n');

    const textContent = lines.join('\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const fileName = `KOT-${orderId}.txt`;

    if (navigator.canShare) {
      const file = new File([blob], fileName, { type: 'text/plain' });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({
          title: 'Kitchen Order Ticket',
          text: 'Print this KOT on thermal printer',
          files: [file]
        });
        return { success: true, method: 'share' };
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, method: 'download' };

  } catch (error) {
    console.error('Text generation error:', error);
    return { success: false, error: error.message };
  }
}
