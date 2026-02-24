// src/hooks/useEnhancedPushNotifications.ts
import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export function useEnhancedPushNotifications(
  restaurantId: string,
  userEmail: string,
  onToken?: (token: string) => void
) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let mounted = true;

    async function init() {
      try {
        await PushNotifications.createChannel({
          id: 'orders',
          name: 'Order Alerts',
          description: 'High priority new order alerts',
          importance: 4,
          sound: 'beep.wav',
          vibration: true,
        });
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== 'granted') return;
        await PushNotifications.register();

        PushNotifications.addListener('registration', async token => {
          if (!mounted) return;
          try {
            const res = await fetch('/api/push/subscribe', {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({
                deviceToken: token.value,
                restaurantId,
                userEmail,
                platform: Capacitor.getPlatform()
              })
            });
            if (res.ok) onToken?.(token.value);
          } catch {}
        });

        PushNotifications.addListener('pushNotificationReceived', notif => {
          if (notif.data?.type === 'new_order') {
            const audio = new Audio('/notification-sound.mp3');
            audio.play().catch(() => {});
          }
        });

      } catch (e) {
        console.error(e);
      }
    }

    init();
    return () => {
      mounted = false;
      PushNotifications.removeAllListeners();
    };
  }, [restaurantId, userEmail, onToken]);
}
