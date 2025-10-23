// pages/api/subscription/webhook.js

import crypto from 'crypto';
import { getServerSupabase } from '../../../services/supabase-server';
import { sendSubscriptionEmail } from '../../../services/mailer';

export const config = {
  api: { bodyParser: false }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['x-razorpay-signature'];
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('[webhook] Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    res.status(200).send('OK');

    const { event, payload } = JSON.parse(rawBody);

    if (event === 'payment.captured') {
      const payment = payload.payment.entity;
      const orderId = payment.order_id;
      const amount = payment.amount;

      const supabase = getServerSupabase();

      const { data: subscriptions } = await supabase
        .from('restaurant_subscriptions')
        .select('*')
        .eq('razorpay_order_id', orderId);

      if (!subscriptions || subscriptions.length === 0) {
        console.warn('[webhook] No subscription found for order:', orderId);
        return;
      }

      const subscription = subscriptions[0];

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await supabase
        .from('restaurant_subscriptions')
        .update({
          status: 'active',
          is_active: true,
          current_period_end: periodEnd.toISOString(),
          next_due_at: periodEnd.toISOString(),
          razorpay_payment_id: payment.id
        })
        .eq('restaurant_id', subscription.restaurant_id);

      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('name, owner_email')
        .eq('id', subscription.restaurant_id)
        .single();

      if (restaurant?.owner_email) {
        await sendSubscriptionEmail({
          to: restaurant.owner_email,
          subject: 'Subscription Activated - CafeQR',
          html: `
            <h2>Subscription Activated Successfully!</h2>
            <p>Dear ${restaurant.name || 'Restaurant Owner'},</p>
            <p>Your CafeQR subscription has been activated and is valid until <strong>${periodEnd.toDateString()}</strong>.</p>
            <p><strong>Payment Details:</strong></p>
            <ul>
              <li>Amount: ₹${(amount / 100).toFixed(2)}</li>
              <li>Payment ID: ${payment.id}</li>
              <li>Date: ${now.toDateString()}</li>
            </ul>
            <p>Thank you for using CafeQR!</p>
          `
        });
      }
    }
  } catch (error) {
    console.error('[webhook] Error:', error);
  }
}
