import { useRouter } from 'next/router'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '../../services/supabase'
import AlertRestaurantButton from '../../components/AlertRestaurantButton'
import MenuItemCard from '../../components/MenuItemCard'
import HorizontalScrollRow from '../../components/HorizontalScrollRow'

export default function OrderPage() {
  const router = useRouter()
  const { r: restaurantId, t: tableNumber } = router.query

  // 1. Run subscription guard first
  const supabase = getSupabase()
  const [restaurant, setRestaurant] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState([])
  const [cartLoaded, setCartLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [isOutsideHours, setIsOutsideHours] = useState(false)
  const [hoursMessage, setHoursMessage] = useState('')
  const menuMapRef = useRef(new Map())
  const cacheMenuIntoMap = (list) => {
    const m = new Map()
    ;(list || []).forEach((row) => m.set(row.id, row))
    menuMapRef.current = m
  }
  const [justAddedItem, setJustAddedItem] = useState('')
  const [enableMenuImages, setEnableMenuImages] = useState(false)
  const addToastTimeoutRef = useRef(null)

  // 🔧 Fix for "data only comes after clearing browser cache" on QR flows.
  // When a customer opens the QR menu, aggressively clear any old
  // service‑worker caches once. This prevents stale PWA caches from
  // serving outdated data and makes the behaviour equivalent to the
  // manual "Clear site data" workaround.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    ;(async () => {
      try {
        // 1. Unregister any old app-wide service workers (keep FCM worker if present)
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(
          regs.map(async (reg) => {
            const scriptUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || ''
            // Keep the dedicated Firebase messaging SW (used for owner alerts)
            if (scriptUrl.includes('firebase-messaging-sw.js')) return
            try {
              await reg.unregister()
            } catch {
              // ignore – better to fail silently than block the page
            }
          })
        )

        // 2. Clear all HTTP caches for this origin (same as clearing site data caches)
        if (window.caches) {
          const keys = await caches.keys()
          await Promise.all(keys.map((key) => caches.delete(key)))
        }
      } catch (e) {
        // Failing to clean up should never break ordering
        console.warn('[order] cache cleanup skipped:', e?.message || e)
      }
    })()
  }, [])

  useEffect(() => {
    if (!restaurantId || !tableNumber) return
    setCartLoaded(false)
    const key = `cart_${restaurantId}_${tableNumber}`
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(key)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          setCart(Array.isArray(parsed) ? parsed : [])
        } catch {
          setCart([])
        }
      } else {
        setCart([])
      }
    }
    setCartLoaded(true)
  }, [restaurantId, tableNumber])

  useEffect(() => {
    if (!restaurantId || !tableNumber || !cartLoaded) return
    if (typeof window === 'undefined') return
    const key = `cart_${restaurantId}_${tableNumber}`
    localStorage.setItem(key, JSON.stringify(cart))
  }, [cart, restaurantId, tableNumber, cartLoaded])

  useEffect(() => {
    if (!restaurantId) return
    let cancelled = false

    const loadData = async () => {
      try {
        setLoading(true)
        setError('')

        const { data: rest, error: restErr } = await supabase
          .from('restaurants')
          .select('id, name, online_paused, restaurant_profiles(brand_color, phone, features_menu_images_enabled)')
          .eq('id', restaurantId)
          .single()
        if (restErr) throw restErr
        if (!rest) throw new Error('Restaurant not found')
        
        // Check if restaurant is paused
        if (rest.online_paused) {
          if (!cancelled) {
            setIsOutsideHours(true)
            setHoursMessage('Restaurant is currently closed')
            setRestaurant(rest)
            setLoading(false)
          }
          return
        }

        // Check working hours from availability
        const { data: hours, error: hoursErr } = await supabase
          .from('restaurant_hours')
          .select('dow, open_time, close_time, enabled')
          .eq('restaurant_id', restaurantId)

        if (!hoursErr && hours && hours.length > 0) {
          const now = new Date()
          const currentDOW = now.getDay() === 0 ? 7 : now.getDay() // 1=Mon, 7=Sun
          const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
          const todayHours = hours.find(h => h.dow === currentDOW)

          // Check if today is disabled
          if (!todayHours || !todayHours.enabled) {
            if (!cancelled) {
              setIsOutsideHours(true)
              setHoursMessage('Restaurant is closed today')
              setRestaurant(rest)
              setLoading(false)
            }
            return
          }

          // Check if current time is outside working hours
          if (todayHours.open_time && todayHours.close_time) {
            const openTime = todayHours.open_time.substring(0, 5)
            const closeTime = todayHours.close_time.substring(0, 5)
            if (currentTime < openTime || currentTime > closeTime) {
              if (!cancelled) {
                setIsOutsideHours(true)
                setHoursMessage(`Restaurant is closed. Opens at ${openTime}, closes at ${closeTime}`)
                setRestaurant(rest)
                setLoading(false)
              }
              return
            }
          }
        }

        const { data: menu, error: menuErr } = await supabase
          .from('menu_items')
          .select('id, name, price, description, category, veg, status, is_packaged_good, ispopular, image_url')
          .eq('restaurant_id', restaurantId)
          .order('category', { ascending: true })
          .order('name', { ascending: true })
        if (menuErr) throw menuErr

      const cleaned = (menu || []).map((item) => ({
          ...item,
          rating: Number((3.8 + Math.random() * 1.0).toFixed(1)),
          popular: !!item.ispopular
        }))

        if (!cancelled) {
          setRestaurant(rest)
          setMenuItems(cleaned)
          cacheMenuIntoMap(cleaned)
          setIsOutsideHours(false)
          setHoursMessage('')
          setEnableMenuImages(!!rest.restaurant_profiles?.features_menu_images_enabled)
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
          if (typeof newRow.ispopular !== 'undefined') merged.popular = !!newRow.ispopular

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

    // Lightweight "added to cart" feedback
    const name = item.name || 'Item'
    setJustAddedItem(name)
    if (addToastTimeoutRef.current) {
      clearTimeout(addToastTimeoutRef.current)
    }
    addToastTimeoutRef.current = setTimeout(() => {
      setJustAddedItem('')
    }, 1500)
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
      const itemCategory = item.category || 'Others'
      if (categoryFilter !== 'all' && itemCategory !== categoryFilter) return false
      if (!q) return true
      return (
        (item.name || '').toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q)
      )
    })
  }, [menuItems, filterMode, searchQuery, categoryFilter])

  const categoryChips = useMemo(() => {
    const set = new Set()
    ;(menuItems || []).forEach((item) => {
      const cat = item.category || 'Others'
      set.add(cat)
    })
    return Array.from(set)
  }, [menuItems])

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

  // Show blocked message if outside working hours or paused
  if (isOutsideHours) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>🕐 {hoursMessage}</h1>
        </div>
      </div>
    )
  }

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
              {restaurant?.name || 'Restaurant'}
            </h1>
            {tableNumber && (
              <span
                style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  color: '#4b5563',
                  whiteSpace: 'nowrap',
                }}
              >
                Table {tableNumber}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
            <span style={{ color: brandColor, fontWeight: 500 }}>⏱️ 15-20 mins</span>
            <span style={{ marginLeft: 16, color: '#f59e0b' }}>⭐ 4.3 (500+ orders)</span>
          </div>
        </div>
        <AlertRestaurantButton restaurantId={restaurantId} tableNumber={tableNumber} brandColor={brandColor} />
      </header>

      <div
        style={{
          padding: '1rem',
          background: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 9999,
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: '#9ca3af',
            }}
          >
            🔍
          </span>
          <input
            type="text"
            placeholder="Search for dishes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              height: 32,
              paddingLeft: 0,
              background: 'transparent',
              fontSize: 14,
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              style={{
                border: 'none',
                background: 'transparent',
                color: '#9ca3af',
                borderRadius: 9999,
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>
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
          { id: 'popular', label: '🔥 Offers' }
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

      {categoryChips.length > 1 && (
        <div
          className="sales-carousel"
          style={{
            padding: '0 1rem 0.75rem',
            background: '#fff',
            borderBottom: '1px solid #f3f4f6',
          }}
        >
          {['all', ...categoryChips].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`sales-carousel-btn${categoryFilter === cat ? ' active' : ''}`}
              style={{
                background: categoryFilter === cat ? brandColor : '#f9fafb',
                color: categoryFilter === cat ? '#fff' : '#374151',
                borderColor: categoryFilter === cat ? brandColor : '#e5e7eb',
              }}
            >
              {cat === 'all' ? 'All categories' : cat}
            </button>
          ))}
        </div>
      )}

      <div>
        {!loading && !error && menuItems.length === 0 && (
          <div
            style={{
              padding: '2rem 1.5rem',
              textAlign: 'center',
              color: '#4b5563',
            }}
          >
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Menu not available</h2>
            <p style={{ margin: 0, fontSize: 14 }}>Please contact the staff for today&apos;s menu.</p>
          </div>
        )}

        {!loading && !error && menuItems.length > 0 && Object.keys(groupedItems).length === 0 && (
          <div
            style={{
              padding: '2rem 1.5rem',
              textAlign: 'center',
              color: '#4b5563',
            }}
          >
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>No dishes match your search</h2>
            <p style={{ margin: '0 0 12px 0', fontSize: 14 }}>
              Try clearing filters or searching for a different dish.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setFilterMode('all')
                setCategoryFilter('all')
              }}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                border: '1px solid #e5e7eb',
                background: '#fff',
                color: '#111827',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Clear filters
            </button>
          </div>
        )}

        {enableMenuImages ? (
          // NEW LAYOUT: HorizontalScrollRow with MenuItemCard (when images enabled)
          Object.entries(groupedItems).map(([category, items]) => (
            <section key={category} style={{ background: '#fff', marginBottom: 8, paddingBottom: 1 }}>
              <HorizontalScrollRow
                title={category}
                count={items.length}
                items={items}
                renderItem={(item) => {
                  const quantity = getItemQuantity(item.id)
                  return (
                    <div style={{ minWidth: '240px', maxWidth: '240px' }}>
                      <MenuItemCard
                        item={item}
                        quantity={quantity}
                        onAdd={() => addToCart(item)}
                        onRemove={() => updateCartItem(item.id, quantity - 1)}
                        showImage={true}
                      />
                    </div>
                  )
                }}
              />
            </section>
          ))
        ) : (
          // OLD LAYOUT: Simple vertical list (when images disabled)
          Object.entries(groupedItems).map(([category, items]) => (
            <section key={category} style={{ background: '#fff', marginBottom: 8, padding: '12px 16px' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px 0', color: '#111827' }}>
                {category} ({items.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {items.map((item) => {
                  const quantity = getItemQuantity(item.id);
                  const isOutOfStock = item.status === 'out_of_stock' || item.available === false;
                  return (
                    <div 
                      key={item.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: 12,
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        background: isOutOfStock ? '#f9fafb' : '#fff',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ flexShrink: 0 }}>
                            {item.veg ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <rect x="1" y="1" width="22" height="22" stroke="#166534" strokeWidth="2" />
                                <circle cx="12" cy="12" r="6" fill="#166534" />
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <rect x="1" y="1" width="22" height="22" stroke="#991b1b" strokeWidth="2" />
                                <path d="M12 6L18 16H6L12 6Z" fill="#991b1b" />
                              </svg>
                            )}
                          </span>
                          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>
                            {item.name}
                          </h4>
                        </div>
                        {item.category && (
                          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>
                            [{item.category}]
                          </div>
                        )}
                        <div style={{ fontSize: 16, fontWeight: 700, color: brandColor }}>
                          ₹{Number(item.price).toFixed(2)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {quantity === 0 ? (
                          <button
                            onClick={() => addToCart(item)}
                            disabled={isOutOfStock}
                            style={{
                              padding: '8px 16px',
                              background: isOutOfStock ? '#e5e7eb' : brandColor,
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                              opacity: isOutOfStock ? 0.6 : 1,
                            }}
                          >
                            {isOutOfStock ? 'OUT OF STOCK' : 'ADD'}
                          </button>
                        ) : (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            background: `${brandColor}10`,
                            padding: 4,
                            borderRadius: 6,
                            border: `1px solid ${brandColor}`,
                          }}>
                            <button
                              onClick={() => updateCartItem(item.id, quantity - 1)}
                              style={{
                                width: 28,
                                height: 28,
                                border: 'none',
                                background: 'transparent',
                                color: brandColor,
                                fontWeight: 'bold',
                                fontSize: 16,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              −
                            </button>
                            <span style={{ fontSize: 14, fontWeight: 700, color: brandColor, minWidth: 20, textAlign: 'center' }}>
                              {quantity}
                            </span>
                            <button
                              onClick={() => addToCart(item)}
                              style={{
                                width: 28,
                                height: 28,
                                border: 'none',
                                background: 'transparent',
                                color: brandColor,
                                fontWeight: 'bold',
                                fontSize: 16,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {justAddedItem && (
        <div
          style={{
            position: 'fixed',
            bottom: cartItemsCount > 0 ? 56 : 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#111827',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 999,
            fontSize: 13,
            boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
          }}
        >
          Added to cart: <span style={{ fontWeight: 600 }}>{justAddedItem}</span>
        </div>
      )}

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
            View Cart
          </Link>
        </div>
      )}
    </div>
  )
}
