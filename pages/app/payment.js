//pages/app/payment.js

import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCustomerSupabase } from "../../services/supabase";
import { useCustomerAuth } from "../../context/CustomerAuthContext";


const cartKey = (restaurantId) => `cart_delivery_${restaurantId}`;

export default function DeliveryPayment() {
  const router = useRouter();
  const supabase = getCustomerSupabase();
  const { user } = useCustomerAuth();
  const { r: restaurantId } = router.query;

  const [restaurant, setRestaurant] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [payMode, setPayMode] = useState("cod"); // "cod" | "online"
  const [placing, setPlacing] = useState(false);
  const [successStep, setSuccessStep] = useState(false);
  const [sessionToken, setSessionToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // Delivery details
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [custHouseNo, setCustHouseNo] = useState("");
  const [custStreet, setCustStreet] = useState("");
  const [note, setNote] = useState("");

  // Delivery availability state (defense-in-depth)
  const [isDeliveryClosed, setIsDeliveryClosed] = useState(false);
  const [deliveryClosedMessage, setDeliveryClosedMessage] = useState("");

  const isNameValid = custName.trim().length > 0;
  const isPhoneValid = custPhone.length >= 10;
  const isAddrValid = custHouseNo.trim().length > 0;
  const isFormValid = isNameValid && isPhoneValid && isAddrValid;

  // Helper: race a promise against a timeout (for Android APK where network may hang)
  const withTimeout = (promise, ms, label = "Operation") => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
      ),
    ]);
  };

  useEffect(() => {
    if (!restaurantId) return;

    const load = async () => {
      setLoading(true);
      setLoadError("");

      let rest = null;
      try {
        // 1. Fetch restaurant (with 10s timeout)
        const { data: restData, error: restErr } = await withTimeout(
          supabase
            .from("restaurants")
            .select(
              `
              id,
              name,
              delivery_paused,
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
            .single(),
          10000, "Restaurant fetch"
        );

        if (restErr) console.warn("Restaurant fetch error:", restErr.message);
        rest = restData || null;
        setRestaurant(rest);

        if (typeof window !== "undefined") {
          // 2. Load cart from localStorage (sync, always works)
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

          // 3. Get session (with 8s timeout — uses Capacitor Preferences on Android)
          try {
            const { data: { session } } = await withTimeout(
              supabase.auth.getSession(),
              8000, "Session fetch"
            );
            if (session) {
              setSessionToken(session.access_token);
              // Use session.user instead of getUser() to avoid an extra network call
              // getUser() makes a direct HTTP request to Supabase that can hang on Android
              const sessionUser = session.user;
              if (sessionUser) {
                setCurrentUser(sessionUser);
                // 4. Fetch customer profile (with 8s timeout)
                try {
                  const { data: profile } = await withTimeout(
                    supabase
                      .from('customers')
                      .select('name, phone')
                      .eq('user_id', sessionUser.id)
                      .maybeSingle(),
                    8000, "Profile fetch"
                  );
                  if (profile) {
                    if (profile.name) setCustName(profile.name);
                    if (profile.phone) setCustPhone(profile.phone.replace(/\D/g, '').slice(0, 10));
                  }
                } catch (profileErr) {
                  console.warn("Profile fetch error:", profileErr);
                }
              }
            }
          } catch (sessionErr) {
            console.warn("Session fetch error:", sessionErr);
            // Fallback: try to use user from CustomerAuthContext
            if (user) {
              setCurrentUser(user);
            }
          }
        }

        // 5. Check delivery availability (with 8s timeout)
        if (rest) {
          if (rest.delivery_paused) {
            setIsDeliveryClosed(true);
            setDeliveryClosedMessage("Delivery is currently paused");
          } else {
            try {
              const { data: dHours } = await withTimeout(
                supabase
                  .from("delivery_hours")
                  .select("dow, open_time, close_time, enabled")
                  .eq("restaurant_id", restaurantId),
                8000, "Delivery hours"
              );

              if (dHours && dHours.length > 0) {
                const now = new Date();
                const currentDOW = now.getDay() === 0 ? 7 : now.getDay();
                const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
                const todayHours = dHours.find((h) => h.dow === currentDOW);

                if (!todayHours || !todayHours.enabled) {
                  setIsDeliveryClosed(true);
                  setDeliveryClosedMessage("Delivery is not available today");
                } else if (todayHours.open_time && todayHours.close_time) {
                  const openTime = todayHours.open_time.substring(0, 5);
                  const closeTime = todayHours.close_time.substring(0, 5);
                  if (currentTime < openTime || currentTime > closeTime) {
                    setIsDeliveryClosed(true);
                    setDeliveryClosedMessage(`Delivery is closed. Opens at ${openTime}, closes at ${closeTime}`);
                  }
                }
              }
            } catch (hoursErr) {
              console.warn("Delivery hours check error:", hoursErr);
            }
          }
        }
      } catch (e) {
        console.error("Payment page load error:", e);
        setLoadError(e?.message || "Failed to load payment details. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    // Global safety net: if load() itself hangs for >20s, force-complete
    let loadDone = false;
    const safetyTimer = setTimeout(() => {
      if (!loadDone) {
        console.warn("Payment load safety timeout reached (20s)");
        setLoading(false);
        setLoadError("Loading took too long. Please check your connection and try again.");
      }
    }, 20000);

    load().finally(() => {
      loadDone = true;
      clearTimeout(safetyTimer);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setSessionToken(session.access_token);
      } else {
        setSessionToken(null);
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setCurrentUser(session.user);
          try {
            const { data: profile } = await supabase
              .from('customers')
              .select('name, phone')
              .eq('user_id', session.user.id)
              .maybeSingle();

            if (profile) {
              if (profile.name) setCustName(profile.name);
              if (profile.phone) setCustPhone(profile.phone.replace(/\D/g, '').slice(0, 10));
            }
          } catch { /* best effort */ }
        } else {
          setCurrentUser(null);
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
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

  const buildOrderPayload = (currentUser) => {
    return {
      restaurant_id: restaurantId,
      customer_name: custName.trim(),
      customer_phone: custPhone.trim(),
      table_number: "DELIVERY",
      items: cart.map((i) => ({
        id: i.menu_item_id || i.id,
        name: i.name,
        price: Number(i.price) || 0,
        quantity: Number(i.quantity) || 1,
        variant_id: i.selectedVariant?.variant_id || null,
        variant_name: i.selectedVariant?.variant_name || null,
      })),
      special_instructions: buildDeliveryBlock(),
      user_id: currentUser?.id || user?.id || null,
    };
  };

  const placeCOD = () => {
    // Rely on pre-fetched state for instant execution
    if (!currentUser) {
      alert("Please log in to place an order.");
      router.push("/app/auth");
      return;
    }
    const err = validateDelivery();
    if (err) return alert(err);

    setPlacing(true);

    // Fire-and-forget save of user details
    saveLastDeliveryDetails(currentUser).catch(console.error);

    if (!sessionToken) {
      alert("Waiting for session... Please refresh or log in again.");
      setPlacing(false);
      return;
    }

    const orderData = {
      ...buildOrderPayload(currentUser),
      payment_method: "none",
      payment_status: "pending",
      order_type: "delivery"
    };

    // Optimistic UI: 1. Clear Cart First
    if (typeof window !== "undefined") {
      localStorage.removeItem(cartKey(restaurantId));
      localStorage.removeItem("detected_delivery_address");
    }
    setCart([]); // Clear state immediately

    // Optimistic UI: 2. In-Place Success Overlay
    setSuccessStep(true);
    setTimeout(() => {
      router.replace("/app/restaurants");
    }, 1500);

    // Process backend in the background seamlessly
    (async () => {
      try {
        const res = await fetch("/api/orders/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${sessionToken}`
          },
          body: JSON.stringify(orderData),
        });

        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || "Order creation failed");
        }

        await notifyOwner({
          restaurantId,
          orderId: result.order_id,
          orderItems: orderData.items,
        });
      } catch (e) {
        console.error("Antigravity Debug: Place Order Background Error:", e);
        if (typeof window !== 'undefined') {
          alert("Order Sync Warning: There was an issue finalizing your order in the background. " + (e.message || e));
        }
      }
    })();
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
    // Rely on pre-fetched state
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
        ...buildOrderPayload(currentUser),
        total_amount: totals.totalInc,
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
            const payload = {
              ...pendingDeliveryOrder,
              payment_details: {
                ...pendingDeliveryOrder.payment_details,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            };

            // Clear immediately
            localStorage.removeItem("detected_delivery_address");
            if (typeof window !== "undefined") {
              localStorage.removeItem(cartKey(restaurantId));
            }
            setCart([]);

            // Trigger Success UI
            setSuccessStep(true);
            setTimeout(() => {
              router.replace("/app/restaurants");
            }, 1500);

            // Async Background Process
            fetch("/api/orders/create", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${sessionToken}`
              },
              body: JSON.stringify(payload),
            })
              .then(res => res.json())
              .then(result => {
                if (result.order_id || result.id) {
                  fetch("/api/notify-owner", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      restaurantId,
                      orderId: result.order_id ?? result.id,
                      orderItems: pendingDeliveryOrder.items || [],
                    }),
                  }).catch(() => { });
                }
              }).catch(console.error);

          } catch (e) {
            console.error(e);
          }
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

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8f9fa" }}>
      <div style={{ width: 48, height: 48, border: "4px solid #e5e7eb", borderTop: "4px solid #f97316", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ marginTop: 16, color: "#6b7280", fontWeight: 600, fontSize: 15 }}>Loading payment details…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (loadError) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8f9fa", padding: 24 }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, border: "2px solid #fecaca" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      </div>
      <h2 style={{ margin: 0, color: "#111827", fontSize: 20, fontWeight: 800 }}>Something went wrong</h2>
      <p style={{ color: "#6b7280", marginTop: 8, textAlign: "center", fontSize: 14, lineHeight: 1.5 }}>{loadError}</p>
      <button
        onClick={() => window.location.reload()}
        style={{ marginTop: 20, background: "#f97316", color: "#fff", border: "none", borderRadius: 14, padding: "14px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 14px rgba(249,115,22,0.3)" }}
      >Retry</button>
      <button
        onClick={() => router.back()}
        style={{ marginTop: 10, background: "transparent", color: "#6b7280", border: "none", padding: "10px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
      >Go Back</button>
    </div>
  );

  if (successStep) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8f9fa" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#10b981", color: "white", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <svg fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" width="40" height="40">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <h2 style={{ margin: 0, color: "#111827", fontSize: 24, fontWeight: 800 }}>Order Placed!</h2>
      </div>
    );
  }

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

  if (!placing && !cart?.length) {
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

      {isDeliveryClosed && (
        <div style={{
          margin: '12px 16px', padding: '14px 18px', borderRadius: 12,
          background: '#fef2f2', border: '1px solid #fee2e2',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 14, fontWeight: 600, color: '#dc2626'
        }}>
          🕐 {deliveryClosedMessage}
        </div>
      )}

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
          disabled={placing || !isFormValid || isDeliveryClosed}
          onClick={() => (payMode === "online" ? payOnlineRazorpay() : placeCOD())}
          style={{
            width: "100%",
            background: placing || !isFormValid || isDeliveryClosed ? "#d1d5db" : brandColor,
            color: "#fff",
            padding: 16,
            borderRadius: 14,
            fontWeight: 800,
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            border: "none",
            cursor: placing || !isFormValid ? "not-allowed" : "pointer",
          }}
        >
          {placing ? (
            <span>Processing...</span>
          ) : payMode === "cod" ? (
            <span>Confirm Order (COD)</span>
          ) : (
            <span>Pay ₹{totals.totalInc.toFixed(2)}</span>
          )}
        </button>
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
          You will receive confirmation after the order is placed.
        </div>
      </div>
    </div>
  );
}
