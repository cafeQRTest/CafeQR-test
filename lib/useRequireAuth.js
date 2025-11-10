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
      // Cold start bootstrap (restore tokens before any decision)
      await bootstrapSupabaseSession();                    // restore via setSession, if needed [web:626]
      await forceSupabaseSessionRestore();                 // read tokens from storage adapter [web:626]
      const initial = await waitForInitialSession();       // wait for INITIAL_SESSION once [web:626]
      if (initial) {
        try { await supabase.auth.startAutoRefresh(); } catch {} // keep tokens alive in foreground [web:609]
        await ensureSessionValid();                        // refresh if near expiry [web:614]
      }

      // Single read after bootstrap to decide
      const { data } = await supabase.auth.getSession();   // [web:626]
      const session = data?.session;
      const path = router.pathname;

      if (!mounted) return;

      // If on public auth pages but already signed in, bounce to destination
      if (PUBLIC_PATHS.includes(path)) {
        if (session) {
          const redirect = router.query?.redirect ? String(router.query.redirect) : '/owner';
          setChecking(false);
          router.replace(redirect);
        } else {
          setChecking(false);
        }
        return;
      }

      // For protected pages, enforce sign-in
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
      const path = router.pathname;
      if (!s && !PUBLIC_PATHS.includes(path)) {
        setChecking(false);
        router.replace('/login');
      } else if (s && PUBLIC_PATHS.includes(path)) {
        setChecking(false);
        router.replace('/owner');
      } else {
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
