// pages/api/orders/create.js
import { createClient } from '@supabase/supabase-js';
import { InvoiceService } from '../../../services/invoiceService';

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
      original_payment_method = null,
      status: incomingStatus = null,
      number_of_customers = null, // optional
      custom_created_at = null,
      discount_amount = 0,
      total_discount_percent = 0, // NEW: Capture percentage
      round_off_amount = 0,
    } = req.body;

    if (!restaurant_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 1) Load menu item attributes
    const itemIds = items.map((it) => it.id).filter(Boolean);
    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, is_packaged_good, tax_rate, uom:unit_of_measures(precision, short_code)')
      .in('id', itemIds);

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
        'gst_enabled, default_tax_rate, prices_include_tax, features_inventory_enabled'
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

    // Align baseRate STRICTLY with frontend: check request body, then restaurants table, then default 5.
    const baseRate = Number(req.body.base_tax_rate ?? (restaurantRow?.default_tax_rate || 5));
    const gstEnabled = !!profile?.gst_enabled;
    const inventoryAlertsEnabled = !!profile?.features_inventory_enabled;
    const serviceRate = gstEnabled ? baseRate : 0;
    const serviceInclude =
      gstEnabled &&
      (profile?.prices_include_tax === true ||
        profile?.prices_include_tax === 'true' ||
        profile?.prices_include_tax === 1 ||
        profile?.prices_include_tax === '1');

    // 4) Compute totals
    // 4) Compute totals
    let taxableSubtotalBase = 0;   // Sum of (Base - LineDisc) for Normal GST items
    let nonTaxableTotal = 0;       // Sum of Final Line Totals for Packaged/Non-GST items
    let packagedTaxFixedSum = 0;   // FIXED tax sum from Packaged/MRP items

    const preparedItems = items.map((it) => {
      const qty = Number(it.quantity ?? 1);
      const faceUnit = Number(it.price ?? 0); // Face Value (might include tax)
      const menuItem = menuItems?.find((mi) => mi.id === it.id);
      
      // Determine Rates & Flags
      const itemTaxRate = Number(menuItem?.tax_rate ?? it.tax_rate ?? 0);
      const isPackaged = !!(menuItem?.is_packaged_good || it.is_packaged_good);
      
      let rate = 0;
      if (gstEnabled) {
          // For packaged goods: use item rate if > 0, else fallback to default
          // For normal items: always use default rate
          if (isPackaged) {
              rate = itemTaxRate > 0 ? itemTaxRate : baseRate;
          } else {
              rate = baseRate;
          }
      }
      if (rate < 0) rate = 0;
      
      // "Prices Include Tax" check
      // Packaged goods are always inclusive (MRP). Normal items depend on profile.
      const isInclusive = gstEnabled && (isPackaged || serviceInclude);

      // 1. Base
      const baseUnit = isInclusive && rate > 0 ? (faceUnit / (1 + rate/100)) : faceUnit;
      const totalBase = baseUnit * qty;
      const taxOnMRP = isInclusive && rate > 0 ? (faceUnit - baseUnit) * qty : 0;

      // 2. Line Discount
      let lineDiscountAmt = 0;
      let lineDiscountPct = 0;
      const d = it.discount;
      if (d && Number(d.value) > 0) {
          if (d.type === 'amount') {
              lineDiscountAmt = Number(d.value);
          } else {
              // Line discount on Face Value
              lineDiscountAmt = (faceUnit * qty) * (Number(d.value)/100);
          }
      } else if (Number(it.discount_amount) > 0) {
          lineDiscountAmt = Number(it.discount_amount);
      }
      
      // Cap discount
      if (lineDiscountAmt > (faceUnit * qty)) lineDiscountAmt = faceUnit * qty;

      let finalTaxableLine = 0;
      let taxLine = 0;
      let finalLineTotal = 0;

      if (!isPackaged) {
          // Normal Items: GST follows the discount
          finalTaxableLine = totalBase - (isInclusive ? (lineDiscountAmt / (1 + rate/100)) : lineDiscountAmt);
          taxLine = finalTaxableLine * (rate / 100);
          finalLineTotal = finalTaxableLine + taxLine;
          
          taxableSubtotalBase += Math.max(0, finalTaxableLine);
      } else {
          // Packaged Goods: GST stays FIXED from MRP (User Rule)
          // Round per item to ensure 21.875 -> 21.88
          const roundedTaxLine = Number(taxOnMRP.toFixed(2));
          taxLine = roundedTaxLine;
          finalLineTotal = Math.max(0, (faceUnit * qty) - lineDiscountAmt);
          finalTaxableLine = finalLineTotal - taxLine;
          
          nonTaxableTotal += finalLineTotal;
          packagedTaxFixedSum += taxLine;
      }

      return {
        order_id: null,
        menu_item_id: it.id,
        quantity: qty,
        price: faceUnit, // Store Face Value
        item_name: it.name,
        variant_option_id: it.variant_id || it.variant_option_id || null,
        variant_name: it.variant_name || null,
        
        // Storing Base & Tax details
        unit_price_ex_tax: Number(baseUnit.toFixed(2)),
        unit_price_inc_tax: Number((baseUnit + (taxOnMRP/qty)).toFixed(2)),
        unit_tax_amount: Number((taxLine / qty).toFixed(2)),
        
        tax_rate: rate,
        hsn: it.hsn || null,
        is_packaged_good: isPackaged,
        uom_short_code: it.uom_short_code || menuItem?.uom?.short_code || null,
        uom_precision: it.uom_precision ?? menuItem?.uom?.precision ?? 0,
        
        discount_amount: Number(lineDiscountAmt.toFixed(2)),
        discount_percent: Number(lineDiscountPct.toFixed(2)),
      };
    });

    // STEP 6: ORDER LEVEL DISCOUNT
    // Applies ONLY to the Sum of Taxable Bases of Normal Items
    let orderDiscountAmt = Number(discount_amount || 0);
    let orderDiscountPct = Number(total_discount_percent || 0);

    if (orderDiscountPct > 0) {
        orderDiscountAmt = taxableSubtotalBase * (orderDiscountPct / 100);
    } else if (orderDiscountAmt > 0 && taxableSubtotalBase > 0) {
        // SCALE the rupee discount for inclusive shops so "10 off total" works
        const scaledDisc = serviceInclude ? (orderDiscountAmt / (1 + baseRate / 100)) : orderDiscountAmt;
        orderDiscountPct = (scaledDisc / taxableSubtotalBase) * 100;
        orderDiscountAmt = scaledDisc;
    } else {
        orderDiscountAmt = 0;
        orderDiscountPct = 0;
    }
    
    // Cap order discount at normal base
    if (orderDiscountAmt > taxableSubtotalBase) orderDiscountAmt = taxableSubtotalBase;

    // STEP 7: FINAL CALCULATIONS (Golden Rule)
    const finalNormalTaxable = Math.max(0, taxableSubtotalBase - orderDiscountAmt);
    const finalNormalTax = gstEnabled ? finalNormalTaxable * (baseRate / 100) : 0;
    
    // Final Totals for DB - Allow OVERRIDE from Trusted Frontend if provided
    const overrides = req.body.override_totals || {};

    const packagedBaseTotal = nonTaxableTotal - packagedTaxFixedSum;
    const grossSubtotalEx = Number((taxableSubtotalBase + packagedBaseTotal).toFixed(2));
    const finalSubtotalEx = overrides.subtotal_ex ?? grossSubtotalEx; 
    
    const finalTotalTax = overrides.total_tax ?? Number((finalNormalTax + packagedTaxFixedSum).toFixed(2));
    const finalTotalInc = overrides.total_inc_tax ?? Number((finalNormalTaxable + finalNormalTax + nonTaxableTotal).toFixed(2)); 
    const finalRoundOff = Number(round_off_amount || 0);
    const finalGrandTotal = overrides.total_amount ?? Number((finalTotalInc + finalRoundOff).toFixed(2)); 
    



    // 5) Mixed payment validation
    let processedPaymentMethod = payment_method;
    let processedMixedDetails = null;

    if (payment_method === 'mixed' && mixed_payment_details) {
      const { cash_amount, online_amount, online_method } = mixed_payment_details;
      const mixedTotal = Number(cash_amount || 0) + Number(online_amount || 0);
      const orderTotal = finalGrandTotal;
      if (Math.abs(mixedTotal - orderTotal) > 0.01) {
        return res.status(400).json({
          error: `Mixed payment amounts do not match order total (Expected: ${orderTotal}, Got: ${mixedTotal})`,
        });
      }
      processedMixedDetails = {
        cash_amount: Number(cash_amount),
        online_amount: Number(online_amount),
        online_method: online_method || 'upi',
        is_mixed: true,
      };
    }

    // 6) Final status
    let finalStatus = incomingStatus;
    if (!finalStatus) {
      finalStatus = 'new';
    }

    // 7) Insert order
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          restaurant_id,
          table_number: table_number || null,
          order_type,
          status: finalStatus,
          payment_method: processedPaymentMethod,
          payment_status,
          special_instructions,
          restaurant_name: finalRestaurantName,
          customer_name: customer_name || null,
          customer_phone: customer_phone || null,
          subtotal_ex_tax: finalSubtotalEx,
          total_tax: finalTotalTax,
          total_inc_tax: finalTotalInc,
          discount_amount: Number(orderDiscountAmt.toFixed(2)), 
          total_discount_percent: Number(orderDiscountPct.toFixed(2)), 
          round_off_amount: finalRoundOff,
          total_amount: finalGrandTotal,
          prices_include_tax: serviceInclude,
          gst_enabled: gstEnabled,
          mixed_payment_details: processedMixedDetails,
          is_credit: is_credit ?? false,
          credit_customer_id: credit_customer_id ?? null,
          original_payment_method: original_payment_method || null,
          number_of_customers: number_of_customers || null,
          created_at: custom_created_at || undefined,
          date_ordered: custom_created_at || new Date().toISOString(),
        },
      ])
      .select('id, created_at');

    if (orderError) {
      console.error('Order creation error:', orderError);
      return res
        .status(500)
        .json({ error: 'Failed to create order: ' + orderError.message });
    }

    if (!orderData || orderData.length === 0) {
      return res
        .status(500)
        .json({ error: 'Order created but could not retrieve ID' });
    }

    const order = orderData[0];

    // 8) Insert order items
    const orderItems = preparedItems.map((oi) => ({ ...oi, order_id: order.id }));
    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('Order items error:', itemsError);
      await supabase.from('orders').delete().eq('id', order.id);
      return res.status(500).json({ error: 'Failed to create order items' });
    }

    // 9) Create invoice synchronously (so invoice_no is ready for printing)
    let invoice = null;
    try {
      await InvoiceService.createInvoiceFromOrder(order.id, null);
      const { data: invoiceData } = await supabase
        .from('invoices')
        .select('id, invoice_no, bill_no')
        .eq('order_id', order.id)
        .single();

      invoice = invoiceData;
      
      // Fallback: If bill_no is missing (old invoices), generate it now
      if (!invoice.bill_no) {
        const newBillNo = await InvoiceService.generateBillNumber(restaurant_id);
        await supabase
          .from('invoices')
          .update({ bill_no: newBillNo })
          .eq('id', invoice.id);
        invoice.bill_no = newBillNo;
      }
    } catch (invoiceErr) {
      await supabase.from('order_items').delete().eq('order_id', order.id);
      await supabase.from('orders').delete().eq('id', order.id);
      console.error('InvoiceService failed:', invoiceErr);
      return res
        .status(500)
        .json({ error: 'Failed to create invoice via service: ' + (invoiceErr.message || JSON.stringify(invoiceErr)) });
    }

    // 10) Build response payload for fast client-side print
    const responsePayload = {
      success: true,
      order_id: order.id,
      invoice_id: invoice.id,
      invoice_no: invoice.invoice_no,
      bill_no: invoice.bill_no,
      order_number: order.id.slice(0, 8).toUpperCase(),
      order_for_print: {
        id: order.id,
        restaurant_id,
        order_type,
        table_number: table_number || null,
        customer_name,
        customer_phone,
        subtotal_ex_tax: Number(finalSubtotalEx.toFixed(2)),
        total_tax: Number(finalTotalTax.toFixed(2)),
        total_inc_tax: Number(finalTotalInc.toFixed(2)),
        discount_amount: Number(orderDiscountAmt.toFixed(2)),
        total_discount_percent: Number(orderDiscountPct.toFixed(2)),
        round_off_amount: Number(round_off_amount ?? 0),
        number_of_customers: number_of_customers || null,
        prices_include_tax: serviceInclude,
        total_amount: Number(finalGrandTotal.toFixed(2)),
        items: preparedItems.map((pi) => ({
          name: pi.variant_name ? `${pi.item_name} (${pi.variant_name})` : pi.item_name,
          quantity: pi.quantity,
          price: pi.price, // Unit Price (Face Value)
          discount_amount: pi.discount_amount, // Total Line Discount
          discount: (pi.discount_percent > 0 || pi.discount_amount > 0) ? {
              type: pi.discount_percent > 0 ? 'percent' : 'amount',
              value: pi.discount_percent > 0 ? pi.discount_percent : pi.discount_amount
          } : null,
          uom: pi.uom_short_code,
          uom_short_code: pi.uom_short_code,
          uom_precision: pi.uom_precision,
          line_total: Number((pi.price * pi.quantity - pi.discount_amount).toFixed(2)),
        })),
        payment_status,
        status: finalStatus,
        invoice_no: invoice.invoice_no,
        bill_no: invoice.bill_no,
        created_at: order.created_at,
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
          orderId: order.id,
          restaurantId: restaurant_id,
          status: finalStatus,
          invoiceNo: invoice.invoice_no,
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
              orderId: order.id,
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

    // 12) Send response now (client can print immediately)
    return res.status(200).json(responsePayload);
  } catch (e) {
    console.error('API error:', e);
    return res
      .status(500)
      .json({ error: e?.message || 'Internal server error' });
  }
}
