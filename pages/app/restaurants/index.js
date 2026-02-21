import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Search, ArrowRight, User, ShoppingBag } from "lucide-react";
import { getSupabase } from "../../../services/supabase";
import { getOrCreateCustomer } from "../../../lib/customer/getOrCreateCustomer";

// Stock images for aesthetic cards (cycling)
const STOCK_IMAGES = [
    "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&q=80",
];

export default function RestaurantListing() {
    const supabase = getSupabase();
    const router = useRouter();

    const [restaurants, setRestaurants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");

    const [addrLoading, setAddrLoading] = useState(true);
    const [defaultAddress, setDefaultAddress] = useState(null);
    const [localAddress, setLocalAddress] = useState("");
    const [showMenu, setShowMenu] = useState(false);

    useEffect(() => {
        if (!router.isReady) return;

        const load = async () => {
            setLoading(true);

            // 1. Get User Location (Priority: Query Params -> LocalStorage)
            let userLat = parseFloat(router.query.lat);
            let userLng = parseFloat(router.query.lng);

            // 2. Fetch Restaurants with Location Data
            const { data, error } = await supabase
                .from("restaurants")
                .select(`
                    id, 
                    name, 
                    restaurant_profiles (
                        brand_color,
                        latitude,
                        longitude,
                        delivery_radius_km
                    )
                `)
                .order("name", { ascending: true });

            if (!error && data) {
                if (!isNaN(userLat) && !isNaN(userLng)) {
                    // Haversine Filter
                    const R = 6371; // Earth Mean Radius in KM
                    const filteredList = data.filter(r => {
                        const profile = r.restaurant_profiles;
                        if (!profile || !profile.latitude || !profile.longitude) return false;

                        const restLat = parseFloat(profile.latitude);
                        const restLng = parseFloat(profile.longitude);
                        const radius = parseFloat(profile.delivery_radius_km) || 0;

                        const dLat = (restLat - userLat) * Math.PI / 180;
                        const dLng = (restLng - userLng) * Math.PI / 180;

                        const a =
                            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                            Math.cos(userLat * Math.PI / 180) * Math.cos(restLat * Math.PI / 180) *
                            Math.sin(dLng / 2) * Math.sin(dLng / 2);

                        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                        const distance = R * c;

                        return distance <= radius;
                    });
                    setRestaurants(filteredList);
                } else {
                    setRestaurants(data);
                }
            } else {
                setRestaurants([]);
            }
            setLoading(false);
        };

        load();
    }, [supabase, router.isReady, router.query]);

    useEffect(() => {
        const loadDefaultAddress = async () => {
            setAddrLoading(true);
            if (typeof window !== 'undefined') {
                const cached = localStorage.getItem('cafeqr_address');
                if (cached) setLocalAddress(cached);
            }

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
        if (localAddress) return localAddress;
        if (addrLoading && !defaultAddress) return "Loading address…";
        if (!defaultAddress) return "Add delivery address";

        if (defaultAddress.label === "Current Location") return defaultAddress.line1;

        const parts = [
            defaultAddress.label,
            defaultAddress.line1,
            defaultAddress.city,
        ].filter(Boolean);
        return parts.join(" • ");
    }, [addrLoading, defaultAddress, localAddress]);

    return (
        <div className="delivery-restaurants-page">
            <header className="delivery-restaurants-header">
                <div className="header-inner">
                    <div className="header-top">
                        <div className="header-address">
                            <p className="address-label">DELIVER TO</p>
                            <Link href="/app/address" className="address-link">
                                <span className="address-text">{topAddressText}</span>
                                <span className="address-arrow">▲</span>
                            </Link>
                        </div>

                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                className="header-avatar"
                            >
                                <span>👨‍💼</span>
                            </button>

                            {showMenu && (
                                <>
                                    <div
                                        style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                                        onClick={() => setShowMenu(false)}
                                    />
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '120%',
                                            right: 0,
                                            background: 'white',
                                            borderRadius: '16px',
                                            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                                            padding: '8px',
                                            minWidth: '180px',
                                            zIndex: 50,
                                            border: '1px solid #f3f4f6'
                                        }}
                                    >
                                        <button
                                            onClick={() => router.push('/app/orders/history')}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                width: '100%',
                                                padding: '12px 16px',
                                                border: 'none',
                                                background: 'transparent',
                                                borderRadius: '12px',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                color: '#374151',
                                                fontSize: '14px',
                                                fontWeight: 500
                                            }}
                                        >
                                            <ShoppingBag size={18} />
                                            My Orders
                                        </button>

                                        <button
                                            onClick={() => router.push('/app/profile')}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                width: '100%',
                                                padding: '12px 16px',
                                                border: 'none',
                                                background: 'transparent',
                                                borderRadius: '12px',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                color: '#374151',
                                                fontSize: '14px',
                                                fontWeight: 500
                                            }}
                                        >
                                            <User size={18} />
                                            Profile
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
                    <div className="p-12 text-center text-gray-500 font-medium">
                        Searching nearby restaurants...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <ShoppingBag className="empty-icon" />
                        <p>No restaurants found near you.</p>
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

            {/* Scoped styles */}
            <style jsx>{`
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
                .header-inner {
                    max-width: 1280px;
                    margin: 0 auto;
                }
                .header-top {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 12px;
                }
                .header-address {
                    flex: 1;
                    overflow: hidden;
                }
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
                    text-decoration: none;
                    color: #111827;
                }
                .address-text {
                    font-weight: 700;
                    font-size: 14px;
                    max-width: 240px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .address-arrow {
                    color: #f97316;
                    font-size: 12px;
                }
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
                .header-search {
                    position: relative;
                }
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
                .restaurants-grid {
                    display: grid;
                    gap: 16px;
                }
                .restaurant-card {
                    display: block;
                    background: #fff;
                    border-radius: 16px;
                    padding: 12px;
                    border: 1px solid #e5e7eb;
                    text-decoration: none;
                    color: inherit;
                }
                .card-inner {
                    display: flex;
                    gap: 16px;
                }
                .card-image {
                    width: 80px;
                    height: 80px;
                    flex-shrink: 0;
                    border-radius: 12px;
                    overflow: hidden;
                }
                .card-image img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .card-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }
                .card-info h3 {
                    font-size: 16px;
                    font-weight: 700;
                    margin: 0 0 4px;
                }
                .card-info p {
                    font-size: 12px;
                    color: #6b7280;
                    margin: 0;
                }
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
        </div>
    );
}
