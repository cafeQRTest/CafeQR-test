// pages/owner/counter.js
import { useRouter } from 'next/router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import { getSupabase } from '../../services/supabase'

export default function CounterSale() {
  const supabase = getSupabase()
  const { checking } = useRequireAuth(supabase)
  const { restaurant, loading: loadingRestaurant } = useRestaurant()
  const router = useRouter()
  const restaurantId = restaurant?.id

  const [tables, setTables] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState('all')

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  
  // ✅ CREDIT MODE
  const [isCreditSale, setIsCreditSale] = useState(false)
  const [creditCustomers, setCreditCustomers] = useState([])
  const [selectedCreditCustomerId, setSelectedCreditCustomerId] = useState('')
  const [creditCustomerBalance, setCreditCustomerBalance] = useState(0)
  const [showNewCreditCustomer, setShowNewCreditCustomer] = useState(false)

  const [orderSelect, setOrderSelect] = useState('')
  const [processing, setProcessing] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const menuMapRef = useRef(new Map())
  const brandColor = '#f59e0b'

  const cacheMenuIntoMap = list => {
    const m = new Map()
    list.forEach(r => m.set(r.id, r))
    menuMapRef.current = m
  }

  useEffect(() => {
    if (checking || loadingRestaurant || !restaurantId) return
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data: menu, error: menuErr } = await supabase
          .from('menu_items')
          .select('id,name,price,category,veg,status,hsn,tax_rate,is_packaged_good,code_number')
          .eq('restaurant_id', restaurantId)
          .order('category')
          .order('name')
        if (menuErr) throw menuErr
        setMenuItems(menu || [])
        cacheMenuIntoMap(menu || [])

        const { data: profile, error: profErr } = await supabase
          .from('restaurant_profiles')
          .select('tables_count')
          .eq('restaurant_id', restaurantId)
          .single()
        if (profErr) throw profErr
        const count = profile?.tables_count || 0
        setTables(Array.from({ length: count }, (_, i) => String(i + 1)))

        // ✅ Load credit customers
        await loadCreditCustomers()
      } catch (e) {
        setError(e.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    })()
  }, [checking, loadingRestaurant, restaurantId, supabase])

  // ✅ LOAD CREDIT CUSTOMERS
  const loadCreditCustomers = async () => {
    const { data, error: err } = await supabase
      .from('credit_customers')
      .select('id, name, phone, current_balance, status')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active')
      .order('name')
    
    if (!err && data) {
      setCreditCustomers(data)
    }
  }

  // ✅ HANDLE CREDIT CUSTOMER SELECTION
  const handleSelectCreditCustomer = (customerId) => {
    const customer = creditCustomers.find(c => c.id === customerId)
    if (customer) {
      setSelectedCreditCustomerId(customerId)
      setCreditCustomerBalance(customer.current_balance)
      setCustomerName(customer.name)
      setCustomerPhone(customer.phone)
    }
  }

  // ✅ CREATE NEW CREDIT CUSTOMER
  const handleCreateNewCreditCustomer = async () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Please enter name and phone')
      return
    }

    try {
      const { data, error: err } = await supabase
        .from('credit_customers')
        .insert({
          restaurant_id: restaurantId,
          name: customerName.trim(),
          phone: customerPhone.trim(),
          current_balance: 0,
          total_credit_extended: 0,
          status: 'active'
        })
        .select()
        .single()

      if (err) throw err

      setCreditCustomers([...creditCustomers, data])
      setSelectedCreditCustomerId(data.id)
      setCreditCustomerBalance(0)
      setShowNewCreditCustomer(false)
      setSuccess('✅ Credit customer created')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err) {
      setError('Failed to create customer: ' + err.message)
    }
  }

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return menuItems.filter(item => {
      if (filterMode === 'veg' && !item.veg) return false
      if (filterMode === 'popular' && !item.popular) return false
      return (
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.code_number || '').toLowerCase().includes(q)
      )
    })
  }, [menuItems, filterMode, searchQuery])

  const groupedItems = useMemo(
    () =>
      Object.entries(
        filteredItems.reduce((acc, item) => {
          const cat = item.category || 'Others'
          ;(acc[cat] || (acc[cat] = [])).push(item)
          return acc
        }, {})
      ),
    [filteredItems]
  )

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart])
  const cartItemsCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart])

  const addToCart = item => {
    if (item.status && item.status !== 'available') {
      alert('Out of stock')
      return
    }
    setCart(prev => {
      const ex = prev.find(c => c.id === item.id)
      return ex
        ? prev.map(c => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))
        : [...prev, { ...item, quantity: 1 }]
    })
  }

  const updateCartItem = (id, qty) => {
    if (qty <= 0) setCart(p => p.filter(c => c.id !== id))
    else setCart(p => p.map(c => (c.id === id ? { ...c, quantity: qty } : c)))
  }

