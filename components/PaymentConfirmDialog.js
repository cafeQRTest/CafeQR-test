 import React, { useState, useEffect, useMemo } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useRestaurant } from '../context/RestaurantContext';
import { getSupabase } from '../services/supabase';
import { calculateOrderTotals } from '../utils/orderCalculations';
import Button from './ui/Button';
import DiscountModal from './DiscountModal';
import NiceSelect from './NiceSelect';

const BRAND = {
  orange: '#ea580c',
  orangeLight: '#fff7ed',
  orangeDark: '#c2410c',
  white: '#ffffff',
  slate: '#f8fafc',
  gray: '#64748b',
  border: '#e2e8f0',
  success: '#10b981',
  danger: '#ef4444',
  dark: '#1e293b',
  accent: '#f97316'
};

const shimmer = keyframes`
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
`;

const Overlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 12px;
`;

const Container = styled(motion.div)`
  background: white;
  width: 100%;
  max-width: 360px;
  border-radius: 20px;
  padding: 0;
  box-shadow: 0 40px 60px -15px rgba(0, 0, 0, 0.15);
  max-height: 94vh;
  overflow-y: auto;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.8);
  
  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 10px;
  }
  &:hover::-webkit-scrollbar-thumb {
    background: #cbd5e1;
  }
`;

const Header = styled.div`
  padding: 20px 20px 0;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 900;
  color: ${BRAND.dark};
  margin: 0;
  letter-spacing: -0.03em;
`;

const OrderRef = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  .id { color: ${BRAND.orange}; }
`;

const BillingBanner = styled(motion.div)`
  margin: 10px 16px;
  background: linear-gradient(135deg, ${BRAND.orange} 0%, ${BRAND.orangeDark} 100%);
  padding: 18px;
  border-radius: 16px;
  color: white;
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 20px -5px rgba(234, 88, 12, 0.3);

  &::before {
    content: '';
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    animation: ${shimmer} 2s infinite;
  }
`;

const BannerLabel = styled.div`
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  opacity: 0.7;
  margin-bottom: 4px;
`;

const BannerTotal = styled.div`
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -0.02em;
  display: flex;
  align-items: baseline;
  gap: 4px;
  
  span.currency { font-size: 18px; opacity: 0.6; }
`;

const ReceiptSection = styled.div`
  background: ${BRAND.slate};
  margin: 0 16px 16px;
  padding: 16px;
  border-radius: 20px;
  border: 1.5px dashed #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #64748b;
  font-weight: 600;

  span.val { color: ${BRAND.dark}; font-weight: 800; }
  &.saving { color: ${BRAND.success}; span.val { color: ${BRAND.success}; } }
  &.tax { color: #94a3b8; }
`;

const Divider = styled.div`
  height: 1.5px;
  background: #e2e8f0;
  margin: 4px 0;
`;

const ActionCard = styled.div`
  padding: 0 20px 24px;
`;

const PaymentTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
`;

const Tab = styled(motion.button)`
  border: 1.5px solid ${props => props.active ? BRAND.orange : '#f1f5f9'};
  background: ${props => props.active ? BRAND.orangeLight : 'white'};
  padding: 12px 6px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s;
  outline: none;

  .icon { font-size: 18px; }
  .label { font-size: 10px; font-weight: 800; color: ${props => props.active ? BRAND.orange : '#94a3b8'}; text-transform: uppercase; }
`;

const MixedPanel = styled(motion.div)`
  background: #f8fafc;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;

  label { font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; padding-left: 2px; }
  
  .input-box {
    position: relative;
    display: flex;
    align-items: center;
    
    .symbol { position: absolute; left: 10px; font-weight: 800; color: #cbd5e1; font-size: 13px; }
    input {
      width: 100%;
      padding: 8px 8px 8px 24px;
      border-radius: 10px;
      border: 2px solid #e2e8f0;
      font-size: 14px;
      font-weight: 800;
      color: ${BRAND.dark};
      transition: all 0.2s;
      
      &:focus { border-color: ${BRAND.orange}; outline: none; }
    }
  }
`;

const SummaryPill = styled.div`
  background: white;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-align: center;
  
  strong { color: ${BRAND.success}; }
`;

const ManualRoundBox = styled(motion.div)`
  padding: 12px;
  background: #f8fafc;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  margin-bottom: 12px;
`;


const SettleBtn = styled(motion.button)`
  flex: 1.6;
  height: 52px;
  border-radius: 14px;
  background: ${BRAND.orange};
  color: white;
  font-size: 15px;
  font-weight: 900;
  border: none;
  cursor: pointer;
  box-shadow: 0 12px 24px -8px rgba(234, 88, 12, 0.4);
  
  &:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }
