import React, { useEffect, useState, useRef } from 'react';
import { FaBell } from 'react-icons/fa';
import { useRestaurant } from '../context/RestaurantContext';
import { getSupabase } from '../services/supabase';


export default function OwnerNotificationsBell() {
  const { restaurant } = useRestaurant();
  const restaurantId = restaurant?.id;
  const [alerts, setAlerts] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [ackLoading, setAckLoading] = useState(null);
  const dropdownRef = useRef(null);
  const channelRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const supabase = getSupabase();

  // Notification sound
  const playSound = () => {
    try {
      const beep = new Audio('/notification-sound.mp3');
      beep.play().catch(() => {
        // Autoplay blocked by browser - user needs to interact first
      });
    } catch (e) {}
  };

  // Get latest alerts from backend REST API
  const loadAlerts = async () => {
    if (!restaurantId) return;
    try {
      const res = await fetch(`/api/customeralert/get-notifications?restaurant_id=${restaurantId}`);
      if (!res.ok) return;
      const data = await res.json();
      setPendingCount(data.filter(a => a.status === 'pending').length);
      setAlerts(data || []);
    } catch (e) {
      console.error('Error loading alerts:', e);
    }
  };

  // Supabase Realtime Subscription for owner dashboard
  useEffect(() => {
    if (!restaurantId || !supabase) return;
    loadAlerts();

    const setupRealTimeSubscription = () => {
      // Clean up existing channel if any
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Create realtime channel for alert notifications
      const channelName = `alert-notifications-${restaurantId}-${Date.now()}`;
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'alert_notification',
            filter: `restaurant_id=eq.${restaurantId}`,
          },
          async (payload) => {
            try {
              const row = payload.new || payload.old;
              if (!row || row.restaurant_id !== restaurantId) return;
              
              // Handle INSERT events - new alert created
              if (payload.eventType === 'INSERT') {
                playSound();
                setAlerts(prev => {
                  if (prev.find(a => a.id === row.id)) return prev;
                  const updated = [row, ...prev].slice(0, 10);
                  setPendingCount(updated.filter(a => a.status === 'pending').length);
                  return updated;
                });
              }
              
              // Handle UPDATE events - alert status changed
              if (payload.eventType === 'UPDATE') {
                setAlerts(prev => {
                  const updated = prev.map(a => a.id === row.id ? row : a);
                  setPendingCount(updated.filter(a => a.status === 'pending').length);
                  return updated;
                });
              }

              // Handle DELETE events
              if (payload.eventType === 'DELETE') {
                setAlerts(prev => {
                  const updated = prev.filter(a => a.id !== row.id);
                  setPendingCount(updated.filter(a => a.status === 'pending').length);
                  return updated;
                });
              }
            } catch (error) {
              console.error('Error processing alert realtime event:', error);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            reconnectTimeoutRef.current = setTimeout(() => {
              setupRealTimeSubscription();
            }, 5000);
          } else if (status === 'TIMED_OUT') {
            reconnectTimeoutRef.current = setTimeout(() => {
              setupRealTimeSubscription();
            }, 3000);
          }
        });

      channelRef.current = channel;
    };

    setupRealTimeSubscription();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [restaurantId, supabase]);

  // Dropdown outside click handler
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Acknowledge handler: update via API
  const handleAck = async (alertId) => {
    setAckLoading(alertId);
    try {
      // Send update to database
      const response = await fetch('/api/customeralert/update-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId, status: 'acknowledged' }),
      });

      if (!response.ok) throw new Error('Failed to update alert');
      
      // Reload to get fresh top 10 (prioritizes pending over acknowledged)
      await loadAlerts();
    } catch (e) {
      console.error('Error acknowledging alert:', e);
      alert('Error acknowledging: ' + e.message);
    } finally {
      setAckLoading(null);
    }
  };

  // Complete UI: bell, badge, dropdown, alert actions
  return (
    <div style={{ position: 'relative', marginLeft: 20 }} ref={dropdownRef}>
      <button
        aria-label="Alerts"
        style={{
          background: '#fff',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          position: 'relative'
        }}
        onClick={() => setIsOpen((v) => !v)}
      >
        <FaBell size={28} color="#ef4444" />
        {pendingCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 22,
            height: 22,
            background: '#ef4444',
            color: '#fff',
            borderRadius: '50%',
            fontWeight: 700,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px #ef444444'
          }}>
            {pendingCount}
          </span>
        )}
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 38,
          minWidth: 295,
          maxWidth: 390,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          zIndex: 1001,
          boxShadow: '0 14px 32px -8px #3730a322',
          padding: '8px 6px',
          maxHeight: 480,
          overflowY: 'auto'
        }}>
          <div style={{ fontWeight: 700, padding: '5px 10px', borderBottom: '1px solid #f3f4f6', color: '#db2777' }}>
            Latest Service Calls
          </div>
          {alerts.length === 0 ? (
            <div style={{ padding: '14px 8px', color: '#737373', textAlign: 'center', fontSize: 14 }}>No requests</div>
          ) :
            [...alerts]
              .sort((a, b) => {
                if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
                return new Date(b.created_at) - new Date(a.created_at);
              })
              .map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: '10px 9px',
                    borderBottom: '1px solid #f3f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    opacity: alert.status === 'acknowledged' ? 0.45 : 1,
                    filter: alert.status === 'acknowledged' ? 'grayscale(0.55)' : 'none',
                    background: alert.status === 'pending' ? '#fff' : '#f7fafc'
                  }}
                >
                  <span style={{
                    background: alert.status === 'pending' ? '#fde68a' : '#e5e7eb',
                    color: alert.status === 'pending' ? '#78350f' : '#737373',
                    fontWeight: 600,
                    borderRadius: 12,
                    fontSize: 13,
                    padding: '3px 11px'
                  }}>
                    Table {alert.table_number}
                  </span>
                  <span style={{ fontSize: 13, color: '#6b7280', flex: 1 }}>
                    {alert.message || "Staff called"}
                  </span>
                  <span style={{ fontSize: 11, color: '#737373', opacity: 0.7 }}>
                    {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {alert.status === 'pending' && (
                    <button
                      style={{
                        background: '#10b981',
                        color: '#fff',
                        borderRadius: 8,
                        border: 'none',
                        padding: '6px 13px',
                        fontWeight: 700,
                        fontSize: 13,
                        marginLeft: 8,
                        cursor: ackLoading === alert.id ? 'not-allowed' : 'pointer',
                        opacity: ackLoading === alert.id ? 0.6 : 1,
                        transition: 'opacity 0.18s'
                      }}
                      disabled={ackLoading === alert.id}
                      onClick={() => handleAck(alert.id)}
                    >
                      {ackLoading === alert.id ? '...' : 'Acknowledge'}
                    </button>
                  )}
                </div>
              ))}
        </div>
      )}
    </div>
  );
}
