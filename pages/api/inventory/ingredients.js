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
        .from('ingredients')
        .select('*')
        .eq('restaurant_id', restaurant_id)
      if (error) throw error
      return res.status(200).json(data)
    }

    if (method === 'POST') {
      const { name, unit, current_stock, reorder_threshold } = req.body
      // Basic validation: name, unit, and current_stock are required; threshold optional
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'Ingredient name is required' })
      if (!unit || !String(unit).trim()) return res.status(400).json({ error: 'Unit is required' })
      if (current_stock === undefined || current_stock === null || Number.isNaN(Number(current_stock))) {
        return res.status(400).json({ error: 'Current stock is required' })
      }
      // Uniqueness check (case-insensitive) per restaurant
      const { data: existing, error: existErr } = await supabase
        .from('ingredients')
        .select('id')
        .eq('restaurant_id', restaurant_id)
        .ilike('name', String(name).trim())
        .limit(1)
      if (existErr) throw existErr
      if (existing && existing.length > 0) {
        return res.status(409).json({ error: 'Ingredient name must be unique' })
      }
      const { data, error } = await supabase
        .from('ingredients')
        .insert([{ 
          restaurant_id, 
          name: String(name).trim(), 
          unit: String(unit).trim(), 
          current_stock: Number(current_stock), 
          reorder_threshold: reorder_threshold === undefined || reorder_threshold === null ? 0 : Number(reorder_threshold) 
        }])
        .single()
      if (error) throw error
      return res.status(201).json(data)
    }

    if (method === 'PUT') {
      const { id, current_stock, reorder_threshold } = req.body
      const { data, error } = await supabase
        .from('ingredients')
        .update({ current_stock, reorder_threshold, updated_at: new Date() })
        .eq('id', id)
        .single()
      if (error) throw error
      return res.status(200).json(data)
    }

    if (method === 'DELETE') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'Missing id' })
      // Block delete if ingredient is used in any recipe items
      const { data: refs, error: refsErr } = await supabase
        .from('recipe_items')
        .select('id')
        .eq('ingredient_id', id)
        .limit(1)
      if (refsErr) throw refsErr
      if (refs && refs.length > 0) {
        return res.status(409).json({ error: 'Cannot delete: ingredient is used in one or more recipes' })
      }
      const { error } = await supabase
        .from('ingredients')
        .delete()
        .eq('id', id)
      if (error) throw error
      return res.status(204).end()
    }

    res.setHeader('Allow', ['GET','POST','PUT','DELETE'])
    res.status(405).end(`Method ${method} Not Allowed`)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
