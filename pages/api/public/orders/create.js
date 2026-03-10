// pages/api/public/orders/create.js
import { getServerSupabase } from '../../../../services/supabase-server';
import { InvoiceService } from '../../../../services/invoiceService';
import { sendNewOrderPush } from '../../../../services/push/newOrderNotifier';

function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getServerSupabase();

  const {
    restaurantId,
    customerName,
    customerPhone,
    customerEmail,
    address,
    items,
    kitchenInstructions,
    deliveryInstructions,
    payment_method = 'none',
    payment_status = 'pending',
  } = req.body || {};

  if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required' });

  const phone = normalizePhone(customerPhone);
  if (!phone) return res.status(400).json({ error: 'customerPhone required' });

  if (!address?.line1 || !address?.city || !address?.pincode) {
    return res.status(400).json({ error: 'address line1/city/pincode required' });
  }

  // 1) Upsert customer (by unique phone)
  const { data: cust, error: custErr } = await supabase
    .from('customers')
    .upsert(
      {
        phone,
        name: customerName || null,
        email: customerEmail || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'phone' }
    )
    .select('id, phone, name')
    .single();

  if (custErr) return res.status(500).json({ error: custErr.message });

  // 2) Insert address (MVP: new address per order)
  const { data: addr, error: addrErr } = await supabase
    .from('customer_addresses')
    .insert({
      customer_id: cust.id,
      label: 'Delivery',
      line1: address.line1,
      line2: address.line2 || null,
      city: address.city,
      state: address.state || null,
      pincode: address.pincode,
      landmark: address.landmark || null,
      geo: address.geo || null,
      is_default: false,
    })
    .select('id')
    .single();

  if (addrErr) return res.status(500).json({ error: addrErr.message });

  // 3) Load restaurant tax flags/settings (same source as internal create flow) [file:2622]
  const { data: profile, error: profileErr } = await supabase
    .from('restaurant_profiles')
    .select('gst_enabled, default_tax_rate, prices_include_tax')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (profileErr) return res.status(500).json({ error: profileErr.message });

  const gstEnabled = !!profile?.gst_enabled;
  const baseRate = Number(profile?.default_tax_rate ?? 5);
  const pricesIncludeTax = !!profile?.prices_include_tax;

  // 4) Load menu items + packaged good flags (same idea as internal create flow) [file:2622]
  const menuItemIds = [...new Set(items.map(i => i.menu_item_id).filter(Boolean))];
  const { data: menuRows, error: menuErr } = await supabase
    .from('menu_items')
    .select('id, name, price, is_packaged_good, tax_rate, hsn')
    .in('id', menuItemIds);

  if (menuErr) return res.status(500).json({ error: menuErr.message });

  // Variant pricing (optional if you use it)
  const variantIds = items.map(i => i.variant_option_id).filter(Boolean);
  let variantRows = [];
  if (variantIds.length) {
    const { data: vp } = await supabase
      .from('variant_pricing')
      .select('menu_item_id, option_id, price')
      .in('menu_item_id', menuItemIds)
      .in('option_id', variantIds);
    variantRows = vp || [];
  }

  // Helpers
  const menuById = new Map((menuRows || []).map(m => [String(m.id), m]));
  const variantPriceByKey = new Map(
    (variantRows || []).map(v => [`${String(v.menu_item_id)}::${String(v.option_id)}`, Number(v.price || 0)])
  );

  // 5) Compute totals server-side (do NOT trust client price)
  let subtotal_ex_tax = 0;
  let total_tax = 0;
  let total_inc_tax = 0;

  const preparedOrderItems = items.map((it) => {
    const qty = Math.max(1, Number(it.qty || 1));
    const menu = menuById.get(String(it.menu_item_id));
    if (!menu) throw new Error(`Menu item not found: ${it.menu_item_id}`);

    const isPackaged = !!menu.is_packaged_good;
    const itemTaxRate = Number(menu.tax_rate || 0);

    // Choose unit price (variant override else base menu price)
    const variantKey = it.variant_option_id ? `${String(it.menu_item_id)}::${String(it.variant_option_id)}` : null;
    const unitInc = variantKey && variantPriceByKey.has(variantKey)
      ? variantPriceByKey.get(variantKey)
      : Number(menu.price || 0);

    // Effective GST rate: packaged goods can use item tax_rate; otherwise restaurant default [file:2622]
    const effectiveRate = gstEnabled ? (isPackaged ? (itemTaxRate || baseRate) : baseRate) : 0;

    let lineEx = 0, tax = 0, lineInc = 0;

    if (!gstEnabled) {
      lineInc = unitInc * qty;
      lineEx = lineInc;
      tax = 0;
    } else if (isPackaged || pricesIncludeTax) {
      lineInc = unitInc * qty;
      lineEx = effectiveRate > 0 ? lineInc / (1 + effectiveRate / 100) : lineInc;
      tax = lineInc - lineEx;
    } else {
      lineEx = unitInc * qty;
      tax = (effectiveRate / 100) * lineEx;
      lineInc = lineEx + tax;
    }

    const unitEx = qty ? (lineEx / qty) : 0;
    const unitTax = qty ? (tax / qty) : 0;

    subtotal_ex_tax += Number(lineEx.toFixed(2));
    total_tax += Number(tax.toFixed(2));
    total_inc_tax += Number(lineInc.toFixed(2));

    return {
      menu_item_id: menu.id,
      quantity: qty,
      // NOTE: in your schema, `order_items.price` is line total in many flows; keep it as line inc-tax for consistency.
      price: Number(lineInc.toFixed(2)),
      item_name: menu.name,
      unit_price_ex_tax: Number(unitEx.toFixed(2)),
      unit_tax_amount: Number(unitTax.toFixed(2)),
      unit_price_inc_tax: Number(unitInc.toFixed(2)),
      tax_rate: Number(effectiveRate.toFixed(2)),
      hsn: menu.hsn || null,
      is_packaged_good: isPackaged,
      variant_option_id: it.variant_option_id || null,
      variant_name: it.variant_name || null,
    };
  });

  subtotal_ex_tax = Number(subtotal_ex_tax.toFixed(2));
  total_tax = Number(total_tax.toFixed(2));
  total_inc_tax = Number(total_inc_tax.toFixed(2));

  // 6) Insert order (delivery)
  const now = new Date().toISOString();
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      restaurant_id: restaurantId,
      order_type: 'delivery',
      table_number: 'DELIVERY',               // keeps legacy UI happy
      status: 'new',
      delivery_status: 'new',
      payment_method,
      payment_status,

      customer_id: cust.id,
      customer_name: customerName || cust.name || null,
      customer_phone: phone,
      customer_email: customerEmail || null,

      delivery_address_id: addr.id,
      delivery_instructions: deliveryInstructions || null,
      special_instructions: kitchenInstructions || null,

      // fill both “new” and legacy total columns for compatibility
      subtotal_ex_tax,
      total_tax,
      total_inc_tax,
      total_amount: total_inc_tax,
      subtotal: subtotal_ex_tax,
      tax_amount: total_tax,
      total: total_inc_tax,

      gst_enabled: gstEnabled,
      prices_include_tax: pricesIncludeTax,

      updated_at: now,
    })
    .select('id, created_at')
    .single();

  if (orderErr) return res.status(500).json({ error: orderErr.message });

  // 7) Insert order_items
  const orderItemsPayload = preparedOrderItems.map(oi => ({ ...oi, order_id: order.id }));
  const { error: oiErr } = await supabase.from('order_items').insert(orderItemsPayload);
  if (oiErr) {
    await supabase.from('orders').delete().eq('id', order.id);
    return res.status(500).json({ error: oiErr.message });
  }

  // 8) Update restaurant_customers (MVP upsert)
  await supabase
    .from('restaurant_customers')
    .upsert(
      {
        restaurant_id: restaurantId,
        customer_id: cust.id,
        first_order_at: now,
        last_order_at: now,
        total_spent: total_inc_tax,
        updated_at: now,
      },
      { onConflict: 'restaurant_id,customer_id' }
    );

  // 9) Optional: generate invoice (recommended if your ops depend on it) [file:2622]
  try {
    await InvoiceService.createInvoiceFromOrder(order.id, null);
  } catch (e) {
    // keep the order; invoice can be retried from admin
    console.warn('Invoice creation failed:', e?.message || e);
  }

  // 10) Send push notification
  try {
    await sendNewOrderPush({
      supabase,
      restaurantId,
      orderId: order.id,
      orderType: 'delivery',
      tableNumber: 'DELIVERY',
      totalAmount: total_inc_tax,
      orderItems: preparedOrderItems,
    });
  } catch (e) {
    console.error('Push notification failed:', e);
  }

  return res.status(200).json({
    success: true,
    orderId: order.id,
    created_at: order.created_at,
    totals: { subtotal_ex_tax, total_tax, total_inc_tax },
  });
}
