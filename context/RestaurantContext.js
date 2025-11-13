// context/RestaurantContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabase } from '../services/supabase';

const RestaurantCtx = createContext({
  restaurant: null,
  loading: true,
  error: '',
  refresh: async () => {},
});

export function RestaurantProvider({ children }) {
  const router = useRouter();
  const supabase = getSupabase();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

      // 1) Owner pages: resolve by logged-in owner email (no rid needed)
      if (router.pathname?.startsWith('/owner') && !ridFromUrlOrStorage) {
        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email || session?.user?.user_metadata?.email;
        if (email) {
          const { data, error } = await supabase
            .from('restaurants')
            .select('*')
            .eq('owner_email', email)
            .maybeSingle();
          if (error) throw error;
          found = data || null;
        }
      }

      // 2) Public/kitchen/customer (or owner with explicit rid): resolve by rid
      if (!found && ridFromUrlOrStorage) {
        const { data, error } = await supabase
          .from('restaurants')
          .select('*')
          .eq('id', ridFromUrlOrStorage)
          .maybeSingle();
        if (error) throw error;
        found = data || null;
      }

      // 3) Fetch feature flags from profile and attach to found
      if (found?.id) {
        try {
          const { data: prof } = await supabase
            .from('restaurant_profiles')
            .select('features_credit_enabled,features_production_enabled,features_inventory_enabled,features_table_ordering_enabled')
            .eq('restaurant_id', found.id)
            .maybeSingle();

          const features = {
            credit_enabled: !!prof?.features_credit_enabled,
            production_enabled: !!prof?.features_production_enabled,
            inventory_enabled: !!prof?.features_inventory_enabled,
            table_ordering_enabled: !!prof?.features_table_ordering_enabled,
          };

          found = { ...found, features };
        } catch {
          // ignore profile read errors; leave features undefined/absent
        }
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

  // Listen to auth changes for owner routes
  if (router.pathname?.startsWith('/owner')) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      resolve();
    });
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }

  return () => {
    cancelled = true;
  };
}, [supabase, ridFromUrlOrStorage, router.pathname]);


  const value = useMemo(
    () => ({
      restaurant,
      loading,
      error,
      refresh: async () => {
        const q = router.query;
        await router.replace(
          { pathname: router.pathname, query: { ...q, _r: Date.now() } },
          undefined,
          { shallow: true }
        );
      },
    }),
    [restaurant, loading, error, router]
  );

  return <RestaurantCtx.Provider value={value}>{children}</RestaurantCtx.Provider>;
}

export function useRestaurant() {
  return useContext(RestaurantCtx);
}
