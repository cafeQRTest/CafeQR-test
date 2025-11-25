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

function buildExpensesCsv({ range, summary, expenses }) {
  const startStr = range.start.toISOString().slice(0, 10);
  const endStr = range.end.toISOString().slice(0, 10);

  const header = [
    'Date',
    'Category',
    'Description',
    'Payment Method',
    'Amount',
  ];

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

  rows.push([]);
  rows.push(['Summary for period', `${startStr} to ${endStr}`]);
  rows.push([
    'Gross Sales',
    '',
    '',
    '',
    Number(summary.grossSales || 0).toFixed(2),
  ]);
  rows.push([
    'Total Expenses',
    '',
    '',
    '',
    Number(summary.totalExpenses || 0).toFixed(2),
  ]);
  rows.push([
    'Net Profit (Accrual)',
    '',
    '',
    '',
    Number(summary.grossSales - summary.totalExpenses || 0).toFixed(2),
  ]);

  return rows.map((r) => r.map(toCsvValue).join(',')).join('\r\n');
}

// Public API used by the page
export async function exportExpensesToCSV({ range, summary, expenses }) {
  const csv = buildExpensesCsv({ range, summary, expenses });
  const fileName = `EXPENSES_${range.start.toISOString().slice(0, 10)}_${range.end
    .toISOString()
    .slice(0, 10)}.csv`;

  // Native path: Capacitor Android/iOS
  if (Capacitor.isNativePlatform()) {
    const path = `CafeQR/${fileName}`;
    try {
      // 1. Write the file into Documents/CafeQR
      await Filesystem.writeFile({
        directory: Directory.Documents,
        path,
        data: csv,
        encoding: 'utf8',
      });

      // 2. Get a shareable URI
      const uriResult = await Filesystem.getUri({
        directory: Directory.Documents,
        path,
      });

      // 3. Open system share sheet so user can save/send it
      await Share.share({
        title: 'Cafe QR expenses export',
        text: 'Expenses CSV from Cafe QR',
        url: uriResult.uri,
      });

      return true;
    } catch (err) {
      console.error('Native CSV export failed', err);
      return false;
    }
  }

  // Web path: desktop browser / PWA
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
