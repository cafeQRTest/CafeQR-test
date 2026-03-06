// pages/api/subscription/start-trial.js

import { getServerSupabase } from '../../../services/supabase-server';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { restaurant_id, owner_email } = req.body;      // accept owner_email
  if (!restaurant_id) {
    return res.status(400).json({ error: 'restaurant_id required' });
  }

  try {
    const supabase = getServerSupabase();

    let { data: existingRestaurant, error: restError } = await supabase
      .from('restaurants')
      .select('id')
      .eq('id', restaurant_id)
      .maybeSingle();

    // 1b) Fallback: if not found by ID, but we have an email, try finding by email
    // This handles cases where client might have generated a generic ID but user already has a restaurant
    if (!existingRestaurant && owner_email) {
      const { data: byEmail, error: emailError } = await supabase
        .from('restaurants')
        .select('id')
        .eq('owner_email', owner_email)
        .maybeSingle();

      if (!emailError && byEmail) {
        existingRestaurant = byEmail;
      }
    }

    if (restError) {
      console.error('[start-trial] Error fetching restaurant:', restError);
      return res.status(500).json({ error: 'Failed to fetch restaurant' });
    }

    let restaurant = existingRestaurant;

    if (!restaurant) {
      // Defensive: If this user is already staff on another restaurant, don't create a ghost restaurant
      if (owner_email) {
        const { data: staffRow } = await supabase
          .from('restaurant_staff')
          .select('restaurant_id')
          .eq('staff_email', owner_email.toLowerCase())
          .maybeSingle();

        if (staffRow) {
          // This user is staff — they don't need their own restaurant
          return res.status(200).json({ message: 'Staff user, no restaurant needed' });
        }
      }

      const { data: created, error: createError } = await supabase
        .from('restaurants')
        .insert({
          id: restaurant_id,
          name: 'New restaurant',
          owner_email: owner_email || null,
        })
        .select('id')
        .single();

      if (createError) {
        console.error('[start-trial] Error creating restaurant:', createError);
        return res.status(500).json({ error: 'Failed to create restaurant' });
      }

      restaurant = created;
    } else {
      restaurant = existingRestaurant;
    }

    // 2) Check subscription doesn't already exist
    const { data: existingSub, error: existError } = await supabase
      .from('restaurant_subscriptions')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle();

    if (existError && existError.code !== 'PGRST116') {
      console.error('[start-trial] Error checking subscription:', existError);
      return res.status(500).json({ error: 'DB query failed' });
    }

    if (existingSub) {
      return res.status(200).json({ message: 'Already exists' });
    }

    // 3) Create trial subscription
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    const { data, error } = await supabase
      .from('restaurant_subscriptions')
      .insert({
        restaurant_id: restaurant.id,
        status: 'trial',
        is_active: true,
        trial_ends_at: trialEnd.toISOString(),
        current_period_end: trialEnd.toISOString(),
        next_due_at: trialEnd.toISOString(),
      })
      .select()
      .single(); // return the created subscription [web:87]

    if (error) {
      console.error('[start-trial] Error creating trial:', error);
      return res.status(500).json({ error: 'Failed to create trial' });
    }

    return res.status(200).json({ success: true, subscription: data });
  } catch (err) {
    console.error('[start-trial] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
