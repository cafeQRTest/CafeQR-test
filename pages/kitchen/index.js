// pages/kitchen/index.js
import React, { useEffect, useRef, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { getSupabase } from '../../services/supabase'

// Standardized helper for items display: copy from owner page
function toDisplayItems(order) {
  if (Array.isArray(order.items)) return order.items;
  if (Array.isArray(order.order_items)) {
    return order.order_items.map((oi) => ({
      name: oi.menu_items?.name || oi.item_name || 'Item',
      quantity: oi.quantity,
      price: oi.price,
    }));
  }
  return [];
}

// Label logic identical to owner page
function getOrderTypeLabel(order) {
  if (!order) return '';
  if (order.order_type === 'parcel') return 'Parcel';
  if (order.table_number) return `Table ${order.table_number}`;
  if (order.order_type === 'dine-in') return 'Dine-in';
  if (order.order_type === 'counter') return 'Counter';
  return '';
}

function KitchenOrderCard({ order, onStart }) {
  const items = toDisplayItems(order);

   return (
    <Card padding={12} style={{ 
      border: '1px solid #ddd', 
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <strong style={{ fontSize: '14px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          #{order.id.slice(0, 8)}
        </strong>
        <span style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>
          {getOrderTypeLabel(order)}
        </span>
      </div>
      <div style={{ marginBottom: 8, fontSize: 11, color: '#888' }}>
        {new Date(order.created_at).toLocaleTimeString()}
      </div>
      <div style={{ marginBottom: 10, flex: 1, fontSize: '13px' }}>
        {items.length === 0 ? (
          <div style={{ 
            fontSize: 12, 
            fontStyle: 'italic', 
            color: '#ff6b6b',
            padding: '6px',
            backgroundColor: '#ffe0e0',
            borderRadius: '4px',
            border: '1px solid #ffcccc'
          }}>
            ⚠️ Loading...
          </div>
        ) : (
          items.map((item, i) => (
            <div key={i} style={{ marginBottom: 3, overflow: 'hidden' }}>
              <strong>{item.quantity || 1}×</strong> {item.name}
              {item.price && (
                <span style={{ color: '#666', fontSize: 11, marginLeft: 4 }}>
                  ₹{item.price}
                </span>
              )}
            </div>
          ))
        )}
      </div>
      {order.special_instructions && (
        <div style={{ 
          marginBottom: 10, 
          padding: 6, 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffeaa7',
          borderRadius: 4,
          fontSize: 11
        }}>
          <strong>Notes:</strong> {order.special_instructions.substring(0, 40)}...
        </div>
      )}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        gap: 8,
        marginTop: 'auto'
      }}>
        <span style={{ fontSize: 11, color: '#666' }}>
          ₹{order.total_amount || order.subtotal || 0}
        </span>
        <Button 
          size="sm" 
          variant="success" 
          onClick={() => onStart(order.id)}
          style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
        >
          Start 🍳
        </Button>
      </div>
    </Card>
  )
}

export default function KitchenPage() {
  const supabase = getSupabase()
  const { checking, user } = useRequireAuth()
  const { restaurant, loading: restLoading } = useRestaurant()
  const restaurantId = restaurant?.id
  const [newOrders, setNewOrders] = useState([])
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const audioRef = useRef(null)
  const channelRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  useEffect(() => {
    document.body.classList.add('kitchen-dashboard')
    return () => {
      document.body.classList.remove('kitchen-dashboard')
    }
  }, [])

  useEffect(() => {
    const requestFullscreen = () => {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
    const handleKeyPress = (e) => {
      if (e.key === 'F' || e.key === 'f') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          requestFullscreen();
        }
      }
    }
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  useEffect(() => {
    const audio = new Audio('/notification-sound.mp3');
    audio.preload = 'auto';
    audioRef.current = audio;
  }, []);

  useEffect(() => {
    if (!restaurantId || !supabase) return;

    const fetchOrders = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*, menu_items(name))')
          .eq('restaurant_id', restaurantId)
          .eq('status', 'new')
          .order('created_at', { ascending: true });

        if (error) throw error;
        setNewOrders(data || []);
      } catch (error) {
        console.error('❌ Error fetching initial orders:', error);
      }
    };
    fetchOrders();
  }, [restaurantId, supabase]);

  useEffect(() => {
    if (!restaurantId || !supabase) return;

    const setupRealTimeSubscription = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      const channelName = `kitchen-orders-${restaurantId}-${Date.now()}`;
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `restaurant_id=eq.${restaurantId}`,
          },
          async (payload) => {
            try {
              const orderData = payload.new;
              if (!orderData) return;
              const { data: completeOrder, error } = await supabase
                .from('orders')
                .select('*, order_items(*, menu_items(name))')
                .eq('id', orderData.id)
                .single();
              if (error || !completeOrder) return;
              setNewOrders((prev) => {
                const filtered = prev.filter((o) => o.id !== completeOrder.id);
                if (payload.eventType === 'INSERT' && completeOrder.status === 'new') {
                  if (audioRef.current) {
                    audioRef.current.play().catch(() => {});
                  }
                  return [completeOrder, ...filtered];
                }
                if (payload.eventType === 'UPDATE') {
                  return completeOrder.status === 'new' ? [completeOrder, ...filtered] : filtered;
                }
                if (payload.eventType === 'DELETE') {
                  return filtered;
                }
                return prev;
              });
            } catch (error) {
              console.error('❌ Error processing realtime event:', error);
            }
          }
        )
        .subscribe((status) => {
          setConnectionStatus(status);
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
    }
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
    }
  }, [restaurantId, supabase]);

  const handleStart = async (orderId) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'in_progress' })
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId);
      if (error) throw error;
      setNewOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (e) {
      alert('Failed to start order. Please try again.');
    }
  }

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'SUBSCRIBED': return '#22c55e'
      case 'CHANNEL_ERROR': return '#ef4444'
      case 'TIMED_OUT': return '#f59e0b'
      default: return '#6b7280'
    }
  }

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'SUBSCRIBED': return '🟢 Connected'
      case 'CHANNEL_ERROR': return '🔴 Error (Reconnecting...)'
      case 'TIMED_OUT': return '🟡 Timeout (Reconnecting...)'
      default: return '⚫ Connecting...'
    }
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '16px 24px',
        flexShrink: 0,
        borderBottom: '1px solid #e5e7eb'
      }}>
        <div>
          <h1 style={{ margin: 0, marginBottom: 4, fontSize: '28px', fontWeight: 'bold' }}>
            Kitchen Dashboard
          </h1>
          <div style={{ 
            fontSize: 12, 
            color: getStatusColor(),
            fontWeight: 'bold'
          }}>
            {getStatusText()}
          </div>
        </div>
        <div>
          <Button onClick={() => window.location.reload()} size="sm">
            🔄 Refresh
          </Button>
        </div>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 8px' }}>
        {newOrders.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
            <Card padding={24} style={{ textAlign: 'center', maxWidth: '500px' }}>
              <div style={{ marginBottom: 8, fontSize: 18 }}>🍽️ No new orders</div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                Waiting for customers to place orders...
              </div>
              <div style={{ fontSize: 10, color: '#999' }}>
                Restaurant: {restaurantId?.slice(0, 8)}...
              </div>
            </Card>
          </div>
        ) : (
          <div>
            <div style={{ 
              paddingLeft: '8px',
              marginBottom: 12, 
              fontSize: 14, 
              color: '#333',
              fontWeight: 'bold'
            }}>
              📋 {newOrders.length} New Order{newOrders.length === 1 ? '' : 's'}
            </div>
            <div className="kitchen-orders-grid">
              {newOrders.map((order) => (
                <KitchenOrderCard key={order.id} order={order} onStart={handleStart} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
