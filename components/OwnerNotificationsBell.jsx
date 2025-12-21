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
    } catch (e) { }
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
        className={pendingCount > 0 ? 'bell-ringing' : ''}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s ease'
        }}
        onClick={() => setIsOpen((v) => !v)}
      >
        <div className="bell-icon-wrapper">
          <FaBell size={26} color={pendingCount > 0 ? "#ef4444" : "#64748b"} />
        </div>
        {pendingCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -2,
            right: -2,
            minWidth: 20,
            height: 20,
            background: '#ef4444',
            color: '#fff',
            borderRadius: '50%',
            fontWeight: 700,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
            border: '2px solid #fff',
            animation: 'pulse 2s infinite'
          }}>
            {pendingCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          right: -10,
          top: 45,
          minWidth: 320,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          zIndex: 1001,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
          animation: 'slideDown 0.2s ease-out'
        }}>
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #f1f5f9',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>Notifications</span>
            {pendingCount > 0 && (
              <span style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
                {pendingCount} New
              </span>
            )}
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {alerts.length === 0 ? (
              <div style={{ padding: '32px 16px', color: '#94a3b8', textAlign: 'center', fontSize: 14 }}>
                <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}>🔔</div>
                No notifications
              </div>
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
                      padding: '16px',
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      background: alert.status === 'pending' ? '#fff' : '#ffffff',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (alert.status !== 'pending') e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (alert.status !== 'pending') e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          background: '#fff7ed',
                          color: '#ea580c',
                          fontWeight: 700,
                          borderRadius: 6,
                          fontSize: 12,
                          padding: '4px 8px',
                          border: '1px solid #ffedd5'
                        }}>
                          {(Number(alert.table_number) === 0 || alert.message?.toLowerCase().includes('stock')) ? 'Low Stock' : `Table ${alert.table_number}`}
                        </span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                          {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {alert.status === 'pending' && (
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }}></div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 14, color: '#334155', fontWeight: 500, lineHeight: 1.4 }}>
                        {alert.message || (Number(alert.table_number) === 0 ? 'Low stock alert' : 'Staff assistance requested')}
                      </span>

                      {alert.status === 'pending' ? (
                        <button
                          style={{
                            background: '#10b981',
                            color: '#fff',
                            borderRadius: 8,
                            border: 'none',
                            padding: '6px 16px',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: ackLoading === alert.id ? 'not-allowed' : 'pointer',
                            opacity: ackLoading === alert.id ? 0.7 : 1,
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
                          }}
                          disabled={ackLoading === alert.id}
                          onClick={() => handleAck(alert.id)}
                        >
                          {ackLoading === alert.id ? '...' : 'Done'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Resolved</span>
                      )}
                    </div>
                  </div>
                ))}
          </div>
        </div>
      )
      }
      <style jsx>{`
        @keyframes swing {
          0% { transform: rotate(0deg); }
          20% { transform: rotate(15deg); }
          40% { transform: rotate(-10deg); }
          60% { transform: rotate(5deg); }
          80% { transform: rotate(-5deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .bell-ringing .bell-icon-wrapper {
          animation: swing 2s infinite ease-in-out;
          transform-origin: top center;
        }
      `}</style>
    </div >
  );
}
