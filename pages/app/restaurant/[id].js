// pages/app/restaurant/[id].js

import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../../../services/supabase";

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
  const [cartOpen, setCartOpen] = useState(true);

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
    setCartOpen(true);
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

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>;
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
          <div style={{ padding: 20, textAlign: "center" }}>Loading menu…</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No items found.</div>
        ) : (
          <div className="menu-grid">
            {filteredItems.map((it) => (
              <div
                key={it.id}
                className="menu-item"
              >
                {it.image_url ? (
                  <img
                    src={it.image_url}
                    alt={it.name}
                    style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover" }}
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
                    {it.name} <span style={{ fontSize: 12 }}>{it.veg ? "🟢" : "🔺"}</span>
                  </div>
                  <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
                    ₹{Number(it.price || 0).toFixed(2)}
                  </div>
                </div>

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
              </div>
            ))}
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
      `}</style>

      {cart.length ? (
        <div
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 76,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setCartOpen((v) => !v)}
              style={{
                border: "1px solid #e5e7eb",
                background: "#fff",
                borderRadius: 12,
                padding: "8px 10px",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              {cartOpen ? "Hide" : "Show"}
            </button>

            <div style={{ flex: 1, fontWeight: 900 }}>
              {cart.reduce((n, it) => n + Number(it.quantity || 0), 0)} items • ₹{totals.totalInc.toFixed(2)}
            </div>

            <Link
              href={`/app/payment?r=${restaurantId}`}
              style={{
                background: brandColor,
                color: "#fff",
                textDecoration: "none",
                borderRadius: 14,
                padding: "10px 14px",
                fontWeight: 900,
              }}
            >
              Checkout
            </Link>
          </div>

          {cartOpen ? (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {cart.map((it) => (
                <div
                  key={`${it.id}-${it.selectedVariant?.variant_id || "base"}`}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, fontSize: 13, color: "#111827" }}>
                      {it.displayName || it.name}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      ₹{Number(it.price || 0).toFixed(2)}
                    </div>
                  </div>

                  <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 12 }}>
                    <button
                      onClick={() => updateQty(it, (it.quantity || 1) - 1)}
                      style={{
                        width: 36,
                        height: 36,
                        border: "none",
                        background: "#fff",
                        cursor: "pointer",
                        fontWeight: 900,
                        color: brandColor,
                      }}
                    >
                      -
                    </button>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#f8f9fa",
                        fontWeight: 900,
                      }}
                    >
                      {it.quantity}
                    </div>
                    <button
                      onClick={() => updateQty(it, (it.quantity || 1) + 1)}
                      style={{
                        width: 36,
                        height: 36,
                        border: "none",
                        background: "#fff",
                        cursor: "pointer",
                        fontWeight: 900,
                        color: brandColor,
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

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
