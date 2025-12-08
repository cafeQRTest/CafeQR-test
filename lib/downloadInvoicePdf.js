import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function downloadInvoicePdf(orderId) {
  const res = await fetch(`/api/invoices/download?order_id=${encodeURIComponent(orderId)}`);
  if (!res.ok) {
    throw new Error('Failed to download invoice PDF');
  }

  const blob = await res.blob();
  const isNative = Capacitor.isNativePlatform && Capacitor.isNativePlatform();

  if (isNative) {
    try {
      // Convert blob to base64 for native platforms
      const reader = new FileReader();
      const base64Data = await new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1]; // Remove data:application/pdf;base64, prefix
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const fileName = `invoice-${orderId}-${Date.now()}.pdf`;

      // Write file to device
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Documents,
      });

      console.log('File saved to:', savedFile.uri);

      // Share the file (opens share dialog on mobile)
      await Share.share({
        title: `Invoice ${orderId}`,
        text: `Invoice for order ${orderId}`,
        url: savedFile.uri,
        dialogTitle: 'Share Invoice',
      });

      console.log('Invoice downloaded and shared successfully');
    } catch (error) {
      console.error('Error saving/sharing PDF:', error);
      throw new Error('Failed to download invoice: ' + error.message);
    }
  } else {
    // Normal browser - open in new tab
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 10000);
  }
}
