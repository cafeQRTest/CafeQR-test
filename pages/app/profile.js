// pages/app/profile.js

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../../services/supabase";

export default function ProfilePage() {
  const supabase = getSupabase();

  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const [msg, setMsg] = useState("");

  useEffect(() => {
    const init = async () => {
      setLoading(true);

      const { data } = await supabase.auth.getUser();
      const user = data?.user || null;
      setSessionUser(user);

      // Load local profile first
      try {
        const local = JSON.parse(localStorage.getItem("delivery_profile") || "{}");
        if (local?.name) setName(String(local.name));
        if (local?.phone) setPhone(String(local.phone));
      } catch { }

      // Fill from Supabase user if possible
      if (user?.phone && !phone) setPhone(String(user.phone));
      if (user?.user_metadata?.full_name && !name) setName(String(user.user_metadata.full_name));

      setLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setMsg("");

    const nextName = name.trim();
    const nextPhone = phone.trim();

    // local cache
    try {
      localStorage.setItem("delivery_profile", JSON.stringify({ name: nextName, phone: nextPhone }));
    } catch { }

    if (sessionUser) {
      // ensure customer exists
      const customer = await getOrCreateCustomer();

      // store in your app table (recommended)
      await supabase
        .from("customers")
        .update({ name: nextName || null, phone: nextPhone || null })
        .eq("id", customer.id);

      // optional: also store in auth metadata (NOT auth.users.phone)
      await supabase.auth.updateUser({ data: { full_name: nextName || null, phone: nextPhone || null } }); // metadata update [web:70]
    }

    setMsg("Saved.");
    setTimeout(() => setMsg(""), 1500);
  };

  const logout = async () => {
    await supabase.auth.signOut().catch(() => { });
    window.location.href = "/app";
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", paddingBottom: 84 }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#111827" }}>Profile</div>
        <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
          Manage your delivery details and addresses
        </div>
      </header>

      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        {!sessionUser ? (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Login</div>
            <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
              Login to keep your profile synced across devices.
            </div>
            <Link
              href="/app/auth"
              style={{
                display: "inline-block",
                background: "#f59e0b",
                color: "#fff",
                textDecoration: "none",
                padding: "12px 14px",
                borderRadius: 12,
                fontWeight: 900,
              }}
            >
              Login / OTP
            </Link>
          </div>
        ) : null}

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Customer details</div>

          <label style={{ fontSize: 12, color: "#6b7280" }}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              marginTop: 6,
              outline: "none",
            }}
          />

          <div style={{ height: 10 }} />

          <label style={{ fontSize: 12, color: "#6b7280" }}>Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Your phone"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              marginTop: 6,
              outline: "none",
            }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
            <button
              onClick={save}
              style={{
                background: "#f59e0b",
                border: "none",
                color: "#fff",
                borderRadius: 12,
                padding: "12px 14px",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Save
            </button>
            {msg ? <div style={{ color: "#6b7280", fontSize: 13 }}>{msg}</div> : null}
          </div>
        </div>

        <Link
          href="/app/address"
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 14,
            textDecoration: "none",
            color: "#111827",
            fontWeight: 900,
          }}
        >
          Manage addresses →
        </Link>

        {sessionUser ? (
          <button
            onClick={logout}
            style={{
              background: "#fff",
              border: "1px solid #ef4444",
              color: "#ef4444",
              borderRadius: 14,
              padding: 14,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        ) : null}
      </div>

      <BottomNav active="profile" />
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
      <Link href="/app/address" style={itemStyle("addresses")}>
        Addresses
      </Link>
      <Link href="/app/profile" style={itemStyle("profile")}>
        Profile
      </Link>
    </div>
  );
}
