// pages/api/push/test-send.js
import { admin, ensureFirebaseAdminInitialized } from '../../../services/push/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const init = ensureFirebaseAdminInitialized();
    if (!init.ok) {
      return res.status(500).json({
        ok: false,
        error: 'Firebase Admin is not configured',
        reason: init.reason,
        missing: init.missing || [],
      });
    }

    const { token, title, body, url, data } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const message = {
      token,
      notification: {
        title: title || '🔔 Test order',
        body: body || 'Background/killed banner test',
      },
      data: {
        type: 'new_order',
        url: url || '/owner/orders',
        ...(data || {}),
      },
      android: {
        priority: 'high',
        notification: { channelId: 'orders_sound_v2', sound: 'beep', priority: 'high' },
      },
      webpush: {
        headers: {
          Urgency: 'high'
        },
        payload: {
          aps: { sound: 'beep.wav' }
        },
        notification: {
          title: title || '🔔 Test order',
          body: body || 'Background/killed banner test',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          vibrate: [200, 100, 200, 100, 200],
          requireInteraction: true,
          silent: false
        }
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'beep.wav', badge: 1 } },
      },
    };

    const resp = await admin.messaging().send(message, false);
    return res.status(200).json({ ok: true, messageId: resp });
  } catch (err) {
    console.error('[push:test-send] error', { name: err?.name, code: err?.code, message: err?.message });
    return res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
}
