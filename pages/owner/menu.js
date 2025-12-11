//pages/owner/menu

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { useRestaurant } from "../../context/RestaurantContext";
import Alert from "../../components/Alert";
import ItemEditor from "../../components/ItemEditor";
import LibraryPicker from "../../components/LibraryPicker";
import Button from "../../components/ui/Button";
import NiceSelect from "../../components/NiceSelect";
import { getSupabase } from "../../services/supabase";
import { useAlert } from "../../context/AlertContext";
import styled from "styled-components";
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
      border-color: #652ae2;
      box-shadow: 0 0 0 2px rgba(101, 42, 226, 0.2);
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
      accent-color: #652ae2;
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
  }
`;

import { useRouter } from "next/router";

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
  const [filterText, setFilterText] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [vegOnly, setVegOnly] = useState(false);
  const [pkgOnly, setPkgOnly] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [editorItem, setEditorItem] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [viewImage, setViewImage] = useState(null);
  const [enableMenuImages, setEnableMenuImages] = useState(false);

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
            "id, name, category, price, code_number, hsn, tax_rate, status, veg, is_packaged_good, compensation_cess_rate, ispopular, image_url"
          )
          .eq("restaurant_id", restaurantId)
          .order("category", { ascending: true })
          .order("name", { ascending: true });
        if (itsErr) throw itsErr;

        const newCats = cats || [];
        const newItems = its || [];

        setCategories(newCats);
        setItems(newItems);
        
        // Cache to localStorage
        localStorage.setItem(`categories_${restaurantId}`, JSON.stringify(newCats));
        localStorage.setItem(`menu_items_${restaurantId}`, JSON.stringify(newItems));
        
        dataLoadedRef.current = true;
      } catch (e) {
        setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [checking, loadingRestaurant, restaurantId, supabase]);

  const visible = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return items.filter((i) => {
      if (vegOnly && !i.veg) return false;
      if (pkgOnly && !i.is_packaged_good) return false;
      if (filterCategory !== "all" && i.category !== filterCategory)
        return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q) ||
        (i.code_number || "").toLowerCase().includes(q)
      );
    });
  }, [items, filterText, filterCategory, vegOnly, pkgOnly]);

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
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...updated };
      return copy;
    });
  }, []);

  const isInitialLoad = (checking || loadingRestaurant || !restaurantId) && items.length === 0;
  if (isInitialLoad)
    return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <div className="menu-page">
      <h1 className="h1">Menu Management</h1>
      {error && <Alert type="error">{error}</Alert>}

      <ToolBar>
        <div className="search-row">
          <span className="search-icon">🔍</span>
          <input
            className="input search-input"
            placeholder="Search by name or code..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ fontSize: 14 }}
          />
          {filterText && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setFilterText("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <div style={{ maxWidth: 260 }}>
          <NiceSelect
            value={filterCategory}
            onChange={setFilterCategory}
            placeholder="All Categories"
            options={[
              { value: "all", label: "All Categories" },
              ...categories.map((c) => ({ value: c.name, label: c.name })),
            ]}
          />
        </div>

        <div className="checkbox-row">
          <div className="flag">
            <span>Veg only</span>
            <input
              type="checkbox"
              checked={vegOnly}
              onChange={(e) => setVegOnly(e.target.checked)}
            />
          </div>
          <label className="flag">
            <span>Packaged goods</span>
            <input
              type="checkbox"
              checked={pkgOnly}
              onChange={(e) => setPkgOnly(e.target.checked)}
            />
          </label>
        </div>

        <div className="toolbar-cta">
          <Button onClick={() => openEditor({})}>Add New Item</Button>
          <Button onClick={() => setShowLibrary(true)}>Add from Library</Button>
          {hasSelection && (
            <>
              <Button variant="success" onClick={() => applyBulk("available")}>
                Mark Available
              </Button>
              <Button variant="outline" onClick={() => applyBulk("out_of_stock")}>
                Mark Out of Stock
              </Button>
            </>
          )}
        </div>
      </ToolBar>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Name</th>
                <th className="hide-sm">Code</th>
                <th className="hide-sm">Category</th>
                <th>Price</th>
                <th className="hide-sm">HSN</th>
                <th className="hide-md">Tax %</th>
                <th className="hide-sm">Cess %</th>
                <th className="hide-sm">Type</th>
                <th>Status</th>
                {enableMenuImages && <th>Image</th>}
                <th className="hide-mobile">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={enableMenuImages ? 11 : 10} style={{ padding: 12 }}>
                    Loading…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={enableMenuImages ? 11 : 10} style={{ padding: 12, color: "#666" }}>
                    No items found.
                  </td>
                </tr>
              ) : (
                visible.map((item) => {
                  const available = item.status === "available";
                  const typeBadge = item.is_packaged_good ? "Packaged" : "Menu";
                  return (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                        />
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              overflowWrap: "anywhere",
                            }}
                          >
                            {item.name}
                          </span>
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
                      </td>
                      <td
                        className="hide-sm"
                        style={{ fontFamily: "monospace", fontSize: 13 }}
                      >
                        {item.code_number || "—"}
                      </td>
                      <td className="hide-sm">{item.category || "—"}</td>
                      <td style={{ fontWeight: 700 }}>
                        ₹{Number(item.price ?? 0).toFixed(2)}
                      </td>
                      <td className="hide-sm">{item.hsn || "—"}</td>
                      <td className="hide-md">
                        {item.tax_rate != null
                          ? Number(item.tax_rate).toFixed(2)
                          : "—"}
                      </td>
                      <td className="hide-sm">
                        {item.is_packaged_good
                          ? Number(item.compensation_cess_rate ?? 0).toFixed(2)
                          : "—"}
                      </td>
                      <td className="hide-sm">
                        <span
                          className={`pill ${
                            item.is_packaged_good ? "pill--pkg" : "pill--menu"
                          }`}
                        >
                          {typeBadge}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`chip ${
                            available ? "chip--avail" : "chip--out"
                          }`}
                        >
                          {available ? "Available" : "Out of Stock"}
                        </span>
                      </td>
                      {enableMenuImages && (
                        <td>
                          {item.image_url ? (
                            <div 
                              onClick={() => setViewImage(item.image_url)}
                              style={{ 
                                width: 40, height: 40, 
                                overflow: 'hidden', borderRadius: 6, 
                                cursor: 'pointer', border: '1px solid #ddd',
                                background: '#fff'
                              }}
                              title="Click to view"
                            >
                              <img 
                                src={item.image_url} 
                                alt="" 
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                              />
                            </div>
                          ) : (
                            <div style={{ width: 40, height: 40, background: '#f9fafb', borderRadius: 6, border: '1px dashed #e5e7eb' }} />
                          )}
                        </td>
                      )}
                      <td className="hide-mobile">
                        <div
                          className="row"
                          style={{
                            justifyContent: "flex-end",
                            gap: 6,
                            flexWrap: "wrap",
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
      </div>

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
        onAdded={(rows) => {
          if (rows?.length) setItems((prev) => [...rows, ...prev]);
        }}
      />
      
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
    </div>
  );
}
