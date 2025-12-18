// pages/owner/subscription - FINAL CORRECTED

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRestaurant } from '../../context/RestaurantContext'
import { useRouter } from 'next/router'
import { useSubscription } from '../../context/SubscriptionContext'

export default function SubscriptionPage() {
  const { restaurant } = useRestaurant()
  const router = useRouter()
  const { subscription, refetch: refetchSubscription } = useSubscription()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (restaurant?.id) {
      fetchStatus()
    }
  }, [restaurant])

  async function fetchStatus() {
  try {
    setError(null);

    // 1) Check current status
    const res = await fetch(`/api/subscription/status?restaurant_id=${restaurant.id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // 2) If no subscription exists yet, start a free trial
    if (data.status === 'none' && !data.subscription) {
      // Optional: optimistic UI while trial is being created
      setStatus({
        found: true,
        ...data,
        statusReason: 'Starting your free 7‑day trial…',
      });

      const trialRes = await fetch('/api/subscription/start-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          owner_email: restaurant.owner_email || null,
        }),
      });

      if (!trialRes.ok) {
        const tj = await trialRes.json().catch(() => ({}));
        throw new Error(tj.error || 'Failed to start trial');
      }

      // 3) Refresh global subscription context (used by GlobalSubscriptionGate)
      await refetchSubscription();

      // 4) Re‑fetch status so UI shows the new trial as active
      const res2 = await fetch(`/api/subscription/status?restaurant_id=${restaurant.id}`);
      if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
      const data2 = await res2.json();
      setStatus({ found: true, ...data2 });
      return;
    }

    // Normal path: subscription exists already
    setStatus({ found: true, ...data });
  } catch (err) {
    console.error('Status fetch error:', err);
    setError(err.message);
    setStatus({ found: false });
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
            try {
              // Activate immediately
              const activateRes = await fetch('/api/subscription/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ restaurant_id: restaurant.id }),
              })
              
              if (!activateRes.ok) {
                throw new Error('Failed to activate subscription')
              }

              alert('Payment successful! Your subscription is now active.')
              
              // Refresh subscription state
              await refetchSubscription()
              fetchStatus()
              
              // Redirect to dashboard after short delay
              setTimeout(() => {
                router.replace('/owner/overview')
              }, 1000)
            } catch (err) {
              console.error('Activation error:', err)
              setError('Payment successful but activation failed. Please refresh.')
              fetchStatus() // Refresh to show latest state
            }
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

  if (!status) {
    return <div style={{ padding: 50, textAlign: 'center' }}>Loading subscription status…</div>
  }

  // Waiting for setup before offering trial
  if (status.found === false) {
    return (
      <div style={{ padding: 50, textAlign: 'center' }}>
        <h2>Welcome to CafeQR!</h2>
        <p>Let's set up your restaurant profile before starting your free 7-day trial.</p>
        <Link href="/owner/settings">
          <button style={{
            padding: '10px 20px',
            fontSize: 16,
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 5,
            cursor: 'pointer'
          }}>
            Complete Setup
          </button>
        </Link>
      </div>
    )
  }

  if (error && !status.subscription) {
    return (
      <div style={{ padding: 50, textAlign: 'center', color: 'red' }}>
        <h3>Error Loading Status</h3>
        <p>{error}</p>
        <button onClick={fetchStatus} style={{
          padding: '10px 20px',
          fontSize: 16,
          background: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: 5,
          cursor: 'pointer'
        }}>
          Retry
        </button>
      </div>
    )
  }

  // ✅ CRITICAL FIX: Determine the expiry date correctly
  // For active subscriptions: use current_period_end
  // For trials: use trial_ends_at
  let expiryDate = null
  if (status.status === 'active' && status.current_period_end) {
    expiryDate = new Date(status.current_period_end)
  } else if (status.status === 'trial' && status.trial_ends_at) {
    expiryDate = new Date(status.trial_ends_at)
  }

  return (
    <div style={{ maxWidth: 600, margin: '50px auto', padding: 20 }}>
      <h1>Your Subscription</h1>

      {/* Active Subscription Status */}
      {status.is_active ? (
        <div style={{ 
          padding: 20, 
          background: '#d4edda', 
          borderRadius: 8, 
          marginBottom: 20,
          border: '2px solid #28a745'
        }}>
          <h3 style={{ color: '#155724', margin: '0 0 10px 0' }}>✓ Active Subscription</h3>
          <p style={{ margin: '5px 0' }}>
            <strong>Status:</strong> {status.status === 'trial' ? '🎉 Free Trial' : '✅ Paid Subscription'}
          </p>
          <p style={{ margin: '5px 0' }}>
            <strong>Days Remaining:</strong> {status.days_left} days
          </p>
          <p style={{ margin: '5px 0' }}>
            <strong>Expires:</strong> {expiryDate ? expiryDate.toLocaleDateString() : 'N/A'}
          </p>
        </div>
      ) : (
        <div style={{ 
          padding: 20, 
          background: '#f8d7da', 
          borderRadius: 8, 
          marginBottom: 20,
          border: '2px solid #dc3545'
        }}>
          <h3 style={{ color: '#721c24', margin: '0 0 10px 0' }}>⚠ Subscription Expired</h3>
          <p>Your subscription has expired. Renew now to regain access to the owner dashboard and all features.</p>
        </div>
      )}

      {/* Subscription Plans */}
      <div style={{ 
        padding: 30, 
        border: '2px solid #007bff', 
        borderRadius: 8, 
        textAlign: 'center',
        background: '#f8f9fa'
      }}>
        <h2 style={{ margin: '0 0 10px 0', color: '#007bff' }}>₹99 / Month</h2>
        <p style={{ color: '#666', marginBottom: 20 }}>Everything you need to run your restaurant</p>
        
        <ul style={{ 
          textAlign: 'left', 
          marginBottom: 30, 
          listStyle: 'none', 
          paddingLeft: 0,
          maxWidth: 300,
          margin: '0 auto 30px'
        }}>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #ddd' }}>✓ Unlimited Orders</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #ddd' }}>✓ QR Code Menus</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #ddd' }}>✓ Owner Dashboard</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #ddd' }}>✓ Kitchen Display</li>
          <li style={{ padding: '8px 0', borderBottom: '1px solid #ddd' }}>✓ Customer Ordering</li>
          <li style={{ padding: '8px 0' }}>✓ Invoice Management</li>
        </ul>

        <button
          onClick={handlePayment}
          disabled={loading}
          style={{
            padding: '15px 40px',
            fontSize: 16,
            fontWeight: 'bold',
            background: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 5,
            cursor: loading ? 'not-allowed' : 'pointer',
            width: '100%',
            transition: 'background 0.3s'
          }}
        >
          {loading ? 'Processing…' : status.is_active ? 'Renew Subscription' : 'Subscribe Now'}
        </button>
      </div>

      {error && (
        <div style={{
          marginTop: 20,
          padding: 15,
          background: '#ffe6e6',
          border: '1px solid #ff0000',
          borderRadius: 5,
          color: '#cc0000'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Support */}
      <div style={{ 
        marginTop: 40, 
        padding: 20, 
        background: '#f0f0f0', 
        borderRadius: 8,
        textAlign: 'center'
      }}>
        <p>Need help? <a href="mailto:pnriyas50@gmail.com">Contact support</a></p>
      </div>
    </div>
  )
}