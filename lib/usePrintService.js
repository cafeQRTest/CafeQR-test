// lib/usePrintService

import { useEffect } from 'react';
import { getSupabase } from '../services/supabase';
import { useRestaurant } from '../context/RestaurantContext';

export function usePrintService(enabled = true) {
  const { restaurant } = useRestaurant();

  useEffect(() => {
    console.log('[PRINT SERVICE] usePrintService effect triggered - enabled:', enabled, 'restaurant:', restaurant?.id);
    
    if (!enabled || !restaurant?.id) {
      console.log('[PRINT SERVICE] Not initializing - enabled:', enabled, 'restaurant:', restaurant?.id);
      return;
    }

    console.log('[PRINT SERVICE] Initializing for restaurant:', restaurant.id);

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
          .select('restaurant_name,shipping_address_line1,shipping_address_line2,shipping_city,shipping_state,shipping_pincode,phone,shipping_phone,print_logo_bitmap,print_logo_cols,print_logo_rows')
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

const channelName = `auto-print:${restaurant.id}`;
console.log('[PRINT SERVICE] Creating channel:', channelName);

channel = supabase
  .channel(channelName, {
    config: {
      broadcast: { self: false }, // Don't receive our own broadcasts
      presence: {}
    }
  })
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
      const orderType = payload?.new?.order_type;
      const tableNo  = payload?.new?.table_number;
      if (!orderId || status !== 'new' || printed.has(orderId) || hasPrintedRecently(orderId, 'kot')) return;

      const core = await fetchFullOrderWithRetry(orderId);
      const full = await enrichHeader(core || payload.new);

      printed.add(orderId);

      window.dispatchEvent(
        new CustomEvent('auto-print-order', {
          detail: {
            ...full,
            autoPrint: true,
            kind: 'kot',
          },
        })
      );
    }
  )
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      filter: `restaurant_id=eq.${restaurant.id}`,
    },
    async (payload) => {
      console.log('[PRINT SERVICE] Order UPDATE detected:', payload?.new?.id);
      
      if (!alive) return;
      
      const orderId = payload?.new?.id;
      const oldTotal = Number(payload?.old?.total_amount || 0);
      const newTotal = Number(payload?.new?.total_amount || 0);
      
      // Only print if the total changed (indicating items were added/removed)
      // AND the order is not completed (we don't want to print on status changes)
      const totalChanged = Math.abs(newTotal - oldTotal) > 0.01;
      const notCompleted = payload?.new?.status !== 'completed' && payload?.new?.status !== 'cancelled';
      
      console.log('[PRINT SERVICE] Total changed:', totalChanged, 'Not completed:', notCompleted);
      
      if (!orderId || !totalChanged || !notCompleted) {
        console.log('[PRINT SERVICE] Skipping UPDATE - no meaningful change');
        return;
      }
      
      if (hasPrintedRecently(orderId, 'kot')) {
        console.log('[PRINT SERVICE] Already printed recently, skipping');
        return;
      }

      console.log('[PRINT SERVICE] Fetching edited order for KOT');
      
      // Fetch the full order with the edit details
      // The API should have populated the order with delta information
      const { data: editedOrder } = await supabase
        .from('orders')
        .select('*, order_items(*, menu_items(name, category))')
        .eq('id', orderId)
        .single();
      
      if (!editedOrder) {
        console.log('[PRINT SERVICE] Could not fetch edited order');
        return;
      }

      const enriched = await enrichHeader(editedOrder);
      
      markPrinted(orderId, 'kot');
      
      console.log('[PRINT SERVICE] Dispatching auto-print-order for edited order');
      
      window.dispatchEvent(
        new CustomEvent('auto-print-order', {
          detail: {
            ...enriched,
            autoPrint: true,
            kind: 'kot',
            is_edited: true, // Mark as edited so KotPrint knows to handle it specially
          },
        })
      );
    }
  )
  .on(
    'broadcast',
    { event: 'order-edited' },
    (payload) => {
      console.log('[PRINT SERVICE] Received broadcast:', payload);
      
      if (!alive) {
        console.log('[PRINT SERVICE] Not alive, ignoring');
        return;
      }
      
      const data = payload.payload;
      console.log('[PRINT SERVICE] Broadcast data:', data);
      
      if (!data || !data.id) {
        console.log('[PRINT SERVICE] Invalid data, ignoring');
        return;
      }
      
      // Prevent duplicate if we already printed this edit
      if (hasPrintedRecently(data.id, 'kot')) {
        console.log('[PRINT SERVICE] Already printed recently, skipping');
        return;
      }

      console.log('[PRINT SERVICE] Marking as printed and dispatching event');
      markPrinted(data.id, 'kot');
      
      // Dispatch to trigger KotPrint component
      window.dispatchEvent(
        new CustomEvent('auto-print-order', {
          detail: {
            ...data,
            autoPrint: true,
            kind: 'kot',
          },
        })
      );
      
      console.log('[PRINT SERVICE] Event dispatched for order:', data.id);
    }
  )
  .subscribe((status) => {
    console.log('[PRINT SERVICE] Channel subscription status:', status);
  });

    return () => {
      console.log('[PRINT SERVICE] Cleaning up');
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, restaurant?.id]);
}

const PRINT_DEDUP_KEY = 'KOTPRINT_PRINTED_V1';
const PRINT_DEDUP_TTL_MS = 15_000; // 15 seconds

export function hasPrintedRecently(orderId, kind = 'bill') {
  if (typeof window === 'undefined') return false;
  if (!orderId) return false;
  try {
    const raw = localStorage.getItem(PRINT_DEDUP_KEY) || '{}';
    const map = JSON.parse(raw);
    const now = Date.now();
    const key = `${orderId}:${kind}`;

    let dirty = false;
    for (const [k, ts] of Object.entries(map)) {
      if (now - ts > PRINT_DEDUP_TTL_MS) {
        delete map[k];
        dirty = true;
      }
    }
    if (dirty) localStorage.setItem(PRINT_DEDUP_KEY, JSON.stringify(map));

    return Boolean(map[key]);
  } catch {
    return false;
  }
}

export function markPrinted(orderId, kind = 'bill') {
  if (typeof window === 'undefined') return;
  if (!orderId) return;
  try {
    const raw = localStorage.getItem(PRINT_DEDUP_KEY) || '{}';
    const map = JSON.parse(raw);
    const key = `${orderId}:${kind}`;
    map[key] = Date.now();
    localStorage.setItem(PRINT_DEDUP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

