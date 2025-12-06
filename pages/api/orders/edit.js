// pages/api/orders/edit.js
// - Edits existing order in-place (NEW/IN_PROGRESS only)
// - Frontend sends FULL lines array (all items after edit)
// - Applies delta on order_items + stock (recipes)
// - Recalculates order totals from current order_items
// - FULLY REPLACES invoice_items from current order_items (no partial sync)
// - Returns order_for_print (same as create) + changed_items (delta KOT with qty diff)

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Server config error' });

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { order_id, restaurant_id, lines, reason = 'Order edited from dashboard' } = req.body || {};

    // 1) Basic validation
    if (!order_id || !restaurant_id || !Array.isArray(lines)) {
      return res.status(400).json({ error: 'order_id, restaurant_id, lines required' });
    }

    // 2) Normalize incoming lines (frontend sends full state)
    const filteredLines = lines
      .filter(l => l && Number(l.quantity) > 0 && (l.menu_item_id || l.name))
      .map(l => ({
        menu_item_id: l.menu_item_id || null,
        name: l.name || 'Item',
        price: Number(l.price) || 0,
        quantity: Number(l.quantity) || 1,
        hsn: l.hsn || null,
        is_packaged_good: !!l.is_packaged_good,   // <--- ADD THIS

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
      .select('id, menu_item_id, quantity, price, item_name, hsn, is_packaged_good')
      .eq('order_id', order_id);

    if (itemsErr) {
      return res.status(500).json({ error: 'Failed to load order items' });
    }

    const currentMap = new Map(
      (currentItems || [])
        .filter(i => i.menu_item_id)
        .map(i => [i.menu_item_id, i])
    );

    // 5) Resolve missing menu_item_id from existing lines by name
    for (const line of filteredLines) {
      if (!line.menu_item_id && line.name && currentItems?.length) {
        const found = currentItems.find(
          oi => (oi.item_name || '').toLowerCase() === line.name.toLowerCase()
        );
        if (found) {
          line.menu_item_id = found.menu_item_id;
        }
      }
    }

    const validLines = filteredLines.filter(l => l.menu_item_id);
    if (validLines.length === 0) {
      return res.status(400).json({ error: 'No valid menu_item_id in lines' });
    }

    const newMap = new Map(validLines.map(l => [l.menu_item_id, l]));

    // 6) Prepare collections
    const inserts = [];
    const updates = [];
    const changedItems = [];
    const removed_items = [];
    const added_items = []; // for KOT added/increased lines

    // 6a) Restore stock for fully removed items
    const removedItems = (currentItems || []).filter(
      item => item.menu_item_id && !newMap.has(item.menu_item_id)
    );

    if (removedItems.length > 0) {
      await restoreStockForItems(supabase, restaurant_id, removedItems);

      // record fully removed items
      for (const ri of removedItems) {
        removed_items.push({
          menu_item_id: ri.menu_item_id,
          name: ri.item_name,
          quantity: ri.quantity,
          price: ri.price,
          hsn: ri.hsn,
          action: 'REMOVED_FULL',
          old_qty: ri.quantity,
          new_qty: 0,
        });
      }
    }

    // 7) Apply delta for new/changed items (with KOT delta quantity)
    await Promise.all(
      Array.from(newMap.entries()).map(async ([menuItemId, newLine]) => {
        const current = currentMap.get(menuItemId);

        if (!current) {
          // NEW item → full qty
          inserts.push({
            order_id,
            menu_item_id: menuItemId,
            item_name: newLine.name,
            quantity: newLine.quantity,
            price: newLine.price,
            hsn: newLine.hsn,
            is_packaged_good: !!newLine.is_packaged_good,
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
          });

          // For internal tracking (stock/invoice)
          changedItems.push({
            menu_item_id: menuItemId,
            name: newLine.name,
            quantity: newLine.quantity, // full qty for brand new item
            price: newLine.price,
            hsn: newLine.hsn,
            action: 'ADDED',
          });

          await deductStockForItem(supabase, restaurant_id, newLine);
        } else if (current.quantity !== newLine.quantity) {
          // CHANGED item
          updates.push({
            id: current.id,
            quantity: newLine.quantity,
            price: newLine.price,
            item_name: newLine.name,
            hsn: newLine.hsn,
          });

          const qtyDiff = newLine.quantity - current.quantity;

          if (qtyDiff !== 0) {
            // keep full change history
            changedItems.push({
              menu_item_id: menuItemId,
              name: newLine.name,
              quantity: Math.abs(qtyDiff), // delta
              price: newLine.price,
              hsn: newLine.hsn,
              action: qtyDiff > 0 ? 'INCREASED' : 'DECREASED',
              old_qty: current.quantity,
              new_qty: newLine.quantity,
            });
          }

          if (qtyDiff > 0) {
            // positive delta → added for KOT
            added_items.push({
              menu_item_id: menuItemId,
              name: newLine.name,
              quantity: qtyDiff,
              price: newLine.price,
              hsn: newLine.hsn,
              action: 'INCREASED',
              old_qty: current.quantity,
              new_qty: newLine.quantity,
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

            removed_items.push({
              menu_item_id: menuItemId,
              name: newLine.name,
              quantity: removedQty,
              price: newLine.price,
              hsn: newLine.hsn,
              action: 'REMOVED_PARTIAL',
              old_qty: current.quantity,
              new_qty: newLine.quantity,
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
      const { error } = await supabase.from('order_items').upsert(updates, { onConflict: 'id' });
      if (error) return res.status(500).json({ error: 'Failed to update order items' });
    }

    if (removedItems.length > 0) {
      const removedIds = removedItems.map(i => i.id);
      const { error } = await supabase.from('order_items').delete().in('id', removedIds);
      if (error) return res.status(500).json({ error: 'Failed to delete order items' });
    }

    // 9) Re-read current order_items and recalc totals from true state
    const { data: updatedItems, error: updItemsErr } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity, price')
      .eq('order_id', order_id);

    if (updItemsErr) {
      return res.status(500).json({ error: 'Failed to reload order items' });
    }

    const newTotals = await recalculateOrderTotals(supabase, restaurant_id, updatedItems || []);

    const { error: orderUpdErr } = await supabase
      .from('orders')
      .update({
        status: 'new',
        subtotal_ex_tax: newTotals.subtotal_ex_tax,
        total_tax: newTotals.total_tax,
        total_inc_tax: newTotals.total_inc_tax,
        total_amount: newTotals.total_amount,
        // updated_at handled by DB trigger
      })
      .eq('id', order_id)
      .eq('restaurant_id', restaurant_id);

    if (orderUpdErr) {
      return res.status(500).json({ error: 'Failed to update order totals' });
    }

    // 9a) CREDIT LEDGER SYNC (delegated to helper)
    await syncCreditLedgerForOrder({
      supabase,
      restaurant_id,
      order,
      order_id,
      newTotals,
      reason,
    });

    // 10) FULL INVOICE SYNC (delete-all + insert-all) using invoice_items schema
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id')
      .eq('order_id', order_id)
      .eq('restaurant_id', restaurant_id)
      .maybeSingle();

    if (invoice && !invErr) {
      // 10.1 update invoice header totals
      await supabase
        .from('invoices')
        .update({
          subtotal_ex_tax: newTotals.subtotal_ex_tax,
          total_tax: newTotals.total_tax,
          total_inc_tax: newTotals.total_inc_tax,
        })
        .eq('id', invoice.id);

      // 10.2 delete ALL existing invoice_items
      const { data: existingInvItems } = await supabase
        .from('invoice_items')
        .select('id')
        .eq('invoice_id', invoice.id);

      if (existingInvItems?.length) {
        const ids = existingInvItems.map(i => i.id);
        await supabase.from('invoice_items').delete().in('id', ids);
      }

      // 10.3 load full current order_items
      const { data: fullOrderItems, error: fullItemsErr } = await supabase
        .from('order_items')
        .select('item_name, hsn, quantity, price, menu_item_id')
        .eq('order_id', order_id);

      if (!fullItemsErr && fullOrderItems?.length) {
        const invoiceRows = [];
        let lineNo = 1;

        for (const oi of fullOrderItems) {
          const lineCalc = await recalculateOrderTotals(supabase, restaurant_id, [
            {
              menu_item_id: oi.menu_item_id,
              quantity: oi.quantity,
              price: oi.price,
            },
          ]);

          const ex = Number(lineCalc.subtotal_ex_tax || 0);
          const inc = Number(lineCalc.total_inc_tax || 0);
          const tax = Number(lineCalc.total_tax || (inc - ex));

          const qty = Number(oi.quantity || 0);
          const unitEx = qty > 0 ? ex / qty : 0;
          const taxRate = ex > 0 ? (tax / ex) * 100 : 0;

          invoiceRows.push({
            invoice_id: invoice.id,
            line_no: lineNo++,
            item_name: oi.item_name,
            hsn: oi.hsn || null,
            qty,
            unit_rate_ex_tax: Number(unitEx.toFixed(2)),
            tax_rate: Number(taxRate.toFixed(2)),
            tax_amount: Number(tax.toFixed(2)),
            line_total_ex_tax: Number(ex.toFixed(2)),
            line_total_inc_tax: Number(inc.toFixed(2)),
            cess_rate: 0,
            cess_amount: 0,
          });
        }

        const { error: invInsertErr } = await supabase
          .from('invoice_items')
          .insert(invoiceRows);

        if (invInsertErr) {
          // Non-fatal for now: order + invoice header are correct
          console.error('invoice_items insert failed', invInsertErr);
        }
      }
    }

    // 11) Build order_for_print (same as create, plus changed_items)
    const { data: finalOrderItems } = await supabase
      .from('order_items')
      .select('menu_item_id, item_name, quantity, price, hsn')
      .eq('order_id', order_id);

    const preparedItems = (finalOrderItems || []).map(oi => ({
      ...oi,
      name: oi.item_name,
    }));

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
        subtotal_ex_tax: Number(newTotals.subtotal_ex_tax.toFixed(2)),
        total_tax: Number(newTotals.total_tax.toFixed(2)),
        total_inc_tax: Number(newTotals.total_inc_tax.toFixed(2)),
        payment_status: order.payment_status || 'pending',
        status: 'new',
        removed_items,
        created_at: order.updated_at || order.created_at,

        // KOT should use only added/increased items
        items: added_items.map(ai => ({
          ...ai,
          name: ai.name || ai.item_name,
        })),

        // keep full change history if ever needed on client
        changed_items: changedItems,

        is_edited: true,
        edit_reason: reason,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// STOCK HELPERS
async function restoreStockForItems(supabase, restaurant_id, items) {
  for (const oi of items) {
    if (!oi.menu_item_id || !oi.quantity || oi.is_packaged_good) continue;

    const { data: recipe } = await supabase
      .from('recipes')
      .select('recipe_items(ingredient_id, quantity)')
      .eq('menu_item_id', oi.menu_item_id)
      .eq('restaurant_id', restaurant_id)
      .maybeSingle();

    if (!recipe?.recipe_items?.length) continue;

    await Promise.all(
      recipe.recipe_items.map(async ri => {
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

  if (!menuItem || menuItem.is_packaged_good) return;

  const { data: recipe } = await supabase
    .from('recipes')
    .select('recipe_items(ingredient_id, quantity)')
    .eq('menu_item_id', item.menu_item_id)
    .eq('restaurant_id', restaurant_id)
    .maybeSingle();

  if (!recipe?.recipe_items?.length) return;

  await Promise.all(
    recipe.recipe_items.map(async ri => {
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

// TOTALS
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
      .from("restaurant_profiles")
      .select("gst_enabled, default_tax_rate, prices_include_tax")
      .eq("restaurant_id", restaurant_id)
      .maybeSingle(),
    supabase
      .from("menu_items")
      .select("id, is_packaged_good, tax_rate")
      .in("id", itemIds),
  ]);

  const gstEnabled = !!profile?.gst_enabled;
  const baseRate = Number(profile?.default_tax_rate ?? 5);
  const pricesIncludeTax = profile?.prices_include_tax ?? true;

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
      // Packaged goods: always treat price as tax-inclusive MRP.
      // If item.tax_rate <= 0, fall back to restaurant default_tax_rate.
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
      onConflict: 'restaurant_id,order_id', // must match the UNIQUE constraint
    }
  );
  } catch (err) {
    console.error('Credit ledger sync failed', err);
  }
}

