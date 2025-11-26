// utils/exportProductionReport.js
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

async function saveAndShareText({ contents, fileName }) {
  if (!Capacitor.isNativePlatform()) {
    // Web browser: Blob + download
    const blob = new Blob([contents], { type: 'text/plain;charset=utf-8;' });
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

  try {
    const path = `CafeQR/${fileName}`;
    await Filesystem.writeFile({
      directory: Directory.Documents,
      path,
      data: contents,
      encoding: 'utf8',
    });
    const { uri } = await Filesystem.getUri({ directory: Directory.Documents, path });
    await Share.share({
      title: fileName,
      text: 'Cafe QR production export',
      url: uri,
    });
    return true;
  } catch (err) {
    console.error('Native production export failed', err);
    return false;
  }
}

export const exportProductionToCSV = ({
  alert(
    `Capacitor debug: platform=${Capacitor.getPlatform?.() || 'none'}, ` +
    `isNative=${Capacitor.isNativePlatform?.()}`
  );
  date,
  restaurantName,
  productionRecords,
  balanceReport,
}) => {
  try {
    const dateStr = new Date(date).toLocaleDateString();

    let csvContent = '';

    csvContent += `Production Report - ${restaurantName}\n`;
    csvContent += `Date: ${dateStr}\n`;
    csvContent += `Generated: ${new Date().toLocaleString()}\n\n`;

    if (productionRecords.length > 0) {
      csvContent += `PRODUCTION RECORDS\n`;
      csvContent += `Shift,Item,Quantity Produced,Cost/Unit,Total Cost\n`;

      productionRecords.forEach((record) => {
        record.items?.forEach((item) => {
          const totalCost =
            item.quantity_produced * (item.cost_per_unit || 0);
          csvContent += `${record.shift},${item.item_name},${item.quantity_produced},${
            item.cost_per_unit || 0
          },${totalCost.toFixed(2)}\n`;
        });
      });
      csvContent += '\n';
    }

    if (balanceReport.length > 0) {
      csvContent += `ITEM BALANCE REPORT\n`;
      csvContent += `Item,Produced,Sold,Balance,Status\n`;

      balanceReport.forEach((item) => {
        csvContent += `"${item.item_name}",${item.produced},${item.sold},${item.balance},"${item.wasteStatus}"\n`;
      });
      csvContent += '\n';

      const totalProduced = balanceReport.reduce(
        (sum, item) => sum + item.produced,
        0
      );
      const totalSold = balanceReport.reduce(
        (sum, item) => sum + item.sold,
        0
      );
      const totalBalance = balanceReport.reduce(
        (sum, item) => sum + item.balance,
        0
      );

      csvContent += `SUMMARY\n`;
      csvContent += `Total Produced,Total Sold,Total Balance\n`;
      csvContent += `${totalProduced},${totalSold},${totalBalance}\n`;
    }

    const fileName = `Production_Report_${dateStr.replace(/\//g, '-')}.csv`;
    return saveAndShareText({ contents: csvContent, fileName });
  } catch (error) {
    console.error('Error exporting CSV:', error);
    return false;
  }
};

export const exportProductionToExcel = ({
  alert(
    `Capacitor debug: platform=${Capacitor.getPlatform?.() || 'none'}, ` +
    `isNative=${Capacitor.isNativePlatform?.()}`
  );
  date,
  restaurantName,
  productionRecords,
  balanceReport,
}) => {
  try {
    const dateStr = new Date(date).toLocaleDateString();

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
        .summary { background-color: #f0fdf4; padding: 12px; border-left: 4px solid #10b981; margin-top: 16px; }
        .summary-item { margin: 8px 0; }
      </style>
    `;

    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Production Report</title>
        ${styles}
      </head>
      <body>
        <div class="header">
          <h1>🏭 Production Report - ${restaurantName}</h1>
          <p><strong>Date:</strong> ${dateStr}</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>
    `;

    if (productionRecords.length > 0) {
      htmlContent += `
        <h2>Production Records</h2>
        <table>
          <thead>
            <tr>
              <th>Shift</th>
              <th>Item</th>
              <th>Produced</th>
              <th>Cost/Unit</th>
              <th>Total Cost</th>
            </tr>
          </thead>
          <tbody>
      `;

      productionRecords.forEach((record) => {
        record.items?.forEach((item) => {
          const totalCost =
            item.quantity_produced * (item.cost_per_unit || 0);
          htmlContent += `
            <tr>
              <td style="text-transform: capitalize;">${record.shift}</td>
              <td>${item.item_name}</td>
              <td style="text-align: center; font-weight: 500;">${item.quantity_produced}</td>
              <td style="text-align: right;">₹${(item.cost_per_unit || 0).toFixed(2)}</td>
              <td style="text-align: right; font-weight: 600;">₹${totalCost.toFixed(2)}</td>
            </tr>
          `;
        });
      });

      htmlContent += `
          </tbody>
        </table>
      `;
    }

    if (balanceReport.length > 0) {
      htmlContent += `
        <h2>Item Balance Report</h2>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Produced</th>
              <th>Sold</th>
              <th>Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
      `;

      balanceReport.forEach((item) => {
        const balanceColor =
          item.balance < 0
            ? '#dc2626'
            : item.balance === 0
            ? '#059669'
            : '#f59e0b';
        htmlContent += `
          <tr>
            <td>${item.item_name}</td>
            <td style="text-align: center;">${item.produced}</td>
            <td style="text-align: center; color: #3b82f6;">${item.sold}</td>
            <td style="text-align: center; font-weight: 600; color: ${balanceColor};">
              ${item.balance}
            </td>
            <td style="font-size: 12px;">${item.wasteStatus}</td>
          </tr>
        `;
      });

      const totalProduced = balanceReport.reduce(
        (sum, item) => sum + item.produced,
        0
      );
      const totalSold = balanceReport.reduce(
        (sum, item) => sum + item.sold,
        0
      );
      const totalBalance = balanceReport.reduce(
        (sum, item) => sum + item.balance,
        0
      );

      htmlContent += `
          </tbody>
        </table>

        <div class="summary">
          <h3 style="margin-top: 0;">Summary</h3>
          <div class="summary-item"><strong>Total Produced:</strong> ${totalProduced} units</div>
          <div class="summary-item"><strong>Total Sold:</strong> ${totalSold} units</div>
          <div class="summary-item"><strong>Total Remaining:</strong> ${totalBalance} units</div>
        </div>
      `;
    }

    htmlContent += `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p>✓ Generated by CafeQR Production Management System</p>
          <p>This is a confidential business document.</p>
        </div>
      </body>
      </html>
    `;

    const fileName = `Production_Report_${dateStr.replace(/\//g, '-')}.xls`;
    return saveAndShareText({ contents: htmlContent, fileName });
  } catch (error) {
    console.error('Error exporting Excel:', error);
    return false;
  }
};
