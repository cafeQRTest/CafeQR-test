// pages/app/addresses.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import getSupabase from "../../services/supabase";
import { getOrCreateCustomer } from "../../lib/customer/getOrCreateCustomer";

export default function AddressesPage() {
  const supabase = getSupabase();

  const [customer, setCustomer] = useState(null);
  const [addresses, setAddresses] = useState([]);

  const [form, setForm] = useState({
    label: "Home",
    line1: "",
    city: "",
    state: "",
    pincode: "",
    make_default: true,
  });

  const [geo, setGeo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    const c = await getOrCreateCustomer();
    setCustomer(c);

    const { data, error } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", c.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    setAddresses(data || []);
  };

  useEffect(() => {
    load().catch((e) => setErr(e?.message || "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const defaultAddress = useMemo(
    () => (addresses || []).find((a) => a.is_default) || null,
    [addresses]
  );

  const useLocation = async () => {
    setErr("");
    if (!navigator.geolocation) return setErr("Geolocation not supported");

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGeo({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (e) => setErr(e?.message || "Failed to fetch location"),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const addAddress = async () => {
    setErr("");
    if (!customer) return;
    if (!form.line1.trim()) return setErr("Address line is required");

    setBusy(true);
    try {
      // If user wants this as default, unset others first
      if (form.make_default) {
        await supabase
          .from("customer_addresses")
          .update({ is_default: false })
          .eq("customer_id", customer.id);
      }

      const payload = {
        customer_id: customer.id,
        label: form.label,
        line1: form.line1,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        geo: geo || null,
        is_default: form.make_default || addresses.length === 0,
      };

      const { error } = await supabase.from("customer_addresses").insert(payload);
      if (error) return setErr(error.message);

      setForm({
        label: "Home",
        line1: "",
        city: "",
        state: "",
        pincode: "",
        make_default: true,
      });
      setGeo(null);
      await load();
    } catch (e) {
      setErr(e?.message || "Failed to save address");
    } finally {
      setBusy(false);
    }
  };

  const setDefault = async (id) => {
    if (!customer) return;
    setBusy(true);
    setErr("");

    try {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", customer.id);

      const { error } = await supabase
        .from("customer_addresses")
        .update({ is_default: true })
        .eq("customer_id", customer.id)
        .eq("id", id);

      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e?.message || "Failed to update default address");
    } finally {
      setBusy(false);
    }
  };

  const removeAddress = async (id) => {
    if (!customer) return;
    if (!confirm("Delete this address?")) return;

    setBusy(true);
    setErr("");

    try {
      const { error } = await supabase
        .from("customer_addresses")
        .delete()
        .eq("customer_id", customer.id)
        .eq("id", id);

      if (error) throw error;

      // Reload and ensure there is a default
      const { data: after, error: afterErr } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });

      if (afterErr) throw afterErr;

      const list = after || [];
      if (list.length && !list.find((a) => a.is_default)) {
        await setDefault(list[0].id);
        return;
      }

      setAddresses(list);
    } catch (e) {
      setErr(e?.message || "Failed to delete address");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", paddingBottom: 84 }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/app" style={{ textDecoration: "none", fontWeight: 900, color: "#111827" }}>
            {"<"} Back
          </Link>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#111827" }}>Addresses</div>
        </div>

        <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
          Set a default address or use current location while ordering.
        </div>
      </header>

      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        {err ? (
          <div
            style={{
              background: "#fff",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              borderRadius: 14,
              padding: 12,
            }}
          >
            {err}
          </div>
        ) : null}

        {/* Saved */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Saved addresses</div>

          {addresses.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>No saved addresses yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {addresses.map((a) => {
                const parts = [a.line1, a.city, a.state, a.pincode].filter(Boolean).join(", ");
                return (
                  <div
                    key={a.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      padding: 12,
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900, color: "#111827" }}>
                        {a.label}{" "}
                        {a.is_default ? <span style={{ color: "#10b981", fontSize: 12 }}>(Default)</span> : null}
                      </div>
                      <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>{parts}</div>

                      {a.geo?.lat ? (
                        <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>
                          Geo: {a.geo.lat}, {a.geo.lng}
                        </div>
                      ) : null}

                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        {!a.is_default ? (
                          <button
                            disabled={busy}
                            onClick={() => setDefault(a.id)}
                            style={{
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              padding: "8px 10px",
                              borderRadius: 10,
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            Set default
                          </button>
                        ) : null}

                        <button
                          disabled={busy}
                          onClick={() => removeAddress(a.id)}
                          style={{
                            border: "1px solid #fecaca",
                            background: "#fff",
                            color: "#b91c1c",
                            padding: "8px 10px",
                            borderRadius: 10,
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {defaultAddress ? (
            <div style={{ marginTop: 12, color: "#6b7280", fontSize: 12 }}>
              Default: {[defaultAddress.line1, defaultAddress.city].filter(Boolean).join(", ")}
            </div>
          ) : null}
        </div>

        {/* Add new */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Add new address</div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Label</div>
              <select
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                style={{ padding: 10, borderRadius: 12, border: "1px solid #e5e7eb" }}
              >
                <option>Home</option>
                <option>Work</option>
                <option>Other</option>
              </select>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Address line</div>
              <textarea
                value={form.line1}
                onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
                rows={3}
                placeholder="House no, street, area..."
                style={{ padding: 10, borderRadius: 12, border: "1px solid #e5e7eb" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>City</div>
                <input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #e5e7eb" }}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>State</div>
                <input
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #e5e7eb" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Pincode</div>
                <input
                  value={form.pincode}
                  onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #e5e7eb" }}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Default</div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!form.make_default}
                    onChange={(e) => setForm((f) => ({ ...f, make_default: e.target.checked }))}
                  />
                  <span style={{ fontSize: 13, color: "#111827", fontWeight: 700 }}>
                    Make this default
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                disabled={busy}
                onClick={useLocation}
                style={{
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  padding: "10px 12px",
                  borderRadius: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Use current location
              </button>

              <button
                disabled={busy}
                onClick={addAddress}
                style={{
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  padding: "10px 12px",
                  borderRadius: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {busy ? "Saving..." : "Save address"}
              </button>
            </div>

            {geo ? (
              <div style={{ color: "#6b7280", fontSize: 12 }}>
                Selected geo: {geo.lat}, {geo.lng} (±{Math.round(geo.accuracy || 0)}m)
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
