// pages/owner/counter.js

import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import { getSupabase } from '../../services/supabase';
import MenuItemCard from '../../components/MenuItemCard';
import MenuItemCardSimple from '../../components/MenuItemCardSimple';
import VariantSelector from '../../components/VariantSelector';
import NiceSelect from '../../components/NiceSelect';
import { useAlert } from '../../context/AlertContext';
import HorizontalScrollRow from '../../components/HorizontalScrollRow';
import PremiumTimeSelect from '../../components/PremiumTimeSelect';
import { round2, normalizeQty, formatQty2 } from '../../lib/qty';

// -------------------------------
// Inline Payment Confirm Dialog
// -------------------------------
function PaymentConfirmDialog({ amount, onConfirm, onCancel, busy = false, mode = 'settle' }) {
  const BRAND = mode === 'kitchen'
    ? { orange: '#f97316', orangeDark: '#ea580c', bgSoft: '#fff7ed', border: '#e5e7eb', text: '#111827' }
    : { orange: '#16a34a', orangeDark: '#15803d', bgSoft: '#ecfdf3', border: '#e5e7eb', text: '#111827' };

  
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showMixedForm, setShowMixedForm] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');
  const [onlineMethod, setOnlineMethod] = useState('upi');
  const [submitting, setSubmitting] = useState(false);
  const total = Number(amount || 0);
  const disabled = busy || submitting;

  const choiceBox = (active) => ({
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    padding: '16px 18px',
    borderRadius: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: `2px solid ${active ? BRAND.orange : '#e5e7eb'}`,
    background: active ? `linear-gradient(135deg, ${BRAND.bgSoft} 0%, #ffffff 100%)` : '#fff',
    color: BRAND.text,
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: active ? `0 4px 12px ${BRAND.orange}20` : '0 1px 3px rgba(0,0,0,0.05)',
    transform: active ? 'translateY(-2px)' : 'none'
  });

  const handleMethodSelect = (method) => {
    if (disabled) return;
    setPaymentMethod(method);
    setShowMixedForm(method === 'mixed');
    if (method !== 'mixed') { setCashAmount(''); setOnlineAmount(''); }
  };

  const validateMixed = () => {
    const cash = Number(cashAmount || 0);
    const online = Number(onlineAmount || 0);
    if (cash <= 0 || online <= 0) { alert('Both cash and online must be > 0'); return false; }
    if (Math.abs((cash + online) - total) > 0.01) { alert(`Split must equal ₹${total.toFixed(2)}`); return false; }
    return true;
  };

  const handleConfirm = async () => {
    if (disabled) return;
    try {
      setSubmitting(true);
      if (paymentMethod === 'mixed') {
        if (!validateMixed()) { setSubmitting(false); return; }
        await onConfirm('mixed', {
          cash_amount: Number(cashAmount).toFixed(2),
          online_amount: Number(onlineAmount).toFixed(2),
          online_method: onlineMethod,
          is_mixed: true
        });
      } else {
        await onConfirm(paymentMethod, null);
      }
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        background: '#fff',
        padding: '20px',
        borderRadius: 16,
        maxWidth: 440,
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.2)',
        animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{
            margin: '0 0 8px',
            fontSize: '18px',
            fontWeight: 700,
            color: '#0f172a'
          }}>
            Payment Confirmation
          </h3>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: `linear-gradient(135deg, ${BRAND.bgSoft} 0%, #ffffff 100%)`,
            padding: '6px 12px',
            borderRadius: 8,
            border: `2px solid ${BRAND.orange}`
          }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Amount:</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: BRAND.orange }}>₹{total.toFixed(2)}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          <label style={choiceBox(paymentMethod === 'cash')} onClick={() => handleMethodSelect('cash')}>
            <div style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: `2px solid ${paymentMethod === 'cash' ? BRAND.orange : '#cbd5e1'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {paymentMethod === 'cash' && (
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: BRAND.orange
                }} />
              )}
            </div>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>💵 Cash</span>
          </label>

          <label style={choiceBox(paymentMethod === 'online')} onClick={() => handleMethodSelect('online')}>
            <div style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: `2px solid ${paymentMethod === 'online' ? BRAND.orange : '#cbd5e1'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {paymentMethod === 'online' && (
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: BRAND.orange
                }} />
              )}
            </div>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>💳 Online (UPI/Card)</span>
          </label>

          <label style={choiceBox(paymentMethod === 'mixed')} onClick={() => handleMethodSelect('mixed')}>
            <div style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: `2px solid ${paymentMethod === 'mixed' ? BRAND.orange : '#cbd5e1'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {paymentMethod === 'mixed' && (
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: BRAND.orange
                }} />
              )}
            </div>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>🔀 Mixed (Cash + Online)</span>
          </label>
        </div>

        {showMixedForm && (
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 12,
            marginBottom: 16
          }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                  Cash Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCashAmount(val);
                    const c = Number(val);
                    if (!isNaN(c)) {
                      const rem = Math.max(0, total - c);
                      setOnlineAmount(rem.toFixed(2));
                    }
                  }}
                  disabled={disabled}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                  Online Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={onlineAmount}
                  onChange={(e) => setOnlineAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '2px solid #e2e8f0',
                    borderRadius: 6,
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                  disabled={disabled}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                  Online Method
                </label>
                <NiceSelect
                  value={onlineMethod}
                  onChange={setOnlineMethod}
                  options={[
                    { value: 'upi', label: 'UPI' },
                    { value: 'card', label: 'Card' }
                  ]}
                />
              </div>
              <div style={{
                background: `linear-gradient(135deg, ${BRAND.bgSoft} 0%, #ffffff 100%)`,
                padding: 10,
                borderLeft: `3px solid ${BRAND.orange}`,
                borderRadius: 6,
                fontSize: '13px',
                fontWeight: 600,
                color: '#1e293b'
              }}>
                Total ₹{total.toFixed(2)} → ₹{cashAmount || 0} + ₹{onlineAmount || 0} ({onlineMethod.toUpperCase()})
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={disabled}
            style={{
              flex: 1,
              background: '#fff',
              color: '#64748b',
              border: '2px solid #e2e8f0',
              padding: '10px',
              borderRadius: 10,
              fontSize: '14px',
              fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#fff';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={disabled}
            style={{
              flex: 2,
              background: disabled ? '#cbd5e1' : `linear-gradient(135deg, ${BRAND.orange} 0%, ${BRAND.orangeDark} 100%)`,
              color: '#fff',
              border: 'none',
              padding: '10px',
              borderRadius: 10,
              fontSize: '14px',
              fontWeight: 700,
              cursor: disabled ? 'not-allowed' : 'pointer',
              boxShadow: disabled ? 'none' : `0 6px 12px ${BRAND.orange}40`,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              textTransform: 'uppercase',
              letterSpacing: '0.3px'
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = `0 8px 16px ${BRAND.orange}50`;
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 6px 12px ${BRAND.orange}40`;
              }
            }}
          >
            {disabled ? 'Processing…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

const NewCreditCustomerModal = ({ visible, onClose, onSave, name, setName, phone, setPhone, processing, theme, error }) => {
  if (!visible) return null;
  
  const isValidPhone = /^\d{10}$/.test(phone.trim());
  const canSave = name.trim().length >= 2 && isValidPhone;

  const handlePhoneChange = (e) => {
    const val = e.target.value.replace(/\D/g, ''); // only digits
    if (val.length <= 10) setPhone(val);
  };

  return (
    <div 
      style={{ 
        position: 'fixed', inset: 0, 
        background: 'rgba(15, 23, 42, 0.45)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center', 
        padding: '24px', zIndex: 2000, 
        backdropFilter: 'blur(2px)',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div 
        style={{ 
          background: '#ffffff', borderRadius: '16px', 
          width: '100%', maxWidth: '440px', 
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)', 
          border: '1px solid #e5e7eb', 
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '24px 24px 0' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: '#111827' }}>New Credit Customer</h3>
          <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#64748b' }}>Enter customer details to establish a credit account.</p>
        </div>
        
        <div style={{ padding: '0 24px 24px', display: 'grid', gap: '20px' }}>
          {error && (
            <div style={{ 
              background: '#fef2f2', border: '1px solid #fecaca', 
              color: '#dc2626', padding: '12px', borderRadius: '8px', 
              fontSize: '13px', fontWeight: 500, lineHeight: 1.4
            }}>
              {error}
            </div>
          )}

          <div>
            <SectionLabel>Full Name</SectionLabel>
            <input 
              type="text" 
              value={name} onChange={(e) => setName(e.target.value)} 
              style={{ 
                width: '100%', padding: '12px 16px', background: '#f9fafb', 
                border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', 
                fontSize: '15px', transition: 'all 0.2s'
              }} 
              onFocus={(e) => {
                e.target.style.borderColor = theme.main;
                e.target.style.background = '#ffffff';
                e.target.style.boxShadow = `0 0 0 3px ${theme.main}15`;
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db';
                e.target.style.background = '#f9fafb';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
          <div>
            <SectionLabel>Phone Number</SectionLabel>
            <input 
              type="tel" 
              value={phone} onChange={handlePhoneChange} 
              style={{ 
                width: '100%', padding: '12px 16px', background: '#f9fafb', 
                border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', 
                fontSize: '15px', transition: 'all 0.2s'
              }} 
              onFocus={(e) => {
                e.target.style.borderColor = theme.main;
                e.target.style.background = '#ffffff';
                e.target.style.boxShadow = `0 0 0 3px ${theme.main}15`;
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db';
                e.target.style.background = '#f9fafb';
                e.target.style.boxShadow = 'none';
              }}
            />
            {phone.trim().length > 0 && phone.trim().length < 10 && (
              <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px', fontWeight: 500 }}>
                Please enter a 10-digit phone number
              </div>
            )}
          </div>
        </div>

        <div style={{ 
          padding: '20px 24px 24px', 
          borderTop: '1px solid #f3f4f6', 
          display: 'flex', justifyContent: 'flex-end', gap: '12px', 
          background: '#fafafa' 
        }}>
          <button 
            onClick={onClose}
            style={{ 
              padding: '10px 20px', background: '#ffffff', color: '#4b5563', 
              border: '1px solid #d1d5db', borderRadius: '99px', fontWeight: 500, 
              fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            Cancel
          </button>
          <button 
            onClick={onSave}
            disabled={processing || !canSave}
            style={{ 
              padding: '10px 24px', 
              background: processing || !canSave ? '#cbd5e1' : theme.main, 
              color: '#ffffff', border: 'none', 
              borderRadius: '99px', fontWeight: 600, fontSize: '14px', 
              cursor: processing || !canSave ? 'not-allowed' : 'pointer',
              boxShadow: processing || !canSave ? 'none' : `0 4px 6px -1px ${theme.main}40`,
              transition: 'all 0.2s'
            }}
          >
            {processing ? 'Saving...' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
};

const PulseAnimation = () => (
  <style>{`
    @keyframes pulse-soft {
      0% { box-shadow: 0 0 0 0 rgba(var(--brand-rgb), 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(var(--brand-rgb), 0); }
      100% { box-shadow: 0 0 0 0 rgba(var(--brand-rgb), 0); }
    }
    .cart-pulse {
      animation: pulse-soft 2s infinite;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `}</style>
);

const ControlsCard = ({ children, theme }) => (
  <div style={{
    background: '#ffffff',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    border: '1px solid #f1f5f9',
    marginBottom: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  }}>
    {children}
  </div>
);

const SectionLabel = ({ children }) => (
  <div style={{ 
    fontSize: '12px', 
    fontWeight: 700, 
    color: '#64748b', 
    textTransform: 'uppercase', 
    letterSpacing: '0.05em',
    marginBottom: '8px'
  }}>
    {children}
  </div>
);

// -------------------------------
// Counter Sale Page
// -------------------------------
export default function CounterSale() {
  const supabase = getSupabase();
  const { checking } = useRequireAuth(supabase);
  const { restaurant, loading: loadingRestaurant } = useRestaurant();
  const router = useRouter();
  const restaurantId = restaurant?.id;
  const [popularIds, setPopularIds] = useState(new Set());
  const [popCounts, setPopCounts] = useState(new Map());   // id -> total qty
  const nameIndexRef = useRef(new Map());                  // normalized name -> id
// inside CounterSale
  const [printProfile, setPrintProfile] = useState(null);

// CounterSale component (pages/owner/counter.js)
const [qtyDrafts, setQtyDrafts] = useState({}); // cartId -> string

const setDraft = (cartId, v) =>
  setQtyDrafts((prev) => ({ ...prev, [cartId]: v }));

const clearDraft = (cartId) =>
  setQtyDrafts((prev) => {
    const next = { ...prev };
    delete next[cartId];
    return next;
  });

const updateCartItem = (cartId, qty) => {
  const q = round2(qty);
  if (!Number.isFinite(q) || q <= 0) {
    setCart((p) => p.filter((c) => c.cartId !== cartId));
    clearDraft(cartId);
    return;
  }
  setCart((p) => p.map((c) => (c.cartId === cartId ? { ...c, quantity: q } : c)));
  clearDraft(cartId);
};

const commitQtyDraft = (cartId, raw) => {
  const q = normalizeQty(raw, { allowZero: true }); // allow 0 => remove line
  if (q === 0) return updateCartItem(cartId, 0);
  if (q === null) {
    clearDraft(cartId); // revert UI
    return;
  }
  return updateCartItem(cartId, q);
};

const getDraftOrQtyNumber = (cartId, fallbackQty) => {
  const parsed = normalizeQty(qtyDrafts[cartId], { allowZero: true });
  if (parsed === null) return Number(fallbackQty || 0);
  return parsed;
};


  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [filterMode, setFilterMode] = useState('all');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [numberOfCustomers, setNumberOfCustomers] = useState('');
  const [orderDate, setOrderDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  });
  const [orderTime, setOrderTime] = useState(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Credit mode
  const [isCreditSale, setIsCreditSale] = useState(false);
  const [creditCustomers, setCreditCustomers] = useState([]);
  const [selectedCreditCustomerId, setSelectedCreditCustomerId] = useState('');
  const [creditCustomerBalance, setCreditCustomerBalance] = useState(0);
  const [showNewCreditCustomer, setShowNewCreditCustomer] = useState(false);
  const [creditFeatureEnabled, setCreditFeatureEnabled] = useState(false);


  const [orderSelect, setOrderSelect] = useState('');
  const [processing, setProcessing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const [sendToKitchenEnabled, setSendToKitchenEnabled] = useState(true);
  const [enableMenuImages, setEnableMenuImages] = useState(false);

  // Variant selector state
  const [showVariantSelector, setShowVariantSelector] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);


  // NEW: Order mode toggle
const [orderMode, setOrderMode] = useState('settle');
  // inside CounterSale component
  const THEME = orderMode === 'kitchen'
  ? { main: '#f97316', dark: '#ea580c', soft: '#fff7ed', rgb: '249, 115, 22' }  // orange
  : { main: '#16a34a', dark: '#15803d', soft: '#ecfdf3', rgb: '22, 163, 74' }; // green




  // NEW: profile tax settings for client‑side totals
  const [profileTax, setProfileTax] = useState({
    gst_enabled: false,
    default_tax_rate: 0,
    prices_include_tax: true
  });

  // Upsells for cart
  const [cartUpsells, setCartUpsells] = useState([]);

  const menuMapRef = useRef(new Map());

  // Helpers
  const cacheMenuIntoMap = (list) => {
  const byId = new Map();
  const byName = new Map();
  list.forEach((r) => {
    byId.set(r.id, r);
    if (r.name) byName.set(r.name.trim().toLowerCase(), r.id);
  });
  menuMapRef.current = byId;
  nameIndexRef.current = byName;
};


  // Compute client-side totals mirroring server rules
  function computeCartTotals(cartItems, profile) {
    const gstEnabled = !!profile?.gst_enabled;
    const baseRate = Number(profile?.default_tax_rate ?? 0);
    const serviceInclude = gstEnabled ? !!profile?.prices_include_tax : false;

    let subtotalEx = 0;
    let totalTax = 0;
    let totalInc = 0;

    for (const it of cartItems) {
      const qty = Number(it.quantity ?? 1);
      const unit = Number(it.price ?? 0);

      const isPackaged = !!it.is_packaged_good;
      const itemTaxRate = Number(it.tax_rate ?? NaN);
      let effectiveRate = 0;

      if (gstEnabled) {
        if (isPackaged) {
          effectiveRate = Number.isFinite(itemTaxRate) && itemTaxRate > 0 ? itemTaxRate : baseRate;
        } else {
          effectiveRate = baseRate;
        }
        if (!(effectiveRate > 0)) effectiveRate = baseRate;
      }

      let unitEx, unitInc, lineEx, taxAmt, lineInc;

      if (isPackaged || serviceInclude) {
        // Treat entered unit as tax-inclusive for packaged goods or inclusive pricing mode
        unitInc = unit;
        unitEx = effectiveRate > 0 ? unitInc / (1 + effectiveRate / 100) : unitInc;
        lineInc = unitInc * qty;
        lineEx = unitEx * qty;
        taxAmt = lineInc - lineEx;
      } else {
        // Treat unit as tax-exclusive
        unitEx = unit;
        lineEx = unitEx * qty;
        taxAmt = (effectiveRate / 100) * lineEx;
        lineInc = lineEx + taxAmt;
        unitInc = effectiveRate > 0 ? unitEx * (1 + effectiveRate / 100) : unitEx;
      }

      subtotalEx += Number(lineEx.toFixed(2));
      totalTax += Number(taxAmt.toFixed(2));
      totalInc += Number(lineInc.toFixed(2));
    }

    return {
      subtotalEx: Number(subtotalEx.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      totalInc: Number(totalInc.toFixed(2))
    };
  }

  const cartTotals = useMemo(() => computeCartTotals(cart, profileTax), [cart, profileTax]);



  
  // Startup loads
  useEffect(() => {
    if (checking || loadingRestaurant || !restaurantId) return;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data: menu, error: menuErr } = await supabase
          .from('menu_items')
          .select(`
            id,name,price,category,veg,status,hsn,tax_rate,is_packaged_good,code_number,image_url,has_variants,
            menu_item_variants(
              variant_templates(
                id,
                name
              )
            )
          `)
          .eq('restaurant_id', restaurantId)
          .order('category')
          .order('name');
        if (menuErr) throw menuErr;
        
        // Fetch variant pricing separately for items with variants
        const itemsWithVariants = (menu || []).filter(item => item.has_variants);
        const variantDataMap = new Map();
        
        if (itemsWithVariants.length > 0) {
          const itemIds = itemsWithVariants.map(item => item.id);
          const { data: variantPricing } = await supabase
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
          
          // Group by menu_item_id
          (variantPricing || []).forEach(vp => {
            if (!variantDataMap.has(vp.menu_item_id)) {
              variantDataMap.set(vp.menu_item_id, []);
            }
            variantDataMap.get(vp.menu_item_id).push({
              variant_id: vp.variant_options.id,
              variant_name: vp.variant_options.name,
              price: vp.price,
              is_available: vp.is_available,
              display_order: vp.variant_options.display_order
            });
          });
        }

        // Fetch Upsells (Add-ons)
        const { data: upsellsData } = await supabase
          .from('menu_items_with_upsells')
          .select('menu_item_id, upsells')
          .in('menu_item_id', (menu || []).map(i => i.id));
        
        const upsellMap = new Map();
        (upsellsData || []).forEach(row => {
            upsellMap.set(row.menu_item_id, row.upsells);
        });
        
        // Transform menu data with variants and upsells
        const transformedMenu = (menu || []).map(item => {
          const variants = variantDataMap.get(item.id) || [];
          const templateName = item.menu_item_variants?.[0]?.variant_templates?.name || 'Options';

          // Attach upsells
          const rawUpsells = upsellMap.get(item.id) || [];
          let addonGroups = [];
          let hasAddons = false;

          if (rawUpsells.length > 0) {
             addonGroups = [{
               id: 'upsells-group',
               name: 'Suggested Extras',
               min_selections: 0,
               max_selections: null,
               options: rawUpsells.map(u => ({
                  id: u.id,
                  name: u.name,
                  price: u.price,
                  is_active: u.status === 'available',
                  veg: u.veg,
                  image_url: u.image_url
               }))
             }];
             hasAddons = true;
          }
          
          return {
            ...item,
            variants: variants.sort((a, b) => a.display_order - b.display_order),
            variant_template_name: item.has_variants ? templateName : null,
            addon_groups: addonGroups,
            has_addons: hasAddons
          };
        });
        
        setMenuItems(transformedMenu);
        cacheMenuIntoMap(transformedMenu);

        // Pull tax settings for client calc
        const { data: profile, error: profErr } = await supabase
  .from('restaurant_profiles')
  .select(`
    tables_count,
    gst_enabled,
    default_tax_rate,
    prices_include_tax,
    features_credit_enabled,
    features_counter_send_to_kitchen_enabled,
    restaurant_name,
    shipping_address_line1,
    shipping_address_line2,
    shipping_city,
    shipping_state,
    shipping_pincode,
    phone,
    shipping_phone,
    print_logo_bitmap,
    print_logo_cols,
    print_logo_rows,
    features_menu_images_enabled
  `)
  .eq('restaurant_id', restaurantId)
  .limit(1)
  .maybeSingle();

setPrintProfile(profile || null);

// Populate tables for dropdown
if (profile?.tables_count) {
  setTables(Array.from({ length: profile.tables_count }, (_, i) => i + 1));
}

setProfileTax({
  gst_enabled: !!profile?.gst_enabled,
  default_tax_rate: Number(profile?.default_tax_rate ?? 0),
  prices_include_tax: !!profile?.prices_include_tax,
});


// NEW: set credit feature flag
setCreditFeatureEnabled(!!profile?.features_credit_enabled);

// Set tables from profile count
const tCount = profile?.tables_count || 0;
setTables(Array.from({ length: tCount }, (_, i) => i + 1));
setSendToKitchenEnabled(profile?.features_counter_send_to_kitchen_enabled !== false);
setEnableMenuImages(!!profile?.features_menu_images_enabled);

// after loading profile
      // after loading profile
      // Enforce default: Kitchen if enabled, otherwise Settle. Always partial to strict default.
      let modeToSet = profile?.features_counter_send_to_kitchen_enabled === false
        ? 'settle'
        : 'kitchen';

      setOrderMode(modeToSet);


// Only load credit customers if feature is enabled
if (profile?.features_credit_enabled) {
  await loadCreditCustomers();
} else {
  setCreditCustomers([]);
  setIsCreditSale(false);
  setSelectedCreditCustomerId('');
}


      } catch (e) {
        setError(e.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    })();
  }, [checking, loadingRestaurant, restaurantId, supabase]);

  // Persist orderMode choice
  useEffect(() => {
    if (orderMode) {
      localStorage.setItem('counter_orderMode', orderMode);
    }
  }, [orderMode]);

  // Fetch upsells on cart change
  useEffect(() => {
    if (cart.length === 0) {
      setCartUpsells([]);
      return;
    }

    const fetchUpsells = async () => {
      const itemIds = [...new Set(cart.map(i => i.id))];
      const { data } = await supabase
        .from('menu_items_with_upsells')
        .select('upsells')
        .in('menu_item_id', itemIds);

      // Aggregate
      const allUpsells = [];
      data?.forEach(row => {
          if (Array.isArray(row.upsells)) {
             allUpsells.push(...row.upsells);
          }
      });
      
      // Dedupe by ID and remove if already in cart
      const uniqueMap = new Map();
      allUpsells.forEach(u => uniqueMap.set(u.id, u));
      
      // Filter out items already in cart
      const final = [];
      uniqueMap.forEach(u => {
         if (!cart.some(c => c.id === u.id)) {
            final.push(u);
         }
      });
      
      setCartUpsells(final);
    };

    fetchUpsells();
  }, [cart, supabase]);

  const addToCartDirect = (item) => {
    // Check if exists (simple check, no variants)
    const exists = cart.find(c => c.id === item.id);
    if (exists) {
       updateCartItem(exists.cartId, exists.quantity + 1);
    } else {
       // Add new
       addItemToCart(item);
    }
  };

  useEffect(() => {
  if (!restaurantId) return;
  (async () => {
    const since = new Date(); since.setDate(since.getDate() - 30);
    const { data, error } = await supabase
      .from('orders')
      .select('items, status, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', since.toISOString())
      .neq('status', 'cancelled');
    if (error) return;

    const counts = new Map(); // id -> qty
    (data || []).forEach(o => {
      const lines = Array.isArray(o.items) ? o.items : [];
      lines.forEach(it => {
        let id = it?.id || it?.menu_item_id || null;
        if (!id) {
          const byName = (it?.name || '').trim().toLowerCase();
          id = nameIndexRef.current.get(byName) || null;
        }
        if (!id) return;
        counts.set(id, (counts.get(id) || 0) + Number(it.quantity || 1));
      });
    });

    // If nothing in 30 days, try a longer lookback (90 days) so Popular never looks empty
    if (counts.size === 0) {
      const since90 = new Date(); since90.setDate(since90.getDate() - 90);
      const { data: data90 } = await supabase
        .from('orders')
        .select('items, status, created_at')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', since90.toISOString())
        .neq('status', 'cancelled');
      (data90 || []).forEach(o => {
        const lines = Array.isArray(o.items) ? o.items : [];
        lines.forEach(it => {
          let id = it?.id || it?.menu_item_id || null;
          if (!id) {
            const byName = (it?.name || '').trim().toLowerCase();
            id = nameIndexRef.current.get(byName) || null;
          }
          if (!id) return;
          counts.set(id, (counts.get(id) || 0) + Number(it.quantity || 1));
        });
      });
    }

    setPopCounts(counts);
  })();
}, [restaurantId, supabase, menuItems]);




  // pages/owner/counter.js
const loadCreditCustomers = async () => {
  if (!restaurantId) return;   // ← keep only this guard

  const { data, error } = await supabase
    .from('v_credit_customer_ledger')
    .select('id, name, phone, status, current_balance_calc')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .order('name');

  if (!error) {
    setCreditCustomers(
      (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        status: r.status,
        current_balance: Number(r.current_balance_calc || 0),
      }))
    );
  }
};


  const handleSelectCreditCustomer = (customerId) => {
    const customer = creditCustomers.find((c) => c.id === customerId);
    if (customer) {
      setSelectedCreditCustomerId(customerId);
      setCreditCustomerBalance(customer.current_balance);
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone);
    }
  };

  const handleCreateNewCreditCustomer = async () => {
    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();

    if (trimmedName.length < 2 || trimmedPhone.length < 10) {
      setModalError('Please enter a valid name and 10-digit phone number');
      setTimeout(() => setModalError(''), 3000);
      return;
    }

    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      setModalError('Please enter a valid 10-digit phone number');
      setTimeout(() => setModalError(''), 3000);
      return;
    }

    try {
      setProcessing(true);
      setModalError('');
      
      // Check for existing customer with THIS phone number
      const { data: existing } = await supabase
        .from('credit_customers')
        .select('id, name, phone')
        .eq('restaurant_id', restaurantId)
        .eq('phone', trimmedPhone)
        .maybeSingle();

      if (existing) {
        if (existing.name.toLowerCase() === trimmedName.toLowerCase()) {
          setModalError(`A customer with this name and phone number already exists.`);
        } else {
          setModalError(`Phone number ${trimmedPhone} is already registered to "${existing.name}".`);
        }
        setProcessing(false);
        return;
      }

      const { data, error: err } = await supabase
        .from('credit_customers')
        .insert({
          restaurant_id: restaurantId,
          name: trimmedName,
          phone: trimmedPhone,
          current_balance: 0,
          total_credit_extended: 0,
          status: 'active',
        })
        .select()
        .single();

      if (err) {
        if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
          setModalError('This phone number is already registered');
        } else {
          setModalError(`Failed to create customer: ${err.message}`);
        }
        setProcessing(false);
        return;
      }

      setOrderSelect(''); 
      setCreditCustomers([...creditCustomers, data]);
      setSelectedCreditCustomerId(data.id);
      setCreditCustomerBalance(0);
      setShowNewCreditCustomer(false);
      setCustomerName(data.name);
      setCustomerPhone(data.phone);
      setModalError('');
      setSuccess(`Customer "${data.name}" created successfully`);
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      console.error('Error creating customer:', err);
      setModalError(`Error: ${err.message || 'Failed to create customer'}`);
    } finally {
      setProcessing(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();

    let base = menuItems.filter((item) => {
      if (filterMode === 'veg' && !item.veg) return false;

      const itemCategory = item.category || 'Others';
      if (categoryFilter !== 'all' && itemCategory !== categoryFilter) return false;

      const hit =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.code_number || '').toLowerCase().includes(q);
      return hit;
    });

    if (filterMode === 'popular') {
      base = [...base].sort((a, b) => {
        const sb = popCounts.get(b.id) || 0;
        const sa = popCounts.get(a.id) || 0;
        if (sb !== sa) return sb - sa;
        return a.name.localeCompare(b.name);
      });
    } else {
      base = [...base];
    }

    return base;
  }, [menuItems, filterMode, searchQuery, popCounts, categoryFilter]);

  const categoryChips = useMemo(() => {
    const set = new Set();
    (menuItems || []).forEach((item) => {
      const cat = item.category || 'Others';
      set.add(cat);
    });
    return Array.from(set);
  }, [menuItems]);


  const groupedItems = useMemo(
    () =>
      Object.entries(
        filteredItems.reduce((acc, item) => {
          const cat = item.category || 'Others';
          (acc[cat] || (acc[cat] = [])).push(item);
          return acc;
        }, {})
      ),
    [filteredItems]
  );

  const cartItemsCount = useMemo(
    () => cart.reduce((s, i) => s + i.quantity, 0),
    [cart]
  );

  const addToCart = (item) => {
    if (item.status && item.status !== 'available') {
      alert('Out of stock');
      return;
    }
    
    // Check if item has variants OR add-ons
  if ((item.has_variants && item.variants?.length > 0) || item.has_addons) {
    setSelectedItem(item);
    setShowVariantSelector(true);
    return;
  }
  
  // No variants - add directly
  addItemToCart(item);
};
  
  const addItemToCart = (itemWithVariant) => {
    // Create unique cart ID
    const cartId = itemWithVariant.selectedVariant 
      ? `${itemWithVariant.id}_${itemWithVariant.selectedVariant.variant_id}`
      : itemWithVariant.id;
    
    // Get quantity from variant selector or default to 1
    const qtyToAdd = itemWithVariant.quantity || 1;
    
    setCart((prev) => {
      const ex = prev.find((c) => c.cartId === cartId);
      return ex
        ? prev.map((c) => (c.cartId === cartId ? { ...c, quantity: c.quantity + qtyToAdd } : c))
        : [...prev, { 
            ...itemWithVariant, 
            cartId,
            quantity: qtyToAdd,
            variant_id: itemWithVariant.selectedVariant?.variant_id || null,
            variant_name: itemWithVariant.selectedVariant?.variant_name || null,
            price: itemWithVariant.selectedVariant?.price || itemWithVariant.price,
            displayName: itemWithVariant.displayName || itemWithVariant.name
          }];
    });
  };
  
  const handleVariantSelect = (itemWithVariant) => {
    addItemToCart(itemWithVariant);
    setShowVariantSelector(false);
    setSelectedItem(null);
  };


  // Create + finalize (settle now)
// inside pages/owner/counter.js

async function doCreateAndFinalizeOrder(finalPaymentMethod, mixedDetails, finalizeNow = false) {
  let order_type = 'counter';
  let table_number = null;
  if (orderSelect === 'parcel') order_type = 'parcel';
  else if (orderSelect && orderSelect.startsWith('table:')) {
    table_number = orderSelect.split(':')[1] || null;
  }

  const items = cart.map((i) => ({
    id: i.id,
    name: i.displayName || i.name, // consistent with kitchen order
    price: i.price,
    quantity: round2(i.quantity),
    hsn: i.hsn,
    tax_rate: i.tax_rate,
    is_packaged_good: i.is_packaged_good,
    code_number: i.code_number,
    variant_id: i.variant_id || null,
    variant_name: i.variant_name || null,
  }));

  const isCredit = isCreditSale;

  const orderData = {
    restaurant_id: restaurantId,
    order_type,
    table_number,
    customer_name: customerName.trim() || null,
    customer_phone: customerPhone.trim() || null,
    number_of_customers: numberOfCustomers ? Number(numberOfCustomers) : null,
    payment_method: isCredit ? 'credit' : finalPaymentMethod,
    payment_status: isCredit ? 'pending' : 'completed',
    status: finalizeNow ? 'completed' : 'new',
    items,
    is_credit: isCredit,
    credit_customer_id: isCredit ? selectedCreditCustomerId : null,
    original_payment_method: isCredit ? null : finalPaymentMethod,
    ...(finalPaymentMethod === 'mixed' && mixedDetails
      ? { mixed_payment_details: mixedDetails }
      : {}),
    custom_created_at: new Date(
      Number(orderDate.split('-')[0]),
      Number(orderDate.split('-')[1]) - 1,
      Number(orderDate.split('-')[2]),
      Number(orderTime.split(':')[0]),
      Number(orderTime.split(':')[1]),
      0
    ).toISOString(),
  };

  const res = await fetch('/api/orders/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData),
  });

  if (!res.ok) {
    let msg = 'Failed to create order';
    try {
      const j = await res.json();
      if (j?.error) msg += ': ' + j.error;
    } catch {}
    throw new Error(msg);
  }

  const result = await res.json();

  const fullOrder = result.order_for_print || null;

  const orderForPrint = fullOrder || {
    id: result.order_id,
    restaurant_id: restaurantId,
    order_type,
    table_number,
    items,
    created_at: new Date().toISOString(),
    restaurant_name: restaurant?.name || printProfile?.restaurant_name || null,
    _profile: printProfile || null,
    bill: {
      grand_total: cartTotals.totalInc,
      subtotal: cartTotals.subtotalEx,
      tax_total: cartTotals.totalTax,
      invoice_no: result.invoice_no || null,
      bill_no: result.bill_no || null,
    },
  };

  window.dispatchEvent(
    new CustomEvent('auto-print-order', {
      detail: {
        ...orderForPrint,
        autoPrint: true,
        kind: 'bill',
      },
    })
  );

  // clear UI, reload credit customers as you already do...

    setCart([]); setCustomerName(''); setCustomerPhone(''); setNumberOfCustomers(''); setPaymentMethod('cash');
    setOrderSelect(''); setIsCreditSale(false); setSelectedCreditCustomerId(''); setCreditCustomerBalance(0);
    setDrawerOpen(false); setShowPaymentDialog(false);
    await loadCreditCustomers();
    setSuccess('Sale completed');
    setTimeout(() => setSuccess(''), 2000);
  }

  // Create without finalize (send to kitchen)
  async function doCreateKitchenOrder() {
    let order_type = 'counter';
    let table_number = null;
    if (orderSelect === 'parcel') order_type = 'parcel';
    else if (orderSelect && orderSelect.startsWith('table:')) table_number = orderSelect.split(':')[1] || null;

    const items = cart.map((i) => ({
      id: i.id, name: i.displayName || i.name, price: i.price, quantity: round2(i.quantity),
      hsn: i.hsn, tax_rate: i.tax_rate, is_packaged_good: i.is_packaged_good, code_number: i.code_number,
      variant_id: i.variant_id || null, variant_name: i.variant_name || null
    }));

    const isCredit = isCreditSale;

    const orderData = {
      restaurant_id: restaurantId,
      order_type,
      table_number,
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim() || null,
      number_of_customers: numberOfCustomers ? Number(numberOfCustomers) : null,
      payment_method: isCredit ? 'credit' : 'none',
      payment_status: 'pending',
      items,
      is_credit: isCredit,
      credit_customer_id: isCredit ? selectedCreditCustomerId : null,
      credit_customer_id: isCredit ? selectedCreditCustomerId : null,
      original_payment_method: null,
      custom_created_at: new Date(
        Number(orderDate.split('-')[0]),
        Number(orderDate.split('-')[1]) - 1,
        Number(orderDate.split('-')[2]),
        Number(orderTime.split(':')[0]),
        Number(orderTime.split(':')[1]),
        0
      ).toISOString()
    };

    const res = await fetch('/api/orders/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData)
    });
    if (!res.ok) {
      let msg = 'Failed to create order';
      try { const j = await res.json(); if (j?.error) msg += ': ' + j.error; } catch {}
      throw new Error(msg);
    }

const result = await res.json();

const orderForPrint = {
  id: result.order_id,
  restaurant_id: restaurantId,
  order_type,
  table_number,
  items,
  created_at: new Date().toISOString(),
  restaurant_name: restaurant?.name || printProfile?.restaurant_name || null,
  _profile: printProfile || null,
};

// Immediate KOT print for this counter order
window.dispatchEvent(
  new CustomEvent('auto-print-order', {
    detail: { ...orderForPrint, autoPrint: true, kind: 'kot' },
  })
);

    setCart([]); setCustomerName(''); setCustomerPhone(''); setNumberOfCustomers(''); setPaymentMethod('cash');
    setOrderSelect(''); setIsCreditSale(false); setSelectedCreditCustomerId(''); setCreditCustomerBalance(0);
    setDrawerOpen(false);
    setSuccess('Order sent to kitchen');
    setTimeout(() => setSuccess(''), 2000);
  }

  const completeSale = async () => {
    if (!cart.length) { alert('Please add items to cart'); return; }
    if (isCreditSale && !selectedCreditCustomerId) { alert('Please select a credit customer'); return; }

    setProcessing(true);
    try {
      if (orderMode === 'kitchen') {
        await doCreateKitchenOrder();
      } else {
        if (isCreditSale) {
          await doCreateAndFinalizeOrder('credit', null, true);
        } else {
          setShowPaymentDialog(true);
        }
      }
    } catch (err) {
      setError('Error completing sale: ' + err.message);
      setTimeout(() => setError(''), 3000);
    } finally {
      setProcessing(false);
    }
  };

  if (checking || loadingRestaurant) return <div style={{ padding: 24 }}>Loading…</div>;
  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading data…</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'red' }}>{error}</div>;

  return (
    <div className="counter-shell" style={{
      '--brand': THEME.main,
      '--brand-rgb': THEME.rgb,
      '--brand-50': THEME.soft,
      '--brand-600': THEME.dark,
      '--surface': '#ffffff',
      '--border': '#e5e7eb',
      '--radius': '12px',
      '--shadow-1': '0 2px 8px rgba(0,0,0,0.06)',
      '--text': '#1f2937',
      '--muted': '#6b7280',
    }}>
      <PulseAnimation />
      <header style={{ padding: '0 12px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#0f172a' }}>Counter Sale</h1>
        </div>

        <ControlsCard theme={THEME}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
            {/* Mode & Type Selection */}
            <div>
              <SectionLabel>Order Configuration</SectionLabel>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                {sendToKitchenEnabled && (
                  <div style={{ 
                    display: 'flex', 
                    background: '#f1f5f9', 
                    padding: '4px', 
                    borderRadius: '12px',
                    width: 'fit-content'
                  }}>
                    <button
                      type="button"
                      onClick={() => setOrderMode('kitchen')}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        background: orderMode === 'kitchen' ? '#ffffff' : 'transparent',
                        color: orderMode === 'kitchen' ? '#0f172a' : '#64748b',
                        boxShadow: orderMode === 'kitchen' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.2s'
                      }}
                    >
                      Kitchen
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderMode('settle')}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        background: orderMode === 'settle' ? '#ffffff' : 'transparent',
                        color: orderMode === 'settle' ? '#0f172a' : '#64748b',
                        boxShadow: orderMode === 'settle' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.2s'
                      }}
                    >
                      Settle
                    </button>
                  </div>
                )}

                {creditFeatureEnabled && (
                  <button
                    onClick={() => {
                      const next = !isCreditSale;
                      setIsCreditSale(next);
                      if (!next) {
                        setSelectedCreditCustomerId('');
                        setCustomerName('');
                        setCustomerPhone('');
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: '1px solid',
                      borderColor: THEME.main,
                      background: isCreditSale ? THEME.main : '#ffffff',
                      color: isCreditSale ? '#ffffff' : THEME.main,
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: isCreditSale ? `0 4px 12px ${THEME.main}40` : 'none'
                    }}
                  >
                    Credit Sale
                  </button>
                )}
              </div>
            </div>

            {/* Table/Type Selection */}
            <div>
              <SectionLabel>Table / Order Type</SectionLabel>
              <div style={{ maxWidth: '240px' }}>
                <NiceSelect
                  value={orderSelect}
                  onChange={setOrderSelect}
                  placeholder="Select Type..."
                  options={[
                    { value: 'parcel', label: 'Parcel / Takeaway' },
                    ...tables.map(n => ({ value: `table:${n}`, label: `Table ${n}` }))
                  ]}
                />
              </div>
            </div>
            
             {/* Backdate Configuration (New) */}
             <div>
                <SectionLabel>Date & Time</SectionLabel>
                <DateTimeContainer>
                   <DateInputWrapper>
                   <input
                     type="date"
                     max={new Date().toLocaleDateString('en-CA')}
                     value={orderDate}
                     onChange={(e) => setOrderDate(e.target.value)}
                     style={{
                       width: '100%', // Ensure input takes full width of wrapper
                       padding: '9.5px 12px',
                       borderRadius: '8px',
                       border: `1.5px solid ${orderMode === 'kitchen' ? '#f97316' : '#22c55e'}`,
                       fontSize: '14px',
                       fontWeight: 600,
                       color: '#1e293b',
                       outline: 'none',
                       background: '#ffffff',
                       fontFamily: 'inherit',
                       transition: 'all 0.2s',
                       boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                       boxSizing: 'border-box', // Prevent padding overflow
                       maxWidth: '100%',
                       margin: 0
                     }}
                   />
                   </DateInputWrapper>
                   <TimeInputWrapper>
                     <PremiumTimeSelect
                       value={orderTime}
                       onChange={(e) => setOrderTime(e.target.value)}
                       themeColor={orderMode === 'kitchen' ? '#f97316' : '#22c55e'}
                       overrideStyle={{
                         border: `1.5px solid ${orderMode === 'kitchen' ? '#f97316' : '#22c55e'}`,
                         borderRadius: '8px',
                         boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                         padding: '9.5px 12px',
                         height: '42.5px', 
                         width: '100%',
                         boxSizing: 'border-box', // Prevent padding overflow
                         maxWidth: '100%',
                         margin: 0
                       }}
                     />
                   </TimeInputWrapper>
                </DateTimeContainer>
            </div>
            

          </div>

          {/* Customer Details */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
            {isCreditSale ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                <div style={{ width: '280px' }}>
                  <SectionLabel>Credit Customer</SectionLabel>
                  <NiceSelect
                    value={selectedCreditCustomerId}
                    onChange={handleSelectCreditCustomer}
                    placeholder="Choose Customer..."
                    options={creditCustomers.map(c => ({
                      value: c.id,
                      label: `${c.name} (${c.phone}) - ₹${c.current_balance.toFixed(2)}`
                    }))}
                  />
                </div>
                <button 
                  onClick={() => setShowNewCreditCustomer(true)} 
                  style={{ 
                    height: '42px',
                    padding: '0 20px', 
                    background: '#f8fafc', 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '10px',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: '#475569',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#f1f5f9'}
                  onMouseLeave={(e) => e.target.style.background = '#f8fafc'}
                >
                  + New
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <SectionLabel>Customer Name (Optional)</SectionLabel>
                  <input 
                    type="text" placeholder="e.g. John Doe" 
                    value={customerName} onChange={(e) => setCustomerName(e.target.value)} 
                    style={{ 
                      width: '100%',
                      padding: '12px 16px', background: '#ffffff', 
                      border: '1px solid #e2e8f0', borderRadius: '10px', outline: 'none',
                      fontSize: '14px'
                    }} 
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <SectionLabel>Phone Number (Optional)</SectionLabel>
                  <input 
                    type="tel" placeholder="e.g. 9876543210" 
                    value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} 
                    style={{ 
                      width: '100%',
                      padding: '12px 16px', background: '#ffffff', 
                      border: '1px solid #e2e8f0', borderRadius: '10px', outline: 'none',
                      fontSize: '14px'
                    }} 
                  />
                </div>
              </div>
            )}
          </div>
        </ControlsCard>

        <NewCreditCustomerModal 
          visible={showNewCreditCustomer}
          onClose={() => { setShowNewCreditCustomer(false); setCustomerName(''); setCustomerPhone(''); setModalError(''); }}
          onSave={handleCreateNewCreditCustomer}
          name={customerName}
          setName={setCustomerName}
          phone={customerPhone}
          setPhone={setCustomerPhone}
          processing={processing}
          theme={THEME}
          error={modalError}
        />

        {/* Search & Category Tabs */}
        <div style={{ 
          background: '#ffffff', 
          borderRadius: '16px', 
          padding: '12px', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          border: '1px solid #f1f5f9',
          marginTop: '20px'
        }}>
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <input 
              type="text" 
              placeholder="Search menu items, drinks, or item codes..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ 
                width: '100%',
                padding: '16px 20px', 
                background: 'linear-gradient(135deg, #ffffff 0%, #fefefe 100%)', 
                border: `3px solid ${THEME.main}`, 
                borderRadius: '16px', 
                outline: 'none',
                fontSize: '16px',
                fontWeight: 600,
                color: '#1e293b',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: `0 8px 20px ${THEME.main}30, 0 0 0 0 ${THEME.main}00`,
                animation: 'pulse-border 2s ease-in-out infinite'
              }} 
              onFocus={(e) => {
                e.target.style.background = '#ffffff';
                e.target.style.borderColor = THEME.dark;
                e.target.style.boxShadow = `0 0 0 6px ${THEME.main}20, 0 12px 24px ${THEME.main}40`;
                e.target.style.transform = 'translateY(-2px)';
              }}
              onBlur={(e) => {
                e.target.style.background = 'linear-gradient(135deg, #ffffff 0%, #fefefe 100%)';
                e.target.style.borderColor = THEME.main;
                e.target.style.boxShadow = `0 8px 20px ${THEME.main}30`;
                e.target.style.transform = 'translateY(0)';
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: THEME.main,
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = THEME.dark;
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = THEME.main;
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }}
              >
                ✕
              </button>
            )}
          </div>


          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'veg', label: 'Veg Only' },
              { id: 'popular', label: 'Trending' },
            ].map((m) => {
              const active = filterMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setFilterMode(m.id)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '12px',
                    border: 'none',
                    background: active ? THEME.main : '#f1f5f9',
                    color: active ? '#ffffff' : '#475569',
                    fontWeight: 700,
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: active ? `0 4px 12px ${THEME.main}30` : 'none'
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {categoryChips.length > 1 && (
        <div
          className="sales-carousel"
          style={{
            padding: '12px 12px 20px',
            background: 'transparent',
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            scrollbarWidth: 'none'
          }}
        >
          {['all', ...categoryChips].map((cat) => {
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  background: active ? THEME.main : '#ffffff',
                  color: active ? '#ffffff' : '#64748b',
                  border: `1px solid ${active ? THEME.main : '#e2e8f0'}`,
                  fontWeight: 600,
                  fontSize: '13px',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: active ? `0 2px 8px ${THEME.main}20` : 'none',
                  textTransform: 'capitalize'
                }}
              >
                {cat === 'all' ? 'Everything' : cat}
              </button>
            );
          })}
        </div>
      )}

      <main className="counter-main-mobile-like">
        <section className="counter-menu-items">
          {enableMenuImages ? (
            // NEW LAYOUT: HorizontalScrollRow with MenuItemCard (when images enabled)
            groupedItems.map(([cat, items]) => (
              <HorizontalScrollRow
                key={cat}
                title={cat}
                count={items.length}
                items={items}
renderItem={(item) => {
  const qty = cart.find((c) => c.id === item.id)?.quantity || 0;
  
  // Calculate total quantity for this item (including all variants) to determine active state
  const totalItemQty = cart
    .filter(c => c.id === item.id)
    .reduce((sum, c) => sum + (c.quantity || 0), 0);

  const handleQuantityChange = (it, q) => {
    // Only safe for non-variant items because cartId differs for variants
    const cartId = it.id;
    if (q <= 0) return updateCartItem(cartId, 0);

    const exists = cart.some((c) => c.cartId === cartId);
    if (exists) updateCartItem(cartId, q);
    else addItemToCart({ ...it, quantity: q });
  };

const isVariantItem = !!item.hasvariants && (item.variants?.length || 0) > 0;


  return (
    <div style={{ minWidth: '200px', maxWidth: '200px' }}>
      <MenuItemCard
  item={item}
  quantity={isVariantItem ? 0 : qty}
  isActive={totalItemQty > 0}
  onAdd={() => addToCart(item)}
  onRemove={() => {
          const current = cart.find((c) => c.id === item.id)?.quantity || 0;
          updateCartItem(item.id, current - 1);
        }}
  onQuantityChange={isVariantItem ? undefined : handleQuantityChange}
  showImage={enableMenuImages}
  highlightColor={enableMenuImages ? undefined : THEME.main}
/>
    </div>
  );
}}


              />
            ))
          ) : (
            // OLD LAYOUT: Simple grid (when images disabled)
            groupedItems.map(([cat, items]) => (
              <div key={cat} className="counter-category">
                <h2 className="counter-category-title">{cat} ({items.length})</h2>
                <div className="counter-category-grid">
                  {items.map((item) => {
                    const qty = cart.find((c) => c.id === item.id)?.quantity || 0;
                    const avail = !item.status || item.status === 'available';
                    return (
                      <div key={item.id} style={{
                          background: 'var(--surface)',
                          border: `2px solid ${qty > 0 ? THEME.main : 'var(--border)'}`,
                          borderTop: `4px solid ${THEME.main}`,
                          borderRadius: 'var(--radius)',
                          boxShadow: qty > 0 ? `0 4px 12px ${THEME.main}15` : 'var(--shadow-1)',
                          display: 'flex', flexDirection: 'column',
                          justifyContent: 'space-between',
                          padding: '12px',
                          minHeight: '120px',
                          position: 'relative',
                          opacity: !avail ? 0.7 : 1,
                          overflow: 'visible',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between'
                      }}>
                         {!avail && (
                            <div style={{position:'absolute', inset:0, background:'rgba(255,255,255,0.5)', zIndex:10}} />
                         )}
                        
                        <div style={{display:'flex', gap:8, alignItems:'center'}}>
                           <div style={{flex:1}}>
                             <h3 style={{fontSize:14, fontWeight:600, margin:0, color:'var(--text)', lineHeight:1.3}}>
                                {item.name}
                                {item.code_number && <small style={{color:'var(--muted)', fontWeight:400, marginLeft:4}}>[{item.code_number}]</small>}
                             </h3>
                           </div>
                        </div>

                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12, flexWrap: 'wrap', gap: 8}}>
                           <div style={{fontSize:15, fontWeight:700, color: THEME.main}}>₹{item.price.toFixed(2)}</div>
                           
                           <div style={{position:'relative', zIndex:20}}> {/* zIndex ensures clickability over disabled overlay if needed */}
                           {qty > 0 ? (
                             <div style={{
                               display:'inline-flex', alignItems:'center', 
                               background: THEME.soft, 
                               borderRadius: 8, 
                               border: `1px solid ${THEME.main}`,
                               boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                               minWidth: 'fit-content'
                             }}>
                               <button
                                 onClick={() => updateCartItem(item.id, qty - 1)}
                                 style={{
                                    width: 32, height: 32, 
                                    border: 'none', background: 'transparent', 
                                    color: THEME.main, fontSize: 18, fontWeight: 700,
                                    cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                                    flexShrink: 0
                                 }}
                               >-</button>
                               
                               <input
                                  value={qtyDrafts[item.id] ?? formatQty2(qty)}
                                  inputMode="decimal"
                                  type="text"
                                  onChange={(e) => setDraft(item.id, e.target.value)}
                                  onBlur={(e) => commitQtyDraft(item.id, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.currentTarget.blur();
                                    if (e.key === 'Escape') clearDraft(item.id);
                                  }}
                                  style={{
                                    width: 40, height: 32,
                                    border: 'none', background: 'transparent',
                                    textAlign: 'center', fontSize: 14, fontWeight: 700,
                                    color: THEME.dark, outline: 'none',
                                    flexShrink: 0
                                  }}
                                />

                               <button
                                 onClick={() => addToCart(item)}
                                 disabled={!avail}
                                 style={{
                                    width: 32, height: 32, 
                                    border: 'none', background: 'transparent', 
                                    color: THEME.main, fontSize: 18, fontWeight: 700,
                                    cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                                    flexShrink: 0
                                 }}
                               >+</button>
                             </div>
                           ) : (
                             <button
                               onClick={() => addToCart(item)}
                               disabled={!avail}
                               style={{
                                 padding: '6px 16px',
                                 background: '#fff',
                                 color: !avail ? '#9ca3af' : THEME.main,
                                 border: `1px solid ${!avail ? '#e5e7eb' : THEME.main}`,
                                 borderRadius: 8,
                                 fontWeight: 700,
                                 fontSize: 13,
                                 cursor: !avail ? 'not-allowed' : 'pointer',
                                 boxShadow: !avail ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
                               }}
                             >
                               {!avail ? 'Out' : 'ADD'}
                             </button>
                           )}
                           </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      </main>

      {cartItemsCount > 0 && (
  <button
    onClick={() => setDrawerOpen(true)}
    className="counter-mobile-cart-btn"
    style={{ 
      background: `linear-gradient(135deg, ${THEME.main} 0%, ${THEME.dark} 100%)`,
      boxShadow: `0 10px 25px -5px ${THEME.main}66`
    }}
  >
    <span>View Cart</span>
    <span style={{ opacity: 0.6 }}>|</span>
    <span>{cartItemsCount} Items</span>
    <span style={{ opacity: 0.6 }}>|</span>
    <span>₹{cartTotals.totalInc.toFixed(2)}</span>
  </button>
)}


      {drawerOpen && (
        <div className="counter-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="counter-drawer" onClick={(e) => e.stopPropagation()}>
            {/* Enhanced Header */}
            <div className="counter-drawer-head" style={{
              padding: '20px 24px 16px',
              borderBottom: '2px solid #f3f4f6',
              background: 'linear-gradient(to bottom, #ffffff, #fafafa)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* Left Side - Close Button */}
                <button 
                  onClick={() => setDrawerOpen(false)} 
                  style={{
                    background: 'none',
                    border: '2px solid #e5e7eb',
                    fontSize: 24,
                    color: '#6b7280',
                    cursor: 'pointer',
                    padding: 0,
                    width: 40,
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    transition: 'all 0.2s',
                    fontWeight: 300,
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#f3f4f6';
                    e.target.style.borderColor = '#d1d5db';
                    e.target.style.color = '#111827';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'none';
                    e.target.style.borderColor = '#e5e7eb';
                    e.target.style.color = '#6b7280';
                  }}
                >
                  ×
                </button>
                
                {/* Right Side - Clear Cart Button (only shows when cart has items) */}
                {cart.length > 0 ? (
                  <button
                    onClick={() => setShowClearCartConfirm(true)}
                    style={{
                      marginLeft: 'auto',
                      background: 'white',
                      border: '1.5px solid #fecaca',
                      color: '#dc2626',
                      padding: '7px 14px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = '#fee2e2';
                      e.target.style.borderColor = '#fca5a5';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'white';
                      e.target.style.borderColor = '#fecaca';
                    }}
                  >
                    <span style={{ fontSize: 15 }}>🗑️</span>
                    <span>Clear Cart</span>
                  </button>
                ) : (
                  <div style={{ marginLeft: 'auto' }}></div>
                )}
              </div>
              
              {/* Credit Balance Below Header if needed */}
              {isCreditSale && selectedCreditCustomerId && (
                <div style={{ 
                  marginTop: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#fffbeb',
                  color: '#f59e0b', 
                  fontWeight: 600,
                  fontSize: 13,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #fef3c7',
                  width: 'fit-content',
                }}>
                  Credit Balance: ₹{(creditCustomerBalance + cartTotals.totalInc).toFixed(2)}
                </div>
              )}
            </div>

            
            {/* Cart Body */}
            <div className="counter-drawer-body" style={{ 
              padding: cart.length === 0 ? '60px 20px' : '16px',
              flex: 1,
              overflowY: 'auto',
            }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
                    Your cart is empty
                  </div>
                  <div style={{ fontSize: 14, color: '#9ca3af' }}>
                    Add items from the menu to get started
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {cart.map((i) => (
                    <div 
                      key={i.cartId || i.id} 
                      style={{
                        padding: '12px 14px',
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                      }}
                    >
                      {/* Flex container for Image + Details */}
                      <div style={{ display: 'flex', gap: 12 }}>
                        {i.image_url && (
                          <div style={{ flexShrink: 0 }}>
                            <img 
                              src={i.image_url} 
                              alt={i.name} 
                              style={{ 
                                width: 48, 
                                height: 48, 
                                borderRadius: 8, 
                                objectFit: 'cover',
                                border: '1px solid #f3f4f6'
                              }} 
                            />
                          </div>
                        )}
                        
                        <div style={{ flex: 1 }}>
                          {/* Top Row: Name and Quantity Controls */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div style={{ flex: 1, paddingRight: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
                                  {i.name}
                                </div>
                                {/* Variant badge inline */}
                                {i.variant_name && (
                                  <span style={{ 
                                    fontSize: 11, 
                                    fontWeight: 600, 
                                    color: THEME.main,
                                    background: THEME.soft,
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                  }}>
                                    {i.variant_name}
                                  </span>
                                )}
                              </div>
                            </div>
                        
                        {/* Quantity Controls - Compact */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0,
                          border: `1.5px solid ${THEME.main}`,
                          borderRadius: 6,
                          overflow: 'hidden',
                          flexShrink: 0,
                        }}>
                          <button
onClick={() => {
  const id = i.cartId || i.id;
  const base = getDraftOrQtyNumber(id, i.quantity);
  updateCartItem(id, base - 1);
}}
                            style={{
                              background: 'white',
                              color: THEME.main,
                              border: 'none',
                              width: 28,
                              height: 28,
                              cursor: 'pointer',
                              fontWeight: 700,
                              fontSize: 16,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'background 0.2s',
                            }}
                            onMouseEnter={(e) => e.target.style.background = THEME.soft}
                            onMouseLeave={(e) => e.target.style.background = 'white'}
                          >
                            −
                          </button>
                          <span style={{ 
                            minWidth: 32, 
                            textAlign: 'center', 
                            fontSize: 14, 
                            fontWeight: 700,
                            color: '#111827',
                            background: '#fafafa',
                            borderLeft: `1px solid ${THEME.light || '#e5e7eb'}`,
                            borderRight: `1px solid ${THEME.light || '#e5e7eb'}`,
                            padding: '0 6px',
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            {i.quantity}
                          </span>
                          <button
onClick={() => {
  const id = i.cartId || i.id;
  const base = getDraftOrQtyNumber(id, i.quantity);
  updateCartItem(id, base + 1);
}}
                            style={{
                              background: 'white',
                              color: THEME.main,
                              border: 'none',
                              width: 28,
                              height: 28,
                              cursor: 'pointer',
                              fontWeight: 700,
                              fontSize: 16,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'background 0.2s',
                            }}
                            onMouseEnter={(e) => e.target.style.background = THEME.soft}
                            onMouseLeave={(e) => e.target.style.background = 'white'}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      
                      {/* Bottom Row: Pricing */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, color: '#6b7280' }}>
                            ₹{i.price} × {i.quantity}
                          </span>
                          {profileTax.gst_enabled && !profileTax.prices_include_tax && !i.is_packaged_good && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: THEME.main,
                              background: THEME.soft,
                              padding: '2px 6px',
                              borderRadius: 4,
                              border: `1px solid ${THEME.main}30`,
                            }}>
                              +GST
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                            ₹{(i.price * i.quantity).toFixed(2)}
                          </span>
                          {profileTax.gst_enabled && !profileTax.prices_include_tax && !i.is_packaged_good && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: THEME.main,
                              background: THEME.soft,
                              padding: '2px 6px',
                              borderRadius: 4,
                              border: `1px solid ${THEME.main}30`,
                            }}>
                              +GST
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                  ))}
                </div>
              )}

              {/* Complete Your Meal Upsells */}
              {cartUpsells.length > 0 && (
                <div style={{ padding: '12px 20px', background: '#fafafa', borderTop: '1px solid #e5e7eb' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Suggested Add-ons
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {cartUpsells.map(u => (
                      <div 
                        key={u.id} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: '#fff',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = THEME.main;
                          e.currentTarget.style.boxShadow = `0 2px 8px ${THEME.main}20`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px' }}>
                            {u.veg ? '🟢' : '🔺'}
                          </span>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                              {u.name}
                            </div>
                            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                              ₹{Number(u.price).toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => addToCartDirect(u)}
                          style={{
                            padding: '6px 16px',
                            background: THEME.main,
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: `0 2px 4px ${THEME.main}30`
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = THEME.dark;
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = THEME.main;
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          ADD
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer with Totals */}
            {cart.length > 0 && (
              <div className="counter-drawer-foot" style={{
                padding: '20px',
                borderTop: '2px solid #f3f4f6',
                background: '#fafafa',
              }}>
                {/* No. of Customers Input in Cart Footer */}
                <div style={{ marginBottom: 12 }}>
                   <input
                    type="number"
                    min="1"
                    placeholder="No. of Customers (Optional)"
                    value={numberOfCustomers}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') setNumberOfCustomers('');
                      else {
                        const num = parseInt(val, 10);
                        if (num > 0) setNumberOfCustomers(num);
                      }
                    }}
                    className="input"
                    style={{ background: '#fff', border: '1px solid #d1d5db' }}
                  />
                </div>

                <div style={{ 
                  background: '#ffffff',
                  padding: '16px',
                  borderRadius: 12,
                  border: `1px solid #f1f5f9`,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  marginBottom: 16,
                }}>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#64748b' }}>
                      <span>Subtotal (ex-tax)</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>₹{cartTotals.subtotalEx.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#64748b' }}>
                      <span>GST Amount</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>₹{cartTotals.totalTax.toFixed(2)}</span>
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      paddingTop: 12,
                      marginTop: 2,
                      borderTop: '1px dashed #e2e8f0',
                      fontSize: '20px',
                      fontWeight: 800,
                      color: '#0f172a',
                    }}>
                      <span>Total</span>
                      <span style={{ color: THEME.main }}>₹{cartTotals.totalInc.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={completeSale}
                  disabled={processing}
                  style={{
                    width: '100%',
                    padding: '18px',
                    background: processing ? '#cbd5e1' : `linear-gradient(135deg, ${THEME.main} 0%, ${THEME.dark} 100%)`,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '14px',
                    fontSize: '16px',
                    fontWeight: 800,
                    cursor: processing ? 'not-allowed' : 'pointer',
                    boxShadow: processing ? 'none' : `0 8px 20px -6px ${THEME.main}60`,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}
                  onMouseEnter={(e) => {
                    if (!processing) {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = `0 12px 24px -8px ${THEME.main}80`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!processing) {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = `0 8px 20px -6px ${THEME.main}60`;
                    }
                  }}
                >
                  {processing ? (
                    'Processing Transaction...'
                  ) : (
                    <span>
                      {orderMode === 'kitchen'
                        ? `Send to Kitchen • ₹${cartTotals.totalInc.toFixed(2)}`
                        : isCreditSale
                        ? `Credit & Settle • ₹${cartTotals.totalInc.toFixed(2)}`
                        : `Complete Sale • ₹${cartTotals.totalInc.toFixed(2)}`}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment dialog (non-credit, settle now) */}
      {showPaymentDialog && orderMode === 'settle' && !isCreditSale && (
  <PaymentConfirmDialog
    amount={cartTotals.totalInc}
    busy={processing}
    mode={orderMode}
    onConfirm={async (method, details) => {
      if (processing) return; // extra guard
      setProcessing(true);
      try {
        // finalizeNow = true → insert with status: 'completed'
        await doCreateAndFinalizeOrder(method, details, true);
      } catch (e) {
        setError('Error completing sale: ' + e.message);
        setTimeout(() => setError(''), 3000);
      } finally {
        setProcessing(false);
      }
    }}
    onCancel={() => setShowPaymentDialog(false)}
  />
)}

{/* Variant Selector Modal */}
{showVariantSelector && selectedItem && (
  <VariantSelector
    item={selectedItem}
    onSelect={handleVariantSelect}
    onClose={() => {
      setShowVariantSelector(false);
      setSelectedItem(null);
    }}
    gstEnabled={profileTax.gst_enabled}
    pricesIncludeTax={profileTax.prices_include_tax}
    onCartOpen={() => setDrawerOpen(true)}
    showImage={enableMenuImages}
  />
)}{/* Clear Cart Confirmation Modal */}
{showClearCartConfirm && (
  <div 
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    }}
    onClick={() => setShowClearCartConfirm(false)}
  >
    <div 
      style={{
        background: 'white',
        borderRadius: 16,
        padding: '32px',
        maxWidth: 400,
        width: '90%',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
        <h3 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 700, color: '#111827' }}>
          Clear Cart?
        </h3>
        <p style={{ margin: 0, fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>
          Are you sure you want to remove all items from the cart? This action cannot be undone.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => setShowClearCartConfirm(false)}
          style={{
            flex: 1,
            padding: '12px',
            background: 'white',
            border: '2px solid #e5e7eb',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            color: '#374151',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#f9fafb';
            e.target.style.borderColor = '#d1d5db';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'white';
            e.target.style.borderColor = '#e5e7eb';
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => {
            setCart([]);
            setShowClearCartConfirm(false);
            setDrawerOpen(false); // Close cart drawer
          }}
          style={{
            flex: 1,
            padding: '12px',
            background: '#dc2626',
            border: 'none',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            color: 'white',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(220,38,38,0.3)',
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#b91c1c';
            e.target.style.transform = 'translateY(-1px)';
            e.target.style.boxShadow = '0 6px 16px rgba(220,38,38,0.4)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = '#dc2626';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 4px 12px rgba(220,38,38,0.3)';
          }}
        >
          Clear Cart
        </button>
      </div>
    </div>
  </div>
)}

          <style jsx>{`
            .counter-shell { min-height: 100vh; background: #f9fafb; padding-bottom: 80px; }
            .counter-header { background: white; border-bottom: 1px solid #e5e7eb; }
            .counter-header-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; }
            .counter-title { margin: 0; font-size: 1.25rem; font-weight: 700; color: #111827; }
            .counter-cart-info { font-size: 0.875rem; font-weight: 600; color: #4b5563; background: #f3f4f6; padding: 4px 12px; borderRadius: 999px; }
            
            .counter-main-mobile-like { padding: 16px; max-width: 1280px; margin: 0 auto; }
            
            .counter-menu-items { display: flex; flex-direction: column; gap: 24px; }
            
            .counter-category-title { font-size: 1.125rem; font-weight: 700; color: #374151; margin: 0 0 12px 0; }
            
            .counter-category-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
            @media (min-width: 640px) { .counter-category-grid { grid-template-columns: repeat(3, 1fr); } }
            @media (min-width: 1024px) { .counter-category-grid { grid-template-columns: repeat(4, 1fr); } }
            @media (min-width: 1280px) { .counter-category-grid { grid-template-columns: repeat(5, 1fr); } }
            
            .counter-item-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; height: 100%; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            .counter-item-card:active { transform: scale(0.98); }
            .item-out { opacity: 0.6; pointer-events: none; filter: grayscale(1); }
            
            .counter-item-info { display: flex; gap: 8px; }
            .counter-item-info h3 { margin: 0; font-size: 0.95rem; font-weight: 600; color: #111827; line-height: 1.3; }
            .counter-item-info div { font-weight: 700; color: #374151; font-size: 0.9rem; margin-top: 2px; }
            
            .counter-item-actions { margin-top: auto; }
            .counter-cart-qty { display: flex; align-items: center; justify-content: space-between; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; height: 36px; }
            .counter-cart-qty button { width: 36px; height: 100%; border: none; font-size: 1.25rem; display: flex; align-items: center; justify-content: center; cursor: pointer; }
            .counter-cart-qty div { font-weight: 600; color: #111827; font-size: 0.95rem; }
            
            .counter-mobile-cart-btn { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); width: auto; min-width: 220px; padding: 14px 28px; border-radius: 999px; color: white; border: none; font-weight: 700; font-size: 15px; z-index: 100; display: flex; justify-content: center; align-items: center; gap: 10px; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; transition: transform 0.2s; }
            .counter-mobile-cart-btn:hover { transform: translateX(-50%) translateY(-2px); }
            .counter-mobile-cart-btn:active { transform: translateX(-50%) scale(0.98); }
            @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            
            .counter-drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; justify-content: flex-end; backdrop-filter: blur(2px); animation: fadeIn 0.2s ease-out; }
            .counter-drawer { width: 100%; max-width: 450px; background: #f9fafb; height: 100%; display: flex; flex-direction: column; box-shadow: -4px 0 24px rgba(0,0,0,0.15); animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
            @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            
            .sales-carousel-btn { white-space: nowrap; padding: 8px 16px; border-radius: 999px; font-size: 0.875rem; font-weight: 600; border: 1px solid; cursor: pointer; transition: all 0.2s; }
            .sales-carousel-btn.active { box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
            
            /* Responsive Utilities */
            @media (max-width: 640px) {
              .counter-title { font-size: 1.125rem; }
              .counter-cart-info { font-size: 0.75rem; }
              .counter-main-mobile-like { padding: 12px; }
              .counter-category-title { font-size: 1rem; margin-bottom: 8px; }
            }
          `}</style>
        </div>
  );
}

const DateTimeContainer = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;

  @media (min-width: 640px) {
    flex-direction: row;
    gap: 12px;
  }
`;

const DateInputWrapper = styled.div`
  width: 100%;
  min-width: 0; /* Fix flex overflow */
  @media (min-width: 640px) {
    flex: 2;
    width: auto;
  }
`;

const TimeInputWrapper = styled.div`
  width: 100%;
  min-width: 0; /* Fix flex overflow */
  @media (min-width: 640px) {
    flex: 1.2;
    width: auto;
  }
`;
