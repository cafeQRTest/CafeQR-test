import React, { useEffect, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import Card from '../../components/ui/Card'
import Table from '../../components/ui/Table'
import DateRangePicker from '../../components/ui/DateRangePicker'
import { getSupabase } from '../../services/supabase'
import { downloadTextAndShare } from '../../utils/printUtils'

export default function SalesPage() {
  const supabase = getSupabase()
  const { checking } = useRequireAuth(supabase)
  const { restaurant, loading: restLoading } = useRestaurant()
  const restaurantId = restaurant?.id || ''

  const [range, setRange] = useState({
    start: new Date(new Date().setHours(0, 0, 0, 0)),
    end: new Date()
  })

  const [activeReport, setActiveReport] = useState(0)
  const [salesData, setSalesData] = useState([])
  const [summaryStats, setSummaryStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    totalItems: 0,
    avgOrderValue: 0,
    totalTax: 0,
    cgst: 0,
    sgst: 0,
    totalDiscount: 0
  })
  const [paymentBreakdown, setPaymentBreakdown] = useState([])
  const [orderTypeBreakdown, setOrderTypeBreakdown] = useState([])
  const [taxBreakdown, setTaxBreakdown] = useState([])
  const [hourlyBreakdown, setHourlyBreakdown] = useState([])
  const [categoryBreakdown, setCategoryBreakdown] = useState([])
  const [menuCategories, setMenuCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restaurantProfile, setRestaurantProfile] = useState(null)

  const reports = ['Summary', 'Item-wise', 'Payment Methods', 'Order Types', 'Tax Report', 'Hourly Sales', 'Categories']

  // Fetch restaurant profile and menu categories
  useEffect(() => {
    if (!restaurantId || !supabase) return
    
    const fetchData = async () => {
      // Restaurant profile
      const { data: profile } = await supabase
        .from('restaurant_profiles')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .single()
      
      if (profile) setRestaurantProfile(profile)

      // Menu categories from menu_items
      const { data: items } = await supabase
        .from('menu_items')
        .select('category')
        .eq('restaurant_id', restaurantId)
        .neq('category', null)
      
      if (items) {
        const uniqueCats = [...new Set(items.map(m => m.category))]
        setMenuCategories(uniqueCats.filter(c => c && c.trim() !== ''))
      }
    }
    
    fetchData()
  }, [restaurantId, supabase])

  useEffect(() => {
    if (checking || restLoading || !restaurantId || !supabase) return
    loadAllReportsData()
  }, [checking, restLoading, restaurantId, range, supabase, selectedCategory])

  const loadAllReportsData = async () => {
    if (!supabase) return
    setLoading(true)
    setError('')
    try {
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          total_amount,
          total_inc_tax,
          total_tax,
          created_at,
          status,
          items,
          payment_method,
          actual_payment_method,
          order_type,
          gst_enabled
        `)
        .eq('restaurant_id', restaurantId)
        .gte('created_at', range.start.toISOString())
        .lte('created_at', range.end.toISOString())
        .neq('status', 'cancelled')

      if (ordersError) throw ordersError
      const orderData = Array.isArray(orders) ? orders : []

      let totalOrders = orderData.length
      let totalRevenue = 0
      let totalTax = 0
      let cgst = 0
      let sgst = 0
      let totalQuantity = 0
      const itemCounts = {}
      const itemRevenue = {}
      const categoryMap = {}

      orderData.forEach(o => {
        const revenue = Number(o.total_inc_tax ?? o.total_amount ?? 0)
        const tax = Number(o.total_tax ?? 0)
        totalRevenue += revenue
        totalTax += tax

        // All India transactions: CGST = SGST = tax/2
        cgst += tax / 2
        sgst += tax / 2

        if (Array.isArray(o.items)) {
          o.items.forEach(item => {
            const name = item.name || 'Unknown Item'
            const itemCategory = item.category || 'Uncategorized'
            const quantity = Number(item.quantity) || 1
            const price = Number(item.price) || 0
            const itemTotal = quantity * price

            // Item-wise: apply selected category filter
            if (!selectedCategory || itemCategory === selectedCategory) {
              itemCounts[name] = (itemCounts[name] || 0) + quantity
              itemRevenue[name] = (itemRevenue[name] || 0) + itemTotal
              totalQuantity += quantity
            }

            // Category totals (all items, unfiltered)
            categoryMap[itemCategory] = (categoryMap[itemCategory] || 0) + itemTotal
          })
        }
      })

      setSummaryStats({
        totalOrders,
        totalRevenue,
        totalItems: totalQuantity,
        avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        totalTax,
        cgst: Math.round(cgst * 100) / 100,
        sgst: Math.round(sgst * 100) / 100,
        totalDiscount: 0
      })

      // Item-wise (filtered)
      const itemsArray = Object.entries(itemCounts)
        .map(([name, quantity]) => ({
          item_name: name,
          quantity_sold: quantity,
          revenue: itemRevenue[name] || 0
        }))
        .sort((a, b) => b.revenue - a.revenue)
      setSalesData(itemsArray)

      // Payment methods
      const paymentMap = {}
      orderData.forEach(o => {
        const method = o.actual_payment_method || o.payment_method || 'unknown'
        const amount = Number(o.total_inc_tax ?? o.total_amount ?? 0)
        if (!paymentMap[method]) paymentMap[method] = { count: 0, amount: 0 }
        paymentMap[method].count += 1
        paymentMap[method].amount += amount
      })
      setPaymentBreakdown(Object.entries(paymentMap).map(([method, data]) => ({
        payment_method: method,
        order_count: data.count,
        total_amount: data.amount,
        percentage: totalRevenue > 0 ? ((data.amount / totalRevenue) * 100).toFixed(1) : '0.0'
      })))

      // Order types
      const orderTypeMap = {}
      orderData.forEach(o => {
        const type = o.order_type || 'counter'
        const amount = Number(o.total_inc_tax ?? o.total_amount ?? 0)
        if (!orderTypeMap[type]) orderTypeMap[type] = { count: 0, amount: 0 }
        orderTypeMap[type].count += 1
        orderTypeMap[type].amount += amount
      })
      setOrderTypeBreakdown(Object.entries(orderTypeMap).map(([type, data]) => ({
        order_type: type,
        order_count: data.count,
        total_amount: data.amount,
        percentage: totalRevenue > 0 ? ((data.amount / totalRevenue) * 100).toFixed(1) : '0.0'
      })))

      // Tax (CGST + SGST only, no IGST)
      setTaxBreakdown([
        { tax_type: 'CGST', amount: Math.round(cgst * 100) / 100 },
        { tax_type: 'SGST', amount: Math.round(sgst * 100) / 100 },
        { tax_type: 'Total Tax', amount: Math.round(totalTax * 100) / 100 }
      ])

      // Hourly
      const hourlyMap = {}
      orderData.forEach(o => {
        const hour = new Date(o.created_at).getHours()
        const amount = Number(o.total_inc_tax ?? o.total_amount ?? 0)
        if (!hourlyMap[hour]) hourlyMap[hour] = { count: 0, amount: 0 }
        hourlyMap[hour].count += 1
        hourlyMap[hour].amount += amount
      })
      setHourlyBreakdown(
        Array.from({ length: 24 }, (_, i) => ({
          hour: `${String(i).padStart(2, '0')}:00`,
          order_count: hourlyMap[i]?.count || 0,
          total_amount: hourlyMap[i]?.amount || 0
        })).filter(h => h.order_count > 0)
      )

      // Category-wise
      setCategoryBreakdown(Object.entries(categoryMap)
        .map(([cat, amount]) => ({
          category: cat || 'Uncategorized',
          total_amount: amount,
          percentage: totalRevenue > 0 ? ((amount / totalRevenue) * 100).toFixed(1) : '0.0'
        }))
        .sort((a, b) => b.total_amount - a.total_amount)
      )

    } catch (err) {
      setError(err.message || 'Failed to load sales data')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = n => `₹${Number(n).toFixed(2)}`
  const formatPercent = n => `${Number(n).toFixed(1)}%`

  const handlePrint = async () => {
    // Generate full sales report text (48-char width for 2-inch thermal printer)
    const W = 48
    const lines = []
    const dashes = () => '='.repeat(W)
    const center = (str) => {
      const padding = Math.max(0, Math.floor((W - str.length) / 2))
      return ' '.repeat(padding) + str
    }

    lines.push(dashes())
    lines.push(center('SALES REPORT'))
    lines.push(dashes())
    lines.push(`Period: ${range.start.toLocaleDateString('en-IN')} - ${range.end.toLocaleDateString('en-IN')}`)
    lines.push('')
    lines.push(`Total Orders: ${summaryStats.totalOrders}`)
    lines.push(`Total Revenue: ${formatCurrency(summaryStats.totalRevenue)}`)
    lines.push(`Avg Order: ${formatCurrency(summaryStats.avgOrderValue)}`)
    lines.push(`Items Sold: ${summaryStats.totalItems}`)
    lines.push(`Total Tax: ${formatCurrency(summaryStats.totalTax)}`)
    lines.push(`  CGST: ${formatCurrency(summaryStats.cgst)}`)
    lines.push(`  SGST: ${formatCurrency(summaryStats.sgst)}`)
    lines.push('')
    lines.push(dashes())
    lines.push(center('** END OF REPORT **'))
    lines.push('')

    const text = lines.join('\n')
    
    // Use existing print utility (Web Share or download as .txt)
    const result = await downloadTextAndShare(
      { 
        id: `SalesReport-${Date.now()}`,
        created_at: new Date().toISOString(),
        restaurant_name: restaurantProfile?.restaurant_name || 'Restaurant'
      },
      { grand_total: summaryStats.totalRevenue, tax_total: summaryStats.totalTax },
      restaurantProfile
    )
    
    if (!result.success) {
      alert('Print failed: ' + result.error)
    }
  }

  if (checking || restLoading) return <div style={{ padding: 16 }}>Loading…</div>
  if (!restaurantId) return <div style={{ padding: 16 }}>No restaurant selected</div>

  return (
    <div className="sales-page-container">
      <div className="sales-header">
        <h1>Sales Reports</h1>
        <div className="sales-controls">
          <DateRangePicker start={range.start} end={range.end} onChange={setRange} />
          <button className="sales-print-btn" onClick={handlePrint}>
            🖨️ Print
          </button>
        </div>
      </div>

      {error && (
        <Card style={{ marginBottom: 12, borderColor: '#fecaca', background: '#fff1f2', color: '#b91c1c', padding: 12 }}>
          {error}
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>Loading reports…</div>
      ) : (
        <>
          <div className="sales-totals-grid">
            <Card className="sales-total-card">
              <div className="sales-label">Total Orders</div>
              <div className="sales-value">{summaryStats.totalOrders}</div>
            </Card>
            <Card className="sales-total-card">
              <div className="sales-label">Total Revenue</div>
              <div className="sales-value">{formatCurrency(summaryStats.totalRevenue)}</div>
            </Card>
            <Card className="sales-total-card">
              <div className="sales-label">Avg Order</div>
              <div className="sales-value">{formatCurrency(summaryStats.avgOrderValue)}</div>
            </Card>
            <Card className="sales-total-card">
              <div className="sales-label">Items Sold</div>
              <div className="sales-value">{summaryStats.totalItems}</div>
            </Card>
            <Card className="sales-total-card">
              <div className="sales-label">Total Tax</div>
              <div className="sales-value">{formatCurrency(summaryStats.totalTax)}</div>
            </Card>
          </div>

          {/* Carousel Tabs */}
          <div className="sales-carousel">
            {reports.map((name, idx) => (
              <button
                key={idx}
                className={`sales-carousel-btn ${activeReport === idx ? 'active' : ''}`}
                onClick={() => setActiveReport(idx)}
              >
                {name}
              </button>
            ))}
          </div>

          {/* Report Content */}
          {activeReport === 0 && (
            <Card style={{ marginTop: 12, padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>Sales Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '14px' }}>
                <div><strong>Period:</strong></div>
                <div>{range.start.toLocaleDateString()} - {range.end.toLocaleDateString()}</div>
                <div><strong>Total Orders:</strong></div>
                <div>{summaryStats.totalOrders}</div>
                <div><strong>Total Revenue:</strong></div>
                <div>{formatCurrency(summaryStats.totalRevenue)}</div>
                <div><strong>Avg Order:</strong></div>
                <div>{formatCurrency(summaryStats.avgOrderValue)}</div>
                <div><strong>Total Tax:</strong></div>
                <div>{formatCurrency(summaryStats.totalTax)}</div>
              </div>
            </Card>
          )}

          {activeReport === 1 && (
            <Card style={{ marginTop: 12, padding: 12 }}>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Item-wise Sales</h3>
                {menuCategories.length > 0 && (
                  <select
                    className="sales-category-select"
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                  >
                    <option value="">All Categories</option>
                    {menuCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                )}
              </div>
              <div className="sales-table-wrapper">
                <Table
                  columns={[
                    { header: 'Item', accessor: 'item_name' },
                    { header: 'Qty', accessor: 'quantity_sold' },
                    { header: 'Revenue', accessor: 'revenue', cell: (r) => formatCurrency(r.revenue) }
                  ]}
                  data={salesData}
                />
              </div>
            </Card>
          )}

          {activeReport === 2 && (
            <Card style={{ marginTop: 12, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Payment Methods</h3>
              <div className="sales-table-wrapper">
                <Table
                  columns={[
                    { header: 'Method', accessor: 'payment_method' },
                    { header: 'Orders', accessor: 'order_count' },
                    { header: 'Amount', accessor: 'total_amount', cell: (r) => formatCurrency(r.total_amount) },
                    { header: '%', accessor: 'percentage', cell: (r) => formatPercent(r.percentage) }
                  ]}
                  data={paymentBreakdown}
                />
              </div>
            </Card>
          )}

          {activeReport === 3 && (
            <Card style={{ marginTop: 12, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Order Types</h3>
              <div className="sales-table-wrapper">
                <Table
                  columns={[
                    { header: 'Type', accessor: 'order_type' },
                    { header: 'Orders', accessor: 'order_count' },
                    { header: 'Amount', accessor: 'total_amount', cell: (r) => formatCurrency(r.total_amount) },
                    { header: '%', accessor: 'percentage', cell: (r) => formatPercent(r.percentage) }
                  ]}
                  data={orderTypeBreakdown}
                />
              </div>
            </Card>
          )}

          {activeReport === 4 && (
            <Card style={{ marginTop: 12, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>GST Tax Report</h3>
              <div className="sales-table-wrapper">
                <Table
                  columns={[
                    { header: 'Tax Type', accessor: 'tax_type' },
                    { header: 'Amount', accessor: 'amount', cell: (r) => formatCurrency(r.amount) }
                  ]}
                  data={taxBreakdown}
                />
              </div>
            </Card>
          )}

          {activeReport === 5 && (
            <Card style={{ marginTop: 12, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Hourly Sales</h3>
              <div className="sales-table-wrapper">
                <Table
                  columns={[
                    { header: 'Hour', accessor: 'hour' },
                    { header: 'Orders', accessor: 'order_count' },
                    { header: 'Amount', accessor: 'total_amount', cell: (r) => formatCurrency(r.total_amount) }
                  ]}
                  data={hourlyBreakdown}
                />
              </div>
            </Card>
          )}

          {activeReport === 6 && (
            <Card style={{ marginTop: 12, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Categories</h3>
              <div className="sales-table-wrapper">
                <Table
                  columns={[
                    { header: 'Category', accessor: 'category' },
                    { header: 'Amount', accessor: 'total_amount', cell: (r) => formatCurrency(r.total_amount) },
                    { header: '%', accessor: 'percentage', cell: (r) => formatPercent(r.percentage) }
                  ]}
                  data={categoryBreakdown}
                />
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
