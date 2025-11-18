//pages/owner/orders.js 


import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/router'; // <-- Import useRouter at the top!
import { Capacitor } from '@capacitor/core';
import { getSupabase } from '../../services/supabase';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { subscribeOwnerDevice } from '../../helpers/subscribePush';

// Constants
const STATUSES = ['new','in_progress','ready','completed'];
const LABELS = { new: 'New', in_progress: 'Cooking', ready: 'Ready', completed: 'Done' };
const COLORS = { new: '#3b82f6', in_progress: '#f59e0b', ready: '#10b981', completed: '#6b7280' };
const PAGE_SIZE = 20;

// Restore stock for a set of order_items
async function restoreStockForOrder(supabase, restaurantId, orderItems) {
  console.log('[STOCK RESTORE] Starting restoration for', orderItems?.length, 'items');
  if (!Array.isArray(orderItems) || !orderItems.length) {
    console.log('[STOCK RESTORE] No order items to restore');
    return;
  }

  for (const oi of orderItems) {
    console.log('[STOCK RESTORE] Processing item:', { menu_item_id: oi.menu_item_id, quantity: oi.quantity, is_packaged: oi.is_packaged_good });
    
    if (!oi.menu_item_id || !oi.quantity) {
      console.log('[STOCK RESTORE] Skipping - no menu_item_id or quantity');
      continue;
    }

    // Skip packaged goods (no ingredient impact)
    if (oi.is_packaged_good) {
      console.log('[STOCK RESTORE] Skipping packaged good');
      continue;
    }

    // Fetch recipe for this menu item
    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .select('id, recipe_items(ingredient_id, quantity)')
      .eq('menu_item_id', oi.menu_item_id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    
    console.log('[STOCK RESTORE] Recipe fetch result:', { recipe, error: recipeErr });
    
    if (recipeErr || !recipe?.recipe_items?.length) {
      console.log('[STOCK RESTORE] No recipe found or error');
      continue;
    }

    for (const ri of recipe.recipe_items) {
      const addBack = Number(ri.quantity) * Number(oi.quantity);
      console.log('[STOCK RESTORE] Restoring ingredient:', { ingredient_id: ri.ingredient_id, addBack });
      
      // Get current stock
      const { data: ing, error: ingErr } = await supabase
        .from('ingredients')
        .select('id, current_stock, name')
        .eq('id', ri.ingredient_id)
        .eq('restaurant_id', restaurantId)
        .single();
      
      if (ingErr || !ing) {
        console.error('[STOCK RESTORE] Ingredient fetch failed:', ingErr);
        continue;
      }

      const oldStock = Number(ing.current_stock || 0);
      const newStock = oldStock + addBack;
      console.log('[STOCK RESTORE] Updating stock for', ing.name, ':', oldStock, '→', newStock);
      
      const { error: updateErr } = await supabase
        .from('ingredients')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', ing.id);
      
      if (updateErr) {
        console.error('[STOCK RESTORE] Update failed:', updateErr);
      } else {
        console.log('[STOCK RESTORE] ✓ Stock restored successfully');
      }
    }
  }
  console.log('[STOCK RESTORE] Restoration complete');
}

// Helpers
const money = (v) => `₹${Number(v ?? 0).toFixed(2)}`;
const prefix = (s) => (s ? s.slice(0,24) : '');

function computeOrderTotalDisplay(order) {
  const toNum = (v) => (v == null ? null : Number(v));
  const a = toNum(order?.total_inc_tax);
  if (Number.isFinite(a) && a>0) return a;
  const b = toNum(order?.total_amount);
  if (Number.isFinite(b) && b>0) return b;
  const c = toNum(order?.total);
  if (Number.isFinite(c) && c>0) return c;
  return 0;
}

function toDisplayItems(order) {
  if (Array.isArray(order.items)) return order.items;
  if (Array.isArray(order.order_items)) {
    return order.order_items.map((oi) => ({
      name: oi.menu_items?.name || oi.item_name || 'Item',
      quantity: oi.quantity,
      price: oi.price,
    }));
  }
  return [];
}

// Enhanced PaymentConfirmDialog component
// Enhanced PaymentConfirmDialog component
function PaymentConfirmDialog({ order, onConfirm, onCancel }) {
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showMixedForm, setShowMixedForm] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');
  const [onlineMethod, setOnlineMethod] = useState('upi');

  const total = computeOrderTotalDisplay(order);

  const handleMethodSelect = (method) => {
    setPaymentMethod(method);
    if (method === 'mixed') {
      setShowMixedForm(true);
    } else {
      setShowMixedForm(false);
      setCashAmount('');
      setOnlineAmount('');
    }
  };

  const validateMixedPayment = () => {
    const cash = Number(cashAmount || 0);
    const online = Number(onlineAmount || 0);
    const sum = cash + online;
    
    if (cash <= 0 || online <= 0) {
      alert('Both cash and online amounts must be greater than 0');
      return false;
    }
    
    if (Math.abs(sum - total) > 0.01) {
      alert(`Amounts must equal ₹${total.toFixed(2)}. Currently: ₹${sum.toFixed(2)}`);
      return false;
    }
    
    return true;
  };

  const handleConfirm = () => {
    if (paymentMethod === 'mixed') {
      if (!validateMixedPayment()) return;
      
      onConfirm(paymentMethod, {
        cash_amount: Number(cashAmount).toFixed(2),
        online_amount: Number(onlineAmount).toFixed(2),
        online_method: onlineMethod,
        is_mixed: true
      });
    } else {
      onConfirm(paymentMethod, null);
    }
  };

  return (
    <div style={{
      position:'fixed',top:0,left:0,right:0,bottom:0,
      backgroundColor:'rgba(0,0,0,0.5)',display:'flex',
      alignItems:'center',justifyContent:'center',zIndex:1000
    }}>
      <div style={{ 
        backgroundColor:'white',padding:20,borderRadius:8,
        maxWidth:450,margin:16,maxHeight:'90vh',overflowY:'auto'
      }}>
        <h3 style={{ margin:'0 0 16px 0' }}>Payment Confirmation</h3>
        <p><strong>Order #{order.id.slice(0,8)}</strong> - {getOrderTypeLabel(order)}</p>
        <p><strong>Amount: {money(total)}</strong></p>
        <p style={{marginBottom: 16}}><strong>How did the customer pay?</strong></p>
        
        {/* Payment method selection */}
        <div style={{ margin: '16px 0', display:'flex', flexDirection:'column', gap:'10px' }}>
          {/* Cash Option */}
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            padding: '12px',
            border: paymentMethod === 'cash' ? '2px solid #2563eb' : '1px solid #e5e7eb',
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: paymentMethod === 'cash' ? '#eff6ff' : 'white'
          }}>
            <input 
              type="radio" 
              value="cash" 
              checked={paymentMethod === 'cash'}
              onChange={(e) => handleMethodSelect(e.target.value)}
            />
            <span>💵 Full Cash Payment</span>
          </label>

          {/* Online Option */}
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            padding: '12px',
            border: paymentMethod === 'online' ? '2px solid #2563eb' : '1px solid #e5e7eb',
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: paymentMethod === 'online' ? '#eff6ff' : 'white'
          }}>
            <input 
              type="radio" 
              value="online" 
              checked={paymentMethod === 'online'}
              onChange={(e) => handleMethodSelect(e.target.value)}
            />
            <span>🔗 Full Online (UPI/Card)</span>
          </label>

          {/* Mixed Payment Option */}
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            padding: '12px',
            border: paymentMethod === 'mixed' ? '2px solid #2563eb' : '1px solid #e5e7eb',
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: paymentMethod === 'mixed' ? '#eff6ff' : 'white'
          }}>
            <input 
              type="radio" 
              value="mixed" 
              checked={paymentMethod === 'mixed'}
              onChange={(e) => handleMethodSelect(e.target.value)}
            />
            <span>🔀 Mixed (Part Cash + Part Online)</span>
          </label>
        </div>

        {/* Mixed Payment Details Form */}
        {showMixedForm && (
          <div style={{
            marginTop: '16px',
            padding: '16px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                Cash Amount (₹)
              </label>
              <input
                type="number"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                max={total}
                step="0.01"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                Online Amount (₹)
              </label>
              <input
                type="number"
                value={onlineAmount}
                onChange={(e) => setOnlineAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                max={total}
                step="0.01"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                Online Payment Method
              </label>
              <select
                value={onlineMethod}
                onChange={(e) => setOnlineMethod(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="upi">UPI</option>
                <option value="card">Credit/Debit Card</option>
                <option value="netbanking">Net Banking</option>
                <option value="wallet">Digital Wallet</option>
              </select>
            </div>

            <div style={{
              padding: '10px 12px',
              backgroundColor: '#eff6ff',
              borderLeft: '4px solid #2563eb',
              borderRadius: '4px',
              fontSize: '13px',
              color: '#1e40af'
            }}>
              <strong>Total: ₹{total.toFixed(2)}</strong><br/>
              <strong>Split:</strong> ₹{cashAmount || '0'} (Cash) + ₹{onlineAmount || '0'} ({onlineMethod.toUpperCase()})
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <Button onClick={handleConfirm} variant="success" style={{flex:1}}>
            Yes, {paymentMethod === 'mixed' ? 'Mixed' : paymentMethod === 'cash' ? 'Cash' : 'Online'} Received
          </Button>
          <Button onClick={onCancel} variant="outline" style={{flex:1}}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}


function CancelConfirmDialog({ order, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{ backgroundColor: 'white', padding: 20, borderRadius: 8, maxWidth: 400, margin: 16 }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Cancel Order Confirmation</h3>
        <p>Are you sure you want to cancel order #{order.id.slice(0, 8)} - Table {order.table_number}?</p>
        <label>
          Reason for cancellation:
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            style={{ width: '100%', marginTop: 8 }}
            placeholder="Enter cancellation reason"
          />
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <Button onClick={() => onConfirm(reason)} variant="danger" disabled={!reason.trim()}>
            Confirm Cancel
          </Button>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

async function fetchFullOrder(supabase, orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, menu_items(name))')
    .eq('id', orderId)
    .single();
  if (!error && data) return data;
  return null;
}

export default function OrdersPage() {
  const supabase = getSupabase();
  const router = useRouter(); // <-- Add this inside the component!
  const { user, checking } = useRequireAuth(supabase);
  const { restaurant, loading: restLoading } = useRestaurant();
  const restaurantId = restaurant?.id;

  // NEW: state for showing the print modal
  const [cancelOrderDialog, setCancelOrderDialog] = useState(null);

  const [ordersByStatus, setOrdersByStatus] = useState({
    new: [], in_progress: [], ready: [], completed: [], mobileFilter: 'new'
  });
  const [completedPage, setCompletedPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingInvoice, setGeneratingInvoice] = useState(null);
  const [paymentConfirmDialog, setPaymentConfirmDialog] = useState(null);
  const notificationAudioRef = useRef(null);

  // ... all useEffect hooks, loadOrders, realtime subscription, updateStatus, finalize, complete, etc. remain unchanged ...
  // Save token to user profile (optional, unchanged)


  useEffect(() => {
    const saveToken = async () => {
      if (!user || !supabase) return;
      const fcmToken = localStorage.getItem('fcm_token');
      if (!fcmToken) return;
      try {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ fcm_token: fcmToken })
          .eq('id', user.id);
        if (updateError) console.error('profile fcm_token update error', updateError);
      } catch (e) {
        console.error('profile fcm_token update exception', e);
      }
    };
    if (user) saveToken();
  }, [user, supabase]);

  // Subscribe this device token to the restaurant so server can send pushes
  useEffect(() => {
    let canceled = false;

    async function subscribeWith(token) {
      if (!restaurantId || !token) return;
      const platform = Capacitor.isNativePlatform() ? 'android' : 'web';
      console.log('[push] subscribing', { rid: restaurantId, tokenPrefix: prefix(token), platform });
      try {
        await subscribeOwnerDevice({ restaurantId, token, platform });
        if (!canceled) console.log('[push] subscribed OK', { rid: restaurantId });
        // Echo back current prefixes for debug
        try {
          const r = await fetch('/api/push/echo?rid=' + encodeURIComponent(restaurantId));
          const j = await r.json();
          console.log('[push] echo', j);
        } catch {}
      } catch (e) {
        console.warn('[push] subscribe error', e);
      }
    }

    async function run() {
      if (!restaurantId) return;
      // First attempt with whatever is already stored by _app registration
      const stored = localStorage.getItem('fcm_token');
      if (stored) await subscribeWith(stored);

      // Retry shortly to capture refreshed token if it appears a moment later
      setTimeout(() => {
        const again = localStorage.getItem('fcm_token');
        if (!canceled && again && again !== stored) {
          console.log('[push] retry subscribe with updated token', prefix(again));
          subscribeWith(again);
        }
      }, 1500);
    }

    run();
    return () => { canceled = true; };
  }, [restaurantId]);

  // Initialize notification audio
  useEffect(() => {
    const audio = new Audio('/notification-sound.mp3');
    audio.load();
    notificationAudioRef.current = audio;

    function unlockAudio() {
      const a = notificationAudioRef.current;
      if (!a) return;
      const wasMuted = a.muted;
      a.muted = true;
      a.play().catch(() => {});
      a.pause();
      a.currentTime = 0;
      a.muted = wasMuted;
      window.removeEventListener('touchstart', unlockAudio, { capture: true });
      window.removeEventListener('click', unlockAudio, { capture: true });
    }

    window.addEventListener('touchstart', unlockAudio, { capture: true, once: true });
    window.addEventListener('click', unlockAudio, { capture: true, once: true });
    return () => {
      window.removeEventListener('touchstart', unlockAudio, { capture: true });
      window.removeEventListener('click', unlockAudio, { capture: true });
    };
  }, []);

  // Play notification sound helper
  const playNotificationSound = useCallback(() => {
    try {
      if (notificationAudioRef.current) {
        notificationAudioRef.current.volume = 0.8;
        notificationAudioRef.current.play().catch(console.error);
      }
    } catch (e) {
      console.log('Audio playback failed:', e);
    }
  }, []);

  // Keep-alive ping
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) fetch('/api/ping', { method: 'POST' }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

const onCancelOrderOpen = (order) => setCancelOrderDialog(order);
const handleCancelConfirm = async (reason) => {
  if (!cancelOrderDialog) return;
  console.log('[CANCEL ORDER] Starting cancellation for order:', cancelOrderDialog.id);
  try {
       // Get full order with items before cancelling
       const fullOrder = await fetchFullOrder(supabase, cancelOrderDialog.id);
       console.log('[CANCEL ORDER] Full order fetched:', fullOrder);
       console.log('[CANCEL ORDER] order_items:', fullOrder?.order_items);
       console.log('[CANCEL ORDER] order_items length:', fullOrder?.order_items?.length);
       console.log('[CANCEL ORDER] order_items is array?', Array.isArray(fullOrder?.order_items));
       
       // Cancel the order
       await supabase
       .from('orders')
       .update({ status: 'cancelled', description: reason })
       .eq('id', cancelOrderDialog.id)
       .eq('restaurant_id', restaurantId);
       console.log('[CANCEL ORDER] Order status updated to cancelled');

       // Restore stock for cancelled order
       let itemsToRestore = fullOrder?.order_items;
       
       // Fallback: if order_items is empty, try to use items JSONB column
       if ((!itemsToRestore || itemsToRestore.length === 0) && fullOrder?.items && Array.isArray(fullOrder.items)) {
         console.log('[CANCEL ORDER] order_items empty, using items JSONB column');
         console.log('[CANCEL ORDER] Raw items JSONB:', fullOrder.items);
         
         // Convert items JSONB to order_items format
         // Need to look up menu_item_id by name if not present
         const itemsToConvert = [];
         for (const item of fullOrder.items) {
           console.log('[CANCEL ORDER] Processing item from JSONB:', item);
           let menuItemId = item.id || item.menu_item_id || null;
           
           // If no ID, try to look up by name
           if (!menuItemId && item.name) {
             console.log('[CANCEL ORDER] Looking up menu item by name:', item.name);
             const { data: menuItem, error: lookupErr } = await supabase
               .from('menu_items')
               .select('id, is_packaged_good')
               .eq('restaurant_id', restaurantId)
               .ilike('name', item.name)
               .maybeSingle();
             
             if (!lookupErr && menuItem) {
               menuItemId = menuItem.id;
               console.log('[CANCEL ORDER] Found menu item ID:', menuItemId);
               item.is_packaged_good = menuItem.is_packaged_good;
             } else {
               console.warn('[CANCEL ORDER] Could not find menu item for name:', item.name);
             }
           }
           
           itemsToConvert.push({
             menu_item_id: menuItemId,
             quantity: item.quantity || item.qty || 1,
             is_packaged_good: item.is_packaged_good || false
           });
         }
         
         itemsToRestore = itemsToConvert;
         console.log('[CANCEL ORDER] Converted items:', itemsToRestore);
       }
       
       if (itemsToRestore && itemsToRestore.length > 0) {
         console.log('[CANCEL ORDER] Calling restoreStockForOrder with', itemsToRestore.length, 'items');
         await restoreStockForOrder(supabase, restaurantId, itemsToRestore);
       } else {
         console.warn('[CANCEL ORDER] No order items found to restore stock. Full order:', JSON.stringify(fullOrder, null, 2));
       }

       loadOrders();
       setCancelOrderDialog(null);
      } catch (error) {
          console.error('[CANCEL ORDER] Error:', error);
          setError(error.message);
     }
};
const handleCancelDismiss = () => setCancelOrderDialog(null);

  // Fetch orders helper
  async function fetchBucket(status, page = 1) {
    if (!supabase || !restaurantId) return [];
    let q = supabase
      .from('orders')
      .select('*, order_items(*, menu_items(name))')
      .eq('restaurant_id', restaurantId)
      .eq('status', status);

    if (status === 'completed') {
      const to = page * PAGE_SIZE - 1;
      const { data, error } = await q.order('created_at', { ascending: false }).range(0, to);
      if (error) throw error;
      return data;
    }

    const { data, error } = await q.order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  }

  // loadOrders
  const loadOrders = useCallback(async (page = completedPage) => {
    if (!supabase || !restaurantId) return;
    setLoading(true);
    setError('');
    try {
      const [n, i, r, c] = await Promise.all([
        fetchBucket('new'),
        fetchBucket('in_progress'),
        fetchBucket('ready'),
        fetchBucket('completed', page),
      ]);

      const all = [...n, ...i, ...r, ...c];
      const ids = all.map((o) => o.id);
      let invMap = {};

      if (ids.length) {
        const { data: invoices, error } = await supabase
          .from('invoices')
          .select('order_id, pdf_url')
          .in('order_id', ids);
        if (error) console.error('Invoice fetch error:', error);
        invoices?.forEach((inv) => { invMap[inv.order_id] = inv.pdf_url; });
      }

      const attach = (rows) => rows.map((o) => ({ ...o, invoice: invMap[o.id] ? { pdf_url: invMap[o.id] } : null }));

      setOrdersByStatus({
        new: attach(n),
        in_progress: attach(i),
        ready: attach(r),
        completed: attach(c),
        mobileFilter: 'new',
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [completedPage, restaurantId, supabase]);

  useEffect(() => {
    if (restaurantId) {
      setCompletedPage(1);
      loadOrders(1);
    }
  }, [restaurantId, loadOrders]);

  // Realtime subscription & reconnection logic
  // Realtime subscription & order state sync
useEffect(() => {
  if (!supabase || !restaurantId) return;

  const channel = supabase
    .channel(`orders:${restaurantId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
      (payload) => {
        const order = payload.new;
        if (!order) return;

        // Update order in kanban/mobile list
        setOrdersByStatus((prev) => {
          const updated = { ...prev };
          for (const status of STATUSES) {
            updated[status] = prev[status].filter((o) => o.id !== order.id);
          }
          if (order.status && updated[order.status]) {
            updated[order.status] = [order, ...updated[order.status]];
          }
          return updated;
        });

        // Only play sound for new orders (print is now handled by global service)
        if (payload.eventType === 'INSERT' && order.status === 'new') {
          playNotificationSound();
        }
      }
    )
    .subscribe();

  function onVisible() {
    if (document.visibilityState === 'visible') {
      setTimeout(async () => {
        try {
          if (!supabase) return;
          const { data } = await supabase
            .from('orders')
            .select('*, order_items(*, menu_items(name))')
            .eq('restaurant_id', restaurantId)
            .eq('status', 'new')
            .gte('created_at', new Date(Date.now() - 120000).toISOString())
            .order('created_at', { ascending: true });
          if (data) {
            setOrdersByStatus((prev) => ({
              ...prev,
              new: [...data, ...prev.new].filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i),
            }));
          }
        } catch (e) {
          console.warn('Visibility catch-up error:', e);
        }
      }, 500);
    }
  }

  window.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('visibilitychange', onVisible);
    if (supabase) supabase.removeChannel(channel);
  };
}, [supabase, restaurantId, playNotificationSound]);


  // All remaining functions and JSX unchanged

  async function updateStatus(id, next) {
    if (!supabase) return;
    try {
      await supabase.from('orders').update({ status: next }).eq('id', id).eq('restaurant_id', restaurantId);
      loadOrders();
    } catch (e) {
      setError(e.message);
    }
  }

  const finalize = (order) => {
  // ✅ Check PAYMENT_METHOD first for credit orders
  if (order?.payment_method === 'credit') {
    // Credit orders don't need payment confirmation - just complete
    complete(order.id);
    return;
  }

  // If invoice already exists, customer paid online - skip dialog
  if (order?.invoice?.pdf_url) {
    complete(order.id);
    return;
  }

  // No invoice = counter payment - show payment confirmation dialog
  setPaymentConfirmDialog(order);
};

// Updated handler - receives payment method AND mixed details
const handlePaymentConfirmed = (actualPaymentMethod, mixedDetails = null) => {
  if (!paymentConfirmDialog) return;
  complete(paymentConfirmDialog.id, actualPaymentMethod, mixedDetails);
  setPaymentConfirmDialog(null);
};

// Updated complete function - no auto-open PDF + save payment method
// Updated complete function - extract payment_method from order first
const complete = async (orderId, actualPaymentMethod = null, mixedDetails = null) => {
  if (!supabase) return;
  setGeneratingInvoice(orderId);
  try {
    // ✅ FIX: Fetch order FIRST to get its payment_method
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, payment_method, actual_payment_method, is_credit, credit_customer_id')
      .eq('id', orderId)
      .single();

    if (fetchErr) throw fetchErr;

    // Determine the final payment method - USE ORDER'S PAYMENT_METHOD if available
    let finalPaymentMethod = actualPaymentMethod;
    
    // If no explicit payment method provided, use what's stored in the order
    if (!finalPaymentMethod) {
      finalPaymentMethod = order?.payment_method || order?.actual_payment_method || 'cash';
    }
    
    // If it's a credit order, ensure it stays as 'credit'
    if (order?.is_credit && order?.credit_customer_id) {
      finalPaymentMethod = 'credit';
    }

    // Update order status to completed
    const updateData = { 
      status: 'completed',
      ...(finalPaymentMethod && { 
        payment_method: finalPaymentMethod, 
        actual_payment_method: finalPaymentMethod 
      }),
      ...(mixedDetails && { mixed_payment_details: mixedDetails })
    };
    
    await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId);
    
    // ✅ FIX: Pass the CORRECT payment_method from order to API
    const resp = await fetch('/api/invoices/generate', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        order_id: orderId, 
        restaurant_id: restaurantId,
        payment_method: finalPaymentMethod,  // ✅ Pass final payment method
        is_credit: order?.is_credit,
        credit_customer_id: order?.credit_customer_id,
        mixed_payment_details: mixedDetails
      }),
    });
    
    if (!resp.ok) throw new Error('Invoice generation failed');
    loadOrders();
  } catch (e) {
    setError(e.message);
  } finally {
    setGeneratingInvoice(null);
  }
};


  if (checking || restLoading) return <div style={{ padding:16 }}>Loading…</div>;
  if (!restaurantId) return <div style={{ padding:16 }}>No restaurant found.</div>;

  // // Show print modal when state is set
   
  return (
    <div className="orders-wrap">
      <header className="orders-header">
        <h1>Orders Dashboard</h1>
        <div className="header-actions">
          <span className="muted">
            {['new','in_progress','ready']
              .reduce((sum,s) => sum + ordersByStatus[s].length, 0)} live orders
          </span>
          <Button variant="outline" onClick={() => { setCompletedPage(1); loadOrders(1); }}>
            Refresh
          </Button>
        </div>
      </header>

      {error && (
        <Card padding={12} style={{ background:'#fee2e2',border:'1px solid #fecaca',margin:'0 12px 12px' }}>
          <span style={{ color:'#b91c1c' }}>{error}</span>
        </Card>
      )}

      <div className="mobile-filters">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`chip ${s === ordersByStatus.mobileFilter ? 'chip--active' : ''}`}
            onClick={() => setOrdersByStatus(prev => ({ ...prev, mobileFilter: s }))}
          >
            <span className="chip-label">{LABELS[s]}</span>
            <span className="chip-count">{ordersByStatus[s].length}</span>
          </button>
        ))}
      </div>

      {/* Mobile list */}
      <div className="mobile-list orders-list">
        {ordersByStatus[ordersByStatus.mobileFilter].length === 0 ? (
          <Card className="muted" padding={12} style={{ textAlign:'center' }}>
            No {LABELS[ordersByStatus.mobileFilter].toLowerCase()} orders
          </Card>
        ) : (
          ordersByStatus[ordersByStatus.mobileFilter].map(order => (
            <OrderCard
              key={order.id}
              order={order}
              statusColor={COLORS[order.status]}
              onChangeStatus={updateStatus}
              onComplete={finalize}
              generatingInvoice={generatingInvoice}
onPrintClick={() => {
  // Dispatch global print event (will be caught by _app.js listener)
  window.dispatchEvent(new CustomEvent('auto-print-order', { 
  detail: { ...order, autoPrint: true, kind: 'kot' } 
  }));
}}
              onCancelOrderOpen={onCancelOrderOpen}
            />
          ))
        )}
      </div>

      {/* Kanban grid for desktop */}
      <div className="kanban">
        {STATUSES.map(status => (
          <Card key={status} padding={12}>
            <div className="kanban-col-header">
              <strong style={{ color: COLORS[status] }}>{LABELS[status]}</strong>
              <span className="pill">{ordersByStatus[status].length}</span>
            </div>
            <div className="kanban-col-body">
              {ordersByStatus[status].length === 0 ? (
                <div className="empty-col">No {LABELS[status].toLowerCase()} orders</div>
              ) : (
                ordersByStatus[status].map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    statusColor={COLORS[status]}
                    onChangeStatus={updateStatus}
                    onComplete={finalize}
                    generatingInvoice={generatingInvoice}
onPrintClick={() => {
  // Dispatch global print event (will be caught by _app.js listener)
  window.dispatchEvent(new CustomEvent('auto-print-order', { 
  detail: { ...order, autoPrint: true, kind: 'kot' } 
  }));
}}
                    onCancelOrderOpen={onCancelOrderOpen}
                  />
                ))
              )}
              {status === 'completed' && ordersByStatus.completed.length >= PAGE_SIZE && (
                <>
                  <div style={{ fontSize:12, color:'#6b7280' }}>
                    Showing latest {ordersByStatus.completed.length} completed orders
                  </div>
                  <div style={{ paddingTop:8 }}>
                    <Button variant="outline" onClick={() => {
                      setCompletedPage(p => p+1);
                      loadOrders(completedPage+1);
                    }}>
                      Load more
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {paymentConfirmDialog && (
        <PaymentConfirmDialog
          order={paymentConfirmDialog}
          onConfirm={handlePaymentConfirmed}
          onCancel={() => setPaymentConfirmDialog(null)}
        />
      )}

      {cancelOrderDialog && (
        <CancelConfirmDialog
          order={cancelOrderDialog}
          onConfirm={handleCancelConfirm}
          onCancel={handleCancelDismiss}
        />
      )}


      <style jsx>{`
.orders-wrap { padding:12px 0 32px; }
.orders-header { display:flex; justify-content:space-between; align-items:center; padding:0 12px 12px; gap:10px; }
.orders-header h1 { margin:0; font-size:clamp(20px,2.6vw,28px); }
.header-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.muted { color:#6b7280; font-size:14px; }
.mobile-list { display:none; }
.kanban { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; padding:12px 16px; }
.kanban-col-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.pill { background:#f3f4f6; padding:4px 10px; border-radius:9999px; font-size:12px; }
.kanban-col-body { display:flex; flex-direction:column; gap:10px; max-height:70vh; overflow-y:auto; }
.empty-col { text-align:center; color:#9ca3af; padding:20px; border:1px dashed #e5e7eb; border-radius:8px; }
@media (max-width:1023px) {
  .orders-wrap { padding:8px 0 24px; }
  .header-actions { justify-content:flex-start; }
  .mobile-list { display:flex; flex-direction:column; gap:10px; padding:0 8px; }
  .kanban { display:none !important; }
}
@media (max-width:414px) {
  .orders-header { flex-wrap:wrap; }
  .header-actions { width:100%; justify-content:flex-start; }
  .orders-header h1 { font-size:20px; }
  .mobile-list { padding:0 6px; gap:8px; }
}
      `}</style>
    </div>
  );
}

function getOrderTypeLabel(order) {
  if (!order) return '';
  if (order.order_type === 'parcel') return 'Parcel';
  if (order.order_type === 'dine-in') return 'Dine-in';
  if (order.order_type === 'counter') {
    if (order.table_number) return `Table ${order.table_number}`;
    else return 'Counter';
  }
  return '';
}

// OrderCard component (with print button)
function OrderCard({ order, statusColor, onChangeStatus, onComplete, generatingInvoice, onPrintClick, onCancelOrderOpen }) {
  const items = toDisplayItems(order);
  const hasInvoice = Boolean(order?.invoice?.pdf_url);
  const total = computeOrderTotalDisplay(order);
  
  // Check if this is a credit order
  const isCreditOrder = order?.is_credit && order?.credit_customer_id;
  
  // Check if payment was completed online
  const pm = String(order.payment_method || '').toLowerCase();
  const isOnlinePaid = pm === 'upi' || pm === 'card' || pm === 'online';

const handlePrintBill = () => {
    window.dispatchEvent(new CustomEvent('auto-print-order', { 
  detail: { ...order, autoPrint: true, kind: 'kot' } }));
  };

  return (
    <>
      <div className="order-card-wrapper">
        <Card padding={12} className="order-card" style={{
          border:'1px solid #eef2f7',
          borderRadius:12,
          boxShadow:'0 1px 2px rgba(0,0,0,0.04)',
          width:'100%',maxWidth:'100%'
        }}>
          <div style={{
            display:'flex',justifyContent:'space-between',
            alignItems:'baseline',gap:8,flexWrap:'wrap'
          }}>
            <strong>#{order.id.slice(0,8)}</strong>
            <span style={{ marginLeft:8 }}>
              <small>{getOrderTypeLabel(order)}</small>
              {isCreditOrder && <small style={{marginLeft: 8, color: '#f59e0b', fontWeight: 'bold'}}>💳 CREDIT</small>}
            </span>
            <span style={{ color:'#6b7280',fontSize:12 }}>
              {new Date(order.created_at).toLocaleTimeString()}
            </span>
          </div>

          <div style={{ margin:'8px 0', fontSize:14 }}>
            {items.map((it,i)=>(
              <div key={i}>{it.quantity}× {it.name}</div>
            ))}
          </div>

          <div style={{
            display:'flex',justifyContent:'space-between',
            alignItems:'center',gap:8,flexWrap:'wrap',width:'100%'
          }}>
            <span style={{ fontSize:16,fontWeight:700 }}>{money(total)}</span>
            <div className="order-actions" style={{
              display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end',width:'100%'
            }} onClick={e=>e.stopPropagation()}>
              
              {/* NEW orders */}
              {order.status==='new' && (
                <>
                  <Button size="sm" onClick={() => onChangeStatus(order.id, 'in_progress')}>
                    Start
                  </Button>
                   <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onCancelOrderOpen(order)}
                  >
                    Cancel
                  </Button>
                  <button
                    onClick={handlePrintBill}
                    style={{
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Print KOT
                  </button>
                </>
              )}

              {/* IN_PROGRESS orders */}
              {order.status==='in_progress' && (
                <>
             <Button size="sm" variant="success" onClick={() => onChangeStatus(order.id, 'ready')}>
              Ready
             </Button>
             <Button
               size="sm"
               variant="danger"
               onClick={() => onCancelOrderOpen(order)}
             >
             Cancel
            </Button>
           </>
              )}

              {/* READY orders - show Done button for all payment types */}
              {/* For CREDIT orders: no payment dialog will show
                  For other orders: payment dialog will show (cash/online/mixed) */}
              {order.status==='ready' && (
  	      <Button
   	      size="sm"
  	      onClick={() => onComplete(order)}
  	      disabled={generatingInvoice===order.id}
	      title={isCreditOrder ? "Complete credit order (no payment dialog)" : "Complete order - payment dialog will appear"}
	      >
   	      {generatingInvoice===order.id ? 'Processing…' : 'Done'}
  	      </Button>
	      )}

              {/* COMPLETED orders - show Bill + Print KOT buttons */}
              {order.status==='completed' && (
                <>
                  {hasInvoice && (
                    <Button size="sm" onClick={()=>window.open(order.invoice.pdf_url,'_blank')}>
                      Invoice
                    </Button>
                  )}
                  <button
                    onClick={handlePrintBill}
                    style={{
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Print Bill
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{
            height:2,marginTop:10,background:statusColor,
            opacity:0.2,borderRadius:2
          }}/>
        </Card>
      </div>

      <style jsx>{`
.order-card-wrapper { width:100%; padding:6px 0; }
.order-card { width:100%; max-width:100%; }
@media (max-width:480px) {
  .order-actions { justify-content:flex-start !important; }
}
      `}</style>
    </>
  );
}
