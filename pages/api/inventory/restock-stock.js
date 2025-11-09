import { createClient } from '@supabase/supabase-js'


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
    const { menu_item_id, quantity, restaurant_id } = req.body
    if (!menu_item_id || !quantity || !restaurant_id) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Skip packaged goods
    const { data: menuItem, error: menuErr } = await supabase
      .from('menu_items')
      .select('is_packaged_good')
      .eq('id', menu_item_id)
      .single()

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
      .single()

    if (recipeErr || !recipe) {
      return res.status(200).json({ success: true, message: 'No recipe found, nothing to restock' })
    }

    const recipeItems = recipe.recipe_items || []

    // Restock all ingredients
    for (const recipeItem of recipeItems) {
      const addAmount = Number(recipeItem.quantity) * Number(quantity)
      if (!addAmount || Number.isNaN(addAmount)) continue

      // fetch current
      const { data: ingredient } = await supabase
        .from('ingredients')
        .select('current_stock')
        .eq('id', recipeItem.ingredient_id)
        .eq('restaurant_id', restaurant_id)
        .single()

      const current = ingredient?.current_stock ?? 0
      const newStock = current + addAmount

      await supabase
        .from('ingredients')
        .update({ current_stock: newStock })
        .eq('id', recipeItem.ingredient_id)
        .eq('restaurant_id', restaurant_id)
    }

    return res.status(200).json({ success: true, message: 'Stock restored successfully' })
  } catch (e) {
    console.error('Restock error:', e)
    return res.status(500).json({ error: e.message || 'Failed to restock' })
  }
}
