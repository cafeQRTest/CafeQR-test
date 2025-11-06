// pages/order/index.js
import { useRouter } from 'next/router'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '../../services/supabase'
import AlertRestaurantButton from '../../components/AlertRestaurantButton'

export default function OrderPage() {
  const router = useRouter()
  const { r: restaurantId, t: tableNumber } = router.query

  // 1. Run subscription guard first
  const supabase = getSupabase()
  const [restaurant, setRestaurant] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState('all')
const menuMapRef = useRef(new Map())
const cacheMenuIntoMap = (list) => {
  const m = new Map()
  ;(list || []).forEach((row) => m.set(row.id, row))
  menuMapRef.current = m
}

  // …rest of your code unchanged

  

  

  // 2. Now it’s safe to initialize Supabase and load data
 



  useEffect(() => {
    if (!restaurantId || !tableNumber) return
    const key = `cart_${restaurantId}_${tableNumber}`
    const stored = localStorage.getItem(key)
    if (stored) {
      try { setCart(JSON.parse(stored)) } catch {}
    }
  }, [restaurantId, tableNumber])

  useEffect(() => {
    if (!restaurantId || !tableNumber) return
    const key = `cart_${restaurantId}_${tableNumber}`
    localStorage.setItem(key, JSON.stringify(cart))
  }, [cart, restaurantId, tableNumber])

  useEffect(() => {
    if (!restaurantId) return
    let cancelled = false

    const loadData = async () => {
      try {
        setLoading(true)
        setError('')

        const { data: rest, error: restErr } = await supabase
          .from('restaurants')
          .select('id, name, online_paused, restaurant_profiles(brand_color, phone)')
          .eq('id', restaurantId)
          .single()
        if (restErr) throw restErr
        if (!rest) throw new Error('Restaurant not found')
        if (rest.online_paused) throw new Error('Restaurant is currently closed')

        const { data: menu, error: menuErr } = await supabase
          .from('menu_items')
          .select('id, name, price, description, category, veg, status, is_packaged_good')
          .eq('restaurant_id', restaurantId)
          .order('category', { ascending: true })
          .order('name', { ascending: true })
        if (menuErr) throw menuErr

        const cleaned = (menu || []).map((item, i) => ({
          ...item,
          rating: Number((3.8 + Math.random() * 1.0).toFixed(1)),
          popular: i % 4 === 0
        }))

        if (!cancelled) {
          setRestaurant(rest)
          setMenuItems(cleaned)
          cacheMenuIntoMap(cleaned)
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load menu')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [restaurantId, supabase])

  useEffect(() => {
    if (!restaurantId) return

    const channel = supabase
      .channel(`menu-items-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const newRow = payload.new
          if (!newRow?.id) return
          const map = menuMapRef.current
          const prev = map.get(newRow.id)
          if (!prev) return

          const merged = { ...prev }
          if (typeof newRow.status !== 'undefined') merged.status = newRow.status
          if (typeof newRow.price !== 'undefined') merged.price = newRow.price
          if (typeof newRow.name !== 'undefined') merged.name = newRow.name
          if (typeof newRow.description !== 'undefined') merged.description = newRow.description
          if (typeof newRow.category !== 'undefined') merged.category = newRow.category
          if (typeof newRow.veg !== 'undefined') merged.veg = newRow.veg

          map.set(newRow.id, merged)

          setMenuItems((prevList) => {
            let changed = false
            const next = prevList.map((it) => {
              if (it.id === newRow.id) {
                changed = true
                return { ...it, ...merged }
              }
              return it
            })
            return changed ? next : prevList
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [restaurantId, supabase])
  
  const addToCart = (item) => {
    if (item.status && item.status !== 'available') {
      alert('This item is currently out of stock.')
      return
    }
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id)
      if (existing) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { ...item, quantity: 1 }]
    })
  }

  const updateCartItem = (itemId, quantity) => {
    if (quantity === 0) setCart(prev => prev.filter(c => c.id !== itemId))
    else setCart(prev => prev.map(c => c.id === itemId ? { ...c, quantity } : c))
  }

  const getItemQuantity = (itemId) => cart.find(c => c.id === itemId)?.quantity || 0

  const filteredItems = useMemo(() => {
    const q = (searchQuery || '').toLowerCase()
    return (menuItems || []).filter(item => {
      if (filterMode === 'veg' && !item.veg) return false
      if (filterMode === 'popular' && !item.popular) return false
      if (!q) return true
      return (item.name || '').toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q)
    })
  }, [menuItems, filterMode, searchQuery])

  const groupedItems = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      const cat = item.category || 'Others'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(item)
      return acc
    }, {})
  }, [filteredItems])

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart])
  const cartItemsCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart])



  const brandColor = restaurant?.restaurant_profiles?.brand_color || '#f59e0b'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8f9fa',
        paddingBottom: cartItemsCount > 0 ? '90px' : '0',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
      }}
    >
      <header
        style={{
          padding: '1rem',
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}
      >
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
        >
          {'<'}
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
            {restaurant?.name || 'Restaurant'}
          </h1>
          <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
            <span style={{ color: brandColor, fontWeight: 500 }}>⏱️ 15-20 mins</span>
            <span style={{ marginLeft: 16, color: '#f59e0b' }}>⭐ 4.3 (500+ orders)</span>
          </div>
        </div>
<AlertRestaurantButton restaurantId={restaurantId} tableNumber={tableNumber} brandColor={brandColor} />
      </header>

      <div style={{ padding: '1rem', background: '#fff' }}>
        <input
          type="text"
          placeholder="Search for dishes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            fontSize: 16
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '1rem',
          background: '#fff',
          borderBottom: '1px solid #f3f4f6',
          overflowX: 'auto'
        }}
      >
        {[
          { id: 'all', label: 'All Items' },
          { id: 'veg', label: '🟢 Veg Only' },
          { id: 'popular', label: '🔥 Popular' }
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setFilterMode(m.id)}
            style={{
              padding: '8px 16px',
              border: '1px solid #e5e7eb',
              borderRadius: 20,
              background: filterMode === m.id ? brandColor : '#fff',
              color: filterMode === m.id ? '#fff' : '#000',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: 14
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div>
        {Object.entries(groupedItems).map(([category, items]) => (
          <section key={category} style={{ background: '#fff', marginBottom: 8 }}>
            <h2 style={{ margin: 0, padding: '16px 20px 8px', fontSize: 18, fontWeight: 600 }}>
              {category} ({items.length} items)
            </h2>

            {items.map((item) => {
              const quantity = getItemQuantity(item.id)
              const isAvailable = !item.status || item.status === 'available'
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: 16,
                    padding: 20,
                    borderBottom: '1px solid #f3f4f6',
                    opacity: isAvailable ? 1 : 0.6
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      {item.popular && (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 12,
                            background: '#fef3c7',
                            color: '#b45309'
                          }}
                        >
                          🔥 Popular
                        </span>
                      )}
                      {!isAvailable && (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 12,
                            background: '#fee2e2',
                            color: '#b91c1c'
                          }}
                        >
                          Out of stock
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12 }}>{item.veg ? '🟢' : '🔺'}</span>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{item.name}</h3>
                    </div>

                    {item.description && (
                      <p style={{ margin: '0 0 12px 0', color: '#6b7280', fontSize: 14 }}>
                        {item.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>
                        ₹{Number(item.price).toFixed(2)}
                      </span>

                      {quantity > 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: brandColor,
                            borderRadius: 6,
                            overflow: 'hidden'
                          }}
                        >
                          <button
                            onClick={() => updateCartItem(item.id, quantity - 1)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#fff',
                              width: 32,
                              height: 32,
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                          >
                            -
                          </button>
                          <span
                            style={{
                              background: '#fff',
                              color: brandColor,
                              minWidth: 32,
                              height: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 600
                            }}
                          >
                            {quantity}
                          </span>
                          <button
                            onClick={() => {
                              if (!isAvailable) return
                              updateCartItem(item.id, quantity + 1)
                            }}
                            disabled={!isAvailable}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#fff',
                              width: 32,
                              height: 32,
                              cursor: isAvailable ? 'pointer' : 'not-allowed',
                              fontWeight: 600
                            }}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          disabled={!isAvailable}
                          style={{
                            background: isAvailable ? brandColor : '#9ca3af',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: 6,
                            fontWeight: 500,
                            cursor: isAvailable ? 'pointer' : 'not-allowed'
                          }}
                        >
                          Add +
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </section>
        ))}
      </div>

      {cartItemsCount > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: brandColor,
            color: '#fff',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <span>🛒</span>
            <div>
              <div style={{ fontSize: 14 }}>
                {cartItemsCount} Item{cartItemsCount !== 1 ? 's' : ''}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>₹{cartTotal.toFixed(2)}</div>
            </div>
            <span style={{ fontSize: 12, opacity: 0.9 }}>⏱️ 20 mins</span>
          </div>
          <Link
            href={`/order/cart?r=${restaurantId}&t=${tableNumber}`}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              textDecoration: 'none',
              padding: '12px 20px',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            Checkout →
          </Link>
        </div>
      )}
    </div>
  )
}
