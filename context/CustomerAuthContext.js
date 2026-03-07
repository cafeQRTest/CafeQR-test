// context/CustomerAuthContext.js
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getCustomerSupabase } from "../services/supabase";

const CustomerAuthContext = createContext(null);

export function CustomerAuthProvider({ children }) {
  const supabase = getCustomerSupabase();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!ignore) {
        setSession(data?.session || null);
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
    });

    return () => {
      ignore = true;
      sub?.subscription?.unsubscribe();
    };
  }, [supabase]);

  // Sync User Data (Profile & Address) to Local Storage on Session Restore
  useEffect(() => {
    if (!session?.user) return;

    const syncUserData = async () => {
      try {
        // 1. Sync Profile (delivery_profile)
        // We can fetch from 'customers' table using the user_id
        const { data: customerData, error: custErr } = await supabase
          .from('customers')
          .select('name, phone, id')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (customerData) {
          const profile = {
            name: customerData.name || session.user.user_metadata?.full_name || '',
            phone: customerData.phone || session.user.phone || ''
          };
          localStorage.setItem('delivery_profile', JSON.stringify(profile));
        }

        // 2. Sync Address (cafeqr_address)
        // Fetch default address
        if (customerData?.id) {
          const { data: addrData } = await supabase
            .from('customer_addresses')
            .select('*')
            .eq('customer_id', customerData.id)
            .eq('is_default', true)
            .maybeSingle();

          if (addrData) {
            // Construct address string similar to how it's done elsewhere
            // Format: "Line1" or "Line1, City"
            let addrString = addrData.line1;
            if (addrData.city && addrData.city !== 'Detected') {
              addrString += `, ${addrData.city}`;
            }
            localStorage.setItem('cafeqr_address', addrString);
          }
        }

      } catch (err) {
        console.error('Data Sync Error:', err);
      }
    };

    syncUserData();
  }, [session, supabase]);


  const value = useMemo(
    () => ({
      loading,
      session,
      user: session?.user || null,
      isLoggedIn: !!session?.user,
    }),
    [loading, session]
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth must be used within CustomerAuthProvider");
  return ctx;
}
