
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, query, restaurant_id } = req.query;
  // Support both specific 'phone' param or generic 'query'
  const searchTerm = (phone || query || '').trim();

  if (!searchTerm || searchTerm.length < 3) {
    return res.status(200).json({ customers: [] });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (!restaurant_id) {
      return res.status(400).json({ error: 'restaurant_id is required' });
    }

    // Search within restaurant's own customer list
    const { data, error } = await supabase
      .from('restaurant_customers')
      .select('customer_id, name, phone, email, address, customer_no')
      .eq('restaurant_id', restaurant_id)
      .or(`phone.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%,customer_no.ilike.%${searchTerm}%`)
      .limit(10);

    if (error) {
      console.error('Customer search error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Standardize IDs for frontend
    const standardized = (data || []).map(c => ({
       id: c.customer_id || c.id,
       customer_id: c.customer_id || c.id,
       name: c.name,
       phone: c.phone,
       email: c.email,
       address: c.address,
       customer_no: c.customer_no
    }));

    return res.status(200).json({ customers: standardized });

  } catch (e) {
    console.error('API Error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
