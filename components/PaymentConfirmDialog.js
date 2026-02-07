import React, { useState, useEffect, useMemo } from 'react';
import { useRestaurant } from '../context/RestaurantContext';
import { getSupabase } from '../services/supabase';
import { calculateOrderTotals } from '../utils/orderCalculations';
import Button from './ui/Button';
import DiscountModal from './DiscountModal';
import NiceSelect from './NiceSelect';

const BRAND = {
  orange: '#f97316',
  white: '#ffffff',
  slate: '#f8fafc',
  gray: '#64748b',
  border: '#e2e8f0'
};

function getOrderTypeLabel(order) {
  if (!order) return '';
  if (order.table_number && order.table_number !== null) {
    return `Table ${order.table_number}`;
  }
  if (order.order_type === 'parcel') return 'Parcel';
  return '';
}

export default function PaymentConfirmDialog({ order, onConfirm, onCancel }) {
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showMixedForm, setShowMixedForm] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');
  const [onlineMethod, setOnlineMethod] = useState('upi');
  const { restaurant } = useRestaurant();
  const mode = order.mode || null;
  const [submitting, setSubmitting] = useState(false);

  const THEME = { main: BRAND.orange, soft: '#fff7ed', light: '#fed7aa' };

  // Loyalty Implementation
  const [loyaltyData, setLoyaltyData] = useState({ 
    availablePoints: 0, 
    conversionRate: 0, 
    minPoints: 0,
    maxRedemption: 0,
    loading: false 
  });
  const [loyaltyAmountUsed, setLoyaltyAmountUsed] = useState(0);
  const [loyaltyPointsUsed, setLoyaltyPointsUsed] = useState(0);

  useEffect(() => {
    async function fetchLoyalty() {
      const rid = order.restaurant_id || restaurant?.id;
      if (!order.customer_id || !rid) return;
      setLoyaltyData(prev => ({ ...prev, loading: true }));
      try {
        const s = getSupabase();
        // 1. Fetch Customer using the same view as counter.js for consistency
        const { data: cust } = await s
          .from('v_owner_customers')
          .select('loyalty_points, loyalty_program_id')
          .eq('customer_id', order.customer_id)
          .maybeSingle();
        
        if (!cust) return;

        // 2. Fetch Program (Program is still restaurant specific)
        let programId = cust.loyalty_program_id;
        if (!programId) {
          const { data: def } = await s
            .from('loyalty_programs')
            .select('id')
            .eq('restaurant_id', rid)
            .eq('is_default', true)
            .maybeSingle();
          programId = def?.id;
        }

        if (programId) {
          const { data: prog } = await s
            .from('loyalty_programs')
            .select('*')
            .eq('id', programId)
            .single();
          
          if (prog) {
            setLoyaltyData({
              availablePoints: cust.loyalty_points || 0,
              conversionRate: Number(prog.redemption_conversion_rate || 1.0),
              minPoints: prog.redemption_min_points || 100,
              maxRedemption: prog.max_redemption_amount_per_order || 0,
              loading: false
            });
          }
        }
      } catch (err) {
        console.error('Loyalty Fetch Error:', err);
      } finally {
        setLoyaltyData(prev => ({ ...prev, loading: false }));
      }
    }
    fetchLoyalty();
  }, [order.customer_id, order.restaurant_id, restaurant?.id]);

  const [localItems, setLocalItems] = useState(() => {
     const items = order.order_items || order.items || [];
     return items.map(i => ({
        ...i,
        cartId: i.id,
        discount: i.discount_amount ? { type: 'amount', value: i.discount_amount } : (i.discount || { type: 'amount', value: 0 }),
        price: i.price,
        quantity: i.quantity,
        name: i.menu_items?.name || i.name
     }));
  });

  const [discount, setDiscount] = useState(() => {
      // Prioritize Percentage Discount if it exists on the order
      if (Number(order.total_discount_percent || 0) > 0.01) {
          return { type: 'percent', value: Number(order.total_discount_percent) };
      }
      let dVal = Number(order.discount_amount || 0);
      return dVal > 0 ? { type: 'amount', value: dVal } : { type: 'amount', value: 0 };
  });

  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  const calculationData = useMemo(() => {
    const gstEnabled = !!restaurant?.gst_enabled;
    const pricesIncludeTax = !!restaurant?.prices_include_tax;
    const defaultRate = Number(restaurant?.default_tax_rate || 5);

    // 1. Prepare Items
    const calcItems = localItems.map(i => ({
         ...i,
         price: Number(i.price || 0),
         quantity: Number(i.quantity || 0),
         tax_rate: (i.tax_rate !== undefined && i.tax_rate !== null) ? Number(i.tax_rate) : null,
         is_packaged_good: !!i.is_packaged_good
    }));

    // 2. Prepare Profile
    const profile = {
        gst_enabled: gstEnabled,
        default_tax_rate: defaultRate,
        prices_include_tax: pricesIncludeTax,
        round_off_config: { 
            round_off_enabled: false // We use pre-roundoff total here
        }
    };

    // 3. Calculate
    const result = calculateOrderTotals(calcItems, discount, profile, loyaltyAmountUsed);

    // 4. Gross Total (Display only)
    let grossVal = 0;
    calcItems.forEach(i => {
         const q = Number(i.quantity || 0);
         const p = Number(i.price || 0);
         let r = 0;
         if (gstEnabled) {
            r = i.is_packaged_good ? (Number(i.tax_rate || 0) > 0 ? Number(i.tax_rate || 0) : defaultRate) : defaultRate;
         }
         
         if ((gstEnabled && (i.is_packaged_good || pricesIncludeTax)) || r === 0) {
             grossVal += p * q;
         } else {
             grossVal += p * q * (1 + r / 100);
         }
    });

    // 5. Total Discount Face Value (For UI consistency)
    let totalFaceDisc = result.order_discount_face_value || 0;
    calcItems.forEach(i => {
         const d = i.discount || { type: 'amount', value: 0 };
         if (d.type === 'amount') {
             totalFaceDisc += Number(d.value || 0);
         } else {
             const faceTotal = Number(i.price || 0) * Number(i.quantity || 0);
             totalFaceDisc += faceTotal * (Number(d.value || 0) / 100);
         }
    });

    return { 
        subtotalGross: result.subtotal_face_value,
        lineDiscountTotal: result.line_discount_total,
        subtotalEx: Number(result.subtotal_after_line_discounts || 0),
        taxableAmount: result.taxable_amount,
        finalTax: result.total_tax,
        totalTaxIncluded: result.total_tax_included,
        totalTaxAdded: result.total_tax_added,
        finalTotal: result.total_inc_tax, // Pre-roundoff
        orderDiscountFace: result.discount_amount,
        grossTotalInc: grossVal,
        totalDiscountFace: totalFaceDisc, 
        isAllPackaged: !!result.is_all_packaged
    };
  }, [localItems, discount, restaurant, loyaltyAmountUsed]);

  const { subtotalGross, lineDiscountTotal, subtotalEx, taxableAmount, finalTax, finalTotal, orderDiscountFace, grossTotalInc, totalDiscountFace, totalTaxIncluded, totalTaxAdded, isAllPackaged } = calculationData;

  const roundOffConfig = {
    round_off_enabled: restaurant?.round_off_enabled,
    round_off_mode: restaurant?.round_off_mode || 'automatic',
    round_off_auto_factor: Number(restaurant?.round_off_auto_factor || 1),
    round_off_manual_limit: Number(restaurant?.round_off_manual_limit || 10)
  };

  const factor = Number(roundOffConfig.round_off_auto_factor || 1.0);
  const autoRounded = roundOffConfig.round_off_enabled && roundOffConfig.round_off_mode === 'automatic' 
    ? Math.round(finalTotal / factor) * factor 
    : finalTotal;

  const [settledAmount, setSettledAmount] = useState(autoRounded);
  const [displayValue, setDisplayValue] = useState(autoRounded.toFixed(2));
  
  useEffect(() => {
    const nextF = Number(roundOffConfig.round_off_auto_factor || 1.0);
    const nextR = roundOffConfig.round_off_enabled && roundOffConfig.round_off_mode === 'automatic' 
      ? Math.round(finalTotal / nextF) * nextF 
      : finalTotal;
    setSettledAmount(nextR);
    setDisplayValue(nextR.toFixed(2));
  }, [finalTotal, roundOffConfig.round_off_enabled, roundOffConfig.round_off_mode, roundOffConfig.round_off_auto_factor]);

  const manualRoundOffValue = settledAmount - finalTotal;
  const totalSavings = grossTotalInc - finalTotal;
  const totalAppliedDiscount = (lineDiscountTotal || 0) + (orderDiscountFace || 0);
  
  const effectiveTotal = mode === 'collect'
      ? Math.max(0, settledAmount - (order.alreadyPaidAmount || 0) - loyaltyAmountUsed)
      : (mode === 'refund' ? Number(order.refundAmount ?? 0) : settledAmount);

  const calculateRemainingOnline = (cash, loyalty) => {
    const c = Number(cash || 0);
    const l = Number(loyalty || 0);
    const rem = Math.max(0, settledAmount - c - l);
    setOnlineAmount(rem.toFixed(2));
  };

  const handleUpdateLocalItem = (id, validItem) => {
     setLocalItems(prev => prev.map(p => p.cartId === id ? validItem : p));
  };

  const validateMixedPayment = () => {
    const c = Number(cashAmount || 0);
    const o = Number(onlineAmount || 0);
    const l = Number(loyaltyAmountUsed || 0);
    const sum = c + o + l;
    if (c < 0 || o < 0 || l < 0) { alert('Amounts cannot be negative'); return false; }
    if (c === 0 && o === 0 && l === 0) { alert('Enter at least one payment amount'); return false; }
    if (Math.abs(sum - settledAmount) > 0.01) { alert(`Split total must equal ₹${(settledAmount || 0).toFixed(2)}. Current: ₹${sum.toFixed(2)}`); return false; }
    return true;
  };

  const handleConfirm = async () => {
    if (submitting) return;
    try {
      setSubmitting(true);
      const common = {
        mode,
        discount_amount: orderDiscountFace,
        discount_obj: discount, 
        round_off_amount: manualRoundOffValue,
        updated_items: localItems,
        base_tax_rate: Number(restaurant?.default_tax_rate || 5),
        loyalty_amount_used: loyaltyAmountUsed,
        loyalty_points_used: loyaltyPointsUsed,
        override_totals: {
             total_amount: Number(settledAmount || 0).toFixed(2),
             total_inc_tax: Number(finalTotal || 0).toFixed(2),
             total_tax: Number(finalTax || 0).toFixed(2),
             subtotal_ex: Number(subtotalEx || 0).toFixed(2)
        }
      };

      if (paymentMethod === 'mixed') {
        if (!validateMixedPayment()) return;
        
        const mixedDetails = {
           cash_amount: Number(cashAmount).toFixed(2), 
           online_amount: Number(onlineAmount).toFixed(2), 
           online_method: onlineMethod,
           is_mixed: true
        };

        await onConfirm('mixed', { 
          ...common, 
          mixed_payment_details: mixedDetails
        });
      } else {
        await onConfirm(paymentMethod, common);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const titlePrefix = mode === 'collect' ? 'Payment Collection' : (mode === 'refund' ? 'Process Refund' : 'Complete Payment');

  const choiceBoxStyle = (active) => ({
    padding: '12px 10px',
    borderRadius: 14,
    border: `2px solid ${active ? BRAND.orange : '#f1f5f9'}`,
    background: active ? `${BRAND.orange}05` : 'white',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
    boxShadow: active ? `0 4px 12px ${BRAND.orange}20` : 'none',
    transform: active ? 'translateY(-2px)' : 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  });

  const handleMethodSelect = (method) => {
    setPaymentMethod(method);
    setShowMixedForm(method === 'mixed');
    if (method !== 'mixed') {
      setCashAmount('');
      setOnlineAmount('');
      setLoyaltyAmountUsed(0);
      setLoyaltyPointsUsed(0);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, padding: 12
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'white', width: '100%', maxWidth: 380,
          borderRadius: 20, padding: '24px 20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          maxHeight: '94vh', overflowY: 'auto',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>{titlePrefix}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>#{order.id.slice(0, 8)}</span>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#e2e8f0' }}></div>
            <span>{getOrderTypeLabel(order)}</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: `linear-gradient(135deg, ${BRAND.orange} 0%, #ea580c 100%)`,
            padding: '12px 16px', borderRadius: 14, marginTop: 16,
            boxShadow: `0 8px 16px -4px ${BRAND.orange}40`
          }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'white', textTransform: 'uppercase', opacity: 0.9 }}>Settled Total</span>
            <span style={{ fontSize: '20px', fontWeight: 900, color: 'white' }}>₹{settledAmount.toFixed(2)}</span>
          </div>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 16, padding: '16px', marginBottom: 16, border: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
            <span>Gross Total (Incl. Tax)</span>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>₹{grossTotalInc.toFixed(2)}</span>
          </div>
          
          {!isAllPackaged && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
               <span>Subtotal (Ex-Tax)</span>
               <span style={{ fontWeight: 700, color: '#0f172a' }}>₹{subtotalEx.toFixed(2)}</span>
            </div>
          )}

          {orderDiscountFace > 0.01 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#ef4444' }}>
              <span style={{ fontWeight: 600 }}>Bill Discount (-)</span>
              <span style={{ fontWeight: 700 }}>-₹{orderDiscountFace.toFixed(2)}</span>
            </div>
          )}

          <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0 8px' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#334155' }}>
            <span style={{ fontWeight: 600 }}>Taxable Value</span>
            <span style={{ fontWeight: 700 }}>₹{taxableAmount.toFixed(2)}</span>
          </div>

          {(totalTaxIncluded || 0) > 0.01 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
              <span>GST (incl)</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>₹{totalTaxIncluded.toFixed(2)}</span>
            </div>
          )}

          {(totalTaxAdded || 0) > 0.01 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
              <span>GST (+)</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>₹{totalTaxAdded.toFixed(2)}</span>
            </div>
          )}
          
          {Math.abs(manualRoundOffValue) > 0.001 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 13, color: manualRoundOffValue > 0 ? '#16a34a' : '#ef4444' }}>
              <span style={{ fontWeight: 600 }}>Round Off</span>
              <span style={{ fontWeight: 700 }}>{manualRoundOffValue > 0 ? '+' : ''}₹{manualRoundOffValue.toFixed(2)}</span>
            </div>
          )}
        </div>

        {mode === 'collect' && (
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            {totalAppliedDiscount > 0.01 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}>
                 <span style={{ fontWeight: 600, color: '#0f172a' }}>
                    Discount Applied <span style={{ color: '#ea580c' }}>(-₹{totalAppliedDiscount.toFixed(2)})</span>
                 </span>
                 <span onClick={() => setIsDiscountModalOpen(true)} style={{ fontWeight: 700, color: '#ea580c', cursor: 'pointer', textDecoration: 'underline' }}>Edit</span>
              </div>
            ) : (
              <div onClick={() => setIsDiscountModalOpen(true)} style={{ fontSize: 14, color: BRAND.orange, cursor: 'pointer', fontWeight: 800, textDecoration: 'underline', display: 'inline-block' }}>
                + Add Discount
              </div>
            )}
          </div>
        )}

        {roundOffConfig.round_off_enabled && roundOffConfig.round_off_mode === 'manual' && mode === 'collect' && (
          <div style={{ padding: '16px', background: '#fff7ed', borderRadius: 16, border: `1.5px solid ${BRAND.orange}20`, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: BRAND.orange, textTransform: 'uppercase' }}>Received Amount</label>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>Limit: ±₹{roundOffConfig.round_off_manual_limit.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, height: 44, display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 10, border: '2px solid #e2e8f0', padding: '0 12px' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#94a3b8' }}>₹</span>
                <input type="number" step="0.01" value={displayValue} onChange={e => {
                  const raw = e.target.value; 
                  setDisplayValue(raw);
                  const val = Number(raw);
                  if (!isNaN(val)) {
                    setSettledAmount(val);
                  }
                }} onBlur={() => setDisplayValue(settledAmount.toFixed(2))} style={{ flex: 1, border: 'none', outline: 'none', fontSize: 16, fontWeight: 700, height: '100%', padding: 0, marginLeft: 6, width: '100%' }} />
              </div>
              <button onClick={() => { setSettledAmount(autoRounded); setDisplayValue(autoRounded.toFixed(2)); }} style={{ height: 44, background: '#fff', border: '2px solid #e2e8f0', color: '#64748b', padding: '0 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Reset</button>
            </div>
            {Math.abs(settledAmount - finalTotal) > roundOffConfig.round_off_manual_limit + 0.01 && (
              <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 700, marginTop: 8, textAlign: 'center' }}>
                Round-off exceeds the limit of ±₹{roundOffConfig.round_off_manual_limit.toFixed(2)}
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>Payment Method</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
          {['cash', 'online', mode !== 'refund' ? 'mixed' : null].filter(Boolean).map(m => (
            <div key={m} onClick={() => handleMethodSelect(m)} style={choiceBoxStyle(paymentMethod === m)}>
              <div style={{ fontSize: 24 }}>{m === 'cash' ? '💵' : (m === 'online' ? '💳' : '🔀')}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: paymentMethod === m ? BRAND.orange : '#64748b', textTransform: 'capitalize' }}>{m}</div>
            </div>
          ))}
        </div>

        {showMixedForm && (
          <div style={{ background: '#f8fafc', padding: '18px 16px', borderRadius: 18, border: '2px solid #e2e8f0', marginBottom: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
               {/* Loyalty Column (Only if Customer is assigned and loyalty program is active) */}
               {order.customer_id && loyaltyData.conversionRate > 0 && (
                 <div style={{ gridColumn: 'span 2', marginBottom: 4 }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '11px', fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      <span>🪙 Loyalty Points</span>
                      <span style={{ opacity: 0.8 }}>Available: {loyaltyData.availablePoints}</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min="0"
                        max={loyaltyData.availablePoints}
                        value={loyaltyPointsUsed || ''}
                        placeholder="Enter points to redeem"
                        onChange={(e) => {
                          let pts = parseInt(e.target.value, 10) || 0;
                          if (pts > (loyaltyData.availablePoints || 0)) pts = loyaltyData.availablePoints || 0;

                          let amt = Number((pts * (loyaltyData.conversionRate || 1.0)).toFixed(2));
                          if (loyaltyData.maxRedemption > 0 && amt > loyaltyData.maxRedemption) {
                              amt = loyaltyData.maxRedemption;
                              pts = Math.floor(amt / (loyaltyData.conversionRate || 1.0));
                          }

                          setLoyaltyPointsUsed(pts);
                          setLoyaltyAmountUsed(amt);
                          calculateRemainingOnline(cashAmount, amt);
                        }}
                        style={{ width: '100%', padding: '12px', borderRadius: 10, border: '2px solid #10b98140', fontSize: 15, fontWeight: 700, background: '#ecfdf5', outline: 'none', transition: 'all 0.2s' }}
                      />
                      {loyaltyAmountUsed > 0 && (
                        <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 800, color: '#059669' }}>
                          = ₹{loyaltyAmountUsed.toFixed(2)}
                        </div>
                      )}
                    </div>
                    {(loyaltyData.availablePoints || 0) < (loyaltyData.minPoints || 0) && (loyaltyData.availablePoints || 0) > 0 && (
                        <div style={{ fontSize: '10px', color: '#ef4444', marginTop: 4, fontWeight: 600 }}>
                            Min {loyaltyData.minPoints} points required for redemption.
                        </div>
                    )}
                    {loyaltyData.maxRedemption > 0 && (
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: 4, fontWeight: 600 }}>
                            Max ₹{loyaltyData.maxRedemption.toFixed(2)} can be redeemed per order.
                        </div>
                    )}
                 </div>
               )}

              <div>
                <label style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Cash (₹)</label>
                <input type="number" value={cashAmount} onChange={e => { const val = e.target.value; setCashAmount(val); const c = Number(val); if (!isNaN(c)) calculateRemainingOnline(c, loyaltyAmountUsed); }} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 15, fontWeight: 700, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Online (₹)</label>
                <input type="number" value={onlineAmount} onChange={e => setOnlineAmount(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 15, fontWeight: 700, outline: 'none' }} />
              </div>
            </div>

            <div style={{
                background: `#f0fdf4`,
                padding: '12px 14px',
                borderLeft: `4px solid #16a34a`,
                borderRadius: 8,
                fontSize: '12px',
                fontWeight: 700,
                color: '#1e293b',
                marginBottom: 16,
                boxShadow: '0 2px 4px rgba(22, 163, 74, 0.05)'
            }}>
                Total ₹{(settledAmount || 0).toFixed(2)} → 
                {loyaltyAmountUsed > 0 && ` ₹${Number(loyaltyAmountUsed).toFixed(2)} (Pts) + `}
                ₹{cashAmount || 0} (Cash) + 
                ₹{onlineAmount || 0} ({onlineMethod?.toUpperCase() || ''})
            </div>

            <label style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Online Method</label>
            <NiceSelect value={onlineMethod} onChange={setOnlineMethod} options={[{ value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }]} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <Button onClick={onCancel} variant="outline" style={{ flex: 1, height: 52, borderRadius: 14, fontSize: 15, fontWeight: 700, borderColor: '#e2e8f0' }}>Cancel</Button>
          <Button 
            onClick={handleConfirm} 
            disabled={submitting || (roundOffConfig.round_off_enabled && roundOffConfig.round_off_mode === 'manual' && Math.abs(settledAmount - finalTotal) > roundOffConfig.round_off_manual_limit + 0.01)}
            style={{ flex: 1.6, height: 52, borderRadius: 14, background: `linear-gradient(135deg, ${BRAND.orange} 0%, #ea580c 100%)`, color: 'white', fontSize: 15, fontWeight: 800, boxShadow: `0 8px 24px -6px ${BRAND.orange}60`, border: 'none' }}
          >
            Settle & Finish
          </Button>
        </div>

        <DiscountModal visible={isDiscountModalOpen} onClose={() => setIsDiscountModalOpen(false)} onSaveTotal={setDiscount} cart={localItems} onUpdateCartItem={handleUpdateLocalItem} currentTotalDiscount={discount} theme={THEME} totalAmount={subtotalEx} />
      </div>
    </div>
  );
}
