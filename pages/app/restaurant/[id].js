// pages/app/restaurant/[id].js

import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCustomerSupabase } from "../../../services/supabase";
import { motion, AnimatePresence } from "framer-motion";
import MenuItemCard from "../../../components/MenuItemCard";
import VariantSelector from "../../../components/VariantSelector";
import VariantEditModal from "../../../components/VariantEditModal";


const cartKey = (restaurantId) => `cart_delivery_${restaurantId}`;

export default function DeliveryRestaurantMenu() {
  const router = useRouter();
  const supabase = getCustomerSupabase();
  const { id: restaurantId } = router.query;

  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState(null);

  const [itemsLoading, setItemsLoading] = useState(true);
  const [items, setItems] = useState([]);

  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [enableMenuImages, setEnableMenuImages] = useState(false);
  const [showVariantSelector, setShowVariantSelector] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingVariantItem, setEditingVariantItem] = useState(null);

  // Delivery availability state
  const [isDeliveryClosed, setIsDeliveryClosed] = useState(false);
  const [deliveryClosedMessage, setDeliveryClosedMessage] = useState("");

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth > 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (router.query.toast === "order_received") {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 3500);

      router.replace(`/app/restaurant/${restaurantId}`, undefined, { shallow: true });
      return () => clearTimeout(t);
    }
  }, [router, router.query.toast, restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;

    const loadRestaurant = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, delivery_paused, restaurant_profiles(brand_color, gst_enabled, default_tax_rate, prices_include_tax, features_menu_images_enabled)")
        .eq("id", restaurantId)
        .single();

      setRestaurant(data || null);
      setEnableMenuImages(!!data?.restaurant_profiles?.features_menu_images_enabled);

      // Check delivery availability
      if (data) {
        if (data.delivery_paused) {
          setIsDeliveryClosed(true);
          setDeliveryClosedMessage("Delivery is currently paused");
          setLoading(false);
          return;
        }

        const { data: dHours } = await supabase
          .from("delivery_hours")
          .select("dow, open_time, close_time, enabled")
          .eq("restaurant_id", restaurantId);

        if (dHours && dHours.length > 0) {
          const now = new Date();
          const currentDOW = now.getDay() === 0 ? 7 : now.getDay();
          const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const todayHours = dHours.find((h) => h.dow === currentDOW);

          if (!todayHours || !todayHours.enabled) {
            setIsDeliveryClosed(true);
            setDeliveryClosedMessage("Delivery is not available today");
            setLoading(false);
            return;
          }

          if (todayHours.open_time && todayHours.close_time) {
            const openTime = todayHours.open_time.substring(0, 5);
            const closeTime = todayHours.close_time.substring(0, 5);
            if (currentTime < openTime || currentTime > closeTime) {
              setIsDeliveryClosed(true);
              setDeliveryClosedMessage(`Delivery is closed. Opens at ${openTime}, closes at ${closeTime}`);
              setLoading(false);
              return;
            }
          }
        }
        // No delivery_hours rows → default to always open
        setIsDeliveryClosed(false);
      }

      setLoading(false);
    };

    loadRestaurant();
  }, [restaurantId, supabase]);

  useEffect(() => {
    if (!restaurantId) return;

    const loadItems = async () => {
      setItemsLoading(true);
      try {
        const { data: rawItems, error: menuErr } = await supabase
          .from("menu_items")
          .select(`
            id, name, price, description, category, veg, status, is_packaged_good, ispopular, image_url, has_variants, tax_rate, uom_id,
            uom:unit_of_measures(short_code, precision),
            menu_item_variants(
              variant_templates(id, name)
            )
          `)
          .eq("restaurant_id", restaurantId)
          .order("category", { ascending: true })
          .order("name", { ascending: true });

        if (menuErr) throw menuErr;

        const finalItems = (rawItems || []).map((item) => {
          const uomObj = Array.isArray(item.uom) ? item.uom[0] : item.uom;
          return {
            ...item,
            uom: uomObj,
            uom_precision: uomObj?.precision ?? 0,
          };
        });

        const variantItemIds = finalItems
          .filter((item) => item?.has_variants && item?.id)
          .map((item) => item.id);
        const variantMap = new Map();

        if (variantItemIds.length > 0) {
          const { data: variantPricing, error: variantErr } = await supabase
            .from("variant_pricing")
            .select(`
              menu_item_id, price, is_available,
              variant_options(id, name, display_order, template_id)
            `)
            .in("menu_item_id", variantItemIds);

          if (variantErr) {
            console.error("Variant pricing load error:", variantErr);
          } else {
            (variantPricing || []).forEach((row) => {
              if (!row.menu_item_id || !row.variant_options) return;
              if (!variantMap.has(row.menu_item_id)) variantMap.set(row.menu_item_id, []);
              variantMap.get(row.menu_item_id).push({
                variant_id: row.variant_options.id,
                variant_name: row.variant_options.name,
                price: row.price,
                is_available: row.is_available,
                display_order: row.variant_options.display_order,
              });
            });
          }
        }

        let upsellsData = [];
        if (finalItems.length > 0) {
          const { data, error: upsellsErr } = await supabase
            .from("menu_items_with_upsells")
            .select("menu_item_id, upsells")
            .in("menu_item_id", finalItems.map((item) => item.id));

          if (upsellsErr) {
            console.error("Upsell load error:", upsellsErr);
          } else {
            upsellsData = data || [];
          }
        }

        const upsellMap = new Map();
        (upsellsData || []).forEach((row) => {
          upsellMap.set(row.menu_item_id, row.upsells);
        });

        finalItems.forEach((item) => {
          item.variants = (variantMap.get(item.id) || []).sort(
            (a, b) => (a.display_order || 0) - (b.display_order || 0)
          );

          const rawUpsells = upsellMap.get(item.id) || [];
          if (rawUpsells.length > 0) {
            item.addon_groups = [
              {
                id: "upsells-group",
                name: "Suggested Extras",
                min_selections: 0,
                max_selections: null,
                options: rawUpsells.map((upsell) => ({
                  id: upsell.id,
                  name: upsell.name,
                  price: upsell.price,
                  is_active: upsell.status === "available",
                  veg: upsell.veg,
                  image_url: upsell.image_url,
                })),
              },
            ];
            item.has_addons = true;
          } else {
            item.addon_groups = [];
            item.has_addons = false;
          }
        });

        const transformed = finalItems.map((item) => {
          const templateName = item.menu_item_variants?.[0]?.variant_templates?.name || "Options";
          return {
            ...item,
            variant_template_name: item.has_variants ? templateName : null,
            popular: !!item.ispopular,
          };
        });

        setItems(transformed);
      } catch (error) {
        console.warn("Menu load error:", error);
        setItems([]);
      } finally {
        setItemsLoading(false);
      }
    };

    loadItems();
  }, [restaurantId, supabase]);

  useEffect(() => {
    if (!restaurantId || typeof window === "undefined") return;
    const stored = localStorage.getItem(cartKey(restaurantId));
    if (!stored) return setCart([]);
    try {
      const parsed = JSON.parse(stored);
      setCart(Array.isArray(parsed) ? parsed : []);
    } catch {
      setCart([]);
    }
  }, [restaurantId]);

  const brandColor = restaurant?.restaurant_profiles?.brand_color || "#f59e0b";

  const commitCart = (nextOrUpdater) => {
    setCart((prev) => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater;
      if (typeof window !== "undefined" && restaurantId) {
        localStorage.setItem(cartKey(restaurantId), JSON.stringify(next));
      }
      return next;
    });
  };

  const cartItemsMatch = (cartItem, targetItem) => {
    if (cartItem.id !== targetItem.id) return false;
    if (targetItem.selectedVariant) {
      return String(cartItem.selectedVariant?.variant_id || "") === String(targetItem.selectedVariant?.variant_id || "");
    }
    return !cartItem.selectedVariant;
  };

  const addBaseItem = (item) => {
    commitCart((prev) => {
      const existing = prev.find((cartItem) => cartItem.id === item.id && !cartItem.selectedVariant);
      if (existing) {
        return prev.map((cartItem) =>
          cartItem.id === item.id && !cartItem.selectedVariant
            ? { ...cartItem, quantity: Number(cartItem.quantity || 0) + 1 }
            : cartItem
        );
      }

      return [
        ...prev,
        {
          ...item,
          displayName: item.name,
          price: Number(item.price) || 0,
          quantity: 1,
          selectedVariant: null,
        },
      ];
    });
  };

  const handleVariantAdd = (variantItem) => {
    commitCart((prev) => {
      const existingIdx = prev.findIndex((cartItem) => cartItemsMatch(cartItem, variantItem));
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: Number(next[existingIdx].quantity || 0) + Number(variantItem.quantity || 0),
        };
        return next;
      }
      return [...prev, variantItem];
    });
  };

  const handleAddItem = (item) => {
    if ((item.has_variants && item.variants?.length > 0) || item.has_addons) {
      setSelectedItem(item);
      setShowVariantSelector(true);
      return;
    }

    addBaseItem(item);
  };

  const updateQty = (target, qty) => {
    const nextQty = Number(qty) || 0;
    commitCart((prev) => {
      if (nextQty <= 0) return prev.filter((cartItem) => !cartItemsMatch(cartItem, target));
      return prev.map((cartItem) =>
        cartItemsMatch(cartItem, target) ? { ...cartItem, quantity: nextQty } : cartItem
      );
    });
  };

  const handleVariantEditUpdate = (targetItem, quantity) => {
    updateQty(targetItem, quantity);
  };

  const categories = useMemo(() => {
    const set = new Set(["All"]);
    (items || []).forEach((it) => {
      const c = (it.category || "").trim();
      if (c) set.add(c);
    });
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (items || [])
      .filter((it) => (cat === "All" ? true : String(it.category || "") === cat))
      .filter((it) =>
        !term ||
        (it.name || "").toLowerCase().includes(term) ||
        (it.description || "").toLowerCase().includes(term)
      );
  }, [items, cat, q]);

  const getItemQuantity = (itemId) => {
    return cart
      .filter((cartItem) => cartItem.id === itemId)
      .reduce((sum, cartItem) => sum + Number(cartItem.quantity || 0), 0);
  };

  const totals = useMemo(() => {
    const profile = restaurant?.restaurant_profiles;
    const gstEnabled = !!profile?.gst_enabled;
    const baseRate = Number(profile?.default_tax_rate ?? 0);
    const pricesIncludeTax =
      profile?.prices_include_tax === true ||
      profile?.prices_include_tax === "true" ||
      profile?.prices_include_tax === 1 ||
      profile?.prices_include_tax === "1";

    let subtotalEx = 0;
    let taxAmount = 0;
    let totalInc = 0;

    cart.forEach((item) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      const isPackaged = !!item.is_packaged_good;

      if (!gstEnabled || isPackaged) {
        subtotalEx += price * qty;
        totalInc += price * qty;
        return;
      }

      if (pricesIncludeTax) {
        const inc = price * qty;
        const ex = baseRate > 0 ? inc / (1 + baseRate / 100) : inc;
        subtotalEx += ex;
        taxAmount += inc - ex;
        totalInc += inc;
      } else {
        const ex = price * qty;
        const tax = (baseRate / 100) * ex;
        subtotalEx += ex;
        taxAmount += tax;
        totalInc += ex + tax;
      }
    });

    return { subtotalEx, taxAmount, totalInc };
  }, [cart, restaurant]);

  if (loading) return <div className="p-4 text-center text-gray-500">Loading...</div>;
  if (!restaurantId) return <div style={{ padding: 40, textAlign: "center" }}>Missing restaurant.</div>;

  if (isDeliveryClosed) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#f8fafc', padding: 24, textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🕐</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1e293b' }}>
          {deliveryClosedMessage}
        </h2>
        <p style={{ fontSize: 15, color: '#64748b', maxWidth: 320, lineHeight: 1.6, margin: '0 0 24px' }}>
          Please check back during delivery hours.
        </p>
        <button
          onClick={() => router.back()}
          style={{
            padding: '12px 24px', borderRadius: 12,
            background: '#f97316', color: '#fff', border: 'none',
            fontWeight: 700, fontSize: 15, cursor: 'pointer'
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="delivery-menu-page" style={{ "--brand": brandColor }}>
      <header className="delivery-menu-header">
        <div className="header-content">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => router.back()}
              style={{
                border: "1px solid #e5e7eb",
                background: "#fff",
                borderRadius: 12,
                width: 40,
                height: 40,
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              {"<"}
            </button>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, color: "#111827" }}>{restaurant?.name || "Restaurant"}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Add items • Checkout below
              </div>
            </div>


          </div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search dishes…"
            className="search-input"
          />

          <div style={{ marginTop: 12, display: "flex", gap: 8, overflowX: "auto" }}>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                style={{
                  whiteSpace: "nowrap",
                  border: "1px solid #e5e7eb",
                  background: cat === c ? brandColor : "#fff",
                  color: cat === c ? "#fff" : "#111827",
                  padding: "8px 12px",
                  borderRadius: 999,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="menu-content">
        {itemsLoading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No items found.</div>
        ) : (
          <div className="menu-grid">
            {filteredItems.map((it) => {
              const totalQty = getItemQuantity(it.id);
              const passQty = it.has_variants ? 0 : totalQty;
              const badge = it.has_variants ? totalQty : 0;

              return (
                <div key={it.id} className="menu-card-wrap">
                  <MenuItemCard
                    item={it}
                    quantity={passQty}
                    badge={badge}
                    onAdd={() => handleAddItem(it)}
                    onRemove={() => updateQty(it, passQty - 1)}
                    onQuantityChange={(_, qty) => updateQty(it, qty)}
                    onEdit={it.has_variants ? () => setEditingVariantItem(it) : undefined}
                    showImage={enableMenuImages}
                    highlightColor={brandColor}
                    onItemClick={() => handleAddItem(it)}
                    decimalPlaces={it.uom_precision ?? 0}
                    quantityStep={it.uom_precision > 0 ? 1 / Math.pow(10, it.uom_precision) : 1}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .delivery-menu-page {
          min-height: 100vh;
          background: #f8f9fa;
          padding-bottom: ${cart.length ? '170px' : '84px'};
        }
        .delivery-menu-header {
          background: #fff;
          border-bottom: 1px solid #e5e7eb;
          position: sticky;
          top: 0;
          z-index: 10;
          padding: 14px;
        }
        .header-content {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 8px;
        }
        .search-input {
          margin-top: 12px;
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          outline: none;
          background: #f8f9fa;
          font-size: 14px;
        }
        .search-input:focus {
          border-color: #f97316;
          background: #fff;
        }
        .menu-content {
          max-width: 1280px;
          margin: 0 auto;
          padding: 16px 20px;
        }
        .menu-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          align-items: start;
        }
        .menu-card-wrap {
          min-width: 0;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        .view-cart-bar {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .view-cart-bar:active {
          transform: scale(0.98);
        }
      `}</style>

      <AnimatePresence>
        {cart.length > 0 && !cartOpen && (
          <motion.div
            key="cart-floating-bar"
            layout
            initial={{ y: 100, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.9 }}
            onClick={() => setCartOpen(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              margin: "0 auto",
              bottom: 40,
              width: "max-content",
              minWidth: "300px",
              background: brandColor,
              borderRadius: 9999,
              padding: "16px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              zIndex: 50,
              cursor: "pointer",
              color: "#fff",
              backdropFilter: "blur(6px)",
            }}
          >
            {/* Left: Count */}
            <motion.div
              key={`count-${cart.reduce((n, it) => n + Number(it.quantity || 0), 0)}`}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.3 }}
              style={{ fontWeight: 900, fontSize: 15 }}
            >
              {cart.reduce((n, it) => n + Number(it.quantity || 0), 0)} Items
            </motion.div>

            {/* Divider */}
            <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.3)" }} />

            {/* Center: Label */}
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.5px" }}>
              View Cart
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.3)" }} />

            {/* Right: Price */}
            <motion.div
              key={`price-${totals.totalInc}`}
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.3 }}
              style={{ fontWeight: 900, fontSize: 15 }}
            >
              ₹{totals.totalInc.toFixed(2)}
            </motion.div>
          </motion.div>
        )}

        {cart.length > 0 && cartOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCartOpen(false)}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.5)",
                zIndex: 90,
                backdropFilter: "blur(8px)",
              }}
            />

            {/* Responsive Drawer */}
            <motion.div
              key="cart-drawer"
              initial={isDesktop ? { x: "100%" } : { y: "100%" }}
              animate={isDesktop ? { x: 0 } : { y: 0 }}
              exit={isDesktop ? { x: "100%" } : { y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              drag={isDesktop ? false : "y"}
              dragConstraints={{ top: 0 }}
              dragElastic={0.05}
              onDragEnd={(e, { offset, velocity }) => {
                if (offset.y > 100 || velocity.y > 100) setCartOpen(false);
              }}
              style={{
                position: "fixed",
                background: "#fff",
                zIndex: 100,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 -20px 60px rgba(0,0,0,0.4)",
                ...(isDesktop
                  ? {
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: "30%",
                    minWidth: 450,
                    borderTopLeftRadius: 32,
                    borderBottomLeftRadius: 32,
                  }
                  : {
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: "80vh",
                    borderTopLeftRadius: 32,
                    borderTopRightRadius: 32,
                  }
                ),
              }}
            >
              {/* Mobile Drag Handle */}
              {!isDesktop && (
                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                    paddingTop: 16,
                    paddingBottom: 8,
                    cursor: "grab",
                    background: "transparent"
                  }}
                  onClick={() => setCartOpen(false)}
                >
                  <div style={{ width: 48, height: 5, borderRadius: 3, background: "#d1d5db" }} />
                </div>
              )}

              {/* Header */}
              <div style={{ padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#111827" }}>Your Order</div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => commitCart([])}
                  style={{
                    background: "#fee2e2",
                    color: "#ef4444",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </motion.button>
              </div>

              {/* Scrollable Items */}
              <motion.div
                style={{ overflowY: "auto", flex: 1, padding: "0 32px 24px", display: "flex", flexDirection: "column" }}
                initial="hidden"
                animate="show"
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: { staggerChildren: 0.05, delayChildren: 0.1 }
                  }
                }}
              >
                <AnimatePresence mode="popLayout">
                  {cart.map((it) => (
                    <motion.div
                      key={`${it.id}-${it.selectedVariant?.variant_id || "base"}`}
                      layout
                      variants={{
                        hidden: { opacity: 0, y: 10, scale: 0.98 },
                        show: { opacity: 1, y: 0, scale: 1 }
                      }}
                      exit={{ opacity: 0, height: 0, scale: 0.9, marginBottom: 0 }}
                      style={{
                        padding: "16px 0",
                        borderBottom: "1px solid #f3f4f6", // Light border
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between"
                      }}
                    >
                      {/* Left: Info */}
                      <div style={{ flex: 1, paddingRight: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>
                          {it.displayName || it.name}
                        </div>
                        {it.selectedVariant?.variant_name && (
                          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                            {it.selectedVariant.variant_name}
                          </div>
                        )}
                        <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 4 }}>
                          ₹{Number(it.price).toFixed(2)} x {it.quantity}
                        </div>
                      </div>

                      {/* Right: Controls & Subtotal */}
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        {/* Controls */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => updateQty(it, (it.quantity || 1) - 1)}
                            style={{
                              width: 28, height: 28,
                              border: `1px solid ${brandColor}`, borderRadius: 6,
                              background: "#fff", color: brandColor,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              cursor: "pointer", fontSize: 16
                            }}
                          >-</motion.button>
                          <span style={{ fontWeight: 700, fontSize: 15, minWidth: 20, textAlign: "center", color: "#111827" }}>{it.quantity}</span>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => updateQty(it, (it.quantity || 1) + 1)}
                            style={{
                              width: 28, height: 28,
                              border: `1px solid ${brandColor}`, borderRadius: 6,
                              background: "#fff", color: brandColor,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              cursor: "pointer", fontSize: 16
                            }}
                          >+</motion.button>
                        </div>

                        {/* Subtotal */}
                        <div style={{ fontWeight: 800, fontSize: 16, color: "#111827", minWidth: 60, textAlign: "right" }}>
                          ₹{(Number(it.price) * (it.quantity || 1)).toFixed(2)}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>

              {/* Footer */}
              {/* Footer */}
              <div style={{ padding: "32px", borderTop: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>

                {/* Extras: ReadOnly Discount */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                  <span style={{ color: brandColor, fontWeight: 700, fontSize: 14, cursor: "default", opacity: 0.8 }}>
                    + Add Discount
                  </span>
                </div>

                {/* Total */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>Total</span>
                  <motion.div
                    key={totals.totalInc}
                    initial={{ scale: 1.2, color: brandColor }}
                    animate={{ scale: 1, color: brandColor }}
                    style={{ fontSize: 32, fontWeight: 900, color: brandColor, lineHeight: 1 }}
                  >
                    ₹{totals.totalInc.toFixed(2)}
                  </motion.div>
                </div>

                <Link
                  href={`/app/payment?r=${restaurantId}`}
                  style={{ textDecoration: 'none' }}
                >
                  <motion.div
                    key={totals.totalInc}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    animate={{ scale: [1, 1.02, 1], transition: { duration: 0.3 } }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: brandColor,
                      color: "#fff",
                      padding: "20px",
                      borderRadius: 12,
                      fontWeight: 800,
                      fontSize: 18,
                      boxShadow: `0 8px 20px -4px ${brandColor}66`,
                    }}
                  >
                    Complete Order • ₹{totals.totalInc.toFixed(2)}
                  </motion.div>
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {showVariantSelector && selectedItem && (
        <VariantSelector
          visible={showVariantSelector}
          item={selectedItem}
          onSelect={handleVariantAdd}
          onClose={() => setShowVariantSelector(false)}
          showImage={enableMenuImages}
          gstEnabled={!!restaurant?.restaurant_profiles?.gst_enabled}
          pricesIncludeTax={
            restaurant?.restaurant_profiles?.prices_include_tax === true ||
            restaurant?.restaurant_profiles?.prices_include_tax === "true" ||
            restaurant?.restaurant_profiles?.prices_include_tax === 1 ||
            restaurant?.restaurant_profiles?.prices_include_tax === "1"
          }
          theme={{
            main: brandColor,
            soft: "#fff7ed",
            border: "#ffedd5",
            dark: brandColor,
          }}
        />
      )}

      {editingVariantItem && (
        <VariantEditModal
          item={editingVariantItem}
          cartItems={cart.filter((cartItem) => cartItem.id === editingVariantItem.id)}
          onUpdate={handleVariantEditUpdate}
          onClose={() => setEditingVariantItem(null)}
          themeColor={brandColor}
        />
      )}

      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ y: 100, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.9 }}
            style={{
              position: "fixed",
              bottom: 40,
              left: 0,
              right: 0,
              margin: "0 auto",
              width: "max-content",
              background: "#10b981", // elegant green
              color: "#fff",
              padding: "16px 28px",
              borderRadius: 999,
              fontWeight: 800,
              fontSize: 16,
              boxShadow: "0 10px 30px rgba(16, 185, 129, 0.4)",
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            Order Received!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}



