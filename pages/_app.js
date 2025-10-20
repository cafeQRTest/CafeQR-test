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

async function startTrialIfNeeded(restaurantId) {
  if (!restaurantId) return
  try {
    await fetch('/api/subscription/start-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId }),
    })
  } catch {}
}

function GlobalSubscriptionGate({ children }) {
  const router = useRouter()
  const path = router.pathname
  const isOwner = path.startsWith(OWNER_PREFIX)
  const onSubPage = path === '/owner/subscription'
  const exempt = PUBLIC_EXEMPT.includes(path)
  const { subscription, loading } = useSubscription()

  useEffect(() => {
    if (!router.isReady || loading) return
    if (isOwner && !onSubPage && !subscription?.is_active) {
      router.replace(`/owner/subscription${window.location.search}`)
    }
  }, [router, loading, isOwner, onSubPage, subscription])

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

  useEffect(() => {
    if (!router.isReady || ready) return
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

  useEffect(() => {
    if (!router.isReady || !ready) return
    const onRoute = url => {
      ensureSubscribed()
      if (url === '/owner') {
        startTrialIfNeeded(new URL(window.location.href).searchParams.get('r'))
      }
    }
    window.addEventListener('focus', ensureSubscribed)
    router.events.on('routeChangeComplete', onRoute)
    return () => {
      router.events.off('routeChangeComplete', onRoute)
      window.removeEventListener('focus', ensureSubscribed)
    }
  }, [router, ready])

  // Hydration-safe: don't render layout until mounted + router ready
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
