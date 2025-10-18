// pages/_app.js
import '../styles/responsive.css'
import '../styles/globals.css'
import '../styles/theme.css'
import Layout from '../components/Layout'
import { RestaurantProvider } from '../context/RestaurantContext'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { getFCMToken } from '../lib/firebase/messaging'

const OWNER_PREFIX = '/owner'
const CUSTOMER_PREFIX = '/order'

function safeInitNative(router, postSubscribe) {
  return async () => {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      try {
        await PushNotifications.createChannel({
          id: 'orders_v2',
          name: 'Orders',
          description: 'Order alerts',
          importance: 5,
          sound: 'beep',
          lights: true,
          vibration: true,
          visibility: 1,
        })
      } catch {}
      try { await PushNotifications.removeAllListeners() } catch {}
      PushNotifications.addListener('pushNotificationReceived', n =>
        console.log('Push foreground:', n?.title)
      )
      PushNotifications.addListener('pushNotificationActionPerformed', action => {
        const url = action.notification?.data?.url || '/owner/orders'
        try { router.push(url) } catch { window.location.href = url }
      })
      const perm = await PushNotifications.requestPermissions()
      if (perm.receive !== 'granted') return
      PushNotifications.addListener('registration', async ({ value }) => {
        localStorage.setItem('fcm_token', value)
        await postSubscribe(value, 'android')
      })
      PushNotifications.addListener('registrationError', err =>
        console.error('[PushInit] registrationError', err)
      )
      await PushNotifications.register()
    } catch (e) {
      console.warn('Native init skipped:', e?.message || e)
    }
  }
}

function safeInitWebOnly(postSubscribe) {
  return async () => {
    try {
      const token = await getFCMToken()
      if (token) {
        localStorage.setItem('fcm_token', token)
        await postSubscribe(token, 'web')
      }
    } catch (e) {
      console.log('Web push skipped:', e?.message || e)
    }
  }
}

const getApiBase = () => {
  if (typeof window === 'undefined') return ''
  const isProd = process.env.NODE_ENV === 'production'
  const envBase = process.env.NEXT_PUBLIC_API_BASE || ''
  if (Capacitor?.isNativePlatform?.()) {
    if (!isProd && envBase) return envBase
    if (!isProd) return 'http://10.0.2.2:3000'
  }
  return ''
}

const getActiveRestaurantId = () => {
  if (typeof window === 'undefined') return null
  try {
    const url = new URL(window.location.href)
    return (
      window.__activeRestaurantId ||
      url.searchParams.get('r') ||
      url.searchParams.get('rid') ||
      localStorage.getItem('active_restaurant_id') ||
      null
    )
  } catch {
    return null
  }
}

const postSubscribe = async (token, platform) => {
  if (!token) return
  const rid = getActiveRestaurantId()
  if (!rid) return
  const payload = { restaurantId: rid, platform, deviceToken: token }
  const url = `${getApiBase()}/api/push/subscribe-bridge`
  try {
    console.log('[Subscribe] POST ->', url)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    console.log('[Subscribe] response:', res.status, await res.text())
  } catch (e) {
    console.error('[Subscribe] request failed:', e?.message || e)
  }
}

const ensureSubscribed = async () => {
  if (typeof window === 'undefined') return
  try {
    const rid = getActiveRestaurantId()
    const token = localStorage.getItem('fcm_token')
    if (rid && token) {
      await postSubscribe(token, Capacitor.isNativePlatform() ? 'android' : 'web')
    }
  } catch (e) {
    console.warn('ensureSubscribed skipped:', e?.message || e)
  }
}

function MyApp({ Component, pageProps }) {
  const router = useRouter()
  const path = router.pathname || ''
  const isOwnerRoute = path.startsWith(OWNER_PREFIX)
  const isCustomerRoute = path.startsWith(CUSTOMER_PREFIX)
  const [statusChecked, setStatusChecked] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const init = async () => {
      if (Capacitor.isNativePlatform()) {
        await safeInitNative(router, postSubscribe)()
      } else {
        await safeInitWebOnly(postSubscribe)()
      }
      setTimeout(() => ensureSubscribed(), 1200)
    }
    init()
    const onRoute = () => ensureSubscribed()
    router.events?.on?.('routeChangeComplete', onRoute)
    window.addEventListener('focus', onRoute)
    return () => {
      router.events?.off?.('routeChangeComplete', onRoute)
      window.removeEventListener('focus', onRoute)
    }
  }, [router.events, router])

  useEffect(() => {
    if (!isOwnerRoute) return
    const rid = getActiveRestaurantId()
    if (!rid) return
    const gate = async () => {
      try {
        const res = await fetch(`/api/subscription/status?restaurant_id=${rid}`)
        const json = await res.json()
        if (!json.is_active && router.pathname !== '/owner/subscription') {
          router.replace('/owner/subscription')
        }
      } catch (e) {
        console.error('[gate] status check failed', e)
      } finally {
        setStatusChecked(true)
      }
    }
    gate()
  }, [isOwnerRoute, router])

  if (isOwnerRoute && !statusChecked) {
    return <div style={{ padding: 50, textAlign: 'center' }}>Checking subscription…</div>
  }

  return (
    <RestaurantProvider>
      <Layout
        title={pageProps?.title}
        showSidebar={isOwnerRoute}
        hideChrome={isCustomerRoute}
        showHeader={isCustomerRoute}
      >
        <Component {...pageProps} />
      </Layout>
    </RestaurantProvider>
  )
}

export default MyApp
