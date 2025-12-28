//pages/owner/orders.js 

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useRouter } from 'next/router'; // <-- Import useRouter at the top!
import { Capacitor } from '@capacitor/core';
import { getSupabase } from '../../services/supabase';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { subscribeOwnerDevice } from '../../helpers/subscribePush';
import { downloadInvoicePdf } from '../../lib/downloadInvoicePdf'
import VariantSelector from '../../components/VariantSelector'
import NiceSelect from '../../components/NiceSelect'
import { round2, roundP, formatQtyP } from '../../lib/qty'

const BRAND = {
  orange: '#f97316',
  white: '#ffffff',
  slate: '#f8fafc',
  gray: '#64748b',
  border: '#e2e8f0'
};

/* --- Styled Components --- */
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(249, 115, 22, 0); }
  100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
`;

const tooltipFade = keyframes`
  from { opacity: 0; transform: translateX(-50%) translateY(0); }
  to { opacity: 1; transform: translateX(-50%) translateY(-5px); }
`;

const OrdersContainer = styled.div`
  min-height: 100vh;
  background: #f8fafc;
  padding-bottom: 80px;

  @media (min-width: 1024px) {
    padding-left: 280px; /* Sidebar width */
  }
`;

// Live Pulse Dot Component
const PulseDot = styled.span`
  width: 8px;
  height: 8px;
  background-color: #f97316;
  border-radius: 50%;
  display: inline-block;
  animation: ${pulse} 2s infinite;
  flex-shrink: 0;
`;
const PageWrapper = styled.div`
  min-height: 100vh;
  background: ${BRAND.slate};
  padding: 24px;
  font-family: 'Inter', sans-serif;
  padding-bottom: 80px;

  @media (max-width: 768px) {
    padding: 16px;
    padding-bottom: 100px; /* Space for bottom nav */
  }
`;

const Header = styled.header`
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h1 {
    font-size: 28px;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
    letter-spacing: -0.02em;
  }
  p {
    color: ${BRAND.gray};
    font-size: 14px;
    margin-top: 4px;
  }
`;

const SearchWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px; 
  border-radius: 9999px;
  background: white;
  border: 1px solid #fed7aa; /* Subtle orange tint border */
  width: 100%;
  max-width: 600px; /* Larger max width */
  margin: 0 auto; /* Center it */
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(249, 115, 22, 0.05);
  
  &:focus-within {
    border-color: ${BRAND.orange};
    box-shadow: 0 0 0 4px ${BRAND.orange}25;
    transform: scale(1.01);
  }

  .search-icon {
    width: 22px;
    height: 22px;
    color: ${BRAND.orange}; /* Orange icon */
  }

  input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 16px; /* Larger font */
    outline: none;
    padding: 0;
    height: 32px;
    color: #1e293b;
    &::placeholder {
      color: #9ca3af;
    }
  }
  
  .clear-btn {
    border: none;
    background: #fff7ed;
    color: ${BRAND.orange};
    cursor: pointer;
    font-size: 12px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    &:hover {
      background: ${BRAND.orange};
      color: white;
    }
  }
`;

const ControlsBar = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 24px;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const Board = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  align-items: start;
  overflow-x: auto;
  padding-bottom: 20px;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(3, minmax(300px, 1fr));
  }
  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }
`;

const Column = styled.div`
  background: #f1f5f9;
  border-radius: 16px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
`;

const ColumnHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
  margin-bottom: 4px;

  h3 {
    font-size: 16px;
    font-weight: 700;
    color: #334155;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .count-badge {
    background: #e2e8f0;
    color: #475569;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 12px;
  }
`;

const OrderCardStyled = styled.div`
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  border: 1px solid transparent;
  transition: all 0.2s ease;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  flex-shrink: 0; /* Prevent collapsing in flex container */
  width: 100%;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    border-color: ${BRAND.orange}40;
  }

  &.is-new {
    border-top: 4px solid #3b82f6;
  }
  &.is-progress {
    border-top: 4px solid #f59e0b;
  }
  &.is-ready {
    border-top: 4px solid #10b981;
  }
  &.is-completed {
    border-top: 4px solid #10b981; /* Green for Done */
    opacity: 0.85;
  }
`;

const OrderHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;

  .order-id {
    font-weight: 700;
    font-size: 15px;
    color: #1e293b;
  }
  .order-time {
    font-size: 11px;
    color: #64748b;
    font-weight: 500;
  }
`;

const TableBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #fff7ed;
  color: ${BRAND.orange};
  font-weight: 700;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  margin-top: 4px;
`;

const ItemsList = styled.div`
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;

  .item-row {
    font-size: 13px;
    color: #334155;
    display: flex;
    justify-content: space-between;
  }
  .item-qty {
    font-weight: 600;
    color: #0f172a;
    margin-right: 6px;
  }
  .item-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more-items {
    font-size: 11px;
    color: #94a3b8;
    font-style: italic;
  }
`;

const CardFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
  margin-top: 8px;
`;

const PriceTag = styled.div`
  font-weight: 700;
  color: #0f172a;
  font-size: 15px;
`;

const TooltipSpan = styled.span`
  position: relative;
  
  &[data-tip]:hover::before {
    content: attr(data-tip);
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%) translateY(-5px);
    background: #f97316; /* Brand Orange */
    color: white;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
    z-index: 20;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    animation: ${tooltipFade} 0.2s ease-out;
  }

  &[data-tip]:hover::after {
    content: '';
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%) translateY(1px);
    border: 4px solid transparent;
    border-top-color: #f97316;
    pointer-events: none;
    z-index: 20;
  }
