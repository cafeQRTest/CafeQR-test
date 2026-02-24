export default function handler(req, res) {
  const vapidKey =
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
    process.env.NEXT_PUBLIC_VAPID_KEY ||
    process.env.FIREBASE_VAPID_KEY ||
    '';

  res.status(200).json({
    hasVapidKey: Boolean(vapidKey),
    vapidKey,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDERID ||
      '',
  });
}
