// pages/app/index.js

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../../services/supabase";
import { getOrCreateCustomer } from "../../lib/customer/getOrCreateCustomer";

export default function DeliveryAppHome() {
  const supabase = getSupabase();

  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [addrLoading, setAddrLoading] = useState(true);
  const [defaultAddress, setDefaultAddress] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, restaurant_profiles(brand_color)")
        .order("name", { ascending: true });

      if (!error) setRestaurants(data || []);
      setLoading(false);
    };

    load();
  }, [supabase]);

  useEffect(() => {
    const loadDefaultAddress = async () => {
      setAddrLoading(true);
      try {
        const customer = await getOrCreateCustomer();
        const { data } = await supabase
          .from("customer_addresses")
          .select("*")
          .eq("customer_id", customer.id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: false });

        const def = (data || []).find((a) => a.is_default) || (data || [])[0] || null;
        setDefaultAddress(def);
      } catch {
        setDefaultAddress(null);
      } finally {
        setAddrLoading(false);
      }
    };

    loadDefaultAddress();
  }, [supabase]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (restaurants || []).filter((r) =>
      (r?.name || "").toLowerCase().includes(term)
    );
  }, [restaurants, q]);

  const topAddressText = useMemo(() => {
    if (addrLoading) return "Loading address…";
    if (!defaultAddress) return "Add delivery address";
    const parts = [
      defaultAddress.label,
      defaultAddress.line1,
      defaultAddress.city,
      defaultAddress.state,
    ].filter(Boolean);
    return parts.join(" • ");
  }, [addrLoading, defaultAddress]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", paddingBottom: 84 }}>
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "14px 16px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#111827" }}>
              CafeQR Delivery
            </div>

            <Link
              href="/app/addresses"
              style={{
                display: "inline-flex",
                marginTop: 6,
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                color: "#111827",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <span style={{ color: "#f59e0b" }}>Deliver to</span>
              <span style={{ color: "#6b7280", fontWeight: 700 }}>
                {topAddressText}
              </span>
              <span style={{ color: "#f59e0b", fontWeight: 900 }}>›</span>
            </Link>
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
            title="Profile"
          >
            ☺
          </Link>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search restaurants…"
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            outline: "none",
            background: "#f8f9fa",
          }}
        />
      </header>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: "center" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
            No restaurants found.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filtered.map((r) => {
              const brand = r?.restaurant_profiles?.brand_color || "#f59e0b";
              return (
                <Link
                  key={r.id}
                  href={`/app/restaurant/${r.id}`}
                  style={{
                    textDecoration: "none",
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900, color: "#111827" }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                      Tap to view menu
                    </div>
                  </div>
                  <div
                    style={{
                      background: brand,
                      color: "#fff",
                      padding: "8px 12px",
                      borderRadius: 999,
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    Order
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

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
