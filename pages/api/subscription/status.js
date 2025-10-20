// pages/api/subscription/status.js
import { getServerSupabase } from '../../../services/supabase-server';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { restaurant_id } = req.query;
    
    console.log('[subscription-status] Checking for restaurant_id:', restaurant_id);
    
    if (!restaurant_id) {
      return res.status(400).json({ error: 'restaurant_id is required' });
    }

    const supabase = getServerSupabase();
    
    const { data: subscription, error } = await supabase
      .from('restaurant_subscriptions')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .maybeSingle();

    if (error) {
      console.error('[subscription-status] DB Error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!subscription) {
      console.log('[subscription-status] No subscription found, returning inactive');
      return res.status(200).json({ 
        is_active: false,
        status: 'none',
        days_left: 0,
        subscription: null
      });
    }

    const now = new Date();
    let isActive = false;
    let daysLeft = 0;

    // Check trial status
    if (subscription.status === 'trial' && subscription.trial_ends_at) {
      const trialEnd = new Date(subscription.trial_ends_at);
      if (now <= trialEnd) {
        isActive = true;
        daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
      }
    }
    
    // Check active paid subscription
    if (subscription.status === 'active' && subscription.current_period_end) {
      const periodEnd = new Date(subscription.current_period_end);
      if (now <= periodEnd) {
        isActive = true;
        daysLeft = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
      }
    }

    console.log('[subscription-status] Result:', { 
      isActive, 
      status: subscription.status, 
      daysLeft,
      now: now.toISOString(),
      period_end: subscription.current_period_end
    });

    return res.status(200).json({
      is_active: isActive,
      status: subscription.status,
      days_left: Math.max(0, daysLeft),
      trial_ends_at: subscription.trial_ends_at,
      current_period_end: subscription.current_period_end,
      subscription
    });

  } catch (error) {
    console.error('[subscription-status] Error:', error);
    return res.status(500).json({ error: 'Failed to check subscription status' });
  }
}
