// pages/owner/counter.js

import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import { getSupabase } from '../../services/supabase';
import MenuItemCard from '../../components/MenuItemCard';
import MenuItemCardSimple from '../../components/MenuItemCardSimple';
import VariantSelector from '../../components/VariantSelector';
import NiceSelect from '../../components/NiceSelect';
import { useAlert } from '../../context/AlertContext';
import HorizontalScrollRow from '../../components/HorizontalScrollRow';

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
    display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
    border: `2px solid ${active ? BRAND.orange : BRAND.border}`, background: active ? BRAND.bgSoft : '#fff', color: BRAND.text
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
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div style={{background:'#fff',padding:20,borderRadius:12,maxWidth:480,width:'92%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 50px rgba(0,0,0,.25)'}}>
        <h3 style={{margin:'0 0 6px',color:'#111827'}}>Payment Confirmation</h3>
        <p style={{margin:'0 0 12px',color:'#111827'}}>Amount: ₹{total.toFixed(2)}</p>

        <div style={{display:'grid',gap:10,margin:'12px 0'}}>
          <label style={choiceBox(paymentMethod==='cash')}>
            <input type="radio" value="cash" checked={paymentMethod==='cash'} onChange={(e)=>handleMethodSelect(e.target.value)} disabled={disabled}/>
            <span>💵 Cash</span>
          </label>
          <label style={choiceBox(paymentMethod==='online')}>
            <input type="radio" value="online" checked={paymentMethod==='online'} onChange={(e)=>handleMethodSelect(e.target.value)} disabled={disabled}/>
            <span>🔗 Online (UPI/Card)</span>
          </label>
          <label style={choiceBox(paymentMethod==='mixed')}>
            <input type="radio" value="mixed" checked={paymentMethod==='mixed'} onChange={(e)=>handleMethodSelect(e.target.value)} disabled={disabled}/>
            <span>🔀 Mixed (Cash + Online)</span>
          </label>
        </div>

        {showMixedForm && (
          <div style={{background:'#fff',border:`1px solid ${BRAND.border}`,borderRadius:10,padding:12,marginBottom:10}}>
            <div style={{display:'grid',gap:10}}>
              <div><label>Cash Amount (₹)</label>
                <input type="number" min="0" step="0.01" value={cashAmount} onChange={(e)=>setCashAmount(e.target.value)} style={{width:'100%'}} disabled={disabled}/>
              </div>
              <div><label>Online Amount (₹)</label>
                <input type="number" min="0" step="0.01" value={onlineAmount} onChange={(e)=>setOnlineAmount(e.target.value)} style={{width:'100%'}} disabled={disabled}/>
              </div>
              <div><label>Online Method</label>
                <div style={{marginTop: 4}}>
                  <NiceSelect
                    value={onlineMethod}
                    onChange={setOnlineMethod}
                    options={[
                      { value: 'upi', label: 'UPI' },
                      { value: 'card', label: 'Card' },
                      { value: 'netbanking', label: 'Net Banking' },
                      { value: 'wallet', label: 'Wallet' }
                    ]}
                  />
                </div>
              </div>
              <div style={{background:BRAND.bgSoft,padding:8,borderLeft:`4px solid ${BRAND.orange}`,borderRadius:6,color:BRAND.text}}>
                Total ₹{total.toFixed(2)} → ₹{cashAmount||0} + ₹{onlineAmount||0} ({onlineMethod.toUpperCase()})
              </div>
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:10,marginTop:10}}>
          <button
            onClick={handleConfirm}
            disabled={disabled}
            style={{
              flex:1, background: disabled ? '#fdba74' : BRAND.orange, color:'#fff', border:'none', padding:12, borderRadius:10,
              cursor: disabled ? 'not-allowed' : 'pointer', fontWeight:700
            }}
          >
            {disabled ? 'Processing…' : 'Confirm'}
          </button>
          <button
            onClick={onCancel}
            disabled={disabled}
            style={{ flex:1, background:'#fff', color:BRAND.text, border:`1px solid ${BRAND.border}`, padding:12, borderRadius:10,
              cursor: disabled ? 'not-allowed' : 'pointer' }}
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
  const [popularIds, setPopularIds] = useState(new Set());
  const [popCounts, setPopCounts] = useState(new Map());   // id -> total qty
  const nameIndexRef = useRef(new Map());                  // normalized name -> id
