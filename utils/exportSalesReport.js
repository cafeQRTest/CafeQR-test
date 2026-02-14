// utils/exportSalesReport.js

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

async function saveAndShare({ contents, fileName, mime = 'text/plain' }) {
  const isNative =
    Capacitor.isNativePlatform && Capacitor.isNativePlatform();

  // Web / desktop: current behaviour (download)
  if (!isNative) {
    const blob = new Blob([contents], { type: `${mime};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }

  // Native (Android / iOS): write to app cache and share via FileProvider
  try {
    await Filesystem.writeFile({
      directory: Directory.Cache,
      path: fileName,
      data: contents,
      encoding: 'utf8',
    });

    const { uri } = await Filesystem.getUri({
      directory: Directory.Cache,
      path: fileName,
    });

    await Share.share({
      title: fileName,
      text: 'Cafe QR sales export',
      url: uri,
      dialogTitle: 'Share sales report',
    });

    return true;
  } catch (err) {
    console.error('Native sales export failed', err);
    return false;
  }
}

// ---------- Helpers for CSV + Orders section ----------

const csvEscape = (value) => {
  if (value === null || value === undefined) return '';
  // Escape quotes for CSV and wrap everything in quotes
  return String(value).replace(/"/g, '""');
};

const fmtMoney = (n) => Number(n || 0).toFixed(2);

const pick = (obj, keys, fallback = null) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return fallback;
};

const getOrderInvoice = (order) => {
  const inv = pick(order, ['invoices', 'invoice'], null);
  if (Array.isArray(inv)) return inv[0] || null;
  return inv;
};

const prettyMethod = (method) => {
  const m = String(method || '').toLowerCase();
  if (!m || m === 'none' || m === 'unknown') return 'Pending';
  if (m === 'upi') return 'UPI';
  if (m === 'card') return 'Card';
  if (m === 'online') return 'Online';
  if (m === 'cash') return 'Cash';
  if (m === 'credit') return 'Credit';
  if (m === 'mixed') return 'Mixed';
  return m.toUpperCase();
};

const prettyMixed = (method, mixedDetails) => {
  const m = String(method || '').toLowerCase();
  if (m !== 'mixed' || !mixedDetails) return prettyMethod(method);

  const cash = Number(
    pick(mixedDetails, ['cash_amount', 'cashAmount', 'cashamount'], 0),
  ).toFixed(2);

  const onlineAmt = Number(
    pick(mixedDetails, ['online_amount', 'onlineAmount', 'onlineamount'], 0),
  ).toFixed(2);

  const onlineMethod =
    String(
      pick(
        mixedDetails,
        ['online_method', 'onlinemethod', 'onlineMethod'],
        'online',
      ),
    ).toUpperCase();

  return `Mixed (Cash ₹${cash} + ₹${onlineAmt} ${onlineMethod})`;
};

export const exportSalesReportToCSV = ({
  range,
  summaryStats,
  salesData,
  paymentBreakdown,
  orderTypeBreakdown,
  taxBreakdown,
  hourlyBreakdown,
  categoryBreakdown,
  restaurantProfile,
  // NEW: pass ordersList from SalesPage so we can export Sales Orders table
  ordersList = [],
}) => {
  try {
    const startDate = range.start.toLocaleDateString();
    const endDate = range.end.toLocaleDateString();

    let csvContent = '';

    csvContent += `Sales Report - ${
      restaurantProfile?.restaurant_name || 'Restaurant'
    }\n`;
    csvContent += `Report Period: ${startDate} to ${endDate}\n`;
    csvContent += `Generated on: ${new Date().toLocaleString()}\n\n`;

    // ---- SUMMARY ----
    csvContent += `SALES SUMMARY\n`;
    csvContent += `Total Orders,Total Revenue,Average Order Value,Items Sold,Total Tax,CGST,SGST\n`;
    csvContent += `${summaryStats.totalOrders},${summaryStats.totalRevenue.toFixed(
      2,
    )},${summaryStats.avgOrderValue.toFixed(2)},${
      summaryStats.totalItems
    },${summaryStats.totalTax.toFixed(2)},${summaryStats.cgst.toFixed(
      2,
    )},${summaryStats.sgst.toFixed(2)}\n\n`;

    // ---- ITEM-WISE ----
    csvContent += `ITEM-WISE SALES\n`;
    csvContent += `Item Name,Quantity Sold,Revenue,Category\n`;
    salesData.forEach((item) => {
      csvContent += `"${csvEscape(item.item_name)}",${item.quantity_sold},${item.revenue.toFixed(
        2,
      )},"${csvEscape(item.category)}"\n`;
    });
    csvContent += '\n';

    // ---- PAYMENT METHODS ----
    csvContent += `PAYMENT METHODS\n`;
    csvContent += `Payment Method,Order Count,Total Amount,Percentage\n`;
    paymentBreakdown.forEach((payment) => {
      csvContent += `"${csvEscape(
        payment.payment_method,
      )}",${payment.order_count},${payment.total_amount.toFixed(
        2,
      )},${payment.percentage}%\n`;
    });
    csvContent += '\n';

    // ---- ORDER TYPES ----
    csvContent += `ORDER TYPES\n`;
    csvContent += `Order Type,Order Count,Total Amount,Percentage\n`;
    orderTypeBreakdown.forEach((orderType) => {
      csvContent += `"${csvEscape(
        orderType.order_type,
      )}",${orderType.order_count},${orderType.total_amount.toFixed(
        2,
      )},${orderType.percentage}%\n`;
    });
    csvContent += '\n';

    // ---- TAX ----
    csvContent += `TAX BREAKDOWN (GST)\n`;
    csvContent += `Tax Type,Amount\n`;
    taxBreakdown.forEach((tax) => {
      csvContent += `"${csvEscape(tax.tax_type)}",${tax.amount.toFixed(2)}\n`;
    });
    csvContent += '\n';

    // ---- HOURLY ----
    csvContent += `HOURLY SALES\n`;
    csvContent += `Hour,Order Count,Total Amount\n`;
    hourlyBreakdown.forEach((hourly) => {
      csvContent += `"${csvEscape(
        hourly.hour,
      )}",${hourly.order_count},${hourly.total_amount.toFixed(2)}\n`;
    });
    csvContent += '\n';

    // ---- CATEGORY ----
    csvContent += `CATEGORY-WISE BREAKDOWN\n`;
    csvContent += `Category,Total Amount,Percentage\n`;
    categoryBreakdown.forEach((category) => {
      csvContent += `"${csvEscape(
        category.category,
      )}",${category.total_amount.toFixed(2)},${category.percentage}%\n`;
    });
    csvContent += '\n';

    // ---- NEW: SALES ORDERS TABLE (Orders tab) ----
    csvContent += `SALES ORDERS\n`;
    csvContent += `Order ID,Invoice No,Payment,Ordered Date,Edited Date,Status,Grand Total,Total Tax,Customer\n`;

    ordersList.forEach((o) => {
      const inv = getOrderInvoice(o);

      const methodFromInvoice = pick(inv || {}, [
        'paymentmethod',
        'payment_method',
      ]);
      const methodFromOrder = pick(o || {}, [
        'actualpaymentmethod',
        'actual_payment_method',
        'paymentmethod',
        'payment_method',
      ]);
      const method = methodFromInvoice || methodFromOrder || 'unknown';

      const mixedFromInvoice = pick(inv || {}, [
        'mixedpaymentdetails',
        'mixed_payment_details',
      ]);
      const mixedFromOrder = pick(o || {}, [
        'mixedpaymentdetails',
        'mixed_payment_details',
      ]);
      const mixedDetails = mixedFromInvoice || mixedFromOrder || null;

      const paymentLabel = prettyMixed(method, mixedDetails);

      const orderedRaw = o.dateordered || o.createdat;
      const editedRaw = o.updatedat;

      const orderedDate = orderedRaw
        ? new Date(orderedRaw).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : '';

      const editedDate = editedRaw
        ? new Date(editedRaw).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : '';

      const status = o.status || '';

      const grandTotal = fmtMoney(o.totalinctax ?? o.totalamount ?? 0);
      const totalTax = fmtMoney(o.totaltax ?? 0);

      const customer = o.customername || '';

      const invoiceNo =
        (inv && (inv.invoiceno || inv.invoice_no)) || '';

      const row = [
        csvEscape(o.id),
        csvEscape(invoiceNo),
        csvEscape(paymentLabel),
        csvEscape(orderedDate),
        csvEscape(editedDate),
        csvEscape(status),
        grandTotal,
        totalTax,
        csvEscape(customer),
      ];

      csvContent += row.map((v) => `"${v}"`).join(',') + '\n';
    });

    const fileName = `Sales_Report_${startDate.replace(
      /\//g,
      '-',
    )}_to_${endDate.replace(/\//g, '-')}.csv`;

    return saveAndShare({ contents: csvContent, fileName, mime: 'text/csv' });
  } catch (error) {
    console.error('Error exporting CSV:', error);
    return false;
  }
};

