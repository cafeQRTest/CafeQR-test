// pages/app/profile/index.js

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, User, Phone, Save, LogOut, MapPin, ChevronRight } from "lucide-react";
import { getSupabase } from "../../../services/supabase";

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

            try {
                // Use getSession() instead of getUser() — getUser() makes a network call
                // that can hang on Android APK
                const { data: sessionData } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
                ]);
                const user = sessionData?.session?.user || null;
                if (mounted) setSessionUser(user);

                if (user) {
                    const { data: profile } = await Promise.race([
                        supabase
                            .from('customers')
                            .select('name, phone')
                            .eq('user_id', user.id)
                            .maybeSingle(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
                    ]);

                    if (mounted && profile) {
                        if (profile.name) setName(profile.name);
                        if (profile.phone) setPhone(profile.phone.replace(/\D/g, '').slice(0, 10));
                    }
                }
            } catch (e) {
                console.warn("Profile init error:", e);
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

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const user = sessionData?.session?.user;

            if (!user) {
                setMsg("Please log in to save.");
                setSaving(false);
                setTimeout(() => setMsg(""), 1500);
                return;
            }

            const nextName = name.trim();
            const nextPhone = phone.trim();

            const { data: existing } = await supabase
                .from('customers')
                .select('id')
                .eq('user_id', user.id)
                .maybeSingle();

            let error;

            if (existing) {
                const { error: updateErr } = await supabase
                    .from('customers')
                    .update({ name: nextName, phone: nextPhone })
                    .eq('id', existing.id);
                error = updateErr;
            } else {
                const { error: insertErr } = await supabase
                    .from('customers')
                    .insert({
                        user_id: user.id,
                        name: nextName,
                        phone: nextPhone,
                        email: user.email
                    });
                error = insertErr;
            }

            if (error) {
                console.error("Supabase Error:", error);
                setMsg("Error saving.");
            } else {
                setMsg("Saved!");
            }
        } catch (e) {
            console.warn("Save error:", e);
            setMsg("Error saving.");
        }

        setSaving(false);
        setTimeout(() => setMsg(""), 2000);
    };

    const logout = async () => {
        await supabase.auth.signOut().catch(() => { });
        window.location.href = "/app/auth";
    };

    if (loading) {
        return (
            <div className="dp-page">
                <style>{CSS_TEXT}</style>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
                    <div className="dp-spinner" />
                </div>
            </div>
        );
    }

    return (
        <div className="dp-page">
            <style>{CSS_TEXT}</style>

            {/* Header */}
            <header className="dp-header">
                <button className="dp-back-btn" onClick={() => router.push("/app/restaurants")}>
                    <ArrowLeft size={20} />
                </button>
                <h1>Profile</h1>
                <div style={{ width: 36 }} />
            </header>

            <div className="dp-content">
                {/* Avatar */}
                <div className="dp-avatar-section">
                    <div className="dp-avatar-circle">
                        <User size={36} color="#f97316" />
                    </div>
                    <p className="dp-avatar-email">
                        {sessionUser?.email || "Not logged in"}
                    </p>
                </div>

                {/* Form */}
                <div className="dp-card">
                    <h2 className="dp-card-title">Customer Details</h2>

                    <div className="dp-field">
                        <label className="dp-label">
                            <User size={14} />
                            Name <span className="dp-required">*</span>
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name"
                            className="dp-input"
                        />
                    </div>

                    <div className="dp-field">
                        <label className="dp-label">
                            <Phone size={14} />
                            Phone <span className="dp-required">*</span>
                            {phone.length > 0 && !isPhoneValid && (
                                <span className="dp-error-hint">Enter valid 10-digit number</span>
                            )}
                        </label>
                        <input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="10-digit mobile number"
                            type="tel"
                            inputMode="numeric"
                            className="dp-input"
                        />
                    </div>

                    <div className="dp-save-row">
                        <button
                            onClick={save}
                            disabled={saving || !isFormValid}
                            className="dp-save-btn"
                        >
                            <Save size={16} />
                            {saving ? "Saving..." : "Save"}
                        </button>
                        {msg && <span className="dp-msg">{msg}</span>}
                    </div>
                </div>

                {/* Addresses link */}
                <Link href="/app/address" className="dp-link-card">
                    <div className="dp-link-left">
                        <MapPin size={18} color="#f97316" />
                        <span>Manage Addresses</span>
                    </div>
                    <ChevronRight size={18} color="#9ca3af" />
                </Link>

                {/* Logout */}
                {sessionUser && (
                    <button onClick={logout} className="dp-logout-btn">
                        <LogOut size={16} />
                        Sign Out
                    </button>
                )}
            </div>
        </div>
    );
}

