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
    
    // Create PDF optimized for 58mm thermal printer (2.28 inches)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [58, Math.max(100, 40 + items.length * 8)] // Dynamic height based on content
    });

    // Use monospace font for thermal printer compatibility
    doc.setFont('courier', 'normal');
    
    let y = 8;
    const pageWidth = 58;
    const leftMargin = 1;
    const lineSpacing = 5;
    
    // Header - larger and centered
    doc.setFontSize(14);
    doc.setFont('courier', 'bold');
    doc.text('KITCHEN ORDER', pageWidth/2, y, { align: 'center' });
    y += 6;
    doc.text('TICKET', pageWidth/2, y, { align: 'center' });
    y += 8;
    
    // Separator line
    doc.setFontSize(10);
    doc.setFont('courier', 'normal');
    doc.text('==============================', leftMargin, y);
    y += 6;
    
    // Table info - larger text
    doc.setFontSize(12);
    doc.setFont('courier', 'bold');
    doc.text('Table: ' + (order.table_number || 'N/A'), leftMargin, y);
    y += lineSpacing;
    
    // Order ID
    const orderId = order.id?.slice(0,8)?.toUpperCase() || 'N/A';
    doc.text('Order: #' + orderId, leftMargin, y);
    y += lineSpacing;
    
    // Time
    const timeStr = new Date(order.created_at).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    doc.text('Time: ' + timeStr, leftMargin, y);
    y += 8;
    
    // Separator
    doc.setFont('courier', 'normal');
    doc.setFontSize(10);
    doc.text('==============================', leftMargin, y);
    y += 6;
    
    // Items section
    doc.setFontSize(12);
    doc.setFont('courier', 'bold');
    if (items.length === 0) {
      doc.text('No items found', leftMargin, y);
      y += lineSpacing;
    } else {
      items.forEach(item => {
        const qty = (item.quantity || 1).toString();
        const name = item.name || 'Item';
        
        // Format: "2x Peri Peri Alfaham"
        const itemLine = qty + 'x  ' + name;
        
        // Handle long names by wrapping text
        const maxWidth = pageWidth - 6; // Leave margin
        const lines = doc.splitTextToSize(itemLine, maxWidth);
        
        lines.forEach(line => {
          doc.text(line, leftMargin, y);
          y += 4.5; // Tighter line spacing for items
        });
        
        y += 1; // Small gap between items
      });
    }
    
    y += 3;
    
    // Bottom separator
    doc.setFont('courier', 'normal');
    doc.text('==============================', leftMargin, y);
    y += 6;
    
    // Special instructions if any
    if (order.special_instructions) {
      doc.setFontSize(9);
      doc.setFont('courier', 'bold');
      doc.text('Special:', leftMargin, y);
      y += 4;
      doc.setFont('courier', 'normal');
      const instrLines = doc.splitTextToSize(order.special_instructions, pageWidth - 6);
      instrLines.forEach(line => {
        doc.text(line, leftMargin, y);
        y += 4;
      });
      y += 3;
    }
    
    // Timestamp
    doc.setFontSize(8);
    doc.setFont('courier', 'normal');
    const printTime = new Date().toLocaleString('en-IN');
    doc.text('Printed: ' + printTime, leftMargin, y);
    y += 8;
    
    // Generate PDF blob
    const pdfBlob = doc.output('blob');
    const fileName = `KOT-${orderId}.pdf`;
    
    // Try Web Share API first (works on Android)
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

// Enhanced text version - properly formatted for thermal printers
export function downloadTextAndShare(order) {
  try {
    const items = toDisplayItems(order);
    const orderId = order.id?.slice(0,8)?.toUpperCase() || 'N/A';
    const timeStr = new Date(order.created_at).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    
    // Build content with proper thermal printer formatting
    const lines = [
      '',
      '       KITCHEN ORDER',
      '          TICKET',
      '',
      '==============================',
      '',
      'Table: ' + (order.table_number || 'N/A'),
      'Order: #' + orderId,
      'Time: ' + timeStr,
      '',
      '==============================',
      ''
    ];
    
    // Add items
    if (items.length === 0) {
      lines.push('No items found');
    } else {
      items.forEach(item => {
        const qty = item.quantity || 1;
        const name = item.name || 'Item';
        lines.push(qty + 'x  ' + name);
      });
    }
    
    lines.push('');
    lines.push('==============================');
    
    // Add special instructions if any
    if (order.special_instructions) {
      lines.push('');
      lines.push('Special: ' + order.special_instructions);
      lines.push('');
      lines.push('==============================');
    }
    
    lines.push('');
    lines.push('Printed: ' + new Date().toLocaleString('en-IN'));
    lines.push('');
    lines.push(''); // Extra blank lines for easier tearing
    lines.push('');
    
    const textContent = lines.join('\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const fileName = `KOT-${orderId}.txt`;
    
    // Try Web Share API
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
