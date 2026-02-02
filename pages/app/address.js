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
          // Reverted to Nominatim (Free)
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, {
            headers: { 'User-Agent': 'CafeQrDeliveryApp/1.0' }
          });
          const data = await res.json();
          let foundAddress = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

          if (data && data.address) {
            const { road, suburb, neighbourhood, city, town, village, county } = data.address;

            // Prioritize: Suburb/Road -> City/Town
            const area = suburb || neighbourhood || road || village;
            const locality = city || town || county;

            const parts = [area, locality].filter(Boolean);

            if (parts.length > 0) foundAddress = parts.join(", ");
            else if (data.display_name) foundAddress = data.display_name;
          }
          setAddress(foundAddress);
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
      localStorage.setItem('detected_delivery_address', address);

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

  // Card entrance animation - fade in and slide up
  const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15,
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 120, damping: 14 }
    }
  };

  return (
    <div className="delivery-address-page">
      <div className="delivery-address-bg" />

      <motion.div
        className="delivery-address-card"
        initial="hidden"
        animate="show"
        variants={cardVariants}
      >
        <motion.div variants={itemVariants} className="delivery-address-icon">
          <motion.div
            className={`icon-circle ${fetchingLoc ? 'is-detecting' : ''}`}
            animate={fetchingLoc ? { scale: [1, 1.05, 1] } : {}}
            transition={fetchingLoc ? { repeat: Infinity, duration: 1.5, ease: "easeInOut" } : {}}
          >
            <Navigation className="w-8 h-8 text-[#f97316]" fill="#f97316" fillOpacity={0.2} />
          </motion.div>
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
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={fetchLocation}
                className="delivery-address-refresh-link"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Not your location? Refresh</span>
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
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.97 }}
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
      {/* Fixed bottom CTA for mobile */}
      {/* Fixed bottom CTA removed as per mobile layout cleanup */}

      {/* Scoped styles - ONLY affects this delivery address page */}
      <style jsx>{`
        /* Removed fixed CTA styles */
        
       .delivery-address-page {
          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          background: #f9fafb;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 40px 20px 60px; /* Reduced top padding for mobile to prevent overlap */
          position: relative;
          overflow-x: hidden;
          font-family: system-ui, -apple-system, sans-serif;
        }
        @media (min-height: 700px) {
          .delivery-address-page {
            justify-content: center;
            padding-top: 40px;
          }
        }
        .delivery-address-bg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 40%;
          background: linear-gradient(180deg, rgba(255,237,213,0.2) 0%, transparent 100%);
          z-index: 0;
          pointer-events: none;
        }
        .delivery-address-card {
          width: 90%; /* Mobile First: 90% width */
          max-width: 400px;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #ffffff;
          border-radius: 24px;
          padding: 40px 28px 36px;
          box-shadow: 
            0 4px 6px -1px rgba(0,0,0,0.1),
            0 10px 15px -3px rgba(0,0,0,0.1),
            0 20px 25px -5px rgba(0,0,0,0.05);
          border: 1px solid rgba(0,0,0,0.04);
          position: relative;
          z-index: 1;
        }
        .delivery-address-icon {
          margin-bottom: 24px;
        }
        .icon-circle {
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(249,115,22,0.15);
          border: 2px solid #fed7aa;
          transition: all 0.3s ease;
        }
        .icon-circle.is-detecting {
          box-shadow: 0 4px 20px rgba(249,115,22,0.25);
          border-color: #fdba74;
        }
        .delivery-address-header {
          text-align: center;
          margin-bottom: 28px;
          padding-top: 8px;
        }
        .delivery-address-header h1 {
          font-size: 22px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 8px;
          letter-spacing: -0.01em;
        }
        .delivery-address-header p {
          color: #6b7280;
          font-weight: 400;
          font-size: 14px;
          margin: 0;
          line-height: 1.5;
        }
        .delivery-address-input-wrap {
          width: 100%;
        }
        .delivery-address-input-box {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #fff;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          transition: all 0.2s ease;
        }
        .delivery-address-input-box:focus-within {
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249,115,22,0.1);
        }
        .delivery-address-input-box.is-loading {
          border-color: #fdba74;
          background: #fffbf5;
        }
        .delivery-address-input-box.has-error {
          border-color: #fca5a5;
          background: #fef2f2;
        }
        .input-icon {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff7ed;
          border-radius: 10px;
        }
        .input-content {
          flex: 1;
          min-width: 0;
        }
        .input-label {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin: 0 0 4px;
        }
        .input-skeleton {
          height: 24px;
          width: 80%;
          background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
          background-size: 200% 100%;
          border-radius: 6px;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .input-field {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: #0f172a;
          font-weight: 600;
          font-size: 16px;
          text-overflow: ellipsis;
        }
        .input-field::placeholder {
          color: #cbd5e1;
        }
        .delivery-address-refresh-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 0;
          background: transparent;
          color: #6b7280;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: color 0.2s ease;
        }
        .delivery-address-refresh-link:hover {
          color: #f97316;
        }
        .delivery-address-continue {
          width: 100%;
          display: block; /* Always show inline button */
        }
        .delivery-address-continue-btn {
          width: 100%;
          padding: 16px 24px;
          border-radius: 14px;
          font-weight: 600;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: #f97316;
          color: #fff;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(249,115,22,0.3);
          transition: all 0.2s ease;
        }
        .delivery-address-continue-btn:hover {
          background: #ea580c;
          box-shadow: 0 6px 20px rgba(249,115,22,0.35);
        }
        .delivery-address-continue-btn.is-busy {
          background: #fdba74;
          cursor: not-allowed;
          box-shadow: none;
        }
        .delivery-address-actions {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-top: 20px;
        }

        /* Fixed CTA styles removed */

        /* Desktop layout adjustments */
        @media (min-width: 640px) {
          .delivery-address-page {
            padding-bottom: 40px;
          }
          .delivery-address-card {
            max-width: 400px;
            padding: 44px 32px 36px;
          }
        }
      `}</style>
    </div>
  );
}
