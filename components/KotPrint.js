//components/KotPrint

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

  useEffect(() => {
  async function fetchData() {
    try {
      const supabase = getSupabase();
      
      // Fetch bill
      const { data: billData } = await supabase
        .from('bills')
        .select('*')
        .eq('order_id', order.id)
        .single();
      
      if (billData) setBill(billData);

      // Fetch restaurant profile
      const { data: profileData } = await supabase
        .from('restaurant_profiles')
        .select('*')
        .eq('restaurant_id', order.restaurant_id)
        .single();
      
      if (profileData) setRestaurantProfile(profileData);

      // ✅ CRITICAL: Always fetch restaurant name from restaurants table
      // This ensures ALL order types (Table, Parcel, Counter) get the correct display name
      const { data: restaurantData, error: restaurantError } = await supabase
        .from('restaurants')
        .select('name')
        .eq('id', order.restaurant_id)
        .single();
      
      if (restaurantData && !restaurantError) {
        // Merge restaurant name into order object
        // This ensures order.restaurant_name is always set before printing
        order.restaurant_name = restaurantData.name;
      }

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
    setStatus('Generating bill for thermal printer...');
    
    try {
      const result = await downloadTextAndShare(order, bill, restaurantProfile);
      
      if (result.success) {
        if (result.method === 'share') {
          setStatus('✓ Shared! Open in Thermer app to print.');
        } else {
          setStatus('✓ Downloaded! Open with Thermer app.');
        }
        if (onPrint) onPrint();
      } else {
        setStatus(`✗ Error: ${result.error}`);
      }
    } catch (err) {
      setStatus(`✗ Error: ${err.message}`);
      console.error(err);
    }
    
    setIsProcessing(false);
  };

  const items = toDisplayItems(order);
  const grandTotal = Number(
    bill?.grand_total || order?.total_inc_tax || 0
  );
  const netAmount = Number(
    bill?.subtotal || order?.subtotal || 0
  );
  const taxAmount = Number(
    bill?.tax_total || order?.tax_amount || 0
  );

  return (
    <>
      <div className="kot-overlay">
        <div className="kot-modal">
          <div className="kot-header">
            <h2>Print Bill / KOT</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>

          {loadingData ? (
            <div className="loading">Loading order details...</div>
          ) : (
            <>
              <div className="preview">
                <div className="thermal-preview">
                  <pre>
{`Order: #${order.id?.slice(0, 8)?.toUpperCase()}
Type: ${getOrderTypeLabel(order)}
Amount: ₹${grandTotal.toFixed(2)}`}
                  </pre>
                </div>

                {status && (
                  <div className={`status ${status.includes('✓') ? 'success' : 'error'}`}>
                    {status}
                  </div>
                )}

                <button 
                  className="print-btn"
                  onClick={handleTextShare}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Preparing...' : '🖨️ Print via Thermer'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .kot-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.8);
          display: flex; align-items: center; justify-content: center;
          z-index: 10000;
        }
        .kot-modal {
          background: white; border-radius: 8px;
          width: 90%; max-width: 500px;
          padding: 20px; max-height: 80vh; overflow: auto;
        }
        .kot-header {
          display: flex; justify-content: space-between;
          align-items: center; margin-bottom: 15px;
        }
        .close-btn {
          background: none; border: none;
          font-size: 24px; cursor: pointer; color: #666;
        }
        .loading {
          text-align: center; padding: 20px;
          color: #666;
        }
        .preview {
          padding: 15px;
        }
        .thermal-preview {
          background: #f5f5f5; border: 2px dashed #333;
          padding: 12px; border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 12px; line-height: 1.4;
          margin-bottom: 15px; text-align: left;
          max-height: 300px; overflow-y: auto;
        }
        .thermal-preview pre {
          margin: 0; white-space: pre-wrap;
          word-wrap: break-word;
        }
        .status {
          padding: 10px; border-radius: 4px;
          margin-bottom: 15px; text-align: center;
          font-weight: 500;
        }
        .status.success {
          background: #d4edda; color: #155724;
          border: 1px solid #c3e6cb;
        }
        .status.error {
          background: #f8d7da; color: #721c24;
          border: 1px solid #f5c6cb;
        }
        .print-btn {
          width: 100%; padding: 12px;
          background: #10b981; color: white;
          border: none; border-radius: 6px;
          cursor: pointer; font-size: 14px;
          font-weight: 500; transition: 0.2s;
        }
        .print-btn:hover:not(:disabled) {
          background: #059669;
        }
        .print-btn:disabled {
          opacity: 0.6; cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
