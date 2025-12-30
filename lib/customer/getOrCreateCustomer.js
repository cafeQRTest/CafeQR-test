//lib/customer/getOrCreateCustomer.js

import getSupabase from "../../services/supabase";

export async function getOrCreateCustomer() {
  const supabase = getSupabase();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;

  const user = userRes?.user;
  if (!user) throw new Error("Not authenticated");

  // 1) Try find by user_id (delivery users)
  const { data: existing, error: selErr } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing;

  // 2) Create (phone is optional; magic link email is free)
  const payload = {
    user_id: user.id,
    email: user.email || null,
    name: user.user_metadata?.name || null,
    phone: null,
  };

  const { data: created, error: insErr } = await supabase
    .from("customers")
    .insert(payload)
    .select("*")
    .single();

  if (insErr) throw insErr;
  return created;
}
