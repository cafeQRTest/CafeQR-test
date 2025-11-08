import { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.cafeqr.app',
  appName: 'Cafe QR',
  webDir: 'out',                      // not used when server.url is set
  plugins: { PushNotifications: { presentationOptions: ['badge','sound','alert'] } },
  server: {
    url: 'https://cafe-qr-app.vercel.app',  // load the deployed app
    androidScheme: 'https',
    allowNavigation: ['cafe-qr-app.vercel.app']
  }
};
export default config;
