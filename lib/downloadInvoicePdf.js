import { Capacitor } from '@capacitor/core';

export async function downloadInvoicePdf(orderId) {
  const res = await fetch(`/api/invoices/download?order_id=${encodeURIComponent(orderId)}`);
  if (!res.ok) {
    throw new Error('Failed to download invoice PDF');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const isNative = Capacitor.isNativePlatform && Capacitor.isNativePlatform();

  if (isNative) {
    // Native webview: force a real download with an <a download> click
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${orderId}.pdf`;  // filename hint
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    // Normal browser
    window.open(url, '_blank');
  } 

  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 10000);
}
