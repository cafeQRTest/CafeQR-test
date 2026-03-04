// pages/api/push/subscribe.js
import { createClient } from '@supabase/supabase-js';

function prefix(s = '', n = 24) { return String(s).slice(0, n); }
const isDev = process.env.NODE_ENV !== 'production';

function readEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return '';
}

function getAdminSupabase() {
  const url = readEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');

  if (!url || !serviceRoleKey) {
    return {
      client: null,
      error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    };
  }

  try {
    return {
      client: createClient(url, serviceRoleKey),
      error: null,
    };
  } catch (e) {
    return {
      client: null,
      error: e?.message || 'failed_to_create_supabase_client',
    };
  }
}

export default async function handler(req, res) {
  try {
    const { client: supabase, error: supabaseError } = getAdminSupabase();
    if (!supabase) {
      console.error('[subscribe] admin client unavailable:', supabaseError);
      return res.status(500).json({ error: supabaseError || 'supabase_not_configured' });
    }

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

    // Clean up this device token from any other restaurants to prevent cross-restaurant bleed
    const { error: deletionErr } = await supabase
      .from('push_subscription_restaurants')
      .delete()
      .eq('device_token', deviceToken)
      .neq('restaurant_id', restaurantId);

    if (deletionErr) {
      console.warn('[subscribe] warning: fail to cleanup old tokens', deletionErr);
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
