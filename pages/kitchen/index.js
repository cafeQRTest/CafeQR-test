// pages/kitchen/index.js
import React, { useEffect, useRef, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { getSupabase } from '../../services/supabase'

// Helper functions (before component)
function toDisplayItems(order) {
  console.log('Processing order for items:', order)
  
  if (Array.isArray(order.order_items) && order.order_items.length > 0) {
    console.log('Using order_items:', order.order_items)
    return order.order_items.map((oi) => ({
      name: oi.menu_items?.name || oi.item_name || 'Item',
      quantity: oi.quantity || 1,
      price: oi.price || 0,
    }))
  }
  
  if (Array.isArray(order.items) && order.items.length > 0) {
    console.log('Using items:', order.items)
    return order.items
  }
  
  console.warn('No items found in order:', order)
  return []
}

function KitchenOrderCard({ order, onStart }) {
  const items = toDisplayItems(order)
  console.log('KitchenOrderCard rendering order:', order)
  console.log('Items derived using toDisplayItems:', items)

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
          Table {order.table_number || 'N/A'}
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

function EnableAlertsButton({ restaurantId, userEmail }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const checkPermission = async () => {
      try {
        if (!window.isSecureContext || typeof Notification === 'undefined') {
          console.warn('Notifications not supported: insecure context or API unavailable')
          return
        }
        
        if (Notification.permission === 'granted') {
          const registration = await navigator.serviceWorker.ready
          if (registration) {
            setEnabled(true)
          }
        }
      } catch (error) {
        console.error('Error checking notification permission:', error)
      }
    }
    checkPermission()
  }, [])

  const enablePush = async () => {
    setLoading(true)
    setError(null)
    
    try {
      if (!window.isSecureContext) {
        throw new Error('Notifications require HTTPS')
      }

      if (typeof Notification === 'undefined') {
        throw new Error('Notifications not supported in this browser')
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        throw new Error('Notification permission denied')
      }
      
      const registration = await navigator.serviceWorker.ready
      if (!registration) {
        throw new Error('Service worker not available')
      }
      
      let messaging
      try {
        const { getMessagingIfSupported } = await import('../../lib/firebaseClient')
        messaging = await getMessagingIfSupported()
      } catch (firebaseError) {
        console.warn('Firebase messaging not available:', firebaseError)
      }
      
      let deviceToken = null
      if (messaging && process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
        try {
          const { getToken } = await import('firebase/messaging')
          deviceToken = await getToken(messaging, {
            vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
            serviceWorkerRegistration: registration,
          })
        } catch (tokenError) {
          console.warn('Failed to get Firebase token:', tokenError)
        }
      }
      
      const subscribeData = {
        restaurantId,
        userEmail,
        platform: 'web',
        enabled: true
      }
      
      if (deviceToken) {
        subscribeData.deviceToken = deviceToken
      }
      
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscribeData),
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Subscribe failed: ${res.status} ${errorText}`)
      }
      
      const result = await res.json()
      console.log('Push subscription successful:', result)
      
      setEnabled(true)
      
      new Notification('🔔 Kitchen Alerts Enabled!', {
        body: 'You will now receive notifications for new orders.',
        icon: '/favicon.ico',
        tag: 'push-enabled',
      })
      
    } catch (e) {
      console.error('Error enabling push notifications:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Button onClick={enablePush} disabled={loading} variant="primary" size="sm">
          {loading ? 'Retrying...' : 'Retry Alerts'}
        </Button>
        <span style={{ fontSize: 10, color: '#ff6b6b' }}>
          {error}
        </span>
      </div>
    )
  }

  return (
    <Button 
      onClick={enablePush} 
      disabled={loading || enabled} 
      variant={enabled ? 'success' : 'primary'}
      size="sm"
    >
      {loading ? 'Enabling...' : enabled ? '🔔 Alerts Active' : 'Enable Alerts'}
    </Button>
  )
}

// SINGLE EXPORT DEFAULT
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

  // Subscription guard
  
   useEffect(() => {
    document.body.classList.add('kitchen-dashboard')
    return () => {
      document.body.classList.remove('kitchen-dashboard')
    }
  }, [])

// ============ ADD HERE: Fullscreen and keyboard shortcut ============
  useEffect(() => {
    // Request fullscreen for TV/monitoring display
    const requestFullscreen = () => {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {
          // Silently fail if fullscreen not available
        })
      }
    }

 const handleKeyPress = (e) => {
      if (e.key === 'F' || e.key === 'f') {
        if (document.fullscreenElement) {
          document.exitFullscreen()
        } else {
          requestFullscreen()
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])
  
  useEffect(() => {
    const audio = new Audio('/notification-sound.mp3')
    audio.preload = 'auto'
    audioRef.current = audio
  }, [])

  useEffect(() => {
    if (!restaurantId || !supabase) return
    
    const fetchOrders = async () => {
      try {
        console.log('🔄 Fetching initial orders for restaurant:', restaurantId)
        const { data, error } = await supabase
          .from('orders')
          .select(`
            *,
            order_items (
              *,
              menu_items (name)
            )
          `)
          .eq('restaurant_id', restaurantId)
          .eq('status', 'new')
          .order('created_at', { ascending: true })
        
        if (error) throw error
        
        console.log('📦 Initial orders fetched:', data)
        setNewOrders(data || [])
      } catch (error) {
        console.error('❌ Error fetching initial orders:', error)
      }
    }
    
    fetchOrders()
  }, [restaurantId, supabase])

  useEffect(() => {
    if (!restaurantId || !supabase) return

    const setupRealTimeSubscription = () => {
      if (channelRef.current) {
        console.log('🧹 Cleaning up existing channel')
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      const channelName = `kitchen-orders-${restaurantId}-${Date.now()}`
      console.log('🔗 Creating channel:', channelName)
      
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
            console.log('🔥 Kitchen realtime payload received:', payload)
            
            try {
              const orderData = payload.new
              if (!orderData) {
                console.log('❌ No new order data in payload')
                return
              }

              const { data: completeOrder, error } = await supabase
                .from('orders')
                .select(`
                  *,
                  order_items (
                    *,
                    menu_items (name)
                  )
                `)
                .eq('id', orderData.id)
                .single()

              if (error) {
                console.error('❌ Error fetching complete order:', error)
                return
              }

              if (!completeOrder) {
                console.log('❌ No complete order data returned')
                return
              }

              console.log('📦 Complete order data:', completeOrder)

              setNewOrders((prev) => {
                const filtered = prev.filter((o) => o.id !== completeOrder.id)
                
                if (payload.eventType === 'INSERT' && completeOrder.status === 'new') {
                  console.log('🆕 Adding new order to kitchen dashboard')
                  
                  if (audioRef.current) {
                    audioRef.current.play().catch((err) => 
                      console.warn('🔇 Audio play failed:', err)
                    )
                  }
                  
                  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    try {
                      new Notification('🔔 New Kitchen Order!', {
                        body: `Table ${completeOrder.table_number || 'N/A'} • #${completeOrder.id.slice(0, 8)}`,
                        icon: '/favicon.ico',
                        tag: `order-${completeOrder.id}`,
                      })
                    } catch (notifError) {
                      console.warn('❌ Notification failed:', notifError)
                    }
                  }
                  
                  return [completeOrder, ...filtered]
                }
                
                if (payload.eventType === 'UPDATE') {
                  console.log(`📝 Order ${completeOrder.id} updated, status: ${completeOrder.status}`)
                  return completeOrder.status === 'new' ? [completeOrder, ...filtered] : filtered
                }
                
                if (payload.eventType === 'DELETE') {
                  console.log(`🗑️ Order ${orderData.id} deleted`)
                  return filtered
                }
                
                return prev
              })
            } catch (error) {
              console.error('❌ Error processing realtime event:', error)
            }
          }
        )
        .subscribe((status) => {
          console.log('📡 Channel subscription status:', status)
          setConnectionStatus(status)
          
          if (status === 'SUBSCRIBED') {
            console.log('✅ Successfully subscribed to kitchen orders')
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Channel subscription error - will retry in 5 seconds')
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log('🔄 Attempting to reconnect...')
              setupRealTimeSubscription()
            }, 5000)
          } else if (status === 'TIMED_OUT') {
            console.error('⏰ Channel subscription timed out - will retry in 3 seconds')
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log('🔄 Attempting to reconnect...')
              setupRealTimeSubscription()
            }, 3000)
          }
        })

      channelRef.current = channel
    }

    setupRealTimeSubscription()

    return () => {
      console.log('🧹 Cleaning up kitchen dashboard subscription')
      
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [restaurantId, supabase])

  const handleStart = async (orderId) => {
    try {
      console.log(`🚀 Starting order: ${orderId}`)
      const { error } = await supabase
        .from('orders')
        .update({ status: 'in_progress' })
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId)
        
      if (error) throw error
      
      setNewOrders((prev) => prev.filter((o) => o.id !== orderId))
      console.log(`✅ Order ${orderId} moved to in_progress`)
    } catch (e) {
      console.error('❌ Error starting order:', e)
      alert('Failed to start order. Please try again.')
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
    // Remove padding entirely, let CSS handle it
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
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <EnableAlertsButton restaurantId={restaurantId} userEmail={user?.email} />
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