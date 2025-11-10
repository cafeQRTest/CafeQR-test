// lib/useRequireAuth.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabase, forceSupabaseSessionRestore, bootstrapSupabaseSession } from '../services/supabase';
import { ensureSessionValid } from '../lib/authActions';
import { waitForInitialSession } from '../lib/authBootstrap';

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/privacy-policy', '/faq', '/'];

export function useRequireAuth() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const supabase = getSupabase();

  useEffect(() => {
    let mounted = true;

    async function run() {
      // Public routes do not block
      if (PUBLIC_PATHS.includes(router.pathname)) {
        if (mounted) setChecking(false);
        return;
      }

      // Cold start bootstrap (run once)
      await bootstrapSupabaseSession();                    // restore via setSession if needed
      await forceSupabaseSessionRestore();                 // read tokens from storage adapter
      const initial = await waitForInitialSession();       // wait for INITIAL_SESSION once
      if (initial) {
        try { await supabase.auth.startAutoRefresh(); } catch {}
        await ensureSessionValid();                        // proactively refresh if near expiry
      }

      // Single read after bootstrap
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (!mounted) return;

      if (!session) {
        setChecking(false);
        router.replace(`/login?redirect=${encodeURIComponent(router.asPath)}`);
      } else {
        setChecking(false);
      }
    }

    // Keep UI responsive to auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!mounted) return;
      if (!s && !PUBLIC_PATHS.includes(router.pathname)) {
        setChecking(false);
        router.replace('/login');
      } else if (s) {
        setChecking(false);
      }
    });

    if (router.isReady) run();

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [supabase, router]);

  return { checking };
}
