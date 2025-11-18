// pages/api/orders/create.js

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  console.log('[/api/orders/create] handler called, method =', req.method);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const {
      restaurant_id,
      table_number,
      order_type = 'counter',
      items,
      payment_method = 'cash',
      payment_status = 'pending',
      special_instructions = null,
      mixed_payment_details = null,
      restaurant_name = null,
      customer_name = null,
      customer_phone = null,
      is_credit = false,
      credit_customer_id = null,
      original_payment_method = null
    } = req.body;

    if (!restaurant_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Load menu item attributes
    const itemIds = items.map((it) => it.id).filter(Boolean);
    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, is_packaged_good, tax_rate')
      .in('id', itemIds);

    if (menuError) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Menu items fetch error:', menuError);
      }
      return res.status(500).json({ error: 'Failed to load menu items' });
    }

    // Load restaurant profile (with inventory flag)
    const { data: profile, error: profileErr } = await supabase
      .from('restaurant_profiles')
      .select('gst_enabled, default_tax_rate, prices_include_tax, features_inventory_enabled')
      .eq('restaurant_id', restaurant_id)
      .maybeSingle();

    // Always load restaurant display name from restaurants table
    const { data: restaurantRow, error: restaurantErr } = await supabase
      .from('restaurants')
      .select('name')
      .eq('id', restaurant_id)
      .maybeSingle();

    if (restaurantErr && process.env.NODE_ENV !== 'production') {
      console.error('Restaurant fetch error:', restaurantErr);
    }

    // Prefer the name sent by the client, otherwise use the DB name
    const finalRestaurantName = restaurant_name || restaurantRow?.name || null;

    if (profileErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Profile fetch error:', profileErr);
      }
      return res.status(500).json({ error: 'Failed to load settings' });
    }

    const baseRate = Number(profile?.default_tax_rate ?? 5);
    const gstEnabled = !!profile?.gst_enabled;
    const inventoryAlertsEnabled = !!profile?.features_inventory_enabled;
    const serviceRate = gstEnabled ? baseRate : 0;
    const serviceInclude = gstEnabled
      ? (
          profile?.prices_include_tax === true ||
          profile?.prices_include_tax === 'true' ||
          profile?.prices_include_tax === 1 ||
          profile?.prices_include_tax === '1'
        )
      : false;

    // Compute totals
    let subtotalEx = 0;
    let totalTax = 0;
    let totalInc = 0;

    const preparedItems = items.map((it) => {
      const qty = Number(it.quantity ?? 1);
      const unit = Number(it.price ?? 0);
      const menuItem = menuItems?.find((mi) => mi.id === it.id);
      const isPackaged = !!(menuItem?.is_packaged_good || it.is_packaged_good);
      const itemTaxRate = Number(menuItem?.tax_rate ?? it.tax_rate ?? 0);
      let effectiveRate = isPackaged && gstEnabled ? itemTaxRate : serviceRate;
      if ((effectiveRate == null || effectiveRate <= 0) && gstEnabled) {
        effectiveRate = baseRate;
      }

      let unitEx, unitInc, lineEx, tax, lineInc;
      if (isPackaged || serviceInclude) {
        unitInc = unit;
        unitEx = effectiveRate > 0 ? unitInc / (1 + effectiveRate / 100) : unitInc;
        lineInc = unitInc * qty;
        lineEx = unitEx * qty;
        tax = lineInc - lineEx;
      } else {
        unitEx = unit;
        lineEx = unitEx * qty;
        tax = (effectiveRate / 100) * lineEx;
        lineInc = lineEx + tax;
        unitInc = effectiveRate > 0 ? unitEx * (1 + effectiveRate / 100) : unitEx;
      }

      const unitExR = Number(unitEx.toFixed(2));
      const unitIncR = Number(unitInc.toFixed(2));
      const lineExR = Number(lineEx.toFixed(2));
      const taxR = Number(tax.toFixed(2));
      const lineIncR = Number(lineInc.toFixed(2));

      subtotalEx += lineExR;
      totalTax += taxR;
      totalInc += lineIncR;

      return {
        order_id: null,
        menu_item_id: it.id,
        quantity: qty,
        price: unit,
        item_name: it.name,
        unit_price_ex_tax: unitExR,
        unit_price_inc_tax: unitIncR,
        unit_tax_amount: Number((unitIncR - unitExR).toFixed(2)),
        tax_rate: effectiveRate,
        hsn: it.hsn || null,
        is_packaged_good: isPackaged
      };
    });

    let processedPaymentMethod = payment_method;
    let processedMixedDetails = null;

    if (payment_method === 'mixed' && mixed_payment_details) {
      const { cash_amount, online_amount, online_method } = mixed_payment_details;
      const mixedTotal = Number(cash_amount || 0) + Number(online_amount || 0);
      const orderTotal = Number(totalInc.toFixed(2));
      if (Math.abs(mixedTotal - orderTotal) > 0.01) {
        return res.status(400).json({
          error: 'Mixed payment amounts do not match order total'
        });
      }
      processedMixedDetails = {
        cash_amount: Number(cash_amount).toFixed(2),
        online_amount: Number(online_amount).toFixed(2),
        online_method: online_method || 'upi',
        is_mixed: true
      };
    }

    // Insert order
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          restaurant_id,
          table_number: table_number || null,
          order_type,
          status: 'new',
          payment_method: processedPaymentMethod,
          payment_status,
          special_instructions,
          restaurant_name: finalRestaurantName,
          customer_name: customer_name || null,
          customer_phone: customer_phone || null,
          subtotal_ex_tax: Number(subtotalEx.toFixed(2)),
          total_tax: Number(totalTax.toFixed(2)),
          total_inc_tax: Number(totalInc.toFixed(2)),
          total_amount: Number(totalInc.toFixed(2)),
          prices_include_tax: serviceInclude,
          gst_enabled: gstEnabled,
          mixed_payment_details: processedMixedDetails,
          is_credit: is_credit ?? false,
          credit_customer_id: credit_customer_id ?? null,
          original_payment_method: original_payment_method || null
        }
      ])
      .select('id');

    if (orderError) {
      console.error('Order creation error:', orderError);
      return res.status(500).json({ error: 'Failed to create order: ' + orderError.message });
    }

    if (!orderData || orderData.length === 0) {
      return res.status(500).json({ error: 'Order created but could not retrieve ID' });
    }

    const order = orderData[0];

    // Insert order items
    const orderItems = preparedItems.map((oi) => ({ ...oi, order_id: order.id }));
    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('Order items error:', itemsError);
      await supabase.from('orders').delete().eq('id', order.id);
      return res.status(500).json({ error: 'Failed to create order items' });
    }

    // ✅ Deduct stock for each menu item based on recipes
    for (const item of items) {
      if (!item.id || !item.quantity) continue;

      try {
        // Get recipe for this menu item
        const { data: recipe, error: recipeErr } = await supabase
          .from('recipes')
          .select('id, recipe_items(ingredient_id, quantity)')
          .eq('menu_item_id', item.id)
          .eq('restaurant_id', restaurant_id)
          .maybeSingle();

        if (recipeErr || !recipe || !recipe.recipe_items || recipe.recipe_items.length === 0) {
          continue;
        }

        // Check if menu item is packaged good - skip if true
        const menuItem = menuItems?.find((mi) => mi.id === item.id);
        if (menuItem?.is_packaged_good) {
          continue;
        }

        console.log(`Processing stock deduction for menu item ${item.id} with recipe ${recipe.id}`);

        for (const recipeItem of recipe.recipe_items) {
          const deductAmount = Number(recipeItem.quantity) * Number(item.quantity);

          // Get all needed ingredient data in ONE call (id, name, current_stock, reorder_threshold)
          const { data: ingredient, error: ingErr } = await supabase
            .from('ingredients')
            .select('id, current_stock, name, reorder_threshold')
            .eq('id', recipeItem.ingredient_id)
            .eq('restaurant_id', restaurant_id)
            .single();

          if (ingErr || !ingredient) {
            console.warn(`Ingredient not found: ${recipeItem.ingredient_id}`);
            continue;
          }

          const newStock = Number(ingredient.current_stock) - deductAmount;

          // Log low-stock check OR negative warning
          if (newStock < 0) {
            console.warn(`Low stock warning: ${ingredient.name} will be negative (${newStock})`);
          } else {
            console.log('Low-stock check:', {
              ingredientId: ingredient.id,
              name: ingredient.name,
              newStock,
              reorder_threshold: Number(ingredient.reorder_threshold)
            });
          }

          // Update stock (can go negative)
          const { error: updateErr } = await supabase
            .from('ingredients')
            .update({
              current_stock: newStock,
              updated_at: new Date().toISOString()
            })
            .eq('id', ingredient.id);

          if (updateErr) {
            console.error(`Failed to update stock for ingredient ${ingredient.id}:`, updateErr);
            continue;
          }

          // Low-stock alert only when inventory alerts enabled and stock < threshold
          if (
            inventoryAlertsEnabled &&
            ingredient.reorder_threshold != null &&
            newStock < Number(ingredient.reorder_threshold)
          ) {
            const alertTime = new Date().toISOString();
            try {
              const { data: alertData, error: alertError } = await supabase
                .from('alert_notification')
                .insert([
                  {
                    restaurant_id,
                    table_number: table_number ?? 0,
                    created_at: alertTime,
                    status: 'pending',
                    message: `${ingredient.name} (${newStock})`
                  }
                ])
                .select();

              if (alertError) {
                console.error('Low-stock alert insert failed:', alertError);
              } else {
                console.log('Low-stock alert inserted:', alertData?.[0]?.id || null);
              }
            } catch (e) {
              console.error('Low-stock alert insert exception:', e);
            }
          }
        }
      } catch (stockErr) {
        console.error(`Stock deduction failed for item ${item.id}:`, stockErr.message);
      }
    }

    // ✅ Log successful creation
    console.log('[API CREATE ORDER] Order created successfully:', {
      orderId: order.id,
      restaurantId: restaurant_id,
      status: 'new',
      timestamp: new Date().toISOString()
    });

    // Send push notification (non-blocking)
    try {
      const base = process.env.NEXT_PUBLIC_BASE_URL || '';
      await fetch(`${base}/api/notify-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant_id,
          orderId: order.id,
          orderItems: items
        })
      }).catch((e) =>
        console.warn('notify-owner failed (non-blocking):', e?.message || e)
      );
    } catch (e) {
      console.warn('Notification dispatch failed (non-blocking):', e?.message || e);
    }

    return res.status(200).json({
      success: true,
      id: order.id,
      order_id: order.id,
      order_number: order.id.slice(0, 8).toUpperCase()
    });
  } catch (e) {
    console.error('API error:', e);
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}
