This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.js`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.

## Push Alerts (POS New Order)

This repo supports Firebase Cloud Messaging (FCM) push alerts for new POS orders across:

- Windows browsers / PWA (Chrome, Edge)
- Android native app (Capacitor), and Android PWA fallback

### 1. Environment Setup

Copy `.env.example` to your local env file and fill all values:

```bash
cp .env.example .env.local
```

Required groups:

- Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, public keys)
- Firebase Web (`NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY`)
- Firebase Admin (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)

Notes:

- Local API routes read `FIREBASE_*` from normal Next.js envs and also fall back to `.env.server.local` for local development.
- After changing Firebase env keys, fully restart `npm run dev`.

### 2. Firebase Project Setup

1. Create/select Firebase project.
2. Add a Web app and copy web config values to `NEXT_PUBLIC_FIREBASE_*`.
3. In Firebase Cloud Messaging:
   - Generate Web Push certificate key pair.
   - Put the public key in `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
4. Create/Download service-account credentials and map:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (preserve `\n` newlines)
5. For Android native builds:
   - Place correct `google-services.json` in target Android app module.
   - Ensure notification permission is granted on Android 13+.

### 3. Database Migration

Run migration:

- `migrations/1.4/24_push_notifications_idempotency.sql`

This migration:

- creates/normalizes `push_subscription_restaurants`
- adds `enabled` + indexes
- creates `push_notifications_log` for idempotent new-order sends
- applies service-role-only RLS policies for push tables

### 4. Runtime Flow

1. POS device enables alerts from Orders dashboard (`Enable Push Alerts` card).
2. Device token is stored in localStorage key `fcmtoken` and subscribed via `/api/push/subscribe`.
3. New order insert (`status = new`) triggers backend push send.
4. Send is idempotent via `push_notifications_log` unique key, so retries/duplicate API calls do not re-send.

### 5. Test Checklist

1. Open POS Orders page on Windows (Chrome/Edge), click `Enable Push Alerts`.
2. Open POS app on Android (or Android PWA), enable push alerts.
3. Place a new order from Counter POS (`/api/orders/create`).
4. Validate within ~2 seconds:
   - Windows notification appears (foreground/background/closed-tab via SW)
   - Android tray notification appears
5. Click notification:
   - app/browser opens/focuses Orders dashboard (`/owner/orders?...`)
6. Edit/update the same order status:
   - no second "New Order" push should be sent
7. With multiple subscribed devices:
   - each device receives one notification
