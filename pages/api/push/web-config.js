export default function handler(req, res) {
  const readEnv = (...keys) => {
    for (const key of keys) {
      const val = process.env[key];
      if (val) return val;
    }
    return '';
  };

  const vapidKey =
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
    process.env.NEXT_PUBLIC_VAPID_KEY ||
    process.env.FIREBASE_VAPID_KEY ||
    '';

  const apiKey = readEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_APIKEY', 'FIREBASE_API_KEY');
  const authDomain = readEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN');
  const projectId = readEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID');
  const storageBucket = readEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'FIREBASE_STORAGE_BUCKET');
  const messagingSenderId = readEnv(
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDERID',
    'FIREBASE_MESSAGING_SENDER_ID'
  );
  const appId = readEnv('NEXT_PUBLIC_FIREBASE_APP_ID', 'FIREBASE_APP_ID');

  res.setHeader('Cache-Control', 'public, max-age=120');
  res.status(200).json({
    hasVapidKey: Boolean(vapidKey),
    vapidKey,
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  });
}
