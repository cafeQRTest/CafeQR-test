// pages/api/subscription/status.js
import { getServerSupabase } from '../../../services/supabase-server';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { restaurant_id } = req.query;
    
    if (!restaurant_id) {
      return res.status(400).json({ error: 'restaurant_id is required' });
    }

    const supabase = getServerSupabase();
    
    const { data: subscription, error } = await supabase
      .from('restaurant_subscriptions')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .single();

    if (error || !subscription) {
      return res.status(404).json({ 
        is_active: false,
        error: 'No subscription found' 
      });
    }

    const now = new Date();
    let isActive = false;
    let daysLeft = 0;

    // Check if trial is active
    if (subscription.status === 'trial') {
      const trialEnd = new Date(subscription.trial_ends_at);
      isActive = now <= trialEnd;
      daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
    }
    
    // Check if paid subscription is active
    if (subscription.status === 'active' && subscription.current_period_end) {
      const periodEnd = new Date(subscription.current_period_end);
      isActive = now <= periodEnd;
      daysLeft = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
    }

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
