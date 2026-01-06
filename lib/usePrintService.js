// lib/usePrintService
import { useEffect } from 'react';
import { getSupabase } from '../services/supabase';
import { useRestaurant } from '../context/RestaurantContext';

const AUTO_PRINT_DEDUP_KEY = 'AUTO_PRINT_DEDUP_V1';
const AUTO_PRINT_TTL_MS = 2 * 60 * 1000; // 2 minutes (adjust)

function hasPrintedRecently(orderId, kind, restaurantId) {
  if (!orderId || !restaurantId) return false;
  try {
    const raw = localStorage.getItem(AUTO_PRINT_DEDUP_KEY) || '{}';
    const map = JSON.parse(raw);
    const now = Date.now();
    const key = `${restaurantId}:${orderId}:${kind}`;

    let dirty = false;
    for (const [k, ts] of Object.entries(map)) {
      if (now - ts > AUTO_PRINT_TTL_MS) {
        delete map[k];
        dirty = true;
      }
    }
    if (dirty) localStorage.setItem(AUTO_PRINT_DEDUP_KEY, JSON.stringify(map));
    return Boolean(map[key]);
  } catch {
    return false;
  }
}

export function markPrinted(orderId, kind, restaurantId) {
  if (!orderId || !restaurantId) return;
  try {
    const raw = localStorage.getItem(AUTO_PRINT_DEDUP_KEY) || '{}';
    const map = JSON.parse(raw);
    const key = `${restaurantId}:${orderId}:${kind}`;
    map[key] = Date.now();
    localStorage.setItem(AUTO_PRINT_DEDUP_KEY, JSON.stringify(map));
  } catch {}
}

export function usePrintService(enabled = true) {
  const { restaurant } = useRestaurant();

  useEffect(() => {
    if (!enabled || !restaurant?.id) return;

    const supabase = getSupabase();
    let channel;
    let alive = true;

    // IMPORTANT: keep this as a lock for this hook instance
    const printed = new Set();

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

        const hasItems =
          Array.isArray(last?.order_items) && last.order_items.length > 0;
        if (hasItems) break;

        await sleep(d);
      }
      return last;
    }

    async function enrichHeader(order) {
      const [rp, rn] = await Promise.all([
        supabase
          .from('restaurant_profiles')
          .select(
            'restaurant_name,shipping_address_line1,shipping_address_line2,shipping_city,shipping_state,shipping_pincode,phone,shipping_phone,print_logo_bitmap,print_logo_cols,print_logo_rows'
          )
          .eq('restaurant_id', order.restaurant_id)
          .maybeSingle(),
        supabase
          .from('restaurants')
          .select('name')
          .eq('id', order.restaurant_id)
          .maybeSingle(),
      ]);

      return {
        ...order,
        restaurant_name:
          rn?.data?.name ||
          order.restaurant_name ||
          rp?.data?.restaurant_name ||
          null,
        _profile: rp?.data || null,
      };
    }

    channel = supabase
      .channel(`auto-print:${restaurant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        async (payload) => {
          if (!alive) return;

          const orderId = payload?.new?.id;
          const status = payload?.new?.status;

          // DEBUG: Log incoming event
          // console.log('[AutoPrint] Incoming Realtime:', orderId, status);

          if (!orderId || status !== 'new') return;

          // 1) Cross-page / cross-remount dedupe (persisted)
          // SMALL DELAY: Give the initiator (Counter) time to write key to LS
          await sleep(500); 

          if (hasPrintedRecently(orderId, 'kot', restaurant.id)) {
             // console.log('[AutoPrint] Skipped - already printed (LS check)', orderId);
             return;
          }

          // 2) In-memory lock FIRST (prevents race inside same session)
          if (printed.has(orderId)) return;
          printed.add(orderId);

          // Mark printed early so even if page changes, it won't print again
          markPrinted(orderId, 'kot', restaurant.id);
          
          await sleep(200); // Wait bit more before fetching to ensure items are inserted

          const core = await fetchFullOrderWithRetry(orderId);
          const full = await enrichHeader(core || payload.new);
          
          // Re-check LS just in case another tab won the race during fetch
          if (hasPrintedRecently(orderId, 'kot', restaurant.id)) {
              // But we JUST marked it ourselves above? 
              // We need to know if WE marked it or someone else.
              // Actually, if we reach here, we are committed to print.
          }

          window.dispatchEvent(
            new CustomEvent('auto-print-order', {
              detail: { ...full, autoPrint: true, kind: 'kot' },
            })
          );
        }
      )
      .subscribe();

    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, restaurant?.id]);
}