`;


// Constants
const STATUSES = ['new','in_progress','ready','completed'];
const LABELS = { new: 'New', in_progress: 'Cooking', ready: 'Ready', completed: 'Done' };
const COLORS = { new: '#3b82f6', in_progress: '#f59e0b', ready: '#10b981', completed: '#10b981' };
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

    // Skip packaged goods check removed to allow restoration


    // Fetch recipe for this menu item
    // Fetch recipe for this menu item
    // We need to handle variants if present
    
    // Attempt to find specific recipe for variant, else base
    let recipeQuery = supabase
      .from('recipes')
      .select('id, variant_option_id, recipe_items(ingredient_id, quantity)')
      .eq('menu_item_id', oi.menu_item_id)
      .eq('restaurant_id', restaurantId)

    const { data: potentialRecipes, error: recipeErr } = await recipeQuery
    
    console.log('[STOCK RESTORE] Recipe fetch result:', { potentialRecipes, error: recipeErr })
    
    if (recipeErr || !potentialRecipes?.length) {
      console.log('[STOCK RESTORE] No recipes found or error')
      continue
    }

    let targetVariantId = oi.variant_option_id || oi.variant_id || null;

    // Fallback: If ID is missing but we have a name, look it up via variant_pricing
    if (!targetVariantId && oi.variant_name) {
      console.log('[STOCK RESTORE] Variant ID missing for', oi.variant_name, '- attempting lookup...');
      const { data: vpData, error: vpErr } = await supabase
        .from('variant_pricing')
        .select('variant_options!inner(id, name)')
        .eq('menu_item_id', oi.menu_item_id);
      
      if (vpErr) console.error('[STOCK RESTORE] Lookup error:', vpErr);

      if (vpData) {
        const normName = oi.variant_name.trim().toLowerCase();
        const match = vpData.find(v => v.variant_options?.name?.trim().toLowerCase() === normName);
        if (match && match.variant_options?.id) {
            targetVariantId = match.variant_options.id;
            console.log('[STOCK RESTORE] RESOLVED ID:', targetVariantId);
        } else {
            console.log('[STOCK RESTORE] No match found for name:', normName);
        }
      }
    }
    let recipe = potentialRecipes.find(r => {
      const rId = r.variant_option_id;
      if (!rId && !targetVariantId) return true; // Both null
      if (!rId || !targetVariantId) return false; // One is null
      return String(rId) === String(targetVariantId);
    })
    
    // Fallback to base
    if (!recipe && targetVariantId) {
      recipe = potentialRecipes.find(r => r.variant_option_id === null)
    }
    // If absolutely no match found (and no base), maybe pick first? Or behave strictly?
    // Let's behave strictly - if no base and no variant recipe, then no ingredients deducted.
    if (!recipe && !targetVariantId && potentialRecipes.length > 0) {
        recipe = potentialRecipes.find(r => r.variant_option_id === null)
    }

    if (!recipe?.recipe_items?.length) {
       console.log('[STOCK RESTORE] No recipe items found for matched recipe')
       continue
    }

    for (const ri of recipe.recipe_items) {
      console.log('[STOCK RESTORE] Processing ingredient:', ri.ingredient_id);
      
      // Get current stock
      const { data: ing, error: ingErr } = await supabase
        .from('ingredients')
        .select('id, current_stock, name, uom:unit_of_measures(precision)')
        .eq('id', ri.ingredient_id)
        .eq('restaurant_id', restaurantId)
        .single();
      
      if (ingErr || !ing) {
        console.error('[STOCK RESTORE] Ingredient fetch failed:', ingErr);
        continue;
      }

      const precision = ing.uom?.precision ?? 2;
      const addBack = roundP(Number(ri.quantity) * Number(oi.quantity), precision);

      const oldStock = Number(ing.current_stock || 0);
      const newStock = roundP(oldStock + addBack, precision);
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

function timeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m ago`;
}
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
  // Prioritize relational order_items as it contains joined menu info and precision
  if (Array.isArray(order.order_items) && order.order_items.length > 0) {
    return order.order_items.map((oi) => ({
      menu_item_id: oi.menu_item_id,
      name: oi.item_name || oi.menu_items?.name || 'Item',
      quantity: oi.quantity,
      price: oi.price,
      is_packaged_good: oi.is_packaged_good,
      variant_id: oi.variant_option_id || null,
      uom_short_code: oi.uom_short_code || null,
      uom_precision: oi.uom_precision ?? oi.menu_items?.uom?.precision ?? 0,
      notes: oi.notes,
    }));
  }
  // Fallback to JSONB items (legacy or if order_items missing)
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map((item) => ({
      ...item,
      menu_item_id: item.menu_item_id || item.id,
      uom_precision: item.uom_precision ?? 0, // Ensure precision check for JSONB too
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

  const mode = order.mode || null;
  const originalTotal = computeOrderTotalDisplay(order);

  const effectiveTotal =
    mode === 'collect'
      ? Number(order.remainingAmount ?? originalTotal)
      : (mode === 'refund' ? Number(order.refundAmount ?? 0) : originalTotal);

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
      alert('Amounts must be greater than 0');
      return false;
    }
    if (Math.abs(sum - effectiveTotal) > 0.01) {
      alert(`Total should be ₹${effectiveTotal.toFixed(2)}`);
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
        mode,
      });
    } else {
      onConfirm(paymentMethod, null);
    }
  };

  const titlePrefix =
    mode === 'collect' ? 'Payment Collection' : 
    mode === 'refund' ? 'Process Refund' : 
    'Complete Payment';

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, padding: 12
      }}
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
    >
      <div
        style={{
          background: 'white', width: '100%', maxWidth: 340,
          borderRadius: 16, padding: 20,
          boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.15)',
          maxHeight: '90vh', overflowY: 'auto',
          position: 'relative',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 2px 0', letterSpacing: '-0.01em' }}>{titlePrefix}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>
             <span>#{order.id.slice(0, 8)}</span>
             <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#f1f5f9' }}></div>
             <span>{getOrderTypeLabel(order)}</span>
          </div>
        </div>

        {/* Financial Highlights - Minimal */}
        <div style={{ marginBottom: 16, borderBottom: '1px solid #f8fafc', paddingBottom: 12 }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
              <span>Total Bill</span>
              <span style={{ fontWeight: 600, color: '#64748b' }}>₹{(order.totalAmount ?? originalTotal).toFixed(2)}</span>
           </div>
           
           {order.alreadyPaidAmount > 0.01 && (
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
                <span>Already Paid</span>
                <span style={{ fontWeight: 600, color: '#64748b' }}>₹{Number(order.alreadyPaidAmount).toFixed(2)}</span>
             </div>
           )}
           
           {(mode === 'collect' || mode === 'refund') && (
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: mode === 'collect' ? '#10b981' : '#ef4444', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                   {mode === 'collect' ? 'Collect' : 'Refund'}
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: mode === 'collect' ? '#0f172a' : '#ef4444' }}>
                   ₹{(mode === 'collect' ? (order.remainingAmount ?? 0) : (order.refundAmount ?? 0)).toFixed(2)}
                </span>
             </div>
           )}
        </div>

        {/* Method Selection Cards - Slim */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
           {[
             { id: 'cash', label: 'Cash', icon: '💵' },
             { id: 'online', label: 'Online', icon: '💳' },
             mode !== 'refund' && { id: 'mixed', label: 'Mixed', icon: '🔀' }
           ].filter(Boolean).map(opt => (
             <div 
               key={opt.id}
               onClick={() => handleMethodSelect(opt.id)}
               style={{
                 padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                 border: `1.5px solid ${paymentMethod === opt.id ? BRAND.orange : '#f8fafc'}`,
                 background: paymentMethod === opt.id ? `${BRAND.orange}05` : 'white',
                 display: 'flex', alignItems: 'center', gap: 10,
                 transition: 'all 0.1s ease'
               }}
             >
                <div style={{ 
                  width: 28, height: 28, borderRadius: 8, background: paymentMethod === opt.id ? BRAND.orange : '#f1f5f9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
                }}>
                   <span style={{ color: paymentMethod === opt.id ? 'white' : '#64748b' }}>{opt.icon}</span>
                </div>
                <div style={{ flex: 1 }}>
                   <div style={{ fontSize: 13, fontWeight: 700, color: paymentMethod === opt.id ? '#0f172a' : '#64748b' }}>{opt.label}</div>
                </div>
                <div style={{ 
                  width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${paymentMethod === opt.id ? BRAND.orange : '#cbd5e1'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                   {paymentMethod === opt.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND.orange }} />}
                </div>
             </div>
           ))}
        </div>

        {/* Mixed Split Form - Light & Compact */}
        {showMixedForm && mode !== 'refund' && (
          <div style={{ 
            marginTop: -10, marginBottom: 16, padding: 12, background: '#f8fafc', 
            borderRadius: 12, border: '1px solid #f1f5f9'
          }}>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                   <label style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Cash</label>
                   <input 
                     type="number" value={cashAmount} 
                     onChange={e => {
                        const val = e.target.value;
                        setCashAmount(val);
                        const c = Number(val);
                        if (!isNaN(c)) {
                           const rem = Math.max(0, effectiveTotal - c);
                           setOnlineAmount(rem.toFixed(2));
                        }
                     }}
                     placeholder="0.00" style={{ 
                        width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                        fontSize: 12, fontWeight: 600, outline: 'none'
                     }}
                   />
                </div>
                <div>
                   <label style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Online</label>
                   <input 
                     type="number" value={onlineAmount} onChange={e => setOnlineAmount(e.target.value)}
                     placeholder="0.00" style={{ 
                        width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                        fontSize: 12, fontWeight: 600, outline: 'none'
                     }}
                   />
                </div>
             </div>
             <div style={{ marginBottom: 110 }}>
                <label style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Channel</label>
                <NiceSelect
                  value={onlineMethod}
                  onChange={setOnlineMethod}
                  options={[
                    { value: 'upi', label: 'UPI' },
                    { value: 'card', label: 'Card' }
                  ]}
                />
             </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
           <Button
             onClick={onCancel}
             variant="outline"
             style={{ 
               flex: 1, padding: '8px', borderRadius: 10, fontSize: 13, fontWeight: 700, height: 38,
               borderColor: '#f1f5f9', color: '#94a3b8'
             }}
           >
             Cancel
           </Button>
           <Button
             onClick={handleConfirm}
             style={{ 
               flex: 1.5, padding: '8px', borderRadius: 10, 
               background: BRAND.orange, color: 'white',
               fontSize: 13, fontWeight: 700, height: 38
             }}
           >
             Finish
           </Button>
        </div>
      </div>
    </div>
  );
}

function EditOrderPanel({ order, onClose, onSave, tablesCount = 0 }) {
  const [originalLines] = useState(() => toDisplayItems(order)); // snapshot of original
  const [lines, setLines] = useState(() => toDisplayItems(order));
  
  // Initialize location state
  const [selectedLocation, setSelectedLocation] = useState(() => {
     if (order.order_type === 'parcel') return 'parcel';
     if (order.table_number) return `table:${order.table_number}`;
     return 'parcel'; // default fallback
  });

  const tables = Array.from({ length: tablesCount }, (_, i) => i + 1);
  const [showMenuPicker, setShowMenuPicker] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showVariantSelector, setShowVariantSelector] = useState(false);
  const [selectedItemForVariant, setSelectedItemForVariant] = useState(null);

  const total = lines.reduce(
    (sum, l) => sum + (Number(l.price) || 0) * (Number(l.quantity) || 0),
    0
  );

  const updateQty = (index, qty) => {
    setLines((prev) => {
      const line = prev[index];
      const precision = line?.uom_precision ?? 0;
      const roundedQty = roundP(Number(qty) || 0, precision);
      
      if (roundedQty <= 0) {
        return prev.filter((_, i) => i !== index); // 0 = delete
      }
      return prev.map((l, i) => (i === index ? { ...l, quantity: roundedQty } : l));
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
        variant_id: l.variant_id || null,
        quantity: Number(l.quantity) || 0,
        price: Number(l.price) || 0,
      }))
      .sort((a, b) => {
        const n = a.name.localeCompare(b.name);
        if (n !== 0) return n;
        const v = (a.variant_id || '').localeCompare(b.variant_id || '');
        if (v !== 0) return v;
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
        a[i].price !== b[i].price ||
        a[i].variant_id !== b[i].variant_id
      ) {
        return true;
      }
    }
    return false;
  })();
  
  // Detect if location changed
  const hasLocationChange = (() => {
     const origLoc = order.order_type === 'parcel' 
        ? 'parcel' 
        : (order.table_number ? `table:${order.table_number}` : 'parcel');
     return selectedLocation !== origLoc;
  })();

  const handleSave = () => {
    // guard: no lines, no change, or already saving
    if (lines.length === 0 || (!hasChanges && !hasLocationChange) || saving) return;
    
    // Parse location
    let tableNum = null;
    let orderType = 'dine-in';
    
    if (selectedLocation === 'parcel') {
       tableNum = null;
       orderType = 'parcel';
    } else if (selectedLocation && selectedLocation.startsWith('table:')) {
       tableNum = selectedLocation.split(':')[1];
       orderType = 'dine-in';
    }

    setSaving(true);
    onSave({
      ...order,
      lines,
      total,
      table_number: tableNum,
      order_type: orderType
    });
    // parent should close/unmount panel after success
  };

  const openMenuPicker = async () => {
    try {
      const s = getSupabase();
      
      // 1. Fetch menu items with variant template info
      const { data: menu, error } = await s
        .from('menu_items')
        .select(`
          id, name, price, is_packaged_good, has_variants,
          uom:unit_of_measures(short_code, precision),
          menu_item_variants (
            variant_templates (
              id,
              name
            )
          )
        `)
        .eq('restaurant_id', order.restaurant_id);

      if (error) {
        console.error('menu_items fetch error', error);
        return;
      }
      
      // 2. Fetch variant pricing/options for items that have them
      const itemsWithVariants = (menu || []).filter(item => item.has_variants);
      const variantDataMap = new Map();
      
      if (itemsWithVariants.length > 0) {
        const itemIds = itemsWithVariants.map(item => item.id);
        const { data: variantPricing, error: vpError } = await s
          .from('variant_pricing')
          .select(`
            menu_item_id,
            price,
            is_available,
            variant_options(
              id,
              name,
              display_order,
              template_id
            )
          `)
          .in('menu_item_id', itemIds);
          
         if (vpError) {
             console.error('variant_pricing fetch error', vpError);
         } else {
            // Group by menu_item_id
            (variantPricing || []).forEach(vp => {
              if (!variantDataMap.has(vp.menu_item_id)) {
                variantDataMap.set(vp.menu_item_id, []);
              }
              // Guard against missing variant_options relation
              if (vp.variant_options) {
                  variantDataMap.get(vp.menu_item_id).push({
                    variant_id: vp.variant_options.id,
                    variant_name: vp.variant_options.name,
                    price: vp.price,
                    is_available: vp.is_available,
                    display_order: vp.variant_options.display_order
                  });
              }
            });
         }
      }

      // 3. Attach variants to items
      const finalItems = (menu || []).map(item => {
          const variants = variantDataMap.get(item.id) || [];
          const templateName = item.menu_item_variants?.[0]?.variant_templates?.name || 'Options';
          
          return {
            ...item,
            variants: variants.sort((a, b) => a.display_order - b.display_order),
            variant_template_name: item.has_variants ? templateName : null
          };
      });

      setMenuItems(finalItems);
      setMenuSearch('');
      setShowMenuPicker(true);
    } catch (e) {
      console.error('menu_items fetch exception', e);
    }
  };

  const addMenuItemToLines = (item) => {
    const variantId = item.selectedVariant?.variant_id || item.variant_id || null;
    const finalName = item.displayName || item.name;
    
    // Robust Pricing Logic:
    // 1. Start with the price passed on the item (which might be variant price from Selector)
    let finalPrice = item.price; 
    
    // 2. If valid variant selected, ensure we use its price
    if (item.selectedVariant) {
        const vp = item.selectedVariant.price;
        // Accept 0 as valid price, but reject null/undefined
        if (vp !== undefined && vp !== null) {
             finalPrice = Number(vp);
        }
    }
    
    // 3. Fallback: If price is missing/invalid (e.g. from bad spread), look up original Base Price
    if (finalPrice === undefined || finalPrice === null || Number.isNaN(finalPrice)) {
        const originalBase = menuItems.find(mi => String(mi.id) === String(item.id || item.menu_item_id));
        finalPrice = Number(originalBase?.price || 0);
    } else {
        finalPrice = Number(finalPrice);
    }
    
    const qtyToAdd = Number(item.quantity) || 1;
    
    setLines((prev) => {
      const existingIndex = prev.findIndex((l) => {
        const sameItem = String(l.menu_item_id) === String(item.id);
        const sameVariant = String(l.variant_id || '') === String(variantId || '');
        const sameName = (l.name || '').trim().toLowerCase() === (finalName || '').trim().toLowerCase();
        
        // Match if (Same ID AND Same Variant) OR (Same Name)
        // This covers cases where ID might have changed but it's the same product name
        return (sameItem && sameVariant) || sameName;
      });

      // If already exists, just increase qty and update details to latest
      if (existingIndex !== -1) {
        return prev.map((l, i) =>
          i === existingIndex
            ? { 
                ...l, 
                quantity: roundP((Number(l.quantity) || 0) + qtyToAdd, item.uom?.precision ?? l.uom_precision ?? 0),
                price: finalPrice, 
                variant_id: variantId || l.variant_id,
                menu_item_id: item.id, // Update ID to current
                name: finalName, // Update name formatting if needed
                uom_precision: item.uom?.precision ?? l.uom_precision ?? 0,
                uom_short_code: item.uom?.short_code ?? l.uom_short_code ?? null
              }
            : l
        );
      }
      // Otherwise add new line
      return [
        ...prev,
        {
          name: finalName,
          quantity: roundP(qtyToAdd, item.uom?.precision ?? 0),
          price: finalPrice,
          menu_item_id: item.id,
          is_packaged_good: !!item.is_packaged_good,
          variant_id: variantId,
          uom_precision: item.uom?.precision ?? 0,
          uom_short_code: item.uom?.short_code ?? null,
        },
      ];
    });

    setShowMenuPicker(false);
  };

  const handleItemClick = (item) => {
      if (item.has_variants) {
          setSelectedItemForVariant(item);
          setShowVariantSelector(true);
      } else {
          addMenuItemToLines(item);
      }
  }

  const handleVariantSelect = (itemWithVariant) => {
      addMenuItemToLines(itemWithVariant);
      setShowVariantSelector(false);
      setSelectedItemForVariant(null);
  }

  // Refetch/Sync prices with current menu when menuItems loads
  // This fixes the issue where an edited order might have stale/incorrect base prices (e.g. 1000 instead of 2000)
  useEffect(() => {
    if (menuItems.length > 0 && lines.length > 0) {
      setLines(prevLines => {
        return prevLines.map(line => {
          // Find matching menu item
          const menuItem = menuItems.find(m => String(m.id) === String(line.menu_item_id || line.id));
          if (!menuItem) return line;

          // If line has a variant, find updated variant price
          if (line.variant_id) {
             const variant = menuItem.variants?.find(v => String(v.variant_id) === String(line.variant_id));
             if (variant && variant.price !== undefined && variant.price !== null) {
               // Only update if price is different to avoid unnecessary renders/changes
               if (Number(line.price) !== Number(variant.price)) {
                 return { ...line, price: Number(variant.price) };
               }
             }
          } else {
             // No variant - update to base price
             if (menuItem.price !== undefined && menuItem.price !== null) {
                if (Number(line.price) !== Number(menuItem.price)) {
                  return { ...line, price: Number(menuItem.price) };
                }
             }
          }
          return line;
        });
      });
    }
  }, [menuItems]); // Run when menu items are fetched


  const filteredMenuItems = menuItems.filter((m) =>
    m.name.toLowerCase().includes(menuSearch.toLowerCase())
  );

  // Draft state for quantity inputs to allow smooth decimal typing
  const [qtyDrafts, setQtyDrafts] = useState({});

  const commitDraft = (idx, val, precision) => {
    const p = precision ?? 2;
    let num = parseFloat(val);
    if (isNaN(num)) num = 0;
    
    // Clear draft so it syncs with source of truth
    setQtyDrafts(prev => {
        const next = { ...prev };
        delete next[idx];
        return next;
    });

    // Update actual state
    updateQty(idx, num);
  };

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
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              Edit Order #{order.id.slice(0, 8)}
            </div>
            {/* Table Selection Removed per user request */}
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

              {/* Qty Control (Cart Style) */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: `${BRAND.orange}20`, // Soft orange background
                  borderRadius: 8,
                  border: `1px solid ${BRAND.orange}`,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  overflow: 'hidden',
                  height: 32,
                }}
              >
                <button
                  onClick={() => {
                    const step = line.uom_precision > 0 ? (1 / Math.pow(10, line.uom_precision)) : 1;
                    updateQty(idx, (Number(line.quantity) || 0) - step);
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    border: 'none',
                    background: 'transparent',
                    color: BRAND.orange,
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                  title="Decrease"
                >
                  −
                </button>

                <input
                  type="text"
                  inputMode="decimal"
                  value={qtyDrafts[idx] ?? Number(line.quantity || 0).toFixed(line.uom_precision ?? 2)}
                  onChange={(e) => {
                     const val = e.target.value;
                     setQtyDrafts(prev => ({ ...prev, [idx]: val }));
                  }}
                  onBlur={(e) => commitDraft(idx, e.target.value, line.uom_precision)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  style={{
                    width: 50, // Slightly wider for decimals
                    height: 32,
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#1e293b',
                    outline: 'none',
                    padding: 0,
                    appearance: 'textfield',
                    flexShrink: 0
                  }}
                />

                <button
                  onClick={() => {
                     const step = line.uom_precision > 0 ? (1 / Math.pow(10, line.uom_precision)) : 1;
                     updateQty(idx, (Number(line.quantity) || 0) + step);
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    border: 'none',
                    background: 'transparent',
                    color: BRAND.orange,
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                  title="Increase"
                >
                  +
                </button>
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
              variant="primary"
              style={{ flex: 1 }}
              onClick={handleSave}
              disabled={lines.length === 0 || (!hasChanges && !hasLocationChange) || saving}
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
                    onClick={() => handleItemClick(item)}
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

      {showVariantSelector && selectedItemForVariant && (
        <VariantSelector
            item={selectedItemForVariant}
            onSelect={handleVariantSelect}
            onClose={() => {
                setShowVariantSelector(false);
                setSelectedItemForVariant(null);
            }}
            gstEnabled={true} // Defaults for admin
            pricesIncludeTax={false} // Defaults for admin
            showImage={false}
            zIndex={1300}
        />
      )}
    </div>
  );
}



function CancelConfirmDialog({ order, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    await onConfirm(reason);
    if (mounted.current) {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 12
    }}>
      <div style={{ 
        backgroundColor: 'white', padding: 20, borderRadius: 16, maxWidth: 320, width: '100%',
        boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.15)',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0', letterSpacing: '-0.01em' }}>Cancel Order</h3>
        <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4, marginBottom: 16 }}>
          Are you sure you want to cancel order <strong>#{order.id.slice(0, 8)}</strong>? This cannot be undone.
        </p>
        
        <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Reason</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={2}
          style={{ 
            width: '100%', padding: '10px', fontSize: 12, borderRadius: 10, border: '1.5px solid #e2e8f0',
            outline: 'none', background: '#f8fafc', color: '#1e293b', marginBottom: 20
          }}
          placeholder="e.g. Mistake in order"
        />
        
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onCancel} variant="outline" style={{ flex: 1, height: 38, borderRadius: 10, fontSize: 13 }} disabled={submitting}>
            Keep
          </Button>
          <Button onClick={handleConfirm} variant="danger" style={{ flex: 1.5, height: 38, borderRadius: 10, fontSize: 13 }} disabled={!reason.trim() || submitting}>
            {submitting ? '...' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PaxEditDialog({ order, onSave, onClose }) {
  const [val, setVal] = useState(order.number_of_customers || '');
  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 12
    }}>
      <div style={{ 
        backgroundColor: 'white', padding: 20, borderRadius: 16, width: '100%', maxWidth: 280,
        boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.15)',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.01em' }}>Update Pax</h3>
        <p style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
            Set count for <strong>{order.table_number ? `T-${order.table_number}` : 'Counter'}</strong>
        </p>
        
        <label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Number of Pax</label>
        <input 
            type="number"
            autoFocus
            value={val}
            onChange={e => {
              const v = e.target.value;
              if (v === '') setVal('');
              else {
                const n = parseInt(v, 10);
                if (n >= 0) setVal(n);
              }
            }}
            placeholder="0"
            style={{ 
                width: '100%', padding: '10px', fontSize: 16, fontWeight: 700,
                border: '1.5px solid #e2e8f0', borderRadius: 10,
                outline: 'none', background: '#f8fafc', color: '#0f172a',
                marginBottom: 16, textAlign: 'center'
            }}
        />
        
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onClose} variant="outline" style={{ flex: 1, height: 38, borderRadius: 10, fontSize: 13 }}>Cancel</Button>
          <Button onClick={() => onSave(val)} style={{ flex: 1.5, height: 38, borderRadius: 10, background: BRAND.orange, color: 'white', fontSize: 13 }}>Update</Button>
        </div>
      </div>
    </div>
  );
}


