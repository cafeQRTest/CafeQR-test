
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
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState('all')

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')

  const [orderSelect, setOrderSelect] = useState('') // '' | 'parcel' | 'table:<num>'
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
      } catch (e) {
        setError(e.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    })()
  }, [checking, loadingRestaurant, restaurantId, supabase])

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
    setProcessing(true)
    try {
      let order_type = 'counter',
        table_number = null
      if (orderSelect === 'parcel') order_type = 'parcel'
      else if (orderSelect.startsWith('table:')) {
        order_type = 'counter'
        table_number = orderSelect.split(':')[1] || null
      } else if (orderSelect === '') {
      // When nothing is selected, it's a counter order with no table
      order_type = 'counter'
      table_number = null
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

      const orderData = {
        restaurant_id: restaurantId,
        order_type,
        table_number,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        payment_method: paymentMethod,
        payment_status: 'completed',
        items,
      }

      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      })
      if (!res.ok) throw new Error('Failed to create order')
      const result = await res.json()

      const invRes = await fetch('/api/invoices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: result.order_id }),
      })
      if (invRes.ok) {
        const inv = await invRes.json()
        const ok = confirm(
          `Sale completed! Order #${result.order_number}\nTotal: ₹${cartTotal.toFixed(
            2
          )}\n\nOK to view receipt`
        )
        if (ok && inv.pdfUrl) window.open(inv.pdfUrl, '_blank')
      }

      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setPaymentMethod('cash')
      setOrderSelect('')
      setDrawerOpen(false)
    } catch (err) {
      alert('Error completing sale: ' + err.message)
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
        <div className="counter-inputs-row">
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
                {processing ? 'Processing…' : `Complete Sale (₹${cartTotal.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}