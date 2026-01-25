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
import DiscountModal from '../../components/DiscountModal';
import NiceSelect from '../../components/NiceSelect';
import { useAlert } from '../../context/AlertContext';
import HorizontalScrollRow from '../../components/HorizontalScrollRow';
import PremiumTimeSelect from '../../components/PremiumTimeSelect';
import { round2, roundP, normalizeQty, formatQty2, formatQtyP } from '../../lib/qty';
import { markPrinted } from '../../lib/usePrintService';
import { calculateOrderTotals } from '../../utils/orderCalculations';

/**
 * PaymentConfirmDialog
 *
 * Handles three flows:
 * 1. Kitchen order        → no payment, no round-off
 * 2. Normal settle        → cash / online / mixed + round-off
 * 3. Credit + settle      → ROUND-OFF ONLY (no payment methods)
 *
 * IMPORTANT:
 * - Existing UI, validation, and styling are untouched.
 * - Only additive guards are introduced for `roundoff-only` mode.
 */
function PaymentConfirmDialog({ 
  amount, 
  onConfirm, 
  onCancel, 
  busy = false, 
  mode = 'settle', 
  roundOffConfig,
  // Loyalty props
  loyaltyEnabled = false,
  customerPoints = 0,
  conversionRate = 1.0,
  restaurantId = null,
  customerId = null,
  onLoyaltyRedeem = null,
  minPoints = 0,
  maxRedemption = 0
}) {
  const isRoundOffOnly = mode === 'roundoff-only';
  const isRoundOffEnabled = !!roundOffConfig?.round_off_enabled;
  const isAuto = roundOffConfig?.round_off_mode === 'automatic';
  const isManual = roundOffConfig?.round_off_mode === 'manual';
  
  // Calculate Initial Settled Amount
  // - Automatic mode: Round to nearest factor
  // - Manual mode: Use exact amount (user can edit later)
  // - Disabled: Use exact amount
  const factor = Number(roundOffConfig?.round_off_auto_factor || 1.0);
  const initialSettled = (isRoundOffEnabled && isAuto) 
    ? Math.round(amount / factor) * factor 
    : amount;
  
  const [settledAmount, setSettledAmount] = useState(initialSettled);
  const [displayValue, setDisplayValue] = useState((initialSettled || 0).toFixed(2));
  
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

  // Loyalty redemption state
  const [loyaltyRedeemAmount, setLoyaltyRedeemAmount] = useState(0);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [showLoyaltyModal, setShowLoyaltyModal] = useState(false);
  
  // Calculate effective amount (Full total since loyalty is now a payment method)
  const effectiveAmount = total;
  const shouldShowLoyalty = loyaltyEnabled && customerPoints > 0 && customerId && !isRoundOffOnly;

  // Calculate round-off based on full total
  const manualRoundOff = (settledAmount || 0) - effectiveAmount;
  const settledTotal = settledAmount || 0;

  // Recalculate settled amount when base amount changes
  useEffect(() => {
    const baseAmount = effectiveAmount;
    const newSettled = (isRoundOffEnabled && isAuto) 
      ? Math.round(baseAmount / factor) * factor 
      : baseAmount;
    setSettledAmount(newSettled);
    setDisplayValue(newSettled.toFixed(2));
  }, [effectiveAmount, isRoundOffEnabled, isAuto, factor]);

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
    if (method !== 'mixed') { 
      setCashAmount(''); 
      setOnlineAmount(''); 
      setPointsToRedeem(0);
      setLoyaltyRedeemAmount(0);
    }
  };

  const calculateRemainingOnline = (cash, loyalty) => {
    const c = Number(cash || 0);
    const l = Number(loyalty || 0);
    const rem = Math.max(0, settledTotal - c - l);
    setOnlineAmount(rem.toFixed(2));
  };

  const validateMixed = () => {
    const cash = Number(cashAmount || 0);
    const online = Number(onlineAmount || 0);
    const loyalty = Number(loyaltyRedeemAmount || 0);
    
    if (cash < 0 || online < 0 || loyalty < 0) {
      alert('Amounts cannot be negative');
      return false;
    }
    
    if (cash === 0 && online === 0 && loyalty === 0) {
      alert('Enter at least one payment amount');
      return false;
    }

    const totalPaid = cash + online + loyalty;
    if (Math.abs(totalPaid - settledTotal) > 0.01) {
      alert(`Split must equal ₹${(settledTotal || 0).toFixed(2)}. Current total: ₹${totalPaid.toFixed(2)}`);
      return false;
    }
    return true;
  };

  const handleConfirm = async () => {
    if (disabled) return;
    
    // Validation for single methods (except mixed which has its own validateMixed)
    if (paymentMethod === 'loyalty') {
      if (Math.abs((loyaltyRedeemAmount || 0) - settledTotal) > 0.01) {
        alert(`Loyalty points only cover ₹${(loyaltyRedeemAmount || 0).toFixed(2)}. To combine points with other payments, use 'Mixed (Cash/Online/Points)' mode.`);
        return;
      }
    }

    try {
      setSubmitting(true);
      
      // Only include round-off if:
      // 1. Round-off is enabled AND
      // 2. Either automatic mode calculated it, OR manual mode and user changed the amount
      const shouldApplyRoundOff = isRoundOffEnabled && (
        (isAuto && Math.abs(manualRoundOff) > 0.001) ||
        (isManual && Math.abs(manualRoundOff) > 0.001)
      );
      
      const details = {
        round_off_amount: shouldApplyRoundOff ? Number(manualRoundOff.toFixed(2)) : 0,
        // Include loyalty redemption data
        loyalty_points_used: pointsToRedeem || 0,
        loyalty_amount_used: loyaltyRedeemAmount || 0
      };
    
    if (isRoundOffOnly) {
        await onConfirm('credit', details);
        return;
      }

      
      if (paymentMethod === 'mixed') {
        if (!validateMixed()) { setSubmitting(false); return; }
        await onConfirm('mixed', {
          ...details,
          cash_amount: Number(cashAmount),
          online_amount: Number(onlineAmount),
          online_method: onlineMethod,
          is_mixed: true
        });
      } else {
        await onConfirm(paymentMethod, details);
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
            {mode === 'kitchen' ? 'Confirm Order'  : isRoundOffOnly 
            ? 'Confirm Credit Sale'
            :  'Payment Confirmation'}
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
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Settled Total:</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: BRAND.orange }}>₹{(settledAmount || 0).toFixed(2)}</span>
          </div>
          {manualRoundOff !== 0 && (
            <div style={{ fontSize: '11px', color: manualRoundOff > 0 ? '#16a34a' : '#dc2626', fontWeight: 600, marginTop: 4 }}>
              ({manualRoundOff > 0 ? '+' : ''}{(manualRoundOff || 0).toFixed(2)} Round-off)
            </div>
          )}
        </div>

         {isRoundOffEnabled && !isAuto && mode !== 'kitchen' && (
            <div style={{ 
              marginBottom: 20, 
              background: BRAND.bgSoft, 
              padding: '16px', 
              borderRadius: 14, 
              border: `1.5px solid ${BRAND.orange}20`,
              boxShadow: `0 4px 12px ${BRAND.orange}08`
            }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                 <label style={{ fontSize: 12, fontWeight: 800, color: BRAND.orange, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                   Received Amount
                 </label>
                 <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', opacity: 0.8 }}>
                   Limit: ±₹{Number(roundOffConfig?.round_off_manual_limit || 0).toFixed(2)}
                 </span>
               </div>
               <div style={{ fontSize: '10px', color: '#64748b', marginBottom: 12, fontWeight: 500 }}>
                 Enter the amount paid by the customer to automatically calculate rounding.
               </div>
               <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                 <div style={{ 
                   flex: 1, 
                   position: 'relative', 
                   display: 'flex', 
                   alignItems: 'center',
                   background: '#fff',
                   borderRadius: 10,
                   border: '2px solid #e2e8f0',
                   transition: 'border-color 0.2s',
                   overflow: 'hidden'
                 }}>
                   <span style={{ paddingLeft: 12, fontSize: 16, fontWeight: 700, color: '#94a3b8' }}>₹</span>
                   <input 
                     type="number" 
                     step="0.01"
                     value={displayValue}
                     onChange={(e) => {
                       const raw = e.target.value;
                       setDisplayValue(raw);
                       
                       const val = Number(raw);
                       if (!isNaN(val)) {
                         const diff = val - effectiveAmount;
                         const limit = Number(roundOffConfig.round_off_manual_limit || 0);
                         if (Math.abs(diff) <= limit) {
                           setSettledAmount(val);
                         }
                       }
                     }}
                     onBlur={() => {
                        // On blur, format to 2 decimals
                        setDisplayValue(settledAmount.toFixed(2));
                     }}
                     style={{ 
                       flex: 1, padding: '10px 8px', border: 'none', outline: 'none',
                       fontSize: 15, fontWeight: 700, color: '#1e293b'
                     }}
                   />
                 </div>
                 <button 
                   onClick={() => {
                     setSettledAmount(effectiveAmount);
                     setDisplayValue(effectiveAmount.toFixed(2));
                   }}
                   style={{ 
                     background: '#fff', border: '2px solid #e2e8f0', color: '#64748b',
                     padding: '0 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                     transition: 'all 0.2s', display: 'flex', alignItems: 'center'
                   }}
                   onMouseEnter={(e) => { e.target.style.borderColor = '#cbd5e1'; e.target.style.color = '#334155'; }}
                   onMouseLeave={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.color = '#64748b'; }}
                 >Reset</button>
               </div>
            </div>
         )}
        {/* Note: Loyalty Redemption Section Removed - Moved to Payment Grid */}

        <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          {mode === 'kitchen' ? (
             <div style={{
               background: '#fff7ed', border: '1px solid #ffedd5',
               padding: '12px', borderRadius: 8, color: '#c2410c', fontSize: 14, fontWeight: 500
             }}>
                Confirm sending this order to the kitchen?
             </div>
           ) : isRoundOffOnly ? null : (
            <>
              {/* Cash */}
              <label style={choiceBox(paymentMethod === 'cash')} onClick={() => { handleMethodSelect('cash'); }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${paymentMethod === 'cash' ? BRAND.orange : '#cbd5e1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {paymentMethod === 'cash' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: BRAND.orange }} />}
                </div>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>💵 Cash</span>
              </label>

              {/* Online */}
              <label style={choiceBox(paymentMethod === 'online')} onClick={() => { handleMethodSelect('online'); }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${paymentMethod === 'online' ? BRAND.orange : '#cbd5e1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {paymentMethod === 'online' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: BRAND.orange }} />}
                </div>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>💳 Online</span>
              </label>

              {/* Mixed */}
              <label style={choiceBox(paymentMethod === 'mixed')} onClick={() => { handleMethodSelect('mixed'); }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${paymentMethod === 'mixed' ? BRAND.orange : '#cbd5e1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {paymentMethod === 'mixed' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: BRAND.orange }} />}
                </div>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>🔀 Mixed (Cash/Online/Points)</span>
              </label>
            </>
          )}
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
              {/* Loyalty Column (Only in Mixed) */}
              {loyaltyEnabled && customerId && (
                <div>
                   <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '12px', fontWeight: 600, color: '#047857' }}>
                    <span>🪙 Loyalty Points</span>
                    <span style={{ opacity: 0.8 }}>Available: {customerPoints}</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min="0"
                      max={customerPoints}
                      step="1"
                      value={pointsToRedeem || ''}
                      placeholder="Enter points"
                      onChange={(e) => {
                        let pts = parseInt(e.target.value, 10) || 0;
                        if (pts > customerPoints) pts = customerPoints;
                        
                        let amt = Number((pts * conversionRate).toFixed(2));
                        if (maxRedemption > 0 && amt > maxRedemption) {
                          amt = maxRedemption;
                          pts = Math.floor(amt / conversionRate);
                        }

                        setPointsToRedeem(pts);
                        setLoyaltyRedeemAmount(amt);
                        calculateRemainingOnline(cashAmount, amt);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '2px solid #10b98140',
                        borderRadius: 6,
                        fontSize: '14px',
                        fontWeight: 600,
                        background: '#ecfdf5',
                        outline: 'none'
                      }}
                      disabled={disabled}
                    />
                    {loyaltyRedeemAmount > 0 && (
                      <div style={{ 
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        fontSize: 12, fontWeight: 700, color: '#059669' 
                      }}>
                        = ₹{loyaltyRedeemAmount.toFixed(2)}
                      </div>
                    )}
                  </div>
                  {customerPoints < minPoints && customerPoints > 0 && (
                    <div style={{ fontSize: '10px', color: '#dc2626', marginTop: 4, fontWeight: 600 }}>
                      Min {minPoints} points required for redemption.
                    </div>
                  )}
                  {maxRedemption > 0 && (
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: 4, fontWeight: 600 }}>
                      Max ₹{maxRedemption.toFixed(2)} can be redeemed per order.
                    </div>
                  )}
                </div>
              )}

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
                    calculateRemainingOnline(val, loyaltyRedeemAmount);
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
                Total ₹{(settledTotal || 0).toFixed(2)} → 
                {loyaltyRedeemAmount > 0 && ` ₹${Number(loyaltyRedeemAmount).toFixed(2)} (Pts) +`}
                ₹{cashAmount || 0} (Cash) + 
                ₹{onlineAmount || 0} ({onlineMethod?.toUpperCase() || ''})
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
            disabled={disabled || (isRoundOffEnabled && isManual && Math.abs(settledAmount - effectiveAmount) > Number(roundOffConfig.round_off_manual_limit || 0) + 0.01)}
            style={{
              flex: 2,
              background: (disabled || (isRoundOffEnabled && isManual && Math.abs(settledAmount - effectiveAmount) > Number(roundOffConfig.round_off_manual_limit || 0) + 0.01)) ? '#cbd5e1' : `linear-gradient(135deg, ${BRAND.orange} 0%, ${BRAND.orangeDark} 100%)`,
              color: '#fff',
              border: 'none',
              padding: '10px',
              borderRadius: 10,
              fontSize: '14px',
              fontWeight: 700,
              cursor: (disabled || (isRoundOffEnabled && isManual && Math.abs(settledAmount - effectiveAmount) > Number(roundOffConfig.round_off_manual_limit || 0) + 0.01)) ? 'not-allowed' : 'pointer',
              boxShadow: (disabled || (isRoundOffEnabled && isManual && Math.abs(settledAmount - effectiveAmount) > Number(roundOffConfig.round_off_manual_limit || 0) + 0.01)) ? 'none' : `0 6px 12px ${BRAND.orange}40`,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              textTransform: 'uppercase',
              letterSpacing: '0.3px'
            }}
            onMouseEnter={(e) => {
              if (!(disabled || (isRoundOffEnabled && isManual && Math.abs(settledAmount - effectiveAmount) > Number(roundOffConfig.round_off_manual_limit || 0) + 0.01))) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = `0 8px 16px ${BRAND.orange}50`;
              }
            }}
            onMouseLeave={(e) => {
              if (!(disabled || (isRoundOffEnabled && isManual && Math.abs(settledAmount - effectiveAmount) > Number(roundOffConfig.round_off_manual_limit || 0) + 0.01))) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 6px 12px ${BRAND.orange}40`;
              }
            }}
          >
            {disabled ? 'Processing…'  : isRoundOffOnly
              ? 'Confirm Credit Sale'
              : (mode === 'kitchen' ? 'Send to Kitchen' : 'Confirm Payment')}
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

  // Helper to force update a cart item (e.g. for discounts)
 const onUpdateCartItem = (cartId, newItem) => {
  setCart(prev => {
    // Guard: item may have been removed
    if (!prev.some(c => c.cartId === cartId || c.id === cartId)) {
      return prev;
    }

    return prev.map(c =>
      (c.cartId === cartId || c.id === cartId)
        ? { ...c, ...newItem }   // ✅ SAFE MERGE
        : c
    );
  });
};


const clearDraft = (cartId) =>
  setQtyDrafts((prev) => {
    const next = { ...prev };
    delete next[cartId];
    return next;
  });


const updateCartItem = (cartId, qty, precision) => {
  if (!cartId) return;

  const p = Number.isInteger(precision) ? precision : 2;
  const q = roundP(qty, p);

  if (!Number.isFinite(q) || q <= 0) {
    setCart(p => p.filter(c => c.cartId !== cartId));
    clearDraft(cartId);
    return;
  }

  setCart(p =>
    p.map(c => (c.cartId === cartId ? { ...c, quantity: q } : c))
  );
  clearDraft(cartId);
};


const commitQtyDraft = (cartId, raw, precision) => {
  const p = Number.isInteger(precision) ? precision : 2;
  const q = normalizeQty(raw, { allowZero: true, precision: p });
  if (q === null) {
      clearDraft(cartId);
      return;
  }
  return updateCartItem(cartId, q, p);
};

const getDraftOrQtyNumber = (cartId, fallbackQty, precision = 2) => {
  const p = Number.isInteger(precision) ? precision : 2;
  const parsed = normalizeQty(qtyDrafts[cartId], { allowZero: true, precision: p });
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
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomerNo, setSelectedCustomerNo] = useState(null);
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

  // Customer Autocomplete States
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [allCustomers, setAllCustomers] = useState([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [customerAddresses, setCustomerAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');



  // --- LOYALTY STATE ---
  const [loyaltyProgram, setLoyaltyProgram] = useState(null);
  const [customerPoints, setCustomerPoints] = useState({ points: 0, pointsValue: 0 }); // Current points balance
  const [loyaltyRedeemAmount, setLoyaltyRedeemAmount] = useState(0);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [showLoyaltyRedeemModal, setShowLoyaltyRedeemModal] = useState(false);

  // Watch selected customer for Loyalty
  useEffect(() => {
    if (!selectedCustomerId || !restaurantId) {
        setLoyaltyProgram(null);
        setCustomerPoints({ points: 0, pointsValue: 0 });
        setLoyaltyRedeemAmount(0);
        setPointsToRedeem(0);
        return;
    }
    const fetchLoyalty = async () => {
        const { data: cust } = await supabase.from('v_owner_customers').select('loyalty_points, loyalty_program_id').eq('customer_id', selectedCustomerId).single();
        if (cust) {
            let progId = cust.loyalty_program_id;
            // If no specific program, check default
            if (!progId) {
                const { data: def } = await supabase.from('loyalty_programs').select('id').eq('restaurant_id', restaurantId).eq('is_default', true).maybeSingle();
                progId = def?.id;
            }
            if (progId) {
                 const { data: prog } = await supabase.from('loyalty_programs').select('*').eq('id', progId).single();
                 if (prog) {
                      setLoyaltyProgram(prog);
                      const rate = Number(prog.redemption_conversion_rate || 0);
                      const pts = Number(cust.loyalty_points || 0);
                      
                      // Calculate max redeemable value based on points balance
                      setCustomerPoints({ points: pts, pointsValue: pts * rate });
                 }
            }
        }
    };
    fetchLoyalty();
  }, [selectedCustomerId, restaurantId, supabase]); // Safe dependency on supabase client
  // ---------------------

  const [orderSelect, setOrderSelect] = useState('');
  const [processing, setProcessing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
const [paymentDialogMode, setPaymentDialogMode] = useState('settle'); // 'settle' | 'kitchen' | 'roundoff-only'
  const [showDiscountModal, setShowDiscountModal] = useState(false);

  const [sendToKitchenEnabled, setSendToKitchenEnabled] = useState(true);
  const [customerFeatureEnabled, setCustomerFeatureEnabled] = useState(false);
  const [enableMenuImages, setEnableMenuImages] = useState(false);

  // Variant selector state
  const [showVariantSelector, setShowVariantSelector] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);
  const [discount, setDiscount] = useState({ type: 'amount', value: 0 }); // { type: 'amount' | 'percent', value: number }


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
  const [roundOffConfig, setRoundOffConfig] = useState({
    round_off_enabled: false,
    round_off_mode: 'automatic',
    round_off_auto_factor: 1.0,
    round_off_manual_limit: 10.0
  });

  // Upsells for cart
  const [cartUpsells, setCartUpsells] = useState([]);

  const menuMapRef = useRef(new Map());

const PAGE_SIZE = 80; // adjust (50/80/100)
const [page, setPage] = useState(1);

useEffect(() => {
  setPage(1);
}, [searchQuery, categoryFilter, filterMode]);


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
function getItemDiscountAmount(item) {
  if (!item.discount || item.discount.value <= 0) return 0;

  const base = item.price * item.quantity;

  if (item.discount.type === 'percent') {
    return Number(
      Math.min(base * item.discount.value / 100, base).toFixed(2)
    );
  }

  return Number(
    Math.min(item.discount.value, base).toFixed(2)
  );
}




// ... (keep surrounding code)

/**
 * cartTotals (useMemo)
 * Uses the Centralized Shared Engine for 100% Logic Match with Kitchen/Invoice
 */
const cartTotals = useMemo(() => {
  // 1. Adapter: Map cart items to the strict format expected by orderCalculations
  const adapterItems = cart.map(c => ({
      ...c,
      price: Number(c.price || 0), // Face Value
      quantity: Number(c.quantity || 1),
      tax_rate: (c.tax_rate !== undefined) ? Number(c.tax_rate) : undefined,
      is_packaged_good: !!c.is_packaged_good
  }));

  // 2. Prepare round-off config for DISPLAY
  // In manual mode, we don't want to show auto round-off in the cart preview
  // User will enter it manually in the payment dialog
  const displayRoundOffConfig = {
    ...roundOffConfig,
    round_off_enabled: roundOffConfig.round_off_enabled && roundOffConfig.round_off_mode === 'automatic'
  };

  // 3. Call the Engine
  const result = calculateOrderTotals(
     adapterItems,
     discount, // { type, value }
     {
        gst_enabled: profileTax.gst_enabled,
        default_tax_rate: profileTax.default_tax_rate,
        prices_include_tax: profileTax.prices_include_tax,
        round_off_config: displayRoundOffConfig // Only auto-round for display in automatic mode
     },
     loyaltyRedeemAmount // 4th arg: Loyalty Redemption (Amount)
  );

  // 4. Reverse Adapter: Map back to the UI variables expected by this component
  // The UI uses slightly different naming conventions (e.g. subtotalEx vs subtotal_ex_tax)
  
  return {
    subtotalEx: Number(result.subtotal_after_line_discounts),
    totalTax: result.total_tax,
    totalInc: result.total_inc_tax,
    totalAmount: result.total_amount,
    roundOffAmount: result.round_off_amount,
    
    orderDiscount: result.total_order_discount_base,
    
    // Split Tax Aggregates
    total_tax_included: result.total_tax_included,
    total_tax_added: result.total_tax_added,

    // Legacy / Aliases
    combinedExTaxBase: Number(result.subtotal_base_ex_tax),
    taxableSubtotal: result.taxable_amount, // Taxable Base of Normal Items
    
    finalTotal: result.total_amount,
    finalTax: result.total_tax,
    orderDiscAmt: result.total_order_discount_base,
    orderDiscountFace: result.discount_amount,
    taxableAmount: result.taxable_amount,
    grossSubtotal: result.line_subtotal 
  };
}, [cart, profileTax, discount, roundOffConfig, loyaltyRedeemAmount]);  

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
            id,name,price,category,veg,status,hsn,tax_rate,is_packaged_good,code_number,image_url,has_variants,uom_id,
            uom:unit_of_measures(short_code, precision),
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
          // Flatten UOM if returned as array
          let uomObj = item.uom;
          if (Array.isArray(item.uom)) {
             uomObj = item.uom[0] || null;
          }
          item.uom = uomObj;
          
          // Use item's UOM precision, fallback to 0 if no UOM
          const precision = uomObj?.precision ?? 0;
          item.uom_precision = precision;

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
            has_addons: hasAddons,
            uom_short_code: uomObj?.short_code || null,
            uom_precision: precision
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
    print_logo_rows,
    featurescustomersenabled,
    features_menu_images_enabled,
    round_off_enabled,
    round_off_mode,
    round_off_auto_factor,
    round_off_manual_limit
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
  default_tax_rate: Number(profile?.default_tax_rate || 0),
  prices_include_tax: !!profile?.prices_include_tax,
});

setRoundOffConfig({
  round_off_enabled: !!profile?.round_off_enabled,
  round_off_mode: profile?.round_off_mode || 'automatic',
  round_off_auto_factor: profile?.round_off_auto_factor ?? 1.0,
  round_off_manual_limit: profile?.round_off_manual_limit ?? 10.0,
});


// NEW: set credit feature flag
setCreditFeatureEnabled(!!profile?.features_credit_enabled);

// Set tables from profile count
const tCount = profile?.tables_count || 0;
setTables(Array.from({ length: tCount }, (_, i) => i + 1));
setSendToKitchenEnabled(profile?.features_counter_send_to_kitchen_enabled !== false);
setCustomerFeatureEnabled(!!profile?.featurescustomersenabled);
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

await loadAllCustomers();


      } catch (e) {
        setError(e.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    })();
  }, [checking, loadingRestaurant, restaurantId, supabase]);

  useEffect(() => {
    if (orderMode) {
      localStorage.setItem('counter_orderMode', orderMode);
    }
  }, [orderMode]);

  // Customer suggestions filtering
  useEffect(() => {
    const q1 = (customerName || '').trim().toLowerCase();
    const q2 = (customerPhone || '').trim().toLowerCase();
    const q3 = (selectedCustomerNo || '').trim().toLowerCase();
    
    // Clear if all empty
    if (!q1 && !q2 && !q3) {
      setFilteredSuggestions([]);
      setShowNameSuggestions(false);
      return;
    }

    const matches = allCustomers.filter(c => {
      // Robust null checks for safety
      const cName = (c.name || '').toLowerCase();
      const cPhone = String(c.phone || '');
      const cNo = (c.customer_no || '').toLowerCase();
      
      const matchName = q1 ? cName.includes(q1) : true;
      const matchPhone = q2 ? cPhone.includes(q2) : true;
      const matchNo = q3 ? cNo.includes(q3) : true;
      
      return matchName && matchPhone && matchNo;
    });

    setFilteredSuggestions(matches.slice(0, 10));
  }, [customerName, customerPhone, selectedCustomerNo, allCustomers]);

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

  // Reset discount if switching to kitchen mode
  useEffect(() => {
    if (orderMode === 'kitchen') {
      setDiscount({ type: 'amount', value: 0 });
    }
  }, [orderMode]);

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

  const loadAllCustomers = async () => {
    if (!restaurantId) return;
    
    // Fetch consolidated customers (active only) from THE VIEW (Dynamic metrics)
    try {
      // Fetch from the VIEW (ensure the SQL above is run first)
      const { data, error } = await supabase
        .from('v_owner_customers')
        .select('*') // Get all columns including name/phone from join
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('last_order_at', { ascending: false })
        .limit(1000);

      if (error) {
        console.error('loadAllCustomers Error:', error);
        // Fallback to table if view fails (might not have name/phone join but keeps app running)
        const { data: fallback } = await supabase.from('restaurant_customers').select('*').eq('restaurant_id', restaurantId).limit(500);
        if (fallback) setAllCustomers(fallback);
        return;
      }

      if (data) {
        setAllCustomers(data.map(r => ({
           ...r,
           name: r.name || 'Guest',
           phone: r.phone || '',
           total_spent: Number(r.total_spent || 0),
           order_count: Number(r.order_count || 0),
           loyalty_points: Number(r.loyalty_points || 0)
        })));
      }
    } catch (e) {
       console.warn('Silent customer load failure:', e);
    }
  };

  useEffect(() => {
     if (!selectedCustomerId) {
        setCustomerAddresses([]);
        setSelectedAddressId('');
        return;
     }

     const fetchAddresses = async () => {
        try {
           const { data, error } = await supabase
              .from('customer_addresses')
              .select('*')
              .eq('customer_id', selectedCustomerId)
              .order('created_at', { ascending: false });
           
           if (!error && data) {
              setCustomerAddresses(data);
              // Default to first/default address
              if (data.length > 0) {
                 const def = data.find(a => a.is_default) || data[0];
                 setSelectedAddressId(def.id);
              }
           }
        } catch (e) {
           console.error('Fetch addresses error:', e);
        }
     }
     fetchAddresses();
  }, [selectedCustomerId, supabase]);


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

// Pagination (AFTER filteredItems)
const totalCount = filteredItems.length;
const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

const pagedItems = useMemo(() => {
  const start = (page - 1) * PAGE_SIZE;
  return filteredItems.slice(start, start + PAGE_SIZE);
}, [filteredItems, page]);


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
      pagedItems.reduce((acc, item) => {
        const cat = item.category || 'Others';
        (acc[cat] || (acc[cat] = [])).push(item);
        return acc;
      }, {})
    ),
  [pagedItems]
);


  const cartItemsCount = useMemo(
    () => cart.reduce((s, i) => {
        // If precision > 0, count as 1 item. If precision == 0, count quantity.
        return s + ((i.uom?.precision || 0) > 0 ? 1 : i.quantity);
    }, 0),
    [cart]
  );

  const cartItemsCountDisplay = cartItemsCount;

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
  // Helper for discount calculation
  const calcItemDiscount = (i) => {
       // Ensure values are numbers
       const price = Number(i.price || 0);
       const qty = Number(i.quantity || 1);
       if (i.discount && i.discount.value) {
          const val = Number(i.discount.value);
          if (i.discount.type === 'percent') {
             return (price * qty) * (val / 100);
          }
          return val;
       }
       return 0;
  };

  try {
    let order_type = 'counter';
    let table_number = null;
    if (orderSelect === 'parcel') order_type = 'parcel';
    else if (orderSelect === 'delivery') order_type = 'delivery';
    else if (orderSelect && orderSelect.startsWith('table:')) {
      table_number = orderSelect.split(':')[1] || null;
    }

    const items = cart.map((i) => ({
      id: i.id,
      name: i.displayName || i.name,
      price: i.price,
      quantity: roundP(i.quantity, i.uom?.precision ?? 2),
      hsn: i.hsn,
      tax_rate: i.tax_rate,
      is_packaged_good: i.is_packaged_good,
      code_number: i.code_number,
      variant_id: i.variant_id || null,
      variant_name: i.variant_name || null,
      uom_short_code: i.uom_short_code || null,
      uom_precision: i.uom?.precision ?? 0,
      discount: i.discount || (calcItemDiscount(i) > 0 ? { type: 'amount', value: calcItemDiscount(i) } : null),
      discount_amount:  calcItemDiscount(i)
    }));

    const isCredit = isCreditSale;

    // Calculate discount
    // Use calculated discount amount from cartTotals (Face Value for display/storage)
    const discountVal = cartTotals.orderDiscountFace;
    
    // Calculate Final Logic with Manual Round Off support
    const manualRoundOffAdj = Number(mixedDetails?.round_off_amount || 0);
    const finalRoundOffVal = (cartTotals.roundOffAmount || 0) + manualRoundOffAdj;
    
    // Updated: Ensure loyalty is also subtracted from the simplified logic here if not already handled by cartTotals
    // cartTotals.finalTotal is typically: Gross + Tax - Discount.
    // If loyaltyRedeemAmount is passed to calculateOrderTotals, it shoud reduce finalTotal.
    // However, let's explicit check: 
    // If calculateOrderTotals did NOT reduce it (because maybe it wasn't passed in this scope's cartTotals calculation?), we force it.
    // But we updated useCartTotals hooks. 
    // Wait, doCreateAndFinalizeOrder calls `calculateOrderTotals` manually above to get `cartTotals`.
    // And we passed `loyaltyRedeemAmount` there. So `cartTotals.finalTotal` ALREADY has loyalty deducted!
    // BUT checking the previous step, `cartTotals.finalTotal` is `result.total_inc_tax`.
    // Let's verify if `result.total_inc_tax` includes loyalty deduction.
    // In `orderCalculations.js`: 
    // const sumTotalInc = totals.reduce(...) - orderDiscountInc - loyaltyVal;
    // So Yes, it is deducted.
    
    const finalTotalVal = (cartTotals.finalTotal || 0) + manualRoundOffAdj;

    const orderData = {
      restaurant_id: restaurantId,
      order_type,
      table_number,
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim() || null,
      customer_id: selectedCustomerId,
      delivery_address_id: order_type === 'delivery' ? selectedAddressId : null,
      number_of_customers: numberOfCustomers ? Number(numberOfCustomers) : null,
      payment_method: isCredit ? 'credit' : finalPaymentMethod,
      payment_status: isCredit ? 'pending' : 'completed',
      status: finalizeNow ? 'completed' : 'new',
      items,
      is_credit: isCredit,
      credit_customer_id: isCredit ? selectedCreditCustomerId : null,
      original_payment_method: isCredit ? null : finalPaymentMethod,
      original_payment_method: isCredit ? null : finalPaymentMethod,
      discount_amount: discountVal,
      loyalty_amount_used: mixedDetails?.loyalty_amount_used ?? loyaltyRedeemAmount, // Pass Loyalty Redemption
      loyalty_points_used: mixedDetails?.loyalty_points_used ?? pointsToRedeem,
      base_tax_rate: Number(restaurant?.default_tax_rate || 5), // Pass rate context
      override_totals: {
           total_amount: Number(finalTotalVal.toFixed(2)),
           round_off_amount: Number(finalRoundOffVal.toFixed(2)),
           total_inc_tax: cartTotals.totalInc,
           total_tax: cartTotals.finalTax,
           subtotal_ex: cartTotals.subtotalEx
      },
      total_discount_percent: discount.type === 'percent' ? discount.value : 0,
      round_off_amount: finalRoundOffVal,
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


    const settledPrintTotal =
  roundOffConfig?.round_off_enabled
    ? Number(
        (cartTotals.finalTotal + (mixedDetails?.round_off_amount || 0))
          .toFixed(2)
      )
    : Number(cartTotals.finalTotal.toFixed(2));

    const orderForPrint = fullOrder || {
      id: result.order_id,
      restaurant_id: restaurantId,
      order_type,
      table_number,
      number_of_customers: orderData.number_of_customers ?? null, // ✅ ADD
      items,
      created_at: new Date().toISOString(),
      restaurant_name: restaurant?.name || printProfile?.restaurant_name || null,
      _profile: printProfile || null,
      bill: {
        grand_total: settledPrintTotal,
        subtotal: cartTotals.subtotalEx,
        tax_total: cartTotals.finalTax,
        order_discount_total: cartTotals.orderDiscAmt, // Base discount
        discount_amount: discountVal, // Face value discount (important for display)
        order_discount_base: cartTotals.orderDiscAmt,
        loyalty_amount_used: mixedDetails?.loyalty_amount_used ?? loyaltyRedeemAmount, // Pass loyalty
        loyalty_points_used: mixedDetails?.loyalty_points_used ?? pointsToRedeem,
        invoice_no: result.invoice_no || null,
        bill_no: result.bill_no || null,
      },
    };

    // 4. Loyalty logic is now handled by backend /api/orders/create

    window.dispatchEvent(
      new CustomEvent('auto-print-order', {
        detail: {
          ...orderForPrint,
          autoPrint: true,
          kind: 'bill',
        },
      })
    );


    setCart([]); 
    setCustomerName(''); 
    setCustomerPhone(''); 
    setSelectedCustomerId(null);
    setSelectedCustomerNo(null);
    setNumberOfCustomers(''); 
    setPaymentMethod('cash');
    setOrderSelect(''); 
    setIsCreditSale(false); 
    setSelectedCreditCustomerId(''); 
    setCreditCustomerBalance(0);
    setDiscount({ type: 'amount', value: 0 });
    setDrawerOpen(false); 
    setShowPaymentDialog(false);
    setProcessing(false); // Reset processing state
    await loadCreditCustomers();
    setSuccess('Sale completed');
    setTimeout(() => setSuccess(''), 2000);
  } catch (error) {
    console.error('[doCreateAndFinalizeOrder] Error:', error);
    setError(error.message || 'Failed to complete sale');
    setTimeout(() => setError(''), 5000);
    throw error; // Re-throw so completeSale() catches it
  }
}

  // Create without finalize (send to kitchen)
  async function doCreateKitchenOrder() {
    let order_type = 'counter';
    let table_number = null;
    if (orderSelect === 'parcel') order_type = 'parcel';
    else if (orderSelect === 'delivery') order_type = 'delivery';
    else if (orderSelect && orderSelect.startsWith('table:')) table_number = orderSelect.split(':')[1] || null;

    const calcItemDiscount = (i) => {
         const price = Number(i.price || 0);
         const qty = Number(i.quantity || 1);
         if (i.discount && i.discount.value) {
            const val = Number(i.discount.value);
            if (i.discount.type === 'percent') return (price * qty) * (val / 100);
            return val;
         }
         return 0;
    };

    const items = cart.map((i) => ({
      id: i.id, name: i.displayName || i.name, price: i.price, 
      quantity: roundP(i.quantity, i.uom?.precision ?? 2),
      hsn: i.hsn, tax_rate: i.tax_rate, is_packaged_good: i.is_packaged_good, code_number: i.code_number,
      variant_id: i.variant_id || null, variant_name: i.variant_name || null,
      uom_short_code: i.uom_short_code || null,
      uom_precision: i.uom?.precision ?? 0,
      discount: i.discount || (calcItemDiscount(i) > 0 ? { type: 'amount', value: calcItemDiscount(i) } : null),
      discount_amount: calcItemDiscount(i)
    }));

    // Use calculated discount amount from cartTotals (Face Value)
    const discountVal = cartTotals.orderDiscountFace;

    const isCredit = isCreditSale;
    
    // Use calculated round-off from cartTotals
    const kitchenRoundOff = cartTotals.roundOffAmount;

    const orderData = {
      restaurant_id: restaurantId,
      order_type,
      table_number,
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim() || null,
      customer_id: selectedCustomerId,
      delivery_address_id: order_type === 'delivery' ? selectedAddressId : null,
      number_of_customers: numberOfCustomers ? Number(numberOfCustomers) : null,
      payment_method: isCredit ? 'credit' : 'none',
      payment_status: 'pending',
      items,
      is_credit: isCredit,
      credit_customer_id: isCredit ? selectedCreditCustomerId : null,
      original_payment_method: null,
      discount_amount: discountVal,
      total_discount_percent: discount.type === 'percent' ? discount.value : 0,
      round_off_amount: kitchenRoundOff,
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
  number_of_customers: orderData.number_of_customers ?? null,
  items,
  created_at: new Date().toISOString(),
  restaurant_name: restaurant?.name || printProfile?.restaurant_name || null,
  _profile: printProfile || null,
  invoice_no: result.invoice_no || null,
  bill_no: result.bill_no || null,
};

    // Immediate KOT print for this counter order
    /* Disabled to prevent duplicate prints - handled by global usePrintService
    markPrinted(result.order_id, 'kot', restaurantId);
    window.dispatchEvent(
      new CustomEvent('auto-print-order', {
        detail: { ...orderForPrint, autoPrint: true, kind: 'kot' },
      })
    );
    */

    setCart([]); setCustomerName(''); setCustomerPhone(''); setNumberOfCustomers(''); setPaymentMethod('cash');
    setOrderSelect(''); setIsCreditSale(false); setSelectedCreditCustomerId(''); setCreditCustomerBalance(0);
    setDiscount({ type: 'amount', value: 0 }); // Reset discount
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
        setProcessing(false);
      } else {
       if (isCreditSale) {
         // Credit sale → show round-off only popup       
         setPaymentDialogMode('roundoff-only');
         setShowPaymentDialog(true);
         setProcessing(false);
         return;
      } else {
          setPaymentDialogMode('settle');
          setShowPaymentDialog(true);
          setProcessing(false);

        }
      }
    } catch (err) {
      setError('Error completing sale: ' + err.message);
      setTimeout(() => setError(''), 3000);
    } finally {
      if (orderMode !== 'kitchen') {
        setProcessing(false);
      }
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
                    { value: 'delivery', label: 'Home Delivery 🏠' },
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
            ) : customerFeatureEnabled ? (
              <>
                <div style={{ position: 'relative' }}>
                  <div style={{ 
                    display: 'flex', 
                    gap: '12px', 
                    alignItems: 'flex-start'
                  }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <SectionLabel>Customer Name</SectionLabel>
                          {selectedCustomerId && (() => {
                             const c = allCustomers.find(cust => cust.customer_id === selectedCustomerId);
                             if (!c) return null;
                             const isVip = c.order_count >= 5 || c.total_spent >= 2000;
                             const thirtyDaysAgo = new Date();
                             thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                             const isAtRisk = c.last_order_at && new Date(c.last_order_at) < thirtyDaysAgo;
                             
                             return (
                               <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                                 {isVip && <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>VIP</span>}
                                 {isAtRisk && <span style={{ fontSize: '10px', background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>AT RISK</span>}
                               </div>
                             );
                          })()}
                        </div>
                        {!showNameSuggestions && !selectedCustomerId && customerName.trim() && filteredSuggestions.length === 0 && (
                          <span style={{ fontSize: '10px', color: THEME.main, fontWeight: 800, background: THEME.soft, padding: '2px 8px', borderRadius: '4px', marginBottom: '4px' }}>
                            NEW
                          </span>
                        )}
                      </div>
                      <input 
                        type="text" placeholder="Search name..." 
                        value={customerName} 
                        readOnly={!!selectedCustomerId}
                        onChange={(e) => {
                           setCustomerName(e.target.value);
                           setShowNameSuggestions(true);
                           if (selectedCustomerId) {
                              setSelectedCustomerId(null);
                              setSelectedCustomerNo(null);
                              setCustomerPhone('');
                           }
                        }}
                        onFocus={() => setShowNameSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
                        style={{  
                          width: '100%', padding: '12px 16px', borderRadius: '12px', outline: 'none', fontSize: '14px',
                          background: selectedCustomerId ? (orderMode === 'kitchen' ? '#fff7ed' : '#f0fdf4') : '#ffffff', 
                          border: selectedCustomerId 
                            ? (orderMode === 'kitchen' ? '1.5px solid #fdba74' : '1.5px solid #4ade80') 
                            : '1.5px solid #e2e8f0',
                          fontWeight: selectedCustomerId ? 700 : 400,
                      color: selectedCustomerId ? (orderMode === 'kitchen' ? '#9a3412' : '#166534') : '#1e293b',
                      cursor: selectedCustomerId ? 'not-allowed' : 'text'
                        }} 
                      />
                      {selectedCustomerId && (
                         <button
                           onClick={(e) => {
                               e.stopPropagation();
                               setSelectedCustomerId(null);
                               setSelectedCustomerNo(null);
                               setCustomerName('');
                               setCustomerPhone('');
                           }}
                           style={{
                               position: 'absolute', right: '12px', top: '35px',
                               background: 'transparent', color: '#000', border: 'none',
                               width: '18px', height: '18px', cursor: 'pointer', fontSize: '12px',
                               display: 'flex', alignItems: 'center', justifyContent: 'center',
                               zIndex: 2, transition: 'all 0.2s'
                           }}
                         >
                           ✕
                         </button>
                      )}
                    </div>

                    {/* Customer No */}
                    <div style={{ flex: 1 }}>
                      <SectionLabel>Cust #</SectionLabel>
                      <input 
                        type="text"
                        placeholder="ID"
                        value={selectedCustomerNo || ''}
                        readOnly={!!selectedCustomerId}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setSelectedCustomerNo(val);
                          setShowNameSuggestions(true);
                          if (selectedCustomerId) {
                            setSelectedCustomerId(null);
                            setCustomerName('');
                            setCustomerPhone('');
                          }
                        }}
                        onFocus={() => setShowNameSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
                        style={{
                          width: '100%', padding: '12px 16px', 
                          background: selectedCustomerId ? (orderMode === 'kitchen' ? '#fff7ed' : '#f0fdf4') : '#ffffff', 
                          border: selectedCustomerId 
                            ? (orderMode === 'kitchen' ? '1.5px solid #fdba74' : '1.5px solid #4ade80') 
                            : '1.5px solid #e2e8f0',
                          borderRadius: '12px', fontSize: '14px', fontWeight: 700, outline: 'none',
                          color: selectedCustomerId ? (orderMode === 'kitchen' ? '#9a3412' : '#166534') : '#1e293b',
                          cursor: selectedCustomerId ? 'not-allowed' : 'text'
                        }}
                      />
                    </div>

                    <div style={{ flex: 1 }}>
                      <SectionLabel>Phone</SectionLabel>
                      <input 
                        type="tel" placeholder="Phone" 
                        value={customerPhone} 
                        readOnly={!!selectedCustomerId}
                        onChange={(e) => {
                          setCustomerPhone(e.target.value);
                          setShowNameSuggestions(true);
                          if (selectedCustomerId) {
                            setSelectedCustomerId(null);
                            setSelectedCustomerNo(null);
                            setCustomerName('');
                          }
                        }} 
                        onFocus={() => setShowNameSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
                        style={{ 
                          width: '100%', padding: '12px', borderRadius: '12px', outline: 'none', fontSize: '14px',
                          background: selectedCustomerId ? (orderMode === 'kitchen' ? '#fff7ed' : '#f0fdf4') : '#ffffff', 
                          border: selectedCustomerId 
                            ? (orderMode === 'kitchen' ? '1.5px solid #fdba74' : '1.5px solid #4ade80') 
                            : '1.5px solid #e2e8f0',
                          cursor: selectedCustomerId ? 'not-allowed' : 'text'
                        }} 
                      />
                    </div>
                  </div>

                  {/* Delivery Address Selection (Only if Delivery is selected) */}
                  {orderSelect === 'delivery' && (
                    <div style={{ marginTop: 20, padding: 16, background: THEME.soft, border: `1.5px solid ${THEME.main}30`, borderRadius: 16 }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <SectionLabel style={{ color: THEME.main, marginBottom: 0 }}>Select Delivery Address</SectionLabel>
                          {selectedCustomerId && (
                             <button 
                               onClick={() => {
                                  // Open a simple "Add Address" prompt or modal? 
                                  // For now let's use a prompt to keep it simple, or just guide them to Edit Profile
                                  alert('To add a new address, please use the Edit Profile feature in Customers page. Adding quick entry here soon!');
                               }}
                               style={{ background: 'transparent', border: 'none', color: THEME.main, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                             >
                               + Add New
                             </button>
                          )}
                       </div>
                       
                       {selectedCustomerId ? (
                          customerAddresses.length > 0 ? (
                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                                {customerAddresses.map(addr => (
                                   <div 
                                      key={addr.id}
                                      onClick={() => setSelectedAddressId(addr.id)}
                                      style={{
                                         padding: 12, borderRadius: 12, cursor: 'pointer',
                                         background: selectedAddressId === addr.id ? THEME.main : '#fff',
                                         color: selectedAddressId === addr.id ? '#fff' : '#1e293b',
                                         border: selectedAddressId === addr.id ? 'none' : '1.5px solid #e2e8f0',
                                         boxShadow: selectedAddressId === addr.id ? `0 4px 12px ${THEME.main}30` : 'none',
                                         transition: 'all 0.2s'
                                      }}
                                   >
                                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', opacity: 0.8, marginBottom: 4 }}>
                                         {addr.label || 'Home'}
                                      </div>
                                      <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>
                                         {addr.line1}, {addr.city}
                                      </div>
                                   </div>
                                ))}
                             </div>
                          ) : (
                             <div style={{ padding: '12px', textAlign: 'center', background: '#fff', borderRadius: 12, fontSize: 13, color: '#64748b' }}>
                                No saved addresses. Please add one in Customers page.
                             </div>
                          )
                       ) : (
                          <div style={{ padding: '12px', textAlign: 'center', background: '#fff', borderRadius: 12, fontSize: 13, color: '#64748b' }}>
                             Select a customer first to choose an address.
                          </div>
                       )}
                    </div>
                  )}

                  {/* Unified Suggestions Dropdown */}
                  {showNameSuggestions && filteredSuggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                      background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.1)', marginTop: '8px', overflow: 'hidden'
                    }}>
                       {filteredSuggestions.map((c, i) => (
                         <div 
                           key={i}
                           onMouseDown={(e) => {
                             e.preventDefault(); 
                             setCustomerName(c.name || '');
                             setCustomerPhone(c.phone || '');
                             setSelectedCustomerId(c.customer_id || c.id || null);
                             setSelectedCustomerNo(c.customer_no || null);
                             setShowNameSuggestions(false);
                           }}
                           style={{
                             padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
                             borderBottom: i === filteredSuggestions.length - 1 ? 'none' : '1px solid #f1f5f9'
                           }}
                           onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                           onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                         >
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '50%', background: THEME.soft, color: THEME.main,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700
                            }}>
                               {c.name ? c.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '14px' }}>
                                {c.name} {c.customer_no && <span style={{ color: '#64748b', fontWeight: 500, marginLeft: 8 }}>#{c.customer_no}</span>}
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>{c.phone}</div>
                            </div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: THEME.main }}>SELECT</div>
                         </div>
                       ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </ControlsCard>
      </header>

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
    const precision = it.uom_precision ?? 2;
    if (q <= 0) return updateCartItem(cartId, 0, precision);

    const exists = cart.some((c) => c.cartId === cartId);
    if (exists) updateCartItem(cartId, q, precision);
    else addItemToCart({ ...it, quantity: q }); // addItemToCart handles initial add, precision stored in item
  };

const isVariantItem = !!item.has_variants && (item.variants?.length || 0) > 0;


  return (
    <div style={{ minWidth: '200px', maxWidth: '200px' }}>
      <MenuItemCard
  item={item}
  quantity={isVariantItem ? 0 : qty}
  isActive={totalItemQty > 0}
  onAdd={() => addToCart(item)}
  onRemove={() => {
          const current = cart.find((c) => c.id === item.id)?.quantity || 0;
          updateCartItem(item.id, current - 1, item.uom_precision ?? 2);
        }}
  onQuantityChange={isVariantItem ? undefined : handleQuantityChange}
  showImage={enableMenuImages}
  highlightColor={enableMenuImages ? undefined : THEME.main}
  decimalPlaces={item.uom_precision ?? 2}
  quantityStep={item.uom_precision > 0 ? (1 / Math.pow(10, item.uom_precision)) : 1}
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
                                 onClick={() => updateCartItem(item.id, qty - 1, item.uom?.precision)}
                                 style={{
                                    width: 32, height: 32, 
                                    border: 'none', background: 'transparent', 
                                    color: THEME.main, fontSize: 18, fontWeight: 700,
                                    cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                                    flexShrink: 0
                                 }}
                               >-</button>
                               
                               <input
                                  value={qtyDrafts[item.id] ?? (Number.isFinite(qty) ? qty.toFixed(item.uom?.precision ?? 2) : '0.00')}
                                  inputMode="decimal"
                                  type="text"
                                  onChange={(e) => setDraft(item.id, e.target.value)}
                                  onBlur={(e) => commitQtyDraft(item.id, e.target.value, item.uom?.precision)}
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

{totalCount > 0 && (
  <div style={{ 
    display: 'flex', 
    flexDirection: 'column', 
    alignItems: 'center', 
    gap: '20px', 
    padding: '40px 20px 24px',
    borderTop: '1px solid #f1f5f9',
    marginTop: '30px',
    background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)',
    borderRadius: '0 0 24px 24px'
  }}>
    {/* Showing Status Badge */}
    <div style={{ 
      fontSize: '12px', 
      color: '#64748b', 
      fontWeight: 700,
      background: '#fff',
      padding: '6px 16px',
      borderRadius: '99px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    }}>
      Showing <span style={{ color: THEME.main }}>{Math.min(totalCount, (page - 1) * PAGE_SIZE + 1)}</span> 
      <span style={{ margin: '0 4px', color: '#cbd5e1' }}>—</span> 
      <span style={{ color: THEME.main }}>{Math.min(totalCount, page * PAGE_SIZE)}</span> 
      <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
      Total <span style={{ color: THEME.main }}>{totalCount}</span> Items
    </div>
    
    {totalPages > 1 && (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px', 
        flexWrap: 'wrap', 
        justifyContent: 'center',
        background: '#fff',
        padding: '6px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
      }}>
        {/* Navigation Buttons Row */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setPage(1)}
            disabled={page === 1}
            style={{
              width: '36px', height: '36px',
              borderRadius: '10px',
              border: 'none',
              background: page === 1 ? '#f8fafc' : '#fff',
              color: page === 1 ? '#cbd5e1' : '#64748b',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: page === 1 ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
            }}
            title="First Page"
          >«</button>
          
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '0 14px', height: '36px',
              borderRadius: '10px',
              border: 'none',
              background: page === 1 ? '#f8fafc' : '#fff',
              color: page === 1 ? '#cbd5e1' : '#64748b',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: page === 1 ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >Prev</button>
        </div>

        {/* Page Numbers */}
        <div style={{ display: 'flex', gap: '4px', padding: '0 4px', borderLeft: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9' }}>
           {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pNum;
              if (totalPages <= 5) pNum = i + 1;
              else if (page <= 3) pNum = i + 1;
              else if (page >= totalPages - 2) pNum = totalPages - 4 + i;
              else pNum = page - 2 + i;

              const isActive = pNum === page;
              return (
                <button
                  key={pNum}
                  type="button"
                  onClick={() => setPage(pNum)}
                  style={{
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '10px',
                    border: 'none',
                    background: isActive ? THEME.main : 'transparent',
                    color: isActive ? '#fff' : '#64748b',
                    fontWeight: 800,
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: isActive ? `0 4px 12px ${THEME.main}40` : 'none',
                    transform: isActive ? 'scale(1.05)' : 'scale(1)'
                  }}
                >{pNum}</button>
              );
           })}
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '0 14px', height: '36px',
              borderRadius: '10px',
              border: 'none',
              background: page === totalPages ? '#f8fafc' : '#fff',
              color: page === totalPages ? '#cbd5e1' : '#64748b',
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: page === totalPages ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >Next</button>
          
          <button
            type="button"
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            style={{
              width: '36px', height: '36px',
              borderRadius: '10px',
              border: 'none',
              background: page === totalPages ? '#f8fafc' : '#fff',
              color: page === totalPages ? '#cbd5e1' : '#64748b',
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: page === totalPages ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
            }}
            title="Last Page"
          >»</button>
        </div>
      </div>
    )}
  </div>
)}


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
    <span>{cartItemsCountDisplay} {cartItemsCount === 1 ? 'Item' : 'Items'}</span>
    <span style={{ opacity: 0.6 }}>|</span>
    <span>₹{(cartTotals?.finalTotal || 0).toFixed(2)}</span>

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
                    onClick={() => {
                      setCart([]);
                      setDiscount({ type: 'amount', value: 0 });
                    }}
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
                  Credit Balance: ₹{(Number(creditCustomerBalance || 0) + (cartTotals?.totalInc || 0)).toFixed(2)}
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
                                {/* Discount badge inline */}
                                {i.discount && i.discount.value > 0 && (
                                   <span style={{ 
                                     fontSize: 10, 
                                     fontWeight: 700, 
                                     color: '#ef4444', 
                                     background: '#fee2e2',
                                     padding: '2px 6px', 
                                     borderRadius: 4,
                                     border: '1px solid #fecaca'
                                   }}>
                                      {i.discount.type === 'percent' ? `-${i.discount.value}%` : `-₹${i.discount.value}`}
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
                              const prec = i.uom_precision ?? 2;
                              const step = prec > 0 ? (1 / Math.pow(10, prec)) : 1;
                              const base = getDraftOrQtyNumber(id, i.quantity, prec);
                              updateCartItem(id, base - step, prec);
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
                          <input
                            value={qtyDrafts[i.cartId || i.id] ?? (Number.isFinite(i.quantity) ? i.quantity.toFixed(i.uom_precision ?? 2) : '0.00')}
                            inputMode="decimal"
                            type="text"
                            onChange={(e) => setDraft(i.cartId || i.id, e.target.value)}
                            onBlur={(e) => commitQtyDraft(i.cartId || i.id, e.target.value, i.uom_precision ?? 2)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                              if (e.key === 'Escape') clearDraft(i.cartId || i.id);
                            }}
                            style={{ 
                              width: 48, 
                              textAlign: 'center', 
                              fontSize: 14, 
                              fontWeight: 700,
                              color: '#111827',
                              background: '#fafafa',
                              border: 'none',
                              borderLeft: `1px solid ${THEME.light || '#e5e7eb'}`,
                              borderRight: `1px solid ${THEME.light || '#e5e7eb'}`,
                              padding: '0 2px',
                              height: 28,
                              borderRadius: 0,
                              outline: 'none'
                            }}
                          />
                          <button
                            onClick={() => {
                              const id = i.cartId || i.id;
                              const prec = i.uom_precision ?? 2;
                              const step = prec > 0 ? (1 / Math.pow(10, prec)) : 1;
                              const base = getDraftOrQtyNumber(id, i.quantity, prec);
                              updateCartItem(id, base + step, prec);
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
                            ₹{i.price} × {formatQtyP(i.quantity, i.uom?.precision ?? 2)}
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
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                              {(i.discount && i.discount.value > 0) && (
                                <span style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'line-through', lineHeight: 1 }}>
                                  ₹{(Number(i.price || 0) * Number(i.quantity || 0)).toFixed(2)}
                                </span>
                              )}
                              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
                              ₹{((Number(i.price || 0) * Number(i.quantity || 0)) - getItemDiscountAmount(i)).toFixed(2)}
                              </span>
                          </div>
                      
                          {profileTax.gst_enabled && !profileTax.prices_include_tax && !i.is_packaged_good && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: THEME.main,
                              background: THEME.soft,
                              padding: '2px 6px',
                              borderRadius: 4,
                              border: `1px solid ${THEME.main}30`,
                              height: 'fit-content'
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
                    {/* Subtotal Row - Only Visible if different from Taxable (e.g. when discount and pre-tax) */}
                    {Math.abs((cartTotals?.subtotalEx || 0) - (cartTotals?.taxableAmount || 0)) > 0.01 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                          <span>Subtotal (ex-tax)</span>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>
                              ₹{(cartTotals?.subtotalEx || 0).toFixed(2)}
                          </span>
                      </div>
                    )}


                    {/* Discount Row */}
                    {orderMode !== 'kitchen' && (
                      discount.value === 0 ? (
                        <div style={{  }}>
                          <button 
                            onClick={() => setShowDiscountModal(true)}
                            style={{
                                  background: 'none', border: 'none', color: THEME.main, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline'
                            }}
                          >
                            + Add Discount
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#ef4444' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                             <span style={{ fontWeight: 600 }}>Bill Discount (-)</span>
                             <button
                                onClick={() => setShowDiscountModal(true)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: 0,
                                  fontSize: 12,
                                  color: '#64748b',
                                  textDecoration: 'underline'
                                }}
                             >
                               Edit
                             </button>
                          </div>
                           <span style={{ fontWeight: 600 }}>
                             -₹{(cartTotals?.orderDiscountFace || 0).toFixed(2)}
                           </span>
                        </div>
                      )
                    )}

                    {/* Taxable Value */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                        <span>Taxable Value</span>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>
                            ₹{(cartTotals?.taxableAmount || 0).toFixed(2)}
                        </span>
                    </div>

                    {/* Tax Breakdown - Split Logic */}
                    {(cartTotals?.total_tax_included || 0) > 0.01 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                        <span>GST (incl)</span>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>
                          ₹{(cartTotals?.total_tax_included || 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                    
                    {(cartTotals?.total_tax_added || 0) > 0.01 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                        <span>GST (+)</span>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>
                          ₹{(cartTotals?.total_tax_added || 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                    
                    {/* Fallback for Total Tax if splits are missing but total > 0 (prevents 'No Details' error) */}
                    {!(cartTotals?.total_tax_added > 0) && !(cartTotals?.total_tax_included > 0) && (cartTotals?.finalTax || 0) > 0.01 && (
                       <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                         <span>GST {(profileTax.prices_include_tax || cartTotals?.hasPackaged) ? '(incl)' : '(+)'}</span>
                         <span style={{ fontWeight: 600, color: '#1e293b' }}>
                           ₹{(cartTotals?.finalTax || 0).toFixed(2)}
                         </span>
                       </div>
                    )}
                    {/* Round Off */}
                    {Math.abs(cartTotals?.roundOffAmount || 0) > 0.001 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: cartTotals.roundOffAmount > 0 ? '#16a34a' : '#ef4444' }}>
                        <span>Round Off</span>
                        <span style={{ fontWeight: 600 }}>
                          {cartTotals.roundOffAmount > 0 ? '+' : ''}₹{cartTotals.roundOffAmount.toFixed(2)}
                        </span>
                      </div>
                    )}

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
                      <span style={{ color: THEME.main }}>
  ₹{(cartTotals?.finalTotal || 0).toFixed(2)}

</span>
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
                        ? `Send to Kitchen • ₹${(cartTotals?.finalTotal || 0).toFixed(2)}`
                        : isCreditSale
                        ? `Credit & Settle • ₹${(cartTotals?.finalTotal || 0).toFixed(2)}`
                        : `Complete Sale • ₹${(cartTotals?.finalTotal || 0).toFixed(2)}`}
                    </span>
                  )}
                </button>
              </div>
            )}
            
            <DiscountModal 
                 visible={showDiscountModal}
                 onClose={() => setShowDiscountModal(false)}
                 onSaveTotal={setDiscount}
                 cart={cart}
                 onUpdateCartItem={onUpdateCartItem}
                 currentTotalDiscount={discount}
                 theme={THEME}
                 totalAmount={cartTotals.subtotalEx} 
                 // Note: We pass Subtotal Ex-Tax because Order Discount is applied Pre-Tax. 
                 // Percentage should be of SubtotalEx. Amount cannot exceed SubtotalEx.
            />
          </div>
        </div>
      )}

      {/* Payment/Confirmation Dialog */}
      {showPaymentDialog && (
         <PaymentConfirmDialog
          amount={cartTotals.finalTotal}
          busy={processing}
          mode={paymentDialogMode}
          roundOffConfig={roundOffConfig}
          loyaltyEnabled={!!loyaltyProgram && !!selectedCustomerId}
          customerPoints={customerPoints.points || 0}
          conversionRate={loyaltyProgram?.redemption_conversion_rate || 1.0}
          restaurantId={restaurantId}
          customerId={selectedCustomerId}
          minPoints={loyaltyProgram?.redemption_min_points || 0}
          maxRedemption={loyaltyProgram?.max_redemption_amount_per_order || 0}
          onLoyaltyRedeem={async (points, discount) => {
            // Loyalty redemption callback - points are already set in the modal
            setPointsToRedeem(points);
            setLoyaltyRedeemAmount(discount);
            console.log(`Loyalty redeemed: ${points} points for ₹${discount}`);
          }}
          onConfirm={async (method, details) => {
            if (processing) return;
            setProcessing(true);
            try {
              if (paymentDialogMode === 'kitchen') {
                  await doCreateKitchenOrder();
              } else {
                 await doCreateAndFinalizeOrder(method, details, true);
              }
              setShowPaymentDialog(false);
            } catch (e) {
              setProcessing(false);
              setError(e.message);
            }
          }}
          onCancel={() => {
            setShowPaymentDialog(false);
            setProcessing(false);
          }}
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
