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
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id is required' });

    const supabase = getServerSupabase();

    let { data: subscription } = await supabase
      .from('restaurant_subscriptions')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .maybeSingle();

    if (!subscription) {
      const { data: newSub, error } = await supabase
        .from('restaurant_subscriptions')
        .insert({
          restaurant_id,
          status: 'pending',
          amount_paise: 9900,
          currency: 'INR',
          plan_code: 'RZP_MONTH_99'
        })
        .select()
        .single();
      if (error) throw error;
      subscription = newSub;
    }

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('name, owner_email')
      .eq('id', restaurant_id)
      .single();

    // Shorten receipt to <=40 chars
    const base = `sub_${restaurant_id}`;
    const receiptId = base.length <= 35
      ? `${base}_${Date.now()}`
      : `${base.slice(0,35)}_${Date.now()}`.slice(0,40);

    const order = await razorpay.orders.create({
      amount: 9900,
      currency: 'INR',
      receipt: receiptId,
      notes: { restaurant_id }
    });

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
    return res.status(500).json({
      error: 'Failed to create payment order',
      details: error.error?.description || error.message
    });
  }
}
