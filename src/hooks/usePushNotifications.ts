// src/hooks/usePushNotifications.ts
import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';

export function usePushNotifications(onToken?: (token: string) => void) {
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Android: ensure a channel exists for sound/vibration
        // No-op on iOS
        await PushNotifications.createChannel({
          id: 'orders',
          name: 'Order Alerts',
          importance: 4,         // High
          sound: 'beep',      
          vibration: true,
        });

        const perm = await PushNotifications.requestPermissions();
        if (perm.receive === 'granted') {
          await PushNotifications.register();
        }

        PushNotifications.addListener('registration', token => {
          if (!mounted) return;
          console.log('FCM token:', token.value);
          onToken?.(token.value);
        });

        PushNotifications.addListener('registrationError', err => {
          console.error('Push registration error:', err);
        });

        PushNotifications.addListener('pushNotificationReceived', notif => {
          console.log('Push received:', notif);
        });

        PushNotifications.addListener('pushNotificationActionPerformed', action => {
          console.log('Notification tapped:', action.notification);
        });
      } catch (e) {
        console.error('Push init failed:', e);
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, [onToken]);
}
