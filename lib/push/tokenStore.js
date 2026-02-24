import { Capacitor } from '@capacitor/core';

export const PUSH_TOKEN_KEY = 'fcmtoken';
const LEGACY_PUSH_TOKEN_KEY = 'fcm_token';
const PUSH_ALERTS_DISABLED_KEY = 'push_alerts_disabled';

export function getStoredPushToken() {
  if (typeof window === 'undefined') return null;
  const primary = localStorage.getItem(PUSH_TOKEN_KEY);
  if (primary) return primary;
  const legacy = localStorage.getItem(LEGACY_PUSH_TOKEN_KEY);
  return legacy || null;
}

export function setStoredPushToken(token) {
  if (typeof window === 'undefined') return;
  const value = String(token || '').trim();
  if (!value) return;
  localStorage.setItem(PUSH_TOKEN_KEY, value);
  // Backward compatibility for older code paths.
  localStorage.setItem(LEGACY_PUSH_TOKEN_KEY, value);
}

export function clearStoredPushToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PUSH_TOKEN_KEY);
  localStorage.removeItem(LEGACY_PUSH_TOKEN_KEY);
}

export function getPushTokenPrefix(token, len = 12) {
  return String(token || '').slice(0, len);
}

export function detectPushPlatform() {
  // Only treat as Android when running inside native Capacitor runtime.
  // Browser/PWA (including Chrome device emulation with Android UA) must use web push.
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return 'android';
  return 'web';
}

export function arePushAlertsDisabled() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(PUSH_ALERTS_DISABLED_KEY) === '1';
}

export function setPushAlertsDisabled(disabled) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PUSH_ALERTS_DISABLED_KEY, disabled ? '1' : '0');
}
