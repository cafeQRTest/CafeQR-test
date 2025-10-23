// pages/api/subscription/cron.js

import { getServerSupabase } from '../../../services/supabase-server';
import { sendSubscriptionEmail } from '../../../services/mailer';

export default async function handler(req, res) {
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getServerSupabase();
    const now = new Date();

    await supabase
      .from('restaurant_subscriptions')
      .update({ status: 'expired', is_active: false })
      .eq('status', 'trial')
      .lt('trial_ends_at', now.toISOString());

    await supabase
      .from('restaurant_subscriptions')
      .update({ status: 'expired', is_active: false })
      .eq('status', 'active')
      .lt('current_period_end', now.toISOString());

    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const { data: expiringTrials } = await supabase
      .from('restaurant_subscriptions')
      .select('restaurant_id, trial_ends_at, status')
      .eq('status', 'trial')
      .lte('trial_ends_at', threeDaysFromNow.toISOString())
      .gte('trial_ends_at', now.toISOString());

    const { data: expiringActive } = await supabase
      .from('restaurant_subscriptions')
      .select('restaurant_id, current_period_end, status')
      .eq('status', 'active')
      .lte('current_period_end', threeDaysFromNow.toISOString())
      .gte('current_period_end', now.toISOString());

    // Fetch restaurant details to send email
    const expiringIds = [
      ...(expiringTrials || []).map(sub => sub.restaurant_id),
      ...(expiringActive || []).map(sub => sub.restaurant_id),
    ];

    for (const restaurant_id of expiringIds) {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('name, owner_email')
        .eq('id', restaurant_id)
        .single();

      let expiryDate, daysLeft, type;
      if (expiringTrials.some(sub => sub.restaurant_id === restaurant_id)) {
        type = 'trial';
        let sub = expiringTrials.find(sub => sub.restaurant_id === restaurant_id);
        expiryDate = new Date(sub.trial_ends_at);
        daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      } else {
        type = 'subscription';
        let sub = expiringActive.find(sub => sub.restaurant_id === restaurant_id);
        expiryDate = new Date(sub.current_period_end);
        daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      }

      if (restaurant?.owner_email) {
        await sendSubscriptionEmail({
          to: restaurant.owner_email,
          subject: `Subscription Expiring in ${daysLeft} Days - CafeQR`,
          html: `
            <h2>Subscription Expiring Soon</h2>
            <p>Dear ${restaurant.name || 'Restaurant Owner'},</p>
            <p>Your CafeQR ${type} will expire in <strong>${daysLeft} days</strong> on ${expiryDate.toDateString()}.</p>
            <p>Renew now for just <strong>₹99/month</strong> to continue using all features.</p>
            <p><a href="${process.env.NEXT_PUBLIC_BASE_URL}/owner/subscription">Renew Now</a></p>
          `
        });
      }
    }

    return res.status(200).json({ 
      success: true,
      expired_trials: expiringTrials?.length || 0,
      expired_active: expiringActive?.length || 0,
      warnings_sent: expiringIds.length
    });

  } catch (error) {
    console.error('[cron] Error:', error);
    return res.status(500).json({ error: 'Cron job failed' });
  }
}
