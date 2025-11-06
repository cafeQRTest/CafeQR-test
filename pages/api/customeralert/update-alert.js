import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { id, status } = req.body;
  
  const { data, error } = await supabase
    .from('alert_notification')
    .update({ status })
    .eq('id', id)
    .select();
  
  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  
  res.json({ success: true, data });
}
