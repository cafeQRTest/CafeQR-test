//pages/onboarding/complete.js

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useRequireAuth } from '../../lib/useRequireAuth'

function LoadingScreen() {
  return <div style={{ padding: 20 }}>Loading…</div>
}

function QROrderStatus({ order }) {
  return (
    <div>
      <h2>📦 QR Order Status</h2>
      <p>Order #{order.id.slice(0, 8)}</p>
      <p>Status: {order.status.replace('_', ' ')}</p>
    </div>
  )
}

export default function OnboardingComplete({ supabase }) {
  const router = useRouter()
  const { user, checking } = useRequireAuth(supabase)
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qrOrder, setQrOrder] = useState(null)
  const [orderingQR, setOrderingQR] = useState(false)

  useEffect(() => {
    if (!supabase) return
    if (user) loadRestaurantData()
  }, [user, supabase])

  async function loadRestaurantData() {
    try {
      const { data: restData, error: restErr } = await supabase
        .from('restaurants')
        .select('id,name,restaurant_profiles(tables_count,shipping_address_line1,phone)')
        .eq('owner_id', user.id)
        .single()
      if (restErr) throw restErr
      setRestaurant(restData)
      const { data: existing } = await supabase
        .from('qr_orders')
        .select('*')
        .eq('restaurant_id', restData.id)
        .single()
      setQrOrder(existing)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function orderQR(standType) {
    if (!supabase) return
    setOrderingQR(true)
    try {
      const res = await fetch('/api/qr-orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurant.id, stand_type: standType })
      })
      if (!res.ok) throw new Error()
      const { qr_order } = await res.json()
      setQrOrder(qr_order)
      alert('Ordered successfully!')
    } catch {
      alert('Order failed')
    } finally {
      setOrderingQR(false)
    }
  }

  if (checking || loading) return <LoadingScreen />
  if (!restaurant) return <div>Restaurant not found</div>

  const { tables_count, shipping_address_line1, phone } = restaurant.restaurant_profiles || {}
  const count = tables_count || 10

  return (
    <div style={{ padding: 20 }}>
      <h1>Welcome, {restaurant.name}</h1>
      <p>Tables: {count}</p>
      <p>Address: {shipping_address_line1}</p>
      <p>Phone: {phone}</p>

      {!qrOrder ? (
        <>
          <h2>Order QR Stands</h2>
          <button onClick={() => orderQR('tent_cards')} disabled={orderingQR}>
            {orderingQR ? '...' : 'Table Tent Cards'}
          </button>
          <button onClick={() => orderQR('acrylic_stands')} disabled={orderingQR}>
            Acrylic Stands
          </button>
          <button onClick={() => orderQR('wooden_stands')} disabled={orderingQR}>
            Wooden Stands
          </button>
        </>
      ) : (
        <QROrderStatus order={qrOrder} />
      )}

      <h2>Next Steps</h2>
      <button onClick={() => router.push('/menu')}>Go to Menu</button>
      <button onClick={() => router.push('/dashboard')}>Go to Dashboard</button>
    </div>
  )
}
