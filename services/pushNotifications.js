// services/pushNotifications.js
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { setStoredPushToken } from '../lib/push/tokenStore';

export class PushNotificationService {
  static async initialize(restaurantId, userId) {
    try {
      if (!Capacitor.isNativePlatform()) return;
      if (!restaurantId) {
        console.warn('[PushInit] missing restaurantId; skip subscribe');
        return;
      }

      try { await PushNotifications.removeAllListeners(); } catch {}

      const perm = await PushNotifications.checkPermissions();
      const finalPerm = perm.receive === 'prompt'
        ? await PushNotifications.requestPermissions()
        : perm;
      if (finalPerm.receive !== 'granted') {
        console.warn('[PushInit] permission not granted');
        return;
      }

      // Foreground/debug listeners
      PushNotifications.addListener('pushNotificationReceived', (n) => {
        console.log('[PushInit] foreground push:', n?.title || n?.data?.title || '(no title)');
      });

      // Registration → SUBSCRIBE
      PushNotifications.addListener('registration', async ({ value }) => {
        const token = value;
        console.log('[PushInit] token:', token?.slice(0, 24));
        try { setStoredPushToken(token); } catch {}

        // POST to subscribe API and log result
        try {
          const res = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              restaurantId,
              userEmail: userId || null,
              platform: 'android',
              deviceToken: token
            })
          });
          const txt = await res.text();
          if (!res.ok) {
            console.error('[PushInit] subscribe failed', res.status, txt);
          } else {
            console.log('[PushInit] subscribe ok', txt);
          }
        } catch (e) {
          console.error('[PushInit] subscribe exception', e?.message || e);
        }
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('[PushInit] registrationError', err);
      });

      await PushNotifications.register();
    } catch (e) {
      console.warn('[PushInit] init skipped:', e?.message || e);
    }
  }
}
