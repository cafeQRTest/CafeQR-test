// lib/authBootstrap.js
import { getSupabase } from '../services/supabase';

let initialSessionPromise = null;

/**
 * Resolves once Supabase emits INITIAL_SESSION (or times out).
 * Use this before any redirect logic on cold start.
 */
export function waitForInitialSession(timeoutMs = 1800) {
  if (initialSessionPromise) return initialSessionPromise;

  const supabase = getSupabase();

  initialSessionPromise = new Promise((resolve) => {
    let done = false;

    const finish = (sess) => {
      if (done) return;
      done = true;
      try { sub?.unsubscribe?.(); } catch {}
      resolve(sess || null);
    };

    // 1) Ask client to read from storage (Preferences/localStorage)
    supabase.auth.getSession().catch(() => {});

    // 2) Wait for the INITIAL_SESSION event once
    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') finish(session || null);
    });

    // 3) Safety timeout
    setTimeout(() => finish(null), timeoutMs);
  });

  return initialSessionPromise;
}
