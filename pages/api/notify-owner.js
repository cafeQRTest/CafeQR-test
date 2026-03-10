// pages/api/notify-owner.js
import { createClient } from '@supabase/supabase-js';
import { sendNewOrderPush } from '../../services/push/newOrderNotifier';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send({ error: 'Method not allowed' });

  try {
    const { restaurantId, orderId, tableNumber, orderType, totalAmount, orderItems } = req.body || {};
    if (!restaurantId || !orderId) {
      return res.status(400).send({ error: 'Missing restaurantId or orderId' });
    }

    const result = await sendNewOrderPush({
      supabase,
      restaurantId,
      orderId,
      tableNumber,
      orderType,
      totalAmount,
      orderItems,
    });

    if (!result.ok) {
      return res.status(500).send({ error: result.error || result.reason || 'Failed to send notifications' });
    }

    return res.status(200).send(result);
  } catch (error) {
    console.error('[notify-owner] failed:', error?.message || error);
    return res.status(500).send({ error: 'Failed to send notifications' });
  }
}
