import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    // TODO: Replace mock data with real API fetch using stored Swiggy keys
    const mockOrders = [
      {
        order_id: 'SWG123',
        restaurant_id: 'demo-restaurant-uuid',
        total_amount: 450,
        payment_status: 'paid',
        created_at: new Date().toISOString(),
        items: [
          { name: 'Paneer Butter Masala', quantity: 2, price: 200 },
          { name: 'Jeera Rice', quantity: 1, price: 50 }
        ]
      }
    ]
    res.status(200).json({ success: true, orders: mockOrders })
  } catch (e) {
    console.error('Swiggy poll error:', e)
    res.status(500).json({ error: 'Failed to poll Swiggy orders' })
  }
}
