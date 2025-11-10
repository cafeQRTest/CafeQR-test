// lib/useRequireAuth.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabase, forceSupabaseSessionRestore } from '../services/supabase';
import { ensureSessionValid } from '../lib/authActions';
import { waitForInitialSession } from '../lib/authBootstrap';
import { bootstrapSupabaseSession } from '../services/supabase';


const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/privacy-policy', '/faq', '/'];

export function useRequireAuth() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const supabase = getSupabase();

  useEffect(() => {
    let mounted = true;

    async function run() {

       if (PUBLIC_PATHS.includes(router.pathname)) { setChecking(false); return; }

  await bootstrapSupabaseSession();                      // restore via setSession if needed [web:626]
  await forceSupabaseSessionRestore();                   // read from adapter [web:626]
  const initSession = await waitForInitialSession();     // wait INITIAL_SESSION once [web:626]
  if (initSession) {
    try { await supabase.auth.startAutoRefresh(); } catch {}
    await ensureSessionValid();                          // refresh if expiring [web:614]
  }

      if (PUBLIC_PATHS.includes(router.pathname)) {
        if (mounted) setChecking(false);
        return;
      }

      // Cold start: ensure storage → wait for INITIAL_SESSION → refresh if near expiry
      await forceSupabaseSessionRestore();                 // load from Capacitor Preferences [web:626]
      const initSession = await waitForInitialSession();   // wait once for stored session
      if (initSession) {
        try { await supabase.auth.startAutoRefresh(); } catch {}  // keep tokens alive [web:609]
        await ensureSessionValid();                        // refresh if expiring [web:614]
      }

      const { data } = await supabase.auth.getSession();   // single read after bootstrap [web:626]
      const session = data?.session;

      if (!mounted) return;

      if (!session) {
        setChecking(false);
        router.replace(`/login?redirect=${encodeURIComponent(router.asPath)}`);
      } else {
        setChecking(false);
      }
    }

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
