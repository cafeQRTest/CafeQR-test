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

export const SESSION_SNAPSHOT_KEY = 'app.supabase.session';

// Capacitor/Native Storage Adapter
const storageAdapter = {
  getItem: async (key) => {
    const { value } = await Preferences.get({ key }); return value
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
    // Native (Capacitor) -> Use standard client with Preferences storage
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: storageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  } else {
    // Web (Next.js) -> Use SSR Browser Client (Cookies)
    supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    })
  }

  return supabaseInstance
}

// --- Compatibility Helpers (Modified for Cookie Migration) ---

export async function saveSessionSnapshot(session) {
  if (!session) return;
  // Only manual snapshot on Native. Web uses Cookies.
  if (Capacitor.isNativePlatform()) {
    const snap = {
      access_token: session.access_token || '',
      refresh_token: session.refresh_token || '',
      expires_at: session.expires_at || 0
    };
    await Preferences.set({ key: SESSION_SNAPSHOT_KEY, value: JSON.stringify(snap) });
  }
}

export async function clearSessionSnapshot() {
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key: SESSION_SNAPSHOT_KEY });
  }
  // Web: Cookie clearing is handled by signOut usually, or we can't easily clear httpOnly cookies from JS anyway without API.
}

export async function loadSessionSnapshot() {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: SESSION_SNAPSHOT_KEY });
    try { return value ? JSON.parse(value) : null; } catch { return null; }
  }
  return null;
}

export async function bootstrapSupabaseSession() {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return true;

  // Native fallback: restore from Snapshot
  if (Capacitor.isNativePlatform()) {
    const snap = await loadSessionSnapshot();
    if (snap?.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: snap.access_token || '',
        refresh_token: snap.refresh_token
      });
      return !error;
    }
  }
  return false;
}

export async function forceSupabaseSessionRestore() {
  const supabase = getSupabase();
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (!error && session) return session;
  } catch (err) {
    console.error('[Auth] Failed to restore session:', err);
  }
  return null;
}

export default getSupabase;
