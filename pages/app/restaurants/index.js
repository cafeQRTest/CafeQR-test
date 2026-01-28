import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { motion, AnimatePresence } from "framer-motion";
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

    useEffect(() => {
        if (!router.isReady) return;

        const load = async () => {
            setLoading(true);

            // 1. Get User Location (Priority: Query Params -> LocalStorage)
            let userLat = parseFloat(router.query.lat);
            let userLng = parseFloat(router.query.lng);

            if (isNaN(userLat) || isNaN(userLng)) {
                // Fallback to localStorage address if query params missing
                const savedAddr = localStorage.getItem('cafeqr_address'); // Note: this stores text, need coords.
                // Actually, we should check 'available_restaurants' from previous step if we trusted the RPC. 
                // But USER REQUEST explicitly asks to "implement Haversine formula... in the restaurant listing logic".
                // So we will re-calculate here to be safe and strictly client-side verified.

                // Let's try to get coords strictly from query or maybe a separate storage key if needed.
                // For now, if no query, we might show all or none. 
                // Assuming nav usually provides them.
            }

            console.log("User Location for Filtering:", userLat, userLng);

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

                        console.log(`Hotel: ${r.name}, Distance: ${distance.toFixed(3)}km, Radius: ${radius}km`);

                        return distance <= radius; // STRICT CONDITION
                    });
                    setRestaurants(filteredList);
                } else {
                    // If no valid user coords, show all or empty? 
                    // Showing all might be misleading. Let's show all but warn.
                    console.warn("No user coordinates found for filtering.");
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

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 30 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="delivery-restaurants-page"
        >
            <header className="delivery-restaurants-header">
                <div className="header-inner">
                    <div className="header-top">
                        <div className="header-address">
                            <p className="address-label">DELIVER TO</p>
                            <Link href="/app/address" className="address-link">
                                <span className="address-text">{topAddressText}</span>
                                <span className="address-arrow">▼</span>
                            </Link>
                        </div>

                        <motion.button
                            onClick={() => router.push("/app/profile")}
                            animate={{ scale: [1, 1.05, 1] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            className="header-avatar"
                        >
                            <span>👨‍💼</span>
                        </motion.button>
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
                    <div className="loading-state">
                        <div className="loading-avatar" />
                        <div className="loading-text" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <ShoppingBag className="empty-icon" />
                        <p>No restaurants found near you.</p>
                    </div>
                ) : (
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        className="restaurants-grid"
                    >
                        {filtered.map((r, i) => {
                            const brand = r?.restaurant_profiles?.brand_color || "#f97316";
                            const imgUrl = STOCK_IMAGES[i % STOCK_IMAGES.length];

                            return (
                                <motion.div variants={itemVariants} key={r.id}>
                                    <Link href={`/app/restaurant/${r.id}`} className="restaurant-card">
                                        <div className="card-inner">
                                            <div className="card-image">
                                                <img src={imgUrl} alt={r.name} />
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
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </div>

            {/* Scoped styles - ONLY affects this delivery restaurants page */}
            <style jsx>{`
                .delivery-restaurants-page {
                    min-height: 100vh;
                    width: 100%;
                    max-width: none;
                    background: #f8fafc;
                    padding-bottom: 120px;
                    font-family: system-ui, -apple-system, sans-serif;
                }
                .delivery-restaurants-header {
                    background: rgba(255,255,255,0.95);
                    backdrop-filter: blur(12px);
                    border-bottom: 1px solid rgba(229,231,235,0.6);
                    position: sticky;
                    top: 0;
                    z-index: 20;
                    padding: 12px 16px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                }
                .header-inner {
                    max-width: 1280px;
                    margin: 0 auto;
                    padding: 0 16px;
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
                    letter-spacing: 0.05em;
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
                    border: 2px solid #f97316;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
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
                    pointer-events: none;
                }
                .search-input {
                    width: 100%;
                    padding: 12px 12px 12px 40px;
                    border-radius: 16px;
                    background: #f3f4f6;
                    border: 2px solid transparent;
                    font-size: 14px;
                    font-weight: 500;
                    color: #111827;
                    outline: none;
                    transition: all 0.2s;
                }
                .search-input::placeholder {
                    color: #9ca3af;
                }
                .search-input:focus {
                    background: #fff;
                    border-color: rgba(249,115,22,0.3);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
                }
                .delivery-restaurants-content {
                    max-width: 1280px;
                    margin: 0 auto;
                    padding: 24px;
                    width: 100%;
                }
                .loading-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 80px 0;
                    gap: 16px;
                }
                .loading-avatar {
                    width: 40px;
                    height: 40px;
                    background: #f3f4f6;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                }
                .loading-text {
                    height: 16px;
                    width: 128px;
                    background: #f3f4f6;
                    border-radius: 4px;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
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
                .empty-state p {
                    font-weight: 500;
                    margin: 0;
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
                    border: 1px solid #f3f4f6;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                    text-decoration: none;
                    color: inherit;
                    transition: all 0.3s ease;
                }
                .restaurant-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 10px 25px rgba(0,0,0,0.08);
                }
                .card-inner {
                    display: flex;
                    gap: 16px;
                }
                .card-image {
                    width: 96px;
                    height: 96px;
                    flex-shrink: 0;
                    background: #f3f4f6;
                    border-radius: 12px;
                    overflow: hidden;
                }
                .card-image img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transition: transform 0.5s ease;
                }
                .restaurant-card:hover .card-image img {
                    transform: scale(1.1);
                }
                .card-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    padding: 4px 0;
                }
                .card-info h3 {
                    font-size: 18px;
                    font-weight: 700;
                    color: #111827;
                    margin: 0 0 4px;
                    line-height: 1.2;
                    transition: color 0.2s;
                }
                .restaurant-card:hover .card-info h3 {
                    color: #f97316;
                }
                .card-info p {
                    font-size: 12px;
                    color: #6b7280;
                    font-weight: 500;
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
                    background: #f0fdf4;
                    color: #15803d;
                    padding: 4px 8px;
                    border-radius: 6px;
                }
                .card-order-btn {
                    color: #fff;
                    font-size: 12px;
                    font-weight: 700;
                    padding: 8px 16px;
                    border-radius: 9999px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    box-shadow: 0 2px 8px rgba(249,115,22,0.2);
                }
            `}</style>
        </motion.div>
    );
}
