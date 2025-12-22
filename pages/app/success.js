//pages/app/success.js

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../../services/supabase";

export default function DeliverySuccess() {
  const router = useRouter();
  const supabase = getSupabase();
  const { orderId, method, amt } = router.query;

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [brandColor, setBrandColor] = useState("#111827");

  useEffect(() => {
    if (!orderId) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data: o } = await supabase
          .from("orders")
          .select("*")
          .eq("id", orderId)
          .single();

        setOrder(o || null);

        if (o?.restaurant_id) {
          const { data: prof } = await supabase
            .from("restaurant_profiles")
            .select("brand_color")
            .eq("restaurant_id", o.restaurant_id)
            .single();

          if (prof?.brand_color) setBrandColor(prof.brand_color);
        }
      } catch {
        // keep UI simple even if fetch fails
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orderId, supabase]);

  const amount =
    Number(amt) ||
    Number(order?.total_amount) ||
    0;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: 16 }}>
        <h2 style={{ margin: 0 }}>Order placed</h2>
        <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
          {loading ? "Loading order details..." : "Thank you. The restaurant has received your order."}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: "#6b7280" }}>Order ID</span>
            <span style={{ fontWeight: 800 }}>{String(orderId || "").slice(0, 10)}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: "#6b7280" }}>Payment</span>
            <span style={{ fontWeight: 800 }}>{method || order?.payment_method || "unknown"}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#6b7280" }}>Amount</span>
            <span style={{ fontWeight: 900 }}>₹{Number(amount || 0).toFixed(2)}</span>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <Link
            href="/app"
            style={{
              background: brandColor,
              color: "#fff",
              textDecoration: "none",
              padding: 14,
              borderRadius: 14,
              textAlign: "center",
              fontWeight: 900,
            }}
          >
            Back to Delivery Home
          </Link>
        </div>
      </div>
    </div>
  );
}
