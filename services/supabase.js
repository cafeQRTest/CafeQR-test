// services/supabase.js

import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const SESSION_SNAPSHOT_KEY = 'app.supabase.session';

export async function saveSessionSnapshot(session) {
  if (!session) return;
  const snap = {
    access_token: session.access_token || '',
    refresh_token: session.refresh_token || '',
    expires_at: session.expires_at || 0
  };
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: SESSION_SNAPSHOT_KEY, value: JSON.stringify(snap) });
  } else if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(snap));
  }
}

export async function loadSessionSnapshot() {
  let raw = null;
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: SESSION_SNAPSHOT_KEY });
    raw = value;
  } else if (typeof window !== 'undefined') {
    raw = localStorage.getItem(SESSION_SNAPSHOT_KEY);
  }
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

// Call this very early on cold start or resume
export async function bootstrapSupabaseSession() {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return true; // already live
  const snap = await loadSessionSnapshot();
  if (snap?.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: snap.access_token || '',
      refresh_token: snap.refresh_token
    });
    return !error;
  }
  return false;
}


if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key must be defined in .env.local")
}

const ServerStorageAdapter = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

const storageAdapter = {
  getItem: async (key) => {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key })
      return value
    }
    if (typeof window !== 'undefined') {
      return localStorage.getItem(key)
    }
    return null
  },
  setItem: async (key, value) => {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value })
    } else if (typeof window !== 'undefined') {
      localStorage.setItem(key, value)
    }
  },
  removeItem: async (key) => {
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key })
    } else if (typeof window !== 'undefined') {
      localStorage.removeItem(key)
    }
  },
}

let supabaseInstance

export function getSupabase() {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: typeof window === 'undefined' ? ServerStorageAdapter : storageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  }
  return supabaseInstance
}

/**
 * EXPORTED FUNCTION: Force restore session from persistent storage on cold start.
 * Works for both web (localStorage) and native (Capacitor Preferences).
 */
export async function forceSupabaseSessionRestore() {
  if (typeof window === 'undefined') return

  const supabase = getSupabase()
  try {
    // This forces Supabase to call getSession() from the storage adapter
    const { data: { session }, error } = await supabase.auth.getSession()
    if (!error && session) {
      console.log('[Auth] Session restored from storage')
      return session
    }
  } catch (err) {
    console.error('[Auth] Failed to restore session:', err)
  }
  return null
}
