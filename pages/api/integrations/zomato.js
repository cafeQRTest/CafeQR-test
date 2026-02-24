import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { sendNewOrderPush } from '../../../services/push/newOrderNotifier'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const payload = req.body
  const signature = req.headers['x-zomato-signature'] || '' // Adjust header name as per Zomato docs

  // Extract restaurant_id from payload or headers (depends on actual payload fields)
  const { restaurant_id } = payload

  if (!restaurant_id) return res.status(400).json({ error: 'Missing restaurant_id' })

  // Fetch webhook secret for this restaurant
  const { data: profile, error: profErr } = await supabase
    .from('restaurant_profiles')
    .select('zomato_webhook_secret')
    .eq('restaurant_id', restaurant_id)
    .single()
  if (profErr) return res.status(500).json({ error: 'Restaurant profile fetch error' })

  // Validate signature (HMAC SHA256)
  const computedSignature = crypto
    .createHmac('sha256', profile.zomato_webhook_secret || '')
    .update(JSON.stringify(payload))
    .digest('hex')

  if (computedSignature !== signature) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // Map Zomato order payload to your DB order scheme
  try {
    const orderData = {
      restaurant_id,
      table_number: null,
      status: 'new',
      payment_method: payload.payment_method || 'unknown',
      payment_status: payload.payment_status || 'pending',
      subtotal: payload.subtotal || 0,
      total_amount: payload.total_amount || 0,
      special_instructions: payload.special_instructions || null,
      restaurant_name: payload.restaurant_name || null,
      channel: 'zomato',
      external_order_id: payload.order_id,
      created_at: new Date(payload.order_date)
    }
    const { data, error } = await supabase.from('orders').insert([orderData]).select('id')
    if (error) throw error
    // TODO: Insert order items as well when Zomato payload structure is clear

    // Send push notification
    try {
      if (data && data.length > 0) {
        await sendNewOrderPush({
          supabase,
          restaurantId: restaurant_id,
          orderId: data[0].id,
          orderType: 'zomato',
          tableNumber: 'ZOMATO',
          totalAmount: payload.total_amount || 0,
        });
      }
    } catch (pushErr) {
      console.error('Zomato push notification error:', pushErr)
    }

    res.status(200).json({ success: true })
  } catch (e) {
    console.error('Zomato webhook error:', e)
    res.status(500).json({ error: 'Failed to insert order' })
  }
}
