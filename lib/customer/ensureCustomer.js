
import { getSupabase } from '../../services/supabase';
import { randomUUID } from 'crypto'; // Node environment

/**
 * Ensures a customer exists in the restaurant_customers table.
 * 
 * @param {SupabaseClient} supabase 
 * @param {Object} params
 * @param {string} params.restaurant_id
 * @param {string} [params.phone]
 * @param {string} [params.name]
 * @param {string} [params.email]
 * @param {string} [params.address]
 * 
 * @returns {Promise<string>} customer_id
 */
export async function ensureCustomer(supabase, { restaurant_id, phone, name, email, address }) {
  const cleanPhone = phone?.trim() || null;
  const cleanName = name?.trim() || null;

  if (!cleanPhone && !cleanName) return null;

  let customerId = null;

  // 1. Try to find existing customer in restaurant_customers
  if (cleanPhone) {
    // Try find by phone (Strong Match)
    const { data, error } = await supabase
      .from('restaurant_customers')
      .select('customer_id, name')
      .eq('restaurant_id', restaurant_id)
      .eq('phone', cleanPhone)
      .maybeSingle();
    
    if (error) throw error;
    if (data) {
      customerId = data.customer_id;
      
      // Update last_order_at
      await supabase
        .from('restaurant_customers')
        .update({ 
          last_order_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('restaurant_id', restaurant_id)
        .eq('customer_id', customerId);
      
      return customerId;
    }
  } else if (cleanName) {
    // Try find by name within this restaurant (Weak Match)
    const { data: matches, error } = await supabase
      .from('restaurant_customers')
      .select('customer_id')
      .eq('restaurant_id', restaurant_id)
      .ilike('name', cleanName);
    
    if (error) throw error;
    if (matches && matches.length === 1) {
      customerId = matches[0].customer_id;
      
      // Update last_order_at
      await supabase
        .from('restaurant_customers')
        .update({ 
          last_order_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('restaurant_id', restaurant_id)
        .eq('customer_id', customerId);
      
      return customerId;
    }
  }

  // 2. If not found, create new customer in restaurant_customers
  // 2. If not found, create new customer in restaurant_customers
  if (!customerId) {
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      
      // Generate customer_no (8 chars alphanumeric)
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let customer_no = '';
      for (let i = 0; i < 8; i++) {
        customer_no += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const newId = randomUUID(); // Generate UUID

      const { data: newCustomer, error: createError } = await supabase
        .from('restaurant_customers')
        .insert([{
          restaurant_id,
          customer_id: newId, // Explicit UUID
          customer_no,
          name: cleanName || 'Guest',
          phone: cleanPhone,
          email: email?.trim() || null,
          address: address?.trim() || null,
          total_spent: 0,
          visit_count: 0,
          is_active: true,
          last_order_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select('customer_id')
        .single();

      if (createError) {
        // Handle race condition/Unique violation
        if (createError.code === '23505') {
            // Check if violation is on phone
            if (cleanPhone) {
                const { data: retryCustomer } = await supabase
                  .from('restaurant_customers')
                  .select('customer_id')
                  .eq('restaurant_id', restaurant_id)
                  .eq('phone', cleanPhone)
                  .maybeSingle();
                
                if (retryCustomer) {
                    customerId = retryCustomer.customer_id;
                    break; // Found existing, stop retrying
                }
            }
            // If not phone (or phone lookup failed), assume customer_no collision and retry loop
            if (attempts === 3) throw createError; // Give up after 3 tries
        } else {
          throw createError;
        }
      } else {
        customerId = newCustomer.customer_id;
        break; // Success
      }
    }
  }

  return customerId;
}
