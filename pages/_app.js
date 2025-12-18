import '../styles/responsive.css'
import '../styles/globals.css'
import '../styles/theme.css'
import Layout from '../components/Layout'
import KotPrint from '../components/KotPrint'
import { RestaurantProvider } from '../context/RestaurantContext'
import { SubscriptionProvider, useSubscription } from '../context/SubscriptionContext'
import { AlertProvider } from '../context/AlertContext'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { getFCMToken } from '../lib/firebase/messaging'
import {
  getSupabase,
  forceSupabaseSessionRestore,
  bootstrapSupabaseSession,
  saveSessionSnapshot,
  clearSessionSnapshot
} from '../services/supabase'
import { ensureSessionValid } from '../lib/authActions'
import { usePrintService } from '../lib/usePrintService'

// ── constants ────────────────────────────────────────────────────────────────
const OWNER_PREFIX = '/owner'
const CUSTOMER_PREFIX = '/order'
const PUBLIC_EXEMPT = ['/order/success', '/order/thank-you']

// ── helpers (module scope) ───────────────────────────────────────────────────
async function postSubscribe(token, platform) {
  if (!token) return
  let rid = null
  try {
    const url = new URL(window.location.href)
    rid =
      url.searchParams.get('r') ||
      url.searchParams.get('rid') ||
      localStorage.getItem('active_restaurant_id')
  } catch {}
  if (!rid) return
  try {
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE || ''}/api/push/subscribe-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: rid, platform, deviceToken: token })
    })
  } catch {}
}

// return async initializers to support the “()()” call style
function safeInitNative(router) {
  return async () => {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      await PushNotifications.createChannel({
        id: 'orders_v2',
        name: 'Orders',
        description: 'Order alerts',
        importance: 5
      }).catch(() => {})
      PushNotifications.removeAllListeners().catch(() => {})
      PushNotifications.addListener('pushNotificationActionPerformed', action => {
        const url = action.notification?.data?.url || '/owner/orders'
        router.push(url).catch(() => {
          window.location.href = url
        })
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

// ── subscription gate (must return children or null) ─────────────────────────
function GlobalSubscriptionGate({ children }) {
  const router = useRouter()
  const path = router.pathname
  const onSubPage = path === '/owner/subscription'
  const exempt = PUBLIC_EXEMPT.includes(path)
  const { subscription, loading } = useSubscription()

  useEffect(() => {
    let mounted = true
    async function checkAndRedirect() {
      if (!router.isReady || loading) return
      const supabase = getSupabase()
      const { data } = await supabase.auth.getSession()
      const session = data?.session
      const isOwner = path.startsWith(OWNER_PREFIX)
      if (isOwner && !onSubPage && session && !subscription?.is_active) {
        if (mounted) router.replace(`/owner/subscription${window.location.search}`)
      }
    }
    checkAndRedirect()
    return () => {
      mounted = false
    }
  }, [router, path, loading, onSubPage, subscription])

  if (
    (path.startsWith(CUSTOMER_PREFIX) || path.startsWith('/kitchen')) &&
    !exempt &&
    !loading &&
    !subscription?.is_active
  ) {
    return (
      <div style={{ padding: 80, textAlign: 'center', color: '#dc2626', fontSize: 18 }}>
        <strong>Subscription expired or inactive.</strong>
        <br />
        Online menu & orders unavailable.
      </div>
    )
  }

  return <>{children}</>
}

// ── print orchestrator (under providers) ─────────────────────────────────────
function AppPrintOrchestrator() {
  const [orderToPrint, setOrderToPrint] = useState(null);
  usePrintService(true);

  useEffect(() => {
    const onAutoPrint = e => setOrderToPrint(e.detail);
    window.addEventListener('auto-print-order', onAutoPrint);
    return () => window.removeEventListener('auto-print-order', onAutoPrint);
  }, []);

  if (!orderToPrint) return null;
  return (
    <KotPrint
      key={orderToPrint.id}
      order={orderToPrint}
      autoPrint={orderToPrint.autoPrint ?? true}
      kind={orderToPrint.kind || 'bill'}
      onClose={() => setOrderToPrint(null)}
      onPrint={() => setOrderToPrint(null)}
    />
  );
}

// ── MyApp ────────────────────────────────────────────────────────────────────
function MyApp({ Component, pageProps }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Persist/restore Supabase auth
  useEffect(() => {
    const supabase = getSupabase()
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') clearSessionSnapshot()
      else if (session) saveSessionSnapshot(session)
    })
    return () => subscription?.unsubscribe()
  }, [])

  // App foreground/background lifecycle + token refresh
  useEffect(() => {
    if (!router.isReady) return
    let cleanup = () => {}
    ;(async () => {
      let NativeApp
      try {
        ;({ App: NativeApp } = await import('@capacitor/app'))
      } catch {}
      const supabase = getSupabase()
      const onForeground = async () => {
        await bootstrapSupabaseSession()
        await forceSupabaseSessionRestore()
        await supabase.auth.startAutoRefresh()
        await ensureSessionValid()
      }
      if (NativeApp?.addListener) {
        const backSub = await NativeApp.addListener('backButton', async ({ canGoBack }) => {
          const path = router.pathname
          try {
            const { data } = await getSupabase().auth.getSession()
            if ((path === '/login' || path === '/signup') && data?.session) {
              router.replace('/owner')
              return
            }
          } catch {}
          if (canGoBack) window.history.back()
          else if (path.startsWith(OWNER_PREFIX)) NativeApp.exitApp?.()
          else router.replace('/owner')
        })
        const prev = cleanup
        cleanup = () => {
          backSub?.remove()
          prev?.()
        }
      }
      const onFocus = () => onForeground()
      const onVis = () => {
        if (!document.hidden) onForeground()
      }
      window.addEventListener('focus', onFocus)
      document.addEventListener('visibilitychange', onVis)
      onForeground()
      const prev2 = cleanup
      cleanup = () => {
        prev2?.()
        window.removeEventListener('focus', onFocus)
        document.removeEventListener('visibilitychange', onVis)
      }
    })()
    return () => cleanup()
  }, [router.isReady])

  useEffect(() => {
    setMounted(true)
  }, [])
  useEffect(() => {
    if (mounted) forceSupabaseSessionRestore().then(() => setReady(true))
  }, [mounted])

  // FCM/web init
  useEffect(() => {
    if (!router.isReady || !ready) return
    let isMounted = true
    ;(async () => {
      if (Capacitor.isNativePlatform()) await safeInitNative(router)()
      else await safeInitWebOnly()()
      setTimeout(ensureSubscribed, 1200)
      if (isMounted) setReady(true)
    })()
    return () => {
      isMounted = false
    }
  }, [router, ready])

  // Re‑post subscription on focus/route
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

  if (!mounted || !router.isReady) return <div>Loading...</div>

  const path = router.pathname || ''
  const isOwner = path.startsWith(OWNER_PREFIX)
  const isCustomer = path.startsWith(CUSTOMER_PREFIX)

  return (
    <RestaurantProvider>
      <AlertProvider>
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
            <AppPrintOrchestrator />
          </GlobalSubscriptionGate>
        </SubscriptionProvider>
      </AlertProvider>
    </RestaurantProvider>
  )
}

export default MyApp
