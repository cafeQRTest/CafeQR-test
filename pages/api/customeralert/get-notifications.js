import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  const { restaurant_id } = req.query;
  const { data, error } = await supabase
    .from('alert_notification')
    .select('*')
    .eq('restaurant_id', restaurant_id)
    .in('status', ['pending', 'acknowledged'])
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return res.status(500).json([]);
  res.json(data);
}