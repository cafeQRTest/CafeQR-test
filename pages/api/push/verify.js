import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const body = req.body || {};
        const restaurantId = body.restaurantId || body.rid;
        const deviceToken = body.deviceToken || body.token || body.fcmToken || body.fcm_token;

        if (!restaurantId || !deviceToken) {
            return res.status(400).json({ error: 'restaurantId and deviceToken are required' });
        }

        // Active DB Sync: Delete this specific device token from ANY OTHER restaurant 
        // to prevent cross-restaurant notification bleeding when sessions change un-cleanly.
        const { error: deletionErr } = await supabase
            .from('push_subscription_restaurants')
            .delete()
            .eq('device_token', deviceToken)
            .neq('restaurant_id', restaurantId);

        if (deletionErr) {
            console.warn('[verify-push] Failed to clean up orphaned tokens:', deletionErr);
            return res.status(500).json({ error: 'Cleanup failed', details: deletionErr.message });
        }

        return res.status(200).json({ ok: true, message: 'Verified and cleaned' });
    } catch (e) {
        console.error('[verify-push] Exception:', e?.message || e);
        return res.status(500).json({ error: e?.message || 'Internal server error' });
    }
}
