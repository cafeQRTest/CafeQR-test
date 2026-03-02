import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    // TODO: Replace mock data with real API fetch using stored Zomato keys
    const mockOrders = [
      {
        order_id: 'ZMT789',
        restaurant_id: 'demo-restaurant-uuid',
        total_amount: 350,
        payment_status: 'pending',
        created_at: new Date().toISOString(),
        items: [
          { name: 'Veg Thali', quantity: 1, price: 350 }
        ]
      }
    ]
    res.status(200).json({ success: true, orders: mockOrders })
  } catch (e) {
    console.error('Zomato poll error:', e)
    res.status(500).json({ error: 'Failed to poll Zomato orders' })
  }
}
