// lib/firebase/messaging.js
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { setStoredPushToken } from '../push/tokenStore';

const isDev = process.env.NODE_ENV !== 'production';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_APIKEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDERID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

const STATIC_VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || process.env.NEXT_PUBLIC_VAPID_KEY || '';
let warnedMissingVapid = false;
let cachedVapidKey = STATIC_VAPID_KEY;
let foregroundListenerBound = false;

function hasWebFirebaseConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId
  );
}

function initializeFirebaseApp() {
  if (!hasWebFirebaseConfig()) {
    if (isDev) {
      console.warn('[push:web] Missing NEXT_PUBLIC_FIREBASE_* config for messaging');
    }
    return null;
  }
  if (!getApps().length) return initializeApp(firebaseConfig);
  return getApps()[0];
}

async function ensureMessagingServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  } catch (e) {
    console.warn('[push:web] service worker registration failed:', e?.message || e);
    return null;
  }
}

async function resolveVapidKey() {
  if (cachedVapidKey) return cachedVapidKey;
  if (typeof window === 'undefined') return '';
  try {
    const resp = await fetch('/api/push/web-config');
    if (!resp.ok) return '';
    const json = await resp.json();
    const key = String(json?.vapidKey || '').trim();
    if (key) cachedVapidKey = key;
    return key;
  } catch {
    return '';
  }
}

function attachForegroundNotificationHandler(messaging) {
  if (foregroundListenerBound || typeof window === 'undefined') return;
  foregroundListenerBound = true;

  onMessage(messaging, async (payload) => {
    console.log('[push:web] Foreground message received:', payload);
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const title = payload?.data?.title || payload?.notification?.title || 'New Order';
      const body = payload?.data?.body || payload?.notification?.body || 'You have a new order.';
      const orderId = payload?.data?.orderId || '';
      const options = {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: orderId ? `new-order-${orderId}` : 'new-order',
        data: payload?.data || {},
      };

      try {
        const reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
        if (reg) {
          await reg.showNotification(title, options);
          return;
        }
      } catch { }

      // Fallback if SW registration is unavailable in this moment.
      new Notification(title, options);
    } catch (e) {
      console.warn('[push:web] foreground notification failed:', e?.message || e);
    }
  });
}

export async function getFCMToken({ requestPermission = false } = {}) {
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window)) return null;

  try {
    const currentPermission = Notification.permission;
    const permission = requestPermission
      ? await Notification.requestPermission()
      : currentPermission;

    if (permission !== 'granted') return null;

    const vapidKey = await resolveVapidKey();
    if (!vapidKey) {
      if (!warnedMissingVapid) {
        warnedMissingVapid = true;
        console.warn('[push:web] NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing');
      }
      return null;
    }

    const app = initializeFirebaseApp();
    if (!app) return null;

    const messaging = getMessaging(app);
    attachForegroundNotificationHandler(messaging);

    const registration = await ensureMessagingServiceWorker();
    if (!registration) {
      console.warn('[push:web] No service worker registration available for FCM');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (token) setStoredPushToken(token);
    return token || null;
  } catch (e) {
    console.error('[push:web] getToken failed:', e?.message || e);
    return null;
  }
}
