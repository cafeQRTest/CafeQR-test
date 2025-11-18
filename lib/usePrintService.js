import { useEffect } from 'react';
import { getSupabase } from '../services/supabase';
import { useRestaurant } from '../context/RestaurantContext';

export function usePrintService(enabled = true) {
  const { restaurant } = useRestaurant();

  useEffect(() => {
    if (!enabled || !restaurant?.id) return;

    const supabase = getSupabase();
    let channel;
    let alive = true;
    const printed = new Set();

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function fetchFullOrderWithRetry(orderId) {
      const delays = [120, 220, 360, 600, 900, 1300];
      let last = null;
      for (const d of delays) {
        const { data } = await supabase
          .from('orders')
          .select('*, order_items(*, menu_items(name))')
          .eq('id', orderId)
          .maybeSingle();
        if (data) last = data;
        const hasItems = Array.isArray(last?.order_items) && last.order_items.length > 0;
        if (hasItems) break;
        await sleep(d);
      }
      return last;
    }

    async function enrichHeader(order) {
      const [rp, rn] = await Promise.all([
        supabase
          .from('restaurant_profiles')
          .select('restaurant_name,shipping_address_line1,shipping_address_line2,shipping_city,shipping_state,shipping_pincode,phone,shipping_phone')
          .eq('restaurant_id', order.restaurant_id)
          .maybeSingle(),
        supabase
          .from('restaurants')
          .select('name')
          .eq('id', order.restaurant_id)
          .maybeSingle()
      ]);
      return {
        ...order,
        restaurant_name: rn?.data?.name || order.restaurant_name || rp?.data?.restaurant_name || null,
        _profile: rp?.data || null
      };
    }

    channel = supabase
      .channel(`auto-print:${restaurant.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurant.id}` },
        async (payload) => {
          if (!alive) return;
          const orderId = payload?.new?.id;
          const status = payload?.new?.status;
          if (!orderId || status !== 'new' || printed.has(orderId)) return;

          const core = await fetchFullOrderWithRetry(orderId);
          const full = await enrichHeader(core || payload.new);
          printed.add(orderId);
          window.dispatchEvent(new CustomEvent('auto-print-order', { detail: full }));
        }
      )
      .subscribe();

    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, restaurant?.id]);
}