function TableEditDialog({ order, onSave, onClose, tablesCount = 0 }) {
  const [val, setVal] = useState(() => {
    if (order.order_type === 'parcel') return 'parcel';
    if (order.table_number) return `table:${order.table_number}`;
    return '';
  });

  const tables = Array.from({ length: tablesCount }, (_, i) => i + 1);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 12
    }} onClick={onClose}>
      <div style={{ 
        backgroundColor: 'white', padding: 20, borderRadius: 16, width: '100%', maxWidth: 320,
        boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.15)',
        animation: 'fadeIn 0.2s ease-out'
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.01em' }}>Update Table / Type</h3>
        <p style={{ fontSize: 11, color: '#64748b', marginBottom: 16 }}>
            Set location for Order <strong>#{order.id.slice(0,6)}</strong>
        </p>

        <div style={{ marginBottom: 20 }}>
          <NiceSelect
            value={val}
            onChange={setVal}
            placeholder="Select Table or Parcel..."
            options={[
              { value: 'parcel', label: 'Parcel / Takeaway' },
              ...tables.map(n => ({ value: `table:${n}`, label: `Table ${n}` }))
            ]}
          />
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onClose} variant="outline" style={{ flex: 1, height: 38, borderRadius: 10, fontSize: 13 }}>Cancel</Button>
          <Button 
            onClick={() => onSave(val)} 
            disabled={!val}
            style={{ flex: 1.5, height: 38, borderRadius: 10, background: BRAND.orange, color: 'white', fontSize: 13 }}
          >
            Update
          </Button>
        </div>
      </div>
    </div>
  );
}

