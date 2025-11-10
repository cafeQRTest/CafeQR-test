// lib/useRequireAuth.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Capacitor } from '@capacitor/core';
import { getSupabase, forceSupabaseSessionRestore } from '../services/supabase';
import { ensureSessionValid } from '../lib/authActions';

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/privacy-policy', '/faq', '/'];

export function useRequireAuth() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const supabase = getSupabase();

  useEffect(() => {
    let mounted = true;

    async function waitForSession(maxTries = Capacitor.isNativePlatform() ? 6 : 2, delayMs = 150) {
      // Try a few times to allow Preferences to resolve on native
      for (let i = 0; i < maxTries; i++) {
        await forceSupabaseSessionRestore();                 // read from storage [web:626]
        await ensureSessionValid();                          // refresh if expiring [web:614]
        const { data } = await supabase.auth.getSession();   // single read [web:626]
        if (data?.session) return data.session;
        await new Promise(r => setTimeout(r, delayMs));
      }
      return null;
    }

    async function run() {
      // Public routes never block
      if (PUBLIC_PATHS.includes(router.pathname)) {
        if (mounted) setChecking(false);
        return;
      }

      const session = await waitForSession();

      if (!mounted) return;
      if (!session) {
        setChecking(false);
        router.replace(`/login?redirect=${encodeURIComponent(router.asPath)}`);
        return;
      }

      // Start auto refresh when we do have a session (especially on native) [web:609]
      try { await supabase.auth.startAutoRefresh(); } catch {}

      setChecking(false);
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
