// next.config.js

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development' || process.env.NATIVE_BUILD === '1',
  register: true,
  skipWaiting: true,
})

const isNative = process.env.NATIVE_BUILD === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  typescript: { ignoreBuildErrors: true },
  output: isNative ? 'export' : undefined,
  env: {
    NATIVE_BUILD: process.env.NATIVE_BUILD,
  },

  webpack(config, { webpack }) {
    config.plugins.push(
      new webpack.DefinePlugin({
        // Make Firebase config available to your SW as __FIREBASE_CONFIG__
        '__FIREBASE_CONFIG__': JSON.stringify({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
          measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
        }),
      })
    )
    return config
  },
  redirects: async () => {
    if (!isNative) return []
    return [{ source: '/', destination: '/owner/orders', permanent: false }]
  },
}

module.exports = withPWA(nextConfig)
