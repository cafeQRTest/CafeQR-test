// context/RestaurantContext.js
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/router';
import { getSupabase } from '../services/supabase';

const RestaurantCtx = createContext({
  restaurant: null,
  loading: true,
  error: '',
  role: 'guest',          // 'admin' | 'manager' | 'staff' | 'guest'
  isAdmin: false,
  isManager: false,
  isStaff: false,
  staffName: null,
  refresh: async () => { },
});

export function RestaurantProvider({ children }) {
  const router = useRouter();
  const supabase = getSupabase();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [refreshKey, setRefreshKey] = useState(0);

  // Resolve active restaurant ID from URL or storage (for order/kitchen)
  const ridFromUrlOrStorage = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const q = router?.query || {};
    return (
      q.r ||
      q.rid ||
      window.__activeRestaurantId ||
      localStorage.getItem('active_restaurant_id') ||
      null
    );
  }, [router?.query]);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');

      try {
        let found = null;

        // Get current session + email once
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userEmail =
          session?.user?.email || session?.user?.user_metadata?.email || null;

        // === 1) Owner pages with NO explicit rid: try OWNER restaurant first ===
        if (router.pathname?.startsWith('/owner') && !ridFromUrlOrStorage && userEmail) {
          const { data, error } = await supabase
            .from('restaurants')
            .select('*')
            .eq('owner_email', userEmail)
            .maybeSingle();
          if (error) throw error;
          found = data || null;
        }

        // === 2) If we still don't have a restaurant, but rid is present → use rid ===
        if (!found && ridFromUrlOrStorage) {
          const { data, error } = await supabase
            .from('restaurants')
            .select('*')
            .eq('id', ridFromUrlOrStorage)
            .maybeSingle();
          if (error) throw error;
          found = data || null;
        }

        // === 3) If STILL nothing, but user is logged in → treat them as STAFF ===
        // This is the key part that lets pure staff accounts land on the correct restaurant.
        let staffBinding = null;
        if (!found && userEmail) {
          const { data: staffRow, error: staffErr } = await supabase
            .from('restaurant_staff')
            .select('restaurant_id, role, staff_name')
            .eq('staff_email', userEmail.toLowerCase())
            .maybeSingle();
          if (staffErr) {
            // ignore; staff user just sees no restaurant
          } else if (staffRow?.restaurant_id) {
            staffBinding = staffRow;
            const { data: rest, error: restErr } = await supabase
              .from('restaurants')
              .select('*')
              .eq('id', staffRow.restaurant_id)
              .maybeSingle();
            if (restErr) throw restErr;
            if (rest) {
              // Attach the bound staff role temporarily
              found = { ...rest, _staffRole: staffRow.role, _staffName: staffRow.staff_name };
            }
          }
        }

        // === 4) Fetch feature flags if we have a restaurant ===
        if (found?.id) {
          try {
            const { data: prof } = await supabase
              .from('restaurant_profiles')
              .select(
                'features_credit_enabled,features_production_enabled,features_inventory_enabled,features_table_ordering_enabled,qr_ordering_enabled,' +
                'featurescustomersenabled,featuresloyaltyenabled,' +
                'delivery_enabled,delivery_webpage_enabled,delivery_app_enabled,' +
                'round_off_enabled,round_off_mode,round_off_auto_factor,round_off_manual_limit,' +
                'gst_enabled,gstin,fssai_license,prices_include_tax,default_tax_rate'
              )
              .eq('restaurant_id', found.id)
              .maybeSingle();


            const features = {
              credit_enabled: !!prof?.features_credit_enabled,
              production_enabled: !!prof?.features_production_enabled,
              inventory_enabled: !!prof?.features_inventory_enabled,
              table_ordering_enabled: !!prof?.features_table_ordering_enabled,
              qr_ordering_enabled: prof?.qr_ordering_enabled !== false, // Default to true if not set

              customers_enabled: !!prof?.featurescustomersenabled,
              loyalty_enabled: !!prof?.featuresloyaltyenabled,

              delivery_enabled: !!prof?.delivery_enabled,
              delivery_webpage_enabled: prof?.delivery_webpage_enabled !== false,
              delivery_app_enabled: !!prof?.delivery_app_enabled,

              round_off: {
                enabled: !!prof?.round_off_enabled,
                mode: prof?.round_off_mode || 'automatic',
                factor: Number(prof?.round_off_auto_factor || 1),
                limit: Number(prof?.round_off_manual_limit || 10),
              },
            };

            found = { ...found, features, ...prof };

          } catch {
            // ignore profile read errors; leave features undefined/absent
          }
        }

        // === 5) Determine current user's role for THIS restaurant ===
        let role = 'guest'; // default when not logged in or no binding
        if (found?.id && userEmail) {
          if (userEmail === found.owner_email) {
            role = 'admin';
          } else if (found._staffRole === 'manager' || found._staffRole === 'staff') {
            // staff binding we already looked up in step 3
            role = found._staffRole;
          } else {
            // Fallback: if we got restaurant by rid, check if this user is staff on it
            try {
              const { data: staffRow2 } = await supabase
                .from('restaurant_staff')
                .select('role, staff_name')
                .eq('restaurant_id', found.id)
                .eq('staff_email', userEmail.toLowerCase())
                .maybeSingle();
              if (staffRow2?.role === 'manager' || staffRow2?.role === 'staff') {
                role = staffRow2.role;
                found = { ...found, _staffName: staffRow2.staff_name };

              }
            } catch {
              // keep role as guest
            }
          }
        }

        if (found) {
          const staffName = found._staffName || null;

          delete found._staffRole;
          delete found._staffName;

          found = { ...found, role, staff_name: staffName };
        }


        if (!cancelled) setRestaurant(found);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Failed to resolve restaurant');
          setRestaurant(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolve();

    // Listen to auth changes globally to keep restaurant state in sync
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange(() => {
      resolve();
    });

    return () => {
      cancelled = true;
      authSub?.unsubscribe();
    };
  }, [supabase, ridFromUrlOrStorage, router.pathname, refreshKey]);

  // Keep active restaurant id globally accessible for push subscription routing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rid = restaurant?.id ? String(restaurant.id) : '';
    if (rid) {
      window.__activeRestaurantId = rid;
      localStorage.setItem('active_restaurant_id', rid);
    } else if (!router.pathname?.startsWith('/owner')) {
      // Avoid clearing owner context during transient loads, but cleanup outside owner app.
      try {
        delete window.__activeRestaurantId;
      } catch { }
      localStorage.removeItem('active_restaurant_id');
    }
  }, [restaurant?.id, router.pathname]);

  const value = useMemo(() => {
    const role = restaurant?.role || 'guest';
    return {
      restaurant,
      loading,
      error,
      role,
      isAdmin: role === 'admin',
      isManager: role === 'manager',
      isStaff: role === 'staff',
      staffName: restaurant?.staff_name || null,

      refresh: async () => {
        setRefreshKey(prev => prev + 1);
      },
    };
  }, [restaurant, loading, error]);

  return (
    <RestaurantCtx.Provider value={value}>
      {children}
    </RestaurantCtx.Provider>
  );
}

export function useRestaurant() {
  return useContext(RestaurantCtx);
}
