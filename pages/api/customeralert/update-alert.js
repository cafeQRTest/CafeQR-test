import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  const { id, status } = req.body;
  const { error } = await supabase
    .from('alert_notification')
    .update({ status })
    .eq('id', id);
  if (error) return res.status(500).json({ success: false });
  res.json({ success: true });
}
