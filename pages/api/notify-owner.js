// pages/api/notify-owner.js
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';

function normalizePrivateKey(raw) {
  if (!raw) return '';
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  if (key.includes('\\n')) key = key.replace(/\\n/g, '\n');
  key = key.replace(/\r\n/g, '\n');
  if (!key.endsWith('\n')) key = key + '\n';
  return key;
}

// Initialize Firebase Admin SDK
try {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
    
    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      console.log('[Firebase] Admin initialized successfully');
    } else {
      console.warn('[Firebase] Missing credentials, push notifications disabled');
    }
  }
} catch (fbErr) {
  console.error('[Firebase] Initialization error:', fbErr.message);
}

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send({ error: 'Method not allowed' });

  const { restaurantId, orderId, orderItems } = req.body || {};
  if (!restaurantId || !orderId) return res.status(400).send({ error: 'Missing restaurantId or orderId' });

  const { data: rows, error: fetchErr } = await supabase
    .from('push_subscription_restaurants')
    .select('device_token')
    .eq('restaurant_id', restaurantId);

  if (fetchErr) {
    console.error('[notify-owner] fetchErr', fetchErr);
    return res.status(500).send({ error: 'Failed to fetch push subscriptions' });
  }

  const tokens = (rows || []).map(r => r.device_token).filter(Boolean);
  if (!tokens.length) return res.status(200).send({ message: 'No devices subscribed', successCount: 0 });

  const itemCount = Array.isArray(orderItems)
    ? orderItems.reduce((sum, item) => sum + (item.quantity || 1), 0)
    : 0;

  const message = {
    tokens,
    notification: { title: '🔔 New Order Received!', body: `Order with ${itemCount} items placed.` },
    data: {
      type: 'new_order',
      orderId: String(orderId),
      url: `/owner/orders?highlight=${orderId}`
    },
    android: {
      priority: 'high',
      notification: { channelId: 'orders_v3', sound: 'beep', priority: 'high' }
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default', badge: 1 } }
    }
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    const invalidTokens = [];
    response.responses.forEach((resp, i) => {
      if (!resp.success) {
        const code = resp.error?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          invalidTokens.push(tokens[i]);
        }
      }
    });
    if (invalidTokens.length) {
      await supabase.from('push_subscription_restaurants').delete().in('device_token', invalidTokens);
    }

    return res.status(200).send({
      successCount: response.successCount,
      failureCount: response.failureCount,
      pruned: invalidTokens.length
    });
  } catch (error) {
    console.error('[notify-owner] FCM send failed', error);
    return res.status(500).send({ error: 'Failed to send notifications' });
  }
}
