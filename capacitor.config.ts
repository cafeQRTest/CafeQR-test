// capacitor.config.ts for TEST build
import { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.cafeqr.test',                // different from production
  appName: 'Cafe QR Test',                 // label shown on device
  webDir: 'out',
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
  server: {
    url: 'https://test-cafeqr.vercel.app', // your test web app
    androidScheme: 'https',
    allowNavigation: ['test-cafeqr.vercel.app'],
  },
};

export default config;
