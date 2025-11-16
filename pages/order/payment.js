//pages/order/payment.js


import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
// 1. IMPORT the singleton function
import { getSupabase } from '../../services/supabase';
import AlertRestaurantButton from '../../components/AlertRestaurantButton';

// 2. REMOVE the supabase prop
export default function PaymentPage() {
  const router = useRouter();
  // 3. GET the singleton instance
  const supabase = getSupabase();
  const { r: restaurantId, t: tableNumber, total } = router.query;
  // 2. REMOVE the useRequireAuth hook
  // const { checking } = useRequireAuth(supabase);

  const [restaurant, setRestaurant] = useState(null);
  const [cart, setCart] = useState([]);
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [paymentSettings, setPaymentSettings] = useState({
    online_payment_enabled: false,
    use_own_gateway: false,
  });

  // Calculate tax and totals based on restaurant settings
 const calculateTotals = useMemo(() => {
    const profile = restaurant?.restaurant_profiles;
    const gstEnabled = !!profile?.gst_enabled;
  
    if (!gstEnabled) {
      // GST disabled: sum tax-inclusive prices for all products (assume price inclusive for packaged too)
      const subtotalEx = cart.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
      return {
        subtotalEx,
        taxAmount: 0,
        totalInc: subtotalEx,
        taxRateDisplay: 0,
      };
    }
  
    const baseRate = Number(profile?.default_tax_rate ?? 18); // default 18%
    const serviceRate = baseRate;
    const pricesIncludeTax = profile?.prices_include_tax === true
      || profile?.prices_include_tax === 'true'
      || profile?.prices_include_tax === 1
      || profile?.prices_include_tax === '1';
  
    let packagedSubtotalEx = 0;
    let packagedTotalInc = 0;
    let serviceSubtotalEx = 0;
    let serviceTaxAmount = 0;
    let serviceTotalInc = 0;
  
    cart.forEach(item => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const isPackaged = !!item.is_packaged_good;
  
      if (isPackaged) {
        // Packaged goods: price is tax-inclusive, add to subtotalEx and totalInc, no separate tax
        const totalInc = price * quantity;
        packagedTotalInc += totalInc;
        packagedSubtotalEx += totalInc; // tax included, so treat inclusive price as subtotal
      } else {
        // Service items: calculate tax according to restaurant GST and pricesIncludeTax
        if (pricesIncludeTax) {
          const totalInc = price * quantity;
          const subtotalEx = serviceRate > 0 ? totalInc / (1 + serviceRate / 100) : totalInc;
          const taxAmt = totalInc - subtotalEx;
          serviceSubtotalEx += subtotalEx;
          serviceTaxAmount += taxAmt;
          serviceTotalInc += totalInc;
        } else {
          const subtotalEx = price * quantity;
          const taxAmt = (serviceRate / 100) * subtotalEx;
          serviceSubtotalEx += subtotalEx;
          serviceTaxAmount += taxAmt;
          serviceTotalInc += subtotalEx + taxAmt;
        }
      }
    });
    // Aggregate subtotal, tax and total including both packaged and service groups
    const subtotalEx = packagedSubtotalEx + serviceSubtotalEx;
    const taxAmount = serviceTaxAmount; // Do NOT include packaged tax as separate
    const totalInc = packagedTotalInc + serviceTotalInc;
    return {
      subtotalEx,
      taxAmount,
      totalInc,
      taxRateDisplay: serviceRate,
    };
  }, [cart, restaurant]);

  const totalAmount = useMemo(() => {
    const q = Number(total);
    if (Number.isFinite(q) && q > 0) return q;
    return calculateTotals.totalInc;
  }, [total, calculateTotals]);

  useEffect(() => {
    // 3. USE the singleton instance (already available)
    if (restaurantId) loadRestaurantData();
  }, [restaurantId]); // supabase is no longer a dependency

  useEffect(() => {
    if (typeof window !== 'undefined' && restaurantId && tableNumber) {
      try {
        const stored = localStorage.getItem(`cart_${restaurantId}_${tableNumber}`);
        if (stored) setCart(JSON.parse(stored) || []);
      } catch (e) {
        console.error('Failed to parse cart JSON', e);
      }
    }
  }, [restaurantId, tableNumber]);

  useEffect(() => {
    if (!window.Razorpay) {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

 const loadRestaurantData = async () => {
    if (!restaurantId) {
      console.error('loadRestaurantData called with no restaurantId');
      return;
    }
    const id = restaurantId.trim();
    console.log('Loading restaurant data for ID:', id);
    try {
      const { data: restaurantData, error: restaurantError } = await supabase
      .from('restaurants')
      .select('id, name')
      .eq('id', id)
      .single();

    if (restaurantError) {
      console.error('Error fetching restaurant data:', restaurantError);
      return;
    }
      // Load restaurant profile info separately
      const { data: profileData, error: profileError } = await supabase
      .from('restaurant_profiles')
      .select(`
        brand_color,
        online_payment_enabled,
        use_own_gateway,
        gst_enabled,
        default_tax_rate,
        prices_include_tax
      `)
      .eq('restaurant_id', id)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching restaurant profile data:', profileError);
    }
      const combinedData = {
        ...restaurantData,
        restaurant_profiles: profileData || {},
      };

      setRestaurant(combinedData);
      setPaymentSettings({
        online_payment_enabled: profileData?.online_payment_enabled || false,
        use_own_gateway: profileData?.use_own_gateway || false,
      });
    } catch (e) {
      console.error('Exception loading restaurant data:', e);
    }
  };
  // The functions below do not use the supabase client directly and need no changes
  const notifyOwner = async (payload) => {
    try {
      await fetch('/api/notify-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn('notify-owner failed', e);
    }
  };

  const handlePayment = async () => {
    if (loading) return;
    if (!restaurantId || !tableNumber) {
      alert('Missing restaurant or table information.');
      return;
    }
    if (!cart?.length) {
      alert('Cart is empty.');
      return;
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      alert('Invalid total amount.');
      return;
    }

    setLoading(true);

    try {
      if (selectedPayment === 'cash') {
        const orderData = {
          restaurant_id: restaurantId,
          restaurant_name: restaurant?.name || null,
          table_number: tableNumber,
          items: cart.map(i => ({
            id: i.id,
            name: i.name,
            price: Number(i.price) || 0,
            quantity: Number(i.quantity) || 1,
            veg: !!i.veg,
          })),
          subtotal: calculateTotals.subtotalEx,
          tax: calculateTotals.taxAmount,
          total_amount: calculateTotals.totalInc,
          payment_method: 'cash',
          special_instructions: specialInstructions.trim(),
          payment_status: 'pending',
        };

        const res = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData),
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result?.error || 'Failed to create order');

        await notifyOwner({
          restaurantId,
          orderId: result.order_id || result.id,
          orderItems: orderData.items,
        });

        // Persist amount for success page and pass via query
        try { sessionStorage.setItem('last_paid_amount', String(calculateTotals.totalInc)) } catch {}
        const amt = encodeURIComponent(String(calculateTotals.totalInc))

        localStorage.removeItem(`cart_${restaurantId}_${tableNumber}`);
        localStorage.setItem('restaurantId', restaurantId);
        localStorage.setItem('tableNumber', tableNumber);
        window.location.href = `/order/success?id=${result.order_id || result.id}&method=cash&amt=${amt}`;
        return;
      }

      if (selectedPayment === 'byo') {
        const resp = await fetch('/api/byo-pg/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurantId,
            amount: totalAmount,
            metadata: {
              table_number: tableNumber,
              special_instructions: specialInstructions.trim(),
            },
          }),
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Order creation failed');

        const pendingOrder = {
          restaurant_id: restaurantId,
          table_number: tableNumber,
          items: cart.map(i => ({
            id: i.id,
            name: i.name,
            price: Number(i.price) || 0,
            quantity: Number(i.quantity) || 1,
            veg: !!i.veg,
          })),
          subtotal: calculateTotals.subtotalEx,
          tax: calculateTotals.taxAmount,
          total_amount: calculateTotals.totalInc,
          special_instructions: specialInstructions.trim(),
          payment_method: 'online',
        };

        localStorage.setItem('pending_order', JSON.stringify(pendingOrder));

        const options = {
          key: '',
          order_id: data.order_id,
          amount: data.amount,
          currency: data.currency,
          name: restaurant?.name || 'Restaurant',
          description: `Table ${tableNumber} Order`,
          handler: (response) => {
            window.location.href = `/order/payment-success?payment_id=${response.razorpay_payment_id}&order_id=${response.razorpay_order_id}`;
          },
          modal: { ondismiss: () => setLoading(false) },
          theme: { color: restaurant?.restaurant_profiles?.brand_color || '#10b981' },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
        return;
      }

      if (selectedPayment === 'route') {
        const resp = await fetch('/api/route/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurantId,
            amount: totalAmount,
            metadata: {
              table_number: tableNumber,
              special_instructions: specialInstructions.trim(),
            },
          }),
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Order creation failed');

        const pendingOrder = {
          restaurant_id: restaurantId,
          table_number: tableNumber,
          items: cart.map(i => ({
            id: i.id,
            name: i.name,
            price: Number(i.price) || 0,
            quantity: Number(i.quantity) || 1,
            veg: !!i.veg,
          })),
          subtotal: calculateTotals.subtotalEx,
          tax: calculateTotals.taxAmount,
          total_amount: calculateTotals.totalInc,
          special_instructions: specialInstructions.trim(),
          payment_method: 'route',
        };

        localStorage.setItem('pending_order', JSON.stringify(pendingOrder));

        const options = {
          key: data.key_id,
          order_id: data.order_id,
          amount: data.amount,
          currency: data.currency,
          name: restaurant?.name || 'Restaurant',
          description: `Table ${tableNumber} Order`,
          handler: (response) => {
            window.location.href = `/order/payment-success?payment_id=${response.razorpay_payment_id}&order_id=${response.razorpay_order_id}`;
          },
          modal: { ondismiss: () => setLoading(false) },
          theme: { color: restaurant?.restaurant_profiles?.brand_color || '#10b981' },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
        return;
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert(`Payment failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const brandColor = restaurant?.restaurant_profiles?.brand_color || '#f59e0b';

  const getPaymentMethods = () => {
    const methods = [{ id: 'cash', name: 'Pay at Counter', icon: '💵' }];
    if (paymentSettings.online_payment_enabled) {
      if (paymentSettings.use_own_gateway) {
        methods.push({ id: 'byo', name: 'Online Payment', icon: '🌐' });
      } else {
        methods.push({ id: 'route', name: 'UPI / Cards / Netbanking', icon: '💳' });
      }
    }
    return methods;
  };

  const paymentMethods = getPaymentMethods();

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', paddingBottom: 120 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 16,
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          gap: 8,
        }}
      >
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
        >
          {'<'}
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, flex: 1, textAlign: 'center' }}>
          Payment
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: brandColor }}>
            ₹{Number(totalAmount || 0).toFixed(2)}
          </div>
          <Link
            href={`/order/cart?r=${restaurantId}&t=${tableNumber}`}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              border: `1px solid ${brandColor}`,
              fontSize: 12,
              textDecoration: 'none',
              color: brandColor,
              background: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>🛒</span>
            <span>View Cart</span>
          </Link>
        </div>
        <AlertRestaurantButton restaurantId={restaurantId} tableNumber={tableNumber} brandColor={brandColor} />
      </header>

      <div style={{ background: '#fff', padding: 20, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>📦 Order Summary</h3>
        </div>
        <div style={{ marginBottom: 16 }}>
          {(showFullSummary ? cart : cart.slice(0, 3)).map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 6,
                fontSize: 14,
                color: '#374151',
              }}
            >
              <span>
                {item.quantity}x {item.name}
              </span>
              <span>
                ₹{((Number(item.price) || 0) * (Number(item.quantity) || 0)).toFixed(2)}
              </span>
            </div>
          ))}
          {cart.length > 3 && !showFullSummary && (
            <button
              type="button"
              onClick={() => setShowFullSummary(true)}
              style={{
                marginTop: 4,
                padding: 0,
                border: 'none',
                background: 'none',
                fontSize: 12,
                color: '#2563eb',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              +{cart.length - 3} more items
            </button>
          )}
        </div>
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span>Subtotal</span>
            <span>₹{calculateTotals.subtotalEx.toFixed(2)}</span>
          </div>
          {calculateTotals.taxAmount > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px',
                color: '#6b7280',
              }}
            >
              <span>Tax({calculateTotals.taxRateDisplay}%)</span>
              <span>₹{calculateTotals.taxAmount.toFixed(2)}</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            <span>Final Total</span>
            <span>₹{Number(totalAmount || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="payment-methods" style={{ background: '#fff', padding: 16, marginBottom: 84 }}>
        <h3>💳 Choose Payment Method</h3>
        {paymentMethods.map((method, index) => (
          <label key={`${method.id}-${index}`} className={`pay-card ${selectedPayment === method.id ? 'selected' : ''}`}>
            <input
              type="radio"
              value={method.id}
              checked={selectedPayment === method.id}
              onChange={(e) => setSelectedPayment(e.target.value)}
            />
            <div className="pay-main">
              <div className="pay-left">
                <span className="pay-emoji" aria-hidden="true">
                  {method.icon}
                </span>
                <div className="pay-text">
                  <div className="pay-name">{method.name}</div>
                  {method.id === 'cash' && <div className="pay-note">Pay at counter</div>}
                </div>
              </div>
              <div className="pay-right">₹{Number(totalAmount || 0).toFixed(2)}</div>
            </div>
          </label>
        ))}
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 16,
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14, color: '#374151' }}>
          <span>💰 Total: ₹{Number(totalAmount || 0).toFixed(2)}</span>
          <span>⏱️ Ready in 20 mins</span>
        </div>
        <button
          onClick={handlePayment}
          disabled={loading}
          style={{
            width: '100%',
            background: brandColor,
            color: '#fff',
            border: 'none',
            padding: 16,
            borderRadius: 8,
            fontSize: 18,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Processing...' : selectedPayment === 'cash' ? 'Place Order' : `Pay ₹${Number(totalAmount || 0).toFixed(2)}`}
        </button>
      </div>

      <style jsx>{`
        .pay-card {
          display: block;
          width: 100%;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          background: #fff;
          margin-bottom: 10px;
          overflow: hidden;
          cursor: pointer;
          user-select: none;
        }
        .pay-card.selected {
          border-color: ${brandColor};
          background: #fffbeb;
        }
        .pay-card input {
          display: none;
        }
        .pay-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          min-height: 56px;
        }
        .pay-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }
        .pay-emoji {
          font-size: 20px;
          line-height: 1;
          width: 24px;
          text-align: center;
        }
        .pay-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .pay-name {
          font-size: 15px;
          font-weight: 600;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pay-note {
          font-size: 12px;
          color: #6b7280;
        }
        .pay-right {
          font-weight: 700;
          color: #111827;
          flex: 0 0 auto;
          text-align: right;
        }
        @media (max-width: 380px) {
          .pay-right {
            min-width: 84px;
          }
        }
      `}</style>
    </div>
  );
}
