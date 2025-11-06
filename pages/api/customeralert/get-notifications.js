import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { restaurant_id } = req.query;
  
  // Get pending alerts (all of them, sorted by newest first)
  const { data: pendingData, error: pendingError } = await supabase
    .from('alert_notification')
    .select('*')
    .eq('restaurant_id', restaurant_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (pendingError) return res.status(500).json([]);

  const pending = pendingData || [];
  const remaining = 10 - pending.length;

  // If we have room, get acknowledged alerts to fill up to 10 total
  let acknowledged = [];
  if (remaining > 0) {
    const { data: ackData, error: ackError } = await supabase
      .from('alert_notification')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .eq('status', 'acknowledged')
      .order('created_at', { ascending: false })
      .limit(remaining);

    if (!ackError) acknowledged = ackData || [];
  }

  // Return pending first, then acknowledged
  res.json([...pending, ...acknowledged]);
}
