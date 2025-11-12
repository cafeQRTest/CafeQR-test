// pages/api/invoices/void.js
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const { invoice_id, restaurant_id, reason } = req.body || {}
    if (!invoice_id || !restaurant_id) return res.status(400).json({ error: 'invoice_id and restaurant_id are required' })

    const { data: inv, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .eq('restaurant_id', restaurant_id)
      .single()
    if (invErr || !inv) return res.status(404).json({ error: 'Invoice not found' })

    if (String(inv.status || '').toLowerCase() === 'void') {
      return res.status(200).json({ ok: true, alreadyVoided: true })
    }

    // 1) Mark invoice void (triggers will handle credit reversal)
    const { error: updInvErr } = await supabase
      .from('invoices')
      .update({
        status: 'void',
        is_open: false,
        regeneration_reason: reason ? `void: ${reason}` : 'void',
        closed_date: new Date().toISOString()
      })
      .eq('id', invoice_id)
      .eq('restaurant_id', restaurant_id)
    if (updInvErr) return res.status(400).json({ error: updInvErr.message })

    // 2) Cancel linked order; reverse_credit_on_cancel will fire if appropriate and restore stock
    if (inv.order_id) {
      await supabase
        .from('orders')
        .update({ status: 'cancelled', payment_status: 'cancelled' })
        .eq('id', inv.order_id)
        .eq('restaurant_id', restaurant_id);

      // Restore stock for the voided invoice
      try {
        console.log('[VOID INVOICE] Starting stock restoration for order:', inv.order_id);
        const { data: orderItems, error: itemsErr } = await supabase
          .from('order_items')
          .select('menu_item_id, quantity, is_packaged_good')
          .eq('order_id', inv.order_id);

        console.log('[VOID INVOICE] Order items fetched:', orderItems?.length, 'items');

        if (!itemsErr && orderItems && orderItems.length > 0) {
          for (const oi of orderItems) {
            console.log('[VOID INVOICE] Processing item:', { menu_item_id: oi.menu_item_id, quantity: oi.quantity, is_packaged: oi.is_packaged_good });
            if (!oi.menu_item_id || !oi.quantity || oi.is_packaged_good) {
              console.log('[VOID INVOICE] Skipping item');
              continue;
            }

            // Get recipe for this menu item
            const { data: recipe, error: recipeErr } = await supabase
              .from('recipes')
              .select('id, recipe_items(ingredient_id, quantity)')
              .eq('menu_item_id', oi.menu_item_id)
              .eq('restaurant_id', restaurant_id)
              .maybeSingle();

            console.log('[VOID INVOICE] Recipe result:', { recipe, error: recipeErr });

            if (recipeErr || !recipe?.recipe_items?.length) {
              console.log('[VOID INVOICE] No recipe found for menu item:', oi.menu_item_id);
              continue;
            }

            // Restore stock for each ingredient
            for (const ri of recipe.recipe_items) {
              const addBack = Number(ri.quantity) * Number(oi.quantity);
              console.log('[VOID INVOICE] Restoring ingredient:', { ingredient_id: ri.ingredient_id, addBack });

              const { data: ing, error: ingErr } = await supabase
                .from('ingredients')
                .select('id, current_stock, name')
                .eq('id', ri.ingredient_id)
                .eq('restaurant_id', restaurant_id)
                .single();

              if (ingErr || !ing) {
                console.error('[VOID INVOICE] Ingredient fetch failed:', ingErr);
                continue;
              }

              const oldStock = Number(ing.current_stock || 0);
              const newStock = oldStock + addBack;
              console.log('[VOID INVOICE] Updating stock for', ing.name, ':', oldStock, '→', newStock);
              
              const { error: updateErr } = await supabase
                .from('ingredients')
                .update({ 
                  current_stock: newStock, 
                  updated_at: new Date().toISOString() 
                })
                .eq('id', ing.id);
              
              if (updateErr) {
                console.error('[VOID INVOICE] Stock update failed:', updateErr);
              } else {
                console.log('[VOID INVOICE] ✓ Stock restored successfully');
              }
            }
          }
        }
      } catch (stockErr) {
        console.warn('Stock restoration failed (non-blocking):', stockErr.message);
      }
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to void invoice' })
  }
}