async function fetchFullOrder(supabase, orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, menu_items(name, uom:unit_of_measures(precision)))')
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
  const [paxEditOrder, setPaxEditOrder] = useState(null);
  const [tableEditOrder, setTableEditOrder] = useState(null);


  const [ordersByStatus, setOrdersByStatus] = useState({
    new: [], in_progress: [], ready: [], completed: [], mobileFilter: 'new'
  });
  
  const [tablesCount, setTablesCount] = useState(0);

  useEffect(() => {
    if (!restaurantId || !supabase) return;
    supabase
      .from('restaurant_profiles')
      .select('tables_count')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.tables_count) setTablesCount(data.tables_count);
      });
  }, [restaurantId, supabase]);
  
  const [completedPage, setCompletedPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingInvoice, setGeneratingInvoice] = useState(null);
  const [paymentConfirmDialog, setPaymentConfirmDialog] = useState(null);
  const [itemsModalOrder, setItemsModalOrder] = useState(null); // Global state for items modal
  const notificationAudioRef = useRef(null);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  
  // Touch state for swipe 
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const minSwipeDistance = 50; 

  const onTouchStart = (e) => {
    setTouchEnd(null); // Reset
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    // UI_COLUMNS: [0:new, 1:inprogress, 2:completed]
    const currentIndex = UI_COLUMNS.findIndex(c => c.id === ordersByStatus.mobileFilter);
    if (currentIndex === -1) return;

    if (isLeftSwipe) {
      // Next tab (swipe left)
      if (currentIndex < UI_COLUMNS.length - 1) {
        setOrdersByStatus(prev => ({...prev, mobileFilter: UI_COLUMNS[currentIndex + 1].id}));
      }
    } 
    if (isRightSwipe) {
      // Prev tab (swipe right)
      if (currentIndex > 0) {
        setOrdersByStatus(prev => ({...prev, mobileFilter: UI_COLUMNS[currentIndex - 1].id}));
      }
    }
  };

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
             is_packaged_good: item.is_packaged_good || false,
             variant_option_id: item.variant_id || item.variant_option_id || null, // Capture variant info
             variant_name: item.variant_name || null
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
        table_number: edited.table_number, // Pass table number update
        order_type: edited.order_type,     // Pass order type update
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
async function fetchBucket(status, page = 1, supabase, restaurantId) {
  if (!supabase || !restaurantId) return [];
  let q = supabase
    .from('orders')
    .select('*, order_items(*, menu_items(name, uom:unit_of_measures(precision)))')
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
        fetchBucket('new', 1, supabase, restaurantId),
        fetchBucket('in_progress', 1, supabase, restaurantId),
        fetchBucket('ready', 1, supabase, restaurantId),
        fetchBucket('completed', page, supabase, restaurantId),
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
        const payloadOrder = payload.new;
        if (!payloadOrder) return;

        // Fetch full order with items and precision to ensure UI is correct
        supabase
          .from('orders')
          .select('*, order_items(*, menu_items(name, uom:unit_of_measures(precision)))')
          .eq('id', payloadOrder.id)
          .single()
          .then(({ data: fullOrder }) => {
             if (!fullOrder) return;
             
             // Update order in kanban/mobile list
             setOrdersByStatus((prev) => {
               const updated = { ...prev };
               for (const status of STATUSES) {
                 updated[status] = prev[status].filter((o) => o.id !== fullOrder.id);
               }
               if (fullOrder.status && updated[fullOrder.status]) {
                 updated[fullOrder.status] = [fullOrder, ...updated[fullOrder.status]];
               }
               return updated;
             });

             // Only play sound for new orders
             if (payload.eventType === 'INSERT' && fullOrder.status === 'new') {
               playNotificationSound();
             }
          });
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
            .select('*, order_items(*, menu_items(name, uom:unit_of_measures(precision)))')
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

  async function updateCustomerCount(id, val) {
    if (!supabase || !restaurantId) return;
    const count = parseInt(val, 10);
    if (isNaN(count)) return;
    try {
      await supabase.from('orders').update({ number_of_customers: count }).eq('id', id).eq('restaurant_id', restaurantId);
      loadOrders();
    } catch (e) {
      setError(e.message);
    }
  }

  async function updateTableNumber(id, val) {
    if (!supabase || !restaurantId) return;
    try {
      let tableNum = null;
      let orderType = 'dine-in';

      if (val === 'parcel') {
        tableNum = null;
        orderType = 'parcel';
      } else if (val && val.startsWith('table:')) {
        tableNum = val.split(':')[1];
        orderType = 'dine-in';
      } else {
         // Fallback for direct number input if any old usage remains
         tableNum = val ? String(val).trim() : null;
         if (tableNum) orderType = 'dine-in';
      }

      const updateData = { table_number: tableNum, order_type: orderType }; 

      const { error } = await supabase.from('orders').update(updateData).eq('id', id).eq('restaurant_id', restaurantId);
      if (error) throw error;
      
      // Reload current page if we are looking at completed orders, or just reload default
      loadOrders(completedPage); 
    } catch (e) {
      console.error("Failed to update table:", e);
      alert("Failed to update table number: " + e.message);
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

  // ✅ Check PAYMENT_METHOD first for credit orders
  if (order?.payment_method === 'credit') {
    // Credit orders don't need payment confirmation - just complete
    complete(order.id);
    return;
  }

  // If invoice already exists and fully paid, skip dialog
  if (invoice?.status === 'paid') {
    complete(order.id);
    return;
  }

  // Calculate payment status
  const orderTotal = computeOrderTotalDisplay(order);
  const paidAmount = Number(invoice?.paid_amount || 0);
  const remainingAmount = orderTotal - paidAmount;
  const refundAmount = paidAmount > orderTotal ? paidAmount - orderTotal : 0;

  // Determine mode
  let mode = null;
  if (remainingAmount > 0.01) {
    mode = 'collect'; // Need to collect remaining payment
  } else if (refundAmount > 0.01) {
    mode = 'refund'; // Need to refund excess payment
  }

  // Show payment confirmation dialog with calculated amounts
  setPaymentConfirmDialog({
    ...order,
    mode,
    totalAmount: orderTotal,
    alreadyPaidAmount: paidAmount,
    remainingAmount: remainingAmount > 0 ? remainingAmount : 0,
    refundAmount,
  });
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
  ].sort((a, b) => new Date(a.date_ordered || a.created_at) - new Date(b.date_ordered || b.created_at));
} else if (ordersByStatus.mobileFilter === 'completed') {
  // Done: newest → oldest
  mobileOrders = [...(ordersByStatus.completed || [])].sort(
    (a, b) => new Date(b.date_ordered || b.created_at) - new Date(a.date_ordered || a.created_at)
  );
} else {
  // New column: oldest → newest
  mobileOrders = [...(ordersByStatus[ordersByStatus.mobileFilter] || [])].sort(
    (a, b) => new Date(a.date_ordered || a.created_at) - new Date(b.date_ordered || b.created_at)
  );
}

     // Apply Filters
     mobileOrders = mobileOrders.filter(o => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase().trim();
          
          // Strict match for Table Number if query is short numeric
          const isNumeric = /^\d{1,3}$/.test(q);
          if (isNumeric) {
             return String(o.table_number) === q;
          }

          const matchId = o.id.toLowerCase().includes(q);
          const matchTable = o.table_number ? String(o.table_number).includes(q) : false;
          const items = toDisplayItems(o);
          const matchItem = items.some(it => it.name.toLowerCase().includes(q));
          return matchId || matchTable || matchItem;
        }
        return true;
     });



  // // Show print modal when state is set
   
  return (
    <div 
      className="orders-wrap"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <header className="orders-header">
        <h1>Orders Dashboard</h1>
        <div className="header-actions">
          {/* Live Order Count (New + In Progress) */}
          {(ordersByStatus.new.length + ordersByStatus.in_progress.length) > 0 && (
            <span 
              style={{
                color: '#f97316', 
                fontSize: 15,
                fontWeight: 400,
                marginRight: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <PulseDot />
              {ordersByStatus.new.length + ordersByStatus.in_progress.length} Live Orders
            </span>
          )}
          
           <Button variant="outline" onClick={() => { setCompletedPage(1); loadOrders(1); }}>
            Refresh
          </Button>
        </div>
      </header>

      <ControlsBar>
        <SearchWrapper>
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21L16.65 16.65" />
          </svg>
          <input 
            placeholder="Search by Order #, Table, or Item..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-btn" onClick={() => setSearchQuery('')}>✕</button>
          )}
        </SearchWrapper>
      </ControlsBar>

      {error && (
        <Card padding={12} style={{ background:'#fee2e2',border:'1px solid #fecaca',margin:'0 12px 12px' }}>
          <span style={{ color:'#b91c1c' }}>{error}</span>
        </Card>
      )}

     <div className="mobile-filters">
  {UI_COLUMNS.map((col) => {
    // Helper to filter a list
    const filterList = (list) => {
      return list.filter(o => {
        // Search Filter
        if (searchQuery) {
          const q = searchQuery.toLowerCase().trim();
          
          // Strict match for Table Number if query is short numeric (e.g. "1")
          // This avoids "1" matching every ID or price
          const isNumeric = /^\d{1,3}$/.test(q);
          if (isNumeric) {
             // ONLY match table number. Don't match ID for short numbers (too noisy)
             return String(o.table_number) === q;
          }

          // General search
          const matchId = o.id.toLowerCase().includes(q);
          const matchTable = o.table_number ? String(o.table_number).includes(q) : false;
          // Check items
          const items = toDisplayItems(o);
          const matchItem = items.some(it => it.name.toLowerCase().includes(q));
          
          return matchId || matchTable || matchItem;
        }

        return true;
      });
    };

    let baseList = [];
    if (col.id === 'inprogress') {
       baseList = [...ordersByStatus.in_progress, ...ordersByStatus.ready];
    } else {
       baseList = ordersByStatus[col.id] || [];
    }
    
    const count = filterList(baseList).length;

    return (
      <button
        key={col.id}
        className={`chip ${col.id === ordersByStatus.mobileFilter ? 'chip--active' : ''}`}
        onClick={() => setOrdersByStatus((prev) => ({ ...prev, mobileFilter: col.id }))}
      >
        <span className="chip-label">{col.label}</span>
        <span className="chip-count">{count}</span>
      </button>
    );
  })}
</div>



      <div className="mobile-list orders-list">

  {mobileOrders.length === 0 ? (
    <Card className="muted" padding={12} style={{ textAlign: 'center' }}>
      No orders found matching filters
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
        onShowItems={(o) => setItemsModalOrder(o)}
        onPrintKot={(orderObj) => {
  window.dispatchEvent(
    new CustomEvent('auto-print-order', {
      detail: { ...orderObj, autoPrint: true, kind: 'kot' }
    })
  );
}}

        onPrintBill={async (order) => {
  try {
    const s = getSupabase();

    // Ensure we have items + menu_items(name)
    const { data: fullOrder } = await s
      .from('orders')
      .select('*, order_items(*, menu_items(name))')
      .eq('id', order.id)
      .maybeSingle();

    const base = fullOrder || order;

    const { data: invoice } = await s
      .from('invoices')
      .select('invoice_no')
      .eq('order_id', order.id)
      .order('invoice_date', { ascending: false })
      .maybeSingle();

    const orderForPrint = {
      ...base,
      invoice_no: invoice?.invoice_no || base.invoice_no || null,
    };

    window.dispatchEvent(
      new CustomEvent('auto-print-order', {
        detail: { ...orderForPrint, autoPrint: true, kind: 'bill' },
      })
    );
  } catch (err) {
    console.error('Print bill fetch failed', err);
    window.dispatchEvent(
      new CustomEvent('auto-print-order', {
        detail: { ...order, autoPrint: true, kind: 'bill' },
      })
    );
  }
}}

        onCancelOrderOpen={onCancelOrderOpen}
        onEditOrder={async (o) => {
          const full = await fetchFullOrder(supabase, o.id);
          setEditingOrder(full || o);
        }}
        onEditPax={(order) => setPaxEditOrder(order)}
        onEditTable={(order) => setTableEditOrder(order)}
      />
    ))
  )}
