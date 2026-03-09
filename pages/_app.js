import Head from 'next/head'
import '../styles/globals.css'
import '../styles/theme.css'
import '../styles/responsive.css'
import '../styles/tailwind.css'
import Layout from '../components/Layout'
import KotPrint from '../components/KotPrint'
import { RestaurantProvider, useRestaurant } from '../context/RestaurantContext'
import { SubscriptionProvider, useSubscription } from '../context/SubscriptionContext'
import { AlertProvider } from '../context/AlertContext'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { getFCMToken } from '../lib/firebase/messaging'
import {
  arePushAlertsDisabled,
  clearStoredPushToken,
  detectPushPlatform,
  getStoredPushToken,
  setStoredPushToken
} from '../lib/push/tokenStore'
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
function isPushEnabledContext() {
  if (typeof window === 'undefined') return false;
  // Push alerts are owner-POS only.
  return window.location.pathname.startsWith(OWNER_PREFIX);
}

async function postSubscribe(token, platform, restaurantIdOverride = null) {
  if (!token) return
  let rid = null
  try {
    const url = new URL(window.location.href)
    rid =
      restaurantIdOverride ||
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

async function postUnsubscribeDevice(token) {
  if (!token) return;
  try {
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE || ''}/api/push/unsubscribe-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceToken: token })
    });
  } catch { }
}

async function postUnsubscribe(token) {
  if (!token) return;
  let rid = null;
  try {
    const url = new URL(window.location.href);
    rid =
      url.searchParams.get('r') ||
      url.searchParams.get('rid') ||
      localStorage.getItem('active_restaurant_id');
  } catch { }
  if (!rid) return;
  try {
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE || ''}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: rid, deviceToken: token })
    });
  } catch { }
}

