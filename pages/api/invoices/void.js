import { createClient } from '@supabase/supabase-js'
import { LoyaltyService } from '../../../services/loyaltyService'

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

      // 2.1) Reverse Loyalty Points
      try {
        console.log(`[VOID INVOICE] Attempting loyalty reversal for order: ${inv.order_id}`);
        const result = await LoyaltyService.handleOrderReversal(supabase, {
          restaurant_id,
          order_id: inv.order_id
        });
        console.log('[VOID INVOICE] Loyalty reversal result:', result);
      } catch (loyaltyErr) {
        console.error('[VOID INVOICE] Loyalty reversal fatal error:', loyaltyErr);
      }

      // Restore stock for the voided invoice
      try {
        console.log('[VOID INVOICE] Starting stock restoration for order:', inv.order_id);
        const { data: orderItems, error: itemsErr } = await supabase
          .from('order_items')
          .select('menu_item_id, quantity, is_packaged_good, variant_option_id, variant_name')
          .eq('order_id', inv.order_id);

        console.log('[VOID INVOICE] Order items fetched:', orderItems?.length, 'items');

        if (!itemsErr && orderItems && orderItems.length > 0) {
          for (const oi of orderItems) {
            console.log('[VOID INVOICE] Processing item:', { menu_item_id: oi.menu_item_id, quantity: oi.quantity });
            
            if (!oi.menu_item_id || !oi.quantity) {
              console.log('[VOID INVOICE] Skipping item - invalid data');
              continue;
            }

            // Get recipes for this menu item (fetch ALL, do not use single())
            const { data: potentialRecipes, error: recipeErr } = await supabase
              .from('recipes')
              .select('id, variant_option_id, recipe_items(ingredient_id, quantity)')
              .eq('menu_item_id', oi.menu_item_id)
              .eq('restaurant_id', restaurant_id);

            console.log('[VOID INVOICE] Recipes found:', potentialRecipes?.length || 0);

            if (recipeErr || !potentialRecipes?.length) {
              console.log('[VOID INVOICE] No recipes found for menu item:', oi.menu_item_id);
              continue;
            }

            // Resolve Variant ID
            let targetVariantId = oi.variant_option_id || oi.variant_id || null;
            
            // Fallback lookup by name if ID missing
            if (!targetVariantId && oi.variant_name) {
                console.log('[VOID INVOICE] Attempting name lookup for variant:', oi.variant_name);
                const { data: vpData } = await supabase
                   .from('variant_pricing')
                   .select('variant_options!inner(id, name)')
                   .eq('menu_item_id', oi.menu_item_id);
                
                if (vpData) {
                   const norm = oi.variant_name.trim().toLowerCase();
                   const match = vpData.find(v => v.variant_options?.name?.trim().toLowerCase() === norm);
                   if (match?.variant_options?.id) {
                       targetVariantId = match.variant_options.id;
                       console.log('[VOID INVOICE] Resolved ID by name:', targetVariantId);
                   }
                }
            }

            // Find matching recipe
            let recipe = potentialRecipes.find(r => {
               const rId = r.variant_option_id;
               if (!rId && !targetVariantId) return true;
               if (!rId || !targetVariantId) return false;
               return String(rId) === String(targetVariantId);
            });
            
            // Fallback to base
            if (!recipe && targetVariantId) recipe = potentialRecipes.find(r => r.variant_option_id === null);

            if (!recipe?.recipe_items?.length) {
                console.log('[VOID INVOICE] No ingredients in matched recipe');
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
