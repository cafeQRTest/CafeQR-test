// pages/api/orders/create.js
import { createClient } from '@supabase/supabase-js';
import { InvoiceService } from '../../../services/invoiceService';
import { OrderService } from '../../../services/orderService';
import { ensureCustomer } from '../../../lib/customer/ensureCustomer';

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
      customer_id = null,
      customer_name = null,
      customer_phone = null,
      user_id = null,
      is_credit = false,
      credit_customer_id = null,
      original_payment_method = null,
      status: incomingStatus = null,
      number_of_customers = null, // optional
      custom_created_at = null,
      discount_amount = 0,
      total_discount_percent = 0, // NEW: Capture percentage
      round_off_amount = 0,
      loyalty_amount_used = 0, // Capture loyalty redemption amt
      loyalty_points_used = null, // Capture explicit point redemption
    } = req.body;

    // --- Customer Resolution Logic ---
    let finalCustomerId = customer_id || null;

    // If no ID provided but we have a phone or name, try to find/create
    if (!finalCustomerId && (customer_phone || customer_name || credit_customer_id)) {
      try {
        // If credit customer ID is explicit, prefer that as the customer link
        if (is_credit && credit_customer_id) {
          // Usually credit_customer_id maps to 'restaurant_customers.id' or 'customers.id'
          // We'll trust the frontend passed a valid UUID.
          // But if specific logic is needed, we can check it. 
          // Often credit_customer_id IS the customer_id.
          // If they are distinct concepts in your DB, handle accordingly.
          // Assuming here we want to link the order to that customer.
          finalCustomerId = credit_customer_id;
        } else {
          finalCustomerId = await ensureCustomer(supabase, {
            restaurant_id,
            phone: customer_phone,
            name: customer_name,
            // email, address if available in body
          });
        }
      } catch (custErr) {
        console.error('[CreateOrder] Failed to ensure customer:', custErr);
        // Don't swallow for now, let's see why it failed. 
        // Optional: throw custErr; 
        // For production, swallowing is safer for Order Completion, but for debugging we need this log.
      }
    }
    // ---------------------------------

    if (!restaurant_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 1) Load menu item attributes
    // Use strict UUID check to prevent 22P02 errors from temporary IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const itemIds = items.map((it) => it.id).filter(id => id && uuidRegex.test(id));

    let menuItems = [];
    let menuError = null;

    if (itemIds.length > 0) {
      try {
        const { data, error } = await supabase
          .from('menu_items')
          .select('id, is_packaged_good, tax_rate, uom:unit_of_measures(precision, short_code)')
          .in('id', itemIds);

        if (error) throw error;
        menuItems = data;
      } catch (err) {
        menuError = err;
        if (err.code === '22P02') {
          return res.status(400).json({ error: 'Invalid Order ID format' });
        }
      }
    }

    if (menuError) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Menu items fetch error:', menuError);
      }
      return res.status(500).json({ error: 'Failed to load menu items' });
    }

    // 2) Load restaurant profile
    const { data: profile, error: profileErr } = await supabase
      .from('restaurant_profiles')
      .select(
        'gst_enabled, default_tax_rate, prices_include_tax, features_inventory_enabled, round_off_enabled, round_off_mode, round_off_auto_factor, round_off_manual_limit'
      )
      .eq('restaurant_id', restaurant_id)
      .maybeSingle();

    // 3) Load restaurant display name and default tax rate (mirroring frontend orders.js logic)
    const { data: restaurantRow, error: restaurantErr } = await supabase
      .from('restaurants')
      .select('name, default_tax_rate')
      .eq('id', restaurant_id)
      .maybeSingle();

    if (restaurantErr && process.env.NODE_ENV !== 'production') {
      console.error('Restaurant fetch error:', restaurantErr);
    }

    const finalRestaurantName = restaurant_name || restaurantRow?.name || null;

    if (profileErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Profile fetch error:', profileErr);
      }
      return res.status(500).json({ error: 'Failed to load settings' });
    }

    // Align baseRate STRICTLY with frontend: check request body, then PROFILE (System), then restaurants table, then default 5.
    const baseRate = Number(req.body.base_tax_rate ?? (profile?.default_tax_rate ?? (restaurantRow?.default_tax_rate || 5)));
    const gstEnabled = !!profile?.gst_enabled;
    const inventoryAlertsEnabled = !!profile?.features_inventory_enabled;
    const serviceRate = gstEnabled ? baseRate : 0;
    const serviceInclude =
      gstEnabled &&
      ((req.body.prices_include_tax !== undefined
        ? (req.body.prices_include_tax === true || req.body.prices_include_tax === 'true')
        : (profile?.prices_include_tax === true ||
          profile?.prices_include_tax === 'true' ||
          profile?.prices_include_tax === 1 ||
          profile?.prices_include_tax === '1')
      ));

    // 4) Compute totals
    // 4) Compute totals using Centralized Logic
    // First, merge DB attributes into items so the utility has the correct flags
    const mergedItems = items.map(it => {
      const menuItem = menuItems?.find((mi) => mi.id === it.id);
      const uomObj = menuItem?.uom;

      return {
        ...it,
        // Priority: Item (Request) > DB
        is_packaged_good: !!(menuItem?.is_packaged_good || it.is_packaged_good),
        tax_rate: (it.tax_rate !== undefined && it.tax_rate !== null) ? it.tax_rate : menuItem?.tax_rate,
        uom_short_code: it.uom_short_code || uomObj?.short_code || null,
        uom_precision: it.uom_precision ?? uomObj?.precision ?? 0,

        // Ensure price is number
        price: Number(it.price || 0),
        quantity: Number(it.quantity || 1)
      };
    });

    // Check if manual round-off was provided from frontend (counter.js)
    const hasManualRoundOff = round_off_amount !== undefined && round_off_amount !== null && round_off_amount !== 0;

    const {
      processed_items,
      line_subtotal,
      line_discount_total,
      taxable_amount: finalTaxableAmount,
      total_tax: finalTotalTax,
      total_inc_tax: finalTotalInc,
      total_amount: finalGrandTotal,
      round_off_amount: finalRoundOff,
      bill_discount_amount,
      order_discount_percent: orderDiscountPct,
      subtotal_after_line_discounts,
      total_order_discount_base,
    } = await import('../../../utils/orderCalculations').then(m => m.calculateOrderTotals(
      mergedItems,
      {
        type: total_discount_percent > 0 ? 'percent' : 'amount',
        value: total_discount_percent > 0 ? total_discount_percent : (discount_amount || 0)
      },
      {
        gst_enabled: gstEnabled,
        default_tax_rate: baseRate,
        prices_include_tax: serviceInclude,
        round_off_config: profile?.round_off_enabled ? {
          round_off_enabled: true,
          round_off_mode: hasManualRoundOff ? 'manual' : (profile?.round_off_mode || 'automatic'),
          round_off_manual_value: hasManualRoundOff ? Number(round_off_amount) : 0,
          round_off_auto_factor: profile?.round_off_auto_factor
        } : { round_off_enabled: false }
      }
    ));

    // Map back to the specific DB structure expected by 'order_items' table
    const preparedItems = processed_items.map(pi => ({
      order_id: null,
      menu_item_id: pi.id,
      quantity: pi.quantity,
      price: pi.unit_price, // MRP (Face)
      item_name: pi.item_name,
      variant_option_id: pi.variant_id || pi.variant_option_id || null,
      variant_name: pi.variant_name || null,

      unit_price_ex_tax: pi.unit_price_ex_tax,
      unit_price_inc_tax: pi.unit_price_inc_tax,
      unit_tax_amount: pi.unit_tax_amount,

      tax_rate: pi.tax_rate,
      hsn: pi.hsn || null,
      is_packaged_good: pi.is_packaged_good,
      uom_short_code: pi.uom_short_code,
      uom_precision: pi.uom_precision,

      // Audit Fields
      discount_amount: pi.discount_amount, // Total reduction (Line + Bill Share)
      line_discount_amount: pi.line_discount_amount,
      order_discount_share: pi.order_discount_share,
      taxable_amount: pi.taxable_amount,
      tax_amount: pi.tax_amount,
      line_total: pi.line_total
    }));

    // 6. Final Status & Payment logic
    const finalStatus = incomingStatus || 'new';

    // Payment Logic (Mirroring frontend counter.js)
    let processedPaymentMethod = payment_method || 'cash';
    let processedMixedDetails = mixed_payment_details || null;
    let finalPaymentStatus = payment_status || 'pending';

    if (processedPaymentMethod === 'mixed' && processedMixedDetails) {
      // Validation/Sanitization could happen here if needed
    }

    if (finalStatus === 'completed') {
      finalPaymentStatus = 'paid';
    }

    // 7. Persist via Unified Service
    const orderResult = await OrderService.persistCalculatedOrder(supabase, {
      orderId: null, // New Order
      restaurantId: restaurant_id,
      calculationResult: {
        processed_items,
        line_subtotal,
        line_discount_total,
        taxable_amount: finalTaxableAmount,
        total_tax: finalTotalTax,
        total_inc_tax: finalTotalInc,
        total_amount: finalGrandTotal,
        round_off_amount: finalRoundOff,
        discount_amount: bill_discount_amount,
        order_discount_percent: orderDiscountPct,
        // Mandatory for correct auditing of Ex-Tax values
        subtotal_after_line_discounts,
        total_order_discount_base
      },
      metadata: {
        status: finalStatus,
        payment_status: finalPaymentStatus,
        payment_method: processedPaymentMethod,
        user_id,
        customer_id: finalCustomerId,
        customer_name,
        customer_phone,
        number_of_customers,
        order_type,
        table_number,
        is_credit,
        credit_customer_id,
        special_instructions,
        mixed_payment_details: processedMixedDetails,
        created_at: custom_created_at || new Date().toISOString(),
        prices_include_tax: serviceInclude,
        base_tax_rate: baseRate,
        gst_enabled: gstEnabled
      }
    });

    // 8. Build response payload for fast client-side print
    const responsePayload = {
      success: true,
      order_id: orderResult.orderId,
      invoice_id: orderResult.invoiceId,
      invoice_no: orderResult.invoiceNo,
      bill_no: orderResult.billNo,
      order_number: orderResult.orderId.slice(0, 8).toUpperCase(),
      order_for_print: {
        id: orderResult.orderId,
        restaurant_id,
        order_type,
        table_number: table_number || null,
        customer_name,
        customer_phone,
        subtotal_ex_tax: Number(subtotal_after_line_discounts.toFixed(2)),
        gross_taxable_amount: Number(subtotal_after_line_discounts.toFixed(2)),
        total_tax: Number(finalTotalTax.toFixed(2)),
        total_inc_tax: Number(finalTotalInc.toFixed(2)),
        discount_amount: Number(bill_discount_amount.toFixed(2)),
        bill_discount_base: Number(total_order_discount_base.toFixed(2)),
        total_discount_percent: Number(orderDiscountPct.toFixed(2)),
        round_off_amount: Number(finalRoundOff ?? 0),
        number_of_customers: number_of_customers || null,
        prices_include_tax: serviceInclude,
        total_amount: Number(finalGrandTotal.toFixed(2)),
        items: processed_items.map((pi) => ({
          name: pi.variant_name ? `${pi.item_name} (${pi.variant_name})` : pi.item_name,
          quantity: pi.quantity,
          price: pi.unit_price, // Unit Price (Face Value)
          discount_amount: pi.discount_amount, // Total reduction
          uom: pi.uom_short_code,
          uom_short_code: pi.uom_short_code,
          uom_precision: pi.uom_precision,
          line_total: pi.line_total,
        })),
        payment_status,
        status: finalStatus,
        invoice_no: orderResult.invoiceNo,
        bill_no: orderResult.billNo,
        created_at: orderResult.created_at,
        loyalty_amount_used: loyalty_amount_used || 0,
        loyalty_points_used: loyalty_points_used || 0,
      },
    };



    // 11) Fire-and-forget background tasks (inventory + low-stock alerts + notify-owner)
    (async () => {
      try {
        // ✅ Deduct stock for each menu item based on recipes
        for (const item of items) {
          if (!item.id || !item.quantity) continue;

          try {
            // Find specific recipe for this variant, or fall back to base recipe
            let recipeQuery = supabase
              .from('recipes')
              .select('id, variant_option_id, recipe_items(ingredient_id, quantity)')
              .eq('menu_item_id', item.id)
              .eq('restaurant_id', restaurant_id)

            // Note: We can't easily do "try variant, else base" in one query without a robust helper or stored proc.
            // But we can fetch potentially both and pick the best one in JS.
            // Since we only expect max 2 rows (one for variant, one for base), this is cheap.

            const { data: potentialRecipes, error: recipeErr } = await recipeQuery;

            if (recipeErr) throw recipeErr;

            // Logic: 
            // 1. If item has variant_id, look for recipe with that variant_option_id
            // 2. If not found (or item has no variant), try finding one with variant_option_id IS NULL (base)

            const targetVariantId = item.variant_id || item.variant_option_id || null;
            let recipe = potentialRecipes?.find(r => {
              const rId = r.variant_option_id;
              if (!rId && !targetVariantId) return true;
              if (!rId || !targetVariantId) return false;
              return String(rId) === String(targetVariantId);
            });

            if (!recipe && targetVariantId) {
              // Fallback to base if specific variant recipe missing
              recipe = potentialRecipes?.find(r => r.variant_option_id === null);
            }
            // If still no recipe (and didn't have variant, or no base found), try just the first one if flexible? 
            // No, strictly follow base. If no base, then no recipe.
            if (!recipe && !targetVariantId && potentialRecipes?.length > 0) {
              recipe = potentialRecipes.find(r => r.variant_option_id === null);
            }

            if (
              recipeErr ||
              !recipe ||
              !recipe.recipe_items ||
              recipe.recipe_items.length === 0
            ) {
              continue;
            }



            console.log(
              `Processing stock deduction for menu item ${item.id} with recipe ${recipe.id}`
            );

            for (const recipeItem of recipe.recipe_items) {
              const deductAmount =
                Number(recipeItem.quantity) * Number(item.quantity);

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

              const newStock =
                Number(ingredient.current_stock) - deductAmount;

              if (newStock < 0) {
                console.warn(
                  `Low stock warning: ${ingredient.name} will be negative (${newStock})`
                );
              } else {
                console.log('Low-stock check:', {
                  ingredientId: ingredient.id,
                  name: ingredient.name,
                  newStock,
                  reorder_threshold: Number(ingredient.reorder_threshold),
                });
              }

              const { error: updateErr } = await supabase
                .from('ingredients')
                .update({
                  current_stock: newStock,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', ingredient.id);

              if (updateErr) {
                console.error(
                  `Failed to update stock for ingredient ${ingredient.id}:`,
                  updateErr
                );
                continue;
              }

              if (
                inventoryAlertsEnabled &&
                ingredient.reorder_threshold != null &&
                newStock < Number(ingredient.reorder_threshold)
              ) {
                const alertTime = new Date().toISOString();
                try {
                  const { error: alertError } = await supabase
                    .from('alert_notification')
                    .insert([
                      {
                        restaurant_id,
                        table_number: table_number ?? 0,
                        created_at: alertTime,
                        status: 'pending',
                        message: `${ingredient.name} (${newStock})`,
                      },
                    ]);

                  if (alertError) {
                    console.error(
                      'Low-stock alert insert failed:',
                      alertError
                    );
                  }
                } catch (e) {
                  console.error('Low-stock alert insert exception:', e);
                }
              }
            }
          } catch (stockErr) {
            console.error(
              `Stock deduction failed for item ${item.id}:`,
              stockErr.message
            );
          }
        }

        console.log('[API CREATE ORDER] Order created successfully:', {
          orderId: orderResult.orderId,
          restaurantId: restaurant_id,
          status: finalStatus,
          invoiceNo: orderResult.invoiceNo,
          timestamp: new Date().toISOString(),
        });

        // Push notification (non-blocking, background)
        try {
          const base = process.env.NEXT_PUBLIC_BASE_URL || '';
          await fetch(`${base}/api/notify-owner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              restaurantId: restaurant_id,
              orderId: orderResult.orderId,
              orderItems: items,
            }),
          }).catch((e) =>
            console.warn(
              'notify-owner failed (non-blocking):',
              e?.message || e
            )
          );
        } catch (e) {
          console.warn(
            'Notification dispatch failed (non-blocking):',
            e?.message || e
          );
        }
      } catch (bgErr) {
        console.error('Background tasks failed:', bgErr);
      }
    })();

    // 12) Handle LOYALTY EARNING (Backend Side)
    // Only if status is completed (paid) and not credit.
    console.log('[Loyalty Check] finalStatus:', finalStatus, 'finalPaymentStatus:', finalPaymentStatus, 'is_credit:', is_credit, 'finalCustomerId:', finalCustomerId);

    if ((finalStatus === 'completed' || finalPaymentStatus === 'paid') && !is_credit && finalCustomerId) {
      try {
        const { LoyaltyService } = await import('../../../services/loyaltyService');
        const loyaltyResult = await LoyaltyService.handleOrderEarning(supabase, {
          restaurant_id,
          customer_id: finalCustomerId,
          order_id: orderResult.orderId,
          order_total: finalGrandTotal,
          loyalty_amount_used: loyalty_amount_used || 0,
          loyalty_points_used: loyalty_points_used || null
        });

        // Sync earned points to invoice for display/reporting
        if (loyaltyResult?.success && loyaltyResult?.points > 0) {
          await supabase.from('invoices')
            .update({ loyalty_points_earned: loyaltyResult.points })
            .eq('order_id', orderResult.orderId);
        }

      } catch (loyErr) {
        console.error('[CreateOrder] Loyalty Service Error:', loyErr);
      }
    }

    // 12) Send response now (client can print immediately)
    return res.status(200).json(responsePayload);
  } catch (e) {
    console.error('API error:', e);
    return res
      .status(500)
      .json({ error: e?.message || 'Internal server error' });
  }
}
