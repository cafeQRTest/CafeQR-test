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
            className="min-h-screen bg-[#F8FAFC] pb-32 font-sans"
        >
            <header
                className="bg-white/90 backdrop-blur-xl border-b border-gray-200/60 sticky top-0 z-20 px-4 py-3 shadow-sm transition-all"
            >
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="flex-1 overflow-hidden">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                                DELIVER TO
                            </p>
                            <Link
                                href="/app/address"
                                className="inline-flex items-center gap-1 group text-gray-900 overflow-hidden max-w-full"
                            >
                                <span className="font-bold text-sm truncate max-w-[240px]">
                                    {topAddressText}
                                </span>
                                <span className="text-brand-orange transform group-hover:translate-x-0.5 transition-transform text-xs">▼</span>
                            </Link>
                        </div>

                        {/* Profile Avatar with Breathing Animation */}
                        <motion.button
                            onClick={() => router.push("/app/profile")}
                            animate={{
                                scale: [1, 1.05, 1],
                            }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            className="w-10 h-10 rounded-full bg-orange-50 border-2 border-[#f97316] flex items-center justify-center shadow-md z-50 overflow-hidden text-2xl"
                        >
                            <span>👨‍💼</span>
                        </motion.button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400 group-focus-within:text-brand-orange transition-colors" />
                        </div>
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search restaurants, cuisines..."
                            className="block w-full pl-10 pr-3 py-3 rounded-2xl bg-gray-100 border-transparent text-gray-900 placeholder-gray-500 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange/30 transition-all text-sm font-medium shadow-inner focus:shadow-xl"
                        />
                    </div>
                </div>
            </header>

            <div className="max-w-3xl mx-auto px-4 py-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <div className="w-10 h-10 bg-gray-100 rounded-full animate-pulse" />
                        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="font-medium">No restaurants found near you.</p>
                    </div>
                ) : (
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        className="grid gap-4"
                    >
                        {filtered.map((r, i) => {
                            const brand = r?.restaurant_profiles?.brand_color || "#f97316";
                            const imgUrl = STOCK_IMAGES[i % STOCK_IMAGES.length];

                            return (
                                <motion.div variants={itemVariants} key={r.id}>
                                    <Link
                                        href={`/app/restaurant/${r.id}`}
                                        passHref
                                        legacyBehavior
                                    >
                                        <motion.a
                                            className="group block bg-white rounded-2xl p-3 border border-gray-100 shadow-sm transition-all duration-300 relative overflow-hidden cursor-pointer"
                                            whileHover={{ y: -5, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
                                            style={{ transformOrigin: "center" }}
                                        >
                                            <div className="flex gap-4">
                                                <div className="w-24 h-24 flex-shrink-0 bg-gray-100 rounded-xl overflow-hidden relative">
                                                    <img src={imgUrl} alt={r.name} className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500" />
                                                </div>

                                                <div className="flex-1 flex flex-col justify-between py-1">
                                                    <div>
                                                        <h3 className="font-bold text-lg text-gray-900 leading-tight group-hover:text-brand-orange transition-colors">
                                                            {r.name}
                                                        </h3>
                                                        <p className="text-xs text-gray-500 mt-1 font-medium">Coffee • Snacks • Beverages</p>
                                                    </div>

                                                    <div className="flex items-center justify-between mt-2">
                                                        <div className="flex items-center gap-1 text-[10px] font-bold bg-green-50 text-green-700 px-2 py-1 rounded-md">
                                                            <span>4.5 ★</span>
                                                            <span>20-30 mins</span>
                                                        </div>

                                                        <span
                                                            style={{ backgroundColor: brand }}
                                                            className="text-white text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1 shadow-md shadow-orange-100 transition-transform"
                                                        >
                                                            Order <ArrowRight className="w-3 h-3" />
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.a>
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </div>

        </motion.div>
    );
}
