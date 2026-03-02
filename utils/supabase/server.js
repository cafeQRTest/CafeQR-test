import { createServerClient } from '@supabase/ssr'

export function createClient(context) {
    return createServerClient(
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return Object.keys(context.req.cookies).map((name) => ({ name, value: context.req.cookies[name] || '' }))
                },
                setAll(cookiesToSet) {
                    try {
                        const newCookies = cookiesToSet.map(({ name, value, options }) => {
                            return serializeCookie(name, value, {
                                ...options,
                                // Enforce 30 days if setting a new session via server
                                maxAge: 60 * 60 * 24 * 30,
                                httpOnly: false // Align with middleware
                            })
                        })

                        let existing = context.res.getHeader('Set-Cookie')
                        if (existing && !Array.isArray(existing)) {
                            existing = [existing]
                        }
                        const allCookies = [...(existing || []), ...newCookies]

                        context.res.setHeader('Set-Cookie', allCookies)
                    } catch {
                        // The `setAll` method was called from a Server Component.
                    }
                },
            },
        }
    )
}

function serializeCookie(name, value, options = {}) {
    let cookie = `${name}=${value}`
    if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`
    if (options.domain) cookie += `; Domain=${options.domain}`
    if (options.path) cookie += `; Path=${options.path}`
    if (options.expires) cookie += `; Expires=${options.expires.toUTCString()}`
    if (options.httpOnly) cookie += `; HttpOnly`
    if (options.secure) cookie += `; Secure`
    if (options.sameSite) {
        const sameSite = typeof options.sameSite === 'string' ? options.sameSite.toLowerCase() : options.sameSite;
        switch (sameSite) {
            case true: cookie += '; SameSite=Strict'; break;
            case 'lax': cookie += '; SameSite=Lax'; break;
            case 'strict': cookie += '; SameSite=Strict'; break;
            case 'none': cookie += '; SameSite=None'; break;
        }
    }
    return cookie
}
