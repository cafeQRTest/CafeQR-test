// components/KotPrint.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { buildReceiptText, downloadTextAndShare } from '../utils/printUtils';
import { getSupabase } from '../services/supabase';
import { printUniversal } from '../utils/printGateway';
import { openThermerWithText } from '../utils/thermer';

export default function KotPrint({ order, onClose, onPrint, autoPrint = true }) {
  const [status, setStatus] = useState('');
  const [bill, setBill] = useState(null);
  const [restaurantProfile, setRestaurantProfile] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const ranRef = useRef(false);                 // one‑shot guard (dev StrictMode)
  const lockRef = useRef(false);                // local lock

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

  const doSilentPrint = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    const text = buildReceiptText(order, bill, restaurantProfile);

    try {
      // Silent: do NOT prompt (allowPrompt: false)
      const relayUrl = localStorage.getItem('PRINT_RELAY_URL') || undefined;
      const ip = localStorage.getItem('PRINTER_IP') || undefined;
      const port = Number(localStorage.getItem('PRINTER_PORT') || 9100);
      await printUniversal({ text, relayUrl, ip, port, codepage: 0, allowPrompt: false });
      onPrint?.();
      onClose?.();
      return;
    } catch {
      // Android browser fallback: Thermer deep‑link
      try {
        openThermerWithText(text);
        setTimeout(() => {}, 300);
        return;
      } catch {
        // Last resort: share/download
        try {
          await downloadTextAndShare(order, bill, restaurantProfile);
          onPrint?.();
        } catch {
          setStatus('✗ Printing failed');
        }
      }
    } finally {
      setTimeout(() => { lockRef.current = false; }, 800);
    }
  }, [order, bill, restaurantProfile, onPrint, onClose]);

  useEffect(() => {
    if (!autoPrint || loadingData || ranRef.current) return;
    ranRef.current = true;             // prevents StrictMode double‑mount from re‑running
    doSilentPrint();
  }, [autoPrint, loadingData, doSilentPrint]);

  if (autoPrint && !status) return null;

  return (
    <div className="kot-overlay">
      <div className="kot-modal">
        <div className="kot-header">
          <h2>Print Bill / KOT</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        {status ? <div className={`status ${status.includes('✗') ? 'error' : 'success'}`}>{status}</div> : null}
      </div>
    </div>
  );
}
