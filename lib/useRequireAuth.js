// lib/useRequireAuth.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabase, forceSupabaseSessionRestore } from '../services/supabase';
import { ensureSessionValid } from '../lib/authActions';

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/privacy-policy', '/faq', '/'];

export function useRequireAuth() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const supabase = getSupabase();

  useEffect(() => {
    let isMounted = true;

    async function restoreAndVerify() {
      await forceSupabaseSessionRestore();                 // restore from storage [web:626]
      await ensureSessionValid();                          // refresh if expiring/expired [web:614]
      const { data: sessionData, error } = await supabase.auth.getSession(); // single read [web:626]
      const session = sessionData?.session;

      if (error) console.error('Error fetching session:', error.message);

      // Public paths skip
      if (PUBLIC_PATHS.includes(router.pathname)) {
        if (isMounted) setChecking(false);
        return;
      }

      if (isMounted) {
        if (!session) {
          setChecking(false);
          router.replace(`/login?redirect=${encodeURIComponent(router.asPath)}`);
        } else {
          setChecking(false);
        }
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s && !PUBLIC_PATHS.includes(router.pathname)) {
        setChecking(false);
        router.replace('/login');
      } else if (s) {
        setChecking(false);
      }
    });                                                   // stays the same [web:626]

    if (router.isReady) restoreAndVerify();

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [supabase, router]);

  return { checking };
}