</div>



      {/* Kanban grid for desktop */}
   <div className="kanban"> 
  {UI_COLUMNS.map((col) => {
    let rawColOrders = col.statuses.flatMap((st) => ordersByStatus[st] || []);

    // Apply Filters for Kanban
    let colOrders = rawColOrders.filter(o => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase().trim();
          
          // Strict match for Table Number if query is short numeric
          const isNumeric = /^\d{1,3}$/.test(q);
          if (isNumeric) {
             return String(o.table_number) === q;
          }

          const matchId = o.id.toLowerCase().includes(q);
          const matchTable = o.table_number ? String(o.table_number).includes(q) : false;
          const items = toDisplayItems(o);
          const matchItem = items.some(it => it.name.toLowerCase().includes(q));
          return matchId || matchTable || matchItem;
        }
        return true;
     });

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
          <span 
            style={{
              background: COLORS[col.statuses[0]],
              color: 'white',
              borderRadius: '99px',
              padding: '2px 10px',
              fontSize: '13px',
              fontWeight: 700,
              minWidth: '24px',
              textAlign: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            {colOrders.length}
          </span>
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
                onPrintKot={(orderObj) => {
  window.dispatchEvent(
    new CustomEvent('auto-print-order', {
      detail: { ...orderObj, autoPrint: true, kind: 'kot' }
    })
  );
}}

                onPrintBill={async (order) => {
  try {
    const s = getSupabase();

    // Ensure we have items + menu_items(name)
    const { data: fullOrder } = await s
      .from('orders')
      .select('*, order_items(*, menu_items(name))')
      .eq('id', order.id)
      .maybeSingle();

    const base = fullOrder || order;

    const { data: invoice } = await s
      .from('invoices')
      .select('invoice_no')
      .eq('order_id', order.id)
      .order('invoice_date', { ascending: false })
      .maybeSingle();

    const orderForPrint = {
      ...base,
      invoice_no: invoice?.invoice_no || base.invoice_no || null,
    };

    window.dispatchEvent(
      new CustomEvent('auto-print-order', {
        detail: { ...orderForPrint, autoPrint: true, kind: 'bill' },
      })
    );
  } catch (err) {
    console.error('Print bill fetch failed', err);
    window.dispatchEvent(
      new CustomEvent('auto-print-order', {
        detail: { ...order, autoPrint: true, kind: 'bill' },
      })
    );
  }
}}

                onCancelOrderOpen={onCancelOrderOpen}
                onEditOrder={async (o) => {
          const full = await fetchFullOrder(supabase, o.id);
          setEditingOrder(full || o);
        }}
                onEditPax={(order) => setPaxEditOrder(order)}
                onEditTable={(order) => setTableEditOrder(order)}
                onShowItems={(o) => setItemsModalOrder(o)}
              />
            ))
          )}

          {col.id === 'completed' && !searchQuery && (
              <>
                <div
                  style={{
                    fontSize: 12,
                    color: '#64748b',
                    textAlign: 'center',
                    marginTop: 16,
                  }}
                >
                  Showing latest {ordersByStatus.completed.length} completed
                  orders
                </div>
                <div style={{ paddingTop: 8, display: 'flex', justifyContent: 'center' }}>
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
    tablesCount={tablesCount}
  />
)}

