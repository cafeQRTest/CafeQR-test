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
import { downloadInvoicePdf } from '../../lib/downloadInvoicePdf'


// Constants
const STATUSES = ['new','in_progress','ready','completed'];
const LABELS = { new: 'New', in_progress: 'Cooking', ready: 'Ready', completed: 'Done' };
const COLORS = { new: '#3b82f6', in_progress: '#f59e0b', ready: '#10b981', completed: '#6b7280' };
const PAGE_SIZE = 20;
const UI_COLUMNS = [
  { id: 'new', label: 'New', statuses: ['new'] },
  { id: 'inprogress', label: 'In Progress', statuses: ['in_progress', 'ready'] },
  { id: 'completed', label: 'Done', statuses: ['completed'] },
];

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

  // Mode info from order (paymentConfirmDialog)
  const mode = order.mode || null; // 'collect' | 'refund' | null
  const originalTotal = computeOrderTotalDisplay(order);

  // Decide effective total to validate against
  const effectiveTotal =
    mode === 'collect'
      ? Number(order.remainingAmount ?? originalTotal)
      : originalTotal;

  const alreadyPaid =
    mode && order.alreadyPaidAmount != null
      ? Number(order.alreadyPaidAmount)
      : 0;

  const refundAmount =
    mode === 'refund' && order.refundAmount != null
      ? Number(order.refundAmount)
      : 0;

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

    if (Math.abs(sum - effectiveTotal) > 0.01) {
      alert(
        `Amounts must equal ₹${effectiveTotal.toFixed(
          2
        )}. Currently: ₹${sum.toFixed(2)}`
      );
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
        is_mixed: true,
        // optional: include mode info if you want to treat collect / refund differently later
        mode,
      });
    } else {
      onConfirm(paymentMethod, null);
    }
  };

  const titlePrefix =
    mode === 'collect'
      ? 'Collect remaining payment'
      : mode === 'refund'
      ? 'Refund extra payment'
      : 'Payment Confirmation';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: 20,
          borderRadius: 8,
          maxWidth: 450,
          margin: 16,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h3 style={{ margin: '0 0 16px 0' }}>{titlePrefix}</h3>
        <p>
          <strong>Order #{order.id.slice(0, 8)}</strong> - {getOrderTypeLabel(order)}
        </p>

        {/* Amount summary depending on mode */}
        {mode ? (
          <div style={{ marginBottom: 12, fontSize: 13 }}>
            <div>
              Total bill:{' '}
              <strong>₹{(order.totalAmount ?? originalTotal).toFixed(2)}</strong>
            </div>
            <div>
              Already paid:{' '}
              <strong>₹{alreadyPaid.toFixed(2)}</strong>
            </div>
            {mode === 'collect' && (
              <div style={{ marginTop: 4, color: '#16a34a', fontWeight: 600 }}>
                Remaining to collect:{' '}
                ₹{(order.remainingAmount ?? 0).toFixed(2)}
              </div>
            )}
            {mode === 'refund' && (
              <div style={{ marginTop: 4, color: '#b91c1c', fontWeight: 600 }}>
                Refund to customer:{' '}
                ₹{refundAmount.toFixed(2)}
              </div>
            )}
          </div>
        ) : (
          <p>
            <strong>Amount: {money(originalTotal)}</strong>
          </p>
        )}

        <p style={{ marginBottom: 16 }}>
          <strong>
            {mode === 'refund'
              ? 'How will you adjust/refund the payment?'
              : 'How did the customer pay?'}
          </strong>
        </p>

        {/* Payment method selection */}
        <div
          style={{
            margin: '16px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {/* Cash Option */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              border:
                paymentMethod === 'cash'
                  ? '2px solid #2563eb'
                  : '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              backgroundColor:
                paymentMethod === 'cash' ? '#eff6ff' : 'white',
            }}
          >
            <input
              type="radio"
              value="cash"
              checked={paymentMethod === 'cash'}
              onChange={(e) => handleMethodSelect(e.target.value)}
            />
            <span>
              💵 {mode === 'refund' ? 'Refund in Cash' : 'Full Cash Payment'}
            </span>
          </label>

          {/* Online Option */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              border:
                paymentMethod === 'online'
                  ? '2px solid #2563eb'
                  : '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              backgroundColor:
                paymentMethod === 'online' ? '#eff6ff' : 'white',
            }}
          >
            <input
              type="radio"
              value="online"
              checked={paymentMethod === 'online'}
              onChange={(e) => handleMethodSelect(e.target.value)}
            />
            <span>
              🔗{' '}
              {mode === 'refund'
                ? 'Refund Online (UPI/Card)'
                : 'Full Online (UPI/Card)'}
            </span>
          </label>

          {/* Mixed Payment Option (only makes sense for collecting, not refund) */}
          {mode !== 'refund' && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                border:
                  paymentMethod === 'mixed'
                    ? '2px solid #2563eb'
                    : '1px solid #e5e7eb',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor:
                  paymentMethod === 'mixed' ? '#eff6ff' : 'white',
              }}
            >
              <input
                type="radio"
                value="mixed"
                checked={paymentMethod === 'mixed'}
                onChange={(e) => handleMethodSelect(e.target.value)}
              />
              <span>🔀 Mixed (Part Cash + Part Online)</span>
            </label>
          )}
        </div>

        {/* Mixed Payment Details Form (only when collecting) */}
        {showMixedForm && mode !== 'refund' && (
          <div
            style={{
              marginTop: '16px',
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ marginBottom: '12px' }}>
              <label
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Cash Amount (₹)
              </label>
              <input
                type="number"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                max={effectiveTotal}
                step="0.01"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Online Amount (₹)
              </label>
              <input
                type="number"
                value={onlineAmount}
                onChange={(e) => setOnlineAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                max={effectiveTotal}
                step="0.01"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
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
                  boxSizing: 'border-box',
                }}
              >
                <option value="upi">UPI</option>
                <option value="card">Credit/Debit Card</option>
                <option value="netbanking">Net Banking</option>
                <option value="wallet">Digital Wallet</option>
              </select>
            </div>

            <div
              style={{
                padding: '10px 12px',
                backgroundColor: '#eff6ff',
                borderLeft: '4px solid #2563eb',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#1e40af',
              }}
            >
              <strong>
                Total to collect now: ₹{effectiveTotal.toFixed(2)}
              </strong>
              <br />
              <strong>Split:</strong> ₹{cashAmount || '0'} (Cash) + ₹
              {onlineAmount || '0'} ({onlineMethod.toUpperCase()})
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <Button
            onClick={handleConfirm}
            variant="success"
            style={{ flex: 1 }}
          >
            {mode === 'refund'
              ? 'Confirm refund & complete'
              : `Yes, ${
                  paymentMethod === 'mixed'
                    ? 'Mixed'
                    : paymentMethod === 'cash'
                    ? 'Cash'
                    : 'Online'
                } received`}
          </Button>
          <Button
            onClick={onCancel}
            variant="outline"
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditOrderPanel({ order, onClose, onSave }) {
  const [originalLines] = useState(() => toDisplayItems(order)); // snapshot of original
  const [lines, setLines] = useState(() => toDisplayItems(order));
  const [showMenuPicker, setShowMenuPicker] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [saving, setSaving] = useState(false);

  const total = lines.reduce(
    (sum, l) => sum + (Number(l.price) || 0) * (Number(l.quantity) || 0),
    0
  );

  const updateQty = (index, qty) => {
    setLines((prev) => {
      if (qty <= 0) {
        return prev.filter((_, i) => i !== index); // 0 = delete
      }
      return prev.map((l, i) => (i === index ? { ...l, quantity: qty } : l));
    });
  };

  const removeLine = (index) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Normalize lines by content only (name, price, quantity) for change detection
  const normalizeLines = (arr) =>
    (arr || [])
      .map((l) => ({
        name: (l.name || '').trim().toLowerCase(),
        quantity: Number(l.quantity) || 0,
        price: Number(l.price) || 0,
      }))
      .sort((a, b) => {
        const n = a.name.localeCompare(b.name);
        if (n !== 0) return n;
        const p = a.price - b.price;
        if (p !== 0) return p;
        return a.quantity - b.quantity;
      });

  const hasChanges = (() => {
    const a = normalizeLines(originalLines);
    const b = normalizeLines(lines);
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      if (
        a[i].name !== b[i].name ||
        a[i].quantity !== b[i].quantity ||
        a[i].price !== b[i].price
      ) {
        return true;
      }
    }
    return false;
  })();

  const handleSave = () => {
    // guard: no lines, no real change, or already saving
    if (lines.length === 0 || !hasChanges || saving) return;
    setSaving(true);
    onSave({
      ...order,
      lines,
      total,
    });
    // parent should close/unmount panel after success
  };

  const openMenuPicker = async () => {
    try {
      const s = getSupabase();
      const { data, error } = await s
        .from('menu_items')
        .select('id, name, price')
        .eq('restaurant_id', order.restaurant_id);

      if (error) {
        console.error('menu_items fetch error', error);
        return;
      }

      setMenuItems(data || []);
      setMenuSearch('');
      setShowMenuPicker(true);
    } catch (e) {
      console.error('menu_items fetch exception', e);
    }
  };

  const addMenuItemToLines = (item) => {
    setLines((prev) => {
      const existingIndex = prev.findIndex(
        (l) => l.menu_item_id === item.id || l.name === item.name
      );

      // If already exists, just increase qty
      if (existingIndex !== -1) {
        return prev.map((l, i) =>
          i === existingIndex
            ? { ...l, quantity: (Number(l.quantity) || 0) + 1 }
            : l
        );
      }

      // Otherwise add new line
      return [
        ...prev,
        {
          name: item.name,
          quantity: 1,
          price: item.price,
          menu_item_id: item.id,
        },
      ];
    });

    setShowMenuPicker(false);
  };

  const filteredMenuItems = menuItems.filter((m) =>
    m.name.toLowerCase().includes(menuSearch.toLowerCase())
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          backgroundColor: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(15,23,42,0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              Edit Order #{order.id.slice(0, 8)}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              {getOrderTypeLabel(order)}
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px 80px',
          }}
        >
          {/* Item list */}
          {lines.map((line, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {line.name || 'Item'}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  ₹{Number(line.price || 0).toFixed(2)}
                </div>
              </div>

              {/* Qty pill with icons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  padding: '2px 8px',
                  background: '#f9fafb',
                }}
              >
                <span
                  onClick={() =>
                    updateQty(idx, (Number(line.quantity) || 0) - 1)
                  }
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '999px',
                    backgroundColor: '#fee2e2',
                    color: '#b91c1c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                  title="Decrease"
                >
                  −
                </span>
                <span
                  style={{
                    minWidth: 24,
                    textAlign: 'center',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#111827',
                  }}
                >
                  {line.quantity}
                </span>
                <span
                  onClick={() =>
                    updateQty(idx, (Number(line.quantity) || 0) + 1)
                  }
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '999px',
                    backgroundColor: '#dcfce7',
                    color: '#16a34a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                  title="Increase"
                >
                  +
                </span>
              </div>

              {/* Delete icon */}
              <span
                onClick={() => removeLine(idx)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '999px',
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
                title="Remove item"
              >
                🗑
              </span>
            </div>
          ))}

          {/* Add item */}
          <button
            onClick={openMenuPicker}
            style={{
              marginTop: 10,
              border: '1px dashed #9ca3af',
              background: '#f9fafb',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
              cursor: 'pointer',
              width: '100%',
              color: '#4b5563',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 16, color: '#22c55e' }}>＋</span>
            <span>Add item from menu</span>
          </button>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid #e5e7eb',
            padding: '12px 16px',
            backgroundColor: '#f9fafb',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 8,
              fontSize: 14,
            }}
          >
            <span>Total</span>
            <strong>₹{total.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="outline"
              style={{ flex: 1 }}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="success"
              style={{ flex: 1 }}
              onClick={handleSave}
              disabled={lines.length === 0 || !hasChanges || saving}
            >
              {saving ? 'Saving…' : 'Save & Reprint KOT'}
            </Button>
          </div>
        </div>
      </div>

      {/* Menu picker popup */}
      {showMenuPicker && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              maxHeight: '80vh',
              backgroundColor: '#fff',
              borderRadius: 12,
              boxShadow: '0 18px 36px rgba(15,23,42,0.4)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#eff6ff',
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: '#1d4ed8',
                }}
              >
                Add item from menu
              </div>
              <button
                onClick={() => setShowMenuPicker(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 18,
                  cursor: 'pointer',
                  color: '#6b7280',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '10px 14px' }}>
              <input
                type="text"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Search menu items…"
                style={{
                  width: '100%',
                  borderRadius: 999,
                  border: '1px solid #d1d5db',
                  padding: '6px 12px',
                  fontSize: 13,
                }}
              />
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0 14px 12px',
              }}
            >
              {filteredMenuItems.length === 0 ? (
                <div
                  style={{
                    fontSize: 13,
                    color: '#9ca3af',
                    padding: '8px 0',
                  }}
                >
                  No items found.
                </div>
              ) : (
                filteredMenuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addMenuItemToLines(item)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: '#f9fafb',
                      borderRadius: 10,
                      padding: '8px 10px',
                      marginBottom: 6,
                      cursor: 'pointer',
                      transition: 'background-color 0.12s, transform 0.08s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#e0f2fe';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#f9fafb';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: '#111827',
                        }}
                      >
                        {item.name}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#16a34a',
                          fontWeight: 600,
                        }}
                      >
                        ₹{Number(item.price || 0).toFixed(2)}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
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
  const [editingOrder, setEditingOrder] = useState(null);


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
   
      const { data: invoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('order_id', cancelOrderDialog.id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

      if (invoice) {
      console.log('[CANCEL ORDER] Found invoice, voiding:', invoice.id);
      const res = await fetch('/api/invoices/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.id,
          restaurant_id: restaurantId,
          reason: reason,
        }),
      });
 if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        console.warn('[CANCEL ORDER] Invoice void failed (non-critical):', j?.error);
        // Don't throw - order cancel + stock restore should succeed anyway
      } else {
        console.log('[CANCEL ORDER] Invoice voided successfully');
      }
    } else {
      console.log('[CANCEL ORDER] No invoice found - skipping void');
    }
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

