// components/KotPrint.js
import React, { useState, useEffect, useCallback } from 'react';
import { buildReceiptText } from '../utils/printUtils';
import { getSupabase } from '../services/supabase';
import { printUniversal } from '../utils/printGateway';

export default function KotPrint({ order, onClose, onPrint, autoPrint = true }) {
  const [status, setStatus] = useState('');
  const [bill, setBill] = useState(null);
  const [restaurantProfile, setRestaurantProfile] = useState(null);
  const [loadingData, setLoadingData] = useState(true);

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
      } finally {
        setLoadingData(false);
      }
    })();
  }, [order]);

  const doSilentPrint = useCallback(async () => {
    try {
      const text = buildReceiptText(order, bill, restaurantProfile);
      // Optional: hints from settings/localStorage
      const relayUrl = localStorage.getItem('PRINT_RELAY_URL') || undefined;
      const ip = localStorage.getItem('PRINTER_IP') || undefined;
      const port = Number(localStorage.getItem('PRINTER_PORT') || 9100);

      await printUniversal({
        text,
        // optional USB VID/PID if you know them; otherwise the gateway will prompt once for pairing
        vendorId: undefined,
        productId: undefined,
        relayUrl,
        ip,
        port,
        codepage: 0
      });
      onPrint?.();
      onClose?.(); // close immediately on success
    } catch (e) {
      setStatus(`✗ ${e.message}`);
      // leave a small toast or keep modal only on error
    }
  }, [order, bill, restaurantProfile, onPrint, onClose]);

  // Auto‑run when ready
  useEffect(() => {
    if (!autoPrint || loadingData) return;
    doSilentPrint();
  }, [autoPrint, loadingData, doSilentPrint]);

  // Hide the popup entirely during silent mode unless there is an error
  if (autoPrint && !status) return null;

  // Fallback small modal only when an error occurs or when autoPrint is false
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
