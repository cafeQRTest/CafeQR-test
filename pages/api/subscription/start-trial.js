import { getServerSupabase } from '../../../services/supabase-server';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { restaurant_id } = req.body;
  if (!restaurant_id) {
    return res.status(400).json({ error: 'restaurant_id required' });
  }

  try {
    const supabase = getServerSupabase();

    // Check restaurant exists
    const { data: restaurant, error: restError } = await supabase
      .from('restaurants')
      .select('id')
      .eq('id', restaurant_id)
      .maybeSingle();

    if (restError || !restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    // Check subscription doesn't exist
const { data: existing, error: existError } = await supabase
  .from('restaurant_subscriptions')
  .select('*')
  .eq('restaurant_id', restaurant_id)
  .maybeSingle();

if (existError && existError.code !== 'PGRST116') {
  console.error('Error checking subscription:', existError);
  return res.status(500).json({ error: 'DB query failed' });
}


    if (existing) {
      return res.status(200).json({ message: 'Already exists' });
    }

    // Create trial
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    const { data, error } = await supabase
      .from('restaurant_subscriptions')
      .insert({
        restaurant_id,
        status: 'trial',
        is_active: true,
        trial_ends_at: trialEnd.toISOString(),
        current_period_end: trialEnd.toISOString(),
        next_due_at: trialEnd.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // ← FAST RESPONSE (don't wait for anything)
    return res.status(200).json({ success: true, subscription: data });

  } catch (err) {
    console.error('[start-trial] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
