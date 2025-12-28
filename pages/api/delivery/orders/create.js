//pages/api/delivery/orders/create.js

import getSupabase from "../../../../services/supabase";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const supabase = getSupabase();

    // If your getSupabase is service-role, ensure you still validate auth:
    const { data: authRes } = await supabase.auth.getUser(req.headers.authorization?.replace("Bearer ", ""));
    const user = authRes?.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { restaurantId, items, deliveryAddressId, instructions } = req.body;

    // Map auth user -> customer row
    const { data: customer, error: cErr } = await supabase
      .from("customers")
      .select("id, name, phone, email")
      .eq("user_id", user.id)
      .single();
    if (cErr) throw cErr;

    const subtotal = (items || []).reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0);

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({
        restaurant_id: restaurantId,
        order_type: "delivery",
        status: "new",
        delivery_status: "new",
        customer_id: customer.id,
        delivery_address_id: deliveryAddressId,
        delivery_instructions: instructions ?? null,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email,
        items,                  // keep using your existing JSONB `items` pattern
        subtotal,
        total: subtotal,
        total_amount: subtotal,
      })
      .select("*")
      .single();
    if (oErr) throw oErr;

    return res.status(200).json({ order });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Failed" });
  }
}
