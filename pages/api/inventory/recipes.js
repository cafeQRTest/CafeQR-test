import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const { method } = req
  const { restaurant_id } = req.query
  if (!restaurant_id) return res.status(400).json({ error: 'Missing restaurant_id' })

  try {
    if (method === 'GET') {
      const { data, error } = await supabase
        .from('recipes')
        .select(`
          id,
          menu_item_id,
          variant_option_id,
          recipe_items ( id, ingredient_id, quantity, ingredients ( name, unit ) )
        `)
        .eq('restaurant_id', restaurant_id)
      if (error) throw error
      return res.status(200).json(data)
    }

    if (method === 'POST') {
      const { menu_item_id, variant_option_id, items } = req.body
      
      // Determine what to match on for existing recipe
      let matchQuery = supabase.from('recipes').select('id').eq('restaurant_id', restaurant_id).eq('menu_item_id', menu_item_id)
      if (variant_option_id) {
        matchQuery = matchQuery.eq('variant_option_id', variant_option_id)
      } else {
        matchQuery = matchQuery.is('variant_option_id', null)
      }
      
      const { data: existing } = await matchQuery.maybeSingle()
      let recipeId = existing?.id

      if (!recipeId) {
        // Create new
        const { data: newVal, error: insErr } = await supabase
          .from('recipes')
          .insert({ restaurant_id, menu_item_id, variant_option_id: variant_option_id || null })
          .select('id')
          .single()
        if (insErr) throw insErr
        recipeId = newVal.id
      }

      // Delete old items, insert new
      await supabase.from('recipe_items').delete().eq('recipe_id', recipeId)
      if (items && items.length > 0) {
        const itemsToInsert = items.map(i => ({ recipe_id: recipeId, ingredient_id: i.ingredient_id, quantity: i.quantity }))
        const { error: itemsErr } = await supabase.from('recipe_items').insert(itemsToInsert)
        if (itemsErr) throw itemsErr
      }

      return res.status(200).json({ recipe_id: recipeId })
    }

    res.setHeader('Allow', ['GET','POST'])
    res.status(405).end(`Method ${method} Not Allowed`)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
