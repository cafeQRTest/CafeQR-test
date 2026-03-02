# Supabase Proxy Worker

This Worker proxies requests from your custom domain (example: `https://sb.cafeqr.in`) to your Supabase project domain.

## Steps

1. In Cloudflare Workers, create a Worker and paste `worker.js`.
2. Add a route/custom domain for `sb.cafeqr.in/*` and point it to this Worker.
3. Keep proxy enabled (orange cloud) for `sb.cafeqr.in`.

## Why this split is important

- `NEXT_PUBLIC_SUPABASE_URL` should point to `https://sb.cafeqr.in`.
- `SUPABASE_URL` should stay your direct `https://<project-ref>.supabase.co` for server-only jobs.

This allows end users on blocked ISP DNS to use your app without VPN while preserving direct server-to-Supabase traffic.
