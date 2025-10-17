// services/supabase-server.js
import { createClient } from '@supabase/supabase-js';

let serverClient;

export function getServerSupabase() {
  if (serverClient) return serverClient;
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Missing Supabase server credentials');
  }
  
  serverClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  
  return serverClient;
}
