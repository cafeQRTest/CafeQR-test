// lib/downloadInvoicePdf.js
export async function downloadInvoicePdf(orderId) {
  const res = await fetch(`/api/invoices/download?order_id=${encodeURIComponent(orderId)}`)
  if (!res.ok) {
    throw new Error('Failed to download invoice PDF')
  }

  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)

  // Auto-open in new tab instead of forcing download
  window.open(url, '_blank')

  // Optional: revoke after a short delay to avoid revoking before tab loads
  setTimeout(() => {
    window.URL.revokeObjectURL(url)
  }, 10_000)
}
