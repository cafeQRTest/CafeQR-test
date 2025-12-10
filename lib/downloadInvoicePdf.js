import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function downloadInvoicePdf(orderId) {
  const res = await fetch(
    `/api/invoices/download?order_id=${encodeURIComponent(orderId)}`
  );
  if (!res.ok) {
    throw new Error('Failed to download invoice PDF');
  }

  const blob = await res.blob();
  const isNative = Capacitor.isNativePlatform && Capacitor.isNativePlatform();

  if (isNative) {
    try {
      // Convert blob -> base64
      const reader = new FileReader();
      const base64Data = await new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result || '';
          const str = typeof result === 'string' ? result : '';
          const base64 = str.split(',')[1] || '';
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const fileName = `invoice-${orderId}-${Date.now()}.pdf`;

      // Save into app-internal data directory (works on all Android versions)
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Data,
      });

      // Share / open via system share sheet
      await Share.share({
        title: `Invoice ${orderId}`,
        text: `Invoice for order ${orderId}`,
        url: savedFile.uri,
        dialogTitle: 'Share Invoice',
      });
    } catch (error) {
      console.error('Error saving/sharing PDF:', error);
      throw new Error('Failed to download invoice: ' + (error.message || 'Unknown error'));
    }
  } else {
    // Web: open in a new tab like today
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  }
}
