export default function handler(req, res) {
  const readEnv = (...keys) => {
    for (const key of keys) {
      const val = process.env[key];
      if (val) return val;
    }
    return '';
  };

  const config = {
    apiKey: readEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'FIREBASE_API_KEY'),
    authDomain: readEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN'),
    projectId: readEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'),
    storageBucket: readEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDERID', 'FIREBASE_MESSAGING_SENDER_ID'),
    appId: readEnv('NEXT_PUBLIC_FIREBASE_APP_ID', 'FIREBASE_APP_ID'),
  };

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(`self.__FIREBASE_SW_CONFIG = ${JSON.stringify(config)};`);
}
