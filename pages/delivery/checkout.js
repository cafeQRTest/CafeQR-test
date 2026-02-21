// pages/delivery/checkout.js
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../../services/supabase";


export default function DeliveryCheckout() {
  const router = useRouter();
  const supabase = getSupabase();
  const { r: restaurantId, t: tableNumber } = router.query;

  const tNum = (tableNumber ? String(tableNumber) : "DELIVERY").toUpperCase();
  const isDelivery = tNum === "DELIVERY";

  const [restaurant, setRestaurant] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);

  // Customer details (no auth)
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [houseNo, setHouseNo] = useState("");
  const [street, setStreet] = useState("");
  const [mapLocation, setMapLocation] = useState("");
  const [note, setNote] = useState("");


  // new state
  const [gps, setGps] = useState(null);
  const [gpsBusy, setGpsBusy] = useState(false);

  const detectGps = async () => {
    setGpsBusy(true);
    try {
      if (!navigator.geolocation) throw new Error("Geolocation not supported");
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
      );
      const { latitude, longitude } = pos.coords;
      const lat = Number(latitude);
      const lng = Number(longitude);
      setGps({ lat, lng });
      setMapLocation(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      localStorage.setItem("detected_delivery_coords", JSON.stringify({ lat, lng }));
    } catch (e) {
      alert(e?.message || "Failed to detect GPS location");
    } finally {
      setGpsBusy(false);
    }
  };

  // Use the SAME cart key pattern your QR pages already use: cart_${restaurantId}_${tableNumber}
  const cartStorageKey = useMemo(() => {
    if (!restaurantId) return null;
    return `cart_${String(restaurantId)}_${tNum}`;
  }, [restaurantId, tNum]);

  useEffect(() => {
    if (!restaurantId) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data: rest, error } = await supabase
          .from("restaurants")
          .select(
            `
            id,
            name,
            restaurant_profiles(
              brand_color,
              online_payment_enabled,
              use_own_gateway,
              gst_enabled,
              default_tax_rate,
              prices_include_tax
            )
          `
          )
          .eq("id", String(restaurantId))
          .single();

        if (error) throw error;
        setRestaurant(rest || null);

        if (typeof window !== "undefined") {
          // Load cart
          if (cartStorageKey) {
            const stored = localStorage.getItem(cartStorageKey);
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

          // Prefill last details
          try {
            const last = JSON.parse(localStorage.getItem("last_delivery_details") || "null");
            if (last?.name) setCustName(last.name);
            if (last?.phone) setCustPhone(last.phone);
            if (last?.houseNo) setHouseNo(last.houseNo);
            if (last?.street) setStreet(last.street);
            if (last?.mapLocation) setMapLocation(last.mapLocation);
            if (last?.note) setNote(last.note); // ✅ move it here
          } catch { }

          // If you already store detected location somewhere, reuse it
          const detected = localStorage.getItem("detected_delivery_address");
          if (detected && !mapLocation) setMapLocation(detected);
        }
      } catch (e) {
        console.error("Delivery checkout load failed:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [restaurantId, supabase, cartStorageKey]);

  const brandColor = restaurant?.restaurant_profiles?.brand_color || "#f59e0b";

  // Totals logic aligned with your existing payment/cart logic (GST + packaged goods handling)
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

    (cart || []).forEach((item) => {
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

    return { subtotalEx, taxAmount, totalInc };
  }, [cart, restaurant]);

  const validate = () => {
    if (!isDelivery) return "Invalid delivery session.";
    if (!restaurantId) return "Missing restaurant.";
    if (!cart?.length) return "Cart is empty.";
    if (!custName.trim()) return "Please enter your name.";
    if (!custPhone.trim() || custPhone.trim().length < 8) return "Please enter a valid phone number.";
    if (!houseNo.trim()) return "Please enter House / Flat / Building.";
    if (!street.trim()) return "Please enter Street / Locality / Landmark.";
    if (!mapLocation.trim()) return "Please enter your location (area).";
    if (!Number.isFinite(totals.totalInc) || totals.totalInc <= 0) return "Invalid total amount.";
    return "";
  };

  const buildDeliveryBlock = () => {
    return [
      "Delivery Details:",
      `Name: ${custName.trim()}`,
      `Phone: ${custPhone.trim()}`,
      `Address: ${houseNo.trim()}, ${street.trim()}`,
      `Location: ${mapLocation.trim()}`,
      note.trim() ? `Note: ${note.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const notifyOwner = async (payload) => {
    try {
      await fetch("/api/notify-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // best-effort
    }
  };

  const placeCOD = async () => {
    const err = validate();
    if (err) return alert(err);

    setPlacing(true);
    try {
      // Save last details (local only)
      try {
        localStorage.setItem(
          "last_delivery_details",
          JSON.stringify({
            name: custName.trim(),
            phone: custPhone.trim(),
            houseNo: houseNo.trim(),
            street: street.trim(),
            mapLocation: mapLocation.trim(),
            note: note.trim(),
          })
        );
      } catch { }




      const orderData = {
        restaurant_id: String(restaurantId),
        restaurant_name: restaurant?.name || null,
        table_number: "DELIVERY",
        order_type: "counter", // or "delivery" if you want, but keep consistent in DB

        customer_name: custName.trim(),
        customer_phone: custPhone.trim(),

        items: cart.map((i) => ({
          // IMPORTANT: your API reads (menu_item_id || id)
          menu_item_id: i.menu_item_id || i.id,
          name: i.displayName || i.name,
          price: Number(i.price) || 0,
          quantity: Number(i.quantity) || 1,
          veg: !!i.veg,
          variant_id: i.selectedVariant?.variant_id || null,
          variant_name: i.selectedVariant?.variant_name || null,
        })),

        subtotal: totals.subtotalEx,
        tax: totals.taxAmount,
        totalamount: totals.totalInc,

        special_instructions: buildDeliveryBlock(),

        payment_method: "none",
        payment_status: "pending",
      };

      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || "Order creation failed");

      await notifyOwner({
        restaurantId: String(restaurantId),
        orderId: result.order_id || result.id,
        orderItems: orderData.items,
      });

      // Clear cart
      try {
        if (cartStorageKey) localStorage.removeItem(cartStorageKey);
      } catch { }

      const amt = encodeURIComponent(String(totals.totalInc));
      // Reuse your existing QR success page
      router.replace(`/order/success?id=${encodeURIComponent(result.order_id || result.id)}&method=cod&amt=${amt}`);
    } catch (e) {
      console.error("Delivery order error:", e);
      alert(e?.message || "Failed to place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading delivery checkout...</div>;

  if (!restaurantId || !restaurant) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        Missing restaurant.
        <div style={{ marginTop: 10 }}>
          <Link href="/delivery">Back</Link>
        </div>
      </div>
    );
  }

  if (!cart?.length) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        Your cart is empty.
        <div style={{ marginTop: 10 }}>
          <Link href={`/order?r=${encodeURIComponent(String(restaurantId))}&t=DELIVERY`}>Browse menu</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", paddingBottom: 120 }}>
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
        <div style={{ fontWeight: 900, flex: 1 }}>Delivery details</div>
        <div style={{ fontWeight: 900, color: brandColor }}>{restaurant?.name}</div>
      </header>

      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Customer info</div>

          <label style={{ fontSize: 12, color: "#6b7280" }}>Name</label>
          <input
            value={custName}
            onChange={(e) => setCustName(e.target.value)}
            placeholder="Your name"
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", marginTop: 6, outline: "none" }}
          />

          <div style={{ height: 10 }} />

          <label style={{ fontSize: 12, color: "#6b7280" }}>Phone</label>
          <input
            value={custPhone}
            onChange={(e) => setCustPhone(e.target.value)}
            placeholder="Your phone number"
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", marginTop: 6, outline: "none" }}
          />

          <div style={{ height: 10 }} />

          <label style={{ fontSize: 12, color: "#6b7280" }}>Location (Area)</label>
          <input
            value={mapLocation}
            onChange={(e) => setMapLocation(e.target.value)}
            placeholder="Eg: Ayyanthole, Thrissur"
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", marginTop: 6, outline: "none" }}
          />
          <button type="button" onClick={detectGps} disabled={gpsBusy}>
            {gpsBusy ? "Detecting..." : "Use my GPS"}
          </button>

          <div style={{ height: 10 }} />

          <label style={{ fontSize: 12, color: "#6b7280" }}>Address details</label>
          <input
            value={houseNo}
            onChange={(e) => setHouseNo(e.target.value)}
            placeholder="House / Flat No. / Building Name"
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", marginTop: 6, outline: "none" }}
          />
          <input
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="Street / Locality / Landmark"
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", marginTop: 8, outline: "none" }}
          />

          <div style={{ height: 10 }} />

          <label style={{ fontSize: 12, color: "#6b7280" }}>Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any special instructions?"
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", marginTop: 6, outline: "none" }}
          />
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span>Subtotal</span>
            <span>₹{totals.subtotalEx.toFixed(2)}</span>
          </div>
          {totals.taxAmount > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#6b7280" }}>
              <span>Tax</span>
              <span>₹{totals.taxAmount.toFixed(2)}</span>
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 18 }}>
            <span>Total</span>
            <span>₹{totals.totalInc.toFixed(2)}</span>
          </div>
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
        <button
          disabled={placing}
          onClick={placeCOD}
          style={{
            width: "100%",
            background: brandColor,
            border: "none",
            color: "#fff",
            borderRadius: 14,
            padding: 14,
            fontWeight: 900,
            cursor: placing ? "not-allowed" : "pointer",
          }}
        >
          {placing ? "Please wait…" : "Place delivery order (COD)"}
        </button>

        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
          Order will appear in POS as Table: DELIVERY.
        </div>
      </div>
    </div>
  );
}
