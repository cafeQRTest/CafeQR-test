import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const restaurantId = body.restaurantId || body.rid;
    const deviceToken = body.deviceToken || body.token || body.fcmToken || body.fcm_token;

    if (!restaurantId || !deviceToken) {
      return res.status(400).json({ error: 'restaurantId and deviceToken are required' });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('push_subscription_restaurants')
      .update({
        enabled: false,
        updated_at: now,
      })
      .eq('restaurant_id', restaurantId)
      .eq('device_token', deviceToken)
      .select('id')
      .limit(1);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, updated: data?.length || 0 });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}
