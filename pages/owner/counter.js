// pages/owner/counter.js

import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import { getSupabase } from '../../services/supabase';
import KotPrint from '../../components/KotPrint';

// -------------------------------
// Inline Payment Confirm Dialog
// -------------------------------
function PaymentConfirmDialog({ amount, onConfirm, onCancel, busy = false }) {
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showMixedForm, setShowMixedForm] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');
  const [onlineMethod, setOnlineMethod] = useState('upi');
  const [submitting, setSubmitting] = useState(false);

  const total = Number(amount || 0);
  const disabled = busy || submitting;

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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div style={{background:'#fff',padding:20,borderRadius:8,maxWidth:460,width:'92%',maxHeight:'90vh',overflowY:'auto'}}>
        <h3 style={{margin:'0 0 10px'}}>Payment Confirmation</h3>
        <p><strong>Amount: ₹{total.toFixed(2)}</strong></p>
        <div style={{display:'flex',flexDirection:'column',gap:10,margin:'12px 0'}}>
          <label style={{display:'flex',gap:10,alignItems:'center',padding:10,border:paymentMethod==='cash'?'2px solid #2563eb':'1px solid #e5e7eb',borderRadius:6,cursor:'pointer',background:paymentMethod==='cash'?'#eff6ff':'#fff'}}>
            <input type="radio" value="cash" checked={paymentMethod==='cash'} onChange={(e)=>handleMethodSelect(e.target.value)} />
            <span>💵 Cash</span>
          </label>

          <label style={{display:'flex',gap:10,alignItems:'center',padding:10,border:paymentMethod==='online'?'2px solid #2563eb':'1px solid #e5e7eb',borderRadius:6,cursor:'pointer',background:paymentMethod==='online'?'#eff6ff':'#fff'}}>
            <input type="radio" value="online" checked={paymentMethod==='online'} onChange={(e)=>handleMethodSelect(e.target.value)} />
            <span>🔗 Online (UPI/Card)</span>
          </label>

          <label style={{display:'flex',gap:10,alignItems:'center',padding:10,border:paymentMethod==='mixed'?'2px solid #2563eb':'1px solid #e5e7eb',borderRadius:6,cursor:'pointer',background:paymentMethod==='mixed'?'#eff6ff':'#fff'}}>
            <input type="radio" value="mixed" checked={paymentMethod==='mixed'} onChange={(e)=>handleMethodSelect(e.target.value)} />
            <span>🔀 Mixed (Cash + Online)</span>
          </label>
        </div>

        {showMixedForm && (
          <div style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:8,padding:12,marginBottom:10}}>
            <div style={{display:'grid',gap:10}}>
              <div>
                <label>Cash Amount (₹)</label>
                <input type="number" min="0" step="0.01" value={cashAmount} onChange={(e)=>setCashAmount(e.target.value)} style={{width:'100%'}} />
              </div>
              <div>
                <label>Online Amount (₹)</label>
                <input type="number" min="0" step="0.01" value={onlineAmount} onChange={(e)=>setOnlineAmount(e.target.value)} style={{width:'100%'}} />
              </div>
              <div>
                <label>Online Method</label>
                <select value={onlineMethod} onChange={(e)=>setOnlineMethod(e.target.value)} style={{width:'100%'}}>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="netbanking">Net Banking</option>
                  <option value="wallet">Wallet</option>
                </select>
              </div>
              <div style={{background:'#eff6ff',padding:8,borderLeft:'4px solid #2563eb',borderRadius:4}}>
                Total ₹{total.toFixed(2)} → ₹{cashAmount||0} + ₹{onlineAmount||0} ({onlineMethod.toUpperCase()})
              </div>
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:10,marginTop:10}}>
          <button
            onClick={handleConfirm}
            disabled={disabled}
            style={{flex:1,background: disabled ? '#6ee7b7' : '#10b981',opacity: disabled ? 0.7 : 1,color:'#fff',border:'none',padding:10,borderRadius:6,cursor: disabled ? 'not-allowed' : 'pointer'}}
          >
            {disabled ? 'Processing…' : 'Confirm'}
          </button>
          <button
            onClick={onCancel}
            disabled={disabled}
            style={{flex:1,background:'#fff',border:'1px solid #d1d5db',padding:10,borderRadius:6,cursor: disabled ? 'not-allowed' : 'pointer',opacity: disabled ? 0.7 : 1}}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------
