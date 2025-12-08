// services/founder-auth.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Comma-separated founder emails in env, e.g. "you@domain.com,cofounder@domain.com"
const founderEmails = (process.env.FOUNDER_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Founder auth: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Server-side auth client using anon key, no persistence
const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Require that the incoming request is from a logged-in founder.
 * Expects `Authorization: Bearer <access_token>` header from the frontend.
 * Returns { ok: true, user, email } on success, or { ok: false, status, error } on failure.
 */
export async function requireFounder(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, error: 'Missing access token' };
  }

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: 'Invalid access token' };
  }

  const email =
    (data.user.email || data.user.user_metadata?.email || '')
      .toLowerCase();

  if (!founderEmails.includes(email)) {
    return { ok: false, status: 403, error: 'Not authorized for founder dashboard' };
  }

  return { ok: true, user: data.user, email };
}
