import { getCustomerSupabase } from "../../services/supabase";
import { getOrCreateCustomer } from "../../lib/customer/getOrCreateCustomer";
import { MapPin, Navigation, Loader2, ArrowRight, RefreshCw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export default function AddressPage() {
  const supabase = getCustomerSupabase();
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

  const processPosition = async (latitude, longitude) => {
    setCoords({ lat: latitude, lng: longitude });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: custData } = await supabase
          .from("customers")
          .select("id")
          .eq("user_id", user.id)
          .single();

        if (custData?.id) {
          const payload = {
            customer_id: custData.id,
            latitude,
            longitude,
          };

          const { error: saveErr } = await supabase
            .from("user_location_sync")
            .insert(payload)
            .select();

          if (!saveErr) setGeoSaved(true);
        }
      }
    } catch (dbErr) {
      console.error("Background Save Exception:", dbErr);
    } finally {
      setSavingGeo(false);
    }

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        { headers: { "User-Agent": "CafeQrDeliveryApp/1.0" } }
      );
      const data = await res.json();

      let foundAddress = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      if (data?.address) {
        const { road, suburb, neighbourhood, city, town, village, county } = data.address;
        const area = suburb || neighbourhood || road || village;
        const locality = city || town || county;
        const parts = [area, locality].filter(Boolean);
        if (parts.length > 0) foundAddress = parts.join(", ");
        else if (data.display_name) foundAddress = data.display_name;
      }
      setAddress(foundAddress);
    } catch (e) {
      console.error("Geocoding failed", e);
      setAddress(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    } finally {
      setFetchingLoc(false);
      setShowRefresh(true);
    }
  };

  const fetchLocation = async () => {
    setFetchingLoc(true);
    setSavingGeo(true);
    setAddress("");
    setError("");
    setShowRefresh(false);
    setGeoSaved(false);

    try {
      if (Capacitor.isNativePlatform()) {
        await Geolocation.requestPermissions();
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        });
        const { latitude, longitude } = pos.coords;
        await processPosition(latitude, longitude);
        return;
      }

      if (!navigator.geolocation) {
        setError("Geolocation is not supported by your browser.");
        setFetchingLoc(false);
        setSavingGeo(false);
        setShowRefresh(true);
        return;
      }

      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude } = pos.coords;
      await processPosition(latitude, longitude);
    } catch (e) {
      console.error(e);
      setError("Location permission denied or GPS is off.");
      setFetchingLoc(false);
      setSavingGeo(false);
      setShowRefresh(true);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const c = await getOrCreateCustomer();
        setCustomer(c);
        await fetchLocation();
      } catch (e) {
        console.error(e);
      }
    };
    init();
  }, []);

  const handleContinue = async () => {
    if (!address || !customer || !coords) return;

    setBusy(true);
    try {
      const { data: restaurants } = await supabase.rpc("get_restaurants_within_radius", {
        user_lat: coords.lat,
        user_lng: coords.lng,
      });

      localStorage.setItem("available_restaurants", JSON.stringify(restaurants || []));

      try {
        await supabase
          .from("customer_addresses")
          .update({ is_default: false })
          .eq("customer_id", customer.id);

        await supabase.from("customer_addresses").insert({
          customer_id: customer.id,
          label: "Current Location",
          line1: address,
          city: "Detected",
          state: "",
          pincode: "",
          geo: { lat: coords.lat, lng: coords.lng },
          is_default: true,
        });
      } catch (dbEx) {
        console.warn("Address save failed silently", dbEx);
      }

      localStorage.setItem("cafeqr_address", address);
      localStorage.setItem("detected_delivery_address", address);
      localStorage.setItem("delivery_user_location", JSON.stringify({ lat: coords.lat, lng: coords.lng }));

      router.push({
        pathname: "/app/restaurants",
        query: { lat: coords.lat, lng: coords.lng },
      });
    } catch (e) {
      console.error(e);
      router.push("/app/restaurants");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="delivery-address-page">
      <div className="delivery-address-bg" />

      <div className="delivery-address-card">
        <div className="delivery-address-icon">
          <div className={`icon-circle ${fetchingLoc ? "is-detecting" : ""}`}>
            <Navigation className="w-8 h-8 text-[#f97316]" fill="#f97316" fillOpacity={0.2} />
          </div>
        </div>

        <div className="delivery-address-header">
          <h1>Locating you</h1>
          <p>Detecting your delivery zone for food, groceries, and medicine.</p>
        </div>

        <div className="delivery-address-input-wrap">
          <div className={`delivery-address-input-box ${fetchingLoc ? "is-loading" : ""} ${error ? "has-error" : ""}`}>
            <div className="input-icon">
              <MapPin className="w-6 h-6 text-[#f97316]" />
            </div>

            <div className="input-content">
              <p className="input-label">{fetchingLoc ? "Locating you..." : "Delivery location"}</p>
              {fetchingLoc ? (
                <div className="input-skeleton" />
              ) : (
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="input-field"
                  placeholder="Enter location manually..."
                />
              )}
            </div>
          </div>

          <div className="delivery-address-actions">
            {!fetchingLoc && showRefresh && (
              <button
                onClick={fetchLocation}
                className="delivery-address-refresh-link"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Not your location? Refresh</span>
              </button>
            )}

            {!fetchingLoc && address && (
              <div className="delivery-address-continue">
                <button
                  onClick={handleContinue}
                  disabled={busy}
                  className={`delivery-address-continue-btn ${busy ? "is-busy" : ""}`}
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
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .delivery-address-page {
          min-height: 100vh;
          width: 100%;
          background: #f9fafb;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 40px 20px 60px;
          position: relative;
          overflow-x: hidden;
          font-family: system-ui, -apple-system, sans-serif;
        }
        @media (min-height: 700px) {
          .delivery-address-page {
            justify-content: center;
          }
        }
        .delivery-address-bg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 40%;
          background: linear-gradient(180deg, rgba(255, 237, 213, 0.2) 0%, transparent 100%);
          z-index: 0;
          pointer-events: none;
        }
        .delivery-address-card {
          width: 90%;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #ffffff;
          border-radius: 24px;
          padding: 40px 28px 36px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(0, 0, 0, 0.04);
          position: relative;
          z-index: 1;
        }
        .icon-circle {
          width: 80px;
          height: 80px;
          background: #fff7ed;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.15);
          border: 2px solid #fed7aa;
        }
        .icon-circle.is-detecting {
            animation: pulse 1.5s infinite ease-in-out;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
        .delivery-address-header {
          text-align: center;
          margin-bottom: 28px;
        }
        .delivery-address-header h1 {
          font-size: 22px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 8px;
        }
        .delivery-address-header p {
          color: #6b7280;
          font-size: 14px;
          margin: 0;
        }
        .delivery-address-input-box {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #fff;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
        }
        .delivery-address-input-box.is-loading {
          background: #fffbf5;
        }
        .input-icon {
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
        }
        .input-label {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          margin: 0 0 4px;
        }
        .input-skeleton {
          height: 24px;
          width: 80%;
          background: #f3f4f6;
          border-radius: 6px;
          animation: skeleton-pulse 1.5s infinite;
        }
        @keyframes skeleton-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .input-field {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: #0f172a;
          font-weight: 600;
          font-size: 16px;
        }
        .delivery-address-refresh-link {
          background: transparent;
          color: #6b7280;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
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
          box-shadow: 0 4px 14px rgba(249, 115, 22, 0.3);
        }
        .delivery-address-continue-btn:disabled {
          background: #fdba74;
          cursor: not-allowed;
        }
        .delivery-address-actions {
          margin-top: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          width: 100%;
        }
      `}</style>
    </div>
  );
}
