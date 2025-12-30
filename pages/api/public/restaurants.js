// pages/api/public/restaurants.js
import { getServerSupabase } from '../../../services/supabase-server';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getServerSupabase();

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : 10;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const { data, error } = await supabase.rpc('nearby_restaurants', {
    in_lat: lat,
    in_lng: lng,
    in_radius_km: radiusKm,
  });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ restaurants: data || [] });
}
