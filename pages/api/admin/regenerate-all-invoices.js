import { InvoiceService } from '../../../services/invoiceService'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { admin_key } = req.body
  if (admin_key !== process.env.ADMIN_REGENERATE_KEY) {
    return res.status(403).json({ error: 'Invalid admin key' })
  }

  try {
    console.log('=== STARTING BULK INVOICE REGENERATION ===')

    const { data: completedOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id, restaurant_id, created_at, status')
      .eq('status', 'completed')
      .order('restaurant_id')
      .order('created_at', { ascending: true })

    if (ordersError) throw new Error(`Failed to fetch orders: ${ordersError.message}`)

    console.log(`Found ${completedOrders.length} completed orders`)

    const ordersByRestaurant = {}
    completedOrders.forEach(order => {
      if (!ordersByRestaurant[order.restaurant_id]) {
        ordersByRestaurant[order.restaurant_id] = []
      }
      ordersByRestaurant[order.restaurant_id].push(order)
    })

    const restaurants = Object.keys(ordersByRestaurant)
    console.log(`Processing ${restaurants.length} restaurants`)

    const results = {
      success: [],
      failed: [],
      total: 0
    }

    for (const restaurantId of restaurants) {
      const orders = ordersByRestaurant[restaurantId]
      console.log(`\n--- Restaurant: ${restaurantId} (${orders.length} orders) ---`)

      // Delete old invoices for this restaurant
      const orderIds = orders.map(o => o.id)
      const { data: existingInvoices } = await supabase
        .from('invoices')
        .select('id')
        .in('order_id', orderIds)
      
      if (existingInvoices?.length) {
        const invoiceIds = existingInvoices.map(inv => inv.id)
        await supabase.from('invoice_items').delete().in('invoice_id', invoiceIds)
        await supabase.from('invoices').delete().in('order_id', orderIds)
        console.log(`Cleaned ${existingInvoices.length} old invoices`)
      }

      // Reset counter
      await supabase.from('invoice_counters').delete().eq('restaurant_id', restaurantId)

      // Regenerate with delay between each order to avoid timeout
      for (const order of orders) {
        try {
          const result = await InvoiceService.createInvoiceFromOrder(order.id)
          results.success.push({
            orderId: order.id,
            invoiceNo: result.invoiceNo,
            restaurantId
          })
          console.log(`✓ ${result.invoiceNo}`)
          
          // Small delay to prevent connection pooling issues
          await new Promise(resolve => setTimeout(resolve, 200))
        } catch (err) {
          console.error(`✗ Order ${order.id}: ${err.message}`)
          results.failed.push({
            orderId: order.id,
            restaurantId,
            error: err.message
          })
        }
        results.total++
      }
    }

    console.log('\n=== REGENERATION COMPLETE ===')
    console.log(`Total: ${results.total} | Success: ${results.success.length} | Failed: ${results.failed.length}`)

    return res.status(200).json({
      message: 'Invoice regeneration completed',
      summary: {
        total: results.total,
        successful: results.success.length,
        failed: results.failed.length
      },
      details: results
    })

  } catch (error) {
    console.error('Regeneration error:', error)
    return res.status(500).json({ error: error.message })
  }
}
