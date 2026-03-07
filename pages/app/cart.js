//pages/app/cart.js

import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCustomerSupabase } from "../../services/supabase";


const cartKey = (restaurantId) => `cart_delivery_${restaurantId}`;

export default function DeliveryCart() {
  const router = useRouter();
  const supabase = getCustomerSupabase();
  const { r: restaurantId } = router.query;

  const [restaurant, setRestaurant] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) return;

    const load = async () => {
      setLoading(true);

      try {
        const fetchWithTimeout = Promise.race([
          supabase
            .from("restaurants")
            .select("id, name, restaurant_profiles(brand_color, gst_enabled, default_tax_rate, prices_include_tax)")
            .eq("id", restaurantId)
            .single(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000)),
        ]);

        const { data: rest } = await fetchWithTimeout;
        setRestaurant(rest || null);
      } catch (e) {
        console.warn("Cart: restaurant fetch error:", e);
        setRestaurant(null);
      }

      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(cartKey(restaurantId));
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setCart(Array.isArray(parsed) ? parsed : []);
          } catch {
            setCart([]);
          }
        } else {
          setCart([]);
        }
      }

      setLoading(false);
    };

    load();
  }, [restaurantId, supabase]);

  const brandColor = restaurant?.restaurant_profiles?.brand_color || "#f59e0b";

  const persist = (next) => {
    setCart(next);
    if (typeof window !== "undefined" && restaurantId) {
      localStorage.setItem(cartKey(restaurantId), JSON.stringify(next));
    }
  };

  const updateQty = (target, qty) => {
    const match = (c) =>
      c.id === target.id &&
      (target.selectedVariant
        ? c.selectedVariant?.variant_id === target.selectedVariant?.variant_id
        : !c.selectedVariant);

    if (qty <= 0) {
      persist(cart.filter((c) => !match(c)));
    } else {
      persist(cart.map((c) => (match(c) ? { ...c, quantity: qty } : c)));
    }
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
      const q = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      const isPackaged = !!item.is_packaged_good;

      if (!gstEnabled) {
        subtotalEx += price * q;
        totalInc += price * q;
        return;
      }

      if (isPackaged) {
        subtotalEx += price * q;
        totalInc += price * q;
        return;
      }

      if (pricesIncludeTax) {
        const inc = price * q;
        const ex = baseRate > 0 ? inc / (1 + baseRate / 100) : inc;
        subtotalEx += ex;
        taxAmount += inc - ex;
        totalInc += inc;
      } else {
        const ex = price * q;
        const tax = (baseRate / 100) * ex;
        subtotalEx += ex;
        taxAmount += tax;
        totalInc += ex + tax;
      }
    });

    return { subtotalEx, taxAmount, totalInc, taxRateDisplay: gstEnabled ? baseRate : 0 };
  }, [cart, restaurant]);

  if (loading) return <div className="p-4 text-center text-gray-500">Loading...</div>;

  if (!restaurantId) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        Missing restaurant.
        <div style={{ marginTop: 10 }}>
          <Link href="/app">Back</Link>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 50, opacity: 0.6 }}>🛒</div>
        <h2 style={{ margin: "10px 0 0" }}>Your cart is empty</h2>
        <p style={{ color: "#6b7280" }}>Add items from the menu to get started</p>
        <Link
          href={`/app/restaurant/${restaurantId}`}
          style={{
            background: brandColor,
            color: "#fff",
            padding: "12px 16px",
            borderRadius: 12,
            textDecoration: "none",
            fontWeight: 800,
            display: "inline-block",
            marginTop: 10,
          }}
        >
          Browse menu
        </Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", paddingBottom: 110 }}>
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            border: "1px solid #e5e7eb",
            background: "#fff",
            borderRadius: 10,
            padding: "8px 10px",
            cursor: "pointer",
          }}
        >
          {"<"}
        </button>
        <div style={{ fontWeight: 900, flex: 1 }}>Delivery cart</div>
        <button
          onClick={() => {
            if (typeof window !== "undefined" && restaurantId) {
              localStorage.removeItem(cartKey(restaurantId));
            }
            setCart([]);
          }}
          style={{
            background: "none",
            border: "none",
            color: brandColor,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </header>

      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        {cart.map((item) => (
          <div
            key={`${item.id}-${item.selectedVariant?.variant_id || "base"}`}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 14,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                style={{ width: 60, height: 60, borderRadius: 12, objectFit: "cover" }}
              />
            ) : null}

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900 }}>
                {item.displayName || item.name}{" "}
                <span style={{ fontSize: 12 }}>{item.veg ? "🟢" : "🔺"}</span>
              </div>
              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
                ₹{Number(item.price).toFixed(2)} each
              </div>
              <div style={{ marginTop: 6, fontWeight: 900, fontSize: 13 }}>
                Total: ₹{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)}
              </div>

              <button
                onClick={() => updateQty(item, 0)}
                style={{
                  marginTop: 8,
                  border: "none",
                  background: "none",
                  color: "#ef4444",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Remove
              </button>
            </div>

            <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 12 }}>
              <button
                onClick={() => updateQty(item, (item.quantity || 1) - 1)}
                style={{
                  width: 38,
                  height: 38,
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
                  width: 38,
                  height: 38,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#f8f9fa",
                  fontWeight: 900,
                }}
              >
                {item.quantity}
              </div>
              <button
                onClick={() => updateQty(item, (item.quantity || 1) + 1)}
                style={{
                  width: 38,
                  height: 38,
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

      <div style={{ marginTop: 10, background: "#fff", padding: 16, borderTop: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span>Subtotal</span>
          <span>₹{totals.subtotalEx.toFixed(2)}</span>
        </div>
        {totals.taxAmount > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#6b7280" }}>
            <span>Tax ({totals.taxRateDisplay}%)</span>
            <span>₹{totals.taxAmount.toFixed(2)}</span>
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 18 }}>
          <span>Total</span>
          <span>₹{totals.totalInc.toFixed(2)}</span>
        </div>
      </div>

      <div
        style={{
          position: "fixed",
          left: 16,
          right: 16,
          bottom: 16,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 12,
        }}
      >
        <Link
          href={`/app/payment?r=${restaurantId}`}
          style={{
            display: "block",
            background: brandColor,
            color: "#fff",
            textAlign: "center",
            textDecoration: "none",
            padding: 14,
            borderRadius: 14,
            fontWeight: 900,
          }}
        >
          Proceed (₹{totals.totalInc.toFixed(2)})
        </Link>
      </div>
    </div>
  );
}
