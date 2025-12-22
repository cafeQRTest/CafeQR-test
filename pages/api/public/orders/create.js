import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '').trim()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    restaurantId,
    customerName,
    customerPhone,
    address, // { line1, line2, city, state, pincode, landmark }
    items,   // [{ menu_item_id, qty, unit_price_inc_tax, item_name, variant_option_id, variant_name }]
    specialInstructions
  } = req.body || {}

  if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
  if (!items?.length) return res.status(400).json({ error: 'items required' })

  const phone = normalizePhone(customerPhone)
  if (!phone) return res.status(400).json({ error: 'customerPhone required' })
  if (!address?.line1 || !address?.city || !address?.pincode) {
    return res.status(400).json({ error: 'address line1/city/pincode required' })
  }

  // 1) Upsert customer by phone
  const { data: cust, error: custErr } = await supabaseAdmin
    .from('customers')
    .upsert(
      { phone, name: customerName || null, updated_at: new Date().toISOString() },
      { onConflict: 'phone' }
    )
    .select('id, phone, name')
    .single()

  if (custErr) return res.status(500).json({ error: custErr.message })

  // 2) Insert address (simple MVP: create a new one each order)
  const { data: addr, error: addrErr } = await supabaseAdmin
    .from('customer_addresses')
    .insert({
      customer_id: cust.id,
      label: 'Delivery',
      line1: address.line1,
      line2: address.line2 || null,
      city: address.city,
      state: address.state || null,
      pincode: address.pincode,
      landmark: address.landmark || null
    })
    .select('id')
    .single()

  if (addrErr) return res.status(500).json({ error: addrErr.message })

  // 3) Compute totals (MVP; refine tax later)
  const subtotal = items.reduce((s, it) => s + Number(it.unit_price_inc_tax || 0) * Number(it.qty || 1), 0)
  const total = subtotal

  // 4) Create order
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .insert({
      restaurant_id: restaurantId,
      order_type: 'delivery',
      status: 'new',
      payment_status: 'pending',
      customer_id: cust.id,
      customer_name: customerName || cust.name || null,
      customer_phone: phone,
      delivery_address_id: addr.id,
      special_instructions: specialInstructions || null,
      subtotal,
      total,
      total_amount: total
    })
    .select('id, restaurant_id, created_at')
    .single()

  if (orderErr) return res.status(500).json({ error: orderErr.message })

  // 5) Insert order_items
  const orderItemsPayload = items.map((it) => ({
    order_id: order.id,
    menu_item_id: it.menu_item_id || null,
    quantity: Number(it.qty || 1),
    price: Number(it.unit_price_inc_tax || 0) * Number(it.qty || 1),
    item_name: it.item_name || null,
    unit_price_inc_tax: Number(it.unit_price_inc_tax || 0),
    variant_option_id: it.variant_option_id || null,
    variant_name: it.variant_name || null
  }))

  const { error: oiErr } = await supabaseAdmin.from('order_items').insert(orderItemsPayload)
  if (oiErr) return res.status(500).json({ error: oiErr.message })

  // 6) Update restaurant_customers stats (MVP: simple upsert)
  const now = new Date().toISOString()
  await supabaseAdmin
    .from('restaurant_customers')
    .upsert({
      restaurant_id: restaurantId,
      customer_id: cust.id,
      first_order_at: now,
      last_order_at: now,
      order_count: 1,
      total_spent: total,
      updated_at: now
    }, { onConflict: 'restaurant_id,customer_id' })

  // Optional: for accurate increments, replace upsert with an RPC that does atomic increment.

  return res.status(200).json({ orderId: order.id })
}