const completeSale = async () => {
  if (!cart.length) {
    alert('Please add items to cart')
    return
  }

  // ✅ Validate credit customer if credit sale
  if (isCreditSale && !selectedCreditCustomerId) {
    alert('Please select a credit customer')
    return
  }

  setProcessing(true)
  try {
    let order_type = 'counter',
      table_number = null
    if (orderSelect === 'parcel') order_type = 'parcel'
    else if (orderSelect.startsWith('table:')) {
      order_type = 'counter'
      table_number = orderSelect.split(':') || null
    }

    const items = cart.map(i => ({
      id: i.id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      hsn: i.hsn,
      tax_rate: i.tax_rate,
      is_packaged_good: i.is_packaged_good,
      code_number: i.code_number,
    }))

    // ✅ UPDATED: Add payment method tracking
    const orderData = {
      restaurant_id: restaurantId,
      order_type,
      table_number,
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim() || null,
      // ✅ Payment method now includes 'credit'
      payment_method: isCreditSale ? 'credit' : paymentMethod,
      payment_status: isCreditSale ? 'pending' : 'completed',
      items,
      is_credit: isCreditSale,
      credit_customer_id: selectedCreditCustomerId || null,
      // ✅ NEW: Track original payment method for credit orders
      original_payment_method: isCreditSale ? null : paymentMethod
    }

    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
    })
    if (!res.ok) throw new Error('Failed to create order')
    const result = await res.json()

    // ✅ UPDATED: Pass payment method to invoice creation
    // In your completeSale function, update the invoice creation call:

