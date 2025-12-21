import { useRouter } from 'next/router'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '../../services/supabase'
import AlertRestaurantButton from '../../components/AlertRestaurantButton'
import MenuItemCard from '../../components/MenuItemCard'
import HorizontalScrollRow from '../../components/HorizontalScrollRow'
import VariantSelector from '../../components/VariantSelector'
import VariantEditModal from '../../components/VariantEditModal'

import Head from 'next/head'

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
  
  const [dismissedNotice, setDismissedNotice] = useState(false);
  
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

        // 5. Fetch Upsells (Add-ons)
        const { data: upsellsData } = await supabase
          .from('menu_items_with_upsells')
          .select('menu_item_id, upsells')
          .in('menu_item_id', finalItems.map(i => i.id));
        
        const upsellMap = new Map();
        (upsellsData || []).forEach(row => {
            upsellMap.set(row.menu_item_id, row.upsells);
        });

        // 6. Merge Variants and Upsells
        finalItems.forEach(item => {
            if (vMap.has(item.id)) {
                // Attach variants
                item.variants = vMap.get(item.id).sort((a,b) => (a.display_order || 0) - (b.display_order || 0));
            }
            // Attach upsells (treat as addon_groups for compatibility if VariantSelector expects it, or update it)
            // The new Upsells view returns [{ id, name, price, ... }]
            // VariantSelector might need update. For now, let's map it to a "Suggested Extras" group.
            const rawUpsells = upsellMap.get(item.id) || [];
            if (rawUpsells.length > 0) {
               item.addon_groups = [{
                 id: 'upsells-group',
                 name: 'Suggested Extras',
                 min_selections: 0,
                 max_selections: null,
                 options: rawUpsells.map(u => ({
                    id: u.id,
                    name: u.name,
                    price: u.price,
                    is_active: u.status === 'available',
                    veg: u.veg,
                    image_url: u.image_url
                 }))
               }];
               item.has_addons = true;
            } else {
               item.addon_groups = [];
               item.has_addons = false;
            }
        });

        // 7. Transform (add static data, etc.)
        const transformed = finalItems.map(item => {
           if (!item) return null;
           
           let tName = 'Options';
           if (item.menu_item_variants && item.menu_item_variants[0] && item.menu_item_variants[0].variant_templates) {
              tName = item.menu_item_variants[0].variant_templates.name;
           }

           return {
             ...item,
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

    setCart(prev => {
      const existing = prev.find(c => c.id === item.id && !c.selectedVariant)
      if (existing) return prev.map(c => c.id === item.id && !c.selectedVariant ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { ...item, quantity: 1 }]
    })
  }

  const handleAddItem = (item) => {
    // If item has variants OR add-ons, open selector
    if ((item.has_variants && item.variants?.length > 0) || item.has_addons) {
      setSelectedItem(item)
      setShowVariantSelector(true)
    } else {
      addToCart(item)
      
      // Show simple toast feedback
      const toast = document.getElementById('toast-feedback');
      if (toast) {
        toast.textContent = `Added ${item.name}`;
        toast.className = "show";
        // Clear existing timeout to restart duration
        if (addToastTimeoutRef.current) clearTimeout(addToastTimeoutRef.current);
        addToastTimeoutRef.current = setTimeout(() => { 
          toast.className = toast.className.replace("show", ""); 
        }, 2000);
      }
    }
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
    <div className="cust-page" style={{ '--brand': brandColor }}>
      <Head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <title>{restaurant?.name || 'Cafe QR Menu'}</title>
      </Head>
      <header className="cust-header">
        <button
          onClick={() => router.back()}
          className="header-back-btn"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ 
              margin: 0, 
              fontSize: 20, 
              fontWeight: 900, 
              color: '#0f172a', 
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {restaurant?.name || 'Restaurant'}
            </h1>
            {tableNumber && (
              <span className="table-badge">
                T-{tableNumber}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f0fdf4', color: '#15803d', padding: '2px 8px', borderRadius: 99, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              15-20 min
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fffbeb', color: '#b45309', padding: '2px 8px', borderRadius: 99, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="#b45309" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              4.3 (500+)
            </div>
          </div>
        </div>
        <AlertRestaurantButton restaurantId={restaurantId} tableNumber={tableNumber} brandColor={brandColor} />
      </header>

      {/* Public Store Notice Banner */}
      {restaurant?.store_notice_enabled && restaurant?.store_notice_msg && !dismissedNotice && (
        <div style={{
          margin: '12px 16px 4px',
          padding: '16px',
          background: `linear-gradient(135deg, ${brandColor}08 0%, ${brandColor}15 100%)`,
          borderRadius: '24px',
          border: `1.5px solid ${brandColor}20`,
          boxShadow: `0 4px 15px ${brandColor}10`,
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
          position: 'relative',
          animation: 'slideInDown 0.5s ease-out'
        }}>
           <div style={{
             background: 'var(--brand)15',
             width: 42,
             height: 42,
             borderRadius: 12,
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'center',
             flexShrink: 0
           }}>
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
               <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
               <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
             </svg>
           </div>
           
           <div style={{ flex: 1, paddingRight: 24 }}>
              <div style={{ 
                fontSize: 12, 
                fontWeight: 800, 
                color: 'var(--brand)', 
                marginBottom: 4, 
                textTransform: 'uppercase', 
                letterSpacing: '0.08em',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                Store Notice
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--brand)' }}></span>
              </div>
              <div style={{ 
                fontSize: 15, 
                color: '#475569', 
                lineHeight: 1.5, 
                fontWeight: 500,
                letterSpacing: '-0.01em'
              }}>
                {restaurant.store_notice_msg}
              </div>
           </div>

           <button 
             onClick={() => setDismissedNotice(true)}
             style={{
               position: 'absolute',
               top: 12,
               right: 12,
               background: 'rgba(0,0,0,0.05)',
               border: 'none',
               width: 24,
               height: 24,
               borderRadius: 99,
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center',
               cursor: 'pointer',
               color: 'var(--brand)',
               fontSize: 12,
               padding: 0,
             }}
             onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.1)'}
             onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
           >
             ✕
           </button>
        </div>
      )}

      <style jsx>{`
        @keyframes slideInDown {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div style={{ background: '#fff' }}>
        <div style={{ padding: '8px 16px 16px' }}>
          <div className="search-box premium-search">
             <div className="search-icon-wrapper">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                 <circle cx="11" cy="11" r="8"></circle>
                 <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
               </svg>
             </div>
             <input
               type="text"
               placeholder="Search for dishes, cuisines..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
             />
             {searchQuery && (
               <button 
                 onClick={() => setSearchQuery('')} 
                 className="search-clear-btn"
                 style={{ animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
               >
                 ✕
               </button>
             )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '0 16px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[
            { id: 'all', label: 'All Items' },
            { id: 'veg', label: 'Veg Only' },
            { id: 'popular', label: 'Offers' }
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setFilterMode(m.id)}
              className={`mode-filter-btn ${filterMode === m.id ? 'active' : ''}`}
              style={filterMode === m.id ? { background: 'var(--brand)', color: '#fff' } : {}}
            >
              {m.label}
            </button>
          ))}
        </div>
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
                        onAdd={() => handleAddItem(item)}
                        onRemove={() => updateCartItem(item.id, passQty - 1)}
                        onEdit={item.has_variants ? () => setEditingVariantItem(item) : undefined}
                        showImage={true}
                        highlightColor={brandColor}
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
            <section key={category} style={{ background: 'transparent', marginBottom: 24, padding: '0 16px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12, 
                marginBottom: 16,
                marginTop: 8
              }}>
                <div style={{ width: 4, height: 24, background: brandColor, borderRadius: 4 }}></div>
                <h3 style={{ 
                  fontSize: 18, 
                  fontWeight: 800, 
                  margin: 0, 
                  color: '#1e293b', 
                  letterSpacing: '-0.02em',
                  textTransform: 'capitalize'
                }}>
                  {category} <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 500, marginLeft: 4 }}>({items.length})</span>
                </h3>
              </div>
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
                        gap: 16,
                        padding: '16px',
                        background: isOutOfStock ? '#fcfcfc' : '#ffffff',
                        border: '1px solid #f1f5f9',
                        borderLeft: `3px solid ${isOutOfStock ? '#cbd5e1' : brandColor}`,
                        borderRadius: '16px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                        overflow: 'hidden',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.04)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)';
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{ 
                            flexShrink: 0, 
                            display: 'flex', 
                            padding: 2, 
                            borderRadius: 4, 
                            border: `0.5px solid ${item.veg ? '#16653433' : '#991b1b33'}`, 
                            background: item.veg ? '#16a34a08' : '#dc262608' 
                          }}>
                            {item.veg ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <rect x="1" y="1" width="22" height="22" stroke="#10b981" strokeWidth="2" />
                                <circle cx="12" cy="12" r="6" fill="#10b981" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <rect x="1" y="1" width="22" height="22" stroke="#ef4444" strokeWidth="2" />
                                <path d="M12 6L18 16H6L12 6Z" fill="#ef4444" />
                              </svg>
                            )}
                          </span>
                          <h4 style={{ 
                            margin: 0, 
                            fontSize: 16, 
                            fontWeight: 700, 
                            color: '#1e293b', 
                            letterSpacing: '-0.02em',
                            lineHeight: 1.2
                          }}>
                            {item.name}
                          </h4>
                        </div>

                        {item.category && (
                          <div style={{ 
                            fontSize: 10, 
                            color: '#64748b', 
                            fontWeight: 700,
                            background: '#f1f5f9',
                            padding: '2px 8px',
                            borderRadius: 99,
                            display: 'inline-block',
                            marginBottom: 8,
                            letterSpacing: '0.02em'
                          }}>
                            {item.category.toUpperCase()}
                          </div>
                        )}

                        <div style={{ 
                          fontSize: 18, 
                          fontWeight: 800, 
                          color: '#0f172a', 
                          display: 'flex', 
                          alignItems: 'baseline',
                          gap: 2
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>₹</span>
                          {Number(item.price).toFixed(2)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', minWidth: 100, justifyContent: 'flex-end' }}>
                        {isOutOfStock ? (
                          <div style={{
                            padding: '8px 12px',
                            background: '#f1f5f9',
                            color: '#94a3b8',
                            borderRadius: '12px',
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            textAlign: 'center',
                            width: '100%'
                          }}>
                            OUT OF STOCK
                          </div>
                        ) : !showStepper ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAddItem(item); }}
                            style={{
                              padding: '10px 24px',
                              background: '#ffffff',
                              color: brandColor,
                              border: `1.5px solid ${brandColor}`,
                              borderRadius: '14px',
                              fontWeight: 800,
                              fontSize: 14,
                              cursor: 'pointer',
                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                              boxShadow: `0 4px 12px ${brandColor}15`,
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = brandColor;
                              e.currentTarget.style.color = '#fff';
                              e.currentTarget.style.transform = 'scale(1.02)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#ffffff';
                              e.currentTarget.style.color = brandColor;
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          >
                            ADD
                            {item.has_variants && totalQty > 0 && (
                                <span style={{
                                  fontSize: 11, 
                                  background: brandColor, 
                                  color: 'white', 
                                  width: 20, 
                                  height: 20, 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  borderRadius: '50%',
                                  border: '2px solid #fff'
                                }}>
                                  {totalQty}
                                </span>
                            )}
                          </button>
                        ) : (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: '#f8fafc',
                            padding: '4px',
                            borderRadius: '14px',
                            border: '1px solid #e2e8f0',
                            gap: 4
                          }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); updateCartItem(item.id, totalQty - 1); }}
                              style={{
                                width: 32,
                                height: 32,
                                border: 'none',
                                background: '#fff',
                                color: brandColor,
                                fontWeight: 800,
                                fontSize: 18,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '10px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#fee2e2';
                                e.currentTarget.style.color = '#ef4444';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#fff';
                                e.currentTarget.style.color = brandColor;
                              }}
                            >
                              −
                            </button>
                            <span style={{ 
                              fontSize: 15, 
                              fontWeight: 800, 
                              color: '#1e293b', 
                              minWidth: 32, 
                              textAlign: 'center',
                              fontVariantNumeric: 'tabular-nums'
                            }}>
                              {totalQty}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); addToCart(item); }}
                              style={{
                                width: 32,
                                height: 32,
                                border: 'none',
                                background: brandColor,
                                color: '#fff',
                                fontWeight: 800,
                                fontSize: 18,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '10px',
                                boxShadow: '0 2px 8px rgba(var(--brand-rgb), 0.25)',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.05)';
                                e.currentTarget.style.filter = 'brightness(1.1)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.filter = 'none';
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
            bottom: cartItemsCount > 0 ? 94 : 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1e293b',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '16px',
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            animation: 'slideUpToast 0.3s ease-out'
          }}
        >
          <div style={{ background: '#10b981', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <span>Added: <span style={{ color: '#94a3b8' }}>{justAddedItem}</span></span>
        </div>
      )}

      {cartItemsCount > 0 && (
        <div
          className="cust-cart-bar"
          style={{ background: brandColor }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.9 }}>
                {cartItemsCount} Item{cartItemsCount !== 1 ? 's' : ''}
              </div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>₹{cartTotal.toFixed(2)}</div>
            </div>
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
      .cust-page { min-height: 100vh; background: #fdfdfd; font-family: 'Inter', system-ui, -apple-system, sans-serif; padding-bottom: 90px; }
      @media (min-width: 768px) { .cust-page { padding-bottom: 0; max-width: 800px; margin: 0 auto; background: #fff; box-shadow: 0 0 60px rgba(0,0,0,0.08); min-height: 100vh; position: relative; } }
      
      .cust-header { padding: 16px; background: rgba(255,255,255,0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 16px; position: sticky; top: 0; z-index: 50; }
      
      .header-back-btn { background: #f8fafc; border: 1px solid #e2e8f0; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #0f172a; transition: all 0.2s; padding: 0px; }
      .header-back-btn:active { transform: scale(0.94); background: #f1f5f9; }

      .table-badge { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 8px; background: var(--brand)10; border: 1.5px solid var(--brand)20; color: var(--brand); white-space: nowrap; text-transform: uppercase; letter-spacing: 0.05em; }

      .search-box { display: flex; align-items: center; background: #f1f5f9; padding: 12px 20px; border-radius: 100px; border: 1.5px solid #f1f5f9; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden; }
      .search-box:focus-within { background: #fff; border-color: ${brandColor}; box-shadow: 0 0 0 4px ${brandColor}15, 0 12px 24px rgba(0, 0, 0, 0.05); }
      .search-icon-wrapper { color: #94a3b8; margin-right: 12px; display: flex; align-items: center; transition: all 0.3s; }
      .search-box:focus-within .search-icon-wrapper { color: ${brandColor}; transform: scale(1.1); }
      .search-box input { flex: 1; border: none; background: transparent; font-size: 16px; font-weight: 600; color: #1e293b; outline: none; letter-spacing: -0.01em; }
      .search-box input::placeholder { color: #94a3b8; font-weight: 500; }
      .search-clear-btn { border: none; background: #e2e8f0; color: #64748b; width: 24px; height: 24px; border-radius: 50%; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
      .search-clear-btn:hover { background: #fee2e2; color: #ef4444; transform: rotate(90deg); }
      
      @keyframes popIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }

      .mode-filter-btn { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border: 1px solid #f1f5f9; border-radius: 100px; background: #fff; color: #64748b; cursor: pointer; white-space: nowrap; font-size: 14px; font-weight: 700; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
      .mode-filter-btn.active { border-color: transparent; border-radius: 100px; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      .mode-filter-btn:active { transform: scale(0.96); }

      .category-carousel { display: flex; gap: 10px; overflow-x: auto; padding: 8px 0; flex-grow: 1; -webkit-overflow-scrolling: touch; scrollbar-width: none; -ms-overflow-style: none; scroll-behavior: smooth; }
      .category-carousel::-webkit-scrollbar { display: none; }
      
      .category-chip { flex-shrink: 0; padding: 8px 20px; border-radius: 100px; border: 1.5px solid #f1f5f9; background: #fff; color: #64748b; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
      .category-chip-active { border-radius: 100px; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }

      .cust-cart-bar { position: fixed; bottom: 16px; left: 16px; right: 16px; color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; z-index: 100; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); animation: slideUpCart 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
      @keyframes slideUpCart { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes slideUpToast { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
      @media (min-width: 768px) { .cust-cart-bar { position: sticky; bottom: 20px; left: 20px; right: 20px; width: calc(100% - 40px); margin: 0 auto 20px auto; } }
      
      .carousel-btn {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 1px solid #e5e7eb;
        background: white;
        color: var(--brand);
        display: flex;
        alignItems: center;
        justifyContent: center;
        cursor: pointer;
        flex-shrink: 0;
        z-index: 10;
        transition: all 0.2s;
        padding: 0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .carousel-btn:hover {
        background: var(--brand)10;
        border-color: var(--brand);
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
