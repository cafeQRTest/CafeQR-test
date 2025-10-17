// pages/owner/subscription.js
import { useState, useEffect } from 'react';
import { useRestaurant } from '../../context/RestaurantContext';
import { useRouter } from 'next/router';

export default function SubscriptionPage() {
  const { restaurant } = useRestaurant();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (restaurant?.id) {
      fetchStatus();
    }
  }, [restaurant]);

  async function fetchStatus() {
    try {
      const res = await fetch(`/api/subscription/status?restaurant_id=${restaurant.id}`);
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  }

  async function handlePayment() {
    setLoading(true);
    try {
      // Create order
      const res = await fetch('/api/subscription/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurant.id })
      });

      const { order_id, amount, currency, key_id } = await res.json();

      // Load Razorpay script
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);

      script.onload = () => {
        const options = {
          key: key_id,
          amount,
          currency,
          name: 'CafeQR Subscription',
          description: 'Monthly Subscription - ₹99',
          order_id,
          handler: function (response) {
            alert('Payment successful! Your subscription is now active.');
            router.push('/owner/orders');
          },
          prefill: {
            name: restaurant.name,
            email: restaurant.owner_email
          },
          theme: { color: '#3399cc' }
        };

        const razorpay = new window.Razorpay(options);
        razorpay.open();
      };
    } catch (error) {
      console.error('Payment failed:', error);
      alert('Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!status) return <div>Loading...</div>;

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
        <ul style={{ textAlign: 'left', marginBottom: 20 }}>
          <li>Unlimited Orders</li>
          <li>QR Code Menus</li>
          <li>Owner Dashboard</li>
          <li>Kitchen Display</li>
          <li>Customer Ordering</li>
        </ul>
        <button 
          onClick={handlePayment}
          disabled={loading}
          style={{
            padding: '15px 40px',
            fontSize: 18,
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 5,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Processing...' : status.is_active ? 'Renew Subscription' : 'Subscribe Now'}
        </button>
      </div>
    </div>
  );
}
