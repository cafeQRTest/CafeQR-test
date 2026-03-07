// services/supabase.js
import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key must be defined in .env.local")
}

// 1. Custom Storage Adapter for Capacitor (Native)
const CapacitorStorage = {
  getItem: async (key) => {
    const { value } = await Preferences.get({ key })
    return value
  },
  setItem: async (key, value) => {
    await Preferences.set({ key, value })
  },
  removeItem: async (key) => {
    await Preferences.remove({ key })
  },
}

let supabaseInstance

export function getSupabase() {
  if (supabaseInstance) return supabaseInstance

  if (Capacitor.isNativePlatform()) {
    // Native: Use standard client with persistent Capacitor storage
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: CapacitorStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  } else {
    // Web: Use SSR Browser Client (Cookies)
    supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 30, // 30 Days
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: false
      }
    })
  }

  return supabaseInstance
}

let customerSupabaseInstance

export function getCustomerSupabase() {
  if (customerSupabaseInstance) return customerSupabaseInstance

  if (Capacitor.isNativePlatform()) {
    // Native: Use standard client with persistent Capacitor storage
    customerSupabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: CapacitorStorage,
        storageKey: 'customer_auth_token',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  } else {
    // Web: Use SSR Browser Client (Cookies)
    customerSupabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'customer_auth_token',
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
      cookieOptions: {
        name: 'customer_auth_token',
        maxAge: 60 * 60 * 24 * 30, // 30 Days
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: false
      }
    })
  }

  return customerSupabaseInstance
}

export default getSupabase;
