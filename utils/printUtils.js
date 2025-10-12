// utils/printUtils.js
import { jsPDF } from 'jspdf';

// Helper function to get display items (same as your existing logic)
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
    
    // Create PDF optimized for thermal printer (58mm width)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [58, 200] // 58mm width, auto height
    });

    // Set font for better thermal printer compatibility
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    
    const leftMargin = 2;
    const pageWidth = 54; // Leave some margin
    let y = 8;
    
    // Header - centered
    doc.setFontSize(10);
    doc.text('KITCHEN ORDER TICKET', pageWidth/2, y, { align: 'center' });
    y += 8;
    
    // Divider
    doc.setFontSize(8);
    doc.text('================================', leftMargin, y);
    y += 6;
    
    // Order details
    doc.text(`Table: ${order.table_number || 'N/A'}`, leftMargin, y);
    y += 5;
    
    doc.text(`Order: #${order.id?.slice(0,8)?.toUpperCase() || 'N/A'}`, leftMargin, y);
    y += 5;
    
    doc.text(`Time: ${new Date(order.created_at).toLocaleTimeString()}`, leftMargin, y);
    y += 6;
    
    // Divider
    doc.text('================================', leftMargin, y);
    y += 6;
    
    // Items
    if (items.length === 0) {
      doc.text('No items found', leftMargin, y);
      y += 5;
    } else {
      items.forEach(item => {
        const line = `${item.quantity || 1}x  ${item.name || 'Item'}`;
        // Handle long item names by wrapping
        const lines = doc.splitTextToSize(line, pageWidth - 4);
        lines.forEach(textLine => {
          doc.text(textLine, leftMargin, y);
          y += 4;
        });
        y += 1; // Extra space between items
      });
    }
    
    y += 3;
    
    // Divider
    doc.text('================================', leftMargin, y);
    y += 6;
    
    // Footer
    doc.setFontSize(7);
    doc.text(`Printed: ${new Date().toLocaleString()}`, leftMargin, y);
    y += 8;
    
    // Generate PDF blob
    const pdfBlob = doc.output('blob');
    const fileName = `KOT-${order.id?.slice(0,8) || Date.now()}.pdf`;
    
    // Try Web Share API first (works on Android)
    if (navigator.canShare) {
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Kitchen Order Ticket',
          text: 'Please print this KOT',
          files: [file]
        });
        return { success: true, method: 'share' };
      }
    }
    
    // Fallback: Download
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

// Alternative: Generate text version for maximum compatibility
export function downloadTextAndShare(order) {
  try {
    const items = toDisplayItems(order);
    
    const textContent = [
      'KITCHEN ORDER TICKET',
      '================================',
      `Table: ${order.table_number || 'N/A'}`,
      `Order: #${order.id?.slice(0,8)?.toUpperCase() || 'N/A'}`,
      `Time: ${new Date(order.created_at).toLocaleTimeString()}`,
      '================================',
      ...items.map(item => `${item.quantity || 1}x  ${item.name || 'Item'}`),
      '================================',
      `Printed: ${new Date().toLocaleString()}`,
      '',
      ''
    ].join('\n');

    const blob = new Blob([textContent], { type: 'text/plain' });
    const fileName = `KOT-${order.id?.slice(0,8) || Date.now()}.txt`;
    
    // Try Web Share API
    if (navigator.canShare) {
      const file = new File([blob], fileName, { type: 'text/plain' });
      
      if (navigator.canShare({ files: [file] })) {
        navigator.share({
          title: 'Kitchen Order Ticket',
          text: 'Please print this KOT',
          files: [file]
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
    
  } catch (error) {
    console.error('Text generation error:', error);
    return { success: false, error: error.message };
  }
}
