// pages/api/reports/cron-monthly.js
//
// Vercel cron job: runs near 11:59 PM IST on days 28-31.
// If today is the last day of the month, it fetches all restaurants
// with a valid owner_email and sends monthly reports for the current month.

import { getServerSupabase } from '../../../services/supabase-server';

export default async function handler(req, res) {
    // Verify cron secret (same as subscription cron)
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Determine if today is the last day of the month (in IST)
        const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const y = nowIST.getFullYear();
        const m = nowIST.getMonth(); // 0-indexed
        const lastDayOfMonth = new Date(y, m + 1, 0).getDate();

        if (nowIST.getDate() !== lastDayOfMonth) {
            return res.status(200).json({ skipped: true, reason: `Today (${nowIST.getDate()}) is not the last day (${lastDayOfMonth})` });
        }

        const monthStr = `${y}-${String(m + 1).padStart(2, '0')}`;
        const supabase = getServerSupabase();

        // Fetch all restaurants with a valid owner_email
        const { data: restaurants, error: rErr } = await supabase
            .from('restaurants')
            .select('id, name, owner_email')
            .not('owner_email', 'is', null)
            .neq('owner_email', '');

        if (rErr) throw rErr;

        const results = [];
        for (const rest of (restaurants || [])) {
            try {
                // Call the send-reports API internally
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
                    ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

                const resp = await fetch(`${baseUrl}/api/reports/send-reports/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ restaurant_id: rest.id, month: monthStr }),
                });

                const body = await resp.json();
                results.push({ id: rest.id, name: rest.name, email: rest.owner_email, success: resp.ok, message: body.message || body.error });
            } catch (err) {
                results.push({ id: rest.id, name: rest.name, error: err.message });
            }
        }

        console.log(`[cron-monthly] Sent reports for ${monthStr} to ${results.length} restaurants`);
        return res.status(200).json({ success: true, month: monthStr, results });
    } catch (err) {
        console.error('[cron-monthly] Error:', err);
        return res.status(500).json({ error: err.message });
    }
}