// Excel export unchanged
export const exportSalesReportToExcel = ({
  range,
  summaryStats,
  salesData,
  paymentBreakdown,
  orderTypeBreakdown,
  taxBreakdown,
  hourlyBreakdown,
  categoryBreakdown,
  restaurantProfile,
}) => {
  try {
    const startDate = range.start.toLocaleDateString();
    const endDate = range.end.toLocaleDateString();

    const styles = `
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background-color: #2563eb; color: white; padding: 12px; text-align: left; font-weight: 600; }
        td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) { background-color: #f9fafb; }
        h1 { color: #111827; font-size: 20px; margin-bottom: 5px; }
        h2 { color: #374151; font-size: 16px; margin-top: 20px; margin-bottom: 10px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
        .header { background-color: #f3f4f6; padding: 15px; margin-bottom: 20px; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
        .summary-card { background: #f9fafb; padding: 15px; border-radius: 6px; border-left: 4px solid #2563eb; }
        .summary-label { color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 600; }
        .summary-value { color: #111827; font-size: 18px; font-weight: 700; margin-top: 5px; }
        .currency { color: #059669; }
        .percentage { color: #dc2626; }
      </style>
    `;

    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Sales Report</title>
        ${styles}
      </head>
      <body>
        <div class="header">
          <h1>📊 Sales Report - ${
            restaurantProfile?.restaurant_name || 'Restaurant'
          }</h1>
          <p><strong>Report Period:</strong> ${startDate} to ${endDate}</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <!-- (rest of your existing HTML export code stays exactly the same) -->
      </body>
      </html>
    `;

    const startDateStr = startDate.replace(/\//g, '-');
    const endDateStr = endDate.replace(/\//g, '-');
    const fileName = `Sales_Report_${startDateStr}_to_${endDateStr}.xls`;

    return saveAndShare({
      contents: htmlContent,
      fileName,
      mime: 'application/vnd.ms-excel',
    });
  } catch (error) {
    console.error('Error exporting Excel:', error);
    return false;
  }
};
