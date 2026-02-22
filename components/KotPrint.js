// components/KotPrint.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { buildReceiptText, buildKotText, downloadTextAndShare } from '../utils/printUtils';
import { getSupabase } from '../services/supabase';
import { printUniversal } from '../utils/printGateway';
import { openThermerWithText, openRawBTWithText } from '../utils/thermer';
import { Capacitor } from '@capacitor/core';

const PRINT_DEDUP_KEY = 'KOTPRINT_PRINTED_V1';
const PRINT_DEDUP_TTL_MS = 15_000; // 15 seconds

const uniq = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : []).filter(Boolean)));

function readJson(key, fallback) {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getNetworkConfig(kind /* 'bill' | 'kot' */) {
  const relayUrl =
    typeof window === 'undefined' ? '' : (localStorage.getItem('PRINT_RELAY_URL') || '').trim();

  const list = readJson('PRINT_NET_PRINTERS_V1', []);
  const targetsKey = kind === 'kot' ? 'PRINT_NET_TARGET_IDS_KOT' : 'PRINT_NET_TARGET_IDS_BILL';
  const ids = uniq(readJson(targetsKey, []));

  const map = new Map((Array.isArray(list) ? list : []).map((p) => [p?.id, p]));
  const targets = ids
    .map((id) => map.get(id))
    .filter((p) => p && p.ip)
    .map((p) => ({ ip: String(p.ip).trim(), port: Number(p.port || 9100) || 9100 }));

  return { relayUrl, targets };
}

function getRouteNetworkTargets(route) {
  const relayUrl =
    typeof window === 'undefined' ? '' : (localStorage.getItem('PRINT_RELAY_URL') || '').trim();

  const list = readJson('PRINT_NET_PRINTERS_V1', []);
  const map = new Map((Array.isArray(list) ? list : []).map((p) => [p?.id, p]));
  const ids = uniq(route?.netPrinterIds || []);
  const targets = ids
    .map((id) => map.get(id))
    .filter((p) => p && p.ip)
    .map((p) => ({ ip: String(p.ip).trim(), port: Number(p.port || 9100) || 9100 }));

  return { relayUrl, targets };
}

function kotRoutesEnabled() {
  try {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('PRINT_KOT_CATEGORY_ROUTING') === '1';
  } catch {
    return false;
  }
}

// IMPORTANT: adjust this getter to match your schema
function getItemCategoryName(oi) {
  return String(oi?.menu_items?.category || '').trim();
}

function toLegacyItemsFromOrderItems(orderItems) {
  return (Array.isArray(orderItems) ? orderItems : []).map((oi) => ({
    name: oi?.menu_items?.name || oi?.item_name || oi?.itemName || 'Item',
    quantity: Number(oi?.quantity ?? oi?.qty ?? 1),
    price: Number(oi?.price ?? oi?.rate ?? 0),
    category: String(oi?.menu_items?.category || '').trim(),
    variantname: oi?.variant_name || oi?.variantName || null,
  }));
}


function hasPrintedRecently(orderId, kind = 'bill') {
  if (!orderId) return false;
  try {
    if (typeof window === 'undefined') return false;
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

function markPrinted(orderId, kind = 'bill') {
  if (!orderId) return;
  try {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(PRINT_DEDUP_KEY) || '{}';
    const map = JSON.parse(raw);
    const key = `${orderId}:${kind}`;
    map[key] = Date.now();
    localStorage.setItem(PRINT_DEDUP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function getOrderTypeLabelLocal(order) {
  if (!order) return '';
  if (order.table_number && order.table_number !== null) {
    return `Table ${order.table_number}`;
  }
  if (order.order_type === 'parcel' || order.order_type === 'takeaway') return 'Takeaway';
  return '';
}

function isNativeAndroid() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function isAndroidPWA() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (isNativeAndroid()) return false;

  const uaAndroid = /Android/i.test(navigator.userAgent || '');
  const inStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;

  return uaAndroid && inStandalone;
}

function isDesktopPWA() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  try {
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    return standalone && !/Android/i.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}

// One‑time printer setup helper (desktop PWA)
async function ensurePrinterConfigured() {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const n = navigator;

    const hasUsb = n?.usb && (await n.usb.getDevices()).length > 0;
    const hasSerial = n?.serial && (await n.serial.getPorts()).length > 0;

    const hasRelay =
      !!localStorage.getItem('PRINT_RELAY_URL') && !!localStorage.getItem('PRINTER_IP');

    if (hasUsb || hasSerial || hasRelay) return true;

    await printUniversal({ text: 'TEST', allowPrompt: true, allowSystemDialog: false, codepage: 0 });
    localStorage.setItem('PRINTER_READY', '1');
    return true;
  } catch {
    return false;
  }
}

export default function KotPrint({ order, onClose, onPrint, autoPrint = true, kind = 'bill' }) {
  const [status, setStatus] = useState('');

  // Local state to hold the "hydrated" order (with full items/discounts)
  const [fullOrder, setFullOrder] = useState(order);
  const [bill, setBill] = useState(order?.bill || null);
  const [restaurantProfile, setRestaurantProfile] = useState(order?._profile || null);

  // For manual print (autoPrint=false), we still hydrate. For auto print, we hydrate for safety.
  const [loadingData, setLoadingData] = useState(true);

  const ranRef = useRef(false);
  const lockRef = useRef(false);

  const isClient = typeof window !== 'undefined';
  const androidPwa = isClient && isAndroidPWA();
  const desktopPwa = isClient && isDesktopPWA();
  const printerReady = isClient ? localStorage.getItem('PRINTER_READY') : null;

  const closeAfterPrint = useCallback(() => {
    // For auto-print, KotPrint is a controller (often no UI); don't auto-close/navigate.
    if (!autoPrint) onClose?.();
  }, [autoPrint, onClose]);

  useEffect(() => {
    ranRef.current = false;
    lockRef.current = false;
    setStatus('');
  }, [order?.id, kind]);

  // Escape handler only when Android PWA modal is shown
  useEffect(() => {
    if (!androidPwa) return;
    const onKey = (ev) => {
      if (ev.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [androidPwa, onClose]);

  // Load bill + restaurant profile + FULL ORDER ITEMS on mount
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const supabase = getSupabase();

        // 1. Fetch Full Order Details (ensure items & discounts are present)
        if (order?.id) {
          const { data: freshOrder } = await supabase
            .from('orders')
            .select('*, order_items(*, menu_items(name, category, tax_rate)), restaurants(name)')
            .eq('id', order.id)
            .maybeSingle();

          if (alive && freshOrder) {
            // CRITICAL FIX: If this is an edited KOT (Delta KOT), preserve items/removed_items from props.
            if (order.is_edited) {
              const { order_items, ...orderWithoutFullItems } = freshOrder;
              setFullOrder({
                ...orderWithoutFullItems,
                items: order.items || [],
                removed_items: order.removed_items || [],
                is_edited: true,
                restaurant_name:
                  freshOrder.restaurants?.name || freshOrder._profile?.restaurant_name,
              });
            } else {
              setFullOrder({
                ...freshOrder,
                restaurant_name:
                  freshOrder.restaurants?.name || freshOrder._profile?.restaurant_name,
              });
            }

            if (!restaurantProfile && freshOrder._profile) setRestaurantProfile(freshOrder._profile);
            if (!bill && freshOrder.bill) setBill(freshOrder.bill);
          }
        }

        let nextBill = bill || order?.bill || null;
        let nextProfile = restaurantProfile || order?._profile || null;

        // 2. Fetch Invoice (if missing)
        if (!nextBill && kind !== 'kot' && order?.id) {
          const b = await supabase.from('invoices').select('*, bill_no').eq('order_id', order.id).maybeSingle();
          if (alive && b?.data) nextBill = b.data;
        }

        // 3. Fetch Profile (if missing)
        if (!nextProfile && order?.restaurant_id) {
          const [rp, rn] = await Promise.all([
            supabase
              .from('restaurant_profiles')
              .select(
                'restaurant_name,shipping_address_line1,shipping_address_line2,shipping_city,shipping_state,shipping_pincode,phone,shipping_phone,print_logo_bitmap,print_logo_cols,print_logo_rows,fssai_license,gstin,gst_enabled'
              )
              .eq('restaurant_id', order.restaurant_id)
              .maybeSingle(),
            supabase.from('restaurants').select('name').eq('id', order.restaurant_id).maybeSingle(),
          ]);

          if (alive) {
            if (rp?.data) nextProfile = rp.data;
            // Patch restaurant name if missing (keep existing behavior)
            if (rn?.data?.name && fullOrder) fullOrder.restaurant_name = rn.data.name;
          }
        }

        if (!alive) return;
        if (nextBill) setBill(nextBill);
        if (nextProfile) setRestaurantProfile(nextProfile);
      } catch (err) {
        console.error('Error hydrating print data:', err);
      } finally {
        if (alive) setLoadingData(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, kind]);

  const doPrint = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    try {
      const normalizedOrder = {
        ...fullOrder,
        number_of_customers:
          fullOrder?.number_of_customers ??
          fullOrder?.numberofcustomers ??
          fullOrder?.numberOfCustomers ??
          null,
      };

      const onAndroidPWA = isAndroidPWA();
      const onNativeAndroid = isNativeAndroid();
      const onDesktopStandalone = isDesktopPWA();
      const allowSystemDialog = onNativeAndroid ? false : onDesktopStandalone ? false : true;
      const scale = 'normal';

      // 1) Bill OR KOT-routing disabled => normal single ticket
      if (kind !== 'kot' || !kotRoutesEnabled()) {
        const text =
          kind === 'kot'
            ? buildKotText(normalizedOrder, restaurantProfile)
            : buildReceiptText(normalizedOrder, bill, restaurantProfile);

        if (onAndroidPWA) {
          try {
            openThermerWithText(text);
            onPrint?.();
          } catch {
            try {
              openRawBTWithText(text);
              onPrint?.();
            } catch {}
          }
          return;
        }

        await printUniversal({
          text,
          relayUrl: (typeof window !== 'undefined' && localStorage.getItem('PRINT_RELAY_URL')) || undefined,
          ip: (typeof window !== 'undefined' && localStorage.getItem('PRINTER_IP')) || undefined,
          port: Number((typeof window !== 'undefined' && localStorage.getItem('PRINTER_PORT')) || 9100),
          codepage: 0,
          allowPrompt: false,
          allowSystemDialog,
          scale,
          jobKind: kind,
        });

        onPrint?.();
        closeAfterPrint();
        return;
      }

      // 2) KOT routing enabled => print per route (category-wise)
      const routes = readJson('PRINT_KOT_ROUTES_V1', []).filter((r) => r && r.enabled);
      const allOrderItems = Array.isArray(fullOrder?.order_items) ? fullOrder.order_items : [];

      // If no routes configured, fall back to normal KOT
      if (!routes.length) {
        const text = buildKotText(normalizedOrder, restaurantProfile);

        if (onAndroidPWA) {
          try {
            openThermerWithText(text);
            onPrint?.();
          } catch {
            try {
              openRawBTWithText(text);
              onPrint?.();
            } catch {}
          }
          return;
        }

        await printUniversal({
          text,
          allowPrompt: false,
          allowSystemDialog,
          scale,
          codepage: 0,
          jobKind: 'kot',
        });

        onPrint?.();
        closeAfterPrint();
        return;
      }

      for (const r of routes) {
        const cats = Array.isArray(r.categories) ? r.categories : [];
const norm = (s) => String(s || '').trim().toUpperCase();
const catSet = new Set(cats.map(norm));
const subset = allOrderItems.filter((oi) => catSet.has(norm(getItemCategoryName(oi))));
        if (!subset.length) continue;

const routedOrder = {
  ...fullOrder,
  order_items: subset,
  // IMPORTANT: some KOT builders read `items` (JSON) instead of `order_items`
  items: toLegacyItemsFromOrderItems(subset),
};
        const text = buildKotText(routedOrder, restaurantProfile);

        if (onAndroidPWA) {
          try {
            openThermerWithText(text);
          } catch {
            try {
              openRawBTWithText(text);
            } catch {}
          }
          continue;
        }

        const routeNet = getRouteNetworkTargets(r);

        // 1) Send to route network printers (if configured)
        if (routeNet.relayUrl && routeNet.targets.length) {
          for (const t of routeNet.targets) {
            await printUniversal({
              text,
              relayUrl: routeNet.relayUrl,
              ip: t.ip,
              port: t.port,
              codepage: 0,
              allowPrompt: false,
              allowSystemDialog: false,
              scale,
              jobKind: 'kot',
            });
          }
        }

        // 2) Also print using existing default path (unchanged behavior)
        await printUniversal({
          text,
          relayUrl: (typeof window !== 'undefined' && localStorage.getItem('PRINT_RELAY_URL')) || undefined,
          ip: (typeof window !== 'undefined' && localStorage.getItem('PRINTER_IP')) || undefined,
          port: Number((typeof window !== 'undefined' && localStorage.getItem('PRINTER_PORT')) || 9100),
          codepage: 0,
          allowPrompt: false,
          allowSystemDialog,
          scale,
          jobKind: 'kot',
          winPrinterNames: Array.isArray(r.printerNames) ? r.printerNames : [],
        });
      }

      onPrint?.();
      closeAfterPrint();
} catch (e) {
  // Do not auto-download on failures during auto-print.
  // Keep download/share as a manual-only fallback.
  if (!autoPrint) {
    try {
      await downloadTextAndShare(fullOrder, bill, restaurantProfile);
      onPrint?.();
      return;
    } catch {
      // fall through to status
    }
  }
  console.error('[print] failed:', e);
  setStatus('✗ Printing failed');
}
     finally {
      setTimeout(() => {
        lockRef.current = false;
      }, 600);
    }
  }, [fullOrder, bill, restaurantProfile, onPrint, kind, closeAfterPrint]);

  // Auto‑run once data is ready
  useEffect(() => {
    if (!autoPrint || !order?.id || loadingData) return;

    const id = order.id;
    if (hasPrintedRecently(id, kind)) return;
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        await doPrint();
        markPrinted(id, kind); // moved AFTER success
      } catch {
        // allow retry on next realtime event or manual print
        ranRef.current = false;
      }
    })();
  }, [autoPrint, loadingData, order?.id, kind, doPrint]);

  // Android PWA explicit modal
  if (androidPwa) {
    const amount = Number(
      bill?.grand_total ?? bill?.total_inc_tax ?? fullOrder?.total_inc_tax ?? fullOrder?.total ?? 0
    );

    return (
      <div className="pwa-print-backdrop">
        <div className="pwa-print-card" role="dialog" aria-modal="true">
          <div className="pwa-print-head">
            <h3>Print Bill / KOT</h3>
            <button className="x" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="pwa-preview">
            <pre>{`Order: #${(fullOrder?.id || '').slice(0, 8).toUpperCase()}
Type: ${getOrderTypeLabelLocal(fullOrder)}
Amount: ₹${amount.toFixed(2)}`}</pre>
          </div>
          {status ? (
            <div className={`note ${status.includes('✗') ? 'err' : 'ok'}`}>{status}</div>
          ) : null}
          <button className="primary" type="button" onClick={doPrint} disabled={loadingData}>
            {loadingData ? 'Loading...' : '🖨️ Print via Thermer'}
          </button>
        </div>
      </div>
    );
  }

  // Desktop PWA One-time Setup
  if (desktopPwa && !printerReady) {
    return (
      <div className="kot-overlay">
        <div className="kot-modal">
          <div className="kot-header">
            <h2>Printer setup</h2>
          </div>
          <p>Select your USB/Serial/Network printer once to enable silent printing.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="primary"
              onClick={async () => {
                const ok = await ensurePrinterConfigured();
                setStatus(ok ? '✓ Printer saved' : '✗ Setup cancelled');
                if (ok) {
                  await doPrint();
                }
              }}
            >
              Select printer
            </button>
            <button onClick={onClose}>Skip</button>
          </div>
          {status && <div style={{ marginTop: 12 }}>{status}</div>}
        </div>
      </div>
    );
  }

  // General Status Modal (Manual Print or Error)
  if (autoPrint && !status) return null;

  return (
    <div className="kot-overlay">
      <div className="kot-modal">
        <div className="kot-header">
          <h2>{loadingData ? 'Loading Data...' : 'Printing...'}</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        {status && (
          <div className={`status ${status.includes('✗') ? 'error' : 'success'}`}>{status}</div>
        )}
        {!autoPrint && !loadingData && !status && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <p>Sending to printer...</p>
            <PrintTrigger manualTrigger={doPrint} />
          </div>
        )}
      </div>
    </div>
  );
}

// Helper to trigger print in manual mode once ready
function PrintTrigger({ manualTrigger }) {
  useEffect(() => {
    manualTrigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
