// components/KotPrint.js
import React, { useState, useEffect, useCallback } from 'react';
import { downloadTextAndShare } from '../utils/printUtils';
import { getSupabase } from '../services/supabase';

function toDisplayItems(order) {
  if (Array.isArray(order.items) && order.items.length) return order.items;
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
  if (order?.order_type === 'parcel') return 'Parcel';
  if (order?.order_type === 'dine-in') return 'Dine-in';
  if (order?.order_type === 'counter') {
    return order?.table_number ? `Table ${order.table_number}` : 'Counter';
  }
  return '';
}

export default function KotPrint({ order, onClose, onPrint, autoPrint = false }) {
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [bill, setBill] = useState(null);
  const [restaurantProfile, setRestaurantProfile] = useState(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = getSupabase();

        // Load bill by order_id (ignore error if not found)
        const { data: billData } = await supabase
          .from('bills')
          .select('*')
          .eq('order_id', order.id)
          .maybeSingle();
        if (billData) setBill(billData);

        // Load restaurant profile
        const { data: profileData } = await supabase
          .from('restaurant_profiles')
          .select('*')
          .eq('restaurant_id', order.restaurant_id)
          .maybeSingle();
        if (profileData) setRestaurantProfile(profileData);

        // Ensure a display name exists
        const { data: restaurantData } = await supabase
          .from('restaurants')
          .select('name')
          .eq('id', order.restaurant_id)
          .maybeSingle();
        if (restaurantData?.name) {
          // Non-destructive merge into a local shadow if desired; mutation is fine for preview
          order.restaurant_name = restaurantData.name;
        }
      } catch (err) {
        console.error('KotPrint fetch error:', err);
      } finally {
        setLoadingData(false);
      }
    }
    if (order?.id && order?.restaurant_id) fetchData();
  }, [order]);

  const handleTextShare = useCallback(async () => {
    setIsProcessing(true);
    setStatus('Generating bill for thermal printer...');
    try {
      const result = await downloadTextAndShare(order, bill, restaurantProfile);
      if (result.success) {
        setStatus(result.method === 'share'
          ? '✓ Shared! Open in Thermer app to print.'
          : '✓ Downloaded! Open with Thermer app.');
        onPrint?.();
      } else {
        setStatus(`✗ Error: ${result.error}`);
      }
    } catch (err) {
      setStatus(`✗ Error: ${err.message}`);
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  }, [order, bill, restaurantProfile, onPrint]);

  // Auto-print after data is ready and the component has rendered
  useEffect(() => {
    if (!autoPrint || loadingData) return;
    const t = setTimeout(() => handleTextShare(), 150);
    return () => clearTimeout(t);
  }, [autoPrint, loadingData, handleTextShare]);

  const items = toDisplayItems(order);
  const grandTotal = Number(bill?.grand_total ?? order?.total_inc_tax ?? 0);

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
        .kot-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8);
          display: flex; align-items: center; justify-content: center; z-index: 10000; }
        .kot-modal { background: white; border-radius: 8px; width: 90%; max-width: 500px;
          padding: 20px; max-height: 80vh; overflow: auto; }
        .kot-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .close-btn { background: none; border: none; font-size: 24px; cursor: pointer; color: #666; }
        .loading { text-align: center; padding: 20px; color: #666; }
        .preview { padding: 15px; }
        .thermal-preview { background: #f5f5f5; border: 2px dashed #333; padding: 12px; border-radius: 4px;
          font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; margin-bottom: 15px; text-align: left;
          max-height: 300px; overflow-y: auto; }
        .thermal-preview pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; }
        .status { padding: 10px; border-radius: 4px; margin-bottom: 15px; text-align: center; font-weight: 500; }
        .status.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .status.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .print-btn { width: 100%; padding: 12px; background: #10b981; color: white; border: none; border-radius: 6px;
          cursor: pointer; font-size: 14px; font-weight: 500; transition: 0.2s; }
        .print-btn:hover:not(:disabled) { background: #059669; }
        .print-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </>
  );
}
