//pages/owner/orders.js 

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useRouter } from 'next/router'; // <-- Import useRouter at the top!
import { getSupabase } from '../../services/supabase';
import { LoyaltyService } from '../../services/loyaltyService';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { subscribeOwnerDevice } from '../../helpers/subscribePush';
import { arePushAlertsDisabled, detectPushPlatform, getPushTokenPrefix, getStoredPushToken } from '../../lib/push/tokenStore';
import { downloadInvoicePdf } from '../../lib/downloadInvoicePdf'
import NiceSelect from '../../components/NiceSelect';
import { round2, roundP, formatQtyP } from '../../lib/qty'
import EnableAlertsButton from '../../components/EnableAlertsButton';
import EditOrderPanel from '../../components/EditOrderPanel';
import PaymentConfirmDialog from '../../components/PaymentConfirmDialog';
import OrderItemsModal from '../../components/OrderItemsModal';
import { useQueryClient } from '@tanstack/react-query';
import { tableKeys } from '../../hooks/useTables';

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

const deliveryPulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.6); }
  70% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
  100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
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

  &.is-pending {
    border: 2px solid ${BRAND.orange};
    border-left: 6px solid ${BRAND.orange};
    background: #fff7ed;
    animation: ${deliveryPulse} 2s infinite;
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
const STATUSES = ['pending_acceptance', 'new', 'in_progress', 'ready', 'completed'];
const COLORS = { pending_acceptance: '#f97316', new: '#3b82f6', in_progress: '#f59e0b', ready: '#10b981', completed: '#10b981' };
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
const prefix = (s) => getPushTokenPrefix(s, 24);

function computeOrderTotalDisplay(order) {
  const toNum = (v) => (v == null ? null : Number(v));
  // Prioritize total_amount (Final Net Payable) over total_inc_tax (Gross)
  const net = toNum(order?.total_amount);
  if (Number.isFinite(net)) return net;

  const gross = toNum(order?.total_inc_tax);
  if (Number.isFinite(gross) && gross > 0) return gross;

  const c = toNum(order?.total);
  if (Number.isFinite(c) && c > 0) return c;
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
      variant_name: oi.variant_name || null,
      uom_short_code: oi.uom_short_code || null,
      uom_precision: oi.uom_precision ?? oi.menu_items?.uom?.precision ?? 0,
      notes: oi.notes,
      line_discount_amount: oi.line_discount_amount,
      order_discount_share: oi.order_discount_share,
      discount_amount: oi.discount_amount,
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



// Local EditOrderPanel removed. Imported from ../../components/EditOrderPanel



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

function DeliveryDecisionDialog({ orderId, onAccept, onDecline, onClose, canDecline }) {
  const [busy, setBusy] = useState(false);

  const runAction = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn?.();
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 12
    }}>
      <div style={{
        backgroundColor: 'white', padding: 20, borderRadius: 16, maxWidth: 360, width: '100%',
        boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.15)',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0', letterSpacing: '-0.01em' }}>
          Delivery Order Decision
        </h3>
        <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4, marginBottom: 16 }}>
          Choose what to do with delivery order <strong>#{String(orderId || '').slice(0, 8)}</strong>.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            onClick={() => runAction(onAccept)}
            style={{ flex: 1, height: 38, borderRadius: 10, fontSize: 13, background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}
            disabled={busy}
          >
            {busy ? '...' : 'Accept'}
          </Button>
          {canDecline && (
            <Button
              onClick={() => runAction(onDecline)}
              variant="danger"
              style={{ flex: 1, height: 38, borderRadius: 10, fontSize: 13 }}
              disabled={busy}
            >
              {busy ? '...' : 'Decline'}
            </Button>
          )}
          {!canDecline && (
            <Button
              onClick={onClose}
              variant="outline"
              style={{ flex: 1, height: 38, borderRadius: 10, fontSize: 13 }}
              disabled={busy}
            >
              Close
            </Button>
          )}
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


function TableEditDialog({ order, onSave, onClose, tables = [], tablesCount = 0 }) {
  const [val, setVal] = useState(() => {
    if (order.order_type === 'parcel' || order.order_type === 'takeaway') return 'takeaway';
    if (order.order_type === 'delivery') return 'delivery';
    if (order.table_number) return `table:${order.table_number}`;
    return 'takeaway';
  });

  const tableOptions = useMemo(() => {
    // Only available tables can be moved to
    const availableTables = tables.filter(t => t.status === 'available');

    const options = availableTables.map(t => ({
      value: `table:${t.identifier}`,
      label: t.identifier.match(/^\d+$/) ? `Table ${t.identifier}` : t.identifier,
      sortKey: t.identifier
    }));

    // 2. Add numeric fallbacks only for counts (no status info available for fallbacks)
    const existingIds = new Set(tables.map(t => String(t.identifier)));
    for (let i = 1; i <= tablesCount; i++) {
      const idStr = String(i);
      if (!existingIds.has(idStr)) {
        const hasSimilar = tables.some(t => {
          const num = t.identifier.replace(/\D/g, '');
          return num === idStr;
        });
        if (!hasSimilar) {
          options.push({
            value: `table:${i}`,
            label: `Table ${i}`,
            sortKey: i
          });
        }
      }
    }

    // 3. Sort
    return options.sort((a, b) => {
      return String(a.sortKey).localeCompare(String(b.sortKey), undefined, { numeric: true, sensitivity: 'base' });
    });

  }, [tables, tablesCount]);

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
          Set location for Order <strong>#{order.id.slice(0, 6)}</strong>
        </p>

        <div style={{ marginBottom: 20 }}>
          <NiceSelect
            value={val}
            onChange={setVal}
            placeholder="Select Table or Type..."
            options={[
              { value: 'takeaway', label: 'Takeaway / Parcel' },
              { value: 'delivery', label: 'Home Delivery' },
              ...tableOptions
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
    .select('*, order_items(*, menu_items(name, uom:unit_of_measures(precision))), order_customers(*, restaurant_customer(name, phone))')
    .eq('id', orderId)
    .single();

  if (!error && data) {
    // Transform order_customers to a simpler customers array
    if (data.order_customers && data.order_customers.length > 0) {
      data.customers = data.order_customers.map(link => ({
        id: link.customer_id,
        name: link.restaurant_customer?.name,
        phone: link.restaurant_customer?.phone,
        is_primary: link.is_primary
      }));
    } else if (data.customer_name || data.customer_phone) {
      data.customers = [{
        name: data.customer_name,
        phone: data.customer_phone,
        is_primary: true
      }];
    }
    return data;
  }
  return null;
}

export default function OrdersPage() {
  const supabase = getSupabase();
  const router = useRouter(); // <-- Add this inside the component!
  const queryClient = useQueryClient();
  const { user, checking } = useRequireAuth(supabase);
  const { restaurant, role, loading: restLoading } = useRestaurant();
  const canCancel = role !== 'staff'; // staff cannot cancel
  const restaurantId = restaurant?.id;

  // NEW: state for showing the print modal
  const [cancelOrderDialog, setCancelOrderDialog] = useState(null);
  const [deliveryDecisionOrderId, setDeliveryDecisionOrderId] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [paxEditOrder, setPaxEditOrder] = useState(null);
  const [tableEditOrder, setTableEditOrder] = useState(null);
  const notifiedDeliveryPushIdsRef = useRef(new Set());
  const handledDeepLinkActionKeysRef = useRef(new Set());

  // Ref to store realtime channel for broadcasting
  const channelRef = useRef(null);

  const [ordersByStatus, setOrdersByStatus] = useState({
    pending_acceptance: [], new: [], in_progress: [], ready: [], completed: [], mobileFilter: 'new'
  });

  const [tablesCount, setTablesCount] = useState(0);
  const [tables, setTables] = useState([]);

  useEffect(() => {
    if (!restaurantId || !supabase) return;

    // Fetch tables count (keep for backward compat if needed elsewhere)
    supabase
      .from('restaurant_profiles')
      .select('tables_count')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.tables_count) setTablesCount(data.tables_count);
      });

    // Fetch actual tables
    supabase
      .from('tables')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('identifier', { ascending: true })
      .then(({ data }) => {
        if (data) {
          // Robust alphanumeric sort (T1, T2, T10...)
          const sorted = data.sort((a, b) => {
            return a.identifier.localeCompare(b.identifier, undefined, { numeric: true, sensitivity: 'base' });
          });
          setTables(sorted);
        }
      });
  }, [restaurantId, supabase]);

  const [completedPage, setCompletedPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingInvoice, setGeneratingInvoice] = useState(null);
  const [paymentConfirmDialog, setPaymentConfirmDialog] = useState(null);
  const [itemsModalOrder, setItemsModalOrder] = useState(null); // Global state for items modal
  const [modalLoyalty, setModalLoyalty] = useState(null); // { earned, used, amount_used }

  useEffect(() => {
    if (!itemsModalOrder || !supabase) {
      setModalLoyalty(null);
      return;
    }
    const fetchModalLoyalty = async () => {
      const { data, error } = await supabase
        .from('loyalty_transactions')
        .select('txn_type, points_delta, points_earned, points_redeemed, amount_value')
        .eq('order_id', itemsModalOrder.id);

      if (!error && data) {
        const earned = data.reduce((s, t) => s + (Number(t.points_earned) || (t.txn_type === 'earn' ? Math.abs(t.points_delta) : 0)), 0);
        const used = data.reduce((s, t) => s + (Number(t.points_redeemed) || (t.txn_type === 'redeem' ? Math.abs(t.points_delta) : 0)), 0);
        const amt = data.reduce((s, t) => s + (t.txn_type === 'redeem' ? Number(t.amount_value || 0) : 0), 0);
        setModalLoyalty({ earned, used, amount_used: amt });
      }
    };
    fetchModalLoyalty();
  }, [itemsModalOrder, supabase]);

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
        setOrdersByStatus(prev => ({ ...prev, mobileFilter: UI_COLUMNS[currentIndex + 1].id }));
      }
    }
    if (isRightSwipe) {
      // Prev tab (swipe right)
      if (currentIndex > 0) {
        setOrdersByStatus(prev => ({ ...prev, mobileFilter: UI_COLUMNS[currentIndex - 1].id }));
      }
    }
  };

  // ... all useEffect hooks, loadOrders, realtime subscription, updateStatus, finalize, complete, etc. remain unchanged ...
  // Save token to user profile (optional, unchanged)


  useEffect(() => {
    const saveToken = async () => {
      if (!user || !supabase) return;
      const fcmToken = getStoredPushToken();
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
      const platform = detectPushPlatform();
      console.log('[push] subscribing', { rid: restaurantId, tokenPrefix: prefix(token), platform });
      try {
        await subscribeOwnerDevice({ restaurantId, token, platform });
        if (!canceled) console.log('[push] subscribed OK', { rid: restaurantId });
        // Echo back current prefixes for debug
        try {
          const r = await fetch('/api/push/echo?rid=' + encodeURIComponent(restaurantId));
          const j = await r.json();
          console.log('[push] echo', j);
        } catch { }
      } catch (e) {
        console.warn('[push] subscribe error', e);
      }
    }

    async function run() {
      if (!restaurantId) return;
      if (arePushAlertsDisabled()) return;
      // First attempt with whatever is already stored by _app registration
      const stored = getStoredPushToken();
      if (stored) await subscribeWith(stored);

      // Retry shortly to capture refreshed token if it appears a moment later
      setTimeout(() => {
        const again = getStoredPushToken();
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
      a.play().catch(() => { });
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

  const notifyPendingDeliveryViaBanner = useCallback((order) => {
    if (typeof window === 'undefined' || !order?.id) return;
    if (String(order.status || '') !== 'pending_acceptance') return;

    const notifiedSet = notifiedDeliveryPushIdsRef.current;
    const orderId = String(order.id);
    if (notifiedSet.has(orderId)) return;
    notifiedSet.add(orderId);

    // Keep dedupe set bounded to avoid unbounded growth.
    if (notifiedSet.size > 500) {
      const trimCount = Math.max(100, notifiedSet.size - 350);
      let idx = 0;
      for (const id of notifiedSet) {
        notifiedSet.delete(id);
        idx += 1;
        if (idx >= trimCount) break;
      }
    }

    const total = computeOrderTotalDisplay(order);
    const title = '🔔 New Delivery Order — Action Required';
    const body = `Tap to Accept or Decline • #${orderId.slice(0, 8).toUpperCase()}${Number.isFinite(total) ? ` • ${money(total)}` : ''}`;
    const url = `/owner/orders?highlight=${encodeURIComponent(orderId)}`;

    window.dispatchEvent(
      new CustomEvent('new-order-push', {
        detail: {
          title,
          body,
          url,
          orderId,
          restaurantId: String(restaurantId || ''),
          type: 'delivery_pending',
          data: {
            title,
            body,
            url,
            orderId,
            restaurantId: String(restaurantId || ''),
            type: 'delivery_pending',
          },
        },
      })
    );
  }, [restaurantId]);


  const isPendingDeliveryOrder = (order) => {
    if (!order) return false;
    const orderType = String(order.order_type || '').toLowerCase();
    const table = String(order.table_number || '').toUpperCase();
    return order.status === 'pending_acceptance' && (orderType === 'delivery' || table === 'DELIVERY');
  };

  const onCancelOrderOpen = (order) => {
    if (!canCancel) {
      setError('Staff accounts cannot cancel orders.');
      return;
    }
    setCancelOrderDialog(order);
  };

  async function cancelOrderById(orderId, reason, options = {}) {
    if (!supabase || !restaurantId || !orderId) return { ok: false, reason: 'missing_context' };
    const { requirePendingDelivery = false } = options;
    const finalReason = String(reason || '').trim() || 'Cancelled by owner';
    console.log('[CANCEL ORDER] Starting cancellation for order:', orderId, { requirePendingDelivery });

    try {
      // Get full order with items before cancelling
      const fullOrder = await fetchFullOrder(supabase, orderId);
      if (!fullOrder) throw new Error('Order not found');

      if (requirePendingDelivery && !isPendingDeliveryOrder(fullOrder)) {
        await loadOrders();
        return { ok: false, reason: 'not_pending_delivery' };
      }

      console.log('[CANCEL ORDER] Full order fetched:', fullOrder);
      console.log('[CANCEL ORDER] order_items:', fullOrder?.order_items);
      console.log('[CANCEL ORDER] order_items length:', fullOrder?.order_items?.length);
      console.log('[CANCEL ORDER] order_items is array?', Array.isArray(fullOrder?.order_items));

      // Cancel the order
      let updateQuery = supabase
        .from('orders')
        .update({ status: 'cancelled', description: finalReason })
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId);
      if (requirePendingDelivery) {
        updateQuery = updateQuery.eq('status', 'pending_acceptance');
      }
      const { data: cancelledOrder, error: cancelUpdateErr } = await updateQuery
        .select('id')
        .maybeSingle();
      if (cancelUpdateErr) throw cancelUpdateErr;
      if (requirePendingDelivery && !cancelledOrder) {
        await loadOrders();
        return { ok: false, reason: 'already_processed' };
      }
      console.log('[CANCEL ORDER] Order status updated to cancelled');

      if (fullOrder?.table_number) {
        try {
          await supabase
            .from('tables')
            .update({ status: 'available', current_order_id: null })
            .eq('restaurant_id', restaurantId)
            .eq('identifier', fullOrder.table_number);
        } catch (e) { console.error('Error releasing table:', e); }
      }

      const { data: invoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', orderId)
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
            reason: finalReason,
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

        // Attempt manual loyalty reversal for non-invoiced orders (e.g. if points were redeemed on a New order)
        if (restaurant?.loyalty_enabled) {
          console.log('[CANCEL ORDER] Loyalty enabled, checking/reversing transactions for non-invoiced order');
          try {
            await LoyaltyService.handleOrderReversal(supabase, {
              restaurant_id: restaurantId,
              order_id: orderId
            });
            console.log('[CANCEL ORDER] Manual Loyalty Reversal Checked/Completed');
          } catch (error) {
            console.error('[CANCEL ORDER] Loyalty reversal failed:', error);
          }
        }
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

      await loadOrders();
      return { ok: true };
    } catch (error) {
      console.error('[CANCEL ORDER] Error:', error);
      setError(error.message);
      return { ok: false, reason: error.message || 'cancel_failed' };
    }
  }

  const handleCancelConfirm = async (reason) => {
    if (!cancelOrderDialog) return;
    const result = await cancelOrderById(cancelOrderDialog.id, reason);
    if (result?.ok) {
      setCancelOrderDialog(null);
    }
  };
  const handleCancelDismiss = () => setCancelOrderDialog(null);

  // Accept a delivery order: promote to 'new', trigger KOT print
  const handleAcceptDelivery = async (order) => {
    const orderId = typeof order === 'string' ? order : order?.id;
    if (!supabase || !restaurantId || !orderId) return;
    try {
      // Primary path: server-side atomic accept (avoids client-RLS/race mismatches).
      const response = await fetch('/api/orders/accept-delivery/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          restaurant_id: restaurantId,
        }),
      });

      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        const orderForPrint = payload?.order_for_print;
        if (orderForPrint?.id) {
          window.dispatchEvent(
            new CustomEvent('auto-print-order', {
              detail: { ...orderForPrint, autoPrint: true, kind: 'kot' },
            })
          );
        }
        await loadOrders();
        return;
      }

      // Fallback path: local client update (kept for resilience in dev outages).
      const fullOrder = await fetchFullOrder(supabase, orderId);
      if (!fullOrder || !isPendingDeliveryOrder(fullOrder)) {
        await loadOrders();
        return;
      }

      const { data: promotedOrder, error: updateErr } = await supabase
        .from('orders')
        .update({ status: 'new' })
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId)
        .eq('status', 'pending_acceptance')
        .select('id')
        .maybeSingle();
      if (updateErr) throw updateErr;
      if (!promotedOrder) {
        await loadOrders();
        return;
      }

      const orderForPrint = { ...fullOrder, status: 'new' };
      try {
        await supabase.from('kot_print_queue').insert({
          restaurant_id: restaurantId,
          order_id: orderId,
          print_data: orderForPrint,
          processed: false,
        });
      } catch (qErr) {
        console.warn('[ACCEPT DELIVERY] kot_print_queue insert failed (fallback path):', qErr);
      }

      window.dispatchEvent(
        new CustomEvent('auto-print-order', {
          detail: { ...orderForPrint, autoPrint: true, kind: 'kot' },
        })
      );
      await loadOrders();
    } catch (e) {
      console.error('[ACCEPT DELIVERY] Error:', e);
      setError(e.message || 'Failed to accept delivery order');
    }
  };

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

      // Insert into print queue for cross-device KOT printing
      if (data.order_for_print && (editingOrder.status === 'new' || editingOrder.status === 'in_progress')) {
        try {
          await supabase
            .from('kot_print_queue')
            .insert({
              restaurant_id: restaurantId,
              order_id: editingOrder.id,
              print_data: data.order_for_print,
              processed: false
            });
          console.log('[EDIT] Inserted into print queue for order:', editingOrder.id);
        } catch (err) {
          console.error('[EDIT] Failed to insert into print queue:', err);
        }
      }

      // Dispatch locally for this device to print if needed
      if (data.order_for_print) {
        window.dispatchEvent(
          new CustomEvent('auto-print-order', {
            detail: {
              ...data.order_for_print,
              autoPrint: true,
              kind: 'kot',
            },
          })
        );
      }

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
      .select('*, order_items(*, menu_items(name, uom:unit_of_measures(precision))), order_customers(*, restaurant_customer(name, phone))')
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
        const [pa, n, i, r, c] = await Promise.all([
          fetchBucket('pending_acceptance', 1, supabase, restaurantId),
          fetchBucket('new', 1, supabase, restaurantId),
          fetchBucket('in_progress', 1, supabase, restaurantId),
          fetchBucket('ready', 1, supabase, restaurantId),
          fetchBucket('completed', page, supabase, restaurantId),
        ]);

        setOrdersByStatus((prev) => ({
          pending_acceptance: pa,
          new: n,
          in_progress: i,
          ready: r,
          completed: c,
          mobileFilter: prev.mobileFilter || 'new',
        }));
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

  // Handle deep-link from notification Accept/Decline buttons
  // URL format: /owner/orders?highlight=<orderId>&action=accept|decline
  useEffect(() => {
    if (!router.isReady || !restaurantId || loading) return;
    const action = String(router.query.action || '').toLowerCase();
    const highlight = String(router.query.highlight || '');
    if (!highlight) return;

    const actionKey = `${highlight}:${action || 'view'}`;
    const handled = handledDeepLinkActionKeysRef.current;
    if (handled.has(actionKey)) return;
    handled.add(actionKey);

    // Keep dedupe set bounded.
    if (handled.size > 500) {
      const trimCount = Math.max(100, handled.size - 350);
      let idx = 0;
      for (const key of handled) {
        handled.delete(key);
        idx += 1;
        if (idx >= trimCount) break;
      }
    }

    setDeliveryDecisionOrderId(null);
    let canceled = false;

    (async () => {
      try {
        if (action === 'accept') {
          await handleAcceptDelivery(highlight);
        } else if (action === 'decline') {
          if (!canCancel) {
            setError('Staff accounts cannot cancel/decline delivery orders.');
            return;
          }
          await cancelOrderById(highlight, 'Declined from push notification banner', { requirePendingDelivery: true });
        } else {
          const fullOrder = await fetchFullOrder(supabase, highlight);
          if (!canceled && isPendingDeliveryOrder(fullOrder)) {
            setDeliveryDecisionOrderId(highlight);
          }
        }
      } finally {
        if (!canceled) {
          router.replace('/owner/orders', undefined, { shallow: true });
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [router.isReady, restaurantId, loading, canCancel, router.query.action, router.query.highlight, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

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
                  updated[status] = (prev[status] || []).filter((o) => o.id !== fullOrder.id);
                }
                const targetBucket = fullOrder.status;
                if (targetBucket && updated[targetBucket] !== undefined) {
                  updated[targetBucket] = [fullOrder, ...updated[targetBucket]];
                }
                return updated;
              });
              // New regular orders: short alert. Pending delivery: banner + looping alarm.
              if (payload.eventType === 'INSERT') {
                if (fullOrder.status === 'pending_acceptance') {
                  notifyPendingDeliveryViaBanner(fullOrder);
                } else if (fullOrder.status === 'new') {
                  playNotificationSound();
                }
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
            const cutoff = new Date(Date.now() - 120000).toISOString();
            // Catch-up for pending delivery orders
            const { data: pa } = await supabase
              .from('orders')
              .select('*, order_items(*, menu_items(name, uom:unit_of_measures(precision)))')
              .eq('restaurant_id', restaurantId)
              .eq('status', 'pending_acceptance')
              .gte('updated_at', cutoff)
              .order('updated_at', { ascending: true });
            // Catch-up for new regular orders
            const { data } = await supabase
              .from('orders')
              .select('*, order_items(*, menu_items(name, uom:unit_of_measures(precision)))')
              .eq('restaurant_id', restaurantId)
              .eq('status', 'new')
              .gte('updated_at', cutoff)
              .order('updated_at', { ascending: true });
            setOrdersByStatus((prev) => ({
              ...prev,
              pending_acceptance: pa
                ? [...pa, ...(prev.pending_acceptance || [])].filter((o, idx, arr) => arr.findIndex((x) => x.id === o.id) === idx)
                : prev.pending_acceptance || [],
              new: data
                ? [...data, ...prev.new].filter((o, idx, arr) => arr.findIndex((x) => x.id === o.id) === idx)
                : prev.new,
            }));

            // If FCM/WebPush was missed (common in localhost dev), still raise in-app banner+alarm.
            if (Array.isArray(pa) && pa.length) {
              pa.forEach((order) => notifyPendingDeliveryViaBanner(order));
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
  }, [supabase, restaurantId, playNotificationSound, notifyPendingDeliveryViaBanner]);


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

      if (val === 'takeaway' || val === 'parcel') {
        tableNum = null;
        orderType = 'takeaway';
      } else if (val === 'delivery') {
        tableNum = null;
        orderType = 'delivery';
      } else if (val && val.startsWith('table:')) {
        tableNum = val.split(':')[1];
        orderType = 'dine-in';
      } else {
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
    console.log('[FINALIZE] START', order?.id, order?.payment_method); // DEBUG

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
    // If actual_payment_method is 'credit' or payment_method is 'credit'
    const isCredit = (order?.payment_method === 'credit') || (order?.actual_payment_method === 'credit') || (order?.is_credit);
    if (isCredit) {
      console.log('[FINALIZE] Credit order -> completing directly'); // DEBUG
      complete(order.id);
      return;
    }

    // If invoice already exists and fully paid, skip dialog
    // BUT: Only if remaining logic confirms it's paid. We'll do calculation first.

    // Calculate payment status
    const orderTotal = computeOrderTotalDisplay(order);
    const paidAmount = Number(invoice?.paid_amount || 0);
    const remainingAmount = orderTotal - paidAmount;
    const refundAmount = paidAmount > orderTotal ? paidAmount - orderTotal : 0;

    // STRICT CHECK: If invoice says "paid" AND we barely have anything left to pay, then skip.
    // Otherwise, if there is ANY discrepancy, show dialog.
    if (invoice?.status === 'paid' && remainingAmount <= 0.01 && refundAmount <= 0.01) {
      console.log('[FINALIZE] Invoice paid & calcs match -> completing directly'); // DEBUG
      complete(order.id);
      return;
    }

    // Determine mode
    let mode = null;
    if (remainingAmount > 0.01) {
      mode = 'collect'; // Need to collect remaining payment
    } else if (refundAmount > 0.01) {
      mode = 'refund'; // Need to refund excess payment
    } else {
      // Exact match, no refund needed.
      // If we are here, it means invoice might NOT be 'paid' status but amounts match?
      // Or it's a new order with 0 paid.
      // If amounts match exactly (e.g. 0 total), just complete.
      if (orderTotal <= 0.01) {
        complete(order.id);
        return;
      }

      // If amounts match but invoice not paid? 
      // We should probably just complete it if it's "Settled".
      // But let's show dialog with 0 due just to confirm "Complete"? 
      // No, users hate extra clicks.
      // If remaining is 0, we can skip.
      console.log('[FINALIZE] Amounts balanced (0 remaining) -> completing directly');
      complete(order.id);
      return;
    }

    console.log('[FINALIZE] Showing Dialog. Mode:', mode, 'Remaining:', remainingAmount);

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

  // Updated handler - receives payment method AND details (discount, mixed info, etc.)
  const handlePaymentConfirmed = (actualPaymentMethod, details = null) => {
    if (!paymentConfirmDialog) return;
    complete(paymentConfirmDialog.id, actualPaymentMethod, details);
    setPaymentConfirmDialog(null);
  };

  // Updated complete function - no auto-open PDF + save payment method
  // Updated complete function - handles details object
  const complete = async (orderId, actualPaymentMethod = null, details = null) => {
    if (!supabase) return;
    setGeneratingInvoice(orderId);
    try {
      // 1. Determine Payment Method
      let finalPaymentMethod = actualPaymentMethod;
      if (!finalPaymentMethod) {
        // Logic for credit orders
        const { data: order } = await supabase.from('orders').select('payment_method, actual_payment_method, is_credit, credit_customer_id').eq('id', orderId).single();
        finalPaymentMethod = order?.payment_method || order?.actual_payment_method || 'cash';
        if (order?.is_credit && order?.credit_customer_id) finalPaymentMethod = 'credit';
      }

      // 2. Call Unified Backend API
      const response = await fetch('/api/orders/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          restaurant_id: restaurantId,
          payment_method: finalPaymentMethod,
          discount_obj: details?.discount_obj,
          round_off_amount: details?.round_off_amount,
          updated_items: details?.updated_items,
          mixed_payment_details: details?.mixed_payment_details,
          base_tax_rate: details?.base_tax_rate,
          loyalty_amount_used: details?.loyalty_amount_used,
          loyalty_points_used: details?.loyalty_points_used
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to complete order');
      }

      const result = await response.json();

      // 3. Optional: Trigger auto-print of the final invoice
      // Disabled as per user request to stop automatic bill/kot printing after payment
      /*
      if (result.order_for_print) {
         // Merge detail overrides to ensure UI reflects latest input immediately
         const finalPrintData = {
             ...result.order_for_print,
             bill: {
                 ...result.order_for_print.bill,
                 // Ensure Payment/Discount info is explicit
                 discount_amount: details?.discount_obj?.value || result.order_for_print.discount_amount,
                 loyalty_amount_used: details?.loyalty_amount_used || result.order_for_print.loyalty_amount_used,
                 loyalty_points_used: details?.loyalty_points_used || result.order_for_print.loyalty_points_used,
                 order_discount_base: result.order_for_print.bill?.order_discount_base // ensure this flows if present
             }
         };
  
         window.dispatchEvent(
           new CustomEvent('auto-print-order', {
             detail: {
               ...finalPrintData,
               autoPrint: true,
               kind: 'invoice',
             },
           })
         );
      }
      */

      // 4. Loyalty & Print logic is now handled by backend /api/orders/complete
      // We only need to reload orders.
      queryClient.invalidateQueries({ queryKey: tableKeys.all });
      await loadOrders();
    } catch (e) {
      console.error('[COMPLETE ORDER] Error:', e);
      setError(e.message);
    } finally {
      setGeneratingInvoice(null);
    }
  };




  if (checking || restLoading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!restaurantId) return <div style={{ padding: 16 }}>No restaurant found.</div>;

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

      <div style={{ padding: '0 12px 10px', display: 'flex', justifyContent: 'flex-start' }}>
        <EnableAlertsButton restaurantId={restaurantId} />
      </div>

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
        <Card padding={12} style={{ background: '#fee2e2', border: '1px solid #fecaca', margin: '0 12px 12px' }}>
          <span style={{ color: '#b91c1c' }}>{error}</span>
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
              canCancel={canCancel}
              order={order}
              statusColor={COLORS[order.status] || COLORS.new}
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
          let rawColOrders = col.statuses.flatMap((st) => {
            if (st === 'pending_acceptance') return ordersByStatus.pending_acceptance || [];
            return ordersByStatus[st] || [];
          });

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
                      canCancel={canCancel}
                      order={order}
                      statusColor={COLORS[order.status] || COLORS.new}
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

                          // 1. Fetch Order with items
                          const { data: fullOrder } = await s
                            .from('orders')
                            .select('*, order_items(*, menu_items(name))')
                            .eq('id', order.id)
                            .maybeSingle();

                          const base = fullOrder || order;

                          // 2. Fetch Invoice
                          const { data: invoice } = await s
                            .from('invoices')
                            .select('invoice_no')
                            .eq('order_id', order.id)
                            .order('invoice_date', { ascending: false })
                            .maybeSingle();

                          // 3. Fetch Loyalty
                          const { data: loyaltyTx } = await s
                            .from('loyalty_transactions')
                            .select('txn_type, points_redeemed, amount_value')
                            .eq('order_id', order.id)
                            .eq('txn_type', 'redeem')
                            .maybeSingle();

                          const orderForPrint = {
                            ...base,
                            invoice_no: invoice?.invoice_no || base.invoice_no || null,
                            loyalty_amount_used: loyaltyTx?.amount_value || base.loyalty_amount_used || 0,
                            loyalty_points_used: loyaltyTx?.points_redeemed || base.loyalty_points_used || 0
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

      {deliveryDecisionOrderId && (
        <DeliveryDecisionDialog
          orderId={deliveryDecisionOrderId}
          canDecline={canCancel}
          onClose={() => setDeliveryDecisionOrderId(null)}
          onAccept={async () => {
            await handleAcceptDelivery(deliveryDecisionOrderId);
          }}
          onDecline={async () => {
            if (!canCancel) {
              setError('Staff accounts cannot cancel/decline delivery orders.');
              return;
            }
            await cancelOrderById(deliveryDecisionOrderId, 'Declined from push notification banner', { requirePendingDelivery: true });
          }}
        />
      )}

      {cancelOrderDialog && canCancel && (
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
          tables={tables}
          tablesCount={tablesCount}
          onSave={(val) => {
            updateTableNumber(tableEditOrder.id, val);
            setTableEditOrder(null);
          }}
        />
      )}

      {/* Global "Show All Items" Modal */}
      {itemsModalOrder && (
        <OrderItemsModal
          order={itemsModalOrder}
          modalLoyalty={modalLoyalty}
          onClose={() => setItemsModalOrder(null)}
        />
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
.kanban { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; padding:12px 16px; }
.kanban-col-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.pill { background:#f3f4f6; padding:4px 10px; border-radius:9999px; font-size:12px; }
.kanban-col-body { display:flex; flex-direction:column; gap:10px; max-height:70vh; overflow-y:auto; }
.empty-col { text-align:center; color:#9ca3af; padding:20px; border:1px dashed #e5e7eb; border-radius:8px; }
@media (max-width:1280px) {
  .kanban { grid-template-columns:repeat(4,minmax(220px,1fr)); overflow-x:auto; }
}
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
  if (order.table_number && order.table_number !== null) {
    return `Table ${order.table_number}`;
  }
  if (order.order_type === 'parcel' || order.order_type === 'takeaway') return 'Takeaway';
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
  onEditOrder,
  onEditPax,
  onEditTable,
  onShowItems,
  canCancel = true
}) {
  const items = toDisplayItems(order);
  const total = computeOrderTotalDisplay(order);

  const isCreditOrder = order?.is_credit && order?.credit_customer_id;
  const isPendingDelivery = order.status === 'pending_acceptance';
  const pm = String(order.payment_method || '').toLowerCase();

  // Choose class for accent border
  const statusClass =
    isPendingDelivery ? 'is-pending' :
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

        {/* Bottom Row: Metadata (Table, Pax, Credit, Delivery badge) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 2 }}>

          {/* Delivery badge when awaiting approval */}
          {isPendingDelivery && (
            <span style={{
              fontSize: 11, fontWeight: 800, background: '#f97316', color: 'white',
              padding: '2px 8px', borderRadius: 6, letterSpacing: '0.03em'
            }}>
              📦 DELIVERY — AWAITING APPROVAL
            </span>
          )}

          {/* Table edit tooltip (hidden for pending delivery to reduce clutter) */}
          {!isPendingDelivery && (
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
              {order.status !== 'completed' && <span style={{ fontSize: 11, opacity: 0.5 }}>✎</span>}
            </TooltipSpan>
          )}

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
              <span style={{ fontSize: 14 }}>👥</span>
              <span style={{ fontWeight: 600 }}>{order.number_of_customers}</span>
              {order.status !== 'completed' && <span style={{ fontSize: 11, opacity: 0.5 }}>✎</span>}
            </TooltipSpan>
          )}

          {isCreditOrder && <span style={{ fontSize: 10, background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>CREDIT</span>}
        </div>
      </OrderHeader>

      <div style={{ margin: '8px 0', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Show fewer items by default */}
        {items.slice(0, 3).map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontWeight: 600 }}>{formatQtyP(it.quantity, it.uom_precision ?? 0)}×</span> {(() => {
                let n = it.name || "Item";
                if (it.variant_name) {
                  const suffix = ` (${it.variant_name})`;
                  if (n.endsWith(suffix)) n = n.slice(0, -suffix.length);
                }
                return n;
              })()}
              {it.variant_name && <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 6 }}>({it.variant_name})</span>}
            </div>
          </div>
        ))}
        {items.length > 3 && (
          <div
            onClick={(e) => { e.stopPropagation(); onShowItems && onShowItems(order); }}
            style={{ fontSize: 12, color: statusColor, cursor: 'pointer', fontWeight: 600, marginTop: 4 }}
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
              {canCancel && (
                <Button size="sm" variant="danger" onClick={() => onCancelOrderOpen(order)}>
                  Cancel
                </Button>
              )}
              <Button size="sm" style={{ background: '#10b981', borderColor: '#10b981', color: 'white' }} onClick={() => onPrintKot && onPrintKot(order)}>KOT</Button>
            </>
          )}

          {/* In Progress */}
          {order.status === 'in_progress' && (
            <>
              <Button size="sm" onClick={() => onComplete(order)} disabled={generatingInvoice === order.id}>Done</Button>
              <Button size="sm" variant="outline" onClick={() => onEditOrder(order)}>Edit</Button>
              {/* Allow cancel if mistake */}
              {canCancel && (
                <Button size="sm" variant="danger" onClick={() => onCancelOrderOpen(order)}>
                  Cancel
                </Button>
              )}
              <Button size="sm" style={{ background: '#10b981', borderColor: '#10b981', color: 'white' }} onClick={() => onPrintBill && onPrintBill(order)}>Print Bill</Button>
            </>
          )}

          {/* Ready */}
          {order.status === 'ready' && (
            <>
              <Button size="sm" onClick={() => onComplete(order)} disabled={generatingInvoice === order.id}>
                {generatingInvoice === order.id ? '...' : 'Done'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onEditOrder(order)}>Edit</Button>
              {canCancel && (
                <Button size="sm" variant="danger" onClick={() => onCancelOrderOpen(order)}>
                  Cancel
                </Button>
              )}
              <Button size="sm" style={{ background: '#10b981', borderColor: '#10b981', color: 'white' }} onClick={() => onPrintBill && onPrintBill(order)}>Print Bill</Button>
            </>
          )}

          {/* Completed Orders */}
          {order.status === 'completed' && (
            <>
              <Button size="sm" onClick={async () => {
                try { await downloadInvoicePdf(order.id) } catch (e) { alert(e.message) }
              }} disabled={generatingInvoice === order.id}>Invoice</Button>
              <Button size="sm" style={{ background: '#10b981', borderColor: '#10b981', color: 'white' }} onClick={() => onPrintBill && onPrintBill(order)}>Print Bill</Button>
              {canCancel && (
                <Button size="sm" variant="danger" onClick={() => onCancelOrderOpen(order)}>
                  Cancel
                </Button>
              )}
            </>
          )}

        </div>
      </CardFooter>
    </OrderCardStyled>
  );
}
