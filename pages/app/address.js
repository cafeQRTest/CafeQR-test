import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { getSupabase } from "../../services/supabase";
import { getOrCreateCustomer } from "../../lib/customer/getOrCreateCustomer";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Navigation, Loader2, ArrowRight, RefreshCw } from "lucide-react";

export default function AddressPage() {
  const supabase = getSupabase();
  const router = useRouter();

  const [customer, setCustomer] = useState(null);
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState(null);
  const [fetchingLoc, setFetchingLoc] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRefresh, setShowRefresh] = useState(false);

  const fetchLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setFetchingLoc(false);
      return;
    }

    setFetchingLoc(true);
    setAddress("");
    setError("");
    setShowRefresh(false);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });

        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, {
            headers: { 'User-Agent': 'CafeQrDeliveryApp/1.0' }
          });
          const data = await res.json();

          if (data && data.display_name) {
            const { road, suburb, city, state, postcode } = data.address || {};
            const parts = [road, suburb, city, state, postcode].filter(Boolean);
            const rawAddr = parts.length > 0 ? parts.join(", ") : data.display_name;
            setAddress(rawAddr);
          } else {
            setAddress(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        } catch (err) {
          console.error("Geocoding failed", err);
          setAddress(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        } finally {
          setFetchingLoc(false);
          setShowRefresh(true);
        }
      },
      (err) => {
        console.error(err);
        setError("Unable to retrieve your location. Check GPS settings.");
        setFetchingLoc(false);
        setAddress("");
        setShowRefresh(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  useEffect(() => {
    const init = async () => {
      try {
        const c = await getOrCreateCustomer();
        setCustomer(c);
        fetchLocation();
      } catch (e) {
        console.error(e);
      }
    };
    init();
  }, []);

  const handleContinue = async () => {
    if (!address || !customer) return;
    setBusy(true);

    try {
      await supabase.from("customer_addresses").update({ is_default: false }).eq("customer_id", customer.id);

      const { error } = await supabase.from("customer_addresses").insert({
        customer_id: customer.id,
        label: "Current Location",
        line1: address,
        city: "Detected",
        state: "",
        pincode: "",
        geo: coords,
        is_default: true
      });

      if (error) throw error;

      localStorage.setItem('cafeqr_address', address);
      router.push("/app/restaurants");

    } catch (e) {
      console.error(e);
      setError("Failed to save location. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div
      className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans"
      initial="hidden"
      animate="show"
      variants={containerVariants}
    >
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-orange-50/50 to-transparent -z-10" />

      <motion.div
        className="w-full max-w-md flex flex-col items-center"
        layout
      >
        <motion.div variants={itemVariants} className="mb-8">
          <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center shadow-sm ring-1 ring-orange-100">
            <Navigation className="w-10 h-10 text-[#f97316]" fill="#f97316" fillOpacity={0.2} />
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="text-center mb-10 space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Locating you</h1>
          <p className="text-slate-500 font-medium text-base">
            Detecting your delivery zone for food, groceries, and medicine.
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="w-full relative mb-4">
          <div className={`
                flex items-center gap-4 bg-white p-5 rounded-2xl border-2 transition-all shadow-sm
                ${fetchingLoc ? 'border-orange-100 shadow-orange-50' : 'border-gray-200 shadow-lg'}
                ${error ? 'border-red-200 bg-red-50' : ''}
            `}>
            <div className="flex-shrink-0">
              {fetchingLoc ? (
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                >
                  <MapPin className="w-6 h-6 text-[#f97316]" />
                </motion.div>
              ) : (
                <MapPin className="w-6 h-6 text-gray-700" />
              )}
            </div>

            <div className="flex-1">
              <p className="text-xs font-bold text-gray-400 tracking-wider mb-1" style={{ textTransform: 'none' }}>
                {fetchingLoc ? 'Locating you...' : 'Delivery location'}
              </p>

              {fetchingLoc ? (
                <div className="h-6 w-3/4 bg-gray-100 rounded-md animate-pulse" />
              ) : (
                <motion.input
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-transparent outline-none text-gray-900 font-semibold text-lg placeholder-gray-300"
                  placeholder="Enter location manually..."
                  style={{ textTransform: 'capitalize' }}
                />
              )}
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-sm font-bold mt-2 text-center"
            >
              {error}
            </motion.p>
          )}

          {/* Refresh Button - BRAND ORANGE */}
          {!fetchingLoc && showRefresh && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchLocation}
              className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 shadow-xl transition-all bg-[#f97316] text-white shadow-orange-300 mt-4"
            >
              <RefreshCw className="w-5 h-5" />
              <span>Not your location? Click here to refresh</span>
            </motion.button>
          )}
        </motion.div>

        <AnimatePresence>
          {!fetchingLoc && address && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full"
              layout
            >
              <motion.button
                onClick={handleContinue}
                disabled={busy || !address}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 shadow-xl transition-all bg-[#f97316] text-white shadow-orange-300`}
              >
                {busy ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <span>Continue to Order</span>
                    <ArrowRight className="w-6 h-6" />
                  </>
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </motion.div>
  );
}
