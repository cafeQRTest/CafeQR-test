//pages/owner/menu

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { useRestaurant } from "../../context/RestaurantContext";
import Alert from "../../components/Alert";
import ItemEditor from "../../components/ItemEditor";
import CategoryManager from "../../components/CategoryManager";
import VariantManager from "../../components/VariantManager";
import LibraryPicker from "../../components/LibraryPicker";
import Button from "../../components/ui/Button";
import MenuImageImport from "../../components/MenuImageImport";
import NiceSelect from "../../components/NiceSelect";
import { getSupabase } from "../../services/supabase";
import { useAlert } from "../../context/AlertContext";
import styled, { keyframes } from "styled-components";
import MenuExcelImport from "../../components/MenuExcelImport"; // adjust path

const ToolBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;

  .search-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 9999px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
  }

  .search-icon {
    font-size: 14px;
    color: #9ca3af;
  }

  .input,
  .select {
    padding: 8px 10px;
    border: 1px solid #d6d6d6;
    border-radius: 5px;
    height: 38px;
    color: #000;
    font-size: 16px;
    &:focus {
      outline: none;
      border-color: #f97316;
      box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.2);
    }
  }

  .search-row .input {
    flex: 1;
    border: none;
    height: 32px;
    padding-left: 0;
    background: transparent;
  }

  .search-row .input:focus {
    box-shadow: none;
  }

  .clear-search-btn {
    border: none;
    background: transparent;
    color: #9ca3af;
    border-radius: 9999px;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
  }

  .clear-search-btn:hover {
    background: #e5e7eb;
    color: #4b5563;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    padding: 6px 0;
    border-radius: 5px;
  }

  .flag {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #444;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;

    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: #f97316;
      cursor: pointer;
    }

    span {
      user-select: none;
      white-space: nowrap;
    }
  }

  .toolbar-cta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    @media (max-width: 768px) {
      margin-top: 20px;
      padding-top: 12px; /* Ample space for the floating AI badge */
    }
  }
`;

const pulse = keyframes`
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.4); }
  70% { transform: scale(1.1); box-shadow: 0 0 0 4px rgba(234, 88, 12, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(234, 88, 12, 0); }
`;

const AIBadge = styled.span`
  position: absolute;
  top: -10px;
  left: -2px;
  background: white;
  border: 1.5px solid #ea580c;
  color: #ea580c;
  font-size: 9px;
  font-weight: 900;
  padding: 1px 5px;
  border-radius: 4px;
  line-height: 1;
  z-index: 20;
  box-shadow: 0 2px 4px rgba(0,0,0,0.15);
  animation: ${pulse} 2s infinite;
  pointer-events: none;
  text-transform: uppercase;
  letter-spacing: 0.02em;

  @media (max-width: 600px) {
    top: -11px;
    left: 0px;
    font-size: 8px;
    padding: 1px 4px;
  }
`;

import { useRouter } from "next/router";

const MenuLayoutContainer = styled.div`
  display: flex;
  gap: 24px;
  margin-top: 24px;
  align-items: flex-start;

  @media (max-width: 768px) {
    display: block;
    margin-top: 16px;
  }
`;

const MenuSidebar = styled.aside`
  width: 240px;
  flex-shrink: 0;
  position: sticky;
  top: 20px;
  background: white;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  padding: 20px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid #f3f4f6;

    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #111827;
    }

    .sidebar-count {
      background: #f3f4f6;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      color: #4b5563;
    }
  }


  .sidebar-categories {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sidebar-category-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    color: #4b5563;
    width: 100%;

    &:hover {
      background: #f3f4f6;
      color: #111827;
    }

    &.active {
      background: #fff7ed !important;
      color: #ea580c !important;
      font-weight: 600;
    }

    .category-count {
      font-size: 12px;
      color: #9ca3af;
    }

    &.active .category-count {
      color: #fdba74;
    }
  }

  @media (max-width: 768px) {
    display: none;
  }
`;

const MenuContentArea = styled.div`
  flex: 1;
  min-width: 0;
