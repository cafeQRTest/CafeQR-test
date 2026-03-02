
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    restaurant_id, 
    customer_id, 
    order_id, 
    type, // 'earn' or 'redeem'
    points,
    amount_value = 0 
  } = req.body;

  if (!restaurant_id || !customer_id || !points) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 1. Record Transaction
    const transactionData = {
      restaurant_id,
      customer_id,
      order_id,
      txn_type: type,
      points_delta: type === 'redeem' ? -points : points, // Negative for usage, positive for earning
      amount_value, // Currency value (e.g. Rs 100 redeemed)
      points_earned: type === 'earn' ? points : 0,
      points_redeemed: type === 'redeem' ? points : 0,
      created_at: new Date().toISOString()
    };

    const { error: txErr } = await supabase
      .from('loyalty_transactions')
      .insert([transactionData]);

    if (txErr) {
        console.error('[LOYALTY API] Insert error:', txErr);
        throw txErr;
    }

    // 2. Note: Customer balance is now calculated dynamically from loyalty_transactions, 
    // so we don't need to manually update cache columns in restaurant_customers.
    
    return res.status(200).json({ success: true });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('[LOYALTY API] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
