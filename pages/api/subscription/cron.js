// pages/api/subscription/cron.js
import { getServerSupabase } from '../../../services/supabase-server';
import { sendSubscriptionEmail } from '../../../services/mailer';

export default async function handler(req, res) {
  // Verify cron secret
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getServerSupabase();
    const now = new Date();

    // 1. Expire trials
    await supabase
      .from('restaurant_subscriptions')
      .update({ status: 'expired' })
      .eq('status', 'trial')
      .lt('trial_ends_at', now.toISOString());

    // 2. Expire active subscriptions
    await supabase
      .from('restaurant_subscriptions')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('current_period_end', now.toISOString());

    // 3. Send expiry warnings (3 days before)
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const { data: expiringTrials } = await supabase
      .from('restaurant_subscriptions')
      .select('*, restaurants!inner(name, owner_email)')
      .eq('status', 'trial')
      .lte('trial_ends_at', threeDaysFromNow.toISOString())
      .gte('trial_ends_at', now.toISOString());

    const { data: expiringActive } = await supabase
      .from('restaurant_subscriptions')
      .select('*, restaurants!inner(name, owner_email)')
      .eq('status', 'active')
      .lte('current_period_end', threeDaysFromNow.toISOString())
      .gte('current_period_end', now.toISOString());

    const expiring = [...(expiringTrials || []), ...(expiringActive || [])];

    // Send warning emails
    for (const sub of expiring) {
      if (!sub.restaurants?.owner_email) continue;

      const expiryDate = sub.status === 'trial' 
        ? new Date(sub.trial_ends_at)
        : new Date(sub.current_period_end);
      
      const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

      await sendSubscriptionEmail({
        to: sub.restaurants.owner_email,
        subject: `Subscription Expiring in ${daysLeft} Days - CafeQR`,
        html: `
          <h2>Subscription Expiring Soon</h2>
          <p>Dear ${sub.restaurants.name || 'Restaurant Owner'},</p>
          <p>Your CafeQR ${sub.status === 'trial' ? 'trial' : 'subscription'} will expire in <strong>${daysLeft} days</strong> on ${expiryDate.toDateString()}.</p>
          <p>Renew now for just <strong>₹99/month</strong> to continue using all features.</p>
          <p><a href="${process.env.NEXT_PUBLIC_BASE_URL}/owner/subscription">Renew Now</a></p>
        `
      });
    }

    return res.status(200).json({ 
      success: true,
      expired_trials: expiringTrials?.length || 0,
      expired_active: expiringActive?.length || 0,
      warnings_sent: expiring.length
    });

  } catch (error) {
    console.error('[cron] Error:', error);
    return res.status(500).json({ error: 'Cron job failed' });
  }
}
