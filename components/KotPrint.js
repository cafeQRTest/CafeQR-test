// components/KotPrint.js
import React, { useState } from 'react';
import { downloadPdfAndShare, downloadTextAndShare } from '../utils/printUtils';

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

function getOrderTypeLabel(order) {
  if (order.order_type === 'parcel') return 'Parcel';
  if (order.order_type === 'dine-in') return 'Dine-in';
  if (order.order_type === 'counter') {
    return order.table_number ? `Table ${order.table_number}` : 'Counter';
  }
  return '';
}

export default function KotPrint({ order, onClose, onPrint }) {
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePdfShare = async () => {
    setIsProcessing(true);
    setStatus('Generating PDF...');
    
    const result = await downloadPdfAndShare(order);
    
    if (result.success) {
      if (result.method === 'share') {
        setStatus('Shared successfully! Choose Thermer or another printing app.');
      } else {
        setStatus('PDF downloaded! Use Thermer or another app to print.');
      }
      if (onPrint) onPrint();
    } else {
      setStatus(`Error: ${result.error}`);
    }
    
    setIsProcessing(false);
  };
  
  const handleTextShare = async () => {
    setIsProcessing(true);
    setStatus('Generating text file...');
    
    const result = downloadTextAndShare(order);
    
    if (result.success) {
      if (result.method === 'share') {
        setStatus('Shared successfully! Choose Thermer or another printing app.');
      } else {
        setStatus('Text file downloaded! Use Thermer or another app to print.');
      }
      if (onPrint) onPrint();
    } else {
      setStatus(`Error: ${result.error}`);
    }
    
    setIsProcessing(false);
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

            <div className="kot-ticket" id="kot-printable">
              <div className="kot-info">
                <div className="kot-row">
                  <span className="label">Table:</span>
 		  <span>{getOrderTypeLabel(order)}</span>
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

            {/* Status Display */}
            {status && (
              <div className="print-status">
                {status}
              </div>
            )}

            {/* Action Buttons */}
            <div className="kot-actions">
              <button 
                className="print-btn pdf-btn" 
                onClick={handlePdfShare}
                disabled={isProcessing}
              >
                📱 Share PDF & Print
              </button>
              
              <button 
                className="print-btn text-btn" 
                onClick={handleTextShare}
                disabled={isProcessing}
              >
                📄 Share Text & Print
              </button>
            </div>

            <div className="help-text">
              <small>
                💡 After sharing, choose <strong>Thermer</strong> or another printing app to print to your Bluetooth thermal printer.
              </small>
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
          margin-bottom: 15px;
        }
        .close-btn {
          background: none; border: none; font-size: 24px;
          cursor: pointer; color: #666;
        }
        .kot-ticket {
          font-family: 'Courier New', monospace;
          font-size: 12px; line-height: 1.4; color: #000;
          background: #fff; padding: 4px; border: 1px dashed #333;
          margin-bottom: 20px;
	  width: auto;
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
          padding: 12px; border-radius: 4px; margin-bottom: 15px;
          text-align: center; font-size: 14px;
        }
        
        .kot-actions { 
          display: flex; gap: 10px; justify-content: center; 
          margin-bottom: 15px;
        }
        .print-btn {
          padding: 12px 20px; border-radius: 6px; border: none;
          cursor: pointer; font-size: 14px; font-weight: 500;
          transition: all 0.2s; flex: 1;
        }
        .print-btn:disabled {
          opacity: 0.6; cursor: not-allowed;
        }
        .pdf-btn {
          background: #10b981; color: white;
        }
        .pdf-btn:hover:not(:disabled) {
          background: #059669;
        }
        .text-btn {
          background: #3b82f6; color: white;
        }
        .text-btn:hover:not(:disabled) {
          background: #2563eb;
        }
        
        .help-text {
          text-align: center; color: #666;
          background: #f9fafb; padding: 10px; border-radius: 4px;
          border-left: 4px solid #10b981;
        }
      `}</style>
    </>
  );
}
