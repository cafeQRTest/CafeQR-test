// pages/api/subscription/create-payment.js
import Razorpay from 'razorpay';
import { getServerSupabase } from '../../../services/supabase-server';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { restaurant_id } = req.body;
    
    if (!restaurant_id) {
      return res.status(400).json({ error: 'restaurant_id is required' });
    }

    const supabase = getServerSupabase();
    
    // Get subscription details
    const { data: subscription } = await supabase
      .from('restaurant_subscriptions')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .single();

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Get restaurant details for receipt
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('name, owner_email')
      .eq('id', restaurant_id)
      .single();

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: 9900, // Rs 99 in paise
      currency: 'INR',
      receipt: `sub_${restaurant_id}_${Date.now()}`,
      notes: {
        restaurant_id,
        restaurant_name: restaurant?.name || 'Unknown',
        type: 'subscription_renewal'
      }
    });

    // Save order ID to subscription
    await supabase
      .from('restaurant_subscriptions')
      .update({ razorpay_order_id: order.id })
      .eq('restaurant_id', restaurant_id);

    return res.status(200).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('[create-payment] Error:', error);
    return res.status(500).json({ error: 'Failed to create payment order' });
  }
}
