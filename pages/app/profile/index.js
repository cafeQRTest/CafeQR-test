// pages/app/profile/index.js

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getSupabase } from "../../../services/supabase";
import Loading from "./loading";

export default function ProfilePage() {
    const supabase = getSupabase();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [sessionUser, setSessionUser] = useState(null);

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");

    const isNameValid = name.trim().length > 0;
    const isPhoneValid = phone.length === 10;
    const isFormValid = isNameValid && isPhoneValid;

    const [msg, setMsg] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let mounted = true;
        const init = async () => {
            setLoading(true);

            const { data } = await supabase.auth.getUser();
            const user = data?.user || null;
            if (mounted) setSessionUser(user);

            if (user) {
                // Fetch profile from 'customers' table using user_id
                const { data: profile, error } = await supabase
                    .from('customers')
                    .select('name, phone')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (error) {
                    console.error("Error fetching profile:", error);
                }

                if (mounted && profile) {
                    if (profile.name) setName(profile.name);
                    if (profile.phone) setPhone(profile.phone.replace(/\D/g, '').slice(0, 10));
                }
            }

            if (mounted) setLoading(false);
        };

        init();
        return () => { mounted = false; };
    }, []);

    const save = async () => {
        if (!isFormValid || saving) return;
        setMsg("");
        setSaving(true);

        // Get fresh session
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            setMsg("Please log in to save.");
            setSaving(false);
            setTimeout(() => setMsg(""), 1500);
            return;
        }

        const nextName = name.trim();
        const nextPhone = phone.trim();

        // Use 'customers' table, matching on user_id
        const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

        let error;

        if (existing) {
            // Update
            const { error: updateErr } = await supabase
                .from('customers')
                .update({ name: nextName, phone: nextPhone })
                .eq('id', existing.id);
            error = updateErr;
        } else {
            // Insert
            const { error: insertErr } = await supabase
                .from('customers')
                .insert({
                    user_id: user.id,
                    name: nextName,
                    phone: nextPhone,
                    email: user.email // optional but good practice
                });
            error = insertErr;
        }

        if (error) {
            console.error("Supabase Error Details:", error);
            setMsg("Error saving.");
        } else {
            setMsg("Saved.");
        }

        setSaving(false);
        setTimeout(() => setMsg(""), 1500);
    };

    const logout = async () => {
        setLoading(true);
        await supabase.auth.signOut().catch(() => { });
        window.location.href = "/app";
    };

    if (loading) return <Loading />;

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

                    <label style={{ fontSize: 12, color: "#6b7280" }}>Name <span style={{ color: "red" }}>*</span></label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        style={{
                            width: "100%",
                            padding: 12,
                            borderRadius: 12,
                            border: !isNameValid && name.length > 0 ? "1px solid red" : "1px solid #e5e7eb",
                            marginTop: 6,
                            outline: "none",
                        }}
                    />

                    <div style={{ height: 10 }} />

                    <label style={{ fontSize: 12, color: "#6b7280" }}>
                        Phone <span style={{ color: "red" }}>*</span>
                        {phone.length > 0 && !isPhoneValid && (
                            <span style={{ color: "red", marginLeft: 8 }}>Enter valid phone number</span>
                        )}
                    </label>
                    <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="10-digit mobile number"
                        style={{
                            width: "100%",
                            padding: 12,
                            borderRadius: 12,
                            border: !isPhoneValid && phone.length > 0 ? "1px solid red" : "1px solid #e5e7eb",
                            marginTop: 6,
                            outline: "none",
                        }}
                    />

                    <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
                        <button
                            onClick={save}
                            disabled={saving || !isFormValid}
                            style={{
                                background: (saving || !isFormValid) ? "#cbd5e1" : "#f59e0b",
                                border: "none",
                                color: "#fff",
                                borderRadius: 12,
                                padding: "12px 14px",
                                fontWeight: 900,
                                cursor: (saving || !isFormValid) ? "not-allowed" : "pointer",
                                opacity: isFormValid ? 1 : 0.5,
                            }}
                        >
                            {saving ? "Saving..." : "Save"}
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
        </div>
    );
}



