//lib/authActions.js

import { getSupabase } from '../services/supabase';

export async function signOutAndRedirect(supabase, pushOrReplace) {
  if (!supabase) return;

  try {
    // Call Supabase sign out
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Sign out error:', error.message);
      throw error;
    }

    // Clear all local state
    if (typeof window !== 'undefined') {
      localStorage.removeItem('active_restaurant_id');
      localStorage.removeItem('restaurant_data');
      // Clear any other app-specific local keys
      sessionStorage.clear();
    }

    // Navigate to login
    await pushOrReplace('/login');
  } catch (err) {
    console.error('Sign out and redirect failed:', err);
    // Force redirect even if error
    await pushOrReplace('/login');
  }
}

/**
 * Helper: Check if user has valid session without navigation
 */
export async function hasValidSession() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    return !!data?.session;
  } catch {
    return false;
  }
}

/**
 * Helper: Refresh the session token if near expiry
 */
export async function ensureSessionValid() {
  try {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) return false;

    // If token expires within next hour, refresh
    const expiresAt = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    const hoursUntilExpiry = (expiresAt - now) / 3600;

    if (hoursUntilExpiry < 1) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      return !!data?.session;
    }

    return true;
  } catch (err) {
    console.error('Session validation error:', err);
    return false;
  }
}

