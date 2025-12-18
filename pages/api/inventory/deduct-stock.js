import { createClient } from '@supabase/supabase-js';
import { round2, normalizeQty } from '../../../lib/qty'; // adjust path

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { menu_item_id, quantity, restaurant_id } = req.body || {};
    const orderQty = normalizeQty(quantity);
    if (!menu_item_id || !restaurant_id || orderQty === null) {
      return res.status(400).json({ error: 'Missing/invalid fields' });
    }

    const { data: menuItem } = await supabase
      .from('menu_items')
      .select('is_packaged_good')
      .eq('id', menu_item_id)
      .eq('restaurant_id', restaurant_id)
      .maybeSingle();

    if (!menuItem || menuItem.is_packaged_good) {
      return res.status(200).json({ success: true, message: 'No ingredient deduction needed' });
    }

    const { data: recipe } = await supabase
      .from('recipes')
      .select('id, recipe_items(ingredient_id, quantity)')
      .eq('menu_item_id', menu_item_id)
      .eq('restaurant_id', restaurant_id)
      .maybeSingle();

    const items = recipe?.recipe_items || [];
    if (!items.length) return res.status(200).json({ success: true, message: 'No recipe, nothing to deduct' });

    const adjustments = items.map(ri => ({
      ingredient_id: ri.ingredient_id,
      delta: -round2(Number(ri.quantity) * orderQty),
    }));

    const { error: rpcErr } = await supabase.rpc('apply_stock_adjustments', {
      p_restaurant_id: restaurant_id,
      p_adjustments: adjustments,
    });

    if (rpcErr) return res.status(400).json({ error: rpcErr.message });
    return res.status(200).json({ success: true, message: 'Stock deducted successfully' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to deduct stock' });
  }
}
