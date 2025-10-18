import { getServerSupabase } from '../../../services/supabase-server';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { restaurant_id } = req.body;
  if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id is required' });

  const supabase = getServerSupabase();
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabase
    .from('restaurant_subscriptions')
    .update({
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      next_due_at: periodEnd.toISOString()
    })
    .eq('restaurant_id', restaurant_id);

  if (error) {
    console.error('[activate] Error:', error);
    return res.status(500).json({ error: 'Failed to activate subscription' });
  }

  return res.status(200).json({ success: true });
}
