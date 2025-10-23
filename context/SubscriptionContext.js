// context/SubscriptionContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRestaurant } from './RestaurantContext';

const Ctx = createContext({ 
  subscription: null, 
  loading: true, 
  error: '', 
  refresh: async () => {} 
});

export function SubscriptionProvider({ children }) {
  const { restaurant, loading: restLoading } = useRestaurant();
  const [state, setState] = useState({ subscription: null, loading: true, error: '' });

  const fetchStatus = async () => {
    if (!restaurant?.id) return setState({ subscription: null, loading: false, error: '' });
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const res = await fetch(`/api/subscription/status?restaurant_id=${restaurant.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setState({ subscription: data, loading: false, error: '' });
    } catch (e) {
      setState({ subscription: { is_active: false, status: 'unknown' }, loading: false, error: e.message || 'failed' });
    }
  };

  useEffect(() => { if (!restLoading) fetchStatus(); }, [restLoading, restaurant?.id]);

  const value = useMemo(() => ({
    subscription: state.subscription,
    loading: state.loading,
    error: state.error,
    refresh: fetchStatus
  }), [state]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Single export with refresh method included
export const useSubscription = () => {
  const context = useContext(Ctx);
  return {
    ...context,
    refresh: context.refresh // Ensure refresh is always available
  };
};
