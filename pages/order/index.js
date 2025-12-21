import { useRouter } from 'next/router'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '../../services/supabase'
import AlertRestaurantButton from '../../components/AlertRestaurantButton'
import MenuItemCard from '../../components/MenuItemCard'
import HorizontalScrollRow from '../../components/HorizontalScrollRow'
import VariantSelector from '../../components/VariantSelector'
import VariantEditModal from '../../components/VariantEditModal'

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

  // Variant state
  const [showVariantSelector, setShowVariantSelector] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [editingVariantItem, setEditingVariantItem] = useState(null)
  
  // Carousel Logic
  const carouselRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const checkScroll = () => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [menuItems]); // Re-check when menu items (and thus categories) load

  const scrollCarousel = (direction) => {
    if (carouselRef.current) {
      const scrollAmount = 200;
      carouselRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkScroll, 300);
    }
  };

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

        // 1. Fetch Restaurant Info
        const { data: rest, error: restErr } = await supabase
          .from('restaurants')
          .select('id, name, online_paused, store_notice_enabled, store_notice_msg, restaurant_profiles(brand_color, phone, features_menu_images_enabled)')
          .eq('id', restaurantId)
          .single()
        
        if (restErr) throw restErr
        if (!rest) throw new Error('Restaurant not found')

        // 2. Check Hours
        if (rest.online_paused) {
          if (!cancelled) {
            setIsOutsideHours(true)
            setHoursMessage('Restaurant is currently closed')
            setRestaurant(rest)
            setLoading(false)
          }
          return
        }

        const { data: hours } = await supabase
          .from('restaurant_hours')
          .select('dow, open_time, close_time, enabled')
          .eq('restaurant_id', restaurantId)

        if (hours && hours.length > 0) {
           const now = new Date()
           const currentDOW = now.getDay() === 0 ? 7 : now.getDay()
           const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
           const todayHours = hours.find(h => h.dow === currentDOW)

           if (!todayHours || !todayHours.enabled) {
              if (!cancelled) {
                setIsOutsideHours(true)
                setHoursMessage('Restaurant is closed today')
                setRestaurant(rest)
                setLoading(false)
              }
              return
           }

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

        // 3. Fetch Menu
        const { data: rawItems, error: menuErr } = await supabase
          .from('menu_items')
          .select(`
            id, name, price, description, category, veg, status, is_packaged_good, ispopular, image_url, has_variants,
            menu_item_variants(
              variant_templates(id, name)
            )
          `)
          .eq('restaurant_id', restaurantId)
          .order('category', { ascending: true })
          .order('name', { ascending: true })

        if (menuErr) throw menuErr

        // 4. Fetch Variant Pricing
        const finalItems = (rawItems || []).map(i => ({ ...i })); 
        // Filter only valid items with explicit IDs
        const variantItemIds = finalItems.filter(i => i && i.has_variants && i.id).map(i => i.id);

        const vMap = new Map();
        if (variantItemIds.length > 0) {
           // Use simpler join syntax. Supabase usually auto-detects if there's one FK.
           // If that fails, we can reference the column name explicitly if needed.
           const { data: vpData, error: vpErr } = await supabase
             .from('variant_pricing')
             .select(`
                menu_item_id, price, is_available,
                variant_options (id, name, display_order, template_id)
             `)
             .in('menu_item_id', variantItemIds);
           
           if (vpErr) {
             console.error('Variant pricing load error:', vpErr);
             // Don't crash entire menu, just log
           } else {
             (vpData || []).forEach(vp => {
                if (!vp.menu_item_id || !vp.variant_options) return;
                
                if (!vMap.has(vp.menu_item_id)) vMap.set(vp.menu_item_id, []);
                vMap.get(vp.menu_item_id).push({
                  variant_id: vp.variant_options.id,
                  variant_name: vp.variant_options.name,
                  price: vp.price,
                  is_available: vp.is_available,
                  display_order: vp.variant_options.display_order
                });
             });
           }
        }

        // 5. Transform
        const transformed = finalItems.map(item => {
           if (!item) return null;
           const variants = vMap.get(item.id) || [];
           
           let tName = 'Options';
           if (item.menu_item_variants && item.menu_item_variants[0] && item.menu_item_variants[0].variant_templates) {
              tName = item.menu_item_variants[0].variant_templates.name;
           }

           return {
             ...item,
             variants: variants.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
             variant_template_name: item.has_variants ? tName : null,
             rating: 4.8, // Static rating to prevent hydration mismatch errors
             popular: !!item.ispopular
           };
        }).filter(Boolean); // remove any nulls

        if (!cancelled) {
          setRestaurant(rest)
          setMenuItems(transformed)
          cacheMenuIntoMap(transformed)
          setIsOutsideHours(false)
          setHoursMessage('')
          setEnableMenuImages(!!rest.restaurant_profiles?.features_menu_images_enabled)
        }

      } catch (e) {
        console.error('Load Error:', e);
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
  
  // Handle adding variant from modal
  const handleVariantAdd = (variantItem) => {
    // variantItem already has quantity, price, selectedVariant
    setCart(prev => {
      // Logic for variants: treat as distinct based on variant_id
      // Check if this exact variant is already in cart
      const existingIdx = prev.findIndex(c => c.id === variantItem.id && c.selectedVariant?.variant_id === variantItem.selectedVariant?.variant_id)
      
      if (existingIdx >= 0) {
         const copy = [...prev]
         copy[existingIdx].quantity += variantItem.quantity
         return copy
      }
      return [...prev, variantItem]
    })
    
    // Feedback
    const name = variantItem.displayName || variantItem.name
    setJustAddedItem(name)
    if (addToastTimeoutRef.current) clearTimeout(addToastTimeoutRef.current)
    addToastTimeoutRef.current = setTimeout(() => setJustAddedItem(''), 1500)
  }

  // Handle updates from Edit Modal (deep match)
  const handleVariantEditUpdate = (targetItem, quantity) => {
    const isMatch = (c) => {
      if (c.id !== targetItem.id) return false;
      if (targetItem.selectedVariant) {
        return c.selectedVariant?.variant_id === targetItem.selectedVariant?.variant_id;
      }
      return !c.selectedVariant;
    };

    if (quantity === 0) {
      setCart(prev => prev.filter(c => !isMatch(c)));
    } else {
      setCart(prev => prev.map(c => isMatch(c) ? { ...c, quantity } : c));
    }
  }

  const addToCart = (item) => {
    if (item.status && item.status !== 'available') {
      alert('This item is currently out of stock.')
      return
    }

    if (item.has_variants) {
      setSelectedItem(item)
      setShowVariantSelector(true)
      return
    }

    setCart(prev => {
      const existing = prev.find(c => c.id === item.id && !c.selectedVariant)
      if (existing) return prev.map(c => c.id === item.id && !c.selectedVariant ? { ...c, quantity: c.quantity + 1 } : c)
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

  const getItemQuantity = (itemId) => {
    // If exact variant matching needed, we'd need variantId. 
    // Here we return TOTAL quantity of that item (all variants summed)
    return cart.filter(c => c.id === itemId).reduce((sum, c) => sum + (c.quantity || 1), 0)
  }

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
    <div className="cust-page">
      <header className="cust-header">
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

      {/* Public Store Notice Banner */}
      {restaurant?.store_notice_enabled && restaurant?.store_notice_msg && (
        <div style={{
          background: '#fff7ed', 
          borderBottom: '1px solid #ffedd5',
          padding: '12px 16px',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start'
        }}>
           <span style={{ fontSize: 18 }}>📢</span>
           <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#9a3412', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Store Notice
              </div>
              <div style={{ fontSize: 14, color: '#ea580c', lineHeight: 1.4, fontWeight: 500 }}>
                {restaurant.store_notice_msg}
              </div>
           </div>
        </div>
      )}

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
        <div style={{ padding: '0 1rem 0.75rem', background: '#fff', borderBottom: '1px solid #f3f4f6' }}>
          <div className="carousel-container">
            {showLeftArrow && (
              <button className="carousel-btn left" onClick={() => scrollCarousel('left')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
            )}
            <div 
              className="category-carousel" 
              ref={carouselRef}
              onScroll={checkScroll}
            >
              <button
                onClick={() => setCategoryFilter('all')}
                className={`category-chip ${categoryFilter === 'all' ? 'category-chip-active' : ''}`}
                style={categoryFilter === 'all' ? { background: brandColor, borderColor: brandColor, color: '#fff' } : {}}
              >
                All categories
              </button>
              {categoryChips.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`category-chip ${categoryFilter === cat ? 'category-chip-active' : ''}`}
                  style={categoryFilter === cat ? { background: brandColor, borderColor: brandColor, color: '#fff' } : {}}
                >
                  {cat}
                </button>
              ))}
            </div>
            {showRightArrow && (
              <button className="carousel-btn right" onClick={() => scrollCarousel('right')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        {error && (
          <div style={{ padding: '1rem', color: '#dc2626', background: '#fee2e2', margin: '1rem', borderRadius: 8, textAlign: 'center' }}>
            <p style={{fontWeight: 'bold', marginBottom: 4}}>Unable to load menu</p>
            <p style={{fontSize: '0.9em', marginBottom: 12}}>{error}</p>
            <button 
              onClick={() => window.location.reload()}
              style={{ padding: '6px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        )}
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
                  const totalQty = getItemQuantity(item.id)
                  // For variants, we force "ADD" state (qty=0) but show badge
                  const passQty = item.has_variants ? 0 : totalQty
                  const badge = item.has_variants ? totalQty : 0
                  
                  return (
                    <div style={{ minWidth: '240px', maxWidth: '240px' }}>
                      <MenuItemCard
                        item={item}
                        quantity={passQty}
                        badge={badge}
                        onAdd={() => addToCart(item)}
                        onRemove={() => updateCartItem(item.id, passQty - 1)}
                        onEdit={item.has_variants ? () => setEditingVariantItem(item) : undefined}
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
                  const totalQty = getItemQuantity(item.id);
                  const isOutOfStock = item.status === 'out_of_stock' || item.available === false;
                  
                  // Logic for manual list rendering (No-Image mode)
                  // If variant, show simple Add button that opens popup
                  const showStepper = !item.has_variants && totalQty > 0;
                  
                  return (
                    <div 
                      key={item.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: 12,
                        border: '1px solid #e5e7eb',
                        borderTop: `4px solid ${isOutOfStock ? '#f97316' : '#16a34a'}`,
                        borderRadius: 8,
                        background: isOutOfStock ? '#f9fafb' : '#fff',
                        overflow: 'hidden',
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
                        {isOutOfStock || !showStepper ? (
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
                            {item.has_variants && totalQty > 0 && (
                                <span style={{marginLeft: 6, fontSize: 11, background: '#f97316', color: 'white', padding: '1px 6px', borderRadius: 99}}>
                                  {totalQty}
                                </span>
                            )}
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
                              onClick={() => updateCartItem(item.id, totalQty - 1)}
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
                              {totalQty}
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
          className="cust-cart-bar"
          style={{ background: brandColor }}
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


      {showVariantSelector && selectedItem && (
        <VariantSelector
          item={selectedItem}
          onSelect={handleVariantAdd}
          onClose={() => setShowVariantSelector(false)}
          showImage={enableMenuImages}
          gstEnabled={false} 
          pricesIncludeTax={true}
        />
      )}

      {editingVariantItem && (
        <VariantEditModal
          item={editingVariantItem}
          cartItems={cart.filter(c => c.id === editingVariantItem.id)}
          onUpdate={handleVariantEditUpdate}
          onClose={() => setEditingVariantItem(null)}
          themeColor={brandColor}
        />
      )}

    <style jsx>{`
      .cust-page { min-height: 100vh; background: #f8f9fa; font-family: system-ui, -apple-system, sans-serif; padding-bottom: 90px; }
      @media (min-width: 768px) { .cust-page { padding-bottom: 0; max-width: 800px; margin: 0 auto; background: #fff; box-shadow: 0 0 40px rgba(0,0,0,0.05); min-height: 100vh; position: relative; } }
      
      .cust-header { padding: 16px; background: white; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 50; }
      
      .cust-cart-bar { position: fixed; bottom: 0; left: 0; right: 0; color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; z-index: 100; box-shadow: 0 -4px 10px rgba(0,0,0,0.1); }
      @media (min-width: 768px) { .cust-cart-bar { position: sticky; bottom: 20px; left: 20px; right: 20px; width: calc(100% - 40px); margin: 0 auto 20px auto; border-radius: 12px; } }
      
      /* Additional responsive helpers can be added here */
      
      .search-container:focus-within {
        border-color: #d1d5db !important;
        background: #fff !important;
        box-shadow: 0 0 0 3px rgba(0,0,0,0.05);
      }

      /* Carousel CSS */
      .carousel-container {
        position: relative;
        display: flex;
        align-items: center;
      }
      .category-carousel {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 4px 0;
        flex-grow: 1;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
        scroll-behavior: smooth;
      }
      .category-carousel::-webkit-scrollbar { display: none; }
      
      .category-chip {
        flex-shrink: 0;
        padding: 6px 16px;
        border-radius: 100px;
        border: 1px solid #e5e7eb;
        background: #f9fafb;
        color: #374151;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
      }
      
      .carousel-btn {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 1px solid #e5e7eb;
        background: white;
        color: #f97316;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        z-index: 10;
        transition: all 0.2s;
        padding: 0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .carousel-btn:hover {
        background: #fff7ed;
        border-color: #f97316;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      }
      .carousel-btn.left { 
        left: 0;
        background: linear-gradient(90deg, white 50%, rgba(255,255,255,0.9)); 
      }
      .carousel-btn.right { 
        right: 0;
        background: linear-gradient(-90deg, white 50%, rgba(255,255,255,0.9));
      }
    `}</style>
    </div>
  );
}
