import type { CapacitorConfig } from '@capacitor/core';

const TARGET = process.env.CAFEQR_TARGET || 'pos-test';

const POS_TEST: CapacitorConfig = {
  appId: 'com.cafeqr.test',
  appName: 'Cafe QR Test (POS)',
  webDir: 'out',
  android: { path: 'android-pos-test' },       // ✅ use this folder
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
  server: {
    url: 'https://test-cafeqr.vercel.app',
    androidScheme: 'https',
    allowNavigation: ['test-cafeqr.vercel.app'],
  },
};

const DELIVERY_TEST: CapacitorConfig = {
  appId: 'com.cafeqr.delivery.test',
  appName: 'Cafe QR Delivery Test',
  webDir: 'out',
  android: { path: 'android-delivery-test' },  // ✅ use this folder
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
  server: {
    url: 'https://test-cafeqr.vercel.app/app',
    androidScheme: 'https',
    allowNavigation: ['test-cafeqr.vercel.app'],
  },
};

const map: Record<string, CapacitorConfig> = {
  'pos-test': POS_TEST,
  'delivery-test': DELIVERY_TEST,
};

export default map[TARGET] || POS_TEST;
