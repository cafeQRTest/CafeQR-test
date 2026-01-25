// pages/api/orders/edit.js
// - Edits existing order in-place (NEW/IN_PROGRESS only)
// - Frontend sends FULL lines array (all items after edit)
// - Applies delta on order_items + stock (recipes)
// - Recalculates order totals from current order_items
// - FULLY REPLACES invoice_items from current order_items (no partial sync)
// - Returns order_for_print (same as create) + changed_items (delta KOT with qty diff)

import { createClient } from '@supabase/supabase-js';
import { InvoiceService } from '../../../services/invoiceService';
import { OrderService } from '../../../services/orderService';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Helper: per-line tax breakdown (uses same rules as recalculateOrderTotals)
function calcLineBreakdown({ qty, unit, menuItem, profile }) {
  const gstEnabled = !!profile?.gst_enabled;
  const baseRate = Number(profile?.default_tax_rate ?? 5);
  const pricesIncludeTax = profile?.prices_include_tax ?? true;

  const isPackaged = !!menuItem?.is_packaged_good;
  const rawItemTax = Number(menuItem?.tax_rate);

  let effectiveRate;

  if (isPackaged) {
    // Packaged goods: price is always tax-inclusive MRP.
    const itemTaxRate =
      Number.isFinite(rawItemTax) && rawItemTax > 0 ? rawItemTax : baseRate;
    effectiveRate = itemTaxRate;
  } else {
    // Non-packaged: respect gst_enabled and baseRate.
    effectiveRate = gstEnabled ? baseRate : 0;
  }

  let lineEx;
  let tax;
  let lineInc;

  if (isPackaged) {
    // Always inclusive for packaged goods.
    lineInc = unit * qty; // total line price stays exactly as given
    lineEx = effectiveRate > 0 ? lineInc / (1 + effectiveRate / 100) : lineInc;
    tax = lineInc - lineEx;
  } else if (pricesIncludeTax) {
    // Non-packaged but global setting says prices include tax.
    lineInc = unit * qty;
    lineEx = effectiveRate > 0 ? lineInc / (1 + effectiveRate / 100) : lineInc;
    tax = lineInc - lineEx;
  } else {
    // Non-packaged, prices exclude tax.
    lineEx = unit * qty;
    tax = (effectiveRate / 100) * lineEx;
    lineInc = lineEx + tax;
  }

  const unitEx = qty ? lineEx / qty : 0;
  const unitInc = qty ? lineInc / qty : 0;
  const unitTax = qty ? tax / qty : 0;

  return {
    unit_price_ex_tax: Number(unitEx.toFixed(2)),
    unit_tax_amount: Number(unitTax.toFixed(2)),
    unit_price_inc_tax: Number(unitInc.toFixed(2)),
    tax_rate: Number(effectiveRate.toFixed(2)),
    // line_total_ex_tax: Number(lineEx.toFixed(2)),
    // line_total_inc_tax: Number(lineInc.toFixed(2)),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabaseUrl || !supabaseKey || !supabase) {
    return res.status(500).json({ error: 'Server config error' });
  }

  try {
    const { order_id, restaurant_id, lines, table_number, reason = 'Order edited from dashboard' } = req.body || {};

    // 1) Basic validation
    if (!order_id || !restaurant_id || !Array.isArray(lines)) {
      return res.status(400).json({ error: 'order_id, restaurant_id, lines required' });
    }

    // 2) Normalize incoming lines (frontend sends full state)
    console.log('[DEBUG_EDIT_API] Received lines:', JSON.stringify(lines.map(l => ({ name: l.name, price: l.price, vid: l.variant_id })), null, 2));

    const filteredLines = lines
      .filter((l) => l && Number(l.quantity) > 0 && (l.menu_item_id || l.name))
      .map((l) => ({
        menu_item_id: l.menu_item_id || null,
        name: l.name || 'Item',
        price: Number(l.price) || 0,
        quantity: Number(l.quantity) || 1,
        hsn: l.hsn || null,
        is_packaged_good: !!l.is_packaged_good,
        variant_option_id: l.variant_id || l.variant_option_id || null,
        variant_name: l.variant_name || null,
        uom_short_code: l.uom_short_code || null,
        uom_precision: l.uom_precision ?? 0,
      }));

    if (filteredLines.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    // 3) Load order and validate status
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(
        'id, status, restaurant_id, table_number, order_type, customer_name, customer_phone, payment_status, created_at, updated_at, is_credit, credit_customer_id'
      )
      .eq('id', order_id)
      .eq('restaurant_id', restaurant_id)
      .single();

    if (orderErr || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!['new', 'in_progress'].includes(order.status)) {
      return res.status(400).json({ error: 'Only NEW or IN_PROGRESS orders can be edited' });
    }

    // 4) Load current order_items
    const { data: currentItems, error: itemsErr } = await supabase
      .from('order_items')
      .select('id, menu_item_id, quantity, price, item_name, hsn, is_packaged_good, variant_option_id, variant_name, uom_short_code, uom_precision')
      .eq('order_id', order_id);

    if (itemsErr) {
      return res.status(500).json({ error: 'Failed to load order items' });
    }

    // Helper for composite keys
    const getCompKey = (mid, vid) => `${mid}_${vid || 'null'}`;

    const currentMap = new Map();
    (currentItems || []).forEach((i) => {
      if (i.menu_item_id) {
        const key = getCompKey(i.menu_item_id, i.variant_option_id);
        const existing = currentMap.get(key) || [];
        existing.push(i);
        currentMap.set(key, existing);
      }
    });

    // 5) Resolve missing menu_item_id from existing lines by name (fallback)
    for (const line of filteredLines) {
      if (!line.menu_item_id && line.name && currentItems?.length) {
        const found = currentItems.find(
          (oi) => (oi.item_name || '').toLowerCase() === line.name.toLowerCase()
        );
        if (found) {
          line.menu_item_id = found.menu_item_id;
          // Also adopt variant info if matching by name? Risky, but better than nothing.
          if (!line.variant_option_id) line.variant_option_id = found.variant_option_id;
        }
      }
    }

    const validLines = filteredLines.filter((l) => l.menu_item_id);
    if (validLines.length === 0) {
      return res.status(400).json({ error: 'No valid menu_item_id in lines' });
    }

    const newMap = new Map();
    validLines.forEach((l) => {
      newMap.set(getCompKey(l.menu_item_id, l.variant_option_id), l);
    });

    // Preload profile + menuItems for breakdown
    const itemIds = [...new Set(validLines.map((l) => l.menu_item_id).filter(Boolean))];

    const [{ data: profile }, { data: menuItems }, { data: variantPricing }] = await Promise.all([
      supabase
        .from('restaurant_profiles')
        .select('gst_enabled, default_tax_rate, prices_include_tax')
        .eq('restaurant_id', restaurant_id)
        .maybeSingle(),
      supabase
        .from('menu_items')
        .select('id, is_packaged_good, tax_rate')
        .in('id', itemIds),
      supabase
        .from('variant_pricing')
        .select('menu_item_id, price, variant_options!inner(id)')
        .in('menu_item_id', itemIds),
    ]);

    // Build Variant Price Map: "menuItemId_variantId" -> price
    const variantPriceMap = new Map();
    (variantPricing || []).forEach(vp => {
      if (vp.menu_item_id && vp.variant_options?.id) {
        variantPriceMap.set(`${vp.menu_item_id}_${vp.variant_options.id}`, Number(vp.price));
      }
    });

    // 6) Prepare collections
    const inserts = [];
    const updates = [];
    const changedItems = [];
    const kot_removed_items = []; // Renamed
    const added_items = []; 

    // 6a) Restore stock for fully removed items
    const removedItems = (currentItems || []).filter(
      (item) => item.menu_item_id && !newMap.has(getCompKey(item.menu_item_id, item.variant_option_id))
    );

    if (removedItems.length > 0) {
      await restoreStockForItems(supabase, restaurant_id, removedItems);

      for (const ri of removedItems) {
        kot_removed_items.push({
          menu_item_id: ri.menu_item_id,
          name: ri.item_name,
          quantity: Number(ri.quantity),
          price: Number(ri.price),
          hsn: ri.hsn,
          action: 'REMOVED_FULL',
          old_qty: ri.quantity,
          new_qty: 0,
          variant_name: ri.variant_name,
          uom_short_code: ri.uom_short_code,
          uom_precision: ri.uom_precision,
        });
      }
    }

    // 7) Apply delta for new/changed items (with KOT delta quantity)
    const duplicatesToRemove = [];

    await Promise.all(
      Array.from(newMap.entries()).map(async ([compKey, newLine]) => {
        const currentList = currentMap.get(compKey) || [];
        const current = currentList[0]; // Primary item to retain/update
        const extraCopies = currentList.slice(1); // Duplicates to remove

        if (extraCopies.length > 0) {
          duplicatesToRemove.push(...extraCopies);
        }
        const menuItemId = newLine.menu_item_id;
        const menuItem = menuItems?.find((mi) => mi.id === menuItemId) || null;

        // Fix: Packaged goods must always use MRP from menu_items, not frontend-provided price
        const globalInclusive = profile?.prices_include_tax ?? true;
        
        // ENFORCE VARIANT PRICING (Server-side Authority)
        // If this item has a variant, ignore frontend price and use DB price
        if (newLine.variant_option_id) {
          const vKey = `${menuItemId}_${newLine.variant_option_id}`;
          const dbPrice = variantPriceMap.get(vKey);
          if (dbPrice !== undefined) {
            newLine.price = dbPrice; // Override with correct DB price
          }
        } else if (menuItem?.is_packaged_good) {
          // Fix: Packaged goods must always use MRP from menu_items, not frontend-provided price
          // Fetch the actual menu item price (MRP)
          const { data: menuItemData } = await supabase
            .from('menu_items')
            .select('price')
            .eq('id', menuItemId)
            .single();
          
          if (menuItemData && menuItemData.price) {
            newLine.price = Number(menuItemData.price);
          }
        }

        if (!current) {
          // NEW item → full qty
          const breakdown = calcLineBreakdown({
            qty: newLine.quantity,
            unit: newLine.price,
            menuItem,
            profile,
          });

          inserts.push({
            order_id,
            menu_item_id: menuItemId,
            item_name: newLine.name,
            quantity: newLine.quantity,
            price: newLine.price,
            hsn: newLine.hsn,
            is_packaged_good: !!newLine.is_packaged_good,
            variant_option_id: newLine.variant_option_id,
            variant_name: newLine.variant_name,
            uom_short_code: newLine.uom_short_code,
            uom_precision: newLine.uom_precision,
            ...breakdown,
          });

          // For KOT: full qty as added
          added_items.push({
            menu_item_id: menuItemId,
            name: newLine.name,
            quantity: newLine.quantity,
            price: newLine.price,
            hsn: newLine.hsn,
            action: 'ADDED_FULL',
            old_qty: 0,
            new_qty: newLine.quantity,
            variant_name: newLine.variant_name,
            uom_short_code: newLine.uom_short_code,
            uom_precision: newLine.uom_precision,
          });

          // For internal tracking (stock/invoice)
          changedItems.push({
            menu_item_id: menuItemId,
            name: newLine.name,
            quantity: newLine.quantity,
            price: newLine.price,
            hsn: newLine.hsn,
            action: 'ADDED',
            is_packaged_good: !!newLine.is_packaged_good,
            variant_name: newLine.variant_name,
            uom_short_code: newLine.uom_short_code,
            uom_precision: newLine.uom_precision,
          });

          await deductStockForItem(supabase, restaurant_id, newLine);
        } else if (current.quantity !== newLine.quantity || current.price !== newLine.price) {
          // CHANGED item
          const breakdown = calcLineBreakdown({
            qty: newLine.quantity,
            unit: newLine.price,
            menuItem,
            profile,
          });

          updates.push({
            id: current.id,
            quantity: newLine.quantity,
            price: newLine.price,
            item_name: newLine.name,
            hsn: newLine.hsn,
            is_packaged_good: !!newLine.is_packaged_good,
            variant_option_id: newLine.variant_option_id,
            variant_name: newLine.variant_name,
            uom_short_code: newLine.uom_short_code,
            uom_precision: newLine.uom_precision,
            ...breakdown,
          });

          const qtyDiff = newLine.quantity - current.quantity;

          if (qtyDiff !== 0) {
            changedItems.push({
              menu_item_id: menuItemId,
              name: newLine.name,
              quantity: Math.abs(qtyDiff),
              price: newLine.price,
              hsn: newLine.hsn,
              action: qtyDiff > 0 ? 'INCREASED' : 'DECREASED',
              old_qty: current.quantity,
              new_qty: newLine.quantity,
              is_packaged_good: !!newLine.is_packaged_good,
              uom_short_code: newLine.uom_short_code,
              uom_precision: newLine.uom_precision,
            });
          }

          if (qtyDiff > 0) {
            added_items.push({
              menu_item_id: menuItemId,
              name: newLine.name,
              quantity: qtyDiff,
              price: newLine.price,
              hsn: newLine.hsn,
              action: 'INCREASED',
              old_qty: current.quantity,
              new_qty: newLine.quantity,
              variant_name: newLine.variant_name,
              uom_short_code: newLine.uom_short_code,
              uom_precision: newLine.uom_precision,
            });

            await deductStockForItem(supabase, restaurant_id, {
              ...newLine,
              quantity: qtyDiff,
            });
          } else if (qtyDiff < 0) {
            const removedQty = Math.abs(qtyDiff);

            await restoreStockForItems(supabase, restaurant_id, [
              { ...current, quantity: removedQty },
            ]);

            kot_removed_items.push({
              menu_item_id: menuItemId,
              name: newLine.name,
              quantity: Number(removedQty),
              price: Number(newLine.price),
              hsn: newLine.hsn,
              action: 'REMOVED_PARTIAL',
              old_qty: current.quantity,
              new_qty: newLine.quantity,
              variant_name: newLine.variant_name,
              uom_short_code: newLine.uom_short_code,
              uom_precision: newLine.uom_precision,
            });
          }
        }
        // unchanged → no DB/stock/KOT change
      })
    );

    // 8) Persist order_items changes
    if (inserts.length > 0) {
      const { error } = await supabase.from('order_items').insert(inserts);
      if (error) return res.status(500).json({ error: 'Failed to insert order items' });
    }

    if (updates.length > 0) {
      console.log('[DEBUG_EDIT_API] Updates payload:', JSON.stringify(updates.map(u => ({ id: u.id, price: u.price })), null, 2));
      const { error } = await supabase.from('order_items').upsert(updates, { onConflict: 'id' });
      if (error) return res.status(500).json({ error: 'Failed to update order items' });
    }

    if (removedItems.length > 0) {
      const removedIds = removedItems.map((i) => i.id);
      const { error } = await supabase.from('order_items').delete().in('id', removedIds);
      if (error) return res.status(500).json({ error: 'Failed to delete order items' });
    }

    // Handle duplicates found during merge
    if (duplicatesToRemove.length > 0) {
      // Restore stock for these duplicates since they are effectively being "removed" 
      // (the new quantity calculation handles the net change against the single 'current' item)
      await restoreStockForItems(supabase, restaurant_id, duplicatesToRemove);
      
      const dupIds = duplicatesToRemove.map((i) => i.id);
      const { error } = await supabase.from('order_items').delete().in('id', dupIds);
      if (error) console.error('Failed to delete duplicate match items', error);
    }

    // 9) Re-read current order_items and recalc totals from true state
    const { data: updatedItems, error: updItemsErr } = await supabase
      .from('order_items')
      .select('menu_item_id, item_name, quantity, price, is_packaged_good, tax_rate, hsn, variant_option_id, variant_name, uom_short_code, uom_precision, discount_amount')
      .eq('order_id', order_id);

    if (updItemsErr) {
      return res.status(500).json({ error: 'Failed to reload order items' });
    }

    // Capture the existing discount state if any (though usually edits might reset or preserve bill discount)
    // For now, assume table-level discount_amount exists in the main order record.
    const { data: orderHeader } = await supabase.from('orders').select('discount_amount, total_discount_percent').eq('id', order_id).single();

    const { calculateOrderTotals } = await import('../../../utils/orderCalculations');
    const newTotals = calculateOrderTotals(
        updatedItems.map(i => ({ ...i, id: i.menu_item_id })), // Map to expected shape
        { 
            type: (orderHeader?.total_discount_percent > 0) ? 'percent' : 'amount',
            value: (orderHeader?.total_discount_percent > 0) ? orderHeader.total_discount_percent : (orderHeader?.discount_amount || 0)
        },
        profile
    );

    // 9) Persist via Unified Service
    const orderResult = await OrderService.persistCalculatedOrder(supabase, {
      orderId: order_id,
      restaurantId: restaurant_id,
      calculationResult: newTotals,
      metadata: {
        status: orderHeader?.status || 'new',
        payment_status: orderHeader?.payment_status || 'pending',
        payment_method: orderHeader?.payment_method || 'cash',
        customer_name: orderHeader?.customer_name,
        customer_phone: orderHeader?.customer_phone,
        number_of_customers: orderHeader?.number_of_customers,
        order_type: req.body.order_type || orderHeader?.order_type,
        table_number: table_number !== undefined ? table_number : orderHeader?.table_number,
        is_credit: orderHeader?.is_credit,
        credit_customer_id: orderHeader?.credit_customer_id,
        created_at: orderHeader?.created_at
      }
    });

    // 9a) CREDIT LEDGER SYNC
    await syncCreditLedgerForOrder({
      supabase,
      restaurant_id,
      order,
      order_id,
      newTotals,
      reason,
    });

    // 9b) LOYALTY RECALCULATION
    if (order.customer_id && newTotals.total_amount > 0 && order.payment_status === 'paid' && !order.is_credit) {
      try {
        const { LoyaltyService } = await import('../../../services/loyaltyService');
        await LoyaltyService.handleOrderEarning(supabase, {
          restaurant_id,
          customer_id: order.customer_id,
          order_id: order_id,
          order_total: newTotals.total_amount,
          loyalty_amount_used: order.loyalty_amount_used || 0
        });
      } catch (loyErr) {
        console.error('[DEBUG_EDIT_API] Loyalty error:', loyErr);
      }
    }

    return res.status(200).json({
      success: true,
      order_id: order.id,
      order_number: order.id.slice(0, 8).toUpperCase(),
      order_for_print: {
        id: order.id,
        restaurant_id,
        order_type: order.order_type,
        table_number: order.table_number || null,
        customer_name: order.customer_name || '',
        customer_phone: order.customer_phone || '',
        subtotal_ex_tax: Number(newTotals.subtotal_after_line_discounts.toFixed(2)),
        gross_taxable_amount: Number(newTotals.subtotal_after_line_discounts.toFixed(2)),
        total_tax: newTotals.total_tax,
        total_inc_tax: newTotals.total_inc_tax,
        discount_amount: newTotals.discount_amount,
        bill_discount_base: Number(newTotals.total_order_discount_base.toFixed(2)),
        total_amount: newTotals.total_amount,
        round_off_amount: newTotals.round_off_amount,
        payment_status: order.payment_status || 'pending',
        status: order.status || 'new',
        removed_items: kot_removed_items,
        created_at: order.updated_at || order.created_at,
        items: added_items,
        changed_items: changedItems,
        is_edited: true,
        edit_reason: reason,
        invoice_no: orderResult.invoiceNo,
        bill_no: orderResult.billNo,
      },
    });

  } catch (e) {

    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// STOCK HELPERS
async function restoreStockForItems(supabase, restaurant_id, items) {
  for (const oi of items) {
    if (!oi.menu_item_id || !oi.quantity) continue;

    // Find recipe (Variant > Base)
    const { data: potentialRecipes } = await supabase
      .from('recipes')
      .select('variant_option_id, recipe_items(ingredient_id, quantity)')
      .eq('menu_item_id', oi.menu_item_id)
      .eq('restaurant_id', restaurant_id);

    if (!potentialRecipes?.length) continue;

    const targetVariantId = oi.variant_option_id || oi.variant_id || null;
    let recipe = potentialRecipes.find(r => {
      const rId = r.variant_option_id;
      if (!rId && !targetVariantId) return true;
      if (!rId || !targetVariantId) return false;
      return String(rId) === String(targetVariantId);
    });
    if (!recipe && targetVariantId) recipe = potentialRecipes.find(r => r.variant_option_id === null);
    if (!recipe && !targetVariantId && potentialRecipes.length > 0) recipe = potentialRecipes.find(r => r.variant_option_id === null);

    if (!recipe?.recipe_items?.length) continue;

    await Promise.all(
      recipe.recipe_items.map(async (ri) => {
        const { data: ing } = await supabase
          .from('ingredients')
          .select('id, current_stock')
          .eq('id', ri.ingredient_id)
          .eq('restaurant_id', restaurant_id)
          .single();

        if (!ing) return;

        const newStock =
          (Number(ing.current_stock) || 0) +
          Number(ri.quantity) * Number(oi.quantity);

        await supabase
          .from('ingredients')
          .update({ current_stock: newStock })
          .eq('id', ing.id);
      })
    );
  }
}

async function deductStockForItem(supabase, restaurant_id, item) {
  if (!item.menu_item_id || !item.quantity) return;

  const { data: menuItem } = await supabase
    .from('menu_items')
    .select('is_packaged_good')
    .eq('id', item.menu_item_id)
    .eq('restaurant_id', restaurant_id)
    .maybeSingle();

  if (!menuItem) return;

  // Find recipe (Variant > Base)
  const { data: potentialRecipes } = await supabase
    .from('recipes')
    .select('variant_option_id, recipe_items(ingredient_id, quantity)')
    .eq('menu_item_id', item.menu_item_id)
    .eq('restaurant_id', restaurant_id);

  if (!potentialRecipes?.length) return;

  const targetVariantId = item.variant_option_id || item.variant_id || null;
  let recipe = potentialRecipes.find(r => {
    const rId = r.variant_option_id;
    if (!rId && !targetVariantId) return true;
    if (!rId || !targetVariantId) return false;
    return String(rId) === String(targetVariantId);
  });
  if (!recipe && targetVariantId) recipe = potentialRecipes.find(r => r.variant_option_id === null);
  if (!recipe && !targetVariantId && potentialRecipes.length > 0) recipe = potentialRecipes.find(r => r.variant_option_id === null);

  if (!recipe?.recipe_items?.length) return;

  await Promise.all(
    recipe.recipe_items.map(async (ri) => {
      const { data: ing } = await supabase
        .from('ingredients')
        .select('id, current_stock')
        .eq('id', ri.ingredient_id)
        .eq('restaurant_id', restaurant_id)
        .single();

      if (!ing) return;

      const newStock =
        (Number(ing.current_stock) || 0) -
        Number(ri.quantity) * Number(item.quantity);

      await supabase
        .from('ingredients')
        .update({ current_stock: newStock })
        .eq('id', ing.id);
    })
  );
}

// TOTALS (unchanged core logic)
async function recalculateOrderTotals(supabase, restaurant_id, items) {
  if (!items || items.length === 0) {
    return {
      subtotal_ex_tax: 0,
      total_tax: 0,
      total_inc_tax: 0,
      total_amount: 0,
    };
  }

  const itemIds = [...new Set(items.map((i) => i.menu_item_id).filter(Boolean))];

  const [{ data: profile }, { data: menuItems }] = await Promise.all([
    supabase
      .from('restaurant_profiles')
      .select('gst_enabled, default_tax_rate, prices_include_tax')
      .eq('restaurant_id', restaurant_id)
      .maybeSingle(),
    supabase
      .from('menu_items')
      .select('id, is_packaged_good, tax_rate')
      .in('id', itemIds),
  ]);

  const gstEnabled = !!profile?.gst_enabled;
  const baseRate = Number(profile?.default_tax_rate ?? 5);
  const serviceInclude =
      gstEnabled &&
      (profile?.prices_include_tax === true ||
        profile?.prices_include_tax === 'true' ||
        profile?.prices_include_tax === 1 ||
        profile?.prices_include_tax === '1');

  let subtotalEx = 0;
  let totalTax = 0;
  let totalInc = 0;

  for (const it of items) {
    const qty = Number(it.quantity || 0);
    const unit = Number(it.price || 0);
    if (!qty || !it.menu_item_id) continue;

    const menuItem = menuItems?.find((mi) => mi.id === it.menu_item_id);
    const isPackaged = !!menuItem?.is_packaged_good;
    const rawItemTax = Number(menuItem?.tax_rate);

    let effectiveRate;

    if (isPackaged) {
      const itemTaxRate =
        Number.isFinite(rawItemTax) && rawItemTax > 0 ? rawItemTax : baseRate;
      effectiveRate = itemTaxRate;
    } else {
      effectiveRate = gstEnabled ? baseRate : 0;
    }

    let lineEx;
    let tax;
    let lineInc;

    if (isPackaged) {
      lineInc = unit * qty;
      lineEx = effectiveRate > 0 ? lineInc / (1 + effectiveRate / 100) : lineInc;
      tax = lineInc - lineEx;
    } else if (serviceInclude) {
      lineInc = unit * qty;
      lineEx = effectiveRate > 0 ? lineInc / (1 + effectiveRate / 100) : lineInc;
      tax = lineInc - lineEx;
    } else {
      lineEx = unit * qty;
      tax = (effectiveRate / 100) * lineEx;
      lineInc = lineEx + tax;
    }

    subtotalEx += Number(lineEx.toFixed(2));
    totalTax += Number(tax.toFixed(2));
    totalInc += Number(lineInc.toFixed(2));
  }

  return {
    subtotal_ex_tax: Number(subtotalEx.toFixed(2)),
    total_tax: Number(totalTax.toFixed(2)),
    total_inc_tax: Number(totalInc.toFixed(2)),
    total_amount: Number(totalInc.toFixed(2)),
  };
}

// CREDIT HELPER
async function syncCreditLedgerForOrder({
  supabase,
  restaurant_id,
  order,
  order_id,
  newTotals,
  reason,
}) {
  try {
    const isCreditSale =
      order.is_credit === true ||
      order.payment_method === 'credit';

    if (!isCreditSale) return;
    if (!order.credit_customer_id) return;
    if (!(newTotals && Number(newTotals.total_inc_tax) > 0)) return;

    await supabase
      .from('credit_transactions')
      .upsert(
        {
          restaurant_id,
          credit_customer_id: order.credit_customer_id,
          order_id,
          transaction_type: 'credit',
          amount: Number(newTotals.total_inc_tax),
          description: `Order edited: ${reason}`,
          transaction_date: new Date().toISOString(),
          payment_method: null,
          notes: `Edited order total: ₹${Number(newTotals.total_inc_tax).toFixed(2)}`,
        },
        {
          onConflict: 'restaurant_id,order_id',
        }
      );
  } catch (err) {
    console.error('Credit ledger sync failed', err);
  }
}
