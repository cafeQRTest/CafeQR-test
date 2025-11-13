// components/KotPrint.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { buildReceiptText, downloadTextAndShare } from '../utils/printUtils';
import { getSupabase } from '../services/supabase';
import { printUniversal } from '../utils/printGateway';
import { openThermerWithText, openRawBTWithText } from '../utils/thermer';
import { Capacitor } from '@capacitor/core'; // +++


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

export default function KotPrint({ order, onClose, onPrint, autoPrint = true }) {
  const [status, setStatus] = useState('');
  const [bill, setBill] = useState(null);
  const [restaurantProfile, setRestaurantProfile] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const ranRef = useRef(false);
  const lockRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
      const supabase = getSupabase();
      const [b, rp, rn] = await Promise.all([
        supabase.from('bills').select('*').eq('order_id', order.id).maybeSingle(),
        supabase.from('restaurant_profiles').select('shipping_address_line1,shipping_address_line2,shipping_city,shipping_state,shipping_pincode,phone,restaurant_name,shipping_phone').eq('restaurant_id', order.restaurant_id).maybeSingle(),
        supabase.from('restaurants').select('name').eq('id', order.restaurant_id).maybeSingle(),
      ]);
      if (!alive) return;
      if (b?.data) setBill(b.data);
      if (rp?.data) setRestaurantProfile(rp.data);
      if (rn?.data?.name) order.restaurant_name = rn.data.name;
    } finally {
      setLoadingData(false);
    }
  })();
  return () => { alive = false; };
}, [order]);

async function ensurePrinterConfigured() {
  const n = navigator;
  const hasUsb = n?.usb && (await n.usb.getDevices()).length > 0;
  const hasSerial = n?.serial && (await n.serial.getPorts()).length > 0;
  const hasRelay = !!localStorage.getItem('PRINT_RELAY_URL') && !!localStorage.getItem('PRINTER_IP');
  if (hasUsb || hasSerial || hasRelay) return true;
  // Prompt once under user gesture
  try {
    await printUniversal({ text: 'TEST', allowPrompt: true, allowSystemDialog: false, codepage: 0 });
    localStorage.setItem('PRINTER_READY', '1');
    return true;
  } catch { return false; }
}


function isDesktopPWA() {
  try {
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    return standalone && !/Android/i.test(navigator.userAgent);
  } catch { return false; }
}

  const doPrint = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    const text = buildReceiptText(order, bill, restaurantProfile);
    const onAndroidPWA = isAndroidPWA();
    const onNativeAndroid = isNativeAndroid();
    const onDesktopStandalone = isDesktopPWA();

    

    try {
      // 1) Android PWA: deep‑link immediately under user gesture, then return
      if (onAndroidPWA) {
        try { openThermerWithText(text); onPrint?.(); } 
        catch { try { openRawBTWithText(text); onPrint?.(); } catch { /* fall through */ } }
        return; // do not await anything before this to preserve user activation
      }

      // 2) Other platforms: try silent transports
      const allowSystemDialog = onNativeAndroid ? false : (onDesktopStandalone ? false : true);
      await printUniversal({
         text,
         relayUrl: localStorage.getItem('PRINT_RELAY_URL') || undefined,
         ip: localStorage.getItem('PRINTER_IP') || undefined,
         port: Number(localStorage.getItem('PRINTER_PORT') || 9100),
         codepage: 0,
         allowPrompt: false,
        allowSystemDialog
      });
      onPrint?.(); onClose?.(); return;
    } catch {
      // 3) Last resort share/download anywhere
      try { await downloadTextAndShare(order, bill, restaurantProfile); onPrint?.(); }
      catch { setStatus('✗ Printing failed'); }
    } finally {
      setTimeout(() => { lockRef.current = false; }, 600);
    }
  }, [order, bill, restaurantProfile, onPrint, onClose]);

  // Auto‑run everywhere except Android PWA (needs user gesture for app‑link)
  useEffect(() => {
  if (!autoPrint || ranRef.current || loadingData) return;
  ranRef.current = true;
  doPrint();
}, [autoPrint, loadingData, doPrint]);

  // Android PWA modal with a real tap target
  // components/KotPrint.js (replace the isAndroidPWA() render block)
if (isAndroidPWA()) {
  const amount = Number(
    (bill?.grand_total ?? bill?.total_inc_tax ?? order?.total_inc_tax ?? order?.total ?? 0)
  );
  const onBackdrop = (e) => { if (e.target === e.currentTarget) onClose?.(); };
  useEffect(() => {
    const onKey = (ev) => { if (ev.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="pwa-print-backdrop">
      <div className="pwa-print-card" role="dialog" aria-modal="true">
        <div className="pwa-print-head">
          <h3>Print Bill / KOT</h3>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="pwa-preview">
          <pre>{`Order: #${(order?.id || '').slice(0,8).toUpperCase()}
Type: ${getOrderTypeLabelLocal(order)}
Amount: ₹${amount.toFixed(2)}`}</pre>
        </div>
        {status ? (<div className={`note ${status.includes('✗') ? 'err' : 'ok'}`}>{status}</div>) : null}
        <button className="primary" type="button" onClick={doPrint}>🖨️ Print via Thermer</button>
      </div>
      <style jsx>{`
        .pwa-print-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:10000}
        .pwa-print-card{background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);width:92%;max-width:420px;padding:16px}
        .pwa-print-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        h3{margin:0;font-size:18px}
        .x{border:none;background:transparent;font-size:22px;line-height:1;cursor:pointer}
        .pwa-preview{border:2px dashed #bbb;border-radius:8px;padding:10px;margin:8px 0 12px 0;background:#fafafa}
        .pwa-preview pre{margin:0;font:14px/1.3 Menlo,Consolas,monospace;white-space:pre-wrap}
        .note{margin:8px 0;padding:8px;border-radius:6px;text-align:center;font-size:13px}
        .note.ok{background:#e7f7ee;color:#0f6f44}
        .note.err{background:#fde8ea;color:#9f1c2b}
        .primary{width:100%;padding:12px 14px;border:0;border-radius:8px;background:#10b981;color:#fff;font-weight:600;font-size:15px}
        .primary:active{transform:translateY(1px)}
      `}</style>
    </div>
  );
}


if (autoPrint && !status) return null;

// When desktop PWA and no saved printer, show a tiny setup nudge
if (isDesktopPWA() && !localStorage.getItem('PRINTER_READY')) {
  return (
    <div className="kot-overlay">
      <div className="kot-modal">
        <div className="kot-header"><h2>Printer setup</h2></div>
       <p>Select your USB/Serial/Network printer once to enable silent printing.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" onClick={async () => { 
            const ok = await ensurePrinterConfigured(); 
            setStatus(ok ? '✓ Printer saved' : '✗ Setup cancelled');
            if (ok) { await doPrint(); }
          }}>Select printer</button>
          <button onClick={onClose}>Skip</button>
        </div>
      </div>
    </div>
  );
}
  return (
    <div className="kot-overlay">
      <div className="kot-modal">
        <div className="kot-header">
          <h2>Print Bill / KOT</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        {status && <div className={`status ${status.includes('✗') ? 'error' : 'success'}`}>{status}</div>}
      </div>
    </div>
  );
}
