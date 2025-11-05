import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
// 1. IMPORT the singleton function
import { getSupabase } from "../../services/supabase";
import AlertRestaurantButton from '../../components/AlertRestaurantButton';

// 2. REMOVE the supabase prop
export default function CartSummary() {
  const router = useRouter();
  // 3. GET the singleton instance
  const supabase = getSupabase();
  const { r: restaurantId, t: tableNumber } = router.query;

  // 2. REMOVE the useRequireAuth hook
  // const { checking } = useRequireAuth(supabase)
  const [restaurant, setRestaurant] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The loadRestaurantData function now safely uses the singleton instance
    if (restaurantId) loadRestaurantData();
  }, [restaurantId]);

  // This effect for localStorage is correct and does not need changes
  useEffect(() => {
    if (typeof window !== "undefined" && restaurantId && tableNumber) {
      const cartKey = `cart_${restaurantId}_${tableNumber}`;
      const stored = localStorage.getItem(cartKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setCart(parsed);
          else setCart([]);
        } catch {
          localStorage.removeItem(cartKey);
          setCart([]);
        }
      } else {
        setCart([]);
      }
      setLoading(false);
    }
  }, [restaurantId, tableNumber]);

  const loadRestaurantData = async () => {
    if (!restaurantId) {
      console.error("loadRestaurantData called with no restaurantId");
      return;
    }
    const id = restaurantId.trim();
    console.log("Loading restaurant data for ID:", id);
    try {
      // Load basic restaurant info from 'restaurants' table
      const { data: restaurantData, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id, name")
        .eq("id", id)
        .single();

      if (restaurantError) {
        console.error("Error fetching restaurant data:", restaurantError);
        return;
      }
      // Load restaurant profile info from 'restaurant_profiles' table by restaurant_id
      const { data: profileData, error: profileError } = await supabase
        .from("restaurant_profiles")
        .select(
          `
          brand_color,
          online_payment_enabled,
          use_own_gateway,
          gst_enabled,
          default_tax_rate,
          prices_include_tax
        `
        )
        .eq("restaurant_id", id)
        .maybeSingle();

      if (profileError) {
        console.error("Error fetching restaurant profile data:", profileError);
      }

      // Combine both data objects
      const combinedData = {
        ...restaurantData,
        restaurant_profiles: profileData || {},
      };

      setRestaurant(combinedData);
      console.log("Cart Restaurant Set:", combinedData);
    } catch (e) {
      console.error("Cart Restaurant Load Error:", e);
    }
  };

  const persistCart = (nextCart) => {
    if (typeof window !== "undefined" && restaurantId && tableNumber) {
      const cartKey = `cart_${restaurantId}_${tableNumber}`;
      localStorage.setItem(cartKey, JSON.stringify(nextCart));
    }
  };

  const updateQuantity = (itemId, quantity) => {
    if (quantity === 0) {
      setCart((prev) => {
        const next = prev.filter((c) => c.id !== itemId);
        persistCart(next);
        return next;
      });
    } else {
      setCart((prev) => {
        const next = prev.map((c) =>
          c.id === itemId ? { ...c, quantity } : c
        );
        persistCart(next);
        return next;
      });
    }
  };

  const clearCart = () => {
    setCart([]);
    if (typeof window !== "undefined" && restaurantId && tableNumber) {
      const cartKey = `cart_${restaurantId}_${tableNumber}`;
      localStorage.removeItem(cartKey);
    }
  };

  // Calculate tax and totals based on restaurant settings
  const calculateTotals = () => {
    const profile = restaurant?.restaurant_profiles;
    const gstEnabled = !!profile?.gst_enabled;

    if (!gstEnabled) {
      let subtotalEx = 0;
      cart.forEach((item) => {
        const quantity = item.quantity || 1;
        subtotalEx += Number(item.price) * quantity; // use price as inclusive price
      });

      return {
        subtotalEx,
        taxAmount: 0,
        totalInc: subtotalEx,
        taxRateDisplay: 0,
      };
    }

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
      const quantity = item.quantity || 1;
      const isPackaged = !!item.is_packaged_good;

      if (isPackaged) {
        // For packaged goods, assume price already includes tax
        const itemTotalInc = Number(item.price) * quantity;
        subtotalEx += itemTotalInc; // tax included in price
        totalInc += itemTotalInc;
        // Do not add tax separately for packaged goods
      } else {
        if (pricesIncludeTax) {
          const itemTotalInc = Number(item.price) * quantity;
          const itemSubtotalEx =
            baseRate > 0 ? itemTotalInc / (1 + baseRate / 100) : itemTotalInc;
          const itemTax = itemTotalInc - itemSubtotalEx;

          subtotalEx += itemSubtotalEx;
          taxAmount += itemTax;
          totalInc += itemTotalInc;
        } else {
          const itemSubtotalEx = Number(item.price) * quantity;
          const itemTax = (baseRate / 100) * itemSubtotalEx;

          subtotalEx += itemSubtotalEx;
          taxAmount += itemTax;
          totalInc += itemSubtotalEx + itemTax;
        }
      }
    });

    return {
      subtotalEx,
      taxAmount,
      totalInc,
      taxRateDisplay: baseRate,
    };
  };

  const totals = calculateTotals();
  const { subtotalEx, taxAmount, totalInc } = totals;

  // 2. REMOVE the `checking` condition
  if (loading)
    return (
      <div style={{ padding: 40, textAlign: "center" }}>Loading cart...</div>
    );

  if (cart.length === 0) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8f9fa",
        }}
      >
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: "64px", marginBottom: "20px", opacity: 0.5 }}>
            🛒
          </div>
          <h2 style={{ margin: "0 0 8px 0" }}>Your cart is empty</h2>
          <p style={{ color: "#6b7280", marginBottom: "24px" }}>
            Add items from the menu to get started
          </p>
          <Link
            href={`/order?r=${restaurantId}&t=${tableNumber}`}
            style={{
              background: "#f59e0b",
              color: "#fff",
              textDecoration: "none",
              padding: "12px 24px",
              borderRadius: "8px",
              fontWeight: 600,
            }}
          >
            Browse Menu
          </Link>
        </div>
      </div>
    );
  }

  const brandColor = restaurant?.restaurant_profiles?.brand_color || "#f59e0b";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8f9fa",
        paddingBottom: "120px",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem",
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            background: "none",
            border: "none",
            padding: "8px",
            cursor: "pointer",
          }}
        >
          {"<"}
        </button>
        <h1
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 600,
            flex: 1,
            textAlign: "center",
          }}
        >
          Cart Summary
        </h1>
        <button
          onClick={clearCart}
          style={{
            background: "none",
            border: "none",
            color: brandColor,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Clear Cart
        </button>
<AlertRestaurantButton restaurantId={restaurantId} tableNumber={tableNumber} />
      </header>

      <div
        style={{ background: brandColor, color: "#fff", padding: "16px 20px" }}
      >
        <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
          {restaurant?.name}
        </h2>
        <div style={{ fontSize: "14px", opacity: 0.9, marginTop: "4px" }}>
          🟢 Open • ⏱️ 20 mins
        </div>
      </div>

      <div style={{ background: "#fff", marginTop: "8px" }}>
        {cart.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "16px 20px",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "4px",
                }}
              >
                <span style={{ fontSize: "12px" }}>
                  {item.veg ? "🟢" : "🔺"}
                </span>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 500 }}>
                  {item.name}
                </h3>
              </div>
              <div
                style={{
                  color: "#6b7280",
                  fontSize: "14px",
                  marginBottom: "2px",
                }}
              >
                ₹{item.price.toFixed(2)} each
              </div>
              <div style={{ fontWeight: 600, fontSize: "14px" }}>
                Total: ₹{(item.price * item.quantity).toFixed(2)}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                style={{
                  background: "#fff",
                  border: "none",
                  width: "36px",
                  height: "36px",
                  cursor: "pointer",
                  fontWeight: 600,
                  color: brandColor,
                }}
              >
                -
              </button>
              <span
                style={{
                  background: "#f8f9fa",
                  minWidth: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                }}
              >
                {item.quantity}
              </span>
              <button
                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                style={{
                  background: "#fff",
                  border: "none",
                  width: "36px",
                  height: "36px",
                  cursor: "pointer",
                  fontWeight: 600,
                  color: brandColor,
                }}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{ background: "#fff", padding: "16px 20px", marginTop: "8px" }}
      >
        <Link
          href={`/order?r=${restaurantId}&t=${tableNumber}`}
          style={{
            color: brandColor,
            textDecoration: "none",
            fontWeight: 500,
            display: "block",
            marginBottom: "8px",
          }}
        >
          + Add more items
        </Link>
      </div>

      <div style={{ background: "#fff", marginTop: "8px", padding: "20px" }}>
        {/* Temporary debug info */}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <span>Subtotal</span>
          <span>₹{subtotalEx.toFixed(2)}</span>
        </div>
        {totals.taxAmount > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
              color: "#6b7280",
            }}
          >
            <span>Tax({totals.taxRateDisplay || 0}%)</span>
            <span>₹{totals.taxAmount.toFixed(2)}</span>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 700,
            fontSize: "18px",
            borderTop: "1px solid #e5e7eb",
            paddingTop: "12px",
          }}
        >
          <span>Total Amount</span>
          <span>₹{totalInc.toFixed(2)}</span>
        </div>
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px",
          background: "#fff",
          borderTop: "1px solid #e5e7eb",
        }}
      >
        <Link
          href={`/order/payment?r=${restaurantId}&t=${tableNumber}&total=${totalInc}`}
          style={{
            display: "block",
            width: "100%",
            background: brandColor,
            color: "#fff",
            textDecoration: "none",
            padding: "16px",
            textAlign: "center",
            borderRadius: "8px",
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "8px",
          }}
        >
          Proceed to Payment (₹{totalInc.toFixed(2)})
        </Link>
        <div
          style={{ textAlign: "center", fontSize: "12px", color: "#6b7280" }}
        >
          🔒 Your order & payment details are completely secure
        </div>
      </div>
    </div>
  );
}
