// pages/api/subscription/start-trial.js
import { getServerSupabase } from '../../../services/supabase-server';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { restaurant_id } = req.body;
    
    if (!restaurant_id) {
      return res.status(400).json({ error: 'restaurant_id is required' });
    }

    const supabase = getServerSupabase();
    
    // Check if subscription already exists
    const { data: existing } = await supabase
      .from('restaurant_subscriptions')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .single();
    
    if (existing) {
      return res.status(200).json({ 
        message: 'Subscription already exists',
        subscription: existing 
      });
    }

    // Create new trial subscription
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7); // 7 days from now

    const { data, error } = await supabase
      .from('restaurant_subscriptions')
      .insert({
        restaurant_id,
        status: 'trial',
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        amount_paise: 9900,
        currency: 'INR',
        plan_code: 'RZP_MONTH_99'
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ 
      success: true, 
      subscription: data,
      trial_ends_at: trialEndsAt.toISOString()
    });

  } catch (error) {
    console.error('[start-trial] Error:', error);
    return res.status(500).json({ error: 'Failed to start trial' });
  }
}
