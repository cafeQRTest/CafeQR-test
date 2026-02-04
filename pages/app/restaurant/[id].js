// pages/app/restaurant/[id].js

import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../../../services/supabase";
import { motion, AnimatePresence } from "framer-motion";
import CafeQRLoader from "../../../components/CafeQRLoader";

const cartKey = (restaurantId) => `cart_delivery_${restaurantId}`;

export default function DeliveryRestaurantMenu() {
  const router = useRouter();
  const supabase = getSupabase();
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

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth > 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!restaurantId) return;

    const loadRestaurant = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, restaurant_profiles(brand_color, gst_enabled, default_tax_rate, prices_include_tax)")
        .eq("id", restaurantId)
        .single();

      setRestaurant(data || null);
      setLoading(false);
    };

    loadRestaurant();
  }, [restaurantId, supabase]);

  useEffect(() => {
    if (!restaurantId) return;

    const loadItems = async () => {
      setItemsLoading(true);

      // Assumptions (adjust columns if your schema differs):
      // menu_items: id, restaurant_id, name, price, veg, image_url, category, is_active, is_packaged_good, tax_rate
      const { data } = await supabase
        .from("menu_items")
        .select("id, name, price, veg, image_url, category, is_packaged_good, tax_rate")
        .eq("restaurant_id", restaurantId)
        .order("name", { ascending: true });

      setItems(data || []);
      setItemsLoading(false);
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

  const persist = (next) => {
    setCart(next);
    if (typeof window !== "undefined" && restaurantId) {
      localStorage.setItem(cartKey(restaurantId), JSON.stringify(next));
    }
  };

  const addItem = (it) => {
    const match = (c) => c.id === it.id && !c.selectedVariant;

    const found = cart.find(match);
    if (found) {
      persist(cart.map((c) => (match(c) ? { ...c, quantity: (c.quantity || 1) + 1 } : c)));
      return;
    }

    persist([
      ...cart,
      {
        id: it.id,
        name: it.name,
        displayName: it.name,
        price: Number(it.price) || 0,
        quantity: 1,
        veg: !!it.veg,
        image_url: it.image_url || null,
        is_packaged_good: !!it.is_packaged_good,
        tax_rate: it.tax_rate ?? null,
        selectedVariant: null,
      },
    ]);
    // Do NOT auto-open cart: setCartOpen(true);
  };

  const updateQty = (target, qty) => {
    const match = (c) =>
      c.id === target.id &&
      (target.selectedVariant
        ? c.selectedVariant?.variant_id === target.selectedVariant?.variant_id
        : !c.selectedVariant);

    if (qty <= 0) persist(cart.filter((c) => !match(c)));
    else persist(cart.map((c) => (match(c) ? { ...c, quantity: qty } : c)));
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
      .filter((it) => (it.name || "").toLowerCase().includes(term));
  }, [items, cat, q]);

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

  if (loading) return <CafeQRLoader message="Loading restaurant..." />;
  if (!restaurantId) return <div style={{ padding: 40, textAlign: "center" }}>Missing restaurant.</div>;

  return (
    <div className="delivery-menu-page">
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

            <Link
              href="/app/profile"
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                color: "#111827",
                fontWeight: 900,
              }}
              aria-label="Profile"
            >
              ☺
            </Link>
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
          <CafeQRLoader message="Loading menu..." fullScreen={false} />
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No items found.</div>
        ) : (
          <div className="menu-grid">
            {filteredItems.map((it) => {
              const inCart = cart.find(
                (c) => c.id === it.id && !c.selectedVariant
              );
              const quantity = inCart?.quantity || 0;

              return (
                <div key={it.id} className="menu-item">
                  {it.image_url ? (
                    <img
                      src={it.image_url}
                      alt={it.name}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        background: "#f3f4f6",
                      }}
                    />
                  )}

                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, color: "#111827" }}>
                      {it.name}{" "}
                      <span style={{ fontSize: 12 }}>{it.veg ? "🟢" : "🔺"}</span>
                    </div>
                    <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
                      ₹{Number(it.price || 0).toFixed(2)}
                    </div>
                  </div>

                  {quantity > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        border: `1px solid ${brandColor}`,
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#fff",
                      }}
                    >
                      <button
                        onClick={() => updateQty(inCart, quantity - 1)}
                        style={{
                          padding: "8px 12px",
                          border: "none",
                          background: "#fff",
                          color: brandColor,
                          fontWeight: 900,
                          fontSize: 16,
                          cursor: "pointer",
                        }}
                      >
                        -
                      </button>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          minWidth: 24,
                          textAlign: "center",
                          color: "#111827",
                        }}
                      >
                        {quantity}
                      </span>
                      <button
                        onClick={() => updateQty(inCart, quantity + 1)}
                        style={{
                          padding: "8px 12px",
                          border: "none",
                          background: "#fff",
                          color: brandColor,
                          fontWeight: 900,
                          fontSize: 16,
                          cursor: "pointer",
                        }}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addItem(it)}
                      style={{
                        background: "#fff",
                        border: `2px solid ${brandColor}`,
                        color: brandColor,
                        borderRadius: 12,
                        padding: "10px 12px",
                        fontWeight: 900,
                        cursor: "pointer",
                        minWidth: 76,
                      }}
                    >
                      Add
                    </button>
                  )}
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
          gap: 12px;
        }
        .menu-item {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 14px;
          display: flex;
          gap: 12px;
          align-items: center;
          transition: all 0.2s;
        }
        .menu-item:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
          transform: translateY(-2px);
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
                  onClick={() => persist([])}
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

      <BottomNav active="home" />
    </div>
  );
}

function BottomNav({ active }) {
  const itemStyle = (key) => ({
    flex: 1,
    textAlign: "center",
    textDecoration: "none",
    color: active === key ? "#f59e0b" : "#6b7280",
    fontWeight: 900,
    fontSize: 12,
    padding: "10px 0",
  });

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#fff",
        borderTop: "1px solid #e5e7eb",
        display: "flex",
        height: 64,
      }}
    >
      <Link href="/app" style={itemStyle("home")}>
        Home
      </Link>
      <Link href="/app/addresses" style={itemStyle("addresses")}>
        Addresses
      </Link>
      <Link href="/app/profile" style={itemStyle("profile")}>
        Profile
      </Link>
    </div>
  );
}
