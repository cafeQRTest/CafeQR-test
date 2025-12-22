import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { restaurantId } = req.query
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .select('id, name, description, price, veg, image_url, category, ispopular, is_available, available')
    .eq('restaurant_id', restaurantId)
    .order('name', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ items: data })
}
