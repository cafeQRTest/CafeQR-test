import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Deduct stock for a menu item based on its recipe
 * POST /api/inventory/deduct-stock
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

    // Check if menu item is a packaged good - if so, skip stock deduction
    const { data: menuItem, error: menuErr } = await supabase
      .from('menu_items')
      .select('is_packaged_good')
      .eq('id', menu_item_id)
      .single()

    if (menuErr || !menuItem) {
      return res.status(200).json({ success: true, message: 'Menu item not found, stock not deducted' })
    }

    if (menuItem.is_packaged_good) {
      return res.status(200).json({ success: true, message: 'Packaged item - stock not deducted' })
    }

    // Get the recipe for this menu item
    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .select('id, recipe_items(ingredient_id, quantity)')
      .eq('menu_item_id', menu_item_id)
      .eq('restaurant_id', restaurant_id)
      .single()

    if (recipeErr || !recipe) {
      // No recipe means no ingredients to deduct
      return res.status(200).json({ success: true, message: 'No recipe found, stock not deducted' })
    }

    const recipeItems = recipe.recipe_items || []

    // Check if enough stock exists for all ingredients
    for (const recipeItem of recipeItems) {
      const { data: ingredient, error: ingErr } = await supabase
        .from('ingredients')
        .select('current_stock')
        .eq('id', recipeItem.ingredient_id)
        .eq('restaurant_id', restaurant_id)
        .single()

      if (ingErr || !ingredient) {
        throw new Error(`Ingredient not found: ${recipeItem.ingredient_id}`)
      }

      const requiredStock = recipeItem.quantity * quantity
      if (ingredient.current_stock < requiredStock) {
        throw new Error(`Insufficient stock for ingredient ID ${recipeItem.ingredient_id}. Required: ${requiredStock}, Available: ${ingredient.current_stock}`)
      }
    }

    // Deduct stock for all ingredients
    for (const recipeItem of recipeItems) {
      const deductAmount = recipeItem.quantity * quantity

      const { data: ingredient, error: ingErr } = await supabase
        .from('ingredients')
        .select('current_stock')
        .eq('id', recipeItem.ingredient_id)
        .single()

      if (ingErr || !ingredient) continue

      const newStock = ingredient.current_stock - deductAmount

      const { error: updateErr } = await supabase
        .from('ingredients')
        .update({ current_stock: newStock })
        .eq('id', recipeItem.ingredient_id)

      if (updateErr) {
        console.error('Stock deduction error:', updateErr)
        throw updateErr
      }
    }

    return res.status(200).json({ success: true, message: 'Stock deducted successfully' })
  } catch (e) {
    console.error('Deduct stock error:', e)
    return res.status(500).json({ error: e.message || 'Failed to deduct stock' })
  }
}
