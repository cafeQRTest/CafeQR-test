// utils/exportExpenses.js
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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
  const startStr = range.start.toISOString().slice(0, 10);
  const endStr = range.end.toISOString().slice(0, 10);

  const header = ['Date', 'Category', 'Description', 'Payment Method', 'Amount'];
  const rows = [header];

  (expenses || []).forEach((e) => {
    rows.push([
      e.expense_date,
      e.category?.name || 'Uncategorized',
      e.description || '',
      e.payment_method || '',
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
  const fileName = `EXPENSES_${range.start
    .toISOString()
    .slice(0, 10)}_${range.end.toISOString().slice(0, 10)}.csv`;

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
