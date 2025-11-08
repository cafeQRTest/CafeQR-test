// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.cafeqr.app',
  appName: 'Cafe QR',
  webDir: 'out',
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
  // No server.url here for installed builds
  server: {
    androidScheme: 'https',
    allowNavigation: ['cafe-qr-app.vercel.app'], // optional if you deep link to it
  },
};

export default config;
