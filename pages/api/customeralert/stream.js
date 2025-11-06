// Lightweight in-process SSE hub with auth
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: false },
};

// Admin client for verifying access tokens and ownership
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Keep a global map of connections per restaurant id
const g = globalThis;
if (!g.__ownerAlertSSE) {
  g.__ownerAlertSSE = { rooms: new Map() }; // Map<restaurant_id: string, Set<ServerResponse>>
}
const rooms = g.__ownerAlertSSE.rooms;

function addClient(restaurantId, res) {
  const key = String(restaurantId);
  let set = rooms.get(key);
  if (!set) {
    set = new Set();
    rooms.set(key, set);
  }
  set.add(res);
}

function removeClient(restaurantId, res) {
  const key = String(restaurantId);
  const set = rooms.get(key);
  if (set) {
    set.delete(res);
    if (set.size === 0) rooms.delete(key);
  }
}

export default async function handler(req, res) {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  // Extract params
  const { restaurant_id, access_token = '' } = req.query;
  if (!restaurant_id) {
    res.write('event: error\ndata: Restaurant ID required\n\n');
    return res.end();
  }

  // AuthN: validate token
  let userEmail = null;
  try {
    if (!access_token) throw new Error('Missing token');
    const { data, error } = await supabaseAdmin.auth.getUser(String(access_token));
    if (error || !data?.user) throw new Error('Invalid token');
    userEmail = data.user.email || data.user.user_metadata?.email || null;
  } catch (e) {
    res.write('event: error\ndata: Unauthorized\n\n');
    return res.end();
  }

  // AuthZ: verify user owns this restaurant
  try {
    const { data: rRow, error: rErr } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('id', restaurant_id)
      .eq('owner_email', userEmail)
      .maybeSingle();
    if (rErr || !rRow) {
      res.write('event: error\ndata: Forbidden\n\n');
      return res.end();
    }
  } catch (_) {
    res.write('event: error\ndata: Forbidden\n\n');
    return res.end();
  }

  // Register client
  addClient(restaurant_id, res);

  // Initial event
  res.write('event: connected\ndata: ok\n\n');

  // Heartbeat (keep SSE alive)
  const heartbeat = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch (_) {}
  }, 15000);

  // Cleanup on close/aborted
  const cleanup = () => {
    clearInterval(heartbeat);
    removeClient(restaurant_id, res);
    try { res.end(); } catch (_) {}
  };
  req.on('close', cleanup);
  req.on('aborted', cleanup);
}
