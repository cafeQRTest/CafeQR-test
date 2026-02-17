// utils/exportExpenses.js
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

import { istYmdFromDate } from './istTime';

function toCsvValue(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function prettyCsvMethod(m) {
  if (m === 'none' || m === 'unassigned') return 'Other / Not tagged';
  if (m === 'upi') return 'UPI';
  if (m === 'card') return 'Card';
  if (m === 'online') return 'Online';
  if (m === 'cash') return 'Cash';
  if (m === 'credit') return 'Credit';
  if (m === 'unknown') return 'Unknown';
  return m || 'Other';
}

function buildExpensesCsv({ range, summary, expenses, paymentProfit }) {
  const startStr = istYmdFromDate(range.start);
  const endStr = istYmdFromDate(range.end);

  const header = ['Date', 'Category', 'Description', 'Payment Method', 'Amount'];
  const rows = [header];

  (expenses || []).forEach((e) => {
    const d = new Date(e.expense_date);
    const dateFormatted = d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
    const timeFormatted = d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });

    rows.push([
      `${dateFormatted} ${timeFormatted}`,
      e.category?.name || 'Uncategorized',
      e.description || '',
      prettyCsvMethod(e.payment_method),
      Number(e.amount || 0).toFixed(2),
    ]);
  });

  // Summary section
  rows.push([]);
  rows.push(['Summary for period', `${startStr} to ${endStr}`]);
  rows.push([
    'Gross Sales', '', '', '',
    Number(summary.grossSales || 0).toFixed(2),
  ]);
  rows.push([
    'Total Expenses', '', '', '',
    Number(summary.totalExpenses || 0).toFixed(2),
  ]);
  rows.push([
    'Net Profit (Accrual)', '', '', '',
    Number((summary.grossSales || 0) - (summary.totalExpenses || 0)).toFixed(2),
  ]);

  // Profit by payment method section
  rows.push([]);
  rows.push(['Profit by payment method']);
  rows.push(['Method', 'Sales', 'Expenses', 'Profit']);

  (paymentProfit || []).forEach((row) => {
    rows.push([
      prettyCsvMethod(row.payment_method),
      Number(row.sales_amount || 0).toFixed(2),
      Number(row.expense_amount || 0).toFixed(2),
      Number(row.profit || 0).toFixed(2),
    ]);
  });

  return rows.map((r) => r.map(toCsvValue).join(',')).join('\r\n');
}

// Public API used by the page
export async function exportExpensesToCSV({
  range,
  summary,
  expenses,
  paymentProfit,
}) {
  const csv = buildExpensesCsv({ range, summary, expenses, paymentProfit });
  const startYmd = istYmdFromDate(range.start);
  const endYmd = istYmdFromDate(range.end);
  const fileName = `EXPENSES_${startYmd}_${endYmd}.csv`;

  const isNative =
    Capacitor.isNativePlatform && Capacitor.isNativePlatform();

  if (isNative) {
    try {
      // Write into app cache (matches FileProvider cache-path)
      await Filesystem.writeFile({
        directory: Directory.Cache,
        path: fileName,
        data: csv,
        encoding: 'utf8',
      });

      const { uri } = await Filesystem.getUri({
        directory: Directory.Cache,
        path: fileName,
      });

      await Share.share({
        title: fileName,
        text: 'Expenses CSV from Cafe QR',
        url: uri,
        dialogTitle: 'Share expenses CSV',
      });

      return true;
    } catch (err) {
      console.error('Native CSV export failed', err);
      return false;
    }
  }

  // Web / desktop
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error('Web CSV export failed', e);
    return false;
  }
}