{paxEditOrder && (
    <PaxEditDialog 
        order={paxEditOrder}
        onClose={() => setPaxEditOrder(null)}
        onSave={(val) => {
            updateCustomerCount(paxEditOrder.id, val);
            setPaxEditOrder(null);
        }}
    />
)}

{tableEditOrder && (
    <TableEditDialog 
        order={tableEditOrder}
        onClose={() => setTableEditOrder(null)}
        tablesCount={tablesCount}
        onSave={(val) => {
            updateTableNumber(tableEditOrder.id, val);
            setTableEditOrder(null);
        }}
    />
)}

    {/* Global "Show All Items" Modal */}
    {itemsModalOrder && (
      <div 
        style={{
          position:'fixed', inset: 0,
          background:'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(5px)', 
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:10000,
          padding: 12
        }}
        onClick={(e) => { e.stopPropagation(); setItemsModalOrder(null); }}
      >
        <div 
          style={{
            background:'white', width:'100%', maxWidth:340, borderRadius:16, padding: 20,
            boxShadow:'0 15px 30px -10px rgba(0, 0, 0, 0.15)',
            maxHeight:'85vh', display:'flex', flexDirection:'column', animation: 'fadeIn 0.2s ease-out', position: 'relative',
          }}
          onClick={e => e.stopPropagation()}
        >
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8}}>
              <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{fontSize:20, fontWeight: 900, color:'#0f172a', margin: 0, letterSpacing: '-0.02em'}}>Order #{itemsModalOrder.id.slice(0,8)}</h3>
                    {itemsModalOrder.status === 'completed' && (
                      <span style={{ 
                        background: '#10b981', color: 'white', fontSize: 8, fontWeight: 700, 
                        padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em'
                      }}>Paid</span>
                    )}
                  </div>
                  
                  <div style={{
                    display:'flex', gap:10, marginTop:10, alignItems: 'center', flexWrap: 'wrap',
                    fontSize: 9, color: '#94a3b8', lineHeight: 1
                  }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{fontWeight:700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 7.5, color: '#cbd5e1'}}>Placed</span>
                          <span style={{fontWeight:600, color: '#475569'}}>
                            {new Date(itemsModalOrder.date_ordered || itemsModalOrder.created_at).toLocaleString('en-IN', {
                              month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: true
                            })}
                          </span>
                      </div>

                      {new Date(itemsModalOrder.updated_at) - new Date(itemsModalOrder.created_at) > 5000 && (
                        <>
                          <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }}></div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{fontWeight:700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 7.5, color: '#cbd5e1'}}>Edited</span>
                              <span style={{fontWeight:600, color: '#475569'}}>
                                {new Date(itemsModalOrder.updated_at).toLocaleString('en-IN', {
                                  hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: true
                                })}
                              </span>
                          </div>
                        </>
                      )}

                      {itemsModalOrder.number_of_customers && (
                         <>
                           <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }}></div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{fontSize: 10, opacity: 0.8}}>👥</span>
                              <span style={{fontWeight:700, color: '#475569', fontSize: 10}}>{itemsModalOrder.number_of_customers}</span>
                           </div>
                         </>
                      )}

                      <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }}></div>
                      <div style={{
                        background:'#f8fafc', padding:'2px 8px', borderRadius:6, border: '1px solid #f1f5f9',
                        fontSize:9, fontWeight: 700, color: '#64748b'
                      }}>
                          {getOrderTypeLabel(itemsModalOrder)}
                      </div>
                  </div>
              </div>
{itemsModalOrder?.special_instructions ? (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 8, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
      Delivery / Instructions
    </div>
    <pre style={{ margin: 0, whiteSpace: "pre-wrap", background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 12, padding: 12, fontSize: 12, color: "#0f172a" }}>
      {itemsModalOrder.special_instructions}
    </pre>
  </div>
) : null}

              <div 
                className="dynamic-close-btn"
                onClick={() => setItemsModalOrder(null)} 
                style={{
                    cursor:'pointer', width:32, height:32, 
                    background:'transparent', color: '#92400e', display:'flex', 
                    alignItems:'center', justifyContent:'center', fontSize:24,
                    flexShrink:0, marginTop: -4, marginRight: -8,
                    transition: 'opacity 0.2s'
                }}
              >✕</div>
            </div>

            {(itemsModalOrder.customer_name || itemsModalOrder.customer_phone) && (
              <div style={{ 
                padding: '12px', background: '#f8fafc', borderRadius: 12, border: '1px solid #f1f5f9',
                marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12
              }}>
                {itemsModalOrder.customer_name && (
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Customer</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{itemsModalOrder.customer_name}</div>
                  </div>
                )}
                {itemsModalOrder.customer_phone && (
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Contact</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{itemsModalOrder.customer_phone}</div>
                  </div>
                )}
              </div>
            )}

            <div style={{overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:0, marginBottom: 12}}>
               <div style={{ fontSize: 8.5, fontWeight: 800, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, borderBottom: '1.5px solid #f1f5f9', paddingBottom: 6 }}>Order Details</div>
               {toDisplayItems(itemsModalOrder).map((it, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#334155' }}>
                        <span style={{ color: BRAND.orange, fontWeight: 700, marginRight: 5 }}>{formatQtyP(it.quantity, it.uom_precision ?? 0)}×</span>
                        {it.name}
                      </div>
                      {it.variant_name && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1, marginLeft: 20 }}>{it.variant_name}</div>}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                      ₹{((it.quantity || 1) * (it.price || 0)).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 0 0', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                  <span style={{ color: '#94a3b8', fontWeight: 500 }}>Tax</span>
                  <span style={{ fontWeight: 600, color: '#64748b' }}>₹{Number(itemsModalOrder.total_tax || itemsModalOrder.tax_amount || itemsModalOrder.tax || 0).toFixed(2)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 1 }}>
                  <span style={{ fontSize : 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Grand Total</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: BRAND.orange }}>
                    ₹{computeOrderTotalDisplay(itemsModalOrder).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
        </div>
      </div>
    )}

      <style jsx>{`
.orders-wrap { padding:12px 0 32px; }
.dynamic-close-btn { transition: opacity 0.2s ease; }
.dynamic-close-btn:hover { opacity: 0.7; }
.dynamic-close-btn:active { opacity: 0.9; }
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
  .mobile-list { padding:0 6px; gap:8px; }
}
      `}</style>
    </div>
  );
}

