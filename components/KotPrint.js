// components/KotPrint.js - COMPLETE ENHANCED VERSION

import React, { useState } from 'react';

function toDisplayItems(order) {
  if (Array.isArray(order.items) && order.items.length) {
    return order.items;
  }
  if (Array.isArray(order.order_items) && order.order_items.length) {
    return order.order_items.map((oi) => ({
      name: oi.menu_items?.name || oi.item_name || 'Item',
      quantity: oi.quantity,
      price: oi.price,
    }));
  }
  return [];
}

// Detect platform capabilities
function getPlatformCapabilities() {
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isWindows = /Windows/i.test(navigator.userAgent);
  const isMac = /Macintosh/i.test(navigator.userAgent);
  const isChrome = /Chrome/i.test(navigator.userAgent);
  const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent);
  
  return {
    hasWebBluetooth: 'bluetooth' in navigator && isChrome && !isIOS,
    hasWebSerial: 'serial' in navigator && isChrome,
    platform: isAndroid ? 'android' : isIOS ? 'ios' : isWindows ? 'windows' : isMac ? 'mac' : 'unknown',
    browser: isChrome ? 'chrome' : isSafari ? 'safari' : 'other'
  };
}

// ESC/POS Commands Generator
function buildESCPOSData(order) {
  const items = toDisplayItems(order);
  let commands = [];
  
  // Initialize printer
  commands.push(0x1B, 0x40); // ESC @ - Initialize
  
  // Center alignment
  commands.push(0x1B, 0x61, 0x01); // ESC a 1 - Center
  
  // Bold + Double height for header
  commands.push(0x1B, 0x21, 0x30); // ESC ! 48 - Bold + Double height
  const header = 'KOT\n';
  commands.push(...Array.from(new TextEncoder().encode(header)));
  
  // Normal text
  commands.push(0x1B, 0x21, 0x00); // ESC ! 0 - Normal
  
  // Left alignment
  commands.push(0x1B, 0x61, 0x00); // ESC a 0 - Left
  
  // Order details
  const orderInfo = [
    `Table: ${order.table_number}\n`,
    `Order: #${order.id?.slice(0, 8)?.toUpperCase()}\n`,
    `Time: ${new Date(order.created_at).toLocaleTimeString()}\n`,
    '================================\n'
  ];
  
  orderInfo.forEach(line => {
    commands.push(...Array.from(new TextEncoder().encode(line)));
  });
  
  // Items
  items.forEach(item => {
    const line = `${item.quantity}x  ${item.name}\n`;
    commands.push(...Array.from(new TextEncoder().encode(line)));
  });
  
  // Footer
  const footer = [
    '================================\n',
    `Printed: ${new Date().toLocaleString()}\n`,
    '\n\n\n' // Paper feed
  ];
  
  footer.forEach(line => {
    commands.push(...Array.from(new TextEncoder().encode(line)));
  });
  
  // Cut paper (if supported)
  commands.push(0x1D, 0x56, 0x00); // GS V 0 - Full cut
  
  return new Uint8Array(commands);
}

