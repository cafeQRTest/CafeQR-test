import { useEffect, useState } from 'react'
import { getSupabase } from '../../services/supabase' // you already have this helper

export default function OwnerCustomers() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      const supabase = getSupabase()

      // Assumes you store active_restaurant_id in localStorage (used elsewhere in your app)
      const restaurantId = localStorage.getItem('active_restaurant_id')
      if (!restaurantId) { setLoading(false); return }

      const { data, error } = await supabase
        .from('restaurant_customers')
        .select(`
          restaurant_id,
          customer_id,
          first_order_at,
          last_order_at,
          order_count,
          total_spent,
          customers:customer_id ( phone, name, email )
        `)
        .eq('restaurant_id', restaurantId)
        .order('last_order_at', { ascending: false })

      if (!mounted) return
      if (error) console.error(error)
      setRows(data || [])
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [])

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>

  return (
    <div style={{ padding: 16 }}>
      <h2>Customers</h2>
      {rows.map(r => (
        <div key={`${r.restaurant_id}-${r.customer_id}`} style={{ border: '1px solid #eee', marginBottom: 8, padding: 12 }}>
          <div style={{ fontWeight: 700 }}>{r.customers?.name || 'Customer'}</div>
          <div>{r.customers?.phone}</div>
          <div>Orders: {r.order_count} | Spend: ₹{Number(r.total_spent || 0).toFixed(2)}</div>
          <div>Last order: {r.last_order_at ? new Date(r.last_order_at).toLocaleString() : '-'}</div>
        </div>
      ))}
    </div>
  )
}
