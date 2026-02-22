import React, { useState, useEffect } from 'react';
import { getSupabase } from '../services/supabase';
import Button from './ui/Button';
import VariantSelector from './VariantSelector';
import NiceSelect from './NiceSelect';
import { roundP } from '../lib/qty';
import { toDisplayItems } from '../utils/printUtils';

const BRAND = {
  orange: '#f97316',
  white: '#ffffff',
  slate: '#f8fafc',
  gray: '#64748b',
  border: '#e2e8f0'
};

export default function EditOrderPanel({ order, onClose, onSave, tablesCount = 0 }) {
  const [originalLines] = useState(() => toDisplayItems(order)); // snapshot of original
  const [lines, setLines] = useState(() => toDisplayItems(order));
  
  // Initialize location state
  const [selectedLocation, setSelectedLocation] = useState(() => {
     if (order.order_type === 'parcel' || order.order_type === 'takeaway') return 'takeaway';
     if (order.order_type === 'delivery') return 'delivery';
     if (order.table_number) return `table:${order.table_number}`;
     return 'takeaway'; // default fallback
  });

  const tables = Array.from({ length: tablesCount }, (_, i) => i + 1);
  const [showMenuPicker, setShowMenuPicker] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showVariantSelector, setShowVariantSelector] = useState(false);
  const [selectedItemForVariant, setSelectedItemForVariant] = useState(null);

  const total = lines.reduce(
    (sum, l) => sum + (Number(l.price) || 0) * (Number(l.quantity) || 0),
    0
  );

  const updateQty = (index, qty) => {
    setLines((prev) => {
      const line = prev[index];
      const precision = line?.uom_precision ?? 0;
      const roundedQty = roundP(Number(qty) || 0, precision);
      
      if (roundedQty <= 0) {
        return prev.filter((_, i) => i !== index); // 0 = delete
      }
      return prev.map((l, i) => (i === index ? { ...l, quantity: roundedQty } : l));
    });
  };

  const removeLine = (index) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Normalize lines by content only (name, price, quantity) for change detection
  const normalizeLines = (arr) =>
    (arr || [])
      .map((l) => ({
        name: (l.name || '').trim().toLowerCase(),
        variant_id: l.variant_id || null,
        quantity: Number(l.quantity) || 0,
        price: Number(l.price) || 0,
      }))
      .sort((a, b) => {
        const n = a.name.localeCompare(b.name);
        if (n !== 0) return n;
        const v = (a.variant_id || '').localeCompare(b.variant_id || '');
        if (v !== 0) return v;
        const p = a.price - b.price;
        if (p !== 0) return p;
        return a.quantity - b.quantity;
      });

  const hasChanges = (() => {
    const a = normalizeLines(originalLines);
    const b = normalizeLines(lines);
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      if (
        a[i].name !== b[i].name ||
        a[i].quantity !== b[i].quantity ||
        a[i].price !== b[i].price ||
        a[i].variant_id !== b[i].variant_id
      ) {
        return true;
      }
    }
    return false;
  })();
  
  // Detect if location changed
  const hasLocationChange = (() => {
     const isTakeaway = order.order_type === 'parcel' || order.order_type === 'takeaway';
     const isDelivery = order.order_type === 'delivery';
     const origLoc = isTakeaway 
        ? 'takeaway' 
        : (isDelivery ? 'delivery' : (order.table_number ? `table:${order.table_number}` : 'takeaway'));
     return selectedLocation !== origLoc;
  })();

  const handleSave = () => {
    // guard: no lines, no change, or already saving
    if (lines.length === 0 || (!hasChanges && !hasLocationChange) || saving) return;
    
    // Parse location
    let tableNum = null;
    let orderType = 'dine-in';
    
    if (selectedLocation === 'takeaway' || selectedLocation === 'parcel') {
       tableNum = null;
       orderType = 'takeaway';
    } else if (selectedLocation === 'delivery') {
       tableNum = null;
       orderType = 'delivery';
    } else if (selectedLocation && selectedLocation.startsWith('table:')) {
       tableNum = selectedLocation.split(':')[1];
       orderType = 'dine-in';
    }

    setSaving(true);
    onSave({
      ...order,
      lines,
      total,
      table_number: tableNum,
      order_type: orderType
    });
    // parent should close/unmount panel after success
  };

  const openMenuPicker = async () => {
    try {
      const s = getSupabase();
      
      // 1. Fetch menu items with variant template info
      const { data: menu, error } = await s
        .from('menu_items')
        .select(`
          id, name, price, category, veg, status, image_url, description, is_packaged_good, has_variants,
          uom:unit_of_measures(short_code, precision),
          menu_item_variants (
            variant_templates (
              id,
              name
            )
          )
        `)
        .eq('restaurant_id', order.restaurant_id)
        .order('name');

      if (error) {
        console.error('menu_items fetch error', error);
        return;
      }
      
      // 2. Fetch variant pricing/options for items that have them
      const itemsWithVariants = (menu || []).filter(item => item.has_variants);
      const variantDataMap = new Map();
      
      if (itemsWithVariants.length > 0) {
        const itemIds = itemsWithVariants.map(item => item.id);
        const { data: variantPricing, error: vpError } = await s
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
          
         if (vpError) {
             console.error('variant_pricing fetch error', vpError);
         } else {
            // Group by menu_item_id
            (variantPricing || []).forEach(vp => {
              if (!variantDataMap.has(vp.menu_item_id)) {
                variantDataMap.set(vp.menu_item_id, []);
              }
              // Guard against missing variant_options relation
              if (vp.variant_options) {
                  variantDataMap.get(vp.menu_item_id).push({
                    variant_id: vp.variant_options.id,
                    variant_name: vp.variant_options.name,
                    price: vp.price,
                    is_available: vp.is_available,
                    display_order: vp.variant_options.display_order
                  });
              }
            });
         }
      }

      // 3. Fetch Upsells (Add-ons)
      const { data: upsellsData } = await s
        .from('menu_items_with_upsells')
        .select('menu_item_id, upsells')
        .in('menu_item_id', (menu || []).map(i => i.id));
      
      const upsellMap = new Map();
      (upsellsData || []).forEach(row => {
          upsellMap.set(row.menu_item_id, row.upsells);
      });

      // 4. Fetch Restaurant Profile for Tax Settings
      const { data: profile } = await s
        .from('restaurant_profiles')
        .select('gst_enabled, prices_include_tax')
        .eq('restaurant_id', order.restaurant_id)
        .maybeSingle();

      // 5. Attach variants and addons to items
      const finalItems = (menu || []).map(item => {
          const variants = variantDataMap.get(item.id) || [];
          const templateName = item.menu_item_variants?.[0]?.variant_templates?.name || 'Options';
          
          const rawUpsells = upsellMap.get(item.id) || [];
          let addonGroups = [];
          if (rawUpsells.length > 0) {
              addonGroups = [{
                id: 'upsells-group',
                name: 'Suggested Extras',
                options: rawUpsells.map(u => ({
                   id: u.id,
                   name: u.name,
                   price: u.price,
                   is_active: u.status === 'available',
                   veg: u.veg,
                   image_url: u.image_url
                }))
              }];
          }

          return {
            ...item,
            variants: variants.sort((a, b) => a.display_order - b.display_order),
            variant_template_name: item.has_variants ? templateName : null,
            addon_groups: addonGroups,
            has_addons: addonGroups.length > 0,
            restaurant_gst_enabled: !!profile?.gst_enabled,
            restaurant_prices_include_tax: !!profile?.prices_include_tax
          };
      });

      setMenuItems(finalItems);
      setMenuSearch('');
      setShowMenuPicker(true);
    } catch (e) {
      console.error('menu_items fetch exception', e);
    }
  };

  const addMenuItemToLines = (item) => {
    const variantId = item.selectedVariant?.variant_id || item.variant_id || null;
    const finalName = item.displayName || item.name;
    
    // Robust Pricing Logic:
    // 1. Start with the price passed on the item (which might be variant price from Selector)
    let finalPrice = item.price; 
    
    // 2. If valid variant selected, ensure we use its price
    if (item.selectedVariant) {
        const vp = item.selectedVariant.price;
        // Accept 0 as valid price, but reject null/undefined
        if (vp !== undefined && vp !== null) {
             finalPrice = Number(vp);
        }
    }
    
    // 3. Fallback: If price is missing/invalid (e.g. from bad spread), look up original Base Price
    if (finalPrice === undefined || finalPrice === null || Number.isNaN(finalPrice)) {
        const originalBase = menuItems.find(mi => String(mi.id) === String(item.id || item.menu_item_id));
        finalPrice = Number(originalBase?.price || 0);
    } else {
        finalPrice = Number(finalPrice);
    }
    
    const qtyToAdd = Number(item.quantity) || 1;
    
    setLines((prev) => {
      const existingIndex = prev.findIndex((l) => {
        const sameItem = String(l.menu_item_id) === String(item.id);
        const sameVariant = String(l.variant_id || '') === String(variantId || '');
        const sameName = (l.name || '').trim().toLowerCase() === (finalName || '').trim().toLowerCase();
        
        // Match if (Same ID OR Same Name) AND Same Variant
        // This ensures the same product with a different variant is treated as a NEW line
        return (sameItem || sameName) && sameVariant;
      });

      // If already exists, just increase qty and update details to latest
      if (existingIndex !== -1) {
        return prev.map((l, i) =>
          i === existingIndex
            ? { 
                ...l, 
                quantity: roundP((Number(l.quantity) || 0) + qtyToAdd, item.uom?.precision ?? l.uom_precision ?? 0),
                price: finalPrice, 
                variant_id: variantId || l.variant_id,
                variant_name: item.selectedVariant?.variant_name || item.variant_name || l.variant_name || null,
                menu_item_id: item.id, // Update ID to current
                name: finalName, // Update name formatting if needed
                uom_precision: item.uom?.precision ?? l.uom_precision ?? 0,
                uom_short_code: item.uom?.short_code ?? l.uom_short_code ?? null
              }
            : l
        );
      }
      // Otherwise add new line
      return [
        ...prev,
        {
          name: finalName,
          quantity: roundP(qtyToAdd, item.uom?.precision ?? 0),
          price: finalPrice,
          menu_item_id: item.id,
          is_packaged_good: !!item.is_packaged_good,
          variant_id: variantId,
          variant_name: item.selectedVariant?.variant_name || item.variant_name || null,
          uom_precision: item.uom?.precision ?? 0,
          uom_short_code: item.uom?.short_code ?? null,
        },
      ];
    });

    setShowMenuPicker(false);
  };

  const handleItemClick = (item) => {
      const hasV = item.has_variants && (item.variants?.length > 0);
      const hasA = item.has_addons;

      if (hasV || hasA) {
          setSelectedItemForVariant(item);
          setShowVariantSelector(true);
      } else {
          addMenuItemToLines(item);
      }
  }

  const handleVariantSelect = (itemWithVariant) => {
      addMenuItemToLines(itemWithVariant);
      setShowVariantSelector(false);
      setSelectedItemForVariant(null);
  }

  // Refetch/Sync prices with current menu when menuItems loads
  // This fixes the issue where an edited order might have stale/incorrect base prices (e.g. 1000 instead of 2000)
  useEffect(() => {
    if (menuItems.length > 0 && lines.length > 0) {
      setLines(prevLines => {
        return prevLines.map(line => {
          // Find matching menu item
          const menuItem = menuItems.find(m => String(m.id) === String(line.menu_item_id || line.id));
          if (!menuItem) return line;

          // If line has a variant, find updated variant price
          if (line.variant_id) {
             const variant = menuItem.variants?.find(v => String(v.variant_id) === String(line.variant_id));
             if (variant && variant.price !== undefined && variant.price !== null) {
               // Only update if price is different to avoid unnecessary renders/changes
               if (Number(line.price) !== Number(variant.price)) {
                 return { ...line, price: Number(variant.price) };
               }
             }
          } else {
             // No variant - update to base price
             if (menuItem.price !== undefined && menuItem.price !== null) {
                if (Number(line.price) !== Number(menuItem.price)) {
                  return { ...line, price: Number(menuItem.price) };
                }
             }
          }
          return line;
        });
      });
    }
  }, [menuItems]); // Run when menu items are fetched


  const filteredMenuItems = menuItems.filter((m) =>
    m.name.toLowerCase().includes(menuSearch.toLowerCase())
  );

  // Draft state for quantity inputs to allow smooth decimal typing
  const [qtyDrafts, setQtyDrafts] = useState({});

  const commitDraft = (idx, val, precision) => {
    const p = precision ?? 2;
    let num = parseFloat(val);
    if (isNaN(num)) num = 0;
    
    // Clear draft so it syncs with source of truth
    setQtyDrafts(prev => {
        const next = { ...prev };
        delete next[idx];
        return next;
    });

    // Update actual state
    updateQty(idx, num);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          backgroundColor: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(15,23,42,0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              Edit Order #{order.id.slice(0, 8)}
            </div>
            {/* Table Selection Removed per user request */}
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px 80px',
          }}
        >
          {/* Item list */}
          {lines.map((line, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {(() => {
                    let n = line.name || 'Item';
                    if (line.variant_name) {
                      const suffix = ` (${line.variant_name})`;
                      if (n.endsWith(suffix)) n = n.slice(0, -suffix.length);
                    }
                    return n;
                  })()}
                  {line.variant_name && (
                    <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 4 }}>
                      ({line.variant_name})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  ₹{Number(line.price || 0).toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0,
                  border: `1.5px solid ${BRAND.orange}`,
                  borderRadius: 6,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={() => {
                    const step = line.uom_precision > 0 ? (1 / Math.pow(10, line.uom_precision)) : 1;
                    updateQty(idx, (Number(line.quantity) || 0) - step);
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    border: 'none',
                    background: 'white',
                    color: BRAND.orange,
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#fff7ed'}
                  onMouseLeave={(e) => e.target.style.background = 'white'}
                >
                  −
                </button>

                <input
                  type="text"
                  inputMode="decimal"
                  value={qtyDrafts[idx] ?? Number(line.quantity || 0).toFixed(line.uom_precision ?? 2)}
                  onChange={(e) => {
                     const val = e.target.value;
                     setQtyDrafts(prev => ({ ...prev, [idx]: val }));
                  }}
                  onBlur={(e) => commitDraft(idx, e.target.value, line.uom_precision)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  style={{
                    width: 48,
                    height: 32,
                    border: 'none',
                    borderLeft: '1px solid #e2e8f0',
                    borderRight: '1px solid #e2e8f0',
                    background: '#fafafa',
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#1e293b',
                    outline: 'none',
                    padding: '0 2px',
                    borderRadius: 0
                  }}
                />

                <button
                  onClick={() => {
                     const step = line.uom_precision > 0 ? (1 / Math.pow(10, line.uom_precision)) : 1;
                     updateQty(idx, (Number(line.quantity) || 0) + step);
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    border: 'none',
                    background: 'white',
                    color: BRAND.orange,
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#fff7ed'}
                  onMouseLeave={(e) => e.target.style.background = 'white'}
                >
                  +
                </button>
              </div>

              {/* Delete icon */}
              <span
                onClick={() => removeLine(idx)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '999px',
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
                title="Remove item"
              >
                🗑
              </span>
            </div>
          ))}

          {/* Add item */}
          <button
            onClick={openMenuPicker}
            style={{
              marginTop: 10,
              border: '1px dashed #9ca3af',
              background: '#f9fafb',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
              cursor: 'pointer',
              width: '100%',
              color: '#4b5563',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 16, color: '#22c55e' }}>＋</span>
            <span>Add item from menu</span>
          </button>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid #e5e7eb',
            padding: '12px 16px',
            backgroundColor: '#f9fafb',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 8,
              fontSize: 14,
            }}
          >
            <span>Total</span>
            <strong>₹{total.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="outline"
              style={{ flex: 1 }}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              style={{ flex: 1 }}
              onClick={handleSave}
              disabled={lines.length === 0 || (!hasChanges && !hasLocationChange) || saving}
            >
              {saving ? 'Saving…' : 'Save & Reprint KOT'}
            </Button>
          </div>
        </div>
      </div>

      {/* Menu picker popup */}
      {showMenuPicker && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              maxHeight: '80vh',
              backgroundColor: '#fff',
              borderRadius: 12,
              boxShadow: '0 18px 36px rgba(15,23,42,0.4)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#eff6ff',
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: '#1d4ed8',
                }}
              >
                Add item from menu
              </div>
              <button
                onClick={() => setShowMenuPicker(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 18,
                  cursor: 'pointer',
                  color: '#6b7280',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '10px 14px' }}>
              <input
                type="text"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Search menu items…"
                style={{
                  width: '100%',
                  borderRadius: 999,
                  border: '1px solid #d1d5db',
                  padding: '6px 12px',
                  fontSize: 13,
                }}
              />
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0 14px 12px',
              }}
            >
              {filteredMenuItems.length === 0 ? (
                <div
                  style={{
                    fontSize: 13,
                    color: '#9ca3af',
                    padding: '8px 0',
                  }}
                >
                  No items found.
                </div>
              ) : (
                filteredMenuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: '#f9fafb',
                      borderRadius: 10,
                      padding: '8px 10px',
                      marginBottom: 6,
                      cursor: 'pointer',
                      transition: 'background-color 0.12s, transform 0.08s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#e0f2fe';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#f9fafb';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: '#111827',
                        }}
                      >
                        {item.name}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#16a34a',
                          fontWeight: 600,
                        }}
                      >
                        ₹{Number(item.price || 0).toFixed(2)}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showVariantSelector && selectedItemForVariant && (
        <VariantSelector
            visible={showVariantSelector}
            item={selectedItemForVariant}
            onSelect={handleVariantSelect}
            onClose={() => {
                setShowVariantSelector(false);
                setSelectedItemForVariant(null);
            }}
            gstEnabled={selectedItemForVariant.restaurant_gst_enabled}
            pricesIncludeTax={selectedItemForVariant.restaurant_prices_include_tax}
            showImage={false}
            zIndex={1300}
        />
      )}
    </div>
  );
}
