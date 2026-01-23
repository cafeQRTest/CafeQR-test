import { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.cafeqr.app',                 // Your ACTUAL Production App ID (must match what you put in Play Console later)
  appName: 'Cafe QR',                      // The real name seen by users
  webDir: 'out',
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
server: {
  url: 'https://cafe-qr-app.vercel.app',
  androidScheme: 'https',
  allowNavigation: ['cafe-qr-app.vercel.app'],
},

};

export default config;
