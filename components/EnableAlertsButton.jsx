import { useEffect, useMemo, useState } from 'react';
import { getFCMToken } from '../lib/firebase/messaging';
import { subscribeOwnerDevice } from '../helpers/subscribePush';
import {
  arePushAlertsDisabled,
  detectPushPlatform,
  getPushTokenPrefix,
  getStoredPushToken,
  setPushAlertsDisabled,
  setStoredPushToken,
} from '../lib/push/tokenStore';

function formatPermission(raw) {
  const value = String(raw || 'default').toLowerCase();
  if (value === 'granted') return 'Granted';
  if (value === 'denied') return 'Denied';
  if (value === 'prompt') return 'Default';
  return 'Default';
}

async function requestNativeToken(setPermissionState) {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  await PushNotifications.createChannel({
    id: 'orders',
    name: 'Orders',
    description: 'New order alerts',
    importance: 5,
  }).catch(() => { });

  const checked = await PushNotifications.checkPermissions();
  let receive = checked?.receive || 'prompt';
  if (receive !== 'granted') {
    const requested = await PushNotifications.requestPermissions();
    receive = requested?.receive || receive;
  }

  setPermissionState(receive);
  if (receive !== 'granted') return null;

  return await new Promise(async (resolve, reject) => {
    let settled = false;
    let regHandle = null;
    let errHandle = null;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      regHandle?.remove?.();
      errHandle?.remove?.();
      reject(new Error('Timed out while registering push token'));
    }, 12000);

    regHandle = await PushNotifications.addListener('registration', ({ value }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      regHandle?.remove?.();
      errHandle?.remove?.();
      resolve(value || null);
    });

    errHandle = await PushNotifications.addListener('registrationError', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      regHandle?.remove?.();
      errHandle?.remove?.();
      reject(new Error(err?.error || 'Push registration failed'));
    });

    await PushNotifications.register();
  });
}

export default function EnableAlertsButton({ restaurantId }) {
  const [permission, setPermission] = useState('default');
  const [tokenPrefix, setTokenPrefix] = useState('');
  const [busy, setBusy] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const platform = useMemo(() => detectPushPlatform(), []);

  const refreshState = async () => {
    const token = getStoredPushToken();
    setTokenPrefix(getPushTokenPrefix(token, 16));

    if (platform === 'web') {
      if (typeof Notification !== 'undefined') {
        setPermission(Notification.permission || 'default');
      }
    } else {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const p = await PushNotifications.checkPermissions();
        setPermission(p?.receive || 'default');
      } catch {
        setPermission('default');
      }
    }

    if (!restaurantId || !token || arePushAlertsDisabled()) {
      setIsSubscribed(false);
      return;
    }

    try {
      const resp = await fetch(`/api/push/subscribe?rid=${encodeURIComponent(restaurantId)}`);
      const json = await resp.json();
      const short = getPushTokenPrefix(token, 24);
      const source = Array.isArray(json?.enabledPrefixes) ? json.enabledPrefixes : json?.prefixes;
      const hasMatch = Array.isArray(source) && source.includes(short);
      setIsSubscribed(Boolean(hasMatch));
    } catch {
      setIsSubscribed(false);
    }
  };

  useEffect(() => {
    refreshState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const enableAlerts = async () => {
    if (!restaurantId) return;

    setBusy(true);
    setError('');
    setMessage('');
    try {
      setPushAlertsDisabled(false);
      let token = null;

      if (platform === 'android') {
        try {
          token = await requestNativeToken(setPermission);
        } catch (nativeErr) {
          // Safety fallback: if this is actually web runtime, use web FCM flow.
          if (!Capacitor.isNativePlatform()) {
            token = await getFCMToken({ requestPermission: true });
            if (typeof Notification !== 'undefined') {
              setPermission(Notification.permission || 'default');
            }
          } else {
            throw nativeErr;
          }
        }
      } else {
        token = await getFCMToken({ requestPermission: true });
        if (typeof Notification !== 'undefined') {
          setPermission(Notification.permission || 'default');
        }
      }

      if (!token) throw new Error('Token not available');

      setStoredPushToken(token);
      await subscribeOwnerDevice({
        restaurantId,
        token,
        platform,
      });

      setIsSubscribed(true);
      setTokenPrefix(getPushTokenPrefix(token, 16));
      setMessage('Push alerts enabled for this device.');
      await refreshState();
    } catch (e) {
      setError(e?.message || 'Failed to enable push alerts');
    } finally {
      setBusy(false);
    }
  };

  const disableAlerts = async () => {
    if (!restaurantId) return;

    const token = getStoredPushToken();
    if (!token) {
      setPushAlertsDisabled(true);
      setIsSubscribed(false);
      setMessage('Push alerts disabled on this device.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          deviceToken: token,
        }),
      });
      setPushAlertsDisabled(true);
      setIsSubscribed(false);
      setMessage('Push alerts disabled on this device.');
      await refreshState();
    } catch (e) {
      setError(e?.message || 'Failed to disable push alerts');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      padding: 10,
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      background: '#fff',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 290,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>Push Alerts</strong>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          {platform.toUpperCase()}
        </span>
      </div>

      <div style={{ fontSize: 12, color: '#334155' }}>
        Permission: <strong>{formatPermission(permission)}</strong>
      </div>
      <div style={{ fontSize: 12, color: '#334155' }}>
        Token: <strong>{tokenPrefix ? `${tokenPrefix}...` : 'Not registered'}</strong>
      </div>
      <div style={{ fontSize: 12, color: '#334155' }}>
        Status: <strong>{isSubscribed ? 'Subscribed' : (arePushAlertsDisabled() ? 'Disabled' : 'Not subscribed')}</strong>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={enableAlerts}
          disabled={busy || !restaurantId}
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid #f97316',
            background: '#f97316',
            color: '#fff',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.7 : 1,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {busy ? 'Please wait...' : 'Enable Push Alerts'}
        </button>
        <button
          onClick={disableAlerts}
          disabled={busy || !restaurantId}
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#fff',
            color: '#0f172a',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.7 : 1,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Disable
        </button>
      </div>

      {message && <div style={{ fontSize: 12, color: '#047857' }}>{message}</div>}
      {error && <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div>}
    </div>
  );
}
