// pages/app/restaurants/index.js
// GPS is fetched LIVE on every mount. No caching. Auth-guarded.
import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Search, ArrowRight, User, ShoppingBag, MapPin, Navigation, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { getSupabase } from "../../../services/supabase";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

// Stock images for aesthetic cards (cycling)
const STOCK_IMAGES = [
    "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&q=80",
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
    const supabase = getSupabase();
    const router = useRouter();

    // Auth
    const [authReady, setAuthReady] = useState(false);

    // GPS
    const [gpsState, setGpsState] = useState(GPS_IDLE);
    const [gpsError, setGpsError] = useState("");
    const [userCoords, setUserCoords] = useState(null);

    // Restaurants
    const [allRestaurants, setAllRestaurants] = useState([]);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState("");
    const [showMenu, setShowMenu] = useState(false);

    // ── 1. AUTH GUARD ────────────────────────────────────────────────────────
    useEffect(() => {
        const checkAuth = async () => {
            const { data } = await supabase.auth.getSession();
            if (!data?.session) {
                router.replace("/app/auth");
                return;
            }
            setAuthReady(true);
        };
        checkAuth();
    }, [supabase, router]);

    // ── 2. LIVE GPS FETCH (fires every time the page mounts / is focused) ───
    const fetchGps = useCallback(async () => {
        setGpsState(GPS_LOADING);
        setGpsError("");
        setUserCoords(null);

        try {
            let lat, lng;

            if (Capacitor.isNativePlatform()) {
                await Geolocation.requestPermissions();
                const pos = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: 12000,
                });
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
            } else {
                if (!navigator.geolocation) {
                    setGpsError("Geolocation is not supported by your browser.");
                    setGpsState(GPS_ERROR);
                    return;
                }
                const pos = await new Promise((resolve, reject) =>
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 12000,
                        maximumAge: 0,
                    })
                );
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
            }

            setUserCoords({ lat, lng });
            setGpsState(GPS_SUCCESS);
        } catch (e) {
            console.error("GPS error:", e);
            setGpsError("Location permission denied or GPS is off. Please enable GPS and try again.");
            setGpsState(GPS_ERROR);
        }
    }, []);

    // Fire GPS as soon as auth is confirmed
    useEffect(() => {
        if (authReady) fetchGps();
    }, [authReady, fetchGps]);

    // ── 3. LOAD RESTAURANTS once GPS is available ────────────────────────────
    useEffect(() => {
        if (!userCoords) return;

        const loadRestaurants = async () => {
            setLoading(true);
            const { data, error } = await supabase
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
                .order("name", { ascending: true });

            if (!error && data) setAllRestaurants(data);
            else setAllRestaurants([]);
            setLoading(false);
        };

        loadRestaurants();
    }, [userCoords, supabase]);

    // ── 4. FILTER by distance + search term ─────────────────────────────────
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
        });
    }, [allRestaurants, userCoords]);

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        return nearbyRestaurants.filter(r =>
            (r?.name || "").toLowerCase().includes(term)
        );
    }, [nearbyRestaurants, q]);

    // ── 5. HANDLE SIGN OUT ───────────────────────────────────────────────────
    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.replace("/app/auth");
    };

    // ── 6. RENDER ─────────────────────────────────────────────────────────────

    // Full-screen GPS overlay — shown while locating or on error
    if (!authReady || gpsState === GPS_IDLE || gpsState === GPS_LOADING) {
        return (
            <div className="gps-overlay">
                <div className="gps-card">
                    <div className={`gps-icon-ring ${gpsState === GPS_LOADING ? "pulsing" : ""}`}>
                        <Navigation className="gps-icon" />
                    </div>
                    <h2 className="gps-title">Locating you…</h2>
                    <p className="gps-subtitle">Finding restaurants near your current location</p>
                    <Loader2 className="gps-spinner" />
                </div>
                {renderStyles()}
            </div>
        );
    }

    if (gpsState === GPS_ERROR) {
        return (
            <div className="gps-overlay">
                <div className="gps-card">
                    <div className="gps-icon-ring error">
                        <AlertTriangle className="gps-icon error-icon" />
                    </div>
                    <h2 className="gps-title">Location Required</h2>
                    <p className="gps-subtitle">{gpsError}</p>
                    <button className="gps-retry-btn" onClick={fetchGps}>
                        <RefreshCw className="w-5 h-5" />
                        <span>Try Again</span>
                    </button>
                </div>
                {renderStyles()}
            </div>
        );
    }

    // ── Main restaurant listing ──────────────────────────────────────────────
    return (
        <div className="delivery-restaurants-page">
            <header className="delivery-restaurants-header">
                <div className="header-inner">
                    <div className="header-top">
                        <div className="header-address">
                            <p className="address-label">YOUR LOCATION</p>
                            <div className="address-link">
                                <MapPin className="w-3 h-3 text-orange-500 flex-shrink-0" />
                                <span className="address-text">
                                    {userCoords
                                        ? `${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)}`
                                        : "Locating..."}
                                </span>
                                <button
                                    onClick={fetchGps}
                                    className="refresh-loc-btn"
                                    title="Refresh location"
                                >
                                    <RefreshCw className="w-3 h-3" />
                                </button>
                            </div>
                        </div>

                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                className="header-avatar"
                            >
                                <span>👤</span>
                            </button>

                            {showMenu && (
                                <>
                                    <div
                                        style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                                        onClick={() => setShowMenu(false)}
                                    />
                                    <div className="profile-menu">
                                        <button
                                            onClick={() => { setShowMenu(false); router.push('/app/orders/history'); }}
                                            className="profile-menu-item"
                                        >
                                            <ShoppingBag size={16} />
                                            My Orders
                                        </button>
                                        <button
                                            onClick={() => { setShowMenu(false); router.push('/app/profile'); }}
                                            className="profile-menu-item"
                                        >
                                            <User size={16} />
                                            Profile
                                        </button>
                                        <div className="profile-menu-divider" />
                                        <button
                                            onClick={() => { setShowMenu(false); handleSignOut(); }}
                                            className="profile-menu-item sign-out"
                                        >
                                            Sign Out
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="header-search">
                        <Search className="search-icon" />
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search restaurants, cuisines..."
                            className="search-input"
                        />
                    </div>
                </div>
            </header>

            <div className="delivery-restaurants-content">
                {loading ? (
                    <div className="p-12 text-center text-gray-500 font-medium">Finding nearby restaurants...</div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <ShoppingBag className="empty-icon" />
                        <p>No restaurants found near you.</p>
                        <p style={{ fontSize: 13, marginTop: 6 }}>Try refreshing your location.</p>
                    </div>
                ) : (
                    <div className="restaurants-grid">
                        {filtered.map((r, i) => {
                            const brand = r?.restaurant_profiles?.brand_color || "#f97316";
                            const imgUrl = STOCK_IMAGES[i % STOCK_IMAGES.length];
                            return (
                                <Link key={r.id} href={`/app/restaurant/${r.id}`} className="restaurant-card">
                                    <div className="card-inner">
                                        <div className="card-image">
                                            <img src={imgUrl} alt={r.name} loading="lazy" />
                                        </div>
                                        <div className="card-content">
                                            <div className="card-info">
                                                <h3>{r.name}</h3>
                                                <p>Coffee • Snacks • Beverages</p>
                                            </div>
                                            <div className="card-footer">
                                                <div className="card-rating">
                                                    <span>4.5 ★</span>
                                                    <span>20-30 mins</span>
                                                </div>
                                                <span className="card-order-btn" style={{ backgroundColor: brand }}>
                                                    Order <ArrowRight className="w-3 h-3" />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>

            {renderStyles()}
        </div>
    );
}

function renderStyles() {
    return (
        <style jsx>{`
            /* ── GPS Overlay ─────────────────────────────────────────── */
            .gps-overlay {
                min-height: 100vh;
                background: #f9fafb;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
                font-family: system-ui, -apple-system, sans-serif;
            }
            .gps-card {
                background: #fff;
                border-radius: 24px;
                padding: 40px 28px;
                max-width: 360px;
                width: 100%;
                text-align: center;
                box-shadow: 0 4px 24px rgba(0,0,0,0.08);
                border: 1px solid rgba(0,0,0,0.04);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
            }
            .gps-icon-ring {
                width: 80px;
                height: 80px;
                background: #fff7ed;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid #fed7aa;
                margin-bottom: 8px;
            }
            .gps-icon-ring.pulsing {
                animation: gps-pulse 1.5s infinite ease-in-out;
            }
            .gps-icon-ring.error {
                background: #fef2f2;
                border-color: #fecaca;
            }
            @keyframes gps-pulse {
                0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249,115,22,0.3); }
                50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(249,115,22,0); }
            }
            .gps-icon {
                width: 36px;
                height: 36px;
                color: #f97316;
                fill: rgba(249,115,22,0.15);
            }
            .error-icon {
                color: #ef4444;
                fill: rgba(239,68,68,0.1);
            }
            .gps-title {
                font-size: 20px;
                font-weight: 800;
                color: #111827;
                margin: 0;
            }
            .gps-subtitle {
                font-size: 14px;
                color: #6b7280;
                margin: 0;
                line-height: 1.5;
            }
            .gps-spinner {
                width: 28px;
                height: 28px;
                color: #f97316;
                animation: spin 1s linear infinite;
                margin-top: 8px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
            .gps-retry-btn {
                display: flex;
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
                transition: background 0.2s;
            }
            .gps-retry-btn:hover { background: #ea580c; }

            /* ── Main Page ───────────────────────────────────────────── */
            .delivery-restaurants-page {
                min-height: 100vh;
                width: 100%;
                background: #f8fafc;
                padding-bottom: 120px;
                font-family: system-ui, -apple-system, sans-serif;
            }
            .delivery-restaurants-header {
                background: #fff;
                border-bottom: 1px solid #e5e7eb;
                position: sticky;
                top: 0;
                z-index: 20;
                padding: 12px 16px;
            }
            .header-inner { max-width: 1280px; margin: 0 auto; }
            .header-top {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 12px;
            }
            .header-address { flex: 1; overflow: hidden; }
            .address-label {
                font-size: 10px;
                font-weight: 700;
                color: #9ca3af;
                text-transform: uppercase;
                margin: 0 0 2px;
            }
            .address-link {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                color: #111827;
            }
            .address-text {
                font-weight: 700;
                font-size: 13px;
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .refresh-loc-btn {
                background: transparent;
                border: none;
                color: #9ca3af;
                cursor: pointer;
                padding: 2px;
                display: flex;
                align-items: center;
            }
            .refresh-loc-btn:hover { color: #f97316; }
            .header-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: #fff7ed;
                border: 1px solid #f97316;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                cursor: pointer;
            }
            .profile-menu {
                position: absolute;
                top: 120%;
                right: 0;
                background: white;
                border-radius: 16px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                padding: 8px;
                min-width: 180px;
                z-index: 50;
                border: 1px solid #f3f4f6;
            }
            .profile-menu-item {
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
                font-weight: 500;
            }
            .profile-menu-item:hover { background: #f9fafb; }
            .profile-menu-item.sign-out { color: #ef4444; }
            .profile-menu-divider {
                height: 1px;
                background: #f3f4f6;
                margin: 4px 8px;
            }
            .header-search { position: relative; }
            .search-icon {
                position: absolute;
                left: 12px;
                top: 50%;
                transform: translateY(-50%);
                width: 20px;
                height: 20px;
                color: #9ca3af;
            }
            .search-input {
                width: 100%;
                padding: 10px 12px 10px 40px;
                border-radius: 12px;
                background: #f3f4f6;
                border: 1px solid transparent;
                font-size: 14px;
                outline: none;
            }
            .delivery-restaurants-content {
                max-width: 1280px;
                margin: 0 auto;
                padding: 24px;
            }
            .empty-state {
                text-align: center;
                padding: 80px 0;
                color: #6b7280;
            }
            .empty-icon {
                width: 48px;
                height: 48px;
                margin: 0 auto 12px;
                color: #d1d5db;
            }
            .restaurants-grid { display: grid; gap: 16px; }
            .restaurant-card {
                display: block;
                background: #fff;
                border-radius: 16px;
                padding: 12px;
                border: 1px solid #e5e7eb;
                text-decoration: none;
                color: inherit;
                transition: box-shadow 0.2s;
            }
            .restaurant-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
            .card-inner { display: flex; gap: 16px; }
            .card-image {
                width: 80px;
                height: 80px;
                flex-shrink: 0;
                border-radius: 12px;
                overflow: hidden;
            }
            .card-image img { width: 100%; height: 100%; object-fit: cover; }
            .card-content {
                flex: 1;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
            }
            .card-info h3 { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
            .card-info p { font-size: 12px; color: #6b7280; margin: 0; }
            .card-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-top: 8px;
            }
            .card-rating {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 10px;
                font-weight: 700;
                color: #15803d;
            }
            .card-order-btn {
                color: #fff;
                font-size: 11px;
                font-weight: 700;
                padding: 6px 12px;
                border-radius: 999px;
                display: flex;
                align-items: center;
                gap: 4px;
            }
        `}</style>
    );
}
