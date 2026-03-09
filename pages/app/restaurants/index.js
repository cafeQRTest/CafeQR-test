// pages/app/restaurants/index.js
// GPS is fetched LIVE on every mount. No caching. Auth-guarded.
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Search, User, ShoppingBag, MapPin, Navigation, RefreshCw, AlertTriangle, Clock, Star, ChevronDown, LogOut } from "lucide-react";
import { getCustomerSupabase } from "../../../services/supabase";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

// Stock images for aesthetic cards (cycling)
const STOCK_IMAGES = [
    "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=800&q=80",
];

// haversine distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GPS states
const GPS_IDLE = "idle";
const GPS_LOADING = "loading";
const GPS_SUCCESS = "success";
const GPS_ERROR = "error";

export default function RestaurantListing() {
    const supabase = getCustomerSupabase();
    const router = useRouter();

    // Auth
    const [authReady, setAuthReady] = useState(false);

    // GPS
    const [gpsState, setGpsState] = useState(GPS_IDLE);
    const [gpsError, setGpsError] = useState("");
    const [userCoords, setUserCoords] = useState(null);
    const [addressText, setAddressText] = useState("");

    // Restaurants
    const [allRestaurants, setAllRestaurants] = useState([]);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState("");
    const [showMenu, setShowMenu] = useState(false);
    const searchRef = useRef(null);

    // ── 1. AUTH GUARD ────────────────────────────────────────────────────────
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const { data } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Auth timeout")), 8000)),
                ]);
                if (!data?.session) {
                    router.replace("/app/auth");
                    return;
                }
                setAuthReady(true);
            } catch {
                // On timeout, still try to proceed — maybe session exists
                setAuthReady(true);
            }
        };
        checkAuth();
    }, [supabase, router]);

    // ── 2. LIVE GPS FETCH ────────────────────────────────────────────────────
    const fetchGps = useCallback(async () => {
        setGpsState(GPS_LOADING);
        setGpsError("");

        try {
            let lat, lng;

            if (Capacitor.isNativePlatform()) {
                try {
                    await Geolocation.requestPermissions();
                } catch { /* permission may already be granted */ }
                const pos = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: 15000,
                });
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
            } else {
                if (!navigator.geolocation) {
                    setGpsError("Geolocation is not supported by your browser.");
                    setGpsState(GPS_ERROR);
                    return;
                }
                const pos = await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => reject(new Error("GPS timed out")), 15000);
                    navigator.geolocation.getCurrentPosition(
                        (p) => { clearTimeout(timeoutId); resolve(p); },
                        (e) => { clearTimeout(timeoutId); reject(e); },
                        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
                    );
                });
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
            }

            setUserCoords({ lat, lng });
            setGpsState(GPS_SUCCESS);

            // Reverse geocode (best-effort, non-blocking)
            try {
                const controller = new AbortController();
                const geoTimeout = setTimeout(() => controller.abort(), 5000);
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`,
                    { headers: { "Accept-Language": "en" }, signal: controller.signal }
                );
                clearTimeout(geoTimeout);
                const geo = await res.json();
                const addr = geo?.address;
                if (addr) {
                    const parts = [
                        addr.suburb || addr.neighbourhood || addr.hamlet || addr.village || "",
                        addr.city || addr.town || addr.county || "",
                        addr.state || "",
                    ].filter(Boolean);
                    setAddressText(parts.slice(0, 2).join(", ") || geo.display_name?.split(",").slice(0, 2).join(",") || "");
                }
            } catch {
                setAddressText(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            }
        } catch (e) {
            console.error("GPS error:", e);
            setGpsError(
                e?.code === 1
                    ? "Location permission denied. Please enable GPS in settings and try again."
                    : "Could not get your location. Please enable GPS and try again."
            );
            setGpsState(GPS_ERROR);
        }
    }, []);

    // Fire GPS when auth is ready
    useEffect(() => {
        if (authReady) fetchGps();
    }, [authReady, fetchGps]);

    // ── 3. LOAD RESTAURANTS ─────────────────────────────────────────────────
    useEffect(() => {
        if (!userCoords) return;

        const loadRestaurants = async () => {
            setLoading(true);
            try {
                const { data, error } = await Promise.race([
                    supabase
                        .from("restaurants")
                        .select(`
                            id,
                            name,
                            restaurant_profiles (
                                brand_color,
                                latitude,
                                longitude,
                                delivery_radius_km,
                                delivery_app_enabled
                            )
                        `)
                        .order("name", { ascending: true }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Restaurant fetch timeout")), 12000)),
                ]);

                if (!error && data) setAllRestaurants(data);
                else setAllRestaurants([]);
            } catch (e) {
                console.warn("Restaurant load error:", e);
                setAllRestaurants([]);
            }
            setLoading(false);
        };

        loadRestaurants();
    }, [userCoords, supabase]);

    // ── 4. FILTER ────────────────────────────────────────────────────────────
    const nearbyRestaurants = useMemo(() => {
        if (!allRestaurants.length || !userCoords) return [];
        return allRestaurants.filter(r => {
            const p = r.restaurant_profiles;
            if (!p?.latitude || !p?.longitude || !p?.delivery_app_enabled) return false;
            const radius = parseFloat(p.delivery_radius_km) || 10;
            const dist = haversineKm(
                userCoords.lat, userCoords.lng,
                parseFloat(p.latitude), parseFloat(p.longitude)
            );
            return dist <= radius;
        }).map(r => {
            const p = r.restaurant_profiles;
            return {
                ...r,
                distance: haversineKm(
                    userCoords.lat, userCoords.lng,
                    parseFloat(p.latitude), parseFloat(p.longitude)
                ),
            };
        });
    }, [allRestaurants, userCoords]);

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        return nearbyRestaurants.filter(r =>
            (r?.name || "").toLowerCase().includes(term)
        );
    }, [nearbyRestaurants, q]);

    // ── 5. SIGN OUT ──────────────────────────────────────────────────────────
    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.replace("/app/auth");
    };

    // ── 6. RENDER ────────────────────────────────────────────────────────────

    // GPS overlay — locating or error
    if (!authReady || gpsState === GPS_IDLE || gpsState === GPS_LOADING) {
        return (
            <div className="dr-gps-overlay">
                <div className="dr-gps-card">
                    <div className="dr-gps-icon-ring dr-pulsing">
                        <Navigation size={32} color="#f97316" />
                    </div>
                    <h2 className="dr-gps-title">Locating you…</h2>
                    <p className="dr-gps-subtitle">Finding restaurants near your current location</p>
                    <div className="dr-spinner" />
                </div>
                <style>{CSS_TEXT}</style>
            </div>
        );
    }

    if (gpsState === GPS_ERROR) {
        return (
            <div className="dr-gps-overlay">
                <div className="dr-gps-card">
                    <div className="dr-gps-icon-ring dr-error">
                        <AlertTriangle size={32} color="#ef4444" />
                    </div>
                    <h2 className="dr-gps-title">Location Required</h2>
                    <p className="dr-gps-subtitle">{gpsError}</p>
                    <button className="dr-retry-btn" onClick={fetchGps}>
                        <RefreshCw size={18} />
                        <span>Try Again</span>
                    </button>
                </div>
                <style>{CSS_TEXT}</style>
            </div>
        );
    }

    // ── Main listing ─────────────────────────────────────────────────────────
    return (
        <div className="dr-page">
            <style>{CSS_TEXT}</style>

            {/* ─── Sticky Header ─── */}
            <header className="dr-header">
                <div className="dr-header-inner">
                    <div className="dr-header-top">
                        <div className="dr-header-loc" onClick={fetchGps}>
                            <div className="dr-loc-icon-wrap">
                                <MapPin size={18} color="#f97316" fill="rgba(249,115,22,0.15)" />
                            </div>
                            <div className="dr-loc-text">
                                <span className="dr-loc-label">DELIVER TO</span>
                                <div className="dr-loc-address">
                                    <span>{addressText || "Detecting location…"}</span>
                                    <ChevronDown size={14} color="#9ca3af" />
                                </div>
                            </div>
                        </div>

                        <div style={{ position: 'relative' }}>
                            <button onClick={() => setShowMenu(!showMenu)} className="dr-avatar-btn">
                                <User size={20} color="#f97316" />
                            </button>

                            {showMenu && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowMenu(false)} />
                                    <div className="dr-profile-menu">
                                        <button onClick={() => { setShowMenu(false); router.push('/app/orders/history'); }} className="dr-menu-item">
                                            <ShoppingBag size={16} /> My Orders
                                        </button>
                                        <button onClick={() => { setShowMenu(false); router.push('/app/profile'); }} className="dr-menu-item">
                                            <User size={16} /> Profile
                                        </button>
                                        <div className="dr-menu-divider" />
                                        <button onClick={() => { setShowMenu(false); handleSignOut(); }} className="dr-menu-item dr-menu-signout">
                                            <LogOut size={16} /> Sign Out
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Search */}
                    <div className="dr-search-wrap" onClick={() => searchRef.current?.focus()}>
                        <Search size={18} color="#9ca3af" />
                        <input
                            ref={searchRef}
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search for restaurants..."
                            className="dr-search-input"
                        />
                    </div>
                </div>
            </header>


            {/* ─── Restaurant list ─── */}
            <div className="dr-content">
                <div className="dr-section-header">
                    <h2>{filtered.length} restaurant{filtered.length !== 1 ? "s" : ""} near you</h2>
                </div>

                {loading ? (
                    <div className="dr-loading-state">
                        <div className="dr-spinner" />
                        <p>Finding nearby restaurants…</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="dr-empty-state">
                        <div className="dr-empty-icon-wrap">
                            <MapPin size={40} color="#d1d5db" />
                        </div>
                        <h3>No restaurants found nearby</h3>
                        <p>Try refreshing your location or expanding your search area.</p>
                        <button className="dr-retry-btn" onClick={fetchGps} style={{ marginTop: 16 }}>
                            <RefreshCw size={16} />
                            <span>Refresh Location</span>
                        </button>
                    </div>
                ) : (
                    <div className="dr-grid">
                        {filtered.map((r, i) => {
                            const brand = r?.restaurant_profiles?.brand_color || "#f97316";
                            const imgUrl = STOCK_IMAGES[i % STOCK_IMAGES.length];
                            const distKm = r.distance;
                            const deliveryMins = Math.round(10 + distKm * 5);
                            return (
                                <Link key={r.id} href={`/app/restaurant/${r.id}`} className="dr-card">
                                    <div className="dr-card-img-wrap">
                                        <img src={imgUrl} alt={r.name} loading="lazy" />
                                        <div className="dr-card-img-overlay" />
                                        <div className="dr-card-delivery-badge">
                                            <Clock size={12} />
                                            <span>{deliveryMins}-{deliveryMins + 10} min</span>
                                        </div>
                                    </div>
                                    <div className="dr-card-body">
                                        <div className="dr-card-row">
                                            <h3 className="dr-card-name">{r.name}</h3>
                                            <div className="dr-card-rating" style={{ backgroundColor: brand }}>
                                                <Star size={10} fill="#fff" color="#fff" />
                                                <span>4.5</span>
                                            </div>
                                        </div>
                                        <p className="dr-card-cuisine">Coffee • Snacks • Beverages</p>
                                        <div className="dr-card-meta">
                                            <span className="dr-card-distance">
                                                <MapPin size={11} />
                                                {distKm < 1 ? `${Math.round(distKm * 1000)}m` : `${distKm.toFixed(1)} km`}
                                            </span>
                                            <span className="dr-card-dot">•</span>
                                        </div>
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

// ── CSS (non-scoped, all class names use unique dr- prefix) ──────────────────
const CSS_TEXT = `
    /* ─── Reset & Base ────────────────────────────────────── */
    .dr-page {
        min-height: 100vh;
        min-height: 100dvh;
        width: 100%;
        background: #f5f5f5;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        padding-bottom: 40px;
        -webkit-font-smoothing: antialiased;
    }

    /* ─── GPS Overlay ─────────────────────────────────────── */
    .dr-gps-overlay {
        min-height: 100vh;
        min-height: 100dvh;
        background: linear-gradient(135deg, #fff7ed 0%, #f5f5f5 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .dr-gps-card {
        background: #fff;
        border-radius: 28px;
        padding: 48px 32px;
        max-width: 360px;
        width: 100%;
        text-align: center;
        box-shadow: 0 8px 40px rgba(0,0,0,0.06);
        border: 1px solid rgba(0,0,0,0.03);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
    }
    .dr-gps-icon-ring {
        width: 88px;
        height: 88px;
        background: #fff7ed;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid #fed7aa;
        margin-bottom: 8px;
    }
    .dr-pulsing {
        animation: dr-pulse 1.6s infinite ease-in-out;
    }
    .dr-error {
        background: #fef2f2;
        border-color: #fecaca;
    }
    @keyframes dr-pulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249,115,22,0.25); }
        50% { transform: scale(1.06); box-shadow: 0 0 0 14px rgba(249,115,22,0); }
    }
    .dr-gps-title {
        font-size: 22px;
        font-weight: 800;
        color: #111827;
        margin: 0;
        letter-spacing: -0.3px;
    }
    .dr-gps-subtitle {
        font-size: 14px;
        color: #6b7280;
        margin: 0;
        line-height: 1.6;
        max-width: 260px;
    }
    .dr-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #f3e8d8;
        border-top: 3px solid #f97316;
        border-radius: 50%;
        animation: dr-spin 0.7s linear infinite;
        margin-top: 8px;
    }
    @keyframes dr-spin { to { transform: rotate(360deg); } }
    .dr-retry-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #f97316;
        color: #fff;
        font-weight: 700;
        font-size: 15px;
        padding: 14px 28px;
        border: none;
        border-radius: 14px;
        cursor: pointer;
        margin-top: 8px;
        box-shadow: 0 4px 14px rgba(249,115,22,0.3);
        transition: all 0.2s;
    }
    .dr-retry-btn:hover { background: #ea580c; transform: translateY(-1px); }
    .dr-retry-btn:active { transform: scale(0.98); }

    /* ─── Header ──────────────────────────────────────────── */
    .dr-header {
        background: #fff;
        position: sticky;
        top: 0;
        z-index: 30;
        box-shadow: 0 1px 8px rgba(0,0,0,0.04);
    }
    .dr-header-inner {
        max-width: 600px;
        margin: 0 auto;
        padding: 12px 16px 14px;
    }
    .dr-header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
    }
    .dr-header-loc {
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        flex: 1;
        min-width: 0;
    }
    .dr-loc-icon-wrap {
        width: 40px;
        height: 40px;
        background: #fff7ed;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    .dr-loc-text {
        min-width: 0;
        flex: 1;
    }
    .dr-loc-label {
        display: block;
        font-size: 10px;
        font-weight: 700;
        color: #f97316;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        margin-bottom: 2px;
    }
    .dr-loc-address {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 14px;
        font-weight: 700;
        color: #1f2937;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .dr-loc-address span {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Avatar */
    .dr-avatar-btn {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: #fff7ed;
        border: 2px solid #fed7aa;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
    }
    .dr-avatar-btn:hover {
        border-color: #f97316;
        box-shadow: 0 2px 12px rgba(249,115,22,0.2);
    }

    /* Profile menu */
    .dr-profile-menu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.12);
        padding: 8px;
        min-width: 200px;
        z-index: 50;
        border: 1px solid #f3f4f6;
        animation: dr-menu-in 0.15s ease-out;
    }
    @keyframes dr-menu-in {
        from { opacity: 0; transform: translateY(-4px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .dr-menu-item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 12px 16px;
        border: none;
        background: transparent;
        border-radius: 12px;
        cursor: pointer;
        text-align: left;
        color: #374151;
        font-size: 14px;
        font-weight: 600;
        transition: background 0.15s;
    }
    .dr-menu-item:hover { background: #f9fafb; }
    .dr-menu-signout { color: #ef4444; }
    .dr-menu-divider {
        height: 1px;
        background: #f3f4f6;
        margin: 4px 8px;
    }

    /* Search */
    .dr-search-wrap {
        display: flex;
        align-items: center;
        gap: 10px;
        background: #f3f4f6;
        border-radius: 14px;
        padding: 0 14px;
        border: 2px solid transparent;
        transition: all 0.2s;
        cursor: text;
    }
    .dr-search-wrap:focus-within {
        background: #fff;
        border-color: #f97316;
        box-shadow: 0 0 0 4px rgba(249,115,22,0.08);
    }
    .dr-search-input {
        flex: 1;
        padding: 12px 0;
        border: none;
        background: transparent;
        font-size: 14px;
        font-weight: 500;
        color: #1f2937;
        outline: none;
        min-width: 0;
    }
    .dr-search-input::placeholder { color: #9ca3af; font-weight: 400; }

    /* ─── Promo Banner ────────────────────────────────────── */
    .dr-promo-banner {
        max-width: 600px;
        margin: 16px auto 0;
        padding: 0 16px;
    }
    .dr-promo-inner {
        background: linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%);
        border-radius: 20px;
        padding: 20px 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        overflow: hidden;
        position: relative;
    }
    .dr-promo-inner::before {
        content: '';
        position: absolute;
        top: -40px;
        right: -20px;
        width: 120px;
        height: 120px;
        background: rgba(255,255,255,0.08);
        border-radius: 50%;
    }
    .dr-promo-text {
        flex: 1;
        color: #fff;
    }
    .dr-promo-tag {
        display: inline-block;
        background: rgba(255,255,255,0.2);
        backdrop-filter: blur(4px);
        color: #fff;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 1px;
        padding: 3px 10px;
        border-radius: 6px;
        margin-bottom: 8px;
    }
    .dr-promo-text h3 {
        margin: 0 0 4px;
        font-size: 17px;
        font-weight: 800;
        letter-spacing: -0.3px;
    }
    .dr-promo-text p {
        margin: 0;
        font-size: 12px;
        opacity: 0.9;
        font-weight: 500;
    }
    .dr-promo-emoji {
        font-size: 40px;
        flex-shrink: 0;
        position: relative;
        z-index: 1;
    }

    /* ─── Content ─────────────────────────────────────────── */
    .dr-content {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px 16px;
    }
    .dr-section-header {
        margin-bottom: 16px;
    }
    .dr-section-header h2 {
        font-size: 18px;
        font-weight: 800;
        color: #1f2937;
        margin: 0;
        letter-spacing: -0.3px;
    }

    /* Loading */
    .dr-loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 60px 0;
        color: #6b7280;
        font-weight: 600;
        font-size: 14px;
    }
    .dr-loading-state p { margin-top: 16px; }

    /* Empty */
    .dr-empty-state {
        text-align: center;
        padding: 60px 20px;
    }
    .dr-empty-icon-wrap {
        width: 80px;
        height: 80px;
        background: #f3f4f6;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
    }
    .dr-empty-state h3 {
        font-size: 18px;
        font-weight: 800;
        color: #374151;
        margin: 0 0 8px;
    }
    .dr-empty-state p {
        font-size: 14px;
        color: #6b7280;
        margin: 0;
        line-height: 1.5;
    }

    /* ─── Restaurant Cards ────────────────────────────────── */
    .dr-grid {
        display: grid;
        gap: 16px;
    }
    .dr-card {
        display: block;
        background: #fff;
        border-radius: 20px;
        overflow: hidden;
        text-decoration: none;
        color: inherit;
        box-shadow: 0 2px 12px rgba(0,0,0,0.04);
        border: 1px solid rgba(0,0,0,0.04);
        transition: all 0.25s ease;
    }
    .dr-card:hover {
        box-shadow: 0 8px 30px rgba(0,0,0,0.08);
        transform: translateY(-2px);
    }
    .dr-card:active {
        transform: scale(0.985);
    }

    /* Card image */
    .dr-card-img-wrap {
        position: relative;
        width: 100%;
        height: 180px;
        overflow: hidden;
    }
    .dr-card-img-wrap img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.4s ease;
    }
    .dr-card:hover .dr-card-img-wrap img {
        transform: scale(1.04);
    }
    .dr-card-img-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(
            180deg,
            transparent 40%,
            rgba(0,0,0,0.05) 70%,
            rgba(0,0,0,0.15) 100%
        );
        pointer-events: none;
    }
    .dr-card-delivery-badge {
        position: absolute;
        bottom: 10px;
        left: 10px;
        background: rgba(0,0,0,0.7);
        backdrop-filter: blur(6px);
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        padding: 5px 10px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 5px;
    }

    /* Card body */
    .dr-card-body {
        padding: 14px 16px 16px;
    }
    .dr-card-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
    }
    .dr-card-name {
        font-size: 17px;
        font-weight: 800;
        color: #1f2937;
        margin: 0;
        letter-spacing: -0.3px;
        line-height: 1.3;
    }
    .dr-card-rating {
        display: flex;
        align-items: center;
        gap: 3px;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        padding: 3px 8px;
        border-radius: 8px;
        flex-shrink: 0;
        margin-top: 2px;
    }
    .dr-card-cuisine {
        font-size: 13px;
        color: #6b7280;
        margin: 4px 0 0;
        font-weight: 500;
    }
    .dr-card-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 10px;
        font-size: 12px;
        color: #9ca3af;
        font-weight: 600;
    }
    .dr-card-distance {
        display: flex;
        align-items: center;
        gap: 3px;
    }
    .dr-card-dot {
        color: #d1d5db;
    }
    .dr-card-fee {
        color: #059669;
        font-weight: 700;
    }

    /* ─── Responsive ──────────────────────────────────────── */
    @media (min-width: 480px) {
        .dr-card-img-wrap { height: 200px; }
    }
    @media (max-width: 360px) {
        .dr-gps-card { padding: 36px 20px; }
        .dr-gps-icon-ring { width: 72px; height: 72px; }
        .dr-gps-title { font-size: 19px; }
        .dr-card-img-wrap { height: 160px; }
        .dr-promo-inner { padding: 16px; }
        .dr-promo-text h3 { font-size: 15px; }
    }
`;