`;

const CancelBtn = styled(motion.button)`
  flex: 1;
  height: 52px;
  border-radius: 14px;
  border: 2px solid ${BRAND.border};
  background: white;
  color: #64748b;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
`;


function getOrderTypeLabel(o) {
  if (!o) return '';
  if (o.table_number) return `Table ${o.table_number}`;
  if (o.order_type === 'parcel') return 'Parcel';
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
        const { data: cust } = await s
          .from('v_owner_customers')
          .select('loyalty_points, loyalty_program_id')
          .eq('customer_id', order.customer_id)
          .maybeSingle();
        
        if (!cust) return;

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
      if (Number(order.total_discount_percent || 0) > 0.01) {
          return { type: 'percent', value: Number(order.total_discount_percent) };
      }
      let dVal = Number(order.discount_amount || 0);
      return dVal > 0 ? { type: 'amount', value: dVal } : { type: 'amount', value: 0 };
  });

  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  const handleUpdateLocalItem = (id, validItem) => {
     setLocalItems(prev => prev.map(p => (p.cartId === id || p.id === id) ? validItem : p));
  };

  const THEME = { main: BRAND.orange, soft: BRAND.orangeLight, light: '#fed7aa' };

  const calculationData = useMemo(() => {
    const gstEnabled = !!restaurant?.gst_enabled;
    const profile = {
        gst_enabled: gstEnabled,
        default_tax_rate: Number(restaurant?.default_tax_rate || 5),
        prices_include_tax: !!restaurant?.prices_include_tax,
        round_off_config: { round_off_enabled: false }
    };
    const result = calculateOrderTotals(localItems, discount, profile, loyaltyAmountUsed);
    
    let grossVal = 0;
    localItems.forEach(i => {
         const q = Number(i.quantity || 0);
         const p = Number(i.price || 0);
         grossVal += p * q;
    });

    return { 
        ...result,
        grossTotalInc: grossVal,
        order_discount_total: result.discount_amount,
        finalTotal: result.total_inc_tax,
        finalTax: result.total_tax,
        subtotalEx: Number(result.subtotal_after_line_discounts || 0),
        taxableAmount: result.taxable_amount,
        isAllPackaged: !!result.is_all_packaged
    };
  }, [localItems, discount, restaurant, loyaltyAmountUsed]);

  const { finalTotal, finalTax, taxableAmount, order_discount_total, totalTaxIncluded, totalTaxAdded, grossTotalInc, subtotalEx, isAllPackaged } = calculationData;

  const roundOffFactor = Number(restaurant?.round_off_auto_factor || 1.0);
  const autoRounded = restaurant?.round_off_enabled && restaurant?.round_off_mode === 'automatic' 
    ? Math.round(finalTotal / roundOffFactor) * roundOffFactor 
    : finalTotal;

  const [settledAmount, setSettledAmount] = useState(autoRounded);
  const [displayValue, setDisplayValue] = useState(autoRounded.toFixed(2));
  
  useEffect(() => {
    const nextR = restaurant?.round_off_enabled && restaurant?.round_off_mode === 'automatic' 
      ? Math.round(finalTotal / roundOffFactor) * roundOffFactor 
      : finalTotal;
    setSettledAmount(nextR);
    setDisplayValue(nextR.toFixed(2));
  }, [finalTotal, restaurant?.round_off_enabled, restaurant?.round_off_mode, roundOffFactor]);

  const manualRoundOffValue = settledAmount - finalTotal;

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

  const handleConfirm = async () => {
    if (submitting) return;
    try {
      setSubmitting(true);
      const common = {
        mode,
        discount_amount: order_discount_total,
        discount_obj: discount, 
        round_off_amount: manualRoundOffValue,
        updated_items: localItems,
        base_tax_rate: Number(restaurant?.default_tax_rate || 5),
        loyalty_amount_used: loyaltyAmountUsed,
        loyalty_points_used: loyaltyPointsUsed,
        override_totals: {
             total_amount: settledAmount.toFixed(2),
             total_inc_tax: finalTotal.toFixed(2),
             total_tax: finalTax.toFixed(2),
             subtotal_ex: subtotalEx.toFixed(2)
        }
      };

      if (paymentMethod === 'mixed') {
        const c = Number(cashAmount || 0);
        const o = Number(onlineAmount || 0);
        const l = Number(loyaltyAmountUsed || 0);
        if (Math.abs(c + o + l - settledAmount) > 0.01) {
            alert(`Split total must equal ₹${settledAmount.toFixed(2)}`);
            return;
        }
        await onConfirm('mixed', { 
          ...common, 
          mixed_payment_details: {
             cash_amount: c.toFixed(2), 
             online_amount: o.toFixed(2), 
             online_method: onlineMethod,
             is_mixed: true
          }
        });
      } else {
        await onConfirm(paymentMethod, common);
      }
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <AnimatePresence>
      <Overlay initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}>
        <Container 
          initial={{ scale: 0.9, opacity: 0, y: 30 }} 
          animate={{ scale: 1, opacity: 1, y: 0 }} 
          exit={{ scale: 0.9, opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          onClick={e => e.stopPropagation()}
        >
          <Header>
            <Title>Payment Collection</Title>
            <OrderRef>
              <span className="id">#{order.id.slice(-8).toUpperCase()}</span>
              <div style={{ width: 4, height: 4, borderRadius: '2px', background: '#e2e8f0' }} />
              <span>{getOrderTypeLabel(order)}</span>
            </OrderRef>
          </Header>

          <BillingBanner whileHover={{ scale: 1.01 }}>
            <BannerLabel>SETTLED TOTAL</BannerLabel>
            <BannerTotal>
              <span className="currency">₹</span>
              {settledAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </BannerTotal>
          </BillingBanner>

          <ReceiptSection>
            <Row>
              <span>Gross Total (Incl. Tax)</span>
              <span className="val">₹{calculationData.line_subtotal.toFixed(2)}</span>
            </Row>
            <Row>
              <span>Subtotal (Ex-Tax)</span>
              <span className="val">₹{calculationData.subtotal_base_ex_tax.toFixed(2)}</span>
            </Row>
            {order_discount_total > 0 && (
              <Row style={{ color: BRAND.danger }}>
                <span>Bill Discount (-)</span>
                <span className="val">-₹{order_discount_total.toFixed(2)}</span>
              </Row>
            )}
            <Divider />
            <Row>
              <span>Taxable Value</span>
              <span className="val">₹{taxableAmount.toFixed(2)}</span>
            </Row>
            <Row>
              <span>GST (+)</span>
              <span className="val">₹{finalTax.toFixed(2)}</span>
            </Row>
            {Math.abs(manualRoundOffValue) > 0.001 && (
              <Row style={{ color: manualRoundOffValue > 0 ? BRAND.success : BRAND.danger }}>
                <span>Round Off</span>
                <span className="val">{manualRoundOffValue > 0 ? '+' : ''}₹{manualRoundOffValue.toFixed(2)}</span>
              </Row>
            )}
          </ReceiptSection>

          <ActionCard>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              {order_discount_total > 0 ? (
                <span style={{ fontSize: 13, fontWeight: 800, color: BRAND.orange }}>
                  Discount Applied (-₹{order_discount_total.toFixed(2)}){' '}
                  <u 
                    style={{ cursor: 'pointer', marginLeft: 4 }} 
                    onClick={() => setIsDiscountModalOpen(true)}
                  >
                    Edit
                  </u>
                </span>
              ) : (
                <span 
                  onClick={() => setIsDiscountModalOpen(true)}
                  style={{ fontSize: 13, fontWeight: 800, color: BRAND.orange, textDecoration: 'underline', cursor: 'pointer' }}
                >
                  + Add Discount
                </span>
              )}
            </div>

            {restaurant?.round_off_enabled && restaurant?.round_off_mode === 'manual' && mode === 'collect' && (
              <ManualRoundBox initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 10, fontWeight: 900, color: BRAND.orange, textTransform: 'uppercase' }}>
                  <span>Received Amt</span>
                  <span style={{ opacity: 0.6 }}>Limit: ±{restaurant.round_off_manual_limit}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: 12, fontWeight: 900, color: '#94a3b8' }}>₹</span>
                    <input 
                      type="number" step="0.01" value={displayValue} 
                      onChange={e => { setDisplayValue(e.target.value); const v = Number(e.target.value); if (!isNaN(v)) setSettledAmount(v); }} 
                      onBlur={() => setDisplayValue(settledAmount.toFixed(2))}
                      style={{ width: '100%', padding: '8px 8px 8px 24px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', fontWeight: 800, outline: 'none' }} 
                    />
                  </div>
                  <button onClick={() => { setSettledAmount(autoRounded); setDisplayValue(autoRounded.toFixed(2)); }} style={{ padding: '0 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer', color: '#64748b' }}>Reset</button>
                </div>
              </ManualRoundBox>
            )}

            <PaymentTabs>
              {[
                { id: 'cash', icon: '💵', label: 'Cash' },
                { id: 'online', icon: '💳', label: 'Online' },
                { id: 'mixed', icon: '🔀', label: 'Mixed' }
              ].map(m => (
                <Tab 
                  key={m.id} 
                  active={paymentMethod === m.id} 
                  onClick={() => handleMethodSelect(m.id)}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="icon">{m.icon}</span>
                  <span className="label">{m.label}</span>
                </Tab>
              ))}
            </PaymentTabs>

            {showMixedForm && (
              <MixedPanel initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {order.customer_id && loyaltyData.conversionRate > 0 && (
                  <Field>
                    <label>Redeem Loyalty (Avail: {loyaltyData.availablePoints})</label>
                    <div className="input-box">
                      <span className="symbol">🪙</span>
                      <input 
                        type="number" 
                        value={loyaltyPointsUsed || ''} 
                        onChange={(e) => {
                          let pts = parseInt(e.target.value) || 0;
                          pts = Math.min(pts, loyaltyData.availablePoints);
                          let amt = pts * loyaltyData.conversionRate;
                          if (loyaltyData.maxRedemption > 0) amt = Math.min(amt, loyaltyData.maxRedemption);
                          
                          setLoyaltyPointsUsed(pts);
                          setLoyaltyAmountUsed(amt);
                          
                          // Auto-allocate remaining to Online by default
                          const rem = Math.max(0, settledAmount - amt - Number(cashAmount || 0));
                          setOnlineAmount(rem > 0 ? rem.toFixed(2) : '');
                        }}
                        style={{ background: '#ecfdf5', borderColor: '#10b98130' }}
                      />
                      {loyaltyAmountUsed > 0 && <span style={{ position: 'absolute', right: 12, fontSize: 12, fontWeight: 900, color: BRAND.success }}>₹{loyaltyAmountUsed.toFixed(2)}</span>}
                    </div>
                  </Field>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field>
                    <label>Cash</label>
                    <div className="input-box">
                      <span className="symbol">₹</span>
                      <input 
                        type="number" 
                        value={cashAmount} 
                        onChange={e => {
                          const val = e.target.value;
                          setCashAmount(val);
                          const num = Number(val) || 0;
                          const rem = Math.max(0, settledAmount - num - loyaltyAmountUsed);
                          setOnlineAmount(rem > 0 ? rem.toFixed(2) : '');
                        }} 
                      />
                    </div>
                  </Field>
                  <Field>
                    <label>Online</label>
                    <div className="input-box">
                      <span className="symbol">₹</span>
                      <input 
                        type="number" 
                        value={onlineAmount} 
                        onChange={e => {
                          const val = e.target.value;
                          setOnlineAmount(val);
                          const num = Number(val) || 0;
                          const rem = Math.max(0, settledAmount - num - loyaltyAmountUsed);
                          setCashAmount(rem > 0 ? rem.toFixed(2) : '');
                        }} 
                      />
                    </div>
                  </Field>
                </div>
                <SummaryPill>
                  Collection: <strong>₹{(Number(cashAmount||0) + Number(onlineAmount||0) + Number(loyaltyAmountUsed||0)).toFixed(2)}</strong> / ₹{settledAmount.toFixed(2)}
                </SummaryPill>

              </MixedPanel>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <CancelBtn onClick={onCancel} whileTap={{ scale: 0.98 }}>Cancel</CancelBtn>
              <SettleBtn 
                onClick={handleConfirm} 
                disabled={submitting || (restaurant?.round_off_enabled && restaurant?.round_off_mode === 'manual' && Math.abs(settledAmount - finalTotal) > Number(restaurant?.round_off_manual_limit || 0) + 0.01)} 
                whileTap={{ scale: 0.98 }}
              >
                {submitting ? 'Settling...' : 'Settle & Finish'}
              </SettleBtn>
            </div>
          </ActionCard>
        </Container>

        <DiscountModal 
          visible={isDiscountModalOpen} onClose={() => setIsDiscountModalOpen(false)} onSaveTotal={setDiscount} 
          cart={localItems} onUpdateCartItem={handleUpdateLocalItem} currentTotalDiscount={discount} 
          theme={THEME} totalAmount={subtotalEx} 
        />
      </Overlay>
    </AnimatePresence>
  );
}
