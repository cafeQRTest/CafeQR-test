// pages/api/push/subscribe.js
import { createClient } from '@supabase/supabase-js';

function prefix(s = '', n = 24) { return String(s).slice(0, n); }
const isDev = process.env.NODE_ENV !== 'production';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[subscribe] missing env ${name}`);
  return v;
}

const supabase = createClient(
  requireEnv('SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY') // must be service role to bypass RLS
);

export default async function handler(req, res) {
  try {
    // Allow quick GET snapshots while testing
    if (req.method === 'GET') {
      const rid = req.query.rid || req.query.restaurantId;
      if (!rid) return res.status(400).json({ error: 'rid required' });
      const { data, error } = await supabase
        .from('push_subscription_restaurants')
        .select('device_token, platform, updated_at, enabled')
        .eq('restaurant_id', rid);
      if (error) return res.status(500).json({ error: error.message });
      const prefixes = (data || []).map(r => prefix(r.device_token));
      const enabledPrefixes = (data || [])
        .filter((r) => r.enabled !== false)
        .map((r) => prefix(r.device_token));
      return res.status(200).json({
        prefixes,
        enabledPrefixes,
        count: data?.length || 0,
        enabledCount: (data || []).filter((r) => r.enabled !== false).length,
        platforms: Array.from(new Set((data || []).map((r) => r.platform).filter(Boolean))),
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body || {};
    const deviceToken = body.deviceToken || body.token || body.fcmToken || body.fcm_token;
    const restaurantId = body.restaurantId || body.rid;
    const platform = body.platform || body.os || 'android';
    const userEmail = body.userEmail ?? body.email ?? null;

    if (!restaurantId || !platform || !deviceToken || typeof deviceToken !== 'string' || deviceToken.length < 20) {
      if (isDev) {
        console.error('[subscribe] bad input', {
          rid: restaurantId, platform, hasToken: !!deviceToken, len: deviceToken?.length
        });
      }
      return res.status(400).json({ error: 'restaurantId, platform, and deviceToken are required' });
    }

    const tokenPrefix = prefix(deviceToken);
    const now = new Date().toISOString();

    const payload = {
      restaurant_id: restaurantId,
      device_token: deviceToken,
      platform,
      user_email: userEmail,
      enabled: true,
      last_seen_at: now,
      updated_at: now,
      created_at: now
    };

    if (isDev) {
      console.log('[subscribe] upsert begin', { rid: restaurantId, tokenPrefix, platform });
    }

    const { data, error } = await supabase
      .from('push_subscription_restaurants')
      .upsert(payload, {
        onConflict: 'restaurant_id,device_token',
        ignoreDuplicates: false
      })
      .select('id, restaurant_id, device_token')
      .limit(1);

    if (error) {
      console.error('[subscribe] upsert error', { rid: restaurantId, tokenPrefix, code: error.code, msg: error.message, details: error.details });
      return res.status(500).json({ error: error.message });
    }

    if (isDev) {
      console.log('[subscribe] upsert ok', { rid: restaurantId, tokenPrefix, rowId: data?.[0]?.id });
    }

    return res.status(200).json({
      ok: true,
      rid: restaurantId,
      prefix: tokenPrefix,
      subscription: data?.[0] || null
    });
  } catch (e) {
    console.error('[subscribe] exception', e?.message || e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
