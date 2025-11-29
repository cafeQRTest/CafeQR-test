// lib/downloadInvoicePdf.js
import { Capacitor } from '@capacitor/core';

export async function downloadInvoicePdf(orderId) {
  const res = await fetch(`/api/invoices/download?order_id=${encodeURIComponent(orderId)}`);
  if (!res.ok) {
    throw new Error('Failed to download invoice PDF');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  if (Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
    // In app: open in same webview (most PDF viewers will handle it)
    window.location.href = url;
  } else {
    // In browser: open new tab
    window.open(url, '_blank');
  }

  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 10000);
}
