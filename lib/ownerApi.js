// lib/ownerApi.js
import { getSupabase } from '../services/supabase';
export const supabase = getSupabase(); // unified Capacitor-aware client

// Server-only admin (unchanged)
import { createClient } from '@supabase/supabase-js';
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
