// utils/exportSalesReport.js

// utils/exportSalesReport.js - UPDATED CSV FUNCTION ONLY

export const exportSalesReportToCSV = ({
  range,
  summaryStats,
  salesData,
  paymentBreakdown,
  orderTypeBreakdown,
  taxBreakdown,
  hourlyBreakdown,
  categoryBreakdown,
  restaurantProfile
}) => {
  try {
    const startDate = range.start.toLocaleDateString()
    const endDate = range.end.toLocaleDateString()
    
    let csvContent = ''

    // Header with Restaurant Info
    csvContent += `Sales Report - ${restaurantProfile?.restaurant_name || 'Restaurant'}\n`
    csvContent += `Report Period: ${startDate} to ${endDate}\n`
    csvContent += `Generated on: ${new Date().toLocaleString()}\n`
    csvContent += '\n'

    // Summary Stats Section (WITHOUT RUPEE SYMBOL)
    csvContent += `SALES SUMMARY\n`
    csvContent += `Total Orders,Total Revenue,Average Order Value,Items Sold,Total Tax,CGST,SGST\n`
    csvContent += `${summaryStats.totalOrders},${summaryStats.totalRevenue.toFixed(2)},${summaryStats.avgOrderValue.toFixed(2)},${summaryStats.totalItems},${summaryStats.totalTax.toFixed(2)},${summaryStats.cgst.toFixed(2)},${summaryStats.sgst.toFixed(2)}\n`
    csvContent += '\n'

    // Item-wise Sales (WITHOUT RUPEE SYMBOL)
    csvContent += `ITEM-WISE SALES\n`
    csvContent += `Item Name,Quantity Sold,Revenue,Category\n`
    salesData.forEach(item => {
      csvContent += `"${item.item_name}",${item.quantity_sold},${item.revenue.toFixed(2)},${item.category}\n`
    })
    csvContent += '\n'

    // Payment Methods Breakdown (WITHOUT RUPEE SYMBOL)
    csvContent += `PAYMENT METHODS\n`
    csvContent += `Payment Method,Order Count,Total Amount,Percentage\n`
    paymentBreakdown.forEach(payment => {
      csvContent += `${payment.payment_method},${payment.order_count},${payment.total_amount.toFixed(2)},${payment.percentage}%\n`
    })
    csvContent += '\n'

    // Order Types Breakdown (WITHOUT RUPEE SYMBOL)
    csvContent += `ORDER TYPES\n`
    csvContent += `Order Type,Order Count,Total Amount,Percentage\n`
    orderTypeBreakdown.forEach(orderType => {
      csvContent += `${orderType.order_type},${orderType.order_count},${orderType.total_amount.toFixed(2)},${orderType.percentage}%\n`
    })
    csvContent += '\n'

    // Tax Breakdown (WITHOUT RUPEE SYMBOL)
    csvContent += `TAX BREAKDOWN (GST)\n`
    csvContent += `Tax Type,Amount\n`
    taxBreakdown.forEach(tax => {
      csvContent += `${tax.tax_type},${tax.amount.toFixed(2)}\n`
    })
    csvContent += '\n'

    // Hourly Sales (WITHOUT RUPEE SYMBOL)
    csvContent += `HOURLY SALES\n`
    csvContent += `Hour,Order Count,Total Amount\n`
    hourlyBreakdown.forEach(hourly => {
      csvContent += `${hourly.hour},${hourly.order_count},${hourly.total_amount.toFixed(2)}\n`
    })
    csvContent += '\n'

    // Category Breakdown (WITHOUT RUPEE SYMBOL)
    csvContent += `CATEGORY-WISE BREAKDOWN\n`
    csvContent += `Category,Total Amount,Percentage\n`
    categoryBreakdown.forEach(category => {
      csvContent += `"${category.category}",${category.total_amount.toFixed(2)},${category.percentage}%\n`
    })

    // Create Blob and Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    const fileName = `Sales_Report_${startDate.replace(/\//g, '-')}_to_${endDate.replace(/\//g, '-')}.csv`
    link.setAttribute('href', url)
    link.setAttribute('download', fileName)
    link.style.visibility = 'hidden'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    return true
  } catch (error) {
    console.error('Error exporting CSV:', error)
    return false
  }
}