`;

export default function MenuPage() {
  const router = useRouter();
  const supabase = getSupabase();
  const { showConfirm } = useAlert();
  const { checking } = useRequireAuth(supabase);
  const { restaurant, loading: loadingRestaurant } = useRestaurant();
  const [cachedRestId] = useState(() => {
    if (typeof window !== 'undefined') {
       return localStorage.getItem('last_active_restaurant') || "";
    }
    return "";
  });

  const restaurantId = restaurant?.id || cachedRestId;


const deleteIdsInChunks = useCallback(async (ids, chunkSize = 200) => {
  if (!supabase) throw new Error("Client not ready");
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("menu_items")
      .delete()
      .in("id", chunk)
      .eq("restaurant_id", restaurantId);

    if (error) throw error;
  }
}, [supabase, restaurantId]);



  const [items, setItems] = useState(() => {
    if (typeof window !== 'undefined' && restaurantId) {
      const saved = localStorage.getItem(`menu_items_${restaurantId}`);
      try { return saved ? JSON.parse(saved) : []; } catch(e) {}
    }
    return [];
  });
  const [categories, setCategories] = useState(() => {
    if (typeof window !== 'undefined' && restaurantId) {
      const saved = localStorage.getItem(`categories_${restaurantId}`);
      try { return saved ? JSON.parse(saved) : []; } catch(e) {}
    }
    return [];
  });
  
  // Use cached data to determine initial loading state
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined' && restaurantId) {
       return !localStorage.getItem(`menu_items_${restaurantId}`);
    }
    return true;
  });

  const [error, setError] = useState("");
  const [sidebarCounts, setSidebarCounts] = useState({ total: 0, byCategory: {} });
  const [filterText, setFilterText] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterVeg, setFilterVeg] = useState(false);
  const [filterPackaged, setFilterPackaged] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [editorItem, setEditorItem] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [viewImage, setViewImage] = useState(null);
  const [detailPopupItem, setDetailPopupItem] = useState(null);
  const carouselRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

// 2) pagination state
const PAGE_SIZE = 15;
const [page, setPage] = useState(1);
const [totalCount, setTotalCount] = useState(0);
const totalPages = Math.max(1, Math.ceil((totalCount || 0) / PAGE_SIZE));

// 3) now effects that depend on those states are safe
useEffect(() => {
  setPage(1);
  setSelected(new Set());
}, [filterText, filterCategory, filterVeg, filterPackaged]);


const loadMenuItems = useCallback(async () => {
  if (!supabase || !restaurantId) return;

  setLoading(true);
  setError("");

  try {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from("menu_items")
      .select(
        `id, name, category, price, code_number, hsn, tax_rate, status, veg, is_packaged_good, compensation_cess_rate, ispopular, image_url, has_variants, uom_id,
         menu_item_variants(variant_templates(name)),
         variant_pricing(option_id, price, variant_options(name)),
         menu_item_upsells!menu_item_upsells_parent_menu_item_id_fkey(
           upsell_menu_item_id,
           upsell_item:menu_items!menu_item_upsells_upsell_menu_item_id_fkey(id, name, price)
         )`,
        { count: "exact" }
      )
      .eq("restaurant_id", restaurantId);

    if (filterCategory !== "all") q = q.eq("category", filterCategory);
    if (filterVeg) q = q.eq("veg", true);
    if (filterPackaged) q = q.eq("is_packaged_good", true);

    const search = filterText.trim();
    if (search) {
      q = q.or(
        `name.ilike.%${search}%,category.ilike.%${search}%,code_number.ilike.%${search}%`
      );
    }

    const { data, error, count } = await q
      .order("category", { ascending: true })
      .order("name", { ascending: true })
      .range(from, to);

    if (error) throw error;

    setItems(data || []);
    setTotalCount(count || 0);

    // IMPORTANT: do NOT cache huge menu arrays in localStorage
    // localStorage.setItem(`menu_items_${restaurantId}`, JSON.stringify(data || []));
  } catch (e) {
    setError(e.message || "Failed to load items");
  } finally {
    setLoading(false);
  }
}, [supabase, restaurantId, page, PAGE_SIZE, filterCategory, filterText, filterVeg, filterPackaged]);

  // Check scroll position to toggle arrows
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
  }, [categories]);

  const scrollCarousel = (direction) => {
    if (carouselRef.current) {
      const scrollAmount = 200;
      carouselRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      // checking after scroll animation would ideally be better, but timeout works for simple cases
      setTimeout(checkScroll, 300);
    }
  };

  const [enableMenuImages, setEnableMenuImages] = useState(false);
  
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showVariantManager, setShowVariantManager] = useState(false);
  const [showImageImport, setShowImageImport] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);


  // Helper to refresh categories and items after edits
  const refreshCategories = useCallback(async () => {
    if (!supabase || !restaurantId) return;
    
    // 1. Refresh Categories
    const { data: catData } = await supabase
      .from("categories")
      .select("id,name")
      .or(`is_global.eq.true,restaurant_id.eq.${restaurantId}`)
      .order("name");
    
    if (catData) {
      setCategories(catData);
      localStorage.setItem(`categories_${restaurantId}`, JSON.stringify(catData));
    }

    // 2. Refresh Items (to reflect any category name changes)
    const { data: itemData } = await supabase
      .from("menu_items")
      .select(
        "id, name, category, price, code_number, hsn, tax_rate, status, veg, is_packaged_good, compensation_cess_rate, ispopular, image_url, has_variants, uom_id"
      )
      .eq("restaurant_id", restaurantId)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (itemData) {
      const counts = {};
      itemData.forEach(i => {
        const c = i.category || 'Uncategorized';
        counts[c] = (counts[c] || 0) + 1;
      });
      setSidebarCounts({ total: itemData.length, byCategory: counts });
      setItems(itemData);
      localStorage.setItem(`menu_items_${restaurantId}`, JSON.stringify(itemData));
    }
  }, [supabase, restaurantId]);

  // Persist restaurant ID when known
  useEffect(() => {
    if (restaurant?.id) {
      localStorage.setItem('last_active_restaurant', restaurant.id);
    }
  }, [restaurant]);



  // 0. Load from Cache immediately when restaurantId is known
  useEffect(() => {
    if (!restaurantId) return;
    
    try {
      const cachedItems = localStorage.getItem(`menu_items_${restaurantId}`);
      if (cachedItems) {
        const parsed = JSON.parse(cachedItems);
        if (parsed?.length) {
          setItems(parsed);
          setLoading(false); // Instant load!
        }
      }

      const cachedCats = localStorage.getItem(`categories_${restaurantId}`);
      if (cachedCats) {
        const parsed = JSON.parse(cachedCats);
        if (parsed?.length) setCategories(parsed);
      }
    } catch(e) {
      console.error("Cache load failed", e);
    }
  }, [restaurantId]);

  // 1. Check URL on load (and when items load) to restore editor state
  useEffect(() => {
    if (!router.isReady) return;

    const { edit } = router.query;
    if (edit === 'new') {
      if (!editorItem) setEditorItem({});
    } else if (edit && items.length > 0) {
      const found = items.find(i => i.id === edit);
      if (found && (!editorItem || editorItem.id !== found.id)) {
        setEditorItem(found);
      }
    }
  }, [router.isReady, router.query, loading, items]);

  // 2. Helper to open editor and update URL
  const openEditor = (item) => {
    setEditorItem(item || {});
    const val = item?.id || 'new';
    router.push({
      pathname: router.pathname,
      query: { ...router.query, edit: val }
    }, undefined, { shallow: true });
  };

  // 3. Helper to close editor and clear URL
  const closeEditor = () => {
    setEditorItem(null);
    const { edit, ...rest } = router.query;
    router.push({
      pathname: router.pathname,
      query: rest
    }, undefined, { shallow: true });
  };

  const dataLoadedRef = useRef(false);

  useEffect(() => {
    if (checking || loadingRestaurant || !restaurantId || !supabase) return;
    
    const load = async () => {
      setError("");
      try {
        const { data: cats, error: catsErr } = await supabase
          .from("categories")
          .select("id,name")
          .or(`is_global.eq.true,restaurant_id.eq.${restaurantId}`)
          .order("name");
        if (catsErr) throw catsErr;

        // Fetch settings
        const { data: prof } = await supabase
          .from("restaurant_profiles")
          .select("features_menu_images_enabled")
          .eq("restaurant_id", restaurantId)
          .maybeSingle();
        if (prof) setEnableMenuImages(!!prof.features_menu_images_enabled);

        const { data: its, error: itsErr } = await supabase
          .from("menu_items")
          .select(
            `id, name, category, price, code_number, hsn, tax_rate, status, veg, is_packaged_good, compensation_cess_rate, ispopular, image_url, has_variants, uom_id,
            menu_item_variants(
              variant_templates(name)
            ),
            variant_pricing(
              option_id,
              price,
              variant_options(name)
            ),
            menu_item_upsells!menu_item_upsells_parent_menu_item_id_fkey(
              upsell_menu_item_id,
              upsell_item:menu_items!menu_item_upsells_upsell_menu_item_id_fkey(id, name, price)
            )`
          )
          .eq("restaurant_id", restaurantId)
          .order("category", { ascending: true })
          .order("name", { ascending: true });
        if (itsErr) throw itsErr;

        const newCats = cats || [];
        const newItems = its || [];

        setCategories(newCats);
        
        // Calculate sidebar counts from full menu fetch
        const counts = {};
        newItems.forEach(i => {
          const c = i.category || 'Uncategorized';
          counts[c] = (counts[c] || 0) + 1;
        });
        setSidebarCounts({ total: newItems.length, byCategory: counts });
        
        // Cache to localStorage
        localStorage.setItem(`categories_${restaurantId}`, JSON.stringify(newCats));

        dataLoadedRef.current = true;
      } catch (e) {
        setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [checking, loadingRestaurant, restaurantId, supabase]);

useEffect(() => {
  if (checking || loadingRestaurant || !restaurantId || !supabase) return;
  loadMenuItems();
}, [checking, loadingRestaurant, restaurantId, supabase, loadMenuItems]);


  const visible = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return items.filter((i) => {
      if (filterCategory !== "all" && i.category !== filterCategory)
        return false;
      if (filterVeg && !i.veg) return false;
      if (filterPackaged && !i.is_packaged_good) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q) ||
        (i.code_number || "").toLowerCase().includes(q)
      );
    });
  }, [items, filterText, filterCategory, filterVeg, filterPackaged]);

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const allSelected = useMemo(() => {
    return visible.length > 0 && selected.size === visible.length;
  }, [visible, selected]);

  const toggleSelectAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(visible.map((i) => i.id)));
  }, [allSelected, visible]);

  const applyBulk = useCallback(
    async (status) => {
      if (!supabase) return;
      const ids = Array.from(selected);
      if (ids.length === 0) return;
      setItems((prev) =>
        prev.map((i) => (ids.includes(i.id) ? { ...i, status } : i))
      );
      setSelected(new Set());
      try {
        const { error } = await supabase
          .from("menu_items")
          .update({ status })
          .in("id", ids)
          .eq("restaurant_id", restaurantId);
        if (error) throw error;
      } catch (e) {
        setError(e.message || "Bulk update failed");
      }
    },
    [selected, supabase, restaurantId]
  );

  const hasSelection = useMemo(() => selected.size > 0, [selected]);

  const toggleStatus = useCallback(
    async (id, current) => {
      if (!supabase) return;
      const next = current === "available" ? "out_of_stock" : "available";
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: next } : i))
      );
      try {
        const { error } = await supabase
          .from("menu_items")
          .update({ status: next })
          .eq("id", id)
          .eq("restaurant_id", restaurantId);
        if (error) throw error;
      } catch (e) {
        setError(e.message || "Update failed");
      }
    },
    [supabase, restaurantId]
  );

  const handleSaved = useCallback((updated) => {
    refreshCategories(); // Refresh both items and counts
  }, [refreshCategories]);

  // Compute category counts for sidebar
  const categoryCounts = useMemo(() => {
    const counts = {};
    items.forEach(item => {
      const cat = item.category || 'Uncategorized';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [items]);

  const isInitialLoad = (checking || loadingRestaurant || !restaurantId) && items.length === 0;
  if (isInitialLoad)
    return <p style={{ padding: 24 }}>Loading...</p>;

  return (
    <div className="menu-page">
      <div style={{ maxWidth: '1800px', margin: '0 auto', width: '100%', padding: '0 16px' }}>
      <h1 className="h1">Menu Management</h1>
      {error && <Alert type="error">{error}</Alert>}

      {/* Main Flex Container with Sidebar + Content */}
      <MenuLayoutContainer>
        {/* Left Sidebar - Categories (Desktop Only) */}
        <MenuSidebar>
          <div className="sidebar-header">
            <h3>Categories</h3>
            <span className="sidebar-count">{sidebarCounts.total}</span>
          </div>
          

          {/* Category List */}
          <div className="sidebar-categories">
            <button
              className={`sidebar-category-item ${filterCategory === 'all' ? 'active' : ''}`}
              onClick={() => setFilterCategory('all')}
            >
              <span className="category-name">All Categories</span>
              <span className="category-count">{sidebarCounts.total}</span>
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id || cat.name}
                className={`sidebar-category-item ${filterCategory === cat.name ? 'active' : ''}`}
                onClick={() => setFilterCategory(cat.name)}
              >
                <span className="category-name">{cat.name}</span>
                <span className="category-count">{sidebarCounts.byCategory[cat.name] || 0}</span>
              </button>
            ))}
          </div>
        </MenuSidebar>

        {/* Right Content Area */}
        <MenuContentArea>
          <ToolBar>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
          <div className="search-row search-bar-premium" style={{ flex: 1 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="search-icon-svg">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21L16.65 16.65" />
            </svg>
            <input
              className="input search-input-premium"
              placeholder="Search..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            {filterText && (
              <button
                type="button"
                className="clear-search-btn-premium"
                onClick={() => setFilterText("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          
          <div className="filter-chips" style={{ marginBottom: 0 }}>
            <button 
              className={`filter-chip ${filterVeg ? 'filter-chip-veg-active' : ''}`}
              onClick={() => setFilterVeg(!filterVeg)}
            >
              {filterVeg ? '✓ Veg' : 'Veg Only'}
            </button>
            <button 
              className={`filter-chip ${filterPackaged ? 'filter-chip-pkg-active' : ''}`}
              onClick={() => setFilterPackaged(!filterPackaged)}
            >
              {filterPackaged ? '✓ Packaged' : 'Packaged Only'}
            </button>
          </div>
        </div>
        
        {/* Category Carousel */}
        {/* Category Carousel with Filters */}
        <div className="carousel-container only-mobile">
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
              className={`category-chip ${filterCategory === 'all' ? 'category-chip-active' : ''}`}
              onClick={() => setFilterCategory('all')}
            >
              All Categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat.name}
                className={`category-chip ${filterCategory === cat.name ? 'category-chip-active' : ''}`}
                onClick={() => setFilterCategory(cat.name)}
              >
                {cat.name}
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


        {/* Actions Row */}
        <div className="toolbar-cta">
          {hasSelection && (
            <>
              <Button variant="success" onClick={() => applyBulk("available")}>
                Mark Available
              </Button>
              <Button variant="outline" onClick={() => applyBulk("out_of_stock")}>
                Mark Out of Stock
              </Button>
              <Button
  variant="outline"
  onClick={async () => {
    const ids = Array.from(selected);
    const count = ids.length;

    const ok = await showConfirm(
      `Are you sure you want to delete ${count} selected item${count > 1 ? "s" : ""}?`
    );
    if (!ok) return;

    try {
      setLoading(true);
      await deleteIdsInChunks(ids, 200);

      setSelected(new Set());
      // Reload the current page after delete
      await loadMenuItems();
      setError("");
    } catch (e) {
      setError(e.message || "Failed to delete items");
    } finally {
      setLoading(false);
    }
  }}
  style={{ background: "#fee2e2", color: "#dc2626", borderColor: "#fecaca" }}
>
  Delete Selected ({selected.size})
</Button>

            </>
          )}
          <Button onClick={() => openEditor({})}>Add New Item</Button>
          <Button onClick={() => setShowImageImport(true)} style={{ position: 'relative', overflow: 'visible' }}>
            Import from Image
            <AIBadge>AI</AIBadge>
          </Button>
          <Button onClick={() => setShowExcelImport(true)}>
          Import from Excel
          <AIBadge>AI</AIBadge>
          </Button>
          <Button onClick={() => setShowLibrary(true)}>Add from Library</Button>
          <Button variant="outline" onClick={() => setShowCategoryManager(true)}>Categories</Button>
          <Button variant="outline" onClick={() => setShowVariantManager(true)}>Variants</Button>
        </div>
      </ToolBar>

      <div className="card" style={{ padding: 0 }}>
        
        {/* Mobile List View */}
        <div className="only-mobile">
          {loading ? (
             <div style={{ padding: 20, textAlign: 'center' }}>Loading...</div>
          ) : visible.length === 0 ? (
             <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>No items found.</div>
          ) : (
             <div style={{ display: 'flex', flexDirection: 'column' }}>
               {visible.map(item => {
                 const available = item.status === "available";
                 return (
                   <div 
                     key={item.id} 
                     style={{ padding: 16, borderBottom: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }}
                     onClick={(e) => {
                       if (e.target.closest('button') || e.target.closest('input')) return;
                       setDetailPopupItem(item);
                     }}
                   >
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                       <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                         <input
                           type="checkbox"
                           checked={selected.has(item.id)}
                           onChange={() => toggleSelect(item.id)}
                           style={{ marginTop: 4, width: 18, height: 18, accentColor: '#f97316' }}
                         />
                         <div>
                           <div style={{ fontWeight: 600, fontSize: 15, color: '#111827', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                             {item.name}
                             {item.veg && (
                               <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>VEG</span>
                             )}
                           </div>
                           <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                             {item.category} {item.code_number && `• ${item.code_number}`}
                           </div>
                         </div>
                       </div>
                       <div style={{ textAlign: 'right' }}>
                         <div style={{ fontWeight: 700, color: '#f97316', fontSize: 15 }}>₹{Number(item.price ?? 0).toFixed(2)}</div>
                         <div style={{ fontSize: 11, marginTop: 4 }}>
                            <span style={{ 
                              padding: '2px 6px', borderRadius: 4, 
                              background: available ? '#d1fae5' : '#fee2e2',
                              color: available ? '#065f46' : '#991b1b',
                              fontWeight: 600
                            }}>
                              {available ? 'Available' : 'Out'}
                            </span>
                         </div>
                       </div>
                     </div>

                     <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                       <Button size="sm" variant="outline" onClick={() => openEditor(item)}>Edit</Button>
                       <Button size="sm" variant="outline" onClick={() => toggleStatus(item.id, item.status)}>
                         {available ? "Mark Out" : "Mark Avail"}
                       </Button>
                       <Button size="sm" variant="ghost" onClick={async () => {
                          const ok = await showConfirm("Delete this item?");
                          if (!ok) return;
                          handleDelete([item.id]); // Assuming bulk delete logic or usage of single delete
                       }} style={{ color: '#ef4444' }}>Del</Button>
                     </div>
                   </div>
                 );
               })}
             </div>
          )}
        </div>

        <div className="table-scroll hide-mobile">
          <table className="menu-items-table">
            <thead>
              <tr>
                <th style={{ width: '45px' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />


                </th>
                <th className="col-name" style={{ width: '200px' }}>Name</th>
                <th className="hide-sm" style={{ width: '85px' }}>Code</th>
                <th className="hide-sm col-cat" style={{ width: '130px' }}>Category</th>
                <th style={{ width: '95px' }}>Price</th>
                <th className="hide-sm" style={{ width: '120px' }}>Type</th>
                <th className="hide-sm" style={{ width: '115px' }}>Status</th>
                <th className="hide-sm" style={{ width: '90px' }}>Variants</th>
                <th className="hide-mobile col-actions" style={{ width: '185px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={enableMenuImages ? 10 : 9} style={{ padding: 12 }}>
                    Loading...
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={enableMenuImages ? 10 : 9} style={{ padding: 12, color: "#666" }}>
                    No items found.
                  </td>
                </tr>
              ) : (
                visible.map((item) => {
                  const available = item.status === "available";
                  const typeBadge = item.is_packaged_good ? "Packaged" : "Menu";
                  return (
                    <tr 
                      key={item.id} 
                      className="table-row-hover"
                      onClick={(e) => {
                        // Don't open popup if clicking checkbox or action buttons
                        if (e.target.closest('input[type="checkbox"]') || e.target.closest('.col-actions')) {
                          return;
                        }
                        setDetailPopupItem(item);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ width: '45px' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                        />
                      </td>
                      <td className="col-name" style={{ maxWidth: 220, position: 'relative', width: '200px' }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              overflowWrap: "break-word",
                              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap'
                            }}
                          >
                            {item.name}
                            {item.veg && (
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                VEG
                              </span>
                            )}
                          </div>
                          <span className="only-mobile mobile-actions">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditor(item)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleStatus(item.id, item.status)}
                            >
                              {available ? "Out" : "Avail"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const ok = await showConfirm("Are you sure you want to delete this item?");
                                if (!ok) return;
                                try {
                                  if (!supabase)
                                    throw new Error("Client not ready");
                                  const { error } = await supabase
                                    .from("menu_items")
                                    .delete()
                                    .eq("id", item.id);
                                  if (error) throw error;
                                  setItems((prev) =>
                                    prev.filter((i) => i.id !== item.id)
                                  );
                                } catch (e) {
                                  setError(e.message);
                                }
                              }}
                            >
                              Del
                            </Button>
                          </span>
                        </div>
                        {/* Hover Popup - Outside the main content div */}
                        <div className="item-details-popup">
                          <div className="popup-header">
                            <h4>{item.name}</h4>
                            {item.veg && <span className="popup-veg-badge">VEG</span>}
                          </div>
                          <div className="popup-grid">
                            <div className="popup-field">
                              <span className="popup-label">Code</span>
                              <span className="popup-value">{item.code_number || "—"}</span>
                            </div>
                            <div className="popup-field">
                              <span className="popup-label">Category</span>
                              <span className="popup-value">{item.category || "—"}</span>
                            </div>
                            <div className="popup-field">
                              <span className="popup-label">Price</span>
                              <span className="popup-value popup-price">₹{Number(item.price ?? 0).toFixed(2)}</span>
                            </div>
                            <div className="popup-field">
                              <span className="popup-label">HSN</span>
                              <span className="popup-value">{item.hsn || "—"}</span>
                            </div>
                            <div className="popup-field">
                              <span className="popup-label">Tax %</span>
                              <span className="popup-value">
                                {item.tax_rate != null ? Number(item.tax_rate).toFixed(2) : "—"}
                              </span>
                            </div>
                            <div className="popup-field">
                              <span className="popup-label">Cess %</span>
                              <span className="popup-value">
                                {item.is_packaged_good
                                  ? Number(item.compensation_cess_rate ?? 0).toFixed(2)
                                  : "—"}
                              </span>
                            </div>
                            <div className="popup-field">
                              <span className="popup-label">Type</span>
                              <span className={`popup-badge ${item.is_packaged_good ? 'popup-badge-pkg' : 'popup-badge-menu'}`}>
                                {typeBadge}
                              </span>
                            </div>
                            <div className="popup-field">
                              <span className="popup-label">Status</span>
                              <span className={`popup-badge ${available ? 'popup-badge-available' : 'popup-badge-out'}`}>
                                {available ? "Available" : "Out of Stock"}
                              </span>
                            </div>
                          </div>
                          
                          {/* Variant Details Section */}
                          {item.has_variants && item.variant_pricing && item.variant_pricing.length > 0 && (
                            <div className="popup-variants">
                              <div className="popup-variants-header">
                                <span className="popup-label">Variants</span>
                                <span className="popup-variant-template">
                                  {item.menu_item_variants?.[0]?.variant_templates?.name || "Options"}
                                </span>
                              </div>
                              <div className="popup-variants-list">
                                {item.variant_pricing.map((pricing, idx) => (
                                  <div key={idx} className="popup-variant-item">
                                    <span className="popup-variant-name">
                                      {pricing.variant_options?.name || "Option"}
                                    </span>
                                    <span className="popup-variant-price">
                                      ₹{Number(pricing.price ?? 0).toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td
                        className="hide-sm"
                        style={{ fontFamily: "monospace", fontSize: 13, width: '85px' }}
                      >
                        {item.code_number || "—"}
                      </td>
                      <td className="hide-sm" style={{ width: '130px' }}>{item.category || "—"}</td>
                      <td style={{ fontWeight: 700, color: '#f97316', width: '95px' }}>
                        ₹{Number(item.price ?? 0).toFixed(2)}
                      </td>
                      <td className="hide-sm" style={{ width: '120px' }}>
                        <span
                          className={`pill ${
                            item.is_packaged_good ? "pill--pkg" : "pill--menu"
                          }`}
                        >
                          {typeBadge}
                        </span>
                      </td>
                      <td className="hide-sm" style={{ width: '115px' }}>
                        <span
                          className={`chip ${
                            available ? "chip--avail" : "chip--out"
                          }`}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          {available ? "Available" : "Out of Stock"}
                        </span>
                      </td>
                      <td className="hide-sm" style={{ width: '90px', textAlign: 'center' }}>
                        <span className={`badge-variant ${item.has_variants ? 'badge-variant-yes' : 'badge-variant-no'}`}>
                          {item.has_variants ? "✓" : "✕"}
                        </span>
                      </td>
                      <td className="hide-mobile col-actions" style={{ width: '185px' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: "flex-end",
                            gap: 6,
                            flexWrap: "nowrap",
                          }}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleStatus(item.id, item.status)}
                          >
                            {available ? "Out" : "Avail"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditor(item)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const ok = await showConfirm("Are you sure you want to delete this item?");
                              if (!ok) return;
                              try {
                                if (!supabase)
                                  throw new Error("Client not ready");
                                const { error } = await supabase
                                  .from("menu_items")
                                  .delete()
                                  .eq("id", item.id);
                                if (error) throw error;
                                setItems((prev) =>
                                  prev.filter((i) => i.id !== item.id)
                                );
                              } catch (e) {
                                setError(e.message);
                              }
                            }}
                          >
                            Del
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          gap: 12, 
          padding: '20px 0'
        }}>
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: '#ffffff',
              color: page <= 1 || loading ? '#9ca3af' : '#374151',
              fontSize: '14px',
              fontWeight: 500,
              cursor: page <= 1 || loading ? 'not-allowed' : 'pointer',
              opacity: page <= 1 || loading ? 0.5 : 1
            }}
          >
            Previous
          </button>

          <span style={{ 
            fontSize: '14px',
            fontWeight: 600,
            color: '#374151',
            padding: '0 12px'
          }}>
            Page {page} of {totalPages}
          </span>

          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: '#ffffff',
              color: page >= totalPages || loading ? '#9ca3af' : '#374151',
              fontSize: '14px',
              fontWeight: 500,
              cursor: page >= totalPages || loading ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages || loading ? 0.5 : 1
            }}
          >
            Next
          </button>
        </div>

      </div>

      {/* Detail Popup Modal */}
      {detailPopupItem && (
        <div className="detail-modal-overlay" onClick={() => setDetailPopupItem(null)}>
          <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="detail-modal-header">
              <div>
                <h2>{detailPopupItem.name}</h2>
                {detailPopupItem.veg && <span className="veg-badge">VEG</span>}
              </div>
              <button className="close-btn" onClick={() => setDetailPopupItem(null)}>✕</button>
            </div>

            <div className="detail-modal-body">
              {enableMenuImages && detailPopupItem.image_url && (
                <div className="detail-image-section">
                  <img src={detailPopupItem.image_url} alt={detailPopupItem.name} />
                </div>
              )}

              <div className="detail-info-grid">
                <div className="detail-item">
                  <span className="detail-label">Code</span>
                  <span className="detail-value">{detailPopupItem.code_number || "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Category</span>
                  <span className="detail-value">{detailPopupItem.category || "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Price</span>
                  <span className="detail-value detail-price">₹{Number(detailPopupItem.price ?? 0).toFixed(2)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">HSN Code</span>
                  <span className="detail-value">{detailPopupItem.hsn || "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Tax %</span>
                  <span className="detail-value">
                    {detailPopupItem.tax_rate != null ? Number(detailPopupItem.tax_rate).toFixed(2) + '%' : "—"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Cess %</span>
                  <span className="detail-value">
                    {detailPopupItem.is_packaged_good
                      ? Number(detailPopupItem.compensation_cess_rate ?? 0).toFixed(2) + '%'
                      : "—"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Type</span>
                  <span className="detail-value">
                    {detailPopupItem.is_packaged_good ? "Packaged" : "Menu"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Status</span>
                  <span className="detail-value">
                    {detailPopupItem.status === 'available' ? "Available" : "Out of Stock"}
                  </span>
                </div>
              </div>

              {detailPopupItem.has_variants && detailPopupItem.variant_pricing && detailPopupItem.variant_pricing.length > 0 && (
                <div className="detail-variants-section">
                  <h3>
                    Variants
                    {detailPopupItem.menu_item_variants?.[0]?.variant_templates?.name && (
                      <span className="variant-template-name">
                        ({detailPopupItem.menu_item_variants[0].variant_templates.name})
                      </span>
                    )}
                  </h3>
                  <div className="variant-options-grid">
                    {detailPopupItem.variant_pricing.map((pricing, idx) => (
                      <div key={idx} className="variant-option-card">
                        <span className="variant-option-name">{pricing.variant_options?.name || "Option"}</span>
                        <span className="variant-option-price">₹{Number(pricing.price ?? 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailPopupItem.menu_item_upsells && detailPopupItem.menu_item_upsells.length > 0 && (
                <div className="detail-upsells-section">
                  <h3>Upsells / Add-ons</h3>
                  <div className="upsell-items-grid">
                    {detailPopupItem.menu_item_upsells.map((upsell, idx) => (
                      <div key={idx} className="upsell-item-card">
                        <span className="upsell-item-name">{upsell.upsell_item?.name || "Item"}</span>
                        <span className="upsell-item-price">₹{Number(upsell.upsell_item?.price ?? 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      <style jsx global>{`
        .table-scroll {
          max-height: calc(100vh - 200px);
          overflow-y: auto;
          overflow-x: auto;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x pan-y;
          position: relative;
          background: white;
          width: fit-content;
          max-width: 100%;
          margin: 0;
          padding: 0;
        }

        .card {
          background: white;
        }

        /* Category Carousel */
        .carousel-container {
          position: relative;
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }

        .carousel-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1px solid #fed7aa;
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

        .carousel-btn svg {
          display: block;
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

        @media (pointer: coarse) {
          .carousel-btn {
            display: none !important;
          }
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

        .category-carousel::-webkit-scrollbar {
          display: none; /* Hide scrollbar Chrome/Safari */
        }

        .category-chip {
          flex-shrink: 0;
          padding: 6px 16px;
          border-radius: 100px;
          border: 1px solid #fed7aa;
          background: white;
          color: #1f2937;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .category-chip:hover {
          border-color: #f97316;
          background: #fff7ed;
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.2);
        }

        .category-chip-active {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white;
          border-color: #f97316;
          box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.3);
        }

        .category-chip-active:hover {
          background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
          transform: translateY(-2px);
        }

        /* Filter Chips */
        .filter-chips {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }

        .filter-chip {
          padding: 8px 16px;
          border-radius: 20px;
          border: 2px solid #e5e7eb;
          background: white;
          color: #1f2937;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .filter-chip:hover {
          border-color: #9ca3af;
          background: #f9fafb;
          transform: translateY(-2px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .filter-chip-veg-active {
          background: #166534;
          color: white;
          border-color: #14532d;
          box-shadow: 0 4px 6px -1px rgba(22, 101, 52, 0.4);
        }

        .filter-chip-veg-active:hover {
          background: #14532d;
          transform: translateY(-2px);
        }

        .filter-chip-pkg-active {
          background: #f97316;
          color: white;
          border-color: #ea580c;
          box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.4);
        }

        .filter-chip-pkg-active:hover {
          background: #ea580c;
          transform: translateY(-2px);
        }

        .menu-items-table {
          min-width: 1140px !important;
          border-collapse: collapse !important;
        }

        .menu-items-table th {
          position: sticky;
          top: 0;
          background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%) !important;
          z-index: 20;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          padding: 12px !important;
          border-bottom: 2px solid #f97316 !important;
          color: #1f2937 !important;
          font-weight: 700;
          text-align: left !important;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-sizing: border-box !important;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: middle !important;
          line-height: 16px !important;
          height: 40px;
        }
        
        .menu-items-table th[style*="width"] {
          max-width: var(--col-width);
        }

        .menu-items-table td {
          padding: 12px !important;
          border-bottom: 1px solid #f3f4f6 !important;
          color: #374151 !important;
          font-size: 14px;
          background: white !important;
          transition: all 0.2s ease;
          box-sizing: border-box !important;
          vertical-align: middle;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .menu-items-table tbody tr {
          position: relative;
          transition: all 0.2s ease;
        }

        .menu-items-table tbody tr:hover {
          background: linear-gradient(to right, #fff7ed 0%, #ffffff 100%);
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(249, 115, 22, 0.1);
          z-index: 5;
        }

        .menu-items-table tbody tr:hover td {
          background: transparent;
        }

        .menu-items-table tbody tr:last-child td {
          border-bottom: none;
        }

        .menu-items-table input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #f97316;
          cursor: pointer;
        }
        
        /* Premium Search Bar */
        .search-row.search-bar-premium {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-radius: 9999px; /* Pill shape */
          background: #ffffff;
          border: 1px solid #e5e7eb;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          width: 100%;
        }

        .search-row.search-bar-premium:focus-within {
          border-color: #fdba74; /* Light orange border */
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15), 0 10px 15px -3px rgba(0, 0, 0, 0.05);
          transform: translateY(-1px);
        }

        .search-icon-svg {
          color: #9ca3af;
          flex-shrink: 0;
          transition: color 0.2s;
        }

        .search-row.search-bar-premium:focus-within .search-icon-svg {
          color: #f97316; /* Orange on focus */
        }

        .search-input-premium {
          flex: 1;
          border: none;
          background: transparent;
          padding: 0;
          height: auto;
          font-size: 15px;
          color: #1f2937;
          outline: none;
        }
        
        .search-input-premium::placeholder {
          color: #9ca3af;
        }

        .clear-search-btn-premium {
          background: #f3f4f6;
          color: #6b7280;
          width: 24px;
          height: 24px;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }

        .clear-search-btn-premium:hover {
          background: #fee2e2;
          color: #ef4444;
          transform: scale(1.1);
        }

        .col-name { 
          min-width: 200px;
          font-weight: 600;
          position: relative;
        }
        
        .col-name {
          white-space: normal !important;
          word-wrap: break-word;
        }

        .col-cat { 
          min-width: 130px;
        }

        .col-actions { 
          min-width: 185px;
          text-align: center !important;
        }
        
        .menu-items-table .col-actions {
          text-align: center !important;
          display: table-cell !important;
          vertical-align: middle !important;
          padding: 12px !important;
        }
        
        .menu-items-table th.col-actions {
          padding-top: 12px !important;
          padding-bottom: 12px !important;
        }

        /* Hover Popup */
        .item-details-popup {
          position: absolute;
          left: 0;
          top: 100%;
          width: 400px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
          padding: 16px;
          z-index: 100;
          display: none;
          margin-top: 8px;
        }

        .table-row-hover:hover .item-details-popup {
          display: block;
          animation: popupSlideIn 0.2s ease-out;
        }

        @keyframes popupSlideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .popup-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-bottom: 12px;
          margin-bottom: 12px;
          border-bottom: 2px solid #f97316;
        }

        .popup-header h4 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          color: #111827;
          flex: 1;
        }

        .popup-veg-badge {
          background: #dcfce7;
          color: #166534;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 700;
        }

        .popup-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .popup-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .popup-label {
          font-size: 11px;
          font-weight: 700;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .popup-value {
          font-size: 13px;
          color: #111827;
          font-weight: 500;
        }

        .popup-price {
          color: #f97316;
          font-weight: 700;
          font-size: 15px;
        }

        .popup-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          width: fit-content;
        }

        .popup-badge-menu {
          background: #dbeafe;
          color: #1e40af;
        }

        .popup-badge-pkg {
          background: #fef3c7;
          color: #92400e;
        }

        .popup-badge-available {
          background: #d1fae5;
          color: #065f46;
        }

        .popup-badge-out {
          background: #fee2e2;
          color: #991b1b;
        }

        /* Variant Details in Popup */
        .popup-variants {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #f3f4f6;
        }

        .popup-variants-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .popup-variant-template {
          font-size: 13px;
          font-weight: 600;
          color: #f97316;
          background: #fff7ed;
          padding: 4px 10px;
          border-radius: 6px;
        }

        .popup-variants-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .popup-variant-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #f9fafb;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          transition: all 0.2s ease;
        }

        .popup-variant-item:hover {
          background: #fff7ed;
          border-color: #f97316;
        }

        .popup-variant-name {
          font-size: 13px;
          color: #374151;
          font-weight: 500;
        }

        .popup-variant-price {
          font-size: 14px;
          color: #f97316;
          font-weight: 700;
        }

        /* Premium chip styling */
        .chip {
          display: inline-flex;
          align-items: center;
          padding: 5px 12px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.3px;
          transition: all 0.2s ease;
        }

        .chip--avail {
          background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
          color: #065f46;
          border: 1px solid #6ee7b7;
        }

        .chip--out {
          background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
          color: #991b1b;
          border: 1px solid #fca5a5;
        }

        /* Pill badges for Type */
        .pill {
          display: inline-flex;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .pill--menu {
          background: #dbeafe;
          color: #1e40af;
          border: 1px solid #bfdbfe;
        }

        .pill--pkg {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }

        /* Variant badges */
        .badge-variant {
          display: inline-flex;
          font-size: 18px;
          font-weight: 700;
        }

        .badge-variant-yes {
          color: #075985;
        }

        .badge-variant-no {
          color: #dc2626;
        }

        /* Enhanced scrollbar */
        .table-scroll::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        .table-scroll::-webkit-scrollbar-track {
          background: #f9fafb;
          border-radius: 12px;
        }

        .table-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          border-radius: 12px;
          border: 2px solid #f9fafb;
        }

        .table-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
        }

        .table-scroll::-webkit-scrollbar-corner {
          background: #f9fafb;
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .hide-sm {
            display: none;
          }

          .table {
            min-width: 700px;
          }

          .item-details-popup {
            width: 350px;
          }

          .popup-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .table {
            min-width: 600px;
          }

          .table th,
          .table td {
            padding: 12px 10px;
            font-size: 13px;
          }

          .table th:first-child,
          .table td:first-child {
            padding-left: 16px;
          }

          .table th:last-child,
          .table td:last-child {
            padding-right: 16px;
          }

          .item-details-popup {
            width: 320px;
          }
        }

        @media (max-width: 640px) {
          .hide-mobile {
            display: none;
          }
          
          .table {
            min-width: 500px;
          }
          
          .table th,
          .table td {
            padding: 10px 8px;
            font-size: 12px;
          }

          .table th:first-child,
          .table td:first-child {
            padding-left: 12px;
          }

          .table th:last-child,
          .table td:last-child {
            padding-right: 12px;
          }
          
          .col-name { 
            min-width: 160px;
          }

          .item-details-popup {
            width: 280px;
          }

          .popup-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Detail Modal Styles */
        .detail-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .detail-modal {
          background: white;
          border-radius: 16px;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow: hidden;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .detail-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 24px;
          border-bottom: 2px solid #f97316;
          background: linear-gradient(to bottom, #fff7ed 0%, #ffffff 100%);
        }

        .detail-modal-header h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          color: #1f2937;
        }

        .veg-badge {
          display: inline-block;
          background: #dcfce7;
          color: #166534;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          margin-left: 12px;
          border: 1px solid #86efac;
        }

        .close-btn {
          background: #fee2e2;
          border: 1px solid #fca5a5;
          color: #dc2626;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          font-size: 20px;
          cursor: pointer;
          transition: background 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .close-btn:hover {
          background: #fecaca;
        }

        .detail-modal-body {
          padding: 24px;
          max-height: calc(90vh - 100px);
          overflow-y: auto;
        }

        .detail-image-section {
          display: flex;
          justify-content: center;
          margin-bottom: 24px;
        }

        .detail-image-section img {
          width: 150px;
          height: 150px;
          object-fit: cover;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          border: 3px solid #f97316;
        }

        .detail-info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .detail-item {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 16px;
          justify-content: space-between;
        }

        .detail-label {
          font-size: 13px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          min-width: fit-content;
        }

        .detail-value {
          font-size: 15px;
          font-weight: 600;
          color: #1f2937;
          text-align: right;
        }

        .detail-price {
          color: #f97316;
          font-size: 18px;
          font-weight: 700;
        }

        .detail-badge {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          width: fit-content;
        }

        .badge-menu {
          background: #dbeafe;
          color: #1e40af;
          border: 1px solid #bfdbfe;
        }

        .badge-pkg {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }

        .badge-available {
          background: #d1fae5;
          color: #065f46;
          border: 1px solid #6ee7b7;
        }

        .badge-out {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fca5a5;
        }

        .detail-variants-section {
          background: #fff7ed;
          border: 2px solid #f97316;
          border-radius: 12px;
          padding: 16px;
          margin-top: 20px;
        }

        .detail-variants-section h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 700;
          color: #1f2937;
        }

        .variant-template-name {
          font-size: 13px;
          color: #f97316;
          font-weight: 600;
          margin-left: 6px;
        }

        .variant-options-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 8px;
        }

        .variant-option-card {
          background: white;
          border: 1.5px solid #fed7aa;
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s ease;
        }

        .variant-option-card:hover {
          border-color: #f97316;
          box-shadow: 0 2px 4px rgba(249, 115, 22, 0.15);
          transform: translateY(-1px);
        }

        .variant-option-name {
          font-size: 13px;
          font-weight: 600;
          color: #1f2937;
        }

        .variant-option-price {
          font-size: 14px;
          font-weight: 700;
          color: #f97316;
        }

        .detail-upsells-section {
          background: #ecfdf5;
          border: 2px solid #10b981;
          border-radius: 12px;
          padding: 16px;
          margin-top: 20px;
        }

        .detail-upsells-section h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 700;
          color: #1f2937;
        }

        .upsell-items-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 8px;
        }

        .upsell-item-card {
          background: white;
          border: 1.5px solid #a7f3d0;
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s ease;
        }

        .upsell-item-card:hover {
          border-color: #10b981;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.15);
          transform: translateY(-1px);
        }

        .upsell-item-name {
          font-size: 13px;
          font-weight: 600;
          color: #1f2937;
        }

        .upsell-item-price {
          font-size: 14px;
          font-weight: 700;
          color: #10b981;
        }

        @media (max-width: 640px) {
          .detail-modal {
            max-width: 100%;
            margin: 0;
            border-radius: 16px 16px 0 0;
          }

          .detail-info-grid {
            grid-template-columns: 1fr;
          }

          .variant-options-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Mobile actions */
        .mobile-actions {
          display: none;
        }

        @media (max-width: 640px) {
          .mobile-actions {
            display: flex;
            gap: 6px;
            margin-top: 8px;
          }
        }

        .menu-layout-container {
          display: flex;
          gap: 24px;
          margin-top: 24px;
          align-items: flex-start;
        }

        @media (max-width: 768px) {
          .hide-mobile {
            display: none !important;
          }
          
          .only-mobile {
            display: flex !important;
          }
        }
        .menu-content-area {
          flex: 1;
          min-width: 0;
        }

        .sidebar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid #f3f4f6;
        }

        .sidebar-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          color: #111827;
        }

        .sidebar-count {
          background: #f3f4f6;
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
          color: #4b5563;
        }

        .sidebar-filters {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 24px;
        }

        .sidebar-filter-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: white;
          color: #374151;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
        }

        .sidebar-filter-btn:hover {
          background: #f9fafb;
          border-color: #d1d5db;
        }

        .sidebar-filter-btn span {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .sidebar-filter-active-veg {
          background: #f0fdf4 !important;
          border-color: #16a34a !important;
          color: #15803d !important;
          font-weight: 600;
        }

        .sidebar-filter-active-pkg {
          background: #fffbeb !important;
          border-color: #f59e0b !important;
          color: #b45309 !important;
          font-weight: 600;
        }

        .sidebar-categories {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .sidebar-category-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: transparent;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          color: #4b5563;
          width: 100%;
        }

        .sidebar-category-item:hover {
          background: #f3f4f6;
          color: #111827;
        }

        .sidebar-category-active {
          background: #fff7ed !important;
          color: #ea580c !important;
          font-weight: 600;
        }

        .sidebar-category-active:hover {
          background: #ffedd5 !important;
        }

        .category-count {
          font-size: 12px;
          color: #9ca3af;
        }

        .sidebar-category-active .category-count {
          color: #fdba74;
        }

        .hide-mobile {
          display: block;
        }

        .only-mobile {
          display: none;
        }

        /* Mobile Adjustments */
        @media (max-width: 768px) {
          .hide-mobile {
            display: none !important;
          }
          
          .only-mobile {
            display: flex !important;
          }

          .menu-layout-container {
            display: block;
            margin-top: 16px;
          }

          .menu-sidebar {
            display: none;
          }
        }
      `}</style>

      <ItemEditor
        open={!!editorItem}
        onClose={closeEditor}
        item={editorItem}
        restaurantId={restaurantId}
        supabase={supabase}
        onSaved={handleSaved}
        enableMenuImages={enableMenuImages}
      />
      <LibraryPicker
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        supabase={supabase}
        restaurantId={restaurantId}
        enableMenuImages={enableMenuImages}
        onAdded={(rows) => {
          if (rows?.length) setItems((prev) => [...rows, ...prev]);
        }}
      />
      
      {showCategoryManager && (
        <CategoryManager
          restaurantId={restaurantId}
          onClose={() => setShowCategoryManager(false)}
          onSaved={refreshCategories}
        />
      )}

      {showVariantManager && (
        <VariantManager
          restaurantId={restaurantId}
          onClose={() => setShowVariantManager(false)}
        />
      )}

      {showExcelImport && (
        <div
          onClick={() => setShowExcelImport(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(820px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
            }}
          >
            <MenuExcelImport
              restaurantId={restaurantId}
              supabase={supabase}
              existingItems={items}
              defaults={{
                category: "General",
                veg: false,
                ispackagedgood: false,
                status: "available",
                compensationcessrate: 0,
              }}
              onImported={(newItems) => {
                if (newItems?.length) setItems((prev) => [...newItems, ...prev]);
                setShowExcelImport(false);
              }}
              onClose={() => setShowExcelImport(false)}
            />
          </div>
        </div>
      )}

      {showImageImport && (
        <MenuImageImport
          onClose={() => setShowImageImport(false)}
          onImported={(newItems) => {
             refreshCategories();
          }}
          restaurantId={restaurantId}
          existingItems={items}
        />
      )}
      
      {viewImage && (
        <div 
          onClick={() => setViewImage(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }} 
        >
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setViewImage(null)}
              style={{
                position: 'absolute', top: -15, right: -15, 
                background: 'white', border: 'none', borderRadius: '50%', 
                width: 32, height: 32, cursor: 'pointer', fontSize: 18,
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              ✕
            </button>
            <img 
              src={viewImage} 
              alt="Item Preview" 
              style={{ 
                maxWidth: '90vw', maxHeight: '90vh', 
                borderRadius: 8, 
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                display: 'block' 
              }} 
            />
          </div>
        </div>
      )}
        </MenuContentArea>
      </MenuLayoutContainer>
    </div>
  </div>
  );
}
