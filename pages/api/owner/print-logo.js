// pages/api/owner/print-logo.js
import { getSupabase } from '../../../services/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabase();

    const { restaurantId, bitmap, cols, rows, clear } = req.body || {};

    if (!restaurantId) {
      res.status(400).json({ error: 'Missing restaurantId' });
      return;
    }

    const update = clear
      ? {
          print_logo_bitmap: null,
          print_logo_cols: null,
          print_logo_rows: null,
        }
      : {
          print_logo_bitmap: String(bitmap || ''),
          print_logo_cols: Number(cols || 0) || null,
          print_logo_rows: Number(rows || 0) || null,
        };

    const { error } = await supabase
      .from('restaurant_profiles')
      .update(update)
      .eq('restaurant_id', restaurantId);

    if (error) throw error;

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to save logo' });
  }
}
