import React, { useState, useEffect } from 'react';
import { downloadTextAndShare } from '../utils/printUtils';
import { getSupabase } from '../services/supabase';

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
  if (order.table_number) return `Table ${order.table_number}`;
  if (order.order_type === 'dine-in') return 'Dine-in';
  if (order.order_type === 'counter') return 'Counter';
  return '';
}

export default function KotPrint({ order, onClose, onPrint }) {
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [bill, setBill] = useState(null);
  const [restaurantProfile, setRestaurantProfile] = useState(null);
  const [loadingData, setLoadingData] = useState(true);

  // Fetch bill and restaurant profile data
  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = getSupabase();
        
        // Fetch bill
        const { data: billData, error: billError } = await supabase
          .from('bills')
          .select('*')
          .eq('order_id', order.id)
          .single();
        
        if (billData) setBill(billData);
        if (billError) console.warn('Bill fetch error:', billError);

        // Fetch restaurant profile
        const { data: profileData, error: profileError } = await supabase
          .from('restaurant_profiles')
          .select('*')
          .eq('restaurant_id', order.restaurant_id)
          .single();
        
        if (profileData) setRestaurantProfile(profileData);
        if (profileError) console.warn('Profile fetch error:', profileError);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoadingData(false);
      }
    }

    if (order) fetchData();
  }, [order]);

  const handleTextShare = async () => {
    setIsProcessing(true);
    setStatus('Generating bill for printing...');
    
    try {
      const result = await downloadTextAndShare(order, bill, restaurantProfile);
      
      if (result.success) {
        if (result.method === 'share') {
          setStatus('Shared successfully! Choose Thermer or another printing app.');
        } else {
          setStatus('File downloaded! Use Thermer or another app to print.');
        }
        if (onPrint) onPrint();
      } else {
        setStatus(`Error: ${result.error}`);
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      console.error(err);
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
  const grandTotal = Number(
    bill?.grand_total || 
    bill?.total_inc_tax || 
    order?.total_inc_tax || 
    order?.total_amount || 
    order?.total || 
    0
  );
  const netAmount = Number(
    bill?.subtotal || 
    order?.subtotal || 
    order?.total_amount || 
    order?.total || 
    0
  );
  const taxAmount = Number(
    bill?.tax_total || 
    bill?.total_tax || 
    order?.tax_amount || 
    order?.total_tax || 
    0
  );

  return (
    <>
      <div className="kot-print-overlay">
        <div className="kot-print-modal">
          <div className="kot-print-content">
            <div className="kot-header">
              <h2>Kitchen Order Ticket / Bill</h2>
              <button className="close-btn" onClick={onClose}>×</button>
            </div>

            {loadingData ? (
              <div className="print-status">
                Loading bill details...
              </div>
            ) : (
              <>
                <div className="kot-ticket" id="kot-printable">
                  <div className="kot-info">
                    <div className="kot-row">
                      <span className="label">Order Type:</span>
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
                    <div className="kot-row">
                      <span className="label">Net Amount:</span>
                      <span>₹{netAmount.toFixed(2)}</span>
                    </div>
                    {taxAmount > 0 && (
                      <div className="kot-row">
                        <span className="label">Tax:</span>
                        <span>₹{taxAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="kot-row">
                      <span className="label"><strong>Grand Total:</strong></span>
                      <span><strong>₹{grandTotal.toFixed(2)}</strong></span>
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
                          <div className="item-price">₹{Number(item.price || 0).toFixed(2)}</div>
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
                </div>

                {/* Status Display */}
                {status && (
                  <div className="print-status">
                    {status}
                  </div>
                )}

                {/* Action Button */}
                <div className="kot-actions">
                  <button 
                    className="print-btn text-btn" 
                    onClick={handleTextShare}
                    disabled={isProcessing}
                  >
                    📄 Share & Print Bill
                  </button>
                </div>

                <div className="help-text">
                  <small>
                    💡 After sharing, choose <strong>Thermer</strong> or another printing app to print to your Bluetooth thermal printer.
                  </small>
                </div>
              </>
            )}
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
          font-size: 11px; line-height: 1.3; color: #000;
          background: #fff; padding: 12px; border: 1px dashed #333;
          margin-bottom: 20px; width: auto;
        }
        .kot-info { margin-bottom: 12px; }
        .kot-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .label { font-weight: bold; min-width: 100px; }
        .kot-divider { text-align: center; margin: 8px 0; font-weight: bold; }
        .kot-items { margin: 12px 0; }
        .kot-item { display: flex; margin-bottom: 6px; gap: 8px; justify-content: space-between; }
        .item-qty { font-weight: bold; min-width: 40px; }
        .item-name { flex: 1; word-wrap: break-word; }
        .item-price { font-weight: bold; min-width: 70px; text-align: right; }
        .kot-notes { margin-top: 12px; }
        .notes-text { font-style: italic; padding-left: 8px; }
        
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
          transition: all 0.2s; width: 100%;
        }
        .print-btn:disabled {
          opacity: 0.6; cursor: not-allowed;
        }
        .text-btn {
          background: #10b981; color: white;
        }
        .text-btn:hover:not(:disabled) {
          background: #059669;
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
