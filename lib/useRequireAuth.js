//lib/useRequireAuth.js

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { getSupabase, forceSupabaseSessionRestore } from '../services/supabase'

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/privacy-policy', '/faq', '/']

export function useRequireAuth() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const supabase = getSupabase()

  useEffect(() => {
    let isMounted = true

    async function restoreAndVerify() {
      // Force restore session from persistent storage (especially for native)
      await forceSupabaseSessionRestore()

      if (!supabase) {
        if (isMounted) setChecking(false)
        return
      }

      // Skip check on public paths
      if (PUBLIC_PATHS.includes(router.pathname)) {
        if (isMounted) setChecking(false)
        return
      }

      // Get current session
      const { data, error } = await supabase.auth.getSession()
      const session = data?.session

      if (error) {
        console.error('Error fetching session:', error.message)
      }

      if (isMounted) {
        if (!session) {
          setChecking(false)
          router.replace(`/login?redirect=${encodeURIComponent(router.asPath)}`)
        } else {
          setChecking(false)
        }
      }
    }

    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !PUBLIC_PATHS.includes(router.pathname)) {
        setChecking(false)
        router.replace('/login')
      } else if (session) {
        setChecking(false)
      }
    })

    // Initial verification
    if (router.isReady) {
      restoreAndVerify()
    }

    return () => {
      isMounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [supabase, router])

  return { checking }
}
