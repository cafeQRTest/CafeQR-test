// lib/authActions.js
export async function signOutAndRedirect(supabase, pushOrReplace) {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  // Remove local session info and other potential state (localStorage, etc)
  if (typeof window !== "undefined") {
    localStorage.removeItem("active_restaurant_id");
    // Add any other session/local keys that should be cleared
  }
  if (error) throw error;
  // Explicitly waiting for navigation
  await pushOrReplace("/login");
}
