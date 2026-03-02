import { createClient } from '@supabase/supabase-js';
import Razorpay from 'razorpay';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    console.log('create-order called with body:', req.body);

    const { restaurant_id, amount, metadata } = req.body;
    if (!restaurant_id || !amount) {
      console.log('Missing restaurant_id or amount in request body');
      return res.status(400).json({ error: 'Missing restaurant_id or amount' });
    }

    const { data: restaurant, error } = await supabase
      .from('restaurant_profiles')
      .select('razorpay_key_id, razorpay_key_secret')
      .eq('restaurant_id', restaurant_id)
      .single();

    if (error) {
      console.error('Error fetching restaurant profile:', error);
      return res.status(500).json({ error: 'Failed to fetch restaurant profile' });
    }
    if (!restaurant) {
      console.warn('No restaurant found for id:', restaurant_id);
      return res.status(400).json({ error: 'Restaurant not found' });
    }
    if (!restaurant.razorpay_key_id || !restaurant.razorpay_key_secret) {
      console.warn('Payment keys missing for restaurant:', restaurant_id);
      return res.status(400).json({ error: 'Payment gateway not configured for this restaurant' });
    }

    console.log('Using Razorpay keys for restaurant:', {
      razorpay_key_id: restaurant.razorpay_key_id,
      razorpay_key_secret: '***hidden***',
    });

    const razorpay = new Razorpay({
      key_id: restaurant.razorpay_key_id,
      key_secret: restaurant.razorpay_key_secret,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
      notes: metadata || {},
    });

    console.log('Created Razorpay order:', order);
    return res.status(200).json({ order_id: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: err.message || 'Order creation failed' });
  }
}
