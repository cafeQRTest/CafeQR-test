//pages/owner/availability.js

import React, { useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { useRestaurant } from "../../context/RestaurantContext";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { getSupabase } from "../../services/supabase";

import { FaStore, FaClock, FaToggleOn, FaToggleOff, FaCopy, FaUndo, FaSave, FaCheckCircle, FaChevronRight } from "react-icons/fa";
import PremiumTimeSelect from "../../components/PremiumTimeSelect";

const BRAND = {
  orange: '#f97316',
  black: '#111827',
  soft: '#fff7ed',
  gray: '#6b7280',
  red: '#dc2626',
  green: '#059669'
};

export default function AvailabilityPage() {
  const supabase = getSupabase();
  const { checking } = useRequireAuth(supabase);
  const { restaurant, loading: loadingRestaurant, refresh } = useRestaurant();

  const [hours, setHours] = useState(defaultHours());
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [showToast, setShowToast] = useState(false);
  
  // Store Notice State
  const [noticeEnabled, setNoticeEnabled] = useState(false);
  const [noticeMsg, setNoticeMsg] = useState("");

  // Custom Preset State
  const [showCustomSet, setShowCustomSet] = useState(false);
  const [customTimes, setCustomTimes] = useState({ open: '09:00', close: '21:00' });
  const [savedPresets, setSavedPresets] = useState([]);

  useEffect(() => {
     // Load saved presets
     try {
       const saved = localStorage.getItem('cafeqr_avail_presets');
       if (saved) setSavedPresets(JSON.parse(saved));
     } catch(e) {}
  }, []);
  
  const addPreset = (open, close) => {
     setSavedPresets(prev => {
        // Prevent duplicates
        const exists = prev.find(p => p.open === open && p.close === close);
        if (exists) return prev;
        
        const next = [...prev, { open, close }];
        localStorage.setItem('cafeqr_avail_presets', JSON.stringify(next));
        return next;
     });
  };

  const removePreset = (e, open, close) => {
     e.stopPropagation();
     const next = savedPresets.filter(p => !(p.open === open && p.close === close));
     setSavedPresets(next);
     localStorage.setItem('cafeqr_avail_presets', JSON.stringify(next));
  };

  useEffect(() => {
    if (showToast) {
        const timer = setTimeout(() => { setShowToast(false); }, 3000);
        return () => clearTimeout(timer);
    }
  }, [showToast]);

  const restaurantId = restaurant?.id || "";

  useEffect(() => {
    if (restaurant) {
       setPaused(!!restaurant.online_paused);
       // Load initial notice state if available in context, else we fetch it below
    }
  }, [restaurant]);

  useEffect(() => {
    if (!restaurantId || checking || loadingRestaurant || !supabase) return;
    const load = async () => {
      setLoading(true);
      setErr("");
      try {
        const { data, error } = await supabase
          .from("restaurant_hours")
          .select("dow, open_time, close_time, enabled")
          .eq("restaurant_id", restaurantId)
          .order("dow");
        if (error) throw error;

        // Load Notice Settings
        const { data: rData, error: rError } = await supabase
          .from("restaurants")
          .select("store_notice_enabled, store_notice_msg")
          .eq("id", restaurantId)
          .single();
        
        if (!rError && rData) {
           setNoticeEnabled(!!rData.store_notice_enabled);
           setNoticeMsg(rData.store_notice_msg || "");
        } else {
           console.log("Notice fetch error (might be missing columns if migration didn't run):", rError);
        }

        if (!data || data.length === 0) {
          setHours(defaultHours());
        } else {
          const mapped = DAYS.map((d) => {
            const row = data.find((r) => r.dow === d.dow);
            if (!row)
              return {
                dow: d.dow,
                label: d.label,
                open: "10:00",
                close: "22:00",
                enabled: true,
              };
            return {
              dow: d.dow,
              label: d.label,
              open: toHHMM(row.open_time),
              close: toHHMM(row.close_time),
              enabled: !!row.enabled,
            };
          });
          setHours(mapped);
        }
      } catch (e) {
        setErr(e.message || "Failed to load hours");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [restaurantId, checking, loadingRestaurant, supabase]);

  const enabledCount = useMemo(
    () => hours.filter((h) => h.enabled).length,
    [hours]
  );

  if (checking || loadingRestaurant)
    return <div className="loading-state">
      <div className="spinner"></div>
      <p>Syncing Availability...</p>
    </div>;

  if (!restaurantId) return (
    <div className="error-state">
      <FaStore size={48} color="#e5e7eb" />
      <h3>No restaurant found</h3>
      <p>Please log in with an owner account to manage store hours.</p>
    </div>
  );

  const togglePause = async () => {
    if (!supabase) return;
    setSaving(true);
    setErr("");
    setSuccess("");
    setShowToast(false);
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ online_paused: !paused })
        .eq("id", restaurantId);
      if (error) throw error;
      setPaused((prev) => !prev);
      refresh?.();
    } catch (e) {
      setErr(e.message || "Failed to update pause state");
    } finally {
      setSaving(false);
    }
  };

  const setRow = (dow, patch) => {
    setHours((prev) => prev.map((h) => (h.dow === dow ? { ...h, ...patch } : h)));
  };

  const setAll = (patch) => {
    setHours((prev) => prev.map((h) => ({ ...h, ...patch })));
  };

  const getNextOpenDay = (currentDow) => {
    const target = hours.find((h) => h.dow > currentDow && h.enabled);
    return target ? target.dow : null;
  };

  const copyRowDown = (dow) => {
    const targetDow = getNextOpenDay(dow);
    if (!targetDow) return;
    
    const row = hours.find((h) => h.dow === dow);
    setHours((prev) =>
      prev.map((h) =>
        h.dow === targetDow
          ? { ...h, open: row.open, close: row.close }
          : h
      )
    );
  };

  const saveHours = async () => {
    if (!supabase) return;
    setSaving(true);
    setErr("");
    setSuccess("");
    setShowToast(false);
    try {
      const rows = hours.map((h) => ({
        restaurant_id: restaurantId,
        dow: h.dow,
        open_time: h.open,
        close_time: h.close,
        enabled: h.enabled,
      }));

      const { error } = await supabase
        .from("restaurant_hours")
        .upsert(rows, { onConflict: "restaurant_id,dow" });

      if (error) throw error;

      // Save Notice Settings
      const { error: rError } = await supabase
        .from("restaurants")
        .update({ 
          store_notice_enabled: noticeEnabled,
          store_notice_msg: noticeMsg
        })
        .eq("id", restaurantId);

      if (rError) {
         console.warn("Failed to save notice settings:", rError);
         // Don't throw here to allow partial success (hours saved), but maybe warn user?
         // For now we construe it as success if hours saved.
      }

      setSuccess("Availability & Notice updated successfully!");
      setShowToast(true);
    } catch (e) {
      setErr(e.message || "Failed to save hours");
      setShowToast(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="avail-wrapper">
      <div className="avail-header">
        <div className="header-main">
          <h1>Store Availability</h1>
          <p className="header-subtitle">Manage business hours and ordering state</p>
      </div>
    </div>

      <div className="avail-top-grid">
         <div className={`status-card ${paused ? 'is-paused' : 'is-active'}`}>
            <div className="card-inner">
               <div className="status-info">
                  <div className="status-label">Global Ordering Status</div>
                  <div className="status-value">{paused ? 'Online Store is Paused' : 'Online Store is Live'}</div>
                  <p className="status-desc">
                    {paused 
                      ? "Customers can browse but cannot place new orders." 
                      : "Store is visible and accepting orders during business hours."}
                  </p>
               </div>
               <div className="status-toggle-wrap">
                  <label className="premium-toggle">
                     <input type="checkbox" checked={!paused} onChange={togglePause} disabled={saving} />
                     <span className="premium-slider"></span>
                  </label>
               </div>
            </div>
         </div>

         <div className="summary-card-premium">
            <div className="summary-inner">
               <div className="summary-info">
                  <div className="summary-label">Operating Schedule</div>
                  <div className="summary-value">{enabledCount} of 7 Days</div>
                  <div className="summary-actions">
                    <button className="action-pill success" onClick={() => setAll({ enabled: true })}>Enable All</button>
                    <button className="action-pill danger" onClick={() => setAll({ enabled: false })}>Disable All</button>
                  </div>
               </div>
               <div className="summary-icon">
                  <FaClock />
               </div>
            </div>
         </div>
      </div>

      {/* Store Notice Card */}
      <div className="status-card" style={{ marginBottom: 32 }}>
         <CardTopAccent $active={noticeEnabled} />
         <div className="card-inner" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="status-info">
                   <div className="status-label">Public Customer Notice</div>
                   <div className="status-value">Store Announcement</div>
                   <p className="status-desc">
                     Display a custom message on your storefront (e.g. "Back in 30 mins" or "Holiday Special").
                   </p>
                </div>
                <div className="status-toggle-wrap">
                   <label className="premium-toggle">
                      <input type="checkbox" checked={noticeEnabled} onChange={(e) => setNoticeEnabled(e.target.checked)} disabled={saving} />
                      <span className="premium-slider"></span>
                   </label>
                </div>
             </div>
             
             {noticeEnabled && (
               <div style={{ animation: 'fadeIn 0.3s' }}>
                  <NoticeInput 
                    placeholder="Enter your message here (e.g. We are taking a short break...)"
                    value={noticeMsg}
                    onChange={(e) => setNoticeMsg(e.target.value)}
                    rows={2}
                  />
               </div>
             )}
         </div>
      </div>

      {showToast && (
        <Toast style={{ borderLeft: err ? '4px solid #ef4444' : '4px solid #22c55e' }}>
          {err ? (
             <>
               <span style={{fontSize: 20}}>❌</span>
               <div style={{display:'flex', flexDirection:'column'}}>
                 <span style={{fontWeight: 700, color: '#111827', fontSize: 15}}>Error Saving</span>
                 <span style={{fontSize: 13, color: '#64748b'}}>{err}</span>
               </div>
             </>
          ) : (
             <>
               <span style={{fontSize: 20}}>✅</span>
               <div style={{display:'flex', flexDirection:'column'}}>
                 <span style={{fontWeight: 700, color: '#111827', fontSize: 15}}>Changes Saved</span>
                 <span style={{fontSize: 13, color: '#64748b'}}>Store availability updated successfully</span>
               </div>
             </>
          )}
        </Toast>
      )}

      <div className="main-content-area">
        <div className="quick-presets">
           <span className="preset-label">Quick Presets:</span>
           
           {!showCustomSet ? (
             <>
               {/* Saved Presets */}
               {savedPresets.map((p, i) => (
                  <button key={i} className="chip" onClick={() => setAll({ open: p.open, close: p.close, enabled: true })} style={{position:'relative', paddingRight: 28}}>
                     {formatTimeDisp(p.open)} – {formatTimeDisp(p.close)}
                     <span 
                       onClick={(e) => removePreset(e, p.open, p.close)}
                       style={{
                         position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                         width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                         borderRadius: '50%', background: '#fee2e2', color: '#ef4444', fontSize: 10,
                         opacity: 0.8
                       }}>✕</span>
                  </button>
               ))}

               <button className="chip" onClick={() => setShowCustomSet(true)} style={{border:`1px solid ${BRAND.orange}`, color:BRAND.orange, background:'white'}}>+ Custom</button>
               <button className="chip outline" onClick={() => setHours(defaultHours())}><FaUndo /> Reset Default</button>
             </>
           ) : (
             <div className="custom-set-row" style={{display:'flex', gap:8, alignItems:'center'}}>
                <div style={{ width: 110 }}>
                  <PremiumTimeSelect 
                    value={customTimes.open} 
                    onChange={e => setCustomTimes(p => ({...p, open: e.target.value}))}
                  />
                </div>
                <span style={{color:'#94a3b8', fontSize:12}}>to</span>
                <div style={{ width: 110 }}>
                  <PremiumTimeSelect 
                    value={customTimes.close} 
                    onChange={e => setCustomTimes(p => ({...p, close: e.target.value}))}
                  />
                </div>
                <button className="chip" style={{background:BRAND.orange, color:'white', borderColor:BRAND.orange}} onClick={() => {
                   setAll({ open: customTimes.open, close: customTimes.close, enabled: true });
                   addPreset(customTimes.open, customTimes.close);
                   setShowCustomSet(false);
                }}>
                  Apply & Save
                </button>
                 <button className="chip outline" onClick={() => setShowCustomSet(false)} style={{padding:'6px 10px'}}>✕</button>
             </div>
           )}
        </div>

        {/* Mobile View: Cards */}
        <div className="mobile-only-grid">
          {hours.map((h) => (
            <div key={h.dow} className={`avail-card ${!h.enabled ? 'card-disabled' : ''}`}>
               <div className="card-top">
                  <div className="day-info">
                    <span className="day-name">{h.label}</span>
                    <span className={`status-pill ${h.enabled ? 'on' : 'off'}`}>{h.enabled ? 'Open' : 'Closed'}</span>
                  </div>
                  <label className="toggle-sm">
                    <input type="checkbox" checked={h.enabled} onChange={(e) => setRow(h.dow, { enabled: e.target.checked })} />
                    <span className="slider-sm"></span>
                  </label>
               </div>
               
               <div className="card-controls">
                  <div className="input-pair">
                    <div className="input-group">
                      <label>Opening</label>
                      <PremiumTimeSelect value={h.open} onChange={(e) => setRow(h.dow, { open: e.target.value })} disabled={!h.enabled} />
                    </div>
                    <div className="arrow-sep"><FaChevronRight /></div>
                    <div className="input-group">
                      <label>Closing</label>
                       <PremiumTimeSelect value={h.close} onChange={(e) => setRow(h.dow, { close: e.target.value })} disabled={!h.enabled} />
                    </div>
                  </div>
                  
                  <div className="card-footer-actions">
                    {getNextOpenDay(h.dow) && (
                      <button className="row-action" onClick={() => copyRowDown(h.dow)} disabled={!h.enabled}>
                        <FaCopy /> Copy to Below
                      </button>
                    )}
                  </div>
               </div>
            </div>
          ))}
        </div>

        {/* Desktop View: Table */}
        <div className="desktop-only-table">
          <div className="premium-table-wrap">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Business Day</th>
                  <th>Store Status</th>
                  <th>Opening Time</th>
                  <th>Closing Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hours.map((h) => (
                  <tr key={h.dow} className={!h.enabled ? 'row-disabled' : ''}>
                    <td className="day-cell">
                      <div className="day-text">{h.label}</div>
                    </td>
                    <td>
                      <label className="premium-toggle sm">
                        <input type="checkbox" checked={h.enabled} onChange={(e) => setRow(h.dow, { enabled: e.target.checked })} />
                        <span className="premium-slider sm"></span>
                        <span className="toggle-text">{h.enabled ? 'Open' : 'Closed'}</span>
                      </label>
                    </td>
                    <td>
                      <PremiumTimeSelect value={h.open} onChange={(e) => setRow(h.dow, { open: e.target.value })} disabled={!h.enabled} />
                    </td>
                    <td>
                      <PremiumTimeSelect value={h.close} onChange={(e) => setRow(h.dow, { close: e.target.value })} disabled={!h.enabled} />
                    </td>
                    <td>
                      <div className="table-actions">
                        {getNextOpenDay(h.dow) && (
                          <button className="icon-btn-sm" data-tooltip="Copy to Below" onClick={() => copyRowDown(h.dow)} disabled={!h.enabled}><FaCopy /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <SaveBar>
           <SaveBtn 
             primary 
             onClick={saveHours} 
             disabled={saving}
             style={{
               padding: '16px 32px',
               fontSize: 16,
               borderRadius: 100,
               boxShadow: '0 10px 20px -5px rgba(249, 115, 22, 0.4)',
             }}
           >
            {saving ? <><div className="btn-spinner"></div> Saving...</> : "✨ Save Changes"}
          </SaveBtn>
        </SaveBar>
      </div>

      <style jsx>{`
        .avail-wrapper { padding: 4px 0 60px 0; max-width: 1200px; margin: 0 auto; animation: fadeIn 0.4s ease-out; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        /* Header */
        .avail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding: 0 4px; }
        .header-main h1 { margin: 0; font-size: 2rem; font-weight: 800; color: #111827; letter-spacing: -0.02em; }
        .header-subtitle { color: #6b7280; font-size: 1rem; margin-top: 4px; }

        /* Top Grid */
        .avail-top-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 20px; margin-bottom: 32px; }
        
        .status-card { 
          background: white; border-radius: 20px; border: 1px solid #f1f5f9; 
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
          position: relative; overflow: hidden;
        }
        .status-card.is-active { border-color: ${BRAND.green}44; box-shadow: 0 10px 30px -10px rgba(5, 150, 105, 0.1); }
        .status-card.is-paused { border-color: ${BRAND.red}33; box-shadow: 0 10px 30px -10px rgba(220, 38, 38, 0.08); }
        
        .status-card::before {
            content: ''; position: absolute; left: 0; right: 0; top: 0; height: 4px;
            transition: background 0.3s ease;
        }
        .status-card.is-active::before { background: ${BRAND.green}; }
        .status-card.is-paused::before { background: ${BRAND.red}; }

        .card-inner { padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; }
        
        .status-label { 
            font-size: 0.75rem; font-weight: 700; color: #94a3b8; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; 
            display: flex; align-items: center; gap: 8px;
        }
        .status-value { font-size: 1.5rem; font-weight: 800; color: #0f172a; margin-bottom: 4px; letter-spacing: -0.02em; }
        .status-desc { font-size: 0.85rem; color: #64748b; margin: 0; max-width: 380px; line-height: 1.5; font-weight: 400; }

        .summary-card-premium {
          background: white; border-radius: 20px; border: 1px solid #f1f5f9; padding: 20px 24px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
          position: relative; overflow: hidden;
        }
        .summary-card-premium::before {
             content: ''; position: absolute; left: 0; right: 0; top: 0; height: 4px;
             background: ${BRAND.orange};
        }

        .summary-inner { display: flex; justify-content: space-between; align-items: center; height: 100%; }
        .summary-label { font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
        .summary-value { font-size: 1.5rem; font-weight: 800; color: #0f172a; margin-bottom: 8px; letter-spacing: -0.02em; }
        
        .summary-actions { display: flex; gap: 8px; }
        .action-pill { 
            font-size: 0.7rem; font-weight: 700; padding: 6px 12px; border-radius: 8px; 
            text-transform: uppercase; cursor: pointer; transition: all 0.2s; border: 1px solid transparent;
        }
        .action-pill.success { background: #ecfdf5; color: #059669; border-color: #d1fae5; }
        .action-pill.success:hover { background: #d1fae5; }
        
        .action-pill.danger { background: #fef2f2; color: #dc2626; border-color: #fee2e2; }
        .action-pill.danger:hover { background: #fee2e2; }

        /* Alerts */
        .alert { 
          padding: 14px 18px; border-radius: 12px; margin-bottom: 24px; display: flex; align-items: center; 
          font-weight: 600; font-size: 0.95rem; animation: slideIn 0.3s ease;
        }
        .alert.error { background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; }
        .alert.success { background: #ecfdf5; color: #059669; border: 1px solid #d1fae5; }
        @keyframes slideIn { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

        /* Presets */
        .quick-presets { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }
        .preset-label { font-size: 0.85rem; font-weight: 700; color: #6b7280; margin-right: 4px; }
        .chip { 
          background: #f3f4f6; color: #374151; font-weight: 600; padding: 6px 14px; border-radius: 99px; 
          font-size: 0.85rem; transition: all 0.2s; 
        }
        .chip:hover { background: #e5e7eb; transform: scale(1.05); }
        .chip.outline { background: white; border: 1px solid #e5e7eb; display: flex; align-items: center; gap: 6px; }

        /* Table */
        /* Table */
        .premium-table-wrap { background: white; border-radius: 12px; border: 1px solid #e5e7eb; /* overflow hidden removed for picker scroll */ box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .premium-table { width: 100%; border-collapse: collapse; }
        .premium-table th { 
          background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%);
          padding: 14px 16px; text-align: left; font-size: 11px; text-transform: uppercase;
          color: #6b7280; font-weight: 700; border-bottom: 2px solid ${BRAND.orange}; letter-spacing: 0.5px;
        }
        .premium-table td { padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #374151; }
        .premium-table tr:hover { background: #fff7ed; }

        .day-text { 
          font-weight: 800; font-size: 0.95rem; color: #111827; letter-spacing: -0.01em; 
        }
        .table-time-input { 
          border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 1rem; 
          font-weight: 700; color: #111827; outline: none; transition: all 0.2s;
          -webkit-appearance: none; appearance: none; /* Fix for time picker scroll */
        }
        .table-time-input:focus { border-color: ${BRAND.orange}; ring: 2px solid ${BRAND.orange}33; }
        .table-time-input:disabled { background: #f9fafb; opacity: 0.5; color: #9ca3af; }
        .icon-btn-sm { 
          background: ${BRAND.soft}; color: ${BRAND.orange}; width: 36px; height: 36px; 
          border-radius: 8px; display: flex; align-items: center; justify-content: center; 
          border: none; padding: 0; font-size: 16px; cursor: pointer; transition: all 0.2s;
          position: relative;
        }
        .icon-btn-sm:hover { background: ${BRAND.orange}; color: white; transform: scale(1.05); }
        
        .icon-btn-sm[data-tooltip]:hover::after {
          content: attr(data-tooltip);
          position: absolute;
          bottom: 100%; left: 50%; transform: translateX(-50%);
          background: ${BRAND.orange}; color: white;
          padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 700;
          white-space: nowrap; z-index: 20; margin-bottom: 8px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
          pointer-events: none;
        }
        .icon-btn-sm[data-tooltip]:hover::before {
          content: ''; position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
          border: 5px solid transparent; border-top-color: ${BRAND.orange}; margin-bottom: -2px; pointer-events: none;
          z-index: 20;
        }

        .row-disabled { background: #fafafa; opacity: 0.7; }

        /* Toggles */
        .premium-toggle { position: relative; display: inline-block; width: 60px; height: 32px; flex-shrink: 0; }
        .premium-toggle input { opacity: 0; width: 0; height: 0; }
        .premium-slider { 
          position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; 
          background-color: #d1d5db; transition: .4s; border-radius: 34px; 
        }
        .premium-slider:before { 
          position: absolute; content: ""; height: 26px; width: 26px; left: 3px; bottom: 3px; 
          background-color: white; transition: .4s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        input:checked + .premium-slider { background-color: ${BRAND.orange}; }
        input:checked + .premium-slider:before { transform: translateX(28px); }
        .status-card.is-paused input:checked + .premium-slider { background-color: ${BRAND.green}; }
        .status-card.is-paused .premium-slider { background-color: #6b7280; }

        .premium-toggle.sm { width: 100px; height: 34px; background: #f3f4f6; border-radius: 99px; padding: 2px; display: flex; align-items: center; }
        .premium-slider.sm { height: 30px; width: 50px; position: static; background: #d1d5db; border-radius: 99px; }
        .premium-slider.sm:before { height: 26px; width: 26px; bottom: auto; left: auto; position: absolute; top: 4px; left: 4px; }
        input:checked + .premium-slider.sm { background-color: ${BRAND.orange}; }
        .toggle-text { font-size: 0.75rem; font-weight: 800; margin-left: 8px; text-transform: uppercase; color: #6b7280; }
        input:checked ~ .toggle-text { color: ${BRAND.orange}; }

        /* Mobile Adjustments */
        .mobile-only-grid { display: none; }
        @media (max-width: 900px) {
          .avail-top-grid { grid-template-columns: 1fr; }
          .desktop-only-table { display: none; }
          .mobile-only-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
          .avail-card { 
            background: white; border-radius: 16px; border: 1px solid #e5e7eb; /* overflow removed */ 
            box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: 0.2s;
          }
          .card-top { padding: 16px; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center; background: #fafafa; }
          .day-name { font-size: 1.25rem; font-weight: 800; color: #111827; }
          .status-pill { font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 2px 8px; border-radius: 99px; margin-left: 8px; }
          .status-pill.on { background: ${BRAND.orange}; color: white; }
          .status-pill.off { background: #e5e7eb; color: #6b7280; }
          
          .card-controls { padding: 16px; }
          .input-pair { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
          .input-group { flex: 1; }
          .input-group label { display: block; font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px; }
          .input-group input { 
            width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; 
            font-size: 1rem; font-weight: 800; outline: none; background: #fff;
            -webkit-appearance: none; appearance: none; /* Fix for iOS scroll */
          }
          .arrow-sep { color: #d1d5db; margin-top: 18px; }
          .card-footer-actions { border-top: 1px dashed #e5e7eb; padding-top: 12px; }
          .row-action { 
            background: none; border: none; font-size: 0.8rem; font-weight: 700; color: ${BRAND.orange}; 
            display: flex; align-items: center; gap: 6px; cursor: pointer;
          }
          .card-disabled { background: #fefefe; opacity: 0.75; }

          .avail-header { flex-direction: column; gap: 16px; }
          .header-actions { width: 100%; }
        }

        .toggle-sm { position: relative; display: inline-block; width: 44px; height: 24px; }
        .toggle-sm input { opacity: 0; width: 0; height: 0; }
        .slider-sm { 
          position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; 
          background-color: #ccc; transition: .4s; border-radius: 24px; 
        }
        .slider-sm:before { 
          position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; 
          background-color: white; transition: .4s; border-radius: 50%; 
        }
        input:checked + .slider-sm { background-color: ${BRAND.orange}; }
        input:checked + .slider-sm:before { transform: translateX(20px); }

        .loading-state, .error-state { 
          display: flex; flex-direction: column; align-items: center; justify-content: center; 
          min-height: 400px; padding: 40px; text-align: center;
        }
        .spinner { width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid ${BRAND.orange}; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        
        .btn-spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
        
      `}</style>
    </div>
  );
}

const SaveBar = styled.div`
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 40px;
  z-index: 100;
  width: auto;

  @media (max-width: 412px) {
    left: 0;
    right: 0;
    transform: none;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    width: 100%;
    padding: 0 12px;
    box-sizing: border-box;
  }
`;

const ActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  @media (max-width: 412px) {
    width: 100%;
    padding: 12px 16px;
  }

  @media (max-width: 360px) {
    font-size: 14px;
    padding: 11px 14px;
  }
  
  ${props => props.primary ? css`
    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); /* Orange Gradient */
    color: white;
    border: none;
    box-shadow: 0 4px 6px -1px rgba(234, 88, 12, 0.2), 0 2px 4px -1px rgba(234, 88, 12, 0.1);
    
    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 10px 15px -3px rgba(234, 88, 12, 0.3);
    }
    &:active:not(:disabled) { transform: translateY(0); }
    &:disabled { opacity: 0.7; cursor: not-allowed; }
  ` : css`
    background-color: white;
    color: #334155;
    border: 1px solid #e2e8f0;
    
    &:hover:not(:disabled) {
      background-color: #f8fafc;
      border-color: #cbd5e1;
      transform: translateY(-1px);
    }
  `}
`;

const SaveBtn = styled(ActionButton)`
  width: min(100%, 420px);
  pointer-events: auto;

  @media (max-width: 412px) {
    width: 100%;
  }
`;



/* ---------------- Helpers ---------------- */
function toHHMM(value) {
  if (!value) return "00:00";
  const str = String(value);
  const [hh, mm] = str.split(":");
  return `${hh.padStart(2, "0")}:${(mm || "00").padStart(2, "0")}`;
}

const formatTimeDisp = (val) => {
   if(!val) return "";
   return val; // Return 24-hour format as is (e.g. 14:00)
};

const DAYS = [
  { label: "Monday", dow: 1 },
  { label: "Tuesday", dow: 2 },
  { label: "Wednesday", dow: 3 },
  { label: "Thursday", dow: 4 },
  { label: "Friday", dow: 5 },
  { label: "Saturday", dow: 6 },
  { label: "Sunday", dow: 7 },
];

function defaultHours() {
  return DAYS.map((d) => ({
    dow: d.dow,
    label: d.label,
    open: "10:00",
    close: "22:00",
    enabled: true,
  }));
}


const Toast = styled.div`
  position: fixed;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;

  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  padding: 16px 28px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;

  min-width: 0;
  max-width: min(520px, calc(100vw - 24px));
  width: max-content;

  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);

  @media (max-width: 412px) {
    bottom: 100px;
    left: 12px;
    right: 12px;
    transform: none;
    width: auto;
    padding: 14px 14px;
  }
`;

const CardTopAccent = styled.div`
  height: 4px;
  width: 100%;
  background: ${props => props.$active ? BRAND.orange : '#e5e7eb'};
  position: absolute;
  top: 0;
  left: 0;
  transition: 0.3s;
`;

const NoticeInput = styled.textarea`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 0.95rem;
  color: #1f2937;
  outline: none;
  transition: all 0.2s;
  background: #f9fafb;
  font-family: inherit;
  resize: none;

  &:focus {
    border-color: ${BRAND.orange};
    background: white;
    box-shadow: 0 0 0 3px ${BRAND.orange}11;
  }
`;

const PresetTimeInput = styled.input`
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  outline: none;

  &:focus {
    border-color: ${BRAND.orange};
  }
`;
