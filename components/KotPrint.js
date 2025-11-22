// components/KotPrint.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { buildReceiptText, buildKotText, downloadTextAndShare } from '../utils/printUtils';
import { getSupabase } from '../services/supabase';
import { printUniversal } from '../utils/printGateway';
import { openThermerWithText, openRawBTWithText } from '../utils/thermer';
import { Capacitor } from '@capacitor/core';

const PRINT_DEDUP_KEY = 'KOTPRINT_PRINTED_V1';
const PRINT_DEDUP_TTL_MS = 15_000; // 15 seconds

function hasPrintedRecently(orderId, kind = 'bill') {
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

function markPrinted(orderId, kind = 'bill') {
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


function getOrderTypeLabelLocal(order) {
  if (!order) return '';
  if (order.order_type === 'parcel') return 'Parcel';
  if (order.order_type === 'dine-in') return 'Dine-in';
  if (order.order_type === 'counter') {
    return order.table_number ? `Table ${order.table_number}` : 'Counter';
  }
  return '';
}

function isNativeAndroid() {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'; } catch { return false; }
}

function isAndroidPWA() {
  if (isNativeAndroid()) return false;
  const uaAndroid = /Android/i.test(navigator.userAgent);
  const inStandalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return uaAndroid && inStandalone;
}

function isDesktopPWA() {
  try {
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    return standalone && !/Android/i.test(navigator.userAgent);
  } catch { return false; }
}

// One‑time printer setup helper (desktop PWA)
async function ensurePrinterConfigured() {
  const n = navigator;
  const hasUsb = n?.usb && (await n.usb.getDevices()).length > 0;
  const hasSerial = n?.serial && (await n.serial.getPorts()).length > 0;
  const hasRelay = !!localStorage.getItem('PRINT_RELAY_URL') && !!localStorage.getItem('PRINTER_IP');
  if (hasUsb || hasSerial || hasRelay) return true;
  try {
    await printUniversal({ text: 'TEST', allowPrompt: true, allowSystemDialog: false, codepage: 0 });
    localStorage.setItem('PRINTER_READY', '1');
    return true;
  } catch {
    return false;
  }
}

export default function KotPrint({ order, onClose, onPrint, autoPrint = true, kind = 'bill' }) {
  const [status, setStatus] = useState('');
  const [bill, setBill] = useState(null);
  const [restaurantProfile, setRestaurantProfile] = useState(order?._profile || null);
  const [loadingData, setLoadingData] = useState(true);
  const ranRef = useRef(false);
  const lockRef = useRef(false);

  // Load bill + restaurant profile on mount
  useEffect(() => {
  let alive = true;
  (async () => {
    try {
      if (restaurantProfile) {
        // already have profile from orchestrator; nothing to fetch
        return;
      }
      const supabase = getSupabase();
      const [b, rp, rn] = await Promise.all([
        supabase.from('bills').select('*').eq('order_id', order.id).maybeSingle(),
        supabase
          .from('restaurant_profiles')
          .select(
            'shipping_address_line1,shipping_address_line2,shipping_city,shipping_state,shipping_pincode,phone,restaurant_name,shipping_phone'
          )
          .eq('restaurant_id', order.restaurant_id)
          .maybeSingle(),
        supabase.from('restaurants').select('name').eq('id', order.restaurant_id).maybeSingle()
      ]);
      if (!alive) return;
      if (b?.data) setBill(b.data);
      if (rp?.data) setRestaurantProfile(rp.data);
      if (rn?.data?.name) order.restaurant_name = rn.data.name;
    } finally {
      if (alive) setLoadingData(false);
    }
  })();
  return () => {
    alive = false;
  };
}, [order, restaurantProfile]);


  const doPrint = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;

const text =
  kind === 'kot'
    ? buildKotText(order, restaurantProfile)
    : buildReceiptText(order, bill, restaurantProfile);
    const onAndroidPWA = isAndroidPWA();
    const onNativeAndroid = isNativeAndroid();
    const onDesktopStandalone = isDesktopPWA();

    let cols = 32;
    try {
    const raw = window.localStorage.getItem('PRINT_WIDTH_COLS') || '';
    const n = Number(raw) || 0;
    if (n > 0) cols = n;
    } catch {}
    const scale = cols >= 40 ? 'large' : 'normal';

    try {
      // 1) Android PWA: deep‑link immediately under user gesture
      if (onAndroidPWA) {
        try {
          openThermerWithText(text);
          onPrint?.();
        } catch {
          try {
            openRawBTWithText(text);
            onPrint?.();
          } catch {
            // fall through to share/download
          }
        }
        return;
      }

      // 2) Other platforms: use silent transports via printUniversal
      const allowSystemDialog = onNativeAndroid ? false : (onDesktopStandalone ? false : true);
      await printUniversal({
        text,
        relayUrl: localStorage.getItem('PRINT_RELAY_URL') || undefined,
        ip: localStorage.getItem('PRINTER_IP') || undefined,
        port: Number(localStorage.getItem('PRINTER_PORT') || 9100),
        codepage: 0,
        allowPrompt: false,
        allowSystemDialog,
        scale          
      });
      onPrint?.();
      onClose?.();
      return;
    } catch {
      // 3) Last resort anywhere: share / download plain text bill
      try {
        await downloadTextAndShare(order, bill, restaurantProfile);
        onPrint?.();
      } catch {
        setStatus('✗ Printing failed');
      }
    } finally {
      setTimeout(() => {
        lockRef.current = false;
      }, 600);
    }
  }, [order, bill, restaurantProfile, onPrint, onClose]);

  // Auto‑run (foreground or global orchestrator) once data is ready
  useEffect(() => {
  if (!autoPrint || !order || loadingData) return;

  const id = order.id;
  if (!id) return;

  // If we already printed this kind for this order recently, skip.
  if (hasPrintedRecently(id, kind)) {
    return;
  }

  markPrinted(id, kind);

  // Local guard to avoid double calls inside the same component instance
  if (ranRef.current) return;
  ranRef.current = true;

  doPrint();
}, [autoPrint, loadingData, order, kind, doPrint]);


  // Android PWA explicit modal
  if (isAndroidPWA()) {
    const amount = Number(
      bill?.grand_total ?? bill?.total_inc_tax ?? order?.total_inc_tax ?? order?.total ?? 0
    );
    useEffect(() => {
      const onKey = ev => {
        if (ev.key === 'Escape') onClose?.();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
      <div className="pwa-print-backdrop">
        <div className="pwa-print-card" role="dialog" aria-modal="true">
          <div className="pwa-print-head">
            <h3>Print Bill / KOT</h3>
            <button className="x" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="pwa-preview">
            <pre>{`Order: #${(order?.id || '').slice(0, 8).toUpperCase()}
Type: ${getOrderTypeLabelLocal(order)}
Amount: ₹${amount.toFixed(2)}`}</pre>
          </div>
          {status ? (
            <div className={`note ${status.includes('✗') ? 'err' : 'ok'}`}>{status}</div>
          ) : null}
          <button className="primary" type="button" onClick={doPrint}>
            🖨️ Print via Thermer
          </button>
        </div>
      </div>
    );
  }

  // When desktop PWA and no saved printer, show one‑time setup nudge
  if (isDesktopPWA() && !localStorage.getItem('PRINTER_READY')) {
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

  // For non‑Android web: show a tiny status modal only if something went wrong
  if (autoPrint && !status) return null;

  return (
    <div className="kot-overlay">
      <div className="kot-modal">
        <div className="kot-header">
          <h2>Print Bill / KOT</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        {status && (
          <div className={`status ${status.includes('✗') ? 'error' : 'success'}`}>{status}</div>
        )}
      </div>
    </div>
  );
}
