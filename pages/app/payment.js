//pages/app/payment.js

import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../../services/supabase";
import { useCustomerAuth } from "../../context/CustomerAuthContext";


const cartKey = (restaurantId) => `cart_delivery_${restaurantId}`;

export default function DeliveryPayment() {
  const router = useRouter();
  const supabase = getSupabase();
  const { user } = useCustomerAuth();
  const { r: restaurantId } = router.query;

  const [restaurant, setRestaurant] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  const [payMode, setPayMode] = useState("cod"); // "cod" | "online"
  const [placing, setPlacing] = useState(false);

  // Delivery details
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [custHouseNo, setCustHouseNo] = useState("");
  const [custStreet, setCustStreet] = useState("");
  const [note, setNote] = useState("");

  const isNameValid = custName.trim().length > 0;
  const isPhoneValid = custPhone.length === 10;
  const isAddrValid = custHouseNo.trim().length >= 5 && /[a-zA-Z]/.test(custHouseNo);
  const isFormValid = isNameValid && isPhoneValid && isAddrValid;

  useEffect(() => {
    if (!restaurantId) return;

    const load = async () => {
      setLoading(true);

      const { data: rest } = await supabase
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
        .eq("id", restaurantId)
        .single();

      setRestaurant(rest || null);

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

        // Prefill detected address
        const detected = localStorage.getItem("detected_delivery_address");
        if (detected) setCustAddress(detected);

        // Fetch Profile Data (SSOT)
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('customers')
            .select('name, phone')
            .eq('user_id', user.id)
            .maybeSingle();

          if (profile) {
            if (profile.name) setCustName(profile.name);
            if (profile.phone) setCustPhone(profile.phone.replace(/\D/g, '').slice(0, 10));
          }
        }
      }

      setLoading(false);
    };

    load();

    // Listen for auth changes to re-fetch if needed
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          const { data: profile } = await supabase
            .from('customers')
            .select('name, phone')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (profile) {
            if (profile.name) setCustName(profile.name);
            if (profile.phone) setCustPhone(profile.phone.replace(/\D/g, '').slice(0, 10));
          }
        }
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [restaurantId, supabase]);

  const brandColor = restaurant?.restaurant_profiles?.brand_color || "#f59e0b";
  const onlineEnabled = !!restaurant?.restaurant_profiles?.online_payment_enabled;

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

    return { subtotalEx, taxAmount, totalInc };
  }, [cart, restaurant]);

  const validateDelivery = () => {
    if (!isNameValid) return "Please enter your name.";
    if (!isPhoneValid) return "Please enter a valid phone number.";
    if (!isAddrValid) return "Please enter a valid address.";
    if (!restaurantId) return "Missing restaurant.";
    if (!cart?.length) return "Cart is empty.";
    if (!Number.isFinite(totals.totalInc) || totals.totalInc <= 0)
      return "Invalid total amount.";
    return "";
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

  const saveLastDeliveryDetails = async (user) => {
    // 1. Local Storage (Backup)
    try {
      localStorage.setItem(
        "last_delivery_details",
        JSON.stringify({
          name: custName.trim(),
          phone: custPhone.trim(),
          address: custAddress.trim(),
        })
      );
    } catch { }

    // 2. DB Sync (SSOT)
    if (user) {
      try {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (existing) {
          await supabase.from('customers').update({
            name: custName.trim(),
            phone: custPhone.trim()
          }).eq('id', existing.id);
        } else {
          await supabase.from('customers').insert({
            user_id: user.id,
            name: custName.trim(),
            phone: custPhone.trim()
          });
        }
      } catch (err) {
        console.error("Profile sync failed:", err);
      }
    }
  };

  const buildDeliveryBlock = () => {
    return [
      "Delivery Details:",
      `Name: ${custName.trim()}`,
      `Phone: ${custPhone.trim()}`,
      `Address: ${custHouseNo.trim()}, ${custStreet.trim()}`,
      `Map Location: ${custAddress.trim()}`,
      note.trim() ? `Note: ${note.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const buildOrderPayload = () => {
    const deliveryBlock = buildDeliveryBlock();

    return {
      restaurant_id: restaurantId,
      restaurant_name: restaurant?.name || null,
      customer_name: custName.trim(),
      customer_phone: custPhone.trim(),
      table_number: "DELIVERY",
      items: cart.map((i) => ({
        id: i.menu_item_id || i.id, // Use real UUID if available (handle reorder case)
        name: i.name,
        price: Number(i.price) || 0,
        quantity: Number(i.quantity) || 1,
        veg: !!i.veg,
        variant_id: i.selectedVariant?.variant_id || null,
        variant_name: i.selectedVariant?.variant_name || null,
      })),
      subtotal: totals.subtotalEx,
      tax: totals.taxAmount,
      total_amount: totals.totalInc,
      special_instructions: deliveryBlock,
      user_id: user?.id || null,
    };
  };

  const placeCOD = async () => {
    // Fresh auth check as per requirement
    const { data: { user: currentUser } } = await supabase.auth.getUser();

    if (!currentUser) {
      alert("Please log in to place an order.");
      router.push("/app/auth");
      return;
    }
    const err = validateDelivery();
    if (err) return alert(err);

    setPlacing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Waiting for session... Please refresh or log in again.");
        setPlacing(false);
        return;
      }
      const token = session.access_token;

      await saveLastDeliveryDetails(currentUser);

      const orderData = {
        ...buildOrderPayload(),
        payment_method: "none",
        payment_status: "pending",
        order_type: "delivery"
      };

      console.log("Antigravity Debug: Order Payload:", orderData);

      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(orderData),
      });

      const result = await res.json();
      if (!res.ok) {
        // Expose secret error info
        throw {
          message: result.error || "Order creation failed",
          details: result.details || "None",
          hint: result.hint || "None"
        };
      }

      await notifyOwner({
        restaurantId,
        orderId: result.order_id,
        orderItems: orderData.items,
      });

      if (typeof window !== "undefined") {
        localStorage.removeItem(cartKey(restaurantId));
        localStorage.removeItem("detected_delivery_address");
      }

      const amt = encodeURIComponent(String(totals.totalInc));
      router.replace(
        `/app/success?orderId=${encodeURIComponent(
          result.order_id || result.id
        )}&method=cod&amt=${amt}`
      );
    } catch (e) {
      console.error("Antigravity Debug: Place Order Error:", e);
      alert("DB Error: " + (e.message || e) + " | Details: " + (e.details || "None"));

      const msg = 'An error occurred while confirming your order. Please check your "Order History" to see if it was successfully placed.';
      if (confirm(msg)) {
        router.push("/app/orders/history");
      }
    } finally {
      setPlacing(false);
    }
  };

  const ensureRazorpayScript = async () => {
    if (typeof window === "undefined") return;
    if (window.Razorpay) return;

    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  };

  const payOnlineRazorpay = async () => {
    // Fresh auth check
    const { data: { user: currentUser } } = await supabase.auth.getUser();

    if (!currentUser) {
      alert("Please log in to place an order.");
      router.push("/app/auth");
      return;
    }
    if (!restaurant) return alert("Restaurant info missing");
    const err = validateDelivery();
    if (err) return alert(err);

    if (!onlineEnabled) return alert("Online payment is disabled for this restaurant.");
    if (typeof window === "undefined") return;

    const publicKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!publicKey) {
      return alert("Missing NEXT_PUBLIC_RAZORPAY_KEY_ID in environment.");
    }

    setPlacing(true);
    try {
      await saveLastDeliveryDetails(currentUser);
      await ensureRazorpayScript();

      // 1) Create Razorpay order on server
      const resp = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: totals.totalInc,
          currency: "INR",
          customer_name: custName.trim(),
          customer_email: "guest@restaurant.com",
          customer_phone: custPhone.trim(),
          metadata: {
            restaurant_id: restaurantId,
            source: "delivery_app",
          },
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Failed to create payment order");

      // 2) Store pending delivery order locally (created after payment success)
      const pendingDeliveryOrder = {
        ...buildOrderPayload(),
        payment_method: "online",
        payment_status: "completed",
        payment_details: {
          provider: "razorpay",
          razorpay_order_id: data.order_id,
          amount: data.amount,
          currency: data.currency,
        },
      };

      localStorage.setItem(
        "pending_delivery_order",
        JSON.stringify(pendingDeliveryOrder)
      );

      // 3) Open Razorpay checkout
      const options = {
        key: publicKey,
        order_id: data.order_id,
        amount: data.amount,
        currency: data.currency,
        name: restaurant?.name || "Restaurant",
        description: "Delivery order payment",
        prefill: {
          name: custName.trim(),
          contact: custPhone.trim(),
        },
        theme: { color: brandColor },
        handler: function (response) {
          try {
            localStorage.setItem(
              "delivery_payment_session",
              JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                amount: data.amount,
                currency: data.currency,
              })
            );
          } catch {
            // ignore
          }
          localStorage.removeItem("detected_delivery_address");
          window.location.href = "/app/payment-success";
        },
        modal: {
          ondismiss: function () {
            setPlacing(false);
          },
        },
      };

      const rz = new window.Razorpay(options);
      rz.open();
    } catch (e) {
      setPlacing(false);
      alert(e?.message || "Online payment failed to start.");
    }
  };

  if (loading) return <div className="p-4 text-center text-gray-500">Loading...</div>;

  if (!restaurantId || !restaurant) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        Missing restaurant.
        <div style={{ marginTop: 10 }}>
          <Link href="/app">Back</Link>
        </div>
      </div>
    );
  }

  if (!cart?.length) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        Your cart is empty.
        <div style={{ marginTop: 10 }}>
          <Link href={`/app/restaurant/${restaurantId}`}>Browse menu</Link>
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
      </header>

      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Customer info</div>

          <label style={{ fontSize: 12, color: "#6b7280" }}>Name <span style={{ color: "red" }}>*</span></label>
          <input
            value={custName}
            onChange={(e) => setCustName(e.target.value)}
            placeholder="Your name"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: !isNameValid && custName.length > 0 ? "1px solid red" : "1px solid #e5e7eb",
              marginTop: 6,
              outline: "none",
            }}
          />

          <div style={{ height: 10 }} />

          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Phone <span style={{ color: "red" }}>*</span>
            {custPhone.length > 0 && !isPhoneValid && (
              <span style={{ color: "red", marginLeft: 8 }}>Enter valid phone number</span>
            )}
          </label>
          <input
            value={custPhone}
            onChange={(e) => setCustPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit mobile number"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: !isPhoneValid && custPhone.length > 0 ? "1px solid red" : "1px solid #e5e7eb",
              marginTop: 6,
              outline: "none",
            }}
          />

          <div style={{ height: 10 }} />

          <label style={{ fontSize: 12, color: "#6b7280" }}>Delivery Location</label>
          <div
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              marginTop: 6,
              background: "#f9fafb",
              color: "#374151",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            <div style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {custAddress || "Location not detected"}
            </div>
          </div>

          <div style={{ height: 10 }} />

          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Address details <span style={{ color: "red" }}>*</span>
            {custHouseNo.length > 0 && !isAddrValid && (
              <span style={{ color: "red", marginLeft: 8 }}>Enter a valid address</span>
            )}
          </label>
          <input
            value={custHouseNo}
            onChange={(e) => setCustHouseNo(e.target.value)}
            placeholder="House / Flat No. / Building Name"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: !isAddrValid && custHouseNo.length > 0 ? "1px solid red" : "1px solid #e5e7eb",
              marginTop: 6,
              outline: "none",
            }}
          />
          <input
            value={custStreet}
            onChange={(e) => setCustStreet(e.target.value)}
            placeholder="Street / Locality / Landmark"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              marginTop: 8, // slight gap between these two related fields
              outline: "none",
            }}
          />

          <div style={{ height: 10 }} />

          <label style={{ fontSize: 12, color: "#6b7280" }}>Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any special instructions?"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              marginTop: 6,
              outline: "none",
            }}
          />
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Payment method</div>

          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="paymode"
              checked={payMode === "cod"}
              onChange={() => setPayMode("cod")}
            />
            <div style={{ fontWeight: 800 }}>Cash on delivery</div>
          </label>

          <div style={{ height: 10 }} />

          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              cursor: onlineEnabled ? "pointer" : "not-allowed",
              opacity: onlineEnabled ? 1 : 0.6,
            }}
          >
            <input
              type="radio"
              name="paymode"
              disabled={!onlineEnabled}
              checked={payMode === "online"}
              onChange={() => setPayMode("online")}
            />
            <div style={{ fontWeight: 800 }}>Online payment (Razorpay)</div>
          </label>

          {!onlineEnabled ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
              Online payment is disabled for this restaurant.
            </div>
          ) : null}
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
          disabled={placing || !isFormValid}
          onClick={() => (payMode === "online" ? payOnlineRazorpay() : placeCOD())}
          style={{
            width: "100%",
            background: brandColor,
            border: "none",
            color: "#fff",
            borderRadius: 14,
            padding: 14,
            fontWeight: 900,
            cursor: (placing || !isFormValid) ? "not-allowed" : "pointer",
            opacity: isFormValid ? 1 : 0.5,
          }}
        >
          {placing ? "Please wait…" : payMode === "online" ? "Pay & Place order" : "Place order"}
        </button>

        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
          You will receive confirmation after the order is placed.
        </div>
      </div>
    </div>
  );
}
