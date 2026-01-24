//pages/owner/sales

import React, { useEffect, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import Link from 'next/link'
import Card from '../../components/ui/Card'
import Table from '../../components/ui/Table'
import DateRangePicker from '../../components/ui/DateRangePicker'
import Button from '../../components/ui/Button'
import NiceSelect from '../../components/NiceSelect'
import { getSupabase } from '../../services/supabase'
import { FaCalendarAlt, FaReceipt, FaMoneyBillWave, FaPercentage, FaShoppingBag } from 'react-icons/fa'
import { printSalesReport } from '../../utils/printSalesReport'
import { exportSalesReportToCSV, exportSalesReportToExcel } from '../../utils/exportSalesReport'
import { istSpanFromDatesUtcISO } from '../../utils/istTime';

const BRAND = {
  orange: '#f97316',
  white: '#ffffff',
  slate: '#f8fafc',
  gray: '#64748b',
  border: '#e2e8f0'
};

function computeOrderTotalDisplay(order) {
  const toNum = (v) => (v == null ? null : Number(v));
  const b = toNum(order?.total_amount);
  if (Number.isFinite(b) && b > 0) return b;
  const a = toNum(order?.total_inc_tax);
  if (Number.isFinite(a) && a > 0) return a;
  const c = toNum(order?.total);
  if (Number.isFinite(c) && c > 0) return c;
  return 0;
}

function toDisplayItems(order) {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map((item) => ({
      ...item,
      menu_item_id: item.menu_item_id || item.id,
    }));
  }
  if (Array.isArray(order.order_items)) {
    return order.order_items.map((oi) => ({
      menu_item_id: oi.menu_item_id,
      name: oi.item_name || oi.menu_items?.name || 'Item',
      quantity: oi.quantity,
      price: oi.price,
      is_packaged_good: oi.is_packaged_good,
      variant_id: oi.variant_option_id || null,
      variant_name: oi.variant_name || null,
      line_discount_amount: oi.line_discount_amount,
      order_discount_share: oi.order_discount_share,
      discount_amount: oi.discount_amount,
    }));
  }
  return [];
}

