import { createClient } from '@supabase/supabase-js';
import { ensureFirebaseAdminInitialized, admin } from '../../../services/push/firebaseAdmin';

export default async function handler(req, res) {
    try {
        const supabaseURL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

        if (!supabaseURL || !supabaseKey) {
            return res.status(500).json({ error: "Missing Supabase Environment Variables on Vercel" });
        }

        const supabase = createClient(supabaseURL, supabaseKey);

        // You can optionally pass ?restaurant_id=xxx to test a different restaurant.
        // Defaults to the user's restaurant_id from previous logs.
        const restaurantId = req.query.restaurant_id || '9e6eb95e-8ac5-4997-8343-fb35626a5ebe';

        // 1. Fetch Tokens explicitly using the enabled query pattern
        const { data: rows, error: tokenErr } = await supabase
            .from('push_subscription_restaurants')
            .select('device_token, platform')
            .eq('restaurant_id', restaurantId)
            .eq('enabled', true);

        if (tokenErr) {
            return res.status(500).json({ step: 'fetch_tokens', error: tokenErr });
        }

        const uniqueTokens = Array.from(new Set((rows || []).map((r) => r.device_token).filter(Boolean)));

        if (uniqueTokens.length === 0) {
            return res.status(200).json({
                step: 'fetch_tokens',
                result: 'no_tokens_found_for_restaurant',
                note: 'Make sure you have clicked Enable Alerts on the Vercel app domain so a token exists in the database!'
            });
        }

        // 2. Initialize Firebase
        const firebaseInit = ensureFirebaseAdminInitialized();
        if (!firebaseInit.ok) {
            return res.status(500).json({ step: 'firebase_init', details: firebaseInit });
        }

        // 3. Send Test Push using Firebase Multicast
        const message = {
            tokens: uniqueTokens,
            notification: {
                title: 'Vercel Debug Push',
                body: 'If you see this, FCM routing from Vercel is working!!!',
            },
            data: {
                type: 'test_push',
                url: '/owner/orders'
            },
            webpush: {
                fcmOptions: { link: '/owner/orders' },
                notification: {
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-192.png',
                },
            }
        };

        const response = await admin.messaging().sendEachForMulticast(message);

        return res.status(200).json({
            success: true,
            step: 'send_multicast',
            tokensTargeted: uniqueTokens.length,
            successCount: response.successCount,
            failureCount: response.failureCount,
            responses: response.responses // This will contain SPECIFIC error codes from Google FCM if something is misconfigured (like mismatched-sender-id)!
        });

    } catch (e) {
        return res.status(500).json({ success: false, error: e.message, stack: e.stack });
    }
}