const invRes = await fetch('/api/invoices/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    order_id: result.order_id,
    // ✅ NEW: Pass payment method to invoice
    payment_method: isCreditSale ? 'credit' : paymentMethod,
    is_credit: isCreditSale,
    credit_customer_id: selectedCreditCustomerId || null
  }),
})


    if (invRes.ok) {
      const inv = await invRes.json()
      
      // ✅ UPDATED: Better message for credit vs paid
      let message = `Sale completed! Order #${result.order_number}\nTotal: ₹${cartTotal.toFixed(2)}`
      
      if (isCreditSale) {
        message += `\n\n💳 CREDIT SALE\nCustomer: ${customerName}\nNew Balance: ₹${(creditCustomerBalance + cartTotal).toFixed(2)}`
      } else {
        message += `\n\n✅ PAID (${paymentMethod.toUpperCase()})`
      }
      
      const ok = confirm(message + '\n\nOK to view receipt')
      if (ok && inv.pdfUrl) window.open(inv.pdfUrl, '_blank')
    }

    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setPaymentMethod('cash')
    setOrderSelect('')
    setIsCreditSale(false)
    setSelectedCreditCustomerId('')
    setCreditCustomerBalance(0)
    setDrawerOpen(false)
    setSuccess('✅ Sale completed successfully')
    setTimeout(() => setSuccess(''), 2000)
    
    // Reload credit customers to refresh balances
    await loadCreditCustomers()
  } catch (err) {
    setError('Error completing sale: ' + err.message)
    setTimeout(() => setError(''), 3000)
  } finally {
    setProcessing(false)
  }
}


  if (checking || loadingRestaurant) return <div style={{ padding: 24 }}>Loading…</div>
  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading data…</div>
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'red' }}>{error}</div>

  return (
    <div className="counter-shell">
      <header className="counter-header">
        <div className="counter-header-row">
          <button onClick={() => router.push('/owner/orders')} className="counter-back-btn">
            ←
          </button>
          <h1 className="counter-title">Counter Sale</h1>
          {cartItemsCount > 0 && (
            <div className="counter-cart-info">
              {cartItemsCount}•₹{cartTotal.toFixed(2)}
            </div>
          )}
        </div>

        {/* ✅ CREDIT MODE TOGGLE */}
        <div style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={isCreditSale}
              onChange={(e) => {
                setIsCreditSale(e.target.checked)
                if (!e.target.checked) {
                  setSelectedCreditCustomerId('')
                  setCustomerName('')
                  setCustomerPhone('')
                }
              }}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            💳 Credit Sale
          </label>
        </div>

        <div className="counter-inputs-row">
          {isCreditSale ? (
            <>
              {/* Credit Customer Selection */}
              {!showNewCreditCustomer ? (
                <>
                  <select
                    value={selectedCreditCustomerId}
                    onChange={(e) => handleSelectCreditCustomer(e.target.value)}
                    className="select"
                    style={{ flex: 1 }}
                  >
                    <option value="">Select Credit Customer...</option>
                    {creditCustomers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone}) - Balance: ₹{c.current_balance.toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowNewCreditCustomer(true)}
                    className="btn"
                    style={{ padding: '8px 12px', fontSize: 12 }}
                  >
                    + New Customer
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Customer name"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="input"
                  />
                  <input
                    type="tel"
                    placeholder="Phone number"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="input"
                  />
                  <button
                    onClick={handleCreateNewCreditCustomer}
                    className="btn"
                    style={{ padding: '8px 12px', fontSize: 12, background: '#10b981' }}
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setShowNewCreditCustomer(false)
                      setCustomerName('')
                      setCustomerPhone('')
                    }}
                    className="btn btn--outline"
                    style={{ padding: '8px 12px', fontSize: 12 }}
                  >
                    Cancel
                  </button>
                </>
              )}
              <select
                value={orderSelect}
                onChange={e => setOrderSelect(e.target.value)}
                className="select"
              >
                <option value="">Select Type...</option>
                <option value="parcel">Parcel</option>
                {tables.map(n => (
                  <option key={n} value={`table:${n}`}>
                    {`Table ${n}`}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <input
                type="text"
                placeholder="Customer name (optional)"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="input"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                className="input"
              />
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="select"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </select>
              <select
                value={orderSelect}
                onChange={e => setOrderSelect(e.target.value)}
                className="select"
              >
                <option value="">Select Type...</option>
                <option value="parcel">Parcel</option>
                {tables.map(n => (
                  <option key={n} value={`table:${n}`}>
                    {`Table ${n}`}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </header>

      <div className="counter-search-bar">
        <input
          type="text"
          placeholder="Search by name, code, or description..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="input"
        />
        <div className="counter-filters actions-bar">
          {[
            { id: 'all', label: 'All Items' },
            { id: 'veg', label: '🟢 Veg' },
            { id: 'popular', label: '🔥 Popular' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setFilterMode(m.id)}
              className={`btn chip ${filterMode === m.id ? 'chip--active' : ''}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <main className="counter-main-mobile-like">
        <section className="counter-menu-items">
          {groupedItems.map(([cat, items]) => (
            <div key={cat} className="counter-category">
              <h2 className="counter-category-title">
                {cat} ({items.length})
              </h2>
              <div className="counter-category-grid">
                {items.map(item => {
                  const qty = cart.find(c => c.id === item.id)?.quantity || 0
                  const avail = !item.status || item.status === 'available'
                  return (
                    <div key={item.id} className={`counter-item-card${!avail ? ' item-out' : ''}`}>
                      <div className="counter-item-info">
                        <span>{item.veg ? '🟢' : '🔺'}</span>
                        <div>
                          <h3>
                            {item.name}
                            {item.code_number && <small>[{item.code_number}]</small>}
                          </h3>
                          <div>₹{item.price.toFixed(2)}</div>
                        </div>
                      </div>
                      <div className="counter-item-actions">
                        {qty > 0 ? (
                          <div className="counter-cart-qty">
                            <button onClick={() => updateCartItem(item.id, qty - 1)}>-</button>
                            <div>{qty}</div>
                            <button onClick={() => updateCartItem(item.id, qty + 1)} disabled={!avail}>
                              +
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(item)} disabled={!avail} className="btn">
                            Add
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      </main>

      {cartItemsCount > 0 && (
        <button onClick={() => setDrawerOpen(true)} className="counter-mobile-cart-btn">
          View Cart • {cartItemsCount} • ₹{cartTotal.toFixed(2)}
        </button>
      )}

      {drawerOpen && (
        <div className="counter-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="counter-drawer" onClick={e => e.stopPropagation()}>
            <div className="counter-drawer-head">
              <h3>Cart ({cartItemsCount})</h3>
              {isCreditSale && selectedCreditCustomerId && (
                <small style={{ color: '#f59e0b', fontWeight: 600 }}>
                  💳 Credit Balance: ₹{(creditCustomerBalance + cartTotal).toFixed(2)}
                </small>
              )}
              <button onClick={() => setDrawerOpen(false)} className="btn btn--outline btn--sm">
                Close
              </button>
            </div>
            <div className="counter-drawer-body">
              {cart.map(i => (
                <div key={i.id} className="counter-drawer-row">
                  <div>
                    <div className="drawer-name">{i.name}</div>
                    <div className="drawer-sub">
                      ₹{i.price} × {i.quantity} = ₹{(i.price * i.quantity).toFixed(2)}
                    </div>
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
              <div className="drawer-total">
                <span>Total</span>
                <span>₹{cartTotal.toFixed(2)}</span>
              </div>
              <button onClick={completeSale} disabled={processing} className="btn btn--lg" style={{ width: '100%' }}>
                {processing ? 'Processing…' : isCreditSale ? `Credit Sale (₹${cartTotal.toFixed(2)})` : `Complete Sale (₹${cartTotal.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
