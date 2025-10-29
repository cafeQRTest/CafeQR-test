// utils/exportProductionReport.js

export const exportProductionToCSV = ({
  date,
  restaurantName,
  productionRecords,
  itemBalances
}) => {
  try {
    const dateStr = new Date(date).toLocaleDateString()
    
    let csvContent = ''
    
    // Header
    csvContent += `Production Report - ${restaurantName}\n`
    csvContent += `Date: ${dateStr}\n`
    csvContent += `Generated: ${new Date().toLocaleString()}\n`
    csvContent += '\n'

    // Production Records Section
    if (productionRecords.length > 0) {
      csvContent += `PRODUCTION RECORDS\n`
      csvContent += `Shift,Item,Quantity Produced,Quantity Transferred\n`
      
      productionRecords.forEach(record => {
        record.production_items?.forEach(item => {
          csvContent += `${record.shift},${item.item_name},${item.quantity_produced},${item.quantity_transferred || 0}\n`
        })
      })
      csvContent += '\n'
    }

    // Balance Report Section
    if (itemBalances.length > 0) {
      csvContent += `ITEM BALANCE REPORT\n`
      csvContent += `Item,Produced,Sold,Transferred,Balance\n`
      
      itemBalances.forEach(item => {
        csvContent += `"${item.item_name}",${item.quantity_produced},${item.quantity_sold},${item.quantity_transferred},${item.quantity_remaining}\n`
      })
      csvContent += '\n'

      // Summary
      const totalProduced = itemBalances.reduce((sum, item) => sum + item.quantity_produced, 0)
      const totalSold = itemBalances.reduce((sum, item) => sum + item.quantity_sold, 0)
      const totalTransferred = itemBalances.reduce((sum, item) => sum + item.quantity_transferred, 0)
      const totalRemaining = itemBalances.reduce((sum, item) => sum + item.quantity_remaining, 0)

      csvContent += `SUMMARY\n`
      csvContent += `Total Produced,Total Sold,Total Transferred,Total Remaining\n`
      csvContent += `${totalProduced},${totalSold},${totalTransferred},${totalRemaining}\n`
    }

    // Create Blob and Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    const fileName = `Production_Report_${dateStr.replace(/\//g, '-')}.csv`
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

export const exportProductionToExcel = ({
  date,
  restaurantName,
  productionRecords,
  itemBalances
}) => {
  try {
    const dateStr = new Date(date).toLocaleDateString()
    
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
    `

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
          <h1>📊 Production Report - ${restaurantName}</h1>
          <p><strong>Date:</strong> ${dateStr}</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>
    `

    // Production Records Section
    if (productionRecords.length > 0) {
      htmlContent += `
        <h2>Production Records</h2>
        <table>
          <thead>
            <tr>
              <th>Shift</th>
              <th>Item</th>
              <th>Produced</th>
              <th>Transferred</th>
            </tr>
          </thead>
          <tbody>
      `

      productionRecords.forEach(record => {
        record.production_items?.forEach(item => {
          htmlContent += `
            <tr>
              <td style="text-transform: capitalize;">${record.shift}</td>
              <td>${item.item_name}</td>
              <td style="text-align: center; font-weight: 500;">${item.quantity_produced}</td>
              <td style="text-align: center; color: #f59e0b;">${item.quantity_transferred || 0}</td>
            </tr>
          `
        })
      })

      htmlContent += `
          </tbody>
        </table>
      `
    }

    // Balance Report Section
    if (itemBalances.length > 0) {
      htmlContent += `
        <h2>Item Balance Report</h2>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Produced</th>
              <th>Sold</th>
              <th>Transferred</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
      `

      itemBalances.forEach(item => {
        const balanceColor = item.quantity_remaining < 0 ? '#dc2626' : '#059669'
        htmlContent += `
          <tr>
            <td>${item.item_name}</td>
            <td style="text-align: center;">${item.quantity_produced}</td>
            <td style="text-align: center; color: #f59e0b;">${item.quantity_sold}</td>
            <td style="text-align: center; color: #3b82f6;">${item.quantity_transferred}</td>
            <td style="text-align: center; font-weight: 600; color: ${balanceColor};">
              ${item.quantity_remaining}
            </td>
          </tr>
        `
      })

      // Summary
      const totalProduced = itemBalances.reduce((sum, item) => sum + item.quantity_produced, 0)
      const totalSold = itemBalances.reduce((sum, item) => sum + item.quantity_sold, 0)
      const totalTransferred = itemBalances.reduce((sum, item) => sum + item.quantity_transferred, 0)
      const totalRemaining = itemBalances.reduce((sum, item) => sum + item.quantity_remaining, 0)

      htmlContent += `
          </tbody>
        </table>

        <div class="summary">
          <h3 style="margin-top: 0;">Summary</h3>
          <div class="summary-item"><strong>Total Produced:</strong> ${totalProduced} units</div>
          <div class="summary-item"><strong>Total Sold:</strong> ${totalSold} units</div>
          <div class="summary-item"><strong>Total Transferred:</strong> ${totalTransferred} units</div>
          <div class="summary-item"><strong>Total Remaining:</strong> ${totalRemaining} units</div>
        </div>
      `
    }

    htmlContent += `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p>✓ Generated by CafeQR Production Management System</p>
          <p>This is a confidential business document.</p>
        </div>
      </body>
      </html>
    `

    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    const fileName = `Production_Report_${dateStr.replace(/\//g, '-')}.xls`
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

export const printProductionReport = ({
  date,
  restaurantName,
  productionRecords,
  itemBalances
}) => {
  try {
    const dateStr = new Date(date).toLocaleDateString()
    
    let printContent = `
      <html>
        <head>
          <title>Production Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .page-break { page-break-after: always; }
            .center { text-align: center; }
          </style>
        </head>
        <body>
          <h1>Production Report</h1>
          <p><strong>Restaurant:</strong> ${restaurantName}</p>
          <p><strong>Date:</strong> ${dateStr}</p>
          <p><strong>Printed:</strong> ${new Date().toLocaleString()}</p>
          
          <h2>Production Records</h2>
          <table>
            <tr>
              <th>Shift</th>
              <th>Item</th>
              <th>Produced</th>
              <th>Transferred</th>
            </tr>
    `

    productionRecords.forEach(record => {
      record.production_items?.forEach(item => {
        printContent += `
          <tr>
            <td>${record.shift}</td>
            <td>${item.item_name}</td>
            <td class="center">${item.quantity_produced}</td>
            <td class="center">${item.quantity_transferred || 0}</td>
          </tr>
        `
      })
    })

    printContent += `
          </table>
          
          <div class="page-break"></div>
          
          <h2>Item Balance Report</h2>
          <table>
            <tr>
              <th>Item</th>
              <th>Produced</th>
              <th>Sold</th>
              <th>Transferred</th>
              <th>Balance</th>
            </tr>
    `

    itemBalances.forEach(item => {
      printContent += `
        <tr>
          <td>${item.item_name}</td>
          <td class="center">${item.quantity_produced}</td>
          <td class="center">${item.quantity_sold}</td>
          <td class="center">${item.quantity_transferred}</td>
          <td class="center">${item.quantity_remaining}</td>
        </tr>
      `
    })

    printContent += `
          </table>
        </body>
      </html>
    `

    const printWindow = window.open('', '', 'height=500,width=900')
    printWindow.document.write(printContent)
    printWindow.document.close()
    printWindow.print()

    return true
  } catch (error) {
    console.error('Error printing report:', error)
    return false
  }
}