function getOrderTypeLabel(order) {
  if (!order) return '';
  if (order.table_number && order.table_number !== null) {
     return `Table ${order.table_number}`;
  }
  if (order.order_type === 'parcel') return 'Parcel';
  return '';
}

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
  const [allSalesData, setAllSalesData] = useState([])
  const [summaryStats, setSummaryStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    totalItems: 0,
    avgOrderValue: 0,
    totalTax: 0,
    cgst: 0,
    sgst: 0
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
  const [ordersList, setOrdersList] = useState([])
  const [itemsModalOrder, setItemsModalOrder] = useState(null)
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 15

  const reports = ['Summary', 'Orders', 'Item-wise', 'Payment Methods', 'Order Types', 'Tax Report', 'Hourly Sales', 'Categories']

  useEffect(() => {
    if (!restaurantId || !supabase) return
    
    const fetchData = async () => {
    // Fetch restaurant data from 'restaurants' table
    const { data: restaurantData } = await supabase
      .from('restaurants')
      .select('name')
      .eq('id', restaurantId)
      .single()
    
    if (restaurantData) {
      setRestaurantProfile(prev => ({
        ...prev,
        restaurant_name: restaurantData.name
      }))
    }

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
  }, [checking, restLoading, restaurantId, range, supabase])

  useEffect(() => {
    if (!selectedCategory) {
      setSalesData(allSalesData)
    } else {
      const filtered = allSalesData.filter(item => item.category === selectedCategory)
      setSalesData(filtered)
    }
  }, [selectedCategory, allSalesData])

  const loadAllReportsData = async () => {
    if (!supabase) return
    setLoading(true)
    setError('')
    try {
      const { data: menuItems, error: menuErr } = await supabase
        .from('menu_items')
        .select('id, name, category')
        .eq('restaurant_id', restaurantId)

      if (menuErr) throw menuErr

      const itemCategoryMap = {}
      if (Array.isArray(menuItems)) {
        menuItems.forEach(item => {
          itemCategoryMap[item.name] = item.category || 'Uncategorized'
        })
      }
   
      const { startUtc, endUtc } = istSpanFromDatesUtcISO(range.start, range.end)
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          total_amount,
          total_inc_tax,
          total_tax,
          created_at,
          updated_at,
          status,
          customer_name,
          items,
          payment_method,
          mixed_payment_details,
          order_type,
          table_number,
          date_ordered,
          discount_amount,
          round_off_amount,
          prices_include_tax
        `)
        .eq('restaurant_id', restaurantId)
        .gte('date_ordered', startUtc)
        .lte('date_ordered', endUtc)
        .neq('status', 'cancelled')

      if (ordersError) throw ordersError
      const orderData = Array.isArray(orders) ? orders : []
      // Sort orders by date_ordered desc initially if not already
      orderData.sort((a,b) => new Date(b.date_ordered || b.created_at) - new Date(a.date_ordered || a.created_at))
      setOrdersList(orderData)
      setCurrentPage(1) // Reset to page 1 on new data

      let totalOrders = orderData.length
      let totalRevenue = 0
      let totalTax = 0
      let totalQuantity = 0
      const itemCounts = {}
      const itemRevenue = {}
      const categoryMap = {}

      orderData.forEach(o => {
        const revenue = Number(o.total_inc_tax ?? o.total_amount ?? 0)
        const tax = Number(o.total_tax ?? 0)
        totalRevenue += revenue
        totalTax += tax

        if (Array.isArray(o.items)) {
          o.items.forEach(item => {
            const name = item.name || 'Unknown Item'
            const itemCategory = itemCategoryMap[name] || item.category || 'Uncategorized'
            const quantity = Number(item.quantity) || 1
            const price = Number(item.price) || 0
            const itemTotal = quantity * price

            itemCounts[name] = (itemCounts[name] || 0) + quantity
            itemRevenue[name] = (itemRevenue[name] || 0) + itemTotal
            totalQuantity += quantity

            categoryMap[itemCategory] = (categoryMap[itemCategory] || 0) + itemTotal
          })
        }
      })

      const cgst = totalTax / 2
      const sgst = totalTax / 2

      setSummaryStats({
        totalOrders,
        totalRevenue,
        totalItems: totalQuantity,
        avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        totalTax,
        cgst: Math.round(cgst * 100) / 100,
        sgst: Math.round(sgst * 100) / 100
      })

      const itemsArray = Object.entries(itemCounts)
        .map(([name, quantity]) => ({
          item_name: name,
          quantity_sold: quantity,
          revenue: itemRevenue[name] || 0,
          category: itemCategoryMap[name] || 'Uncategorized'
        }))
        .sort((a, b) => b.revenue - a.revenue)
      
      setAllSalesData(itemsArray)
      setSalesData(itemsArray)

      // In loadAllReportsData function, update payment breakdown logic:

const paymentMap = {};
orderData.forEach(o => {
  let method = o.actual_payment_method || o.payment_method || 'unknown';
  const amount = Number(o.total_inc_tax ?? o.total_amount ?? 0);
  
  // Handle mixed payments - show separately
  if (method === 'mixed' && o.mixed_payment_details) {
    const { cash_amount, online_amount, online_method } = o.mixed_payment_details;
    
    // Add cash portion
    const cashKey = 'cash';
    if (!paymentMap[cashKey]) paymentMap[cashKey] = { count: 0, amount: 0 };
    paymentMap[cashKey].count += 1;
    paymentMap[cashKey].amount += Number(cash_amount);
    
    // Add online portion
    const onlineKey = online_method || 'online';
    if (!paymentMap[onlineKey]) paymentMap[onlineKey] = { count: 0, amount: 0 };
    paymentMap[onlineKey].count += 1;
    paymentMap[onlineKey].amount += Number(online_amount);
  } else {
    if (!paymentMap[method]) paymentMap[method] = { count: 0, amount: 0 };
    paymentMap[method].count += 1;
    paymentMap[method].amount += amount;
  }
});

setPaymentBreakdown(Object.entries(paymentMap).map(([method, data]) => ({
  payment_method: method,
  order_count: data.count,
  total_amount: data.amount,
  percentage: totalRevenue > 0 ? ((data.amount / totalRevenue) * 100).toFixed(1) : '0.0'
})));

// Hourly in IST
     const fmtHour = new Intl.DateTimeFormat('en-GB', {
       timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false
     })
     const hourlyMap = {}
     orderData.forEach(o => {
       const key = fmtHour.format(new Date(o.date_ordered || o.created_at)) // "06", "17", etc.
       const amount = Number(o.total_inc_tax ?? o.total_amount ?? 0)
       if (!hourlyMap[key]) hourlyMap[key] = { count: 0, amount: 0 }
       hourlyMap[key].count += 1
       hourlyMap[key].amount += amount
     })
     setHourlyBreakdown(
       Object.keys(hourlyMap).sort().map(h => ({
         hour: `${h}:00`,
         order_count: hourlyMap[h].count,
         total_amount: hourlyMap[h].amount
       }))
     )

      const orderTypeMap = {}
      orderData.forEach(o => {
        let type = o.order_type || 'counter'
        const table = o.table_number ? String(o.table_number).trim() : null
        
        // Logic:
        // 1. If it's parcel/takeaway, keep as is (ignore table if any, usually 0)
        // 2. If it has a VALID table number (and not parcel), categorize as Table X
        // 3. Else fallback to original type (counter/dashboard/etc.)
        
        const isParcel = type.toLowerCase().includes('parcel') || type.toLowerCase().includes('takeaway')

        if (!isParcel && table && table !== '0') {
           type = `Table ${table}`
        } else if (type === 'dashboard') {
           type = 'QR (No Table)'
        }
        
        const amount = Number(o.total_inc_tax ?? o.total_amount ?? 0)
        if (!orderTypeMap[type]) orderTypeMap[type] = { count: 0, amount: 0 }
        orderTypeMap[type].count += 1
        orderTypeMap[type].amount += amount
      })
      
      const typeArray = Object.entries(orderTypeMap).map(([type, data]) => ({
        order_type: type,
        order_count: data.count,
        total_amount: data.amount,
        percentage: totalRevenue > 0 ? ((data.amount / totalRevenue) * 100).toFixed(1) : '0.0'
      }))
      
      // Sort: maybe group Tables together if possible, or just amount desc
      // Let's sort by amount descending
      typeArray.sort((a,b) => b.total_amount - a.total_amount)
      
      setOrderTypeBreakdown(typeArray)

      setTaxBreakdown([
        { tax_type: 'CGST', amount: Math.round(cgst * 100) / 100 },
        { tax_type: 'SGST', amount: Math.round(sgst * 100) / 100 },
        { tax_type: 'Total Tax', amount: Math.round(totalTax * 100) / 100 }
      ])

      
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
    await printSalesReport({
      range,
      summaryStats,
      salesData: allSalesData,
      paymentBreakdown,
      orderTypeBreakdown,
      taxBreakdown,
      hourlyBreakdown,
      categoryBreakdown,
      restaurantProfile
    })
  }

  const handleExportCSV = async () => {
    try {
      await exportSalesReportToCSV({
        range,
        summaryStats,
        salesData: allSalesData,
        paymentBreakdown,
        orderTypeBreakdown,
        taxBreakdown,
        hourlyBreakdown,
        categoryBreakdown,
        restaurantProfile
      })
    } catch (error) {
      console.error('CSV export error:', error)
    }
  }

  const handleExportExcel = async () => {
    try {
      await exportSalesReportToExcel({
        range,
        summaryStats,
        salesData: allSalesData,
        paymentBreakdown,
        orderTypeBreakdown,
        taxBreakdown,
        hourlyBreakdown,
        categoryBreakdown,
        restaurantProfile
      })
    } catch (error) {
      console.error('Excel export error:', error)
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
          <Button onClick={handlePrint} variant="outline" style={{ padding: '8px 16px' }}>Print</Button>
          <Button onClick={handleExportCSV} style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#ea580c', padding: '8px 16px' }}>CSV</Button>
          <Button onClick={handleExportExcel} style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#ea580c', padding: '8px 16px' }}>Excel</Button>
        </div>
      </div>

      {error && <Card style={{ marginBottom: 12, borderColor: '#fecaca', background: '#fff1f2', color: '#b91c1c', padding: 12 }}>{error}</Card>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>Loading reports…</div>
      ) : (
        <>
          {activeReport !== 0 && (
            <div className="sales-totals-grid">
              <div className="sales-kpi">
                <div className="sales-label">Total Orders</div>
                <div className="sales-value">{summaryStats.totalOrders}</div>
              </div>
              <div className="sales-kpi">
                <div className="sales-label">Total Revenue</div>
                <div className="sales-value">{formatCurrency(summaryStats.totalRevenue)}</div>
              </div>
              <div className="sales-kpi">
                <div className="sales-label">Avg Order</div>
                <div className="sales-value">{formatCurrency(summaryStats.avgOrderValue)}</div>
              </div>
              <div className="sales-kpi">
                <div className="sales-label">Items Sold</div>
                <div className="sales-value">{summaryStats.totalItems}</div>
              </div>
              <div className="sales-kpi">
                <div className="sales-label">Total Tax</div>
                <div className="sales-value">{formatCurrency(summaryStats.totalTax)}</div>
              </div>
            </div>
          )}
          <style jsx>{`
            .sales-kpi {
              background: white;
              padding: 16px 24px;
              border-radius: 12px;
              border: 1px solid #e5e7eb;
              border-top: 4px solid #f97316;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
              display: flex;
              flex-direction: column;
              gap: 4px;
              text-align: left;
              transition: transform 0.2s;
            }
            .sales-kpi:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            }
            .sales-label { font-size: 0.75rem; text-transform: uppercase; color: #6b7280; font-weight: 700; letter-spacing: 0.05em; margin: 0; }
            .sales-value { font-size: 1.8rem; font-weight: 800; color: #1f2937; letter-spacing: -0.02em; }
            
            /* Override Global Carousel Button Active Color */
            :global(.sales-carousel-btn.active) {
              background: #f97316 !important;
              border-color: #f97316 !important;
              box-shadow: 0 2px 8px rgba(249, 115, 22, 0.25) !important;
            }
            :global(.sales-totals-grid) {
               gap: 16px; 
            }
            :global(.sales-total-card) {
              display: none; /* Hide old cards if any leak */
            }
            
            /* Dynamic Summary Card Styles */
            .summary-card {
              background: white;
              padding: 16px 20px;
              border-radius: 8px; /* Tighter radius */
              border: 1px solid #e5e7eb;
              border-top: 4px solid #f97316;
              box-shadow: 0 1px 3px rgba(0,0,0,0.05);
              transition: all 0.2s ease-out;
              cursor: default;
              position: relative;
              overflow: hidden;
            }
            .summary-card:hover {
              transform: translateY(-2px);
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
              border-color: #fb923c;
            }
            .summary-card-hero {
              margin-bottom: 24px;
              padding: 24px;
              text-align: center;
              border-top-width: 4px;
            }
          `}</style>


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

          {activeReport === 0 && (
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #f3f4f6', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                 <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1f2937', fontWeight: 700 }}>Sales Summary</h3>
                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#fff7ed', color: '#ea580c', padding: '6px 16px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 600 }}>
                   <FaCalendarAlt style={{ color: '#f97316' }} /> {range.start.toLocaleDateString('en-GB').replace(/\//g, '-')} - {range.end.toLocaleDateString('en-GB').replace(/\//g, '-')}
                 </div>
               </div>
               
               {/* Hero Revenue Card */}
               <div className="summary-card summary-card-hero">
                 <div style={{ fontSize: '0.85rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', fontWeight: 600 }}>Total Revenue</div>
                 <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1f2937', lineHeight: 1 }}>{formatCurrency(summaryStats.totalRevenue)}</div>
               </div>

               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                 
                 {/* Orders */}
                 <div 
                    className="summary-card"
                    onClick={() => setActiveReport(1)}
                    style={{ cursor: 'pointer' }}
                 >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                         <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Orders</span>
                         <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1f2937', letterSpacing: '-0.02em' }}>{summaryStats.totalOrders}</span>
                      </div>
                      <div style={{ fontSize: '1.5rem', color: '#fed7aa' }}><FaReceipt /></div>
                    </div>
                 </div>

                 {/* Avg Order */}
                 <div 
                    className="summary-card"
                    onClick={() => setActiveReport(6)}
                    style={{ cursor: 'pointer' }}
                 >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                         <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Avg Order</span>
                         <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1f2937', letterSpacing: '-0.02em' }}>{formatCurrency(summaryStats.avgOrderValue)}</span>
                      </div>
                      <div style={{ fontSize: '1.5rem', color: '#fed7aa' }}><FaPercentage /></div>
                    </div>
                 </div>

                 {/* Tax */}
                 <div 
                    className="summary-card"
                    onClick={() => setActiveReport(5)}
                    style={{ cursor: 'pointer' }}
                 >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                         <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Tax Collected</span>
                         <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1f2937', letterSpacing: '-0.02em' }}>{formatCurrency(summaryStats.totalTax)}</span>
                      </div>
                      <div style={{ fontSize: '1.5rem', color: '#fed7aa' }}><FaMoneyBillWave /></div>
                    </div>
                 </div>

                 {/* Items */}
                 <div 
                    className="summary-card"
                    onClick={() => setActiveReport(2)}
                    style={{ cursor: 'pointer' }}
                 >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                         <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Items Sold</span>
                         <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1f2937', letterSpacing: '-0.02em' }}>{summaryStats.totalItems}</span>
                      </div>
                      <div style={{ fontSize: '1.5rem', color: '#fed7aa' }}><FaShoppingBag /></div>
                    </div>
                 </div>
               </div>
            </div>
          )}

          {activeReport === 1 && (
            <Card style={{ marginTop: 10, padding: 10 }}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Sales Orders</h3>
              <div className="sales-table-wrapper">
                <Table
                  columns={[
                    { 
                      header: 'Order ID', 
                      accessor: 'id', 
                      cell: (r) => (
                        <span 
                          onClick={() => setItemsModalOrder(r)}
                          style={{ color: '#334155', cursor: 'pointer', fontWeight: 700 }}
                        >
                          #{r.id.slice(0, 8)}
                        </span>
                      )
                    },
                    { 
                      header: 'Ordered Date', 
                      accessor: 'date_ordered', 
                      cell: (r) => new Date(r.date_ordered || r.created_at).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
                      })
                    },
                    { 
                      header: 'Edited Date', 
                      accessor: 'updated_at', 
                      cell: (r) => new Date(r.updated_at).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
                      })
                    },
                    { header: 'Status', accessor: 'status', cell: (r) => (
                      <span style={{ 
                        textTransform: 'capitalize', 
                        color: r.status === 'completed' ? '#10b981' : '#f97316',
                        fontWeight: 600
                      }}>{r.status}</span>
                    )},
                    { header: 'Grand Total', accessor: 'total_inc_tax', cell: (r) => formatCurrency(r.total_inc_tax ?? r.total_amount) },
                    { header: 'Total Tax', accessor: 'total_tax', cell: (r) => formatCurrency(r.total_tax) },
                    { header: 'Customer', accessor: 'customer_name', cell: (r) => r.customer_name || '' }
                  ]}
                  data={ordersList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
                />

                {ordersList.length > itemsPerPage && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 16 }}>
                    <Button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      variant="outline"
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                      Previous
                    </Button>
                    <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>
                      Page {currentPage} of {Math.ceil(ordersList.length / itemsPerPage)}
                    </span>
                    <Button 
                      onClick={() => setCurrentPage(p => Math.min(Math.ceil(ordersList.length / itemsPerPage), p + 1))}
                      disabled={currentPage >= Math.ceil(ordersList.length / itemsPerPage)}
                      variant="outline"
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {activeReport === 2 && (
            <Card style={{ marginTop: 10, padding: 10 }}>
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Item-wise Sales</h3>
                {menuCategories.length > 0 && (
                  <div style={{ width: 200 }}>
                    <NiceSelect
                      options={[
                        { value: '', label: 'All Categories' },
                        ...menuCategories.map(c => ({ value: c, label: c }))
                      ]}
                      value={selectedCategory}
                      onChange={setSelectedCategory}
                      placeholder="All Categories"
                    />
                  </div>
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

          {activeReport === 3 && (
            <Card style={{ marginTop: 10, padding: 10 }}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Payment Methods</h3>
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

          {activeReport === 4 && (
            <Card style={{ marginTop: 10, padding: 10 }}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Order Types</h3>
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

          {activeReport === 5 && (
            <Card style={{ marginTop: 10, padding: 10 }}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>GST Tax Report</h3>
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

          {activeReport === 6 && (
            <Card style={{ marginTop: 10, padding: 10 }}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Hourly Sales</h3>
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

          {activeReport === 7 && (
            <Card style={{ marginTop: 10, padding: 10 }}>
              <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Categories</h3>
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

      {/* Global "Show All Items" Modal */}
    {itemsModalOrder && (
      <div 
        style={{
          position:'fixed', inset: 0,
          background:'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(5px)', 
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:10000,
          padding: 12
        }}
        onClick={(e) => { e.stopPropagation(); setItemsModalOrder(null); }}
      >
        <div 
          style={{
            background:'white', width:'100%', maxWidth:400, borderRadius:12, padding: 24,
            boxShadow:'0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxHeight:'90vh', display:'flex', flexDirection:'column', position: 'relative'
          }}
          onClick={e => e.stopPropagation()}
        >
            {/* Header */}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
              <h3 style={{fontSize: 18, fontWeight: 700, color:'#0f172a', margin:0}}>
                Order Details #{itemsModalOrder.id.slice(0,8)}
              </h3>
              <div 
                onClick={() => setItemsModalOrder(null)}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                style={{
                    cursor:'pointer', color: BRAND.orange, fontSize: 18, fontWeight: 900,
                    lineHeight: 1, transition: 'opacity 0.2s'
                }}
              >X</div>
            </div>

            {/* Meta Info Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>TIME ORDERED</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                  {new Date(itemsModalOrder.created_at).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                  })}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>ORDER STATUS</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.orange, textTransform: 'uppercase' }}>
                  {itemsModalOrder.status}
                </div>
              </div>
            </div>

            {/* Items Header */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', paddingBottom: 8, borderBottom: '1px solid #e2e8f0', marginBottom: 12 }}>
              ORDER ITEMS
            </div>

            {/* Items List */}
            <div style={{ overflowY: 'auto', flex: 1, marginBottom: 20 }}>
              {toDisplayItems(itemsModalOrder).map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{it.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                       ₹{Number(it.price).toFixed(2)} x {it.quantity}
                       {it.variant_name && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>({it.variant_name})</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                      ₹{((it.quantity || 1) * (it.price || 0)).toFixed(2)}
                    </div>
                    {(() => {
                        const lDisc = Number(it.line_discount_amount || 0);
                        const displayDisc = lDisc > 0 ? lDisc : Math.max(0, Number(it.discount_amount || 0) - Number(it.order_discount_share || 0));
                        return displayDisc > 0 ? (
                          <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, marginTop: 2 }}>
                            - ₹{displayDisc.toFixed(2)}
                          </div>
                        ) : null;
                    })()}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary Box */}
            <div style={{ background: '#FFF9F2', borderRadius: 8, padding: 16 }}>
              {Number(itemsModalOrder.total_tax || 0) > 0.01 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#64748b' }}>
                  <span>Tax Amount {itemsModalOrder.prices_include_tax ? '(incl)' : ''}</span>
                  <span style={{ color: '#334155' }}>₹{Number(itemsModalOrder.total_tax || 0).toFixed(2)}</span>
                </div>
              )}

              {Number(itemsModalOrder.discount_amount || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#ef4444' }}>
                  <span>Discount</span>
                  <span>-₹{Number(itemsModalOrder.discount_amount).toFixed(2)}</span>
                </div>
              )}

              {Number(itemsModalOrder.round_off_amount || 0) !== 0 && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  marginBottom: 8, 
                  fontSize: 13, 
                  fontWeight: 600, 
                  color: Number(itemsModalOrder.round_off_amount) > 0 ? '#10b981' : '#ef4444' 
                }}>
                  <span>Round-off</span>
                  <span>{Number(itemsModalOrder.round_off_amount) > 0 ? '+' : ''}₹{Number(itemsModalOrder.round_off_amount).toFixed(2)}</span>
                </div>
              )}
              
              <div style={{ borderTop: '1px dashed #fdba74', margin: '8px 0 12px 0' }}></div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>Total Amount</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: BRAND.orange }}>
                  ₹{computeOrderTotalDisplay(itemsModalOrder).toFixed(2)}
                </span>
              </div>
            </div>
        </div>
      </div>
    )}

    </div>
  )
}