// Counter Sale Page
// -------------------------------
export default function CounterSale() {
  const supabase = getSupabase();
  const { checking } = useRequireAuth(supabase);
  const { restaurant, loading: loadingRestaurant } = useRestaurant();
  const router = useRouter();
  const restaurantId = restaurant?.id;

  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Credit mode
  const [isCreditSale, setIsCreditSale] = useState(false);
  const [creditCustomers, setCreditCustomers] = useState([]);
  const [selectedCreditCustomerId, setSelectedCreditCustomerId] = useState('');
  const [creditCustomerBalance, setCreditCustomerBalance] = useState(0);
  const [showNewCreditCustomer, setShowNewCreditCustomer] = useState(false);

  const [orderSelect, setOrderSelect] = useState('');
  const [processing, setProcessing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const [printOrder, setPrintOrder] = useState(null);

  // NEW: Order mode toggle
  const [orderMode, setOrderMode] = useState('kitchen');

  // NEW: profile tax settings for client‑side totals
  const [profileTax, setProfileTax] = useState({
    gst_enabled: false,
    default_tax_rate: 0,
    prices_include_tax: true
  });

  const menuMapRef = useRef(new Map());

  // Helpers
  const cacheMenuIntoMap = (list) => {
    const m = new Map();
    list.forEach((r) => m.set(r.id, r));
    menuMapRef.current = m;
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

  async function fetchFullOrder(orderId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(name))')
      .eq('id', orderId)
      .single();
    return error ? null : data;
  }

  // Startup loads
  useEffect(() => {
    if (checking || loadingRestaurant || !restaurantId) return;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data: menu, error: menuErr } = await supabase
          .from('menu_items')
          .select('id,name,price,category,veg,status,hsn,tax_rate,is_packaged_good,code_number')
          .eq('restaurant_id', restaurantId)
          .order('category')
          .order('name');
        if (menuErr) throw menuErr;
        setMenuItems(menu || []);
        cacheMenuIntoMap(menu || []);

        // Pull tax settings for client calc
        const { data: profile, error: profErr } = await supabase
          .from('restaurant_profiles')
          .select('tables_count,gst_enabled,default_tax_rate,prices_include_tax')
          .eq('restaurant_id', restaurantId)
          .limit(1)
          .maybeSingle();
        if (profErr) throw profErr;

        const count = profile?.tables_count || 0;
        setTables(Array.from({ length: count }, (_, i) => String(i + 1)));

        setProfileTax({
          gst_enabled: !!profile?.gst_enabled,
          default_tax_rate: Number(profile?.default_tax_rate ?? 0),
          prices_include_tax: !!profile?.prices_include_tax
        });

        await loadCreditCustomers();
      } catch (e) {
        setError(e.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    })();
  }, [checking, loadingRestaurant, restaurantId, supabase]);

  const loadCreditCustomers = async () => {
    const { data, error: err } = await supabase
      .from('credit_customers')
      .select('id, name, phone, current_balance, status')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active')
      .order('name');
    if (!err && data) setCreditCustomers(data);
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
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('❌ Please enter name and phone');
      setTimeout(() => setError(''), 3000);
      return;
    }
    const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
    if (!phoneRegex.test(customerPhone)) {
      setError('❌ Please enter a valid phone number');
      setTimeout(() => setError(''), 3000);
      return;
    }
    try {
      const { data: existing } = await supabase
        .from('credit_customers')
        .select('id, name')
        .eq('restaurant_id', restaurantId)
        .eq('phone', customerPhone.trim())
        .single();

      if (existing) {
        setError(`❌ Customer "${existing.name}" already exists with this phone number`);
        setTimeout(() => setError(''), 3000);
        return;
      }

      const { data, error: err } = await supabase
        .from('credit_customers')
        .insert({
          restaurant_id: restaurantId,
          name: customerName.trim(),
          phone: customerPhone.trim(),
          current_balance: 0,
          total_credit_extended: 0,
          status: 'active',
        })
        .select()
        .single();

      if (err) {
        if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
          setError('❌ This phone number is already registered');
        } else {
          setError(`❌ Failed to create customer: ${err.message}`);
        }
        setTimeout(() => setError(''), 3000);
        return;
      }

      setCreditCustomers([...creditCustomers, data]);
      setSelectedCreditCustomerId(data.id);
      setCreditCustomerBalance(0);
      setShowNewCreditCustomer(false);
      setCustomerName('');
      setCustomerPhone('');
      setSuccess(`✅ Customer "${data.name}" created successfully`);
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      console.error('Error creating customer:', err);
      setError(`❌ Error: ${err.message || 'Failed to create customer'}`);
      setTimeout(() => setError(''), 3000);
    }
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return menuItems.filter((item) => {
      if (filterMode === 'veg' && !item.veg) return false;
      if (filterMode === 'popular' && !item.popular) return false;
      return !q || item.name.toLowerCase().includes(q) || (item.code_number || '').toLowerCase().includes(q);
    });
  }, [menuItems, filterMode, searchQuery]);

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
    setCart((prev) => {
      const ex = prev.find((c) => c.id === item.id);
      return ex
        ? prev.map((c) => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))
        : [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateCartItem = (id, qty) => {
    if (qty <= 0) setCart((p) => p.filter((c) => c.id !== id));
    else setCart((p) => p.map((c) => (c.id === id ? { ...c, quantity: qty } : c)));
  };

  // Create + finalize (settle now)
  async function doCreateAndFinalizeOrder(finalPaymentMethod, mixedDetails, finalizeNow = false) {
    let order_type = 'counter';
    let table_number = null;
    if (orderSelect === 'parcel') order_type = 'parcel';
    else if (orderSelect && orderSelect.startsWith('table:')) table_number = orderSelect.split(':')[1] || null;

    const items = cart.map((i) => ({
      id: i.id, name: i.name, price: i.price, quantity: i.quantity,
      hsn: i.hsn, tax_rate: i.tax_rate, is_packaged_good: i.is_packaged_good, code_number: i.code_number
    }));

    const isCredit = isCreditSale;

    const orderData = {
      restaurant_id: restaurantId,
      order_type,
      table_number,
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim() || null,
      payment_method: isCredit ? 'credit' : finalPaymentMethod,
      payment_status: isCredit ? 'pending' : 'completed',
      items,
      is_credit: isCredit,
      credit_customer_id: isCredit ? selectedCreditCustomerId : null,
      original_payment_method: isCredit ? null : finalPaymentMethod,
      ...(finalPaymentMethod === 'mixed' && mixedDetails ? { mixed_payment_details: mixedDetails } : {}),
    };

    const res = await fetch('/api/orders/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData)
    });
    if (!res.ok) throw new Error('Failed to create order');
    const result = await res.json();

    if (!isCredit || finalizeNow) {
      await supabase
        .from('orders')
        .update({
          status: 'completed',
          payment_method: finalPaymentMethod,
          actual_payment_method: finalPaymentMethod,
          ...(mixedDetails ? { mixed_payment_details: mixedDetails } : {}),
        })
        .eq('id', result.order_id)
        .eq('restaurant_id', restaurantId);
    }

    const invRes = await fetch('/api/invoices/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: result.order_id,
        payment_method: isCredit ? 'credit' : finalPaymentMethod,
        is_credit: isCredit,
        credit_customer_id: isCredit ? selectedCreditCustomerId : null,
        mixed_payment_details: finalPaymentMethod === 'mixed' ? mixedDetails : null
      })
    });
    if (!invRes.ok) throw new Error('Invoice generation failed');

    const fullOrder = await fetchFullOrder(result.order_id);
    const fallback = {
      id: result.order_id, restaurant_id: restaurantId, order_type, table_number,
      items, total_inc_tax: cartTotals.totalInc, created_at: new Date().toISOString()
    };
    setPrintOrder(fullOrder || fallback);

    setCart([]); setCustomerName(''); setCustomerPhone(''); setPaymentMethod('cash');
    setOrderSelect(''); setIsCreditSale(false); setSelectedCreditCustomerId(''); setCreditCustomerBalance(0);
    setDrawerOpen(false); setShowPaymentDialog(false);
    await loadCreditCustomers();
    setSuccess('✅ Sale completed');
    setTimeout(() => setSuccess(''), 2000);
  }

  // Create without finalize (send to kitchen)
  async function doCreateKitchenOrder() {
    let order_type = 'counter';
    let table_number = null;
    if (orderSelect === 'parcel') order_type = 'parcel';
    else if (orderSelect && orderSelect.startsWith('table:')) table_number = orderSelect.split(':')[1] || null;

    const items = cart.map((i) => ({
      id: i.id, name: i.name, price: i.price, quantity: i.quantity,
      hsn: i.hsn, tax_rate: i.tax_rate, is_packaged_good: i.is_packaged_good, code_number: i.code_number
    }));

    const isCredit = isCreditSale;

    const orderData = {
      restaurant_id: restaurantId,
      order_type,
      table_number,
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim() || null,
      payment_method: isCredit ? 'credit' : 'cash',
      payment_status: 'pending',
      items,
      is_credit: isCredit,
      credit_customer_id: isCredit ? selectedCreditCustomerId : null,
      original_payment_method: null
    };

    const res = await fetch('/api/orders/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData)
    });
    if (!res.ok) throw new Error('Failed to create order');
    const result = await res.json();

    const fullOrder = await fetchFullOrder(result.order_id);
    const fallback = {
      id: result.order_id, restaurant_id: restaurantId, order_type, table_number,
      items, total_inc_tax: cartTotals.totalInc, created_at: new Date().toISOString()
    };
    setPrintOrder(fullOrder || fallback);

    setCart([]); setCustomerName(''); setCustomerPhone(''); setPaymentMethod('cash');
    setOrderSelect(''); setIsCreditSale(false); setSelectedCreditCustomerId(''); setCreditCustomerBalance(0);
    setDrawerOpen(false);
    setSuccess('✅ Order sent to kitchen');
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
    <div className="counter-shell">
      <header className="counter-header">
        <div className="counter-header-row">
          <button onClick={() => router.push('/owner/orders')} className="counter-back-btn">←</button>
          <h1 className="counter-title">Counter Sale</h1>
          {cartItemsCount > 0 && <div className="counter-cart-info">{cartItemsCount}•₹{cartTotals.totalInc.toFixed(2)}</div>}
        </div>

        {/* Credit toggle + Order mode */}
        <div style={{ padding: '8px 12px', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap:'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={isCreditSale}
              onChange={(e) => {
                setIsCreditSale(e.target.checked);
                if (!e.target.checked) { setSelectedCreditCustomerId(''); setCustomerName(''); setCustomerPhone(''); }
              }}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            💳 Credit Sale
          </label>

          <div style={{ display:'flex', border:'1px solid #e5e7eb', borderRadius:8, overflow:'hidden' }}>
            <button
              type="button"
              onClick={() => setOrderMode('kitchen')}
              style={{ padding:'6px 10px', border:'none', cursor:'pointer', background: orderMode === 'kitchen' ? '#eff6ff' : '#fff', color:'#111827' }}
              title="Customer is ordering now → send to Kitchen"
            >
              🍳 Send to Kitchen
            </button>
            <button
              type="button"
              onClick={() => setOrderMode('settle')}
              style={{ padding:'6px 10px', border:'none', cursor:'pointer', background: orderMode === 'settle' ? '#eff6ff' : '#fff', color:'#111827', borderLeft:'1px solid #e5e7eb' }}
              title="Customer already eaten → settle now"
            >
              ✅ Settle Now
            </button>
          </div>
        </div>

        <div className="counter-inputs-row">
          {isCreditSale ? (
            <>
              {!showNewCreditCustomer ? (
                <>
                  <select value={selectedCreditCustomerId} onChange={(e) => handleSelectCreditCustomer(e.target.value)} className="select" style={{ flex: 1 }}>
                    <option value="">Select Credit Customer...</option>
                    {creditCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone}) - Balance: ₹{c.current_balance.toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => setShowNewCreditCustomer(true)} className="btn" style={{ padding: '8px 12px', fontSize: 12 }}>
                    + New Customer
                  </button>
                </>
              ) : (
                <>
                  <input type="text" placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input" />
                  <input type="tel" placeholder="Phone number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="input" />
                  <button onClick={handleCreateNewCreditCustomer} className="btn" style={{ padding: '8px 12px', fontSize: 12, background: '#10b981' }}>
                    Create
                  </button>
                  <button onClick={() => { setShowNewCreditCustomer(false); setCustomerName(''); setCustomerPhone(''); }} className="btn btn--outline" style={{ padding: '8px 12px', fontSize: 12 }}>
                    Cancel
                  </button>
                </>
              )}
              <select value={orderSelect} onChange={(e) => setOrderSelect(e.target.value)} className="select">
                <option value="">Select Type...</option>
                <option value="parcel">Parcel</option>
                {tables.map((n) => (<option key={n} value={`table:${n}`}>{`Table ${n}`}</option>))}
              </select>
            </>
          ) : (
            <>
              <input type="text" placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input" />
              <input type="tel" placeholder="Phone (optional)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="input" />
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="select">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </select>
              <select value={orderSelect} onChange={(e) => setOrderSelect(e.target.value)} className="select">
                <option value="">Select Type...</option>
                <option value="parcel">Parcel</option>
                {tables.map((n) => (<option key={n} value={`table:${n}`}>{`Table ${n}`}</option>))}
              </select>
            </>
          )}
        </div>
      </header>

      <div className="counter-search-bar">
        <input type="text" placeholder="Search by name, code, or description..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input" />
        <div className="counter-filters actions-bar">
          {[{ id: 'all', label: 'All Items' }, { id: 'veg', label: '🟢 Veg' }, { id: 'popular', label: '🔥 Popular' }].map((m) => (
            <button key={m.id} onClick={() => setFilterMode(m.id)} className={`btn chip ${filterMode === m.id ? 'chip--active' : ''}`}>{m.label}</button>
          ))}
        </div>
      </div>

      <main className="counter-main-mobile-like">
        <section className="counter-menu-items">
          {groupedItems.map(([cat, items]) => (
            <div key={cat} className="counter-category">
              <h2 className="counter-category-title">{cat} ({items.length})</h2>
              <div className="counter-category-grid">
                {items.map((item) => {
                  const qty = cart.find((c) => c.id === item.id)?.quantity || 0;
                  const avail = !item.status || item.status === 'available';
                  return (
                    <div key={item.id} className={`counter-item-card${!avail ? ' item-out' : ''}`}>
                      <div className="counter-item-info">
                        <span>{item.veg ? '🟢' : '🔺'}</span>
                        <div>
                          <h3>{item.name}{item.code_number && <small>[{item.code_number}]</small>}</h3>
                          <div>₹{item.price.toFixed(2)}</div>
                        </div>
                      </div>
                      <div className="counter-item-actions">
                        {qty > 0 ? (
                          <div className="counter-cart-qty">
                            <button onClick={() => updateCartItem(item.id, qty - 1)}>-</button>
                            <div>{qty}</div>
                            <button onClick={() => updateCartItem(item.id, qty + 1)} disabled={!avail}>+</button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(item)} disabled={!avail} className="btn">Add</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </main>

      {cartItemsCount > 0 && (
        <button onClick={() => setDrawerOpen(true)} className="counter-mobile-cart-btn">
          View Cart • {cartItemsCount} • ₹{cartTotals.totalInc.toFixed(2)}
        </button>
      )}

      {drawerOpen && (
        <div className="counter-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="counter-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="counter-drawer-head">
              <h3>Cart ({cartItemsCount})</h3>
              {isCreditSale && selectedCreditCustomerId && (
                <small style={{ color: '#f59e0b', fontWeight: 600 }}>
                  💳 Credit Balance: ₹{(creditCustomerBalance + cartTotals.totalInc).toFixed(2)}
                </small>
              )}
              <button onClick={() => setDrawerOpen(false)} className="btn btn--outline btn--sm">Close</button>
            </div>
            <div className="counter-drawer-body">
              {cart.map((i) => (
                <div key={i.id} className="counter-drawer-row">
                  <div>
                    <div className="drawer-name">{i.name}</div>
                    <div className="drawer-sub">₹{i.price} × {i.quantity} = ₹{(i.price * i.quantity).toFixed(2)}</div>
                  </div>
                  <div className="cart-qty-controls">
                    <button onClick={() => updateCartItem(i.id, i.quantity - 1)}>-</button>
                    <span>{i.quantity}</span>
                    <button onClick={() => updateCartItem(i.id, i.quantity + 1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="counter-drawer-foot">
              <div className="drawer-total" style={{ display:'grid', gap:6 }}>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>Net (ex‑tax)</span>
                  <span>₹{cartTotals.subtotalEx.toFixed(2)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>GST</span>
                  <span>₹{cartTotals.totalTax.toFixed(2)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontWeight:700}}>
                  <span>Total</span>
                  <span>₹{cartTotals.totalInc.toFixed(2)}</span>
                </div>
              </div>
              <button onClick={completeSale} disabled={processing} className="btn btn--lg" style={{ width: '100%', marginTop:10 }}>
                {processing
                  ? 'Processing…'
                  : orderMode === 'kitchen'
                  ? `Send to Kitchen (₹${cartTotals.totalInc.toFixed(2)})`
                  : isCreditSale
                  ? `Credit & Settle (₹${cartTotals.totalInc.toFixed(2)})`
                  : `Complete & Print (₹${cartTotals.totalInc.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment dialog (non-credit, settle now) */}
      {showPaymentDialog && orderMode === 'settle' && !isCreditSale && (
  <PaymentConfirmDialog
    amount={cartTotals.totalInc}
    busy={processing}
    onConfirm={async (method, details) => {
      if (processing) return; // extra guard
      setProcessing(true);
      try { await doCreateAndFinalizeOrder(method, details); }
      catch (e) { setError('Error completing sale: ' + e.message); setTimeout(() => setError(''), 3000); }
      finally { setProcessing(false); }
    }}
    onCancel={() => setShowPaymentDialog(false)}
  />
)}


      {/* KOT print modal */}
      {printOrder && (
        <KotPrint
          order={printOrder}
          onClose={() => setPrintOrder(null)}
          onPrint={() => setPrintOrder(null)}
          autoPrint
        />
      )}
    </div>
  );
}
