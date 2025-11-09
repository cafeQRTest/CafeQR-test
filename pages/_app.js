// pages/_app.js - CORRECTED

import '../styles/responsive.css'
import '../styles/globals.css'
import '../styles/theme.css'
import Layout from '../components/Layout'
import { RestaurantProvider } from '../context/RestaurantContext'
import { SubscriptionProvider, useSubscription } from '../context/SubscriptionContext'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { getFCMToken } from '../lib/firebase/messaging'
import { getSupabase, forceSupabaseSessionRestore } from '../services/supabase'
// pages/_app.js
import { App as CapApp } from '@capacitor/app';          // present at build time [web:616]
import { ensureSessionValid } from '../lib/authActions';

// pages/_app.js (inside a client-side useEffect)
useEffect(() => {
  if (!router.isReady) return;
  let remove = () => {};
  (async () => {
    // dynamic import so web builds without the plugin still succeed
    let CapApp;
    try { ({ App: CapApp } = await import('@capacitor/app')); } catch {}
    const supabase = getSupabase();

    const onForeground = async () => {
      await forceSupabaseSessionRestore();            // restore saved session [web:626]
      await supabase.auth.startAutoRefresh();         // start timers in foreground [web:609]
      await ensureSessionValid();                     // refresh if expiring/expired [web:614]
    };
    const onBackground = async () => {
      await supabase.auth.stopAutoRefresh();          // pause timers in background [web:611]
    };

    // Wire Capacitor appStateChange if plugin resolved
    if (CapApp?.addListener) {
      const sub = await CapApp.addListener('appStateChange', ({ isActive }) => {
        isActive ? onForeground() : onBackground();
      });
      remove = () => sub.remove();
    }

    // Also cover pure web/PWA
    const onFocus = () => onForeground();
    const onVis = () => { if (!document.hidden) onForeground(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);

    // cold start
    onForeground();

    // cleanup
    remove = ((prev) => () => {
      prev?.();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    })(remove);
  })();
  return () => remove();
}, [router.isReady]);


const OWNER_PREFIX = '/owner'
const CUSTOMER_PREFIX = '/order'
const PUBLIC_EXEMPT = ['/order/success', '/order/thank-you']

async function postSubscribe(token, platform) {
  if (!token) return
  let rid = null
  try {
    const url = new URL(window.location.href)
    rid = url.searchParams.get('r') || url.searchParams.get('rid') || localStorage.getItem('active_restaurant_id')
  } catch {}
  if (!rid) return
  try {
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE || ''}/api/push/subscribe-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: rid, platform, deviceToken: token }),
    })
  } catch {}
}

function safeInitNative(router) {
  return async () => {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      await PushNotifications.createChannel({ id:'orders_v2', name:'Orders', description:'Order alerts', importance:5 }).catch(() => {})
      PushNotifications.removeAllListeners().catch(() => {})
      PushNotifications.addListener('pushNotificationActionPerformed', action => {
        const url = action.notification?.data?.url || '/owner/orders'
        router.push(url).catch(() => { window.location.href = url })
      })
      const perm = await PushNotifications.requestPermissions()
      if (perm.receive !== 'granted') return
      PushNotifications.addListener('registration', ({ value }) => {
        localStorage.setItem('fcm_token', value)
        postSubscribe(value, 'android')
      })
      await PushNotifications.register()
    } catch {}
  }
}

function safeInitWebOnly() {
  return async () => {
    try {
      const token = await getFCMToken()
      if (token) {
        localStorage.setItem('fcm_token', token)
        await postSubscribe(token, 'web')
      }
    } catch {}
  }
}

async function ensureSubscribed() {
  if (typeof window === 'undefined') return
  const token = localStorage.getItem('fcm_token')
  if (!token) return
  await postSubscribe(token, Capacitor.isNativePlatform() ? 'android' : 'web')
}

function GlobalSubscriptionGate({ children }) {
  const router = useRouter()
  const path = router.pathname
  const isOwner = path.startsWith('/owner')
  const onSubPage = path === '/owner/subscription'
  const exempt = ['/order/success', '/order/thank-you'].includes(path)
  const { subscription, loading } = useSubscription()

  useEffect(() => {
    let mounted = true
    async function checkAndRedirect() {
      if (!router.isReady || loading) return
      
      const supabase = getSupabase()
      const { data } = await supabase.auth.getSession()
      const session = data?.session

      // ✅ CRITICAL FIX: Redirect to subscription for ANY non-subscription owner page if expired
      if (isOwner && !onSubPage && session) {
        if (!subscription?.is_active) {
          // Redirect to subscription page to allow renewal
          if (mounted) {
            router.replace(`/owner/subscription${window.location.search}`)
          }
        }
      }
    }

    checkAndRedirect()
    return () => { mounted = false }
  }, [router, loading, isOwner, onSubPage, subscription])

  // Block customer/kitchen access if expired
  if (
    (path.startsWith('/order') || path.startsWith('/kitchen')) &&
    !exempt &&
    !loading &&
    !subscription?.is_active
  ) {
    return (
      <div style={{ padding: 80, textAlign: 'center', color: '#dc2626', fontSize: 18 }}>
        <strong>Subscription expired or inactive.</strong><br />
        Online menu & orders unavailable.
      </div>
    )
  }

  return <>{children}</>
}

function MyApp({ Component, pageProps }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Track client mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // CRITICAL: Restore session on app cold-start
  useEffect(() => {
    if (!mounted) return
    let isMounted = true
    
    const initSession = async () => {
      // Force restore from storage immediately on mount
      await forceSupabaseSessionRestore()
      if (isMounted) setReady(true)
    }
    
    initSession()
    return () => { isMounted = false }
  }, [mounted])

  // Initialize FCM
  useEffect(() => {
    if (!router.isReady || !ready) return
    let isMounted = true
    const init = async () => {
      if (Capacitor.isNativePlatform()) {
        await safeInitNative(router)()
      } else {
        await safeInitWebOnly()()
      }
      setTimeout(ensureSubscribed, 1200)
      if (isMounted) setReady(true)
    }
    init()
    return () => { isMounted = false }
  }, [router, ready])

  // Setup route listeners
  useEffect(() => {
    if (!router.isReady || !ready) return
    
    const onRoute = () => {
      ensureSubscribed()
    }
    
    window.addEventListener('focus', ensureSubscribed)
    router.events.on('routeChangeComplete', onRoute)
    
    return () => {
      router.events.off('routeChangeComplete', onRoute)
      window.removeEventListener('focus', ensureSubscribed)
    }
  }, [router, ready])

  if (!mounted || !router.isReady) {
    return <div>Loading...</div>
  }

  const path = router.pathname || ''
  const isOwner = path.startsWith(OWNER_PREFIX)
  const isCustomer = path.startsWith(CUSTOMER_PREFIX)

  return (
    <RestaurantProvider>
      <SubscriptionProvider>
        <GlobalSubscriptionGate>
          <Layout
            title={pageProps.title}
            showSidebar={isOwner}
            hideChrome={isCustomer}
            showCustomerHeader={isCustomer}
          >
            <Component {...pageProps} />
          </Layout>
        </GlobalSubscriptionGate>
      </SubscriptionProvider>
    </RestaurantProvider>
  )
}

export default MyApp