const handleEditSave = async (edited) => {
  try {
    if (!restaurantId) {
      setError('No restaurant selected');
      return;
    }

    const resp = await fetch('/api/orders/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: edited.id,
        restaurant_id: restaurantId,
        lines: edited.lines,
        reason: 'Order edited from dashboard',
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      setError(data.error || 'Failed to edit order');
      return;
    }
 
    window.dispatchEvent(
      new CustomEvent('auto-print-order', {
        detail: {
          ...data.order_for_print,
          autoPrint: true,
          kind: 'kot',
        },
      })
    );

    // Refresh & close
    await loadOrders();
    setEditingOrder(null);
   

  } catch (e) {
    setError(e.message || 'Failed to save order changes');
  }
};




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
      const { data, error } = await q.order('updated_at', { ascending: false }).range(0, to);
      if (error) throw error;
      return data;
    }

    const { data, error } = await q.order('updated_at', { ascending: true });
    if (error) throw error;
    return data;
  }
  
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
    const { data, error } = await q
      .order('updated_at', { ascending: false })
      .range(0, to);
    if (error) throw error;
    return data;
  }

  const { data, error } = await q.order('updated_at', { ascending: true });
  if (error) throw error;
  return data;
}

// ✅ Only ONE loadOrders, independent of completedPage
const loadOrders = useCallback(
  async (page = 1) => {
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

      setOrdersByStatus({
        new: n,
        in_progress: i,
        ready: r,
        completed: c,
        mobileFilter: 'new',
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  },
  [restaurantId, supabase]
);

// Initial load / when restaurant changes
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
            .gte('updated_at', new Date(Date.now() - 120000).toISOString())
            .order('updated_at', { ascending: true });
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

  const finalize = async (order) => {


 if (!order?.id || !supabase || !restaurantId) return;

  // 1) Load latest invoice for this order
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('order_id', order.id)
    .order('invoice_date', { ascending: false })
    .maybeSingle();

  if (invErr) {
    console.error('Invoice fetch error in finalize:', invErr);
  }
  //  const fullOrder = {
  //   ...order,
  //   invoice,
  // };

  // ✅ Check PAYMENT_METHOD first for credit orders
  if (order?.payment_method === 'credit') {
    // Credit orders don't need payment confirmation - just complete
    complete(order.id);
    return;
  }

  // If invoice already exists, customer paid online - skip dialog
  if (invoice.status == 'paid') {
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
    // ✅ REPLACE the fetch() block with this:
const { data: updatedInvoice, error: invoiceErr } = await supabase
  .from('invoices')
  .update({
    payment_method: finalPaymentMethod,
    mixed_payment_details: mixedDetails,
    status: 'paid'
  })
  .eq('order_id', orderId)
  .eq('restaurant_id', restaurantId)
  .select();

if (invoiceErr) {
  if (invoiceErr.code === 'PGRST116') { // No rows updated (no invoice exists)
    console.warn('No existing invoice - skipping update');
  } else {
    throw new Error(`Invoice update failed: ${invoiceErr.message}`);
  }
}

console.log('Invoice updated:', updatedInvoice?.[0]);

    loadOrders();
  } catch (e) {
    setError(e.message);
  } finally {
    setGeneratingInvoice(null);
  }
};



  if (checking || restLoading) return <div style={{ padding:16 }}>Loading…</div>;
  if (!restaurantId) return <div style={{ padding:16 }}>No restaurant found.</div>;

// Before rendering mobile list:
let mobileOrders;

if (ordersByStatus.mobileFilter === 'inprogress') {
  // Cooking column: oldest → newest
  mobileOrders = [
    ...ordersByStatus.in_progress,
    ...ordersByStatus.ready,
  ].sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
} else if (ordersByStatus.mobileFilter === 'completed') {
  // Done: newest → oldest
  mobileOrders = [...(ordersByStatus.completed || [])].sort(
    (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
  );
} else {
  // New column: oldest → newest
  mobileOrders = [...(ordersByStatus[ordersByStatus.mobileFilter] || [])].sort(
    (a, b) => new Date(a.updated_at) - new Date(b.updated_at)
  );
}



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
  {UI_COLUMNS.map((col) => {
    const count =
      col.id === 'inprogress'
        ? ordersByStatus.in_progress.length + ordersByStatus.ready.length
        : (ordersByStatus[col.id] || []).length;

    return (
      <button
        key={col.id}
        className={`chip ${col.id === ordersByStatus.mobileFilter ? 'chip--active' : ''}`}
        onClick={() =>
          setOrdersByStatus((prev) => ({ ...prev, mobileFilter: col.id }))
        }
      >
        <span className="chip-label">{col.label}</span>
        <span className="chip-count">{count}</span>
      </button>
    );
  })}
</div>



      {/* Mobile list */}
      <div className="mobile-list orders-list">
  {mobileOrders.length === 0 ? (
    <Card className="muted" padding={12} style={{ textAlign: 'center' }}>
      No {ordersByStatus.mobileFilter === 'inprogress' ? 'in progress' : ordersByStatus.mobileFilter} orders
    </Card>
  ) : (
    mobileOrders.map((order) => (
      <OrderCard
        key={order.id}
        order={order}
        statusColor={COLORS[order.status]}
        onChangeStatus={updateStatus}
        onComplete={finalize}
        generatingInvoice={generatingInvoice}
        onPrintKot={() => {
          window.dispatchEvent(
            new CustomEvent('auto-print-order', {
              detail: { ...order, autoPrint: true, kind: 'kot' }
            })
          );
        }}
        onPrintBill={async () => {
          try {
            const s = getSupabase();
            const { data: invoice } = await s
              .from('invoices')
              .select('invoice_no')
              .eq('order_id', order.id)
              .order('invoice_date', { ascending: false })
              .maybeSingle();

            const orderForPrint = {
              ...order,
              invoice_no: invoice?.invoice_no || null,
            };

            window.dispatchEvent(
              new CustomEvent('auto-print-order', {
                detail: { ...orderForPrint, autoPrint: true, kind: 'bill' }
              })
            );
          } catch (err) {
            console.error('Print bill invoice fetch failed (mobile)', err);
            window.dispatchEvent(
              new CustomEvent('auto-print-order', {
                detail: { ...order, autoPrint: true, kind: 'bill' }
              })
            );
          }
        }}
        onCancelOrderOpen={onCancelOrderOpen}
        onEditOrder={(order) => setEditingOrder(order)}

      />
    ))
  )}
</div>



      {/* Kanban grid for desktop */}
   <div className="kanban"> 
  {UI_COLUMNS.map((col) => {
    let colOrders = col.statuses.flatMap((st) => ordersByStatus[st] || []);

colOrders =
  col.id === 'completed'
    // Done: newest → oldest
    ? [...colOrders].sort(
        (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
      )
    // Other columns: oldest → newest
    : [...colOrders].sort(
        (a, b) => new Date(a.updated_at) - new Date(b.updated_at)
      );


    return (
      <Card key={col.id} padding={12}>
        <div className="kanban-col-header">
          <strong style={{ color: COLORS[col.statuses[0]] }}>
            {col.label}
          </strong>
          <span className="pill">{colOrders.length}</span>
        </div>
        <div className="kanban-col-body">
          {colOrders.length === 0 ? (
            <div className="empty-col">
              No {col.label.toLowerCase()} orders
            </div>
          ) : (
            colOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                statusColor={COLORS[order.status]}
                onChangeStatus={updateStatus}
                onComplete={finalize}
                generatingInvoice={generatingInvoice}
                onPrintKot={() => {
                  window.dispatchEvent(
                    new CustomEvent('auto-print-order', {
                      detail: { ...order, autoPrint: true, kind: 'kot' }
                    })
                  );
                }}
                onPrintBill={async () => {
                  try {
                    const s = getSupabase();
                    const { data: invoice } = await s
                      .from('invoices')
                      .select('invoice_no')
                      .eq('order_id', order.id)
                      .order('invoice_date', { ascending: false })
                      .maybeSingle();
                    const orderForPrint = {
                      ...order,
                      invoice_no: invoice?.invoice_no || null,
                    };

                    window.dispatchEvent(
                      new CustomEvent('auto-print-order', {
                        detail: { ...orderForPrint, autoPrint: true, kind: 'bill' }
                      })
                    );
                  } catch (err) {
                    console.error('Print bill invoice fetch failed (desktop)', err);
                    window.dispatchEvent(
                      new CustomEvent('auto-print-order', {
                        detail: { ...order, autoPrint: true, kind: 'bill' }
                      })
                    );
                  }
                }}
                onCancelOrderOpen={onCancelOrderOpen}
                onEditOrder={(order) => setEditingOrder(order)}
              />
            ))
          )}

          {/* Keep pagination only on Done column */}
          {col.id === 'completed' &&
            ordersByStatus.completed.length >= PAGE_SIZE && (
              <>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  Showing latest {ordersByStatus.completed.length} completed
                  orders
                </div>
                <div style={{ paddingTop: 8 }}>
                  <Button
  variant="outline"
  onClick={() => {
    const next = completedPage + 1;
    setCompletedPage(next);
    loadOrders(next);
  }}
>
  Load more
</Button>

                </div>
              </>
            )}
        </div>
      </Card>
    );
  })}
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

         {editingOrder && (
  <EditOrderPanel
    order={editingOrder}
    onClose={() => setEditingOrder(null)}
    onSave={handleEditSave}
  />
)}


      <style jsx>{`
.orders-wrap { padding:12px 0 32px; }
.orders-header { display:flex; justify-content:space-between; align-items:center; padding:0 12px 12px; gap:10px; }
.orders-header h1 { margin:0; font-size:clamp(20px,2.6vw,28px); }
.header-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.muted { color:#6b7280; font-size:14px; }
.mobile-list { display:none; }
.kanban { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; padding:12px 16px; }
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
function OrderCard({
  order,
  statusColor,
  onChangeStatus,
  onComplete,
  generatingInvoice,
  onPrintKot,
  onPrintBill,
  onCancelOrderOpen,
  onEditOrder
}) {
  const items = toDisplayItems(order);
  const total = computeOrderTotalDisplay(order);

  const isCreditOrder = order?.is_credit && order?.credit_customer_id;
  const pm = String(order.payment_method || '').toLowerCase();
  const isOnlinePaid = pm === 'upi' || pm === 'card' || pm === 'online';

  // remove handlePrintBill here – use callbacks from props instead

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
              {new Date(order.updated_at).toLocaleTimeString()}
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
{/* NEW orders (unchanged) */}
{order.status === 'new' && (
  <>
    <Button size="sm" onClick={() => onChangeStatus(order.id, 'in_progress')}>
      Start
    </Button>
     <Button
      size="sm"
     style={{ backgroundColor: '#eab308', color: '#fff' }}
      onClick={() => onEditOrder(order)}
    >
      Edit
    </Button>

    <Button
      size="sm"
      variant="danger"
      onClick={() => onCancelOrderOpen(order)}
    >
      Cancel
    </Button>
    <button
      onClick={() => onPrintKot && onPrintKot(order)}
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

{(order.status === 'in_progress' || order.status === 'ready') && (
  <>
   <Button
      size="sm"
      onClick={() => onComplete(order)}
      disabled={generatingInvoice === order.id}
      title="Complete order and generate invoice"
    >
      {generatingInvoice === order.id ? 'Processing…' : 'Done'}
    </Button>
     <Button
      size="sm"
     style={{ backgroundColor: '#eab308', color: '#fff' }}
      onClick={() => onEditOrder(order)}
    >
      Edit
    </Button>

    <Button
      size="sm"
      variant="danger"
      onClick={() => onCancelOrderOpen(order)}
    >
      Cancel
    </Button>
      <button
      onClick={() => onPrintBill && onPrintBill(order)}
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

{order.status === 'completed' && (
  <>
    <Button
      size="sm"
      onClick={async () => {
        try {
          await downloadInvoicePdf(order.id)
        } catch (e) {
          alert(e.message || 'Failed to download invoice')
        }
      }}
      disabled={generatingInvoice === order.id}
    >
      Invoice
    </Button>

    <button
      onClick={() => onPrintBill && onPrintBill(order)}
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
