//lib/useRequireAuth.js

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabase } from '../services/supabase';

// Define your public paths here
const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/privacy-policy'];

export function useRequireAuth() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const supabase = getSupabase();

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    let isMounted = true;
    async function verifySession() {
      if (PUBLIC_PATHS.includes(router.pathname)) {
        if (isMounted) setChecking(false);
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;
      if (error) {
        console.error('Error fetching session:', error);
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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !PUBLIC_PATHS.includes(router.pathname)) {
        setChecking(false);
        router.replace('/login');
      }
    });
    verifySession();
    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [supabase, router]);
  return { checking };
}
