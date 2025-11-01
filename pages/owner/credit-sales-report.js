// pages/owner/credit-sales-report.js
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import { getSupabase } from '../../services/supabase'

export default function CreditSalesReportPage() {
  const supabase = getSupabase()
  const { checking } = useRequireAuth(supabase)
  const { restaurant, loading: restLoading } = useRestaurant()
  const restaurantId = restaurant?.id
  const router = useRouter()

  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    if (checking || restLoading || !restaurantId) return
    loadReport()
  }, [startDate, endDate, restaurantId, checking, restLoading])

  const loadReport = async () => {
    setLoading(true)
    try {
      // Get credit orders
      const { data: orders, error: ordersErr } = await supabase
        .from('orders')
        .select('*, credit_customer_id(name, phone, current_balance)')
        .eq('restaurant_id', restaurantId)
        .eq('is_credit', true)
        .eq('payment_method', 'credit')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)

      if (ordersErr) throw ordersErr

      // Get credit transactions
      const { data: transactions, error: txnErr } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .gte('transaction_date', `${startDate}T00:00:00`)
        .lte('transaction_date', `${endDate}T23:59:59`)

      if (txnErr) throw txnErr

      // Calculate summary
      const totalCredit = orders.reduce((sum, o) => sum + (o.total_inc_tax || 0), 0)
      const totalPayments = transactions
        .filter(t => t.transaction_type === 'payment')
        .reduce((sum, t) => sum + t.amount, 0)
      const outstanding = totalCredit - totalPayments

      setReportData({
        orders: orders || [],
        transactions: transactions || [],
        summary: {
          totalCredit,
          totalPayments,
          outstanding,
          ordersCount: orders?.length || 0,
          uniqueCustomers: new Set(orders?.map(o => o.credit_customer_id?.phone)).size
        }
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (checking || restLoading) return <div style={{ padding: 24 }}>Loading…</div>
  if (!restaurantId) return <div style={{ padding: 24 }}>No restaurant</div>

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <button onClick={() => router.back()} style={{ marginBottom: 16 }}>← Back</button>
      <h1>💳 Credit Sales Report</h1>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6 }}
        />
        <span>to</span>
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6 }}
        />
      </div>

      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div>Loading...</div>
      ) : reportData ? (
        <>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ padding: 16, background: '#f3f4f6', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Total Credit Sales</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>₹{reportData.summary.totalCredit.toFixed(2)}</div>
            </div>
            <div style={{ padding: 16, background: '#f3f4f6', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Payments Received</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>₹{reportData.summary.totalPayments.toFixed(2)}</div>
            </div>
            <div style={{ padding: 16, background: '#f3f4f6', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Outstanding</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626', marginTop: 8 }}>₹{reportData.summary.outstanding.toFixed(2)}</div>
            </div>
            <div style={{ padding: 16, background: '#f3f4f6', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Orders/Customers</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{reportData.summary.ordersCount}/{reportData.summary.uniqueCustomers}</div>
            </div>
          </div>

          {/* Credit Orders */}
          <h2 style={{ marginTop: 32, marginBottom: 16 }}>Credit Orders</h2>
          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ padding: 12, textAlign: 'left' }}>Order #</th>
                  <th style={{ padding: 12, textAlign: 'left' }}>Customer</th>
                  <th style={{ padding: 12, textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: 12, textAlign: 'left' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {reportData.orders.map(order => (
                  <tr key={order.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: 12 }}>#{ order.id.substring(0, 8)}</td>
                    <td style={{ padding: 12 }}>{order.customer_name || 'N/A'}</td>
                    <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>₹{(order.total_inc_tax || 0).toFixed(2)}</td>
                    <td style={{ padding: 12 }}>{new Date(order.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
