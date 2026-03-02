import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function updateSession(request) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Check if we are in the delivery app flow
    const isDeliveryApp = request.nextUrl.pathname.startsWith('/app')

    const supabase = createServerClient(
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) => {
                        // Force 30 days maxAge if not already long enough, 
                        // OR strictly follow Supabase logic. User requested 30 days.
                        // Supabase Auth usually handles expiry, but we can enforce persistence.
                        const overrides = { ...options, maxAge: 60 * 60 * 24 * 30 }
                        response.cookies.set(name, value, overrides)
                    })
                },
            },
            cookieOptions: {
                maxAge: 60 * 60 * 24 * 30, // 30 days
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                httpOnly: false // false so the client (Browser Client) can read the session
            }
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // Deep Link Handling / Auth Protection for Delivery App
    // If user is NOT logged in and trying to access protected routes:
    // Protected routes: /app/address, /app/profile, /app/checkout
    // Public/Auth routes: /app, /app/auth, /app/restaurants (maybe?)

    // The user specifically asked: "middleware... correctly identifies their session and takes them directly to the page without a login redirect."
    // This implies if they ARE logged in, we shouldn't redirect them to login.
    // And if they hit a magic link, it should work.

    // Magic Link typically hits /app/auth/callback or similar. Middleware should just let it pass.

    return response
}