// Export to Excel (Formatted HTML)
export const exportSalesReportToExcel = ({
  range,
  summaryStats,
  salesData,
  paymentBreakdown,
  orderTypeBreakdown,
  taxBreakdown,
  hourlyBreakdown,
  categoryBreakdown,
  restaurantProfile
}) => {
  try {
    const startDate = range.start.toLocaleDateString()
    const endDate = range.end.toLocaleDateString()
    
    // Base styling matching your globals
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
    `

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
          <h1>📊 Sales Report - ${restaurantProfile?.restaurant_name || 'Restaurant'}</h1>
          <p><strong>Report Period:</strong> ${startDate} to ${endDate}</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <h2>Summary Statistics</h2>
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">Total Orders</div>
            <div class="summary-value">${summaryStats.totalOrders}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Total Revenue</div>
            <div class="summary-value currency">₹${summaryStats.totalRevenue.toFixed(2)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Average Order</div>
            <div class="summary-value currency">₹${summaryStats.avgOrderValue.toFixed(2)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Items Sold</div>
            <div class="summary-value">${summaryStats.totalItems}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Total Tax</div>
            <div class="summary-value currency">₹${summaryStats.totalTax.toFixed(2)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">CGST / SGST</div>
            <div class="summary-value currency">₹${summaryStats.cgst.toFixed(2)} / ₹${summaryStats.sgst.toFixed(2)}</div>
          </div>
        </div>

        <h2>Item-wise Sales</h2>
        <table>
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Revenue</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            ${salesData.map(item => `
              <tr>
                <td>${item.item_name}</td>
                <td align="center">${item.quantity_sold}</td>
                <td class="currency">₹${item.revenue.toFixed(2)}</td>
                <td>${item.category}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Payment Methods</h2>
        <table>
          <thead>
            <tr>
              <th>Payment Method</th>
              <th>Order Count</th>
              <th>Total Amount</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            ${paymentBreakdown.map(payment => `
              <tr>
                <td>${payment.payment_method}</td>
                <td align="center">${payment.order_count}</td>
                <td class="currency">₹${payment.total_amount.toFixed(2)}</td>
                <td class="percentage">${payment.percentage}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Order Types</h2>
        <table>
          <thead>
            <tr>
              <th>Order Type</th>
              <th>Order Count</th>
              <th>Total Amount</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            ${orderTypeBreakdown.map(orderType => `
              <tr>
                <td>${orderType.order_type}</td>
                <td align="center">${orderType.order_count}</td>
                <td class="currency">₹${orderType.total_amount.toFixed(2)}</td>
                <td class="percentage">${orderType.percentage}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Tax Breakdown (GST)</h2>
        <table>
          <thead>
            <tr>
              <th>Tax Type</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${taxBreakdown.map(tax => `
              <tr>
                <td>${tax.tax_type}</td>
                <td class="currency">₹${tax.amount.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Hourly Sales Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Hour</th>
              <th>Order Count</th>
              <th>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${hourlyBreakdown.map(hourly => `
              <tr>
                <td>${hourly.hour}</td>
                <td align="center">${hourly.order_count}</td>
                <td class="currency">₹${hourly.total_amount.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <h2>Category-wise Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Total Amount</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            ${categoryBreakdown.map(category => `
              <tr>
                <td>${category.category}</td>
                <td class="currency">₹${category.total_amount.toFixed(2)}</td>
                <td class="percentage">${category.percentage}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p>✓ Generated by CafeQR Sales Report System</p>
          <p>This is a confidential business document.</p>
        </div>
      </body>
      </html>
    `

    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    const startDateStr = startDate.replace(/\//g, '-')
    const endDateStr = endDate.replace(/\//g, '-')
    const fileName = `Sales_Report_${startDateStr}_to_${endDateStr}.xls`
    
    link.setAttribute('href', url)
    link.setAttribute('download', fileName)
    link.style.visibility = 'hidden'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    return true
  } catch (error) {
    console.error('Error exporting Excel:', error)
    return false
  }
}
