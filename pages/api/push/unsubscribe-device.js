import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { deviceToken } = req.body || {};

        if (!deviceToken) {
            return res.status(400).json({ error: 'deviceToken is required' });
        }

        const { data, error } = await supabase
            .from('push_subscription_restaurants')
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq('device_token', deviceToken)
            .select('id');

        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json({ ok: true, disabled: data?.length || 0 });
    } catch (e) {
        return res.status(500).json({ error: e?.message || 'Internal server error' });
    }
}
