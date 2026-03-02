// pages/api/orders/subscribe.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // use service role for listen
  { realtime: { params: { eventsPerSecond: 10 } } }
);

export default async function handler(req, res) {
  // Upgrade to websocket (if using edge runtime)
  if (!res.socket.server.supabase) {
    const channel = supabase
      .channel('public:orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        payload => {
          // Broadcast to all connected clients
          res.socket.server.io.emit('orders', payload);
        }
      )
      .subscribe();
    res.socket.server.supabase = channel;
  }
  res.end();
}
