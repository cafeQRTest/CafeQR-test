import { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.cafeqr.app',                 // Your ACTUAL Production App ID (must match what you put in Play Console later)
  appName: 'Cafe QR',                      // The real name seen by users
  webDir: 'out',
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
  server: {
    // For Production, we usually comment out 'url' so it uses the local bundled files (webDir: 'out').
    // If you strictly want to load the live website wrapper (not recommended for offline speed, but okay for wrapper apps):
    // url: 'https://cafe-qr-app.vercel.app', 
    
    // BETTER PRACTICE: Comment out 'server.url' to serve local files from 'out' directory
    // url: 'https://cafe-qr-app.vercel.app', 
    androidScheme: 'https'
  },
};

export default config;
