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
  const isNative =
    Capacitor.isNativePlatform && Capacitor.isNativePlatform();

  if (isNative) {
    try {
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

      // 1) Save PDF into app cache
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
      });

      // 2) Get FileProvider-backed URI
      const { uri } = await Filesystem.getUri({
        directory: Directory.Cache,
        path: fileName,
      });

      // 3) Share / open
      await Share.share({
        title: `Invoice ${orderId}`,
        text: `Invoice for order ${orderId}`,
        url: uri,
        dialogTitle: 'Share Invoice',
      });
    } catch (error) {
      console.error('Error saving/sharing PDF:', error);
      throw new Error(
        'Failed to download invoice: ' +
          (error && error.message ? error.message : 'Unknown error')
      );
    }
  } else {
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  }
}
