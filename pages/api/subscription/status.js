// pages/api/subscription/status.js - CORRECTED

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
    
    // ✅ FIX: Fetch subscription with better error handling
    const { data: subscription, error } = await supabase
      .from('restaurant_subscriptions')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .maybeSingle();

    if (error) {
      console.error('[subscription-status] DB Error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    // No subscription found - return inactive status
    if (!subscription) {
      return res.status(200).json({
        is_active: false,
        status: 'none',
        days_left: 0,
        subscription: null,
        message: 'No subscription found'
      });
    }

    const now = new Date();
    let isActive = false;
    let daysLeft = 0;
    let statusReason = '';

    // Check trial status
    if (subscription.status === 'trial' && subscription.trial_ends_at) {
      const trialEnd = new Date(subscription.trial_ends_at);
      if (now <= trialEnd) {
        isActive = true;
        daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
        statusReason = `Trial active - ${daysLeft} days left`;
      } else {
        statusReason = 'Trial expired';
      }
    }

    // Check active subscription status
    if (subscription.status === 'active' && subscription.current_period_end) {
      const periodEnd = new Date(subscription.current_period_end);
      if (now <= periodEnd) {
        isActive = true;
        daysLeft = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
        statusReason = `Active subscription - ${daysLeft} days left`;
      } else {
        statusReason = 'Subscription period expired';
      }
    }

    // Check expired status
    if (subscription.status === 'expired') {
      statusReason = 'Subscription has expired';
    }

    return res.status(200).json({
      is_active: isActive,
      status: subscription.status,
      days_left: Math.max(0, daysLeft),
      trial_ends_at: subscription.trial_ends_at,
      current_period_end: subscription.current_period_end,
      subscription,
      statusReason
    });

  } catch (error) {
    console.error('[subscription-status] Error:', error);
    return res.status(500).json({ error: 'Failed to check subscription status' });
  }
}