// pages/api/public/menu.js
import { getServerSupabase } from '../../../services/supabase-server';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getServerSupabase();
  const { restaurantId } = req.query;

  if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

  // Base menu items
  const { data: items, error } = await supabase
    .from('menu_items')
    .select('id, name, description, price, veg, image_url, category, ispopular, is_available, available')
    .eq('restaurant_id', restaurantId)
    .order('name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Optional: variant pricing (if you use it)
  const itemIds = (items || []).map(i => i.id);
  let variants = [];
  if (itemIds.length) {
    const { data: vp, error: vpErr } = await supabase
      .from('variant_pricing')
      .select('menu_item_id, price, variant_options(id, name)')
      .in('menu_item_id', itemIds);

    if (!vpErr) variants = vp || [];
  }

  // Group variants under each menu item (if present)
  const byItem = new Map();
  for (const row of variants) {
    const k = row.menu_item_id;
    const list = byItem.get(k) || [];
    list.push({
      id: row.variant_options?.id,
      name: row.variant_options?.name,
      price: Number(row.price || 0),
    });
    byItem.set(k, list);
  }

  const enriched = (items || []).map(i => ({
    ...i,
    variants: byItem.get(i.id) || [],
  }));

  return res.status(200).json({ items: enriched });
}