// inside CounterSale
  const [printProfile, setPrintProfile] = useState(null);



  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
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
  ? { main: '#f97316', dark: '#ea580c', soft: '#fff7ed' }  // orange
  : { main: '#16a34a', dark: '#15803d', soft: '#ecfdf3' }; // green




  // NEW: profile tax settings for client‑side totals
  const [profileTax, setProfileTax] = useState({
    gst_enabled: false,
    default_tax_rate: 0,
    prices_include_tax: true
  });

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
        
        // Transform menu data with variants
        const transformedMenu = (menu || []).map(item => {
          const variants = variantDataMap.get(item.id) || [];
          const templateName = item.menu_item_variants?.[0]?.variant_templates?.name || 'Options';
          
          return {
            ...item,
            variants: variants.sort((a, b) => a.display_order - b.display_order),
            variant_template_name: item.has_variants ? templateName : null
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
setOrderMode(
  profile?.features_counter_send_to_kitchen_enabled === false
    ? 'settle'
    : 'kitchen'
);


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
    
    // Check if item has variants
    if (item.has_variants && item.variants?.length > 0) {
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

  const updateCartItem = (cartId, qty) => {
    if (qty <= 0) setCart((p) => p.filter((c) => c.cartId !== cartId));
    else setCart((p) => p.map((c) => (c.cartId === cartId ? { ...c, quantity: qty } : c)));
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
    name: i.name,
    price: i.price,
    quantity: i.quantity,
    hsn: i.hsn,
    tax_rate: i.tax_rate,
    is_packaged_good: i.is_packaged_good,
    code_number: i.code_number,
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
    status: finalizeNow ? 'completed' : 'new',
    items,
    is_credit: isCredit,
    credit_customer_id: isCredit ? selectedCreditCustomerId : null,
    original_payment_method: isCredit ? null : finalPaymentMethod,
    ...(finalPaymentMethod === 'mixed' && mixedDetails
      ? { mixed_payment_details: mixedDetails }
      : {}),
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
      payment_method: isCredit ? 'credit' : 'none',
      payment_status: 'pending',
      items,
      is_credit: isCredit,
      credit_customer_id: isCredit ? selectedCreditCustomerId : null,
      original_payment_method: null
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
          <h1 className="counter-title">Counter Sale</h1>
          {cartItemsCount > 0 && <div className="counter-cart-info">{cartItemsCount}•₹{cartTotals.totalInc.toFixed(2)}</div>}
        </div>

        {/* Credit toggle + Order mode */}
        <div style={{ padding: '8px 12px', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap:'wrap' }}>
  {creditFeatureEnabled && (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        fontWeight: 600,
      }}
    >
      <input
        type="checkbox"
        checked={isCreditSale}
        onChange={(e) => {
          setIsCreditSale(e.target.checked);
          if (!e.target.checked) {
            setSelectedCreditCustomerId('');
            setCustomerName('');
            setCustomerPhone('');
          }
        }}
        style={{ width: 18, height: 18, cursor: 'pointer' }}
      />
      💳 Credit Sale
    </label>
  )}

  {sendToKitchenEnabled && (
    <div style={{ display:'flex', border:'1px solid #e5e7eb', borderRadius:8, overflow:'hidden' }}>
      <button
        type="button"
        onClick={() => setOrderMode('kitchen')}
        style={{
          padding:'6px 10px',
          border:'none',
          cursor:'pointer',
          background: orderMode === 'kitchen' ? '#eff6ff' : '#fff',
          color:'#111827',
        }}
      >
        🍳 Send to Kitchen
      </button>
      <button
        type="button"
        onClick={() => setOrderMode('settle')}
        style={{
          padding:'6px 10px',
          border:'none',
          cursor:'pointer',
          background: orderMode === 'settle' ? '#eff6ff' : '#fff',
          color:'#111827',
          borderLeft:'1px solid #e5e7eb',
        }}
      >
        ✅ Settle Now
      </button>
    </div>
  )}
</div>

        <div className="counter-inputs-row">
          {isCreditSale ? (
            <>
              {!showNewCreditCustomer ? (
                <>
                  <div style={{flex: 1}}>
                    <NiceSelect
                      value={selectedCreditCustomerId}
                      onChange={handleSelectCreditCustomer}
                      placeholder="Select Credit Customer..."
                      options={creditCustomers.map(c => ({
                        value: c.id,
                        label: `${c.name} (${c.phone}) - ₹${c.current_balance.toFixed(2)}`
                      }))}
                    />
                  </div>
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
              <div style={{minWidth: 160}}>
                <NiceSelect
                  value={orderSelect}
                  onChange={setOrderSelect}
                  placeholder="Select Type..."
                  options={[
                    { value: 'parcel', label: 'Parcel' },
                    ...tables.map(n => ({ value: `table:${n}`, label: `Table ${n}` }))
                  ]}
                />
              </div>
            </>
          ) : (
            <>
  <input type="text" placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input" />
  <input type="tel" placeholder="Phone (optional)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="input" />
  <div style={{minWidth: 160}}>
    <NiceSelect
      value={orderSelect}
      onChange={setOrderSelect}
      placeholder="Select Type..."
      options={[
        { value: 'parcel', label: 'Parcel' },
        ...tables.map(n => ({ value: `table:${n}`, label: `Table ${n}` }))
      ]}
    />
  </div>
</>

          )}
        </div>
      </header>

      <div className="counter-search-bar">
        <input type="text" placeholder="Search by name, code, or description..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input" />
        <div className="counter-filters actions-bar">
          {[
            { id: 'all', label: 'All', icon: '🍽️' },
            { id: 'veg', label: 'Veg', icon: '🥬' },
            { id: 'popular', label: 'Popular', icon: '🔥' },
          ].map((m) => {
            const active = filterMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setFilterMode(m.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: active ? 'none' : '1px solid #e5e7eb',
                  background: active ? THEME.main : '#fff',      // ← use theme
                  color: active ? '#fff' : '#111827',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span aria-hidden>{m.icon}</span>
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
            padding: '0 12px 0.75rem',
            background: '#fff',
            borderBottom: '1px solid #f3f4f6',
          }}
        >
 {['all', ...categoryChips].map((cat) => {
  const active = categoryFilter === cat;
  return (
    <button
      key={cat}
      onClick={() => setCategoryFilter(cat)}
      className={`sales-carousel-btn${active ? ' active' : ''}`}
      style={{
        background: active ? THEME.main : '#f9fafb',
        color: active ? '#fff' : '#374151',
        borderColor: active ? THEME.main : '#e5e7eb',
      }}
    >
      {cat === 'all' ? 'All categories' : cat}
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
                  return (
                    <div style={{ minWidth: '200px', maxWidth: '200px' }}>
                      <MenuItemCard
                        item={item}
                        quantity={qty}
                        onAdd={() => addToCart(item)}
                        onRemove={() => {
                          const current = cart.find((c) => c.id === item.id)?.quantity || 0;
                          updateCartItem(item.id, current - 1);
                        }}
                        showImage={true}
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
                              <button
                                onClick={() => updateCartItem(item.id, qty - 1)}
                                style={{ background: THEME.main, color: '#fff' }}
                              >
                                -
                              </button>
                              <div>{qty}</div>
                              <button
                                onClick={() => updateCartItem(item.id, qty + 1)}
                                disabled={!avail}
                                style={{ background: THEME.main, color: '#fff' }}
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(item)}
                              disabled={!avail}
                              className="btn"
                              style={{ background: THEME.main, borderColor: THEME.main }}
                            >
                              Add
                            </button>
                          )}
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
    style={{ background: THEME.main }}
  >
    View Cart • {cartItemsCount} • ₹{cartTotals.totalInc.toFixed(2)}
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
                  <span>💳</span>
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
                  <div style={{ fontSize: 64, marginBottom: 16 }}>🛒</div>
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
                      {/* Top Row: Name and Quantity Controls */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ flex: 1, paddingRight: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {/* Veg/Non-veg indicator */}
                            {i.veg !== undefined && (
                              i.veg ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                  <rect x="1" y="1" width="22" height="22" stroke="#16a34a" strokeWidth="2.5" />
                                  <circle cx="12" cy="12" r="6" fill="#16a34a" />
                                </svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                  <rect x="1" y="1" width="22" height="22" stroke="#dc2626" strokeWidth="2.5" />
                                  <path d="M12 6L18 16H6L12 6Z" fill="#dc2626" />
                                </svg>
                              )
                            )}
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
                            onClick={() => updateCartItem(i.cartId || i.id, i.quantity - 1)}
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
                            onClick={() => updateCartItem(i.cartId || i.id, i.quantity + 1)}
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
                          {profileTax.gst_enabled && !profileTax.prices_include_tax && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#f97316',
                              background: '#fff7ed',
                              padding: '2px 6px',
                              borderRadius: 4,
                              border: '1px solid #fed7aa',
                            }}>
                              +GST
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                            ₹{(i.price * i.quantity).toFixed(2)}
                          </span>
                          {profileTax.gst_enabled && !profileTax.prices_include_tax && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#f97316',
                              background: '#fff7ed',
                              padding: '2px 6px',
                              borderRadius: 4,
                              border: '1px solid #fed7aa',
                            }}>
                              +GST
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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
                <div style={{ 
                  background: '#ffffff',
                  padding: '16px',
                  borderRadius: 12,
                  border: '2px solid #e5e7eb',
                  marginBottom: 16,
                }}>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#6b7280' }}>
                      <span>Subtotal (ex-tax)</span>
                      <span style={{ fontWeight: 600 }}>₹{cartTotals.subtotalEx.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#6b7280' }}>
                      <span>GST</span>
                      <span style={{ fontWeight: 600 }}>₹{cartTotals.totalTax.toFixed(2)}</span>
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      paddingTop: 10,
                      borderTop: '2px solid #f3f4f6',
                      fontSize: 18,
                      fontWeight: 700,
                      color: '#111827',
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
                    padding: '16px',
                    background: processing ? '#d1d5db' : `linear-gradient(135deg, ${THEME.main} 0%, ${THEME.dark} 100%)`,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: processing ? 'not-allowed' : 'pointer',
                    boxShadow: processing ? 'none' : '0 4px 12px rgba(0,0,0,0.15)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!processing) {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!processing) {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                    }
                  }}
                >
                  {processing
                    ? '⏳ Processing…'
                    : orderMode === 'kitchen'
                    ? `🍳 Send to Kitchen • ₹${cartTotals.totalInc.toFixed(2)}`
                    : isCreditSale
                    ? `💳 Credit & Settle • ₹${cartTotals.totalInc.toFixed(2)}`
                    : `✓ Complete & Print • ₹${cartTotals.totalInc.toFixed(2)}`}
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
            
            .counter-mobile-cart-btn { position: fixed; bottom: 16px; left: 16px; right: 16px; padding: 16px; border-radius: 12px; color: white; border: none; font-weight: 700; font-size: 1rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); z-index: 50; display: flex; justify-content: center; align-items: center; gap: 8px; animation: slideUp 0.3s ease-out; }
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
