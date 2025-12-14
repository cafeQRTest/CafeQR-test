import { createClient } from '@supabase/supabase-js'
import { round2, normalizeQty } from '../../../lib/qty' // IMPORTANT: correct path

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Restock ingredients for a menu item based on its recipe (used when order is cancelled)
 * POST /api/inventory/restock-stock
 * Body: { menu_item_id, quantity, restaurant_id }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { menu_item_id, quantity, restaurant_id } = req.body || {}

    const orderQty = normalizeQty(quantity) // >0 and rounded to 2dp
    if (!menu_item_id || !restaurant_id || orderQty === null) {
      return res.status(400).json({ error: 'Missing/invalid fields' })
    }

    // Skip packaged goods
    const { data: menuItem, error: menuErr } = await supabase
      .from('menu_items')
      .select('is_packaged_good')
      .eq('id', menu_item_id)
      .eq('restaurant_id', restaurant_id)
      .maybeSingle()

    if (menuErr || !menuItem) {
      return res.status(200).json({ success: true, message: 'Menu item not found, nothing to restock' })
    }
    if (menuItem.is_packaged_good) {
      return res.status(200).json({ success: true, message: 'Packaged item - no ingredient restock' })
    }

    // Get recipe
    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .select('id, recipe_items(ingredient_id, quantity)')
      .eq('menu_item_id', menu_item_id)
      .eq('restaurant_id', restaurant_id)
      .maybeSingle()

    if (recipeErr || !recipe?.recipe_items?.length) {
      return res.status(200).json({ success: true, message: 'No recipe found, nothing to restock' })
    }

    // Build adjustments and apply atomically via RPC
    const adjustments = recipe.recipe_items
      .map(ri => {
        const addAmount = round2(Number(ri.quantity) * Number(orderQty))
        if (!Number.isFinite(addAmount) || addAmount <= 0) return null
        return { ingredient_id: ri.ingredient_id, delta: addAmount }
      })
      .filter(Boolean)

    if (!adjustments.length) {
      return res.status(200).json({ success: true, message: 'Nothing to restock' })
    }

    const { error: rpcErr } = await supabase.rpc('apply_stock_adjustments', {
      p_restaurant_id: restaurant_id,
      p_adjustments: adjustments
    })

    if (rpcErr) return res.status(400).json({ error: rpcErr.message })

    return res.status(200).json({ success: true, message: 'Stock restored successfully' })
  } catch (e) {
    console.error('Restock error:', e)
    return res.status(500).json({ error: e.message || 'Failed to restock' })
  }
}
