// /public/firebase-messaging-sw.js

/* global importScripts, firebase, self, clients */
try {
  importScripts('/api/push/sw-config');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
} catch (e) {
  // If CDN fails, keep SW alive (no push), but do not crash install/activate.
  console.warn('[fcm-sw] importScripts failed:', e?.message || e);
}

// No-op install/activate to avoid uncaught rejections blocking activation
self.addEventListener('install', (event) => {
  event.waitUntil(Promise.resolve());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients?.claim?.() || Promise.resolve());
});

let messaging;
try {
  const cfg = self.__FIREBASE_SW_CONFIG || {};
  if (cfg.apiKey && cfg.projectId && cfg.messagingSenderId && cfg.appId) {
    firebase?.initializeApp?.(cfg);
    messaging = firebase?.messaging?.();
  } else {
    console.warn('[fcm-sw] Missing Firebase config; background push disabled.');
  }
} catch (e) {
  // Still allow SW to run without FCM
  console.warn('[fcm-sw] firebase init failed:', e?.message || e);
}

// Helper to safely show notifications without throwing
async function safeShowNotification(title, options) {
  try {
    // Fallback assets if custom ones are missing
    const finalOptions = {
      icon: options?.icon || '/icons/icon-192.png',
      badge: options?.badge || '/icons/icon-192.png',
      tag: options?.tag || 'new-order',
      renotify: true,
      ...options
    };
    return await self.registration.showNotification(title, finalOptions);
  } catch (e) {
    console.warn('[fcm-sw] showNotification failed:', e?.message || e);
    return null;
  }
}

// Background payload handler
try {
  messaging?.onBackgroundMessage?.((payload) => {
    try {
      const title = payload?.data?.title || payload?.notification?.title || 'New Order';
      const body = payload?.data?.body || payload?.notification?.body || 'You have a new order.';
      const url = payload?.data?.url || '/owner/orders';
      const orderId = payload?.data?.orderId || '';
      const restaurantId = payload?.data?.restaurantId || '';
      const notificationTag = orderId ? `new-order-${orderId}` : 'new-order';

      const options = {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: notificationTag,
        vibrate: [200, 100, 200, 100, 200],
        silent: false,
        data: { url, orderId, restaurantId, ...payload?.data }
      };

      // In some browsers, playing audio in the background SW context might be blocked without interaction.
      // But we can still attempt it or rely on the OS's native webpush sound when sent by FCM.
      try {
        if (typeof Audio !== 'undefined') {
          const snd = new Audio('/beep.mp3');
          snd.play().catch(() => { });
        }
      } catch (e) { }

      return safeShowNotification(title, options);
    } catch (e) {
      console.warn('[fcm-sw] onBackgroundMessage error:', e?.message || e);
      return null;
    }
  });
} catch (e) {
  console.warn('[fcm-sw] registering background listener failed:', e?.message || e);
}

// Click → focus or open
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const relativeUrl = event?.notification?.data?.url || '/owner/orders';
  const urlToOpen = new URL(relativeUrl, self.location.origin).toString();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c && c.url?.includes(self.location.origin)) {
          return c.focus().then(() => (c.navigate ? c.navigate(urlToOpen) : null));
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
      return null;
    })
  );
});
