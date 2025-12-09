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
      // 1) Ensure we have storage permission
      const perm = await Filesystem.checkPermissions();
      if (perm.publicStorage !== 'granted') {
        const req = await Filesystem.requestPermissions();
        if (req.publicStorage !== 'granted') {
          throw new Error('Storage permission was denied');
        }
      }

      // 2) Convert blob -> base64 (pure JS, no type annotations)
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

      // 3) Save into Documents
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Documents,
      });

      // 4) Share / open via system share sheet
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
    // Web: open in a new tab
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  }
}