// return async initializers to support the “()()” call style
function safeInitNative(router) {
  return async () => {
    try {
      if (!isPushEnabledContext()) {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        await PushNotifications.removeAllListeners().catch(() => { });
        return;
      }
      const { PushNotifications } = await import('@capacitor/push-notifications')
      await PushNotifications.createChannel({
        id: 'orders_sound_v2',
        name: 'Orders Sound',
        description: 'Order alerts with sound',
        importance: 5,
        visibility: 1,
        sound: 'beep',
        vibration: true
      }).catch((e) => { console.warn('createChannel', e) })
      PushNotifications.removeAllListeners().catch(() => { })
      PushNotifications.addListener('pushNotificationReceived', notification => {
        window.dispatchEvent(
          new CustomEvent('new-order-push', { detail: notification })
        );
      })
      PushNotifications.addListener('pushNotificationActionPerformed', action => {
        const data = action?.notification?.data || {}
        const orderId = data?.orderId ? String(data.orderId) : ''
        const type = String(data?.type || '').toLowerCase()
        const actionId = String(action?.actionId || '').toLowerCase()
        let url = data?.url || '/owner/orders'
        const normalizedAction =
          actionId.includes('accept') ? 'accept' :
            actionId.includes('decline') ? 'decline' :
              ''

        if (type === 'delivery_pending' && orderId && normalizedAction) {
          url = `/owner/orders?highlight=${encodeURIComponent(orderId)}&action=${normalizedAction}`
        }

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
      if (!isPushEnabledContext()) return;
      if (arePushAlertsDisabled()) return
      const token = await getFCMToken({ requestPermission: false })
      if (token) {
        setStoredPushToken(token)
        await postSubscribe(token, 'web')
      }
    } catch { }
  }
}

async function ensureSubscribed(restaurantIdOverride = null) {
  if (typeof window === 'undefined') return

  if (!isPushEnabledContext()) {
    // If not in a POS context, attempt to forcefully unsubscribe any leftover tokens.
    const leftoverToken = getStoredPushToken();
    if (leftoverToken) {
      await postUnsubscribeDevice(leftoverToken);
      clearStoredPushToken();
    }
    // Edge case for Native Capacitor:
    // If we're inside the webview and native push wasn't removed...
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      PushNotifications.removeAllListeners().catch(() => { });
    } catch (e) { }

    return;
  }

  if (arePushAlertsDisabled()) return
  let token = getStoredPushToken()
  const platform = detectPushPlatform()

  if (platform === 'web' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    // Refresh token opportunistically (FCM rotates tokens in some cases).
    const refreshed = await getFCMToken({ requestPermission: false })
    if (refreshed) token = refreshed
  }

  if (!token) return
  await postSubscribe(token, platform, restaurantIdOverride)
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

function formatPushAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  return ` • ₹${n.toFixed(2)}`;
}

function buildOwnerAlertPayload(orderRow, restaurantId) {
  if (!orderRow?.id) return null;
  const status = String(orderRow.status || '').toLowerCase();
  if (status !== 'new' && status !== 'pending_acceptance') return null;

  const orderId = String(orderRow.id);
  const orderType = String(orderRow.order_type || '').toLowerCase();
  const table = String(orderRow.table_number || '').trim();
  const shortOrderId = orderId.slice(0, 8).toUpperCase();
  const amount =
    orderRow.total_amount ?? orderRow.total_inc_tax ?? orderRow.total ?? null;
  const amountText = formatPushAmount(amount);

  const isPendingDelivery = status === 'pending_acceptance';
  const locationLabel =
    table && table.toUpperCase() === 'DELIVERY' ? 'Delivery' :
      table ? `Table ${table}` :
        orderType === 'delivery' ? 'Delivery' :
          orderType === 'takeaway' || orderType === 'parcel' ? 'Takeaway' :
            orderType === 'counter' ? 'Counter' :
              'Order';

  const title = isPendingDelivery
    ? '🔔 New Delivery Order — Action Required'
    : 'New Order';
  const body = isPendingDelivery
    ? `Tap to Accept or Decline • #${shortOrderId}${amountText}`
    : `${locationLabel} • #${shortOrderId}${amountText}`;
  const url = `/owner/orders?highlight=${encodeURIComponent(orderId)}`;
  const type = isPendingDelivery ? 'delivery_pending' : 'new_order';
  const rid = String(restaurantId || '');

  return {
    title,
    body,
    url,
    orderId,
    restaurantId: rid,
    type,
    data: {
      title,
      body,
      url,
      orderId,
      restaurantId: rid,
      type,
    },
  };
}

function GlobalOwnerAlertsBridge() {
  const router = useRouter();
  const { restaurant } = useRestaurant();
  const restaurantId = restaurant?.id ? String(restaurant.id) : '';
  const subscribedKeyRef = useRef('');
  const recentAlertsRef = useRef(new Map());

  const pathname = router.pathname || '';
  const isOwnerRoute = pathname.startsWith('/owner');
  const isOrdersPage = pathname === '/owner/orders';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!restaurantId) return;
    window.__activeRestaurantId = restaurantId;
    localStorage.setItem('active_restaurant_id', restaurantId);
  }, [restaurantId]);

  const ensureOwnerPushSubscribed = useCallback(async () => {
    if (!restaurantId) return;
    if (!isPushEnabledContext()) return;
    if (arePushAlertsDisabled()) return;

    try {
      const platform = detectPushPlatform();
      let token = getStoredPushToken();
      if (!token && platform === 'web' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        token = await getFCMToken({ requestPermission: false });
      }
      if (!token) return;

      const key = `${restaurantId}:${platform}:${token}`;
      if (subscribedKeyRef.current === key) return;
      await postSubscribe(token, platform, restaurantId);
      subscribedKeyRef.current = key;
    } catch (e) {
      console.warn('[push] owner bridge subscribe failed:', e?.message || e);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!isOwnerRoute) return;
    ensureOwnerPushSubscribed();
    window.addEventListener('focus', ensureOwnerPushSubscribed);
    return () => {
      window.removeEventListener('focus', ensureOwnerPushSubscribed);
    };
  }, [isOwnerRoute, ensureOwnerPushSubscribed]);

  // Realtime fallback for owner pages other than Orders page.
  // This keeps banner + sound functional even when push delivery is delayed/missed locally.
  useEffect(() => {
    if (!isOwnerRoute || isOrdersPage) return;
    if (!restaurantId) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`global-order-alerts:${restaurantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (arePushAlertsDisabled()) return;

          const detail = buildOwnerAlertPayload(payload?.new, restaurantId);
          if (!detail) return;

          const now = Date.now();
          const key = `${detail.type}:${detail.orderId}`;
          const recent = recentAlertsRef.current;
          const prevTs = recent.get(key) || 0;
          if (now - prevTs < 10000) return;
          recent.set(key, now);

          if (recent.size > 500) {
            const trimCount = Math.max(100, recent.size - 350);
            let idx = 0;
            for (const k of recent.keys()) {
              recent.delete(k);
              idx += 1;
              if (idx >= trimCount) break;
            }
          }

          window.dispatchEvent(new CustomEvent('new-order-push', { detail }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOwnerRoute, isOrdersPage, restaurantId]);

  return null;
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
  }, [router, router.isReady, router.pathname])

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
        <meta name="theme-color" content="#ea580c" />
        <meta name="robots" content="index, follow" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
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
                    <GlobalOwnerAlertsBridge />
                    {/* Render owner-only alert/print surfaces only in POS routes */}
                    {isOwner && <AppPrintOrchestrator />}
                    {isOwner && <PushBanner />}
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
