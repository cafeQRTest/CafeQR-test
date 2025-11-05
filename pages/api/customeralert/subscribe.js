import { createClient } from '@supabase/supabase-js';

// Use service role for server listening!
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { params: { eventsPerSecond: 10 } } }
);

// Keep singletons across hot-reloads in dev
const g = globalThis;

export default async function handler(req, res) {
  // Ensure Socket.IO is initialized once per server
  if (!res.socket.server.io) {
    const { Server } = require('socket.io');
    res.socket.server.io = new Server(res.socket.server, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });
  }

  // Capture io now so we don't touch res inside async callbacks later
  const io = res.socket.server.io;

  // Only set up one subscription channel per process
  if (!g.__supabaseAlertsChannel) {
    g.__supabaseAlertsChannel = supabase
      .channel('public:alert_notification')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alert_notification' },
        (payload) => {
          try {
            const row = payload?.new;
            if (!row?.restaurant_id) return;
            // Emit only to the restaurant room without referencing res
            io.to(`rid:${row.restaurant_id}`).emit('notifications', payload);
          } catch (e) {
            console.warn('[alerts] emit failed', e?.message || e);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[alerts] realtime subscribed');
        }
      });
  }

  res.status(200).json({ ok: true });
}
