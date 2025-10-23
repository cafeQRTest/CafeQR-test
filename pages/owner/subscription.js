import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRestaurant } from '../../context/RestaurantContext'
import { useRouter } from 'next/router'

export default function SubscriptionPage() {
  const { restaurant } = useRestaurant()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (restaurant?.id) fetchStatus()
  }, [restaurant])

  async function fetchStatus() {
    try {
      const res = await fetch(`/api/subscription/status?restaurant_id=${restaurant.id}`)
      if (res.status === 404) {
        setStatus({ found: false })
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStatus({ found: true, ...data })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handlePayment() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/subscription/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurant.id }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Payment order failed')
      }
      const { order_id, amount, currency, key_id } = await res.json()

      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      document.body.appendChild(script)

      script.onload = () => {
        const options = {
          key: key_id,
          amount,
          currency,
          name: 'CafeQR Subscription',
          description: 'Monthly Subscription - ₹99',
          order_id,
          handler: async function (response) {
            // Activate immediately
            await fetch('/api/subscription/activate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ restaurant_id: restaurant.id }),
            })
            alert('Payment successful! Your subscription is now active.')
            fetchStatus()
          },
          prefill: {
            name: restaurant.name,
            email: restaurant.owner_email,
          },
          theme: { color: '#007bff' },
          modal: {
            ondismiss: () => setLoading(false),
          },
        }
        const rzp = new window.Razorpay(options)
        rzp.open()
        setLoading(false)
      }

      script.onerror = () => {
        throw new Error('Failed to load Razorpay')
      }
    } catch (err) {
      setError(err.message)
      alert('Payment failed: ' + err.message)
      setLoading(false)
    }
  }

  if (!restaurant) {
    return <div style={{ padding: 50, textAlign: 'center' }}>Loading restaurant…</div>
  }
  if (status?.found === false) {
    return (
      <div style={{ padding:50, textAlign:'center' }}>
        <h2>Welcome!</h2>
        <p>Let’s get your restaurant set up before starting your free trial.</p>
        <Link href="/owner/settings">
          <button>Go to Settings</button>
        </Link>
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ padding: 50, textAlign: 'center', color: 'red' }}>
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={fetchStatus}>Retry</button>
      </div>
    )
  }
  if (!status) {
    return <div style={{ padding: 50, textAlign: 'center' }}>Loading subscription status…</div>
  }

  return (
    <div style={{ maxWidth: 600, margin: '50px auto', padding: 20 }}>
      <h1>Subscription</h1>
      {status.is_active ? (
        <div style={{ padding: 20, background: '#d4edda', borderRadius: 8, marginBottom: 20 }}>
          <h3 style={{ color: '#155724', margin: 0 }}>✓ Active Subscription</h3>
          <p>Status: {status.status === 'trial' ? 'Free Trial' : 'Active'}</p>
          <p>Days Remaining: {status.days_left}</p>
          <p>Expires: {new Date(status.trial_ends_at || status.current_period_end).toLocaleDateString()}</p>
        </div>
      ) : (
        <div style={{ padding: 20, background: '#f8d7da', borderRadius: 8, marginBottom: 20 }}>
          <h3 style={{ color: '#721c24', margin: 0 }}>⚠ Subscription Expired</h3>
          <p>Renew now to continue using CafeQR.</p>
        </div>
      )}

      <div style={{ padding: 30, border: '2px solid #007bff', borderRadius: 8, textAlign: 'center' }}>
        <h2>₹99 / Month</h2>
        <ul style={{ textAlign: 'left', marginBottom: 20, listStyle: 'none', paddingLeft: 0 }}>
          <li>✓ Unlimited Orders</li>
          <li>✓ QR Code Menus</li>
          <li>✓ Owner Dashboard</li>
          <li>✓ Kitchen Display</li>
          <li>✓ Customer Ordering</li>
        </ul>
        <button
          onClick={handlePayment}
          disabled={loading}
          style={{
            padding: '15px 40px',
            fontSize: 18,
            background: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 5,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Processing…' : status.is_active ? 'Renew Subscription' : 'Subscribe Now'}
        </button>
      </div>
    </div>
  )
}
