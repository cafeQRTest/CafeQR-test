import Head from 'next/head'
import '../styles/globals.css'
import '../styles/theme.css'
import '../styles/responsive.css'
import '../styles/tailwind.css'
import Layout from '../components/Layout'
import KotPrint from '../components/KotPrint'
import { RestaurantProvider } from '../context/RestaurantContext'
import { SubscriptionProvider, useSubscription } from '../context/SubscriptionContext'
import { AlertProvider } from '../context/AlertContext'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { getFCMToken } from '../lib/firebase/messaging'
import { arePushAlertsDisabled, detectPushPlatform, getStoredPushToken, setStoredPushToken } from '../lib/push/tokenStore'
import { CustomerAuthProvider, useCustomerAuth } from "../context/CustomerAuthContext";
import {
  getSupabase
} from '../services/supabase'
import { ensureSessionValid } from '../lib/authActions'
import { usePrintService } from '../lib/usePrintService'

import ReactQueryProvider from '../lib/react-query-provider';
import PushBanner from '../components/PushBanner';

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
  } catch { }
  if (!rid) return
  try {
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE || ''}/api/push/subscribe-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: rid, platform, deviceToken: token })
    })
  } catch { }
}

// return async initializers to support the “()()” call style
function safeInitNative(router) {
  return async () => {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      await PushNotifications.createChannel({
        id: 'orders',
        name: 'Orders',
        description: 'Order alerts',
        importance: 5
      }).catch(() => { })
      PushNotifications.removeAllListeners().catch(() => { })
      PushNotifications.addListener('pushNotificationReceived', notification => {
        window.dispatchEvent(
          new CustomEvent('new-order-push', { detail: notification })
        );
      })
      PushNotifications.addListener('pushNotificationActionPerformed', action => {
        const url = action.notification?.data?.url || '/owner/orders'
        router.push(url).catch(() => {
          window.location.href = url
        })
      })
      const perm = await PushNotifications.checkPermissions()
      if (perm.receive !== 'granted') return
      PushNotifications.addListener('registration', ({ value }) => {
        setStoredPushToken(value)
        if (arePushAlertsDisabled()) return
        postSubscribe(value, 'android')
      })
      await PushNotifications.register()
    } catch { }
  }
}

function safeInitWebOnly() {
  return async () => {
    try {
      if (arePushAlertsDisabled()) return
      const token = await getFCMToken({ requestPermission: false })
      if (token) {
        setStoredPushToken(token)
        await postSubscribe(token, 'web')
      }
    } catch { }
  }
}

async function ensureSubscribed() {
  if (typeof window === 'undefined') return
  if (arePushAlertsDisabled()) return
  let token = getStoredPushToken()
  const platform = detectPushPlatform()

  if (platform === 'web' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    // Refresh token opportunistically (FCM rotates tokens in some cases).
    const refreshed = await getFCMToken({ requestPermission: false })
    if (refreshed) token = refreshed
  }

  if (!token) return
  await postSubscribe(token, platform)
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

      // If we have a session but NO subscription object yet, wait (context might be catching up)
      if (session && !subscription && !loading) return;

      if (isOwner && !onSubPage && session && subscription?.is_active === false) {
        if (mounted) {
          console.log('[Gate] Redirecting to subscription (Inactive)');
          router.replace(`/owner/subscription${window.location.search}`)
        }
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
    const onAutoPrint = e => {
      console.log('[APP PRINT ORCHESTRATOR] Received auto-print-order event:', e.detail);
      setOrderToPrint(e.detail);
    };
    window.addEventListener('auto-print-order', onAutoPrint);
    console.log('[APP PRINT ORCHESTRATOR] Event listener attached');
    return () => {
      window.removeEventListener('auto-print-order', onAutoPrint);
      console.log('[APP PRINT ORCHESTRATOR] Event listener removed');
    };
  }, []);

  console.log('[APP PRINT ORCHESTRATOR] Rendering, orderToPrint:', orderToPrint?.id);

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

// Routes that REQUIRE customer login
const DELIVERY_PREFIX = "/app";
const DELIVERY_AUTH_ROUTES = [
  "/app/auth",
  "/app/auth/callback",
];

// Adjust these to match your actual “must be logged in” pages
const DELIVERY_PROTECTED_PREFIXES = [
  "/app/address",
  "/app/profile",
  "/app/payment",
];

function DeliveryAuthGate({ children }) {
  const router = useRouter();
  const { loading, isLoggedIn } = useCustomerAuth();

  const path = router.pathname || "";
  const isDelivery = path.startsWith(DELIVERY_PREFIX);
  const isAuthPage = DELIVERY_AUTH_ROUTES.includes(path);

  const isProtected =
    isDelivery &&
    !isAuthPage &&
    DELIVERY_PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  useEffect(() => {
    if (!router.isReady) return;
    if (!isProtected) return;
    if (loading) return;

    if (!isLoggedIn) {
      router.replace(`/app/auth?next=${encodeURIComponent(router.asPath)}`);
    }
  }, [router, loading, isLoggedIn, isProtected]);

  // Optional loader (prevents flashing protected page before redirect)
  if (isProtected && (loading || !isLoggedIn)) {
    if (isDelivery) return null; // Delivery app handles its own unblocked loading or uses different strategy
    return <div style={{ padding: 40, textAlign: 'center' }}>Logging out...</div>;
  }

  return <>{children}</>;
}


// ── MyApp ────────────────────────────────────────────────────────────────────
function MyApp({ Component, pageProps }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Persist/restore Supabase auth (Simplified)
  // No need for snapshots anymore, client adapter handles it.
  useEffect(() => {
    // Just ensure the listener is active if needed, but Context handles most of it.
    // We can keep this empty or minimal if no global sync is needed.
  }, [])

  // App foreground/background lifecycle + token refresh
  useEffect(() => {
    if (!router.isReady) return
    let cleanup = () => { }
      ; (async () => {
        let NativeApp
        try {
          ; ({ App: NativeApp } = await import('@capacitor/app'))
        } catch { }
        const supabase = getSupabase()
        const onForeground = async () => {
          // Native persistence is handled by adapter. Just ensure valid session.
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
            } catch { }
            if (canGoBack) window.history.back()
            else if (path.startsWith(OWNER_PREFIX)) NativeApp.exitApp?.()
            else if (path.startsWith(DELIVERY_PREFIX)) router.replace('/app')
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
    // Simply set ready, session is auto-restored
    if (mounted) setReady(true);
  }, [mounted])

  // FCM/web init
  useEffect(() => {
    if (!router.isReady || !ready) return
    let isMounted = true
      ; (async () => {
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

  const path = router.pathname || ''
  const isOwner = path.startsWith(OWNER_PREFIX)
  const isCustomer = path.startsWith(CUSTOMER_PREFIX)
  const isDeliveryApp = path.startsWith(DELIVERY_PREFIX)

  if (!mounted || !router.isReady) {
    if (isDeliveryApp || path === '/') return null; // Let the delivery apps paint immediately!
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <ReactQueryProvider>
        <CustomerAuthProvider>
          <DeliveryAuthGate>
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
                    {/* Only render print orchestrator for POS/owner routes, not delivery app */}
                    {!isDeliveryApp && <AppPrintOrchestrator />}
                    <PushBanner />
                  </GlobalSubscriptionGate>
                </SubscriptionProvider>
              </AlertProvider>
            </RestaurantProvider>
          </DeliveryAuthGate>
        </CustomerAuthProvider>
      </ReactQueryProvider>
    </>
  );
}

export default MyApp
