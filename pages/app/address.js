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
  const [geoSaved, setGeoSaved] = useState(false);
  const [savingGeo, setSavingGeo] = useState(false);

  const fetchLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setFetchingLoc(false);
      return;
    }

    setFetchingLoc(true);
    setSavingGeo(true); // Start saving spinner for DB
    setAddress("");
    setError("");
    setShowRefresh(false);
    setGeoSaved(false);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });

        // --- Background Sync to 'user_location_sync' table ---
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            // Resolve customer ID
            const { data: custData } = await supabase
              .from('customers')
              .select('id')
              .eq('user_id', user.id)
              .single();

            if (custData) {
              const payload = {
                customer_id: custData.id,
                latitude: latitude,
                longitude: longitude
              };

              console.log('Syncing to new table:', payload);

              const { data, error: saveErr } = await supabase
                .from('user_location_sync')
                .insert(payload)
                .select();

              if (saveErr) {
                console.error("DB Sync Error (Silent):", saveErr);
                // Silent fail: do not show error to user
              } else {
                console.log("DB Sync Success:", data);
                setGeoSaved(true);
              }
            } else {
              console.error("Customer not found for user:", user.id);
            }
          }
        } catch (dbErr) {
          console.error("Background Save Exception:", dbErr);
        } finally {
          setSavingGeo(false);
        }
        // -----------------------------

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
        setSavingGeo(false);
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
      // 1. Check for available restaurants within radius
      const { data: restaurants, error: rpcError } = await supabase.rpc('get_restaurants_within_radius', {
        user_lat: coords.lat,
        user_lng: coords.lng
      });

      if (rpcError) {
        console.warn("RPC Error (Silent):", rpcError);
        // Do not block user, let them proceed (maybe filtering happens on next page too)
      } else if (!restaurants || restaurants.length === 0) {
        // Even if 0 restaurants, we might want to let them see the empty state on the listing page?
        // User request said: "If no restaurants... show a clear message".
        // But in this specific request step, they said "Ensure 'Continue to Order' button's onClick function to immediately navigate..."
        // I will prioritize navigation, but store empty list so next page handles it.
        console.log("No restaurants found in range.");
      }

      // 2. Save restaurants to global state (localStorage as proxy)
      if (restaurants) {
        localStorage.setItem('available_restaurants', JSON.stringify(restaurants));
      } else {
        localStorage.setItem('available_restaurants', JSON.stringify([]));
      }

      // 3. Save Address to DB (Legacy/Required flow)
      // We do this concurrently or await it. Since safety is key, we await.
      try {
        await supabase.from("customer_addresses").update({ is_default: false }).eq("customer_id", customer.id);
        await supabase.from("customer_addresses").insert({
          customer_id: customer.id,
          label: "Current Location",
          line1: address,
          city: "Detected",
          state: "",
          pincode: "",
          geo: { lat: coords.lat, lng: coords.lng },
          is_default: true
        });
      } catch (dbEx) {
        console.warn("Address save failed silently", dbEx);
      }

      localStorage.setItem('cafeqr_address', address);

      // 4. Force Navigation
      router.push({
        pathname: "/app/restaurants",
        query: { lat: coords.lat, lng: coords.lng }
      });

    } catch (e) {
      console.error(e);
      // Fallback navigation even on error
      router.push("/app/restaurants");
    } finally {
      // No need to setBusy(false) if reducing jank on nav, but safe practice
      // setBusy(false); 
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
      className="delivery-address-page"
      initial="hidden"
      animate="show"
      variants={containerVariants}
    >
      <div className="delivery-address-bg" />

      <motion.div className="delivery-address-card" layout>
        <motion.div variants={itemVariants} className="delivery-address-icon">
          <div className="icon-circle">
            <Navigation className="w-10 h-10 text-[#f97316]" fill="#f97316" fillOpacity={0.2} />
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="delivery-address-header">
          <h1>Locating you</h1>
          <p>Detecting your delivery zone for food, groceries, and medicine.</p>
        </motion.div>

        <motion.div variants={itemVariants} className="delivery-address-input-wrap">
          <div className={`delivery-address-input-box ${fetchingLoc ? 'is-loading' : ''} ${error ? 'has-error' : ''}`}>
            <div className="input-icon">
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

            <div className="input-content">
              <p className="input-label">
                {fetchingLoc ? 'Locating you...' : 'Delivery location'}
              </p>

              {fetchingLoc ? (
                <div className="input-skeleton" />
              ) : (
                <motion.input
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="input-field"
                  placeholder="Enter location manually..."
                />
              )}
            </div>
          </div>

          {/* Action Buttons Container with Gap */}
          <div className="delivery-address-actions">
            {!fetchingLoc && showRefresh && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={fetchLocation}
                className="delivery-address-refresh-btn"
              >
                <RefreshCw className="w-5 h-5" />
                <span>Not your location? Click here to refresh</span>
              </motion.button>
            )}

            <AnimatePresence>
              {!fetchingLoc && address && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="delivery-address-continue"
                  layout
                >
                  <motion.button
                    onClick={handleContinue}
                    disabled={busy}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`delivery-address-continue-btn ${busy ? 'is-busy' : ''}`}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>Loading...</span>
                      </>
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
          </div>
        </motion.div>
      </motion.div>

      {/* Scoped styles - ONLY affects this delivery address page */}
      <style jsx>{`
        .delivery-address-page {
          min-height: 100vh;
          width: 100%;
          max-width: none;
          background: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .delivery-address-bg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 50%;
          background: linear-gradient(to bottom, rgba(255,237,213,0.5), transparent);
          z-index: -1;
        }
        .delivery-address-card {
          width: 100%;
          max-width: 420px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .delivery-address-icon {
          margin-bottom: 32px;
        }
        .icon-circle {
          width: 80px;
          height: 80px;
          background: #fff7ed;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          border: 1px solid #fed7aa;
        }
        .delivery-address-header {
          text-align: center;
          margin-bottom: 40px;
        }
        .delivery-address-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 8px;
          letter-spacing: -0.02em;
        }
        .delivery-address-header p {
          color: #64748b;
          font-weight: 500;
          font-size: 16px;
          margin: 0;
        }
        .delivery-address-input-wrap {
          width: 100%;
          margin-bottom: 16px;
        }
        .delivery-address-input-box {
          display: flex;
          align-items: center;
          gap: 16px;
          background: #fff;
          padding: 20px;
          border-radius: 16px;
          border: 2px solid #e5e7eb;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .delivery-address-input-box.is-loading {
          border-color: #fed7aa;
          box-shadow: 0 4px 12px rgba(249,115,22,0.1);
        }
        .delivery-address-input-box.has-error {
          border-color: #fecaca;
          background: #fef2f2;
        }
        .input-icon {
          flex-shrink: 0;
        }
        .input-content {
          flex: 1;
        }
        .input-label {
          font-size: 11px;
          font-weight: 700;
          color: #9ca3af;
          letter-spacing: 0.05em;
          margin: 0 0 4px;
        }
        .input-skeleton {
          height: 24px;
          width: 75%;
          background: #f3f4f6;
          border-radius: 6px;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .input-field {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: #111827;
          font-weight: 600;
          font-size: 18px;
        }
        .input-field::placeholder {
          color: #d1d5db;
        }
        .delivery-address-refresh-btn {
          width: 100%;
          margin-top: 16px;
          padding: 16px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: #f97316;
          color: #fff;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(249,115,22,0.3);
          transition: all 0.2s;
        }
        .delivery-address-refresh-btn:hover {
          background: #ea580c;
        }
        .delivery-address-continue {
          width: 100%;
        }
        .delivery-address-continue-btn {
          width: 100%;
          padding: 16px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: #f97316;
          color: #fff;
          border: none;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(249,115,22,0.3);
          transition: all 0.2s;
        }
        .delivery-address-continue-btn:hover {
          background: #ea580c;
        }
        .delivery-address-continue-btn.is-busy {
          background: #fdba74;
          cursor: not-allowed;
        }
        .delivery-address-actions {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-top: 20px;
        }
      `}</style>
    </motion.div>
  );
}
