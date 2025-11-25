// utils/exportExpenses.js

function toCsvValue(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function exportExpensesToCSV({ range, summary, expenses }) {
  try {
    const startStr = range.start.toISOString().slice(0, 10);
    const endStr = range.end.toISOString().slice(0, 10);

    const header = [
      'Date',
      'Category',
      'Description',
      'Payment Method',
      'Amount'
    ];

    const rows = [header];

    (expenses || []).forEach(e => {
      rows.push([
        e.expense_date,
        e.category?.name || 'Uncategorized',
        e.description || '',
        e.payment_method || '',
        Number(e.amount || 0).toFixed(2)
      ]);
    });

    // Blank line + summary
    rows.push([]);
    rows.push(['Summary for period', `${startStr} to ${endStr}`]);
    rows.push(['Gross Sales', '', '', '', Number(summary.grossSales || 0).toFixed(2)]);
    rows.push(['Total Expenses', '', '', '', Number(summary.totalExpenses || 0).toFixed(2)]);
    rows.push(['Net Profit (Accrual)', '', '', '', Number(summary.grossSales - summary.totalExpenses || 0).toFixed(2)]);

    const csv = rows.map(r => r.map(toCsvValue).join(',')).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EXPENSES_${startStr}_${endStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return true;
  } catch (e) {
    console.error('exportExpensesToCSV error', e);
    return false;
  }
}
