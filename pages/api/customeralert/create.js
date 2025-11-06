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

  // Broadcast to connected SSE clients for this restaurant (if any)
  try {
    const g = globalThis;
    const rooms = g.__ownerAlertSSE?.rooms;
    if (rooms && row?.restaurant_id) {
      const set = rooms.get(String(row.restaurant_id));
      if (set && set.size) {
        const payload = { new: row };
        const msg = `event: alert\ndata: ${JSON.stringify(payload)}\n\n`;
        for (const clientRes of set) {
          try { clientRes.write(msg); } catch (_) {}
        }
      }
    }
  } catch (_) {}

  return res.status(201).json(row);
}
