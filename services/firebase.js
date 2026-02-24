// /services/firebase.js

export const getFirebaseConfig = () => {
  // Ensure your environment variables are correctly named in your .env.local file
  // e.g., NEXT_PUBLIC_FIREBASE_API_KEY=...
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_APIKEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDERID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };
};
