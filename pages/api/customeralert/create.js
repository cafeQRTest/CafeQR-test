import { createClient } from '@supabase/supabase-js';


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { restaurant_id, table_number, created_at, status, message } = req.body;

  if (!restaurant_id || !table_number) {
    return res.status(400).json({ error: 'Missing data' });
  }

  const { data, error } = await supabase
    .from('alert_notification')
    .insert([{
      restaurant_id,
      table_number,
      created_at,
      status: status || 'pending',
      message: message || 'Customer request for staff'
    }])
    .select();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const row = data && data[0];

  // Realtime will automatically broadcast this insert to subscribed clients
  // No need for manual SSE broadcasting

  return res.status(201).json(row);
}
