// components/KotPrint.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { buildReceiptText, downloadTextAndShare } from '../utils/printUtils';
import { getSupabase } from '../services/supabase';
import { printUniversal } from '../utils/printGateway';
import { openThermerWithText, openRawBTWithText } from '../utils/thermer';

function isAndroidPWA() {
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
    (async () => {
      try {
        const supabase = getSupabase();
        const { data: billData } = await supabase.from('bills').select('*').eq('order_id', order.id).maybeSingle();
        if (billData) setBill(billData);
        const { data: profileData } = await supabase.from('restaurant_profiles').select('*').eq('restaurant_id', order.restaurant_id).maybeSingle();
        if (profileData) setRestaurantProfile(profileData);
        const { data: restaurantData } = await supabase.from('restaurants').select('name').eq('id', order.restaurant_id).maybeSingle();
        if (restaurantData?.name) order.restaurant_name = restaurantData.name;
      } finally { setLoadingData(false); }
    })();
  }, [order]);

  const doPrint = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;

    const text = buildReceiptText(order, bill, restaurantProfile);
    const onAndroidPWA = isAndroidPWA();

    try {
      // 1) Android PWA: deep‑link immediately under user gesture, then return
      if (onAndroidPWA) {
        try { openThermerWithText(text); onPrint?.(); } 
        catch { try { openRawBTWithText(text); onPrint?.(); } catch { /* fall through */ } }
        return; // do not await anything before this to preserve user activation
      }

      // 2) Other platforms: try silent transports
      await printUniversal({
        text,
        relayUrl: localStorage.getItem('PRINT_RELAY_URL') || undefined,
        ip: localStorage.getItem('PRINTER_IP') || undefined,
        port: Number(localStorage.getItem('PRINTER_PORT') || 9100),
        codepage: 0,
        allowPrompt: false,
        allowSystemDialog: true
      });
      onPrint?.(); onClose?.(); return;
    } catch {
      // 3) Last resort share/download anywhere
      try { await downloadTextAndShare(order, bill, restaurantProfile); onPrint?.(); }
      catch { setStatus('✗ Printing failed'); }
    } finally {
      setTimeout(() => { lockRef.current = false; }, 800);
    }
  }, [order, bill, restaurantProfile, onPrint, onClose]);

  // Auto‑run everywhere except Android PWA (needs user gesture for app‑link)
  useEffect(() => {
    if (!autoPrint || loadingData || ranRef.current || isAndroidPWA()) return;
    ranRef.current = true;
    doPrint();
  }, [autoPrint, loadingData, doPrint]);

  // Android PWA modal with a real tap target
  if (isAndroidPWA()) {
    return (
      <div className="kot-overlay">
        <div className="kot-modal">
          <div className="kot-header">
            <h2>Print Bill / KOT</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          {status && <div className={`status ${status.includes('✗') ? 'error' : 'success'}`}>{status}</div>}
          <button className="print-btn" type="button" onClick={doPrint}>Open printer app</button>
        </div>
      </div>
    );
  }

  if (autoPrint && !status) return null;
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