function getOrderTypeLabel(order) {
  if (!order) return '';
  let label = '';
  if (order.order_type === 'parcel') label = 'Parcel';
  else if (order.order_type === 'dine-in') label = 'Dine-in';
  else if (order.order_type === 'counter') label = 'Counter';
  else label = order.order_type || 'Order';

  if (order.table_number) {
    return `${label} • Table ${order.table_number}`;
  }
  return label;
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
  onEditOrder,
  onEditPax,
  onEditTable,
  onShowItems // New prop to trigger global modal
}) {
  const items = toDisplayItems(order);
  const total = computeOrderTotalDisplay(order);

  const isCreditOrder = order?.is_credit && order?.credit_customer_id;
  const pm = String(order.payment_method || '').toLowerCase();
  
  // Choose class for accent border
  const statusClass = 
    order.status === 'new' ? 'is-new' : 
    order.status === 'in_progress' ? 'is-progress' :
    order.status === 'ready' ? 'is-ready' : 'is-completed';

  // Calculate if order is "Late" (> 20 mins and not done)
  // Logic removed for late coloring, keeping just regular time display

  return (
    <OrderCardStyled
      className={`${statusClass} order-card`} 
      onClick={() => onShowItems && onShowItems(order)}
    >
      <OrderHeader style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        {/* Top Row: ID and Time */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="order-id">#{order.id.slice(0, 6)}</span>
          <span className="order-time" style={{ whiteSpace: 'nowrap' }}>
            {timeAgo(order.created_at)}
          </span>
        </div>

        {/* Bottom Row: Metadata (Table, Pax, Credit) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 2 }}>
           <TooltipSpan 
            data-tip={order.status !== 'completed' ? "Edit Table" : undefined}
            style={{
              fontSize: 13, fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: 6,
              cursor: order.status === 'completed' ? 'default' : 'pointer',
              padding: '2px 0'
            }}
            onClick={(e) => { 
               if (order.status === 'completed') return;
               e.stopPropagation(); 
               onEditTable && onEditTable(order); 
            }}
          >
            {getOrderTypeLabel(order)}
            {/* Show edit icon only if not completed */}
            {order.status !== 'completed' && <span style={{fontSize:11, opacity:0.5}}>✎</span>}
          </TooltipSpan>
          
          {order.number_of_customers && (
             <TooltipSpan 
               data-tip={order.status !== 'completed' ? "Edit Pax" : undefined}
               style={{
                 fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4,
                 cursor: order.status === 'completed' ? 'default' : 'pointer',
                 padding: '2px 0'
               }} 
               onClick={(e) => {
                 if (order.status === 'completed') return;
                 e.stopPropagation();
                 onEditPax && onEditPax(order);
               }}
             >
               <span style={{fontSize:14}}>👥</span> 
               <span style={{fontWeight:600}}>{order.number_of_customers}</span>
               {order.status !== 'completed' && <span style={{fontSize:11, opacity:0.5}}>✎</span>}
             </TooltipSpan>
          )}

          {isCreditOrder && <span style={{fontSize:10, background:'#e0f2fe', color:'#0369a1', padding:'2px 6px', borderRadius:4, fontWeight: 700}}>CREDIT</span>}
        </div>
      </OrderHeader>

      <div style={{ margin:'8px 0', fontSize:14, display:'flex', flexDirection:'column', gap:4 }}>
        {/* Show fewer items by default */}
        {items.slice(0, 3).map((it,i)=>(
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
             <div>
               <span style={{fontWeight:600}}>{formatQtyP(it.quantity, it.uom_precision ?? 0)}×</span> {it.name}
               {it.variant_name && <span style={{fontSize:12, color:'#6b7280', marginLeft:6}}>({it.variant_name})</span>}
             </div>
          </div>
        ))}
        {items.length > 3 && (
           <div 
             onClick={(e) => { e.stopPropagation(); onShowItems && onShowItems(order); }}
             style={{fontSize:12, color:statusColor, cursor:'pointer', fontWeight:600, marginTop:4}}
           >
             Show all {items.length} items
           </div>
        )}
      </div>

      <CardFooter>
        <PriceTag>{money(total)}</PriceTag>
        <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
           
            {/* New Orders */}
            {order.status === 'new' && (
              <>
                <Button size="sm" onClick={() => onChangeStatus(order.id, 'in_progress')}>Start</Button>
                <Button size="sm" variant="outline" onClick={() => onEditOrder(order)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => onCancelOrderOpen(order)}>Cancel</Button>
                <Button size="sm" style={{background: '#10b981', borderColor: '#10b981', color:'white'}} onClick={() => onPrintKot && onPrintKot(order)}>KOT</Button>
              </>
            )}

            {/* In Progress */}
            {order.status === 'in_progress' && (
              <>
                 <Button size="sm" onClick={() => onComplete(order)} disabled={generatingInvoice === order.id}>Done</Button>
                 <Button size="sm" variant="outline" onClick={() => onEditOrder(order)}>Edit</Button>
                 {/* Allow cancel if mistake */}
                 <Button size="sm" variant="danger" onClick={() => onCancelOrderOpen(order)}>Cancel</Button>
                 <Button size="sm" style={{background: '#10b981', borderColor: '#10b981', color:'white'}} onClick={() => onPrintBill && onPrintBill(order)}>Print Bill</Button>
              </>
            )}

            {/* Ready */}
            {order.status === 'ready' && (
              <>
                <Button size="sm" onClick={() => onComplete(order)} disabled={generatingInvoice === order.id}>
                   {generatingInvoice === order.id ? '...' : 'Done'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onEditOrder(order)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => onCancelOrderOpen(order)}>Cancel</Button>
                <Button size="sm" style={{background: '#10b981', borderColor: '#10b981', color:'white'}} onClick={() => onPrintBill && onPrintBill(order)}>Print Bill</Button>
              </>
            )}

            {/* Completed Orders */}
            {order.status === 'completed' && (
              <>
                <Button size="sm" onClick={async () => {
                   try { await downloadInvoicePdf(order.id) } catch (e) { alert(e.message) }
                }} disabled={generatingInvoice === order.id}>Invoice</Button>
                <Button size="sm" style={{background: '#10b981', borderColor: '#10b981', color:'white'}} onClick={() => onPrintBill && onPrintBill(order)}>Print Bill</Button>
              </>
            )}

        </div>
      </CardFooter>
    </OrderCardStyled>
  );
}