const CSS_TEXT = `
    .dp-page {
        min-height: 100vh;
        min-height: 100dvh;
        background: #f5f5f5;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        -webkit-font-smoothing: antialiased;
    }
    .dp-spinner {
        width: 32px; height: 32px;
        border: 3px solid #f3e8d8;
        border-top: 3px solid #f97316;
        border-radius: 50%;
        animation: dp-spin 0.7s linear infinite;
    }
    @keyframes dp-spin { to { transform: rotate(360deg); } }

    .dp-header {
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid #e5e7eb;
        position: sticky;
        top: 0;
        z-index: 10;
    }
    .dp-header h1 {
        font-size: 17px;
        font-weight: 800;
        color: #111827;
        margin: 0;
    }
    .dp-back-btn {
        width: 36px; height: 36px;
        display: flex; align-items: center; justify-content: center;
        background: transparent;
        border: none;
        cursor: pointer;
        color: #374151;
        border-radius: 10px;
    }
    .dp-back-btn:active { background: #f3f4f6; }

    .dp-content {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px 16px 40px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .dp-avatar-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 24px 0 8px;
    }
    .dp-avatar-circle {
        width: 80px; height: 80px;
        border-radius: 50%;
        background: #fff7ed;
        border: 3px solid #fed7aa;
        display: flex; align-items: center; justify-content: center;
        margin-bottom: 12px;
    }
    .dp-avatar-email {
        font-size: 13px;
        color: #6b7280;
        margin: 0;
        font-weight: 500;
    }

    .dp-card {
        background: #fff;
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.04);
        border: 1px solid rgba(0,0,0,0.04);
    }
    .dp-card-title {
        font-size: 16px;
        font-weight: 800;
        color: #1f2937;
        margin: 0 0 16px;
    }

    .dp-field {
        margin-bottom: 14px;
    }
    .dp-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: #6b7280;
        margin-bottom: 6px;
    }
    .dp-required { color: #ef4444; }
    .dp-error-hint {
        color: #ef4444;
        margin-left: 8px;
        font-size: 11px;
    }
    .dp-input {
        width: 100%;
        padding: 12px 14px;
        border-radius: 14px;
        border: 2px solid #e5e7eb;
        font-size: 15px;
        font-weight: 500;
        color: #1f2937;
        outline: none;
        transition: all 0.2s;
        background: #fafafa;
        box-sizing: border-box;
    }
    .dp-input:focus {
        border-color: #f97316;
        box-shadow: 0 0 0 4px rgba(249,115,22,0.08);
        background: #fff;
    }

    .dp-save-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 4px;
    }
    .dp-save-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #f97316;
        color: #fff;
        border: none;
        border-radius: 14px;
        padding: 12px 24px;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(249,115,22,0.3);
        transition: all 0.2s;
    }
    .dp-save-btn:hover { background: #ea580c; }
    .dp-save-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .dp-msg {
        font-size: 13px;
        color: #059669;
        font-weight: 600;
    }

    .dp-link-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #fff;
        border-radius: 16px;
        padding: 16px 18px;
        text-decoration: none;
        color: #1f2937;
        font-weight: 700;
        font-size: 15px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.04);
        border: 1px solid rgba(0,0,0,0.04);
        transition: all 0.2s;
    }
    .dp-link-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .dp-link-left {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .dp-logout-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        background: #fff;
        border: 2px solid #fecaca;
        color: #ef4444;
        font-weight: 700;
        font-size: 14px;
        padding: 14px;
        border-radius: 16px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .dp-logout-btn:hover { background: #fef2f2; }
`;