export default function KotPrint({ order, onClose, onPrint }) {
  const [printStatus, setPrintStatus] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const capabilities = getPlatformCapabilities();

  // Method 1: Web Bluetooth (Chrome on Android/Desktop)
  const printViaBluetooth = async () => {
    if (!capabilities.hasWebBluetooth) {
      setPrintStatus('Web Bluetooth not supported on this device');
      return;
    }

    setIsConnecting(true);
    setPrintStatus('Connecting to Bluetooth printer...');
    
    try {
      // Request device
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Thermal' },
          { namePrefix: 'POS' },
          { namePrefix: 'POSFLOW' },
          { namePrefix: 'Bluetooth Printer' }
        ],
        optionalServices: [
          '0000ffe0-0000-1000-8000-00805f9b34fb', // Common thermal printer service
          '00001101-0000-1000-8000-00805f9b34fb'  // SPP service
        ]
      });

      setPrintStatus('Connecting to GATT server...');
      const server = await device.gatt.connect();
      
      // Try common service UUIDs
      let service, characteristic;
      try {
        service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
        characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        // Try alternative service
        service = await server.getPrimaryService('00001101-0000-1000-8000-00805f9b34fb');
        const characteristics = await service.getCharacteristics();
        characteristic = characteristics[0]; // Use first available
      }

      setPrintStatus('Sending data to printer...');
      const escposData = buildESCPOSData(order);
      
      // Send data in chunks for better compatibility
      const chunkSize = 20;
      for (let i = 0; i < escposData.length; i += chunkSize) {
        const chunk = escposData.slice(i, i + chunkSize);
        await characteristic.writeValue(chunk);
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      }

      setPrintStatus('Print successful!');
      device.gatt.disconnect();
      
      if (onPrint) onPrint();
      setTimeout(() => onClose?.(), 1500);
      
    } catch (error) {
      console.error('Bluetooth print error:', error);
      setPrintStatus(`Bluetooth Error: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Method 2: Web Serial (Chrome for wired printers)
  const printViaSerial = async () => {
    if (!capabilities.hasWebSerial) {
      setPrintStatus('Web Serial not supported');
      return;
    }

    setIsConnecting(true);
    setPrintStatus('Connecting to USB printer...');
    
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });

      setPrintStatus('Sending data to printer...');
      const writer = port.writable.getWriter();
      const escposData = buildESCPOSData(order);
      
      await writer.write(escposData);
      await writer.close();
      await port.close();

      setPrintStatus('Print successful!');
      if (onPrint) onPrint();
      setTimeout(() => onClose?.(), 1500);
      
    } catch (error) {
      console.error('Serial print error:', error);
      setPrintStatus(`USB Error: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Method 3: Browser Print (Universal fallback)
  const printViaBrowser = () => {
    setPrintStatus('Opening browser print dialog...');
    
    const kotContent = document.getElementById('kot-printable');
    if (!kotContent) return;

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Kitchen Order Ticket</title>
          <style>
            @media print {
              @page { 
                size: 58mm auto; 
                margin: 2mm; 
              }
              body { 
                margin: 0; 
                padding: 0; 
                font-family: 'Courier New', monospace; 
                font-size: 10px;
                line-height: 1.2;
              }
            }
            body {
              font-family: 'Courier New', monospace;
              font-size: 12px;
              line-height: 1.4;
              color: #000;
              background: #fff;
              padding: 8px;
              width: 58mm;
              max-width: 58mm;
            }
            .kot-row { 
              display: flex; 
              justify-content: space-between; 
              margin-bottom: 4px; 
            }
            .label { font-weight: bold; }
            .kot-divider { 
              text-align: center; 
              margin: 8px 0; 
              font-weight: bold; 
            }
            .kot-item { 
              display: flex; 
              margin-bottom: 6px; 
              gap: 8px; 
            }
            .item-qty { 
              font-weight: bold; 
              min-width: 30px; 
            }
            .item-name { 
              flex: 1; 
              word-wrap: break-word; 
            }
            .kot-footer { 
              margin-top: 12px; 
              text-align: center; 
            }
            .timestamp { 
              font-size: 10px; 
              color: #666; 
            }
          </style>
        </head>
        <body>
          ${kotContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      
      if (onPrint) onPrint();
      else onClose?.();
    }, 250);
  };

  // Method 4: PDF Download (iOS/Safari fallback)
  const downloadPDF = () => {
    setPrintStatus('Generating PDF...');
    
    const items = toDisplayItems(order);
    const textContent = [
      'KITCHEN ORDER TICKET',
      '========================',
      `Table: ${order.table_number}`,
      `Order: #${order.id?.slice(0, 8)?.toUpperCase()}`,
      `Time: ${new Date(order.created_at).toLocaleTimeString()}`,
      '========================',
      ...items.map(item => `${item.quantity}x  ${item.name}`),
      '========================',
      `Printed: ${new Date().toLocaleString()}`,
      '',
      ''
    ].join('\n');

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KOT-${order.id?.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setPrintStatus('Download complete! Use "Print to PDF" from share menu');
    if (onPrint) onPrint();
  };

  const formatTime = (dateString) =>
    new Date(dateString).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

  const items = toDisplayItems(order);

  return (
    <>
      <div className="kot-print-overlay">
        <div className="kot-print-modal">
          <div className="kot-print-content">
            <div className="kot-header">
              <h2>Kitchen Order Ticket</h2>
              <button className="close-btn" onClick={onClose}>×</button>
            </div>

            {/* Platform Info */}
            <div className="platform-info">
              <small>
                Platform: {capabilities.platform} | Browser: {capabilities.browser}
              </small>
            </div>

            <div className="kot-ticket" id="kot-printable">
              <div className="kot-info">
                <div className="kot-row">
                  <span className="label">Table:</span>
                  <span>{order.table_number}</span>
                </div>
                <div className="kot-row">
                  <span className="label">Order ID:</span>
                  <span>#{order.id?.slice(0, 8)?.toUpperCase()}</span>
                </div>
                <div className="kot-row">
                  <span className="label">Time:</span>
                  <span>{formatTime(order.created_at)}</span>
                </div>
              </div>

              <div className="kot-divider">----------------------------</div>

              <div className="kot-items">
                {items.length === 0 ? (
                  <div style={{ fontStyle: 'italic', color: '#888' }}>No items found</div>
                ) : (
                  items.map((item, idx) => (
                    <div key={idx} className="kot-item">
                      <div className="item-qty">{item.quantity}x</div>
                      <div className="item-name">{item.name}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="kot-divider">----------------------------</div>

              {order.special_instructions && (
                <div className="kot-notes">
                  <div className="label">Special Instructions:</div>
                  <div className="notes-text">{order.special_instructions}</div>
                </div>
              )}

              <div className="kot-footer">
                <div className="timestamp">
                  Printed: {new Date().toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Print Status */}
            {printStatus && (
              <div className="print-status">
                {printStatus}
              </div>
            )}

            {/* Print Options */}
            <div className="kot-actions">
              {capabilities.hasWebBluetooth && (
                <button 
                  className="print-btn bluetooth" 
                  onClick={printViaBluetooth}
                  disabled={isConnecting}
                >
                  📱 Bluetooth Print
                </button>
              )}
              
              {capabilities.hasWebSerial && (
                <button 
                  className="print-btn serial" 
                  onClick={printViaSerial}
                  disabled={isConnecting}
                >
                  🔌 USB Print
                </button>
              )}
              
              <button 
                className="print-btn browser" 
                onClick={printViaBrowser}
                disabled={isConnecting}
              >
                🖨️ Browser Print
              </button>
              
              {capabilities.platform === 'ios' && (
                <button 
                  className="print-btn pdf" 
                  onClick={downloadPDF}
                  disabled={isConnecting}
                >
                  📄 Download & Print
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .kot-print-overlay {
          position: fixed; inset: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex; align-items: center; justify-content: center;
          z-index: 10000;
        }
        .kot-print-modal {
          background: white;
          border-radius: 8px;
          width: 90%; max-width: 450px; max-height: 90vh;
          overflow: auto; border: 3px solid #10b981;
        }
        .kot-print-content { padding: 20px; }
        .kot-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 10px;
        }
        .close-btn {
          background: none; border: none; font-size: 24px;
          cursor: pointer; color: #666;
        }
        .platform-info {
          margin-bottom: 15px; padding: 8px;
          background: #f3f4f6; border-radius: 4px;
          text-align: center;
        }
        .kot-ticket {
          font-family: 'Courier New', monospace;
          font-size: 12px; line-height: 1.4; color: #000;
          background: #fff; padding: 16px; border: 2px dashed #333;
          margin-bottom: 20px;
        }
        .kot-info { margin-bottom: 12px; }
        .kot-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .label { font-weight: bold; }
        .kot-divider { text-align: center; margin: 8px 0; font-weight: bold; }
        .kot-items { margin: 12px 0; }
        .kot-item { display: flex; margin-bottom: 6px; gap: 8px; }
        .item-qty { font-weight: bold; min-width: 30px; }
        .item-name { flex: 1; word-wrap: break-word; }
        .kot-notes { margin-top: 12px; }
        .notes-text { font-style: italic; padding-left: 8px; }
        .kot-footer { margin-top: 12px; text-align: center; }
        .timestamp { font-size: 10px; color: #666; }
        
        .print-status {
          background: #e5f3ff; border: 1px solid #b3d9ff;
          padding: 10px; border-radius: 4px; margin-bottom: 15px;
          text-align: center; font-size: 14px;
        }
        
        .kot-actions { 
          display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; 
        }
        .print-btn {
          padding: 12px 20px; border-radius: 6px; border: none;
          cursor: pointer; font-size: 14px; font-weight: 500;
          transition: all 0.2s;
        }
        .print-btn:disabled {
          opacity: 0.6; cursor: not-allowed;
        }
        .print-btn.bluetooth {
          background: #1e40af; color: white;
        }
        .print-btn.bluetooth:hover:not(:disabled) {
          background: #1d4ed8;
        }
        .print-btn.serial {
          background: #059669; color: white;
        }
        .print-btn.serial:hover:not(:disabled) {
          background: #047857;
        }
        .print-btn.browser {
          background: #10b981; color: white;
        }
        .print-btn.browser:hover:not(:disabled) {
          background: #059669;
        }
        .print-btn.pdf {
          background: #dc2626; color: white;
        }
        .print-btn.pdf:hover:not(:disabled) {
          background: #b91c1c;
        }
      `}</style>
    </>
  );
}
