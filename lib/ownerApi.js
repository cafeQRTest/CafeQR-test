// lib/ownerApi.js
import { getSupabase } from '../services/supabase';

// Always use the shared Capacitor-aware client everywhere in the app
export const supabase = getSupabase();

// Admin client (server-side ONLY). Do not import this in client components.
import { createClient } from '@supabase/supabase-js';
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
