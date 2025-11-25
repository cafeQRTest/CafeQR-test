import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

// Helper functions (same as printUtils)
function center(str, width) {
  if (str.length > width) str = str.substring(0, width)
  const padding = Math.max(0, Math.floor((width - str.length) / 2))
  return ' '.repeat(padding) + str
}

function leftAlign(str, width) {
  if (str.length > width) return str.substring(0, width)
  return str.padEnd(width)
}

function rightAlign(str, width) {
  if (str.length > width) return str.substring(0, width)
  return str.padStart(width)
}

export async function printSalesReport(data) {
  const {
    range,
    summaryStats,
    salesData,
    paymentBreakdown,
    orderTypeBreakdown,
    taxBreakdown,
    hourlyBreakdown,
    categoryBreakdown,
    restaurantProfile
  } = data

  const W = 48 // Width for 2" thermal printer
  const dashes = () => '='.repeat(W)
  const lines = []

  // HEADER
  const restaurantName = (restaurantProfile?.restaurant_name || 'RESTAURANT').toUpperCase()
  lines.push(dashes())
  lines.push(center('SALES REPORT', W))
  lines.push(dashes())
  lines.push(center(restaurantName, W))
  lines.push('')
  lines.push(`Period: ${range.start.toLocaleDateString('en-IN')} to`)
  lines.push(`        ${range.end.toLocaleDateString('en-IN')}`)
  lines.push('')
  lines.push(dashes())
  
  // SUMMARY
  lines.push('SUMMARY')
  lines.push(dashes())
  lines.push(`Total Orders: ${summaryStats.totalOrders}`)
  lines.push(`Total Revenue: ₹${summaryStats.totalRevenue.toFixed(2)}`)
  lines.push(`Avg Order: ₹${summaryStats.avgOrderValue.toFixed(2)}`)
  lines.push(`Items Sold: ${summaryStats.totalItems}`)
  lines.push(`Total Tax: ₹${summaryStats.totalTax.toFixed(2)}`)
  lines.push('')

  // TAX BREAKDOWN
  lines.push(dashes())
  lines.push('TAX BREAKDOWN')
  lines.push(dashes())
  taxBreakdown.forEach(t => {
    lines.push(`${leftAlign(t.tax_type, 20)} ₹${t.amount.toFixed(2)}`)
  })
  lines.push('')

  // PAYMENT METHODS
  lines.push(dashes())
  lines.push('PAYMENT METHODS')
  lines.push(dashes())
  paymentBreakdown.forEach(p => {
    lines.push(`${leftAlign(p.payment_method, 20)} ${p.order_count} orders`)
    lines.push(`${' '.repeat(20)} ₹${p.total_amount.toFixed(2)} (${p.percentage}%)`)
  })
  lines.push('')

  // ORDER TYPES
  lines.push(dashes())
  lines.push('ORDER TYPES')
  lines.push(dashes())
  orderTypeBreakdown.forEach(o => {
    lines.push(`${leftAlign(o.order_type, 20)} ${o.order_count} orders`)
    lines.push(`${' '.repeat(20)} ₹${o.total_amount.toFixed(2)} (${o.percentage}%)`)
  })
  lines.push('')

  // TOP 20 ITEMS
  lines.push(dashes())
  lines.push('TOP ITEMS')
  lines.push(dashes())
  salesData.slice(0, 20).forEach((item, idx) => {
    lines.push(`${idx + 1}. ${leftAlign(item.item_name, 30)}`)
    lines.push(`   Qty: ${item.quantity_sold}  Rev: ₹${item.revenue.toFixed(2)}`)
  })
  lines.push('')

  // CATEGORIES
  lines.push(dashes())
  lines.push('CATEGORIES')
  lines.push(dashes())
  categoryBreakdown.forEach(c => {
    lines.push(`${leftAlign(c.category, 25)} ${c.percentage}%`)
    lines.push(`${' '.repeat(25)} ₹${c.total_amount.toFixed(2)}`)
  })
  lines.push('')

  // HOURLY (if data exists)
  if (hourlyBreakdown.length > 0) {
    lines.push(dashes())
    lines.push('HOURLY BREAKDOWN')
    lines.push(dashes())
    hourlyBreakdown.forEach(h => {
      lines.push(`${h.hour}  ${h.order_count} orders  ₹${h.total_amount.toFixed(2)}`)
    })
    lines.push('')
  }

  // FOOTER
  lines.push(dashes())
  lines.push(center('END OF REPORT', W))
  lines.push(dashes())
  lines.push('')


  // Try Web Share API
  const text = lines.join('\n');

  // Native (APK) → use Capacitor Share so user can send to printer app / Files, etc.
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title: `Sales-Report-${Date.now()}`,
        text,
      });
      return { success: true, method: 'native-share' };
    } catch (err) {
      console.error('Native share failed', err);
      // fall through to web fallback below
    }
  }

  // Web Share API (PWA / browser)
  if (navigator.canShare && navigator.canShare({ text })) {
    try {
      await navigator.share({
        title: `Sales-Report-${Date.now()}`,
        text,
      });
      return { success: true, method: 'web-share' };
    } catch (err) {
      console.log('Share cancelled or failed', err);
    }
  }

  // Fallback to download as .txt
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Sales-Report-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { success: true, method: 'download' };
}
