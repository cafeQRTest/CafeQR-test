//pages/app/index.js

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../../services/supabase";

export default function DeliveryAppHome() {
  const supabase = getSupabase();
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

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

  const filtered = restaurants.filter((r) =>
    (r?.name || "").toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa" }}>
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "16px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          CafeQR Delivery
        </h1>
        <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>
          Choose a restaurant to place a delivery order
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search restaurant..."
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            outline: "none",
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
              const brand =
                r?.restaurant_profiles?.brand_color || "#f59e0b";
              return (
                <Link
                  key={r.id}
                  href={`/app/restaurant/${r.id}`}
                  style={{
                    textDecoration: "none",
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "#111827" }}>
                      {r.name}
                    </div>
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
                      fontWeight: 700,
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
    </div>
  );
}
