// pages/api/push/test-send-restaurant.js
import { createClient } from '@supabase/supabase-js';
import { admin, ensureFirebaseAdminInitialized } from '../../../services/push/firebaseAdmin';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const init = ensureFirebaseAdminInitialized();
    if (!init.ok) {
      return res.status(500).json({
        error: 'Firebase Admin is not configured',
        reason: init.reason,
        missing: init.missing || [],
      });
    }

    const { restaurantId, title = 'Test: All tokens', body = 'Expect tray banner + sound', url = '/owner/orders' } = req.body || {};
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

    let rows = [];
    let error = null;
    const enabledQuery = await supabase
      .from('push_subscription_restaurants')
      .select('device_token')
      .eq('restaurant_id', restaurantId)
      .eq('enabled', true);

    if (!enabledQuery.error) {
      rows = enabledQuery.data || [];
    } else {
      const fallback = await supabase
        .from('push_subscription_restaurants')
        .select('device_token')
        .eq('restaurant_id', restaurantId);
      rows = fallback.data || [];
      error = fallback.error || null;
    }

    if (error) return res.status(500).json({ error: error.message });

    const tokens = Array.from(new Set((rows || []).map((r) => r.device_token).filter(Boolean)));
    if (!tokens.length) return res.status(200).json({ sent: 0, successCount: 0, failureCount: 0, errors: [], prefixes: [] });

    const message = {
      notification: { title, body, badge: '/icons/icon-192.png' },
      data: { url, kind: 'test-restaurant' },
      webpush: {
        headers: { Urgency: 'high' },
        fcmOptions: { link: url },
        notification: {
          title, body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          vibrate: [200, 100, 200, 100, 200],
          requireInteraction: true,
          silent: false
        }
      },
      android: {
        notification: { channelId: 'orders_sound', sound: 'beep', priority: 'high' },
        priority: 'high',
      },
      apns: {
        payload: { aps: { sound: 'beep.wav' } },
      },
      tokens,
    };

    const resp = await admin.messaging().sendEachForMulticast(message);
    const errors = resp.responses.map((r) => (r.success ? null : r.error?.message)).filter(Boolean).slice(0, 5);

    return res.status(200).json({
      sent: tokens.length,
      successCount: resp.successCount,
      failureCount: resp.failureCount,
      errors,
      prefixes: tokens.map(t => t.slice(0, 24)),
    });
  } catch (e) {
    console.error('[push:test-send-restaurant] error', { name: e?.name, code: e?.code, message: e?.message });
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}
