// pages/owner/credit-sales-report.js
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import { getSupabase } from '../../services/supabase'
import { istSpanUtcISO } from '../../utils/istTime';
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DateRangePicker from '../../components/ui/DateRangePicker'
import { FaMoneyBillWave, FaHandHoldingUsd, FaExclamationTriangle, FaUserFriends, FaFileInvoiceDollar, FaExchangeAlt, FaClipboardList, FaTimes } from 'react-icons/fa'

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
  const [expandedOrderId, setExpandedOrderId] = useState(null)
  const [viewMode, setViewMode] = useState('orders'); // 'orders' | 'customers'
  const [ordersPage, setOrdersPage] = useState(1);
  const [txnsPage, setTxnsPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [expandedCustomerId, setExpandedCustomerId] = useState(null)
  const customersIndex = useMemo(() => {
  const m = new Map();
  (reportData?.customersNow || []).forEach(c => m.set(c.id, c));
  return m;
  return m;
}, [reportData?.customersNow]);

const [selectedOrder, setSelectedOrder] = useState(null);
const [loadingItems, setLoadingItems] = useState(false);

const handleViewOrder = async (order) => {
  let items = [];
  try {
    if (order.items) {
      items = Array.isArray(order.items) ? order.items : JSON.parse(order.items);
    }
  } catch (e) { console.error('Parse error:', e); }

  setSelectedOrder({ ...order, items: items.map(it => ({ ...it, name: it.name || it.item_name || 'Item' })) })
  
  if (items.length > 0) return;

  setLoadingItems(true);
  try {
    const { data: dbItems, error: dbError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', order.id)
    
    if (dbError) throw dbError
    
    if (dbItems && dbItems.length > 0) {
      const formatted = dbItems.map(it => ({
        ...it,
        name: (it.item_name || 'Item') + (it.variant_name ? ` (${it.variant_name})` : ''),
        price: it.price || 0,
        quantity: it.quantity || 1
      }))
      setSelectedOrder(prev => ({ ...prev, items: formatted }))
    }
  } catch (err) {
    console.error('handleViewOrder error:', err);
  } finally {
    setLoadingItems(false);
  }
}

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

// Build per-customer rollups for the selected period
const customerTiles = useMemo(() => {
  if (!reportData) return [];
  const map = new Map();

  // Orders contribute to "extended"
  (reportData.orders || []).forEach(o => {
    if (!o.credit_customer_id) return;
    const acc = map.get(o.credit_customer_id) || {
      id: o.credit_customer_id,
      name: o.customer_name,
      phone: o.customer_phone,
      orders: 0,
      extended: 0,
      payments: 0,
    };
    acc.orders += 1;
    acc.extended += Number(o.total_inc_tax || o.total_amount || 0);
    map.set(o.credit_customer_id, acc);
  });

  // Transactions contribute payments and adjustments/credits
  (reportData.transactions || []).forEach(t => {
    if (!t.credit_customer_id) return;
    const snap = customersIndex.get(t.credit_customer_id);
    const acc = map.get(t.credit_customer_id) || {
      id: t.credit_customer_id,
      name: snap?.name,
      phone: snap?.phone,
      orders: 0,
      extended: 0,
      payments: 0,
    };
    if (t.transaction_type === 'payment') acc.payments += Number(t.amount || 0);
    if (t.transaction_type === 'adjustment' || t.transaction_type === 'credit') {
      acc.extended += Number(t.amount || 0);
    }
    map.set(t.credit_customer_id, acc);
  });

  return Array.from(map.values()).map(x => ({ ...x, outstanding: x.extended - x.payments }));
}, [reportData, customersIndex]);


  useEffect(() => {
    if (checking || restLoading || !restaurantId) return
    loadReport()
  }, [startDate, endDate, restaurantId, checking, restLoading])

  const loadReport = async () => {
  setLoading(true);
  setError('');
  try {
    const { startUtc, endUtc } = istSpanUtcISO(startDate, endDate);
    const { data: orders, error: ordersErr } = await supabase
      .from('v_credit_orders_effective')
      .select('id, credit_customer_id, customer_name, customer_phone, total_amount, total_tax, total_inc_tax, created_at, status')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startUtc)
      .lt('created_at', endUtc)
      .order('created_at', { ascending: false });
    if (ordersErr) throw ordersErr;

    // 2) All ledger movements in range (source of truth for totals)
    const { data: txns, error: txnErr } = await supabase
      .from('credit_transactions')
      .select('id, credit_customer_id, transaction_type, amount, payment_method, description, transaction_date, order_id, notes')
      .eq('restaurant_id', restaurantId)
      .gte('transaction_date', startUtc)
      .lt('transaction_date', endUtc)
      .order('transaction_date', { ascending: false });
    if (txnErr) throw txnErr;

    // 3) Current customer snapshot from the same ledger view (for names/balances on summaries)
    const { data: customersNow, error: snapErr } = await supabase
      .from('v_credit_customer_ledger')
      .select('id, name, phone, status, total_extended_calc, current_balance_calc')
      .eq('restaurant_id', restaurantId);
    if (snapErr) throw snapErr;

    // Period totals (ledger-consistent)
    const periodExtended = (txns || [])
      .filter(t => t.transaction_type === 'credit' || t.transaction_type === 'adjustment')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const periodPayments = (txns || [])
      .filter(t => t.transaction_type === 'payment')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const outstanding = periodExtended - periodPayments;

    // Unique customers by id from either orders or transactions
    const idsFromOrders = new Set((orders || []).map(o => o.credit_customer_id).filter(Boolean));
    (txns || []).forEach(t => { if (t.credit_customer_id) idsFromOrders.add(t.credit_customer_id); });

    setReportData({
      orders: orders || [],
      transactions: txns || [],
      customersNow: customersNow || [],
      summary: {
        totalExtended: periodExtended,
        totalPayments: periodPayments,
        outstanding,
        ordersCount: (orders || []).length,
        uniqueCustomers: idsFromOrders.size
      }
    });
  } catch (err) {
    setError(err.message || 'Failed to load report');
  } finally {
    setLoading(false);
  }
};


  if (checking || restLoading) return <div style={{ padding: 24 }}>Loading…</div>
  if (!restaurantId) return <div style={{ padding: 24 }}>No restaurant</div>

  return (
  <div className="container page cr-page">
    <div className="page-header">
      <div>
        <h1 className="cr-title">Credit Sales Report</h1>
        <p className="subtitle">Track credit orders and customer balances</p>
      </div>
      <div className="time-filters" style={{ marginTop: '12px', width: '100%' }}>
        <DateRangePicker 
          start={new Date(startDate)} 
          end={new Date(endDate)} 
          onChange={({start, end}) => {
            setStartDate(start.toISOString().split('T')[0]);
            setEndDate(end.toISOString().split('T')[0]);
          }} 
        />
      </div>
    </div>

    {error && <div className="cr-error">{error}</div>}

    {loading ? (
      <div className="cr-loading">Loading...</div>
    ) : reportData ? (
      <>
        {/* Summary */}
        <div className="cr-summary-grid">
          <div className="summary-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="kpi-label">Credit Extended</span>
                  <span className="kpi-value">₹{Number(reportData?.summary?.totalExtended ?? 0).toFixed(2)}</span>
               </div>
               <div className="kpi-icon"><FaExchangeAlt /></div>
            </div>
          </div>

          <div className="summary-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="kpi-label">Payments Received</span>
                  <span className="kpi-value" style={{ color: '#16a34a' }}>₹{Number(reportData?.summary?.totalPayments ?? 0).toFixed(2)}</span>
               </div>
               <div className="kpi-icon"><FaMoneyBillWave /></div>
            </div>
          </div>

          <div className="summary-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="kpi-label">Outstanding</span>
                  <span className="kpi-value" style={{ color: '#dc2626' }}>₹{Number(reportData?.summary?.outstanding ?? 0).toFixed(2)}</span>
               </div>
               <div className="kpi-icon" style={{ color: '#fee2e2' }}><FaExclamationTriangle /></div>
            </div>
          </div>

          <div className="summary-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="kpi-label">Orders / Customer</span>
                  <span className="kpi-value">{reportData?.summary?.ordersCount ?? 0} / {reportData?.summary?.uniqueCustomers ?? 0}</span>
               </div>
               <div className="kpi-icon"><FaUserFriends /></div>
            </div>
          </div>
        </div>
{/* Mobile segmented control (render once) */}
<div className="cr-seg only-mobile">
  <button
    className={viewMode === 'orders' ? 'active' : ''}
    onClick={() => setViewMode('orders')}
  >
    Orders
  </button>
  <button
    className={viewMode === 'customers' ? 'active' : ''}
    onClick={() => setViewMode('customers')}
  >
    Customers
  </button>
</div>


{/* Mobile tiles (single conditional, wrapped by one parent) */}
{viewMode === 'orders' ? (
  <div className="cr-tiles only-mobile">
    {reportData.orders.length === 0 ? (
      <div className="cr-empty">No credit orders in this period</div>
    ) : (
      reportData.orders.map((o) => (
        <div
          key={o.id}
          className="cr-tile"
          onClick={() => setExpandedOrderId(expandedOrderId === o.id ? null : o.id)}
        >
          <div className="cr-tile-head">
            <div>
              <div className="cr-tile-title">#{o.id.substring(0, 8)}</div>
              <div className="cr-tile-sub">{formatDisplayDate(o.created_at)}</div>
            </div>
            <span className={`cr-badge ${o.status === 'completed' ? 'cr-badge-success' : 'cr-badge-warn'}`}>
              {o.status}
            </span>
          </div>

          <div className="cr-tile-row">
            <div>
              <div className="cr-label">Customer</div>
              <div className="cr-strong">{o.customer_name || 'N/A'}</div>
            </div>
            <div>
              <div className="cr-label">Phone</div>
              <div className="cr-strong">{o.customer_phone || 'N/A'}</div>
            </div>
          </div>

          <div className="cr-tile-row">
            <div><div className="cr-label">Amount</div><div className="cr-num">₹{Number(o.total_amount || 0).toFixed(2)}</div></div>
            <div><div className="cr-label">Tax</div><div className="cr-num">₹{Number(o.total_tax || 0).toFixed(2)}</div></div>
            <div><div className="cr-label">Total</div><div className="cr-num cr-strong">₹{Number(o.total_inc_tax || 0).toFixed(2)}</div></div>
          </div>

          {expandedOrderId === o.id && (
            <div className="cr-tile-details">
              <div className="cr-detail"><span className="cr-dl">Order ID</span><span className="cr-dv">{o.id}</span></div>
              <div className="cr-detail"><span className="cr-dl">Status</span><span className="cr-dv">{o.status}</span></div>
            </div>
          )}
        </div>
      ))
    )}
  </div>
) : (
  <div className="cr-tiles only-mobile">
    {customerTiles.length === 0 ? (
      <div className="cr-empty">No customers in this period</div>
    ) : (
      customerTiles.map((c) => (
        <div
          key={c.id}
          className="cr-tile"
          onClick={() => setExpandedCustomerId(expandedCustomerId === c.id ? null : c.id)}
        >
          <div className="cr-tile-head">
            <div>
              <div className="cr-tile-title">{c.name || 'Unknown'}</div>
              <div className="cr-tile-sub">{c.phone || 'N/A'}</div>
            </div>
            <div className="cr-tile-kpi">
              <div className="cr-label">Outstanding</div>
              <div className="cr-num cr-strong" style={{ color: '#dc2626' }}>
                ₹{Number(c.outstanding || 0).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="cr-tile-row">
            <div><div className="cr-label">Extended</div><div className="cr-num">₹{Number(c.extended || 0).toFixed(2)}</div></div>
            <div><div className="cr-label">Payments</div><div className="cr-num">₹{Number(c.payments || 0).toFixed(2)}</div></div>
            <div><div className="cr-label">Orders</div><div className="cr-num">{c.orders}</div></div>
          </div>

          {expandedCustomerId === c.id && (
            <div className="cr-tile-details">
              <div className="cr-detail"><span className="cr-dl">Customer ID</span><span className="cr-dv">{c.id}</span></div>
              <div className="cr-detail"><span className="cr-dl">Snapshot</span><span className="cr-dv">{(customersIndex.get(c.id)?.status) || 'active'}</span></div>
            </div>
          )}
        </div>
      ))
    )}
  </div>
)}



        {/* Credit Orders */}
        
        {/* Tablet/desktop table */}
        <div className="cr-table-wrap hide-mobile">
          <table className="cr-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Phone</th>
                <th className="cr-right">Amount</th>
                <th className="cr-right">Tax</th>
                <th className="cr-right">Total</th>
                <th>Date</th>
                <th className="cr-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {reportData.orders.length === 0 ? (
                <tr><td colSpan={8} className="cr-empty">No credit orders in this period</td></tr>
              ) : (
                reportData.orders.slice((ordersPage - 1) * ITEMS_PER_PAGE, ordersPage * ITEMS_PER_PAGE).map((order, idx) => (
                  <tr 
                    key={order.id} 
                    className={idx % 2 ? 'cr-row-alt' : ''}
                    onClick={() => handleViewOrder(order)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td><strong style={{ color: '#111827' }}>#{order.id.substring(0, 8)}</strong></td>
                    <td>{order.customer_name || 'N/A'}</td>
                    <td>{order.customer_phone || 'N/A'}</td>
                    <td className="cr-right">₹{Number(order.total_amount || 0).toFixed(2)}</td>
                    <td className="cr-right">₹{Number(order.total_tax || 0).toFixed(2)}</td>
                    <td className="cr-right cr-strong">₹{Number(order.total_inc_tax || 0).toFixed(2)}</td>
                    <td>{formatDisplayDate(order.created_at)}</td>
                    <td className="cr-center">
                      <span className={`cr-badge ${order.status === 'completed' ? 'cr-badge-success' : 'cr-badge-warn'}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Payment Transactions */}
        {reportData.transactions.length > 0 && (
          <>
            <h2 className="cr-section-title">Payment Transactions</h2>

            {/* Mobile tiles for transactions */}
<div className="only-mobile cr-tiles">
  {reportData.transactions.length === 0 ? (
    <div className="cr-empty">No transactions in this period</div>
  ) : (
    reportData.transactions.map((t) => (
      <div key={t.id} className="cr-tile">
        <div className="cr-tile-head">
          <div>
            <div className="cr-tile-title">{formatDisplayDate(t.transaction_date)}</div>
            <div className="cr-tile-sub">{t.payment_method || 'N/A'}</div>
          </div>
          <span
            className={`cr-badge ${t.transaction_type === 'payment' ? 'cr-badge-success' : 'cr-badge-danger'}`}
          >
            {t.transaction_type}
          </span>
        </div>

        <div className="cr-tile-row">
          <div>
            <div className="cr-label">Amount</div>
            <div className="cr-num cr-strong">₹{Number(t.amount || 0).toFixed(2)}</div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="cr-label">Description</div>
            <div className="cr-strong">{t.description}</div>
          </div>
        </div>
      </div>
    ))
  )}
</div>


            
            {/* Tablet/desktop table */}
            <div className="cr-table-wrap hide-mobile">
              <table className="cr-table">
                <thead>
                  <tr>
                    <th>Transaction Date</th>
                    <th>Type</th>
                    <th>Payment Method</th>
                    <th className="cr-right">Amount</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.transactions.slice((txnsPage - 1) * ITEMS_PER_PAGE, txnsPage * ITEMS_PER_PAGE).map((txn, idx) => (
                    <tr key={txn.id} className={idx % 2 ? 'cr-row-alt' : ''}>
                      <td><strong style={{ color: '#111827' }}>{formatDisplayDate(txn.transaction_date)}</strong></td>
                      <td>
                        <span className={`cr-badge ${txn.transaction_type === 'payment' ? 'cr-badge-success' : 'cr-badge-danger'}`}>
                          {txn.transaction_type}
                        </span>
                      </td>
                      <td>{txn.payment_method || 'N/A'}</td>
                      <td className="cr-right cr-strong">₹{Number(txn.amount || 0).toFixed(2)}</td>
                      <td className="cr-wrap">{txn.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
    ) : null}

    {/* Order Details Modal */}
    {selectedOrder && (
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedOrder(null)}>
        <div className="modal-panel">
           <div className="modal-header">
              <h3>Order Details #{String(selectedOrder.id).substring(0,8)}</h3>
              <button className="close-x" onClick={() => setSelectedOrder(null)}><FaTimes /></button>
           </div>
           <div className="modal-body">
              <div style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                 <div>
                    <div className="detail-label">Time Ordered</div>
                    <div className="detail-val">{new Date(selectedOrder.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                 </div>
                 <div style={{ textAlign: 'right' }}>
                    <div className="detail-label">Order Status</div>
                    <div className="detail-val" style={{ color: '#ea580c', textTransform: 'uppercase' }}>{selectedOrder.status}</div>
                 </div>
              </div>

              <div className="order-items-sec">
                 <div className="detail-label" style={{ marginBottom: 12, borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>Order Items</div>
                 
                 {loadingItems ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 13 }}>
                      Fetching items...
                    </div>
                 ) : (selectedOrder.items || []).length > 0 ? (
                    selectedOrder.items.map((it, i) => {
                       const unitInc = it.unit_price_inc_tax ?? it.price;
                       const itemTotal = unitInc * it.quantity;

                       return (
                         <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
                             <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{it.name}</div>
                                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                   ₹{Number(unitInc).toFixed(2)} × {it.quantity}
                                </div>
                             </div>
                             <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                                ₹{Number(itemTotal).toFixed(2)}
                             </div>
                         </div>
                       );
                    })
                 ) : (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13, fontStyle: 'italic' }}>
                      No items found
                    </div>
                 )}
              </div>

              <div style={{ marginTop: 24, padding: 16, background: '#fff7ed', borderRadius: 12, border: '1px solid #ffedd5' }}>
                 {Number(selectedOrder.total_tax || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                       <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>Tax Amount</span>
                       <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>₹{Number(selectedOrder.total_tax || 0).toFixed(2)}</span>
                    </div>
                 )}
                 <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: Number(selectedOrder.total_tax || 0) > 0 ? 12 : 0, borderTop: Number(selectedOrder.total_tax || 0) > 0 ? '1px dashed #fdba74' : 'none' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>Total Amount</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#ea580c' }}>
                      ₹{Number(selectedOrder.total_inc_tax || selectedOrder.total_amount || 0).toFixed(2)}
                    </span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    )}

    <style jsx>{`
      .page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
      .page-header h1 { margin: 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.01em; color: #111827; }
      .subtitle { color: #6b7280; font-size: 0.95rem; margin-top: 4px; }
      .time-filters { display: flex; gap: 8px; flex-wrap: wrap; }

      .cr-summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
        margin-bottom: 32px;
      }

      /* Standard Dashboard Card Style */
      .summary-card {
        background: white;
        padding: 16px 20px;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        border-top: 4px solid #f97316;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        transition: all 0.2s ease-out;
        position: relative;
        overflow: hidden;
      }
      .summary-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        border-color: #fb923c;
      }

      .kpi-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.05em; }
      .kpi-value { font-size: 1.5rem; font-weight: 800; color: #1f2937; letter-spacing: -0.02em; }
      .kpi-icon { font-size: 1.5rem; color: #fed7aa; }

      .cr-section-title { margin: 32px 0 16px; font-size: 1.25rem; font-weight: 700; color: #1f2937; }
      
      .cr-table-wrap {
        background: white;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        overflow-x: auto;
        margin-bottom: 24px;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
      }
      .cr-table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: 800px; }
      .cr-table th { 
        background: #fafafa !important;
        padding: 16px; 
        text-align: left; 
        font-size: 11px; 
        text-transform: uppercase; 
        color: #1f2937 !important; 
        font-weight: 700; 
        border-bottom: 2px solid #f97316 !important; 
        letter-spacing: 0.5px;
        white-space: nowrap;
        position: sticky; top: 0; z-index: 10;
      }
      .cr-table td { 
          padding: 16px; 
          border-bottom: 1px solid #f3f4f6; 
          font-size: 14px; 
          color: #374151; 
          transition: all 0.2s ease; 
          white-space: nowrap;
          vertical-align: middle;
      }
      .cr-table tbody tr { transition: all 0.2s ease; }
      .cr-table tbody tr:hover { 
        background: linear-gradient(to right, #fff7ed 0%, #ffffff 100%);
      }
      .cr-row-alt { background: #fafafa; }
      .cr-right { text-align: right; }
      .cr-center { text-align: center; }
      .cr-table th.cr-right { text-align: right !important; }
      .cr-table th.cr-center { text-align: center !important; }
      .cr-wrap { white-space: normal !important; max-width: 300px; }
      .cr-strong { font-weight: 700; color: #111827; }

      @media (max-width: 640px) {
        .page-header { flex-direction: column; gap: 16px; }
        .cr-summary-grid { grid-template-columns: 1fr; }
        .hide-mobile { display: none !important; }
        .only-mobile { display: block !important; }
      }
      @media (min-width: 641px) {
        .only-mobile { display: none !important; }
      }

      .cr-seg {
        display: flex;
        background: #f1f5f9;
        padding: 4px;
        border-radius: 12px;
        margin-bottom: 20px;
        border: 1px solid #e2e8f0;
      }
      .cr-seg button {
        flex: 1;
        padding: 10px;
        border: none;
        background: transparent;
        color: #64748b;
        font-weight: 700;
        font-size: 13px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.025em;
      }
      .cr-seg button.active {
        background: white;
        color: #f97316;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      }

      .cr-tiles { display: flex; flexDirection: column; gap: 12px; margin-bottom: 30px; }
      .cr-tile { 
        background: white; 
        border: 1px solid #e5e7eb; 
        border-radius: 12px; 
        padding: 16px; 
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }
      .cr-tile-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
      .cr-tile-title { font-weight: 800; color: #111827; font-size: 15px; }
      .cr-tile-sub { font-size: 12px; color: #6b7280; }
      .cr-tile-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #f1f5f9; }
      .cr-label { font-size: 10px; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin-bottom: 2px; }
      .cr-num { font-size: 13px; color: #334155; font-weight: 600; }
      .cr-badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
      .cr-badge-success { background: #f0fdf4; color: #16a34a; }
      .cr-badge-warn { background: #fffbeb; color: #d97706; }
      .cr-badge-danger { background: #fef2f2; color: #dc2626; }
      .cr-empty { text-align: center; padding: 40px 20px; color: #94a3b8; font-size: 14px; background: #f8fafc; border-radius: 12px; border: 2px dashed #e2e8f0; }
      
      /* Modal Styles */
      .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.2s ease; }
      .modal-panel { background: white; border-radius: 16px; width: 92%; max-width: 460px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      .modal-header { padding: 20px 24px; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center; }
      .modal-header h3 { margin: 0; font-size: 1.15rem; font-weight: 700; color: #111827; }
      .close-x { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 4px; transition: color 0.2s; font-size: 1.2rem; display: flex; align-items: center; }
      .close-x:hover { color: #ea580c; }
      .modal-body { padding: 24px; max-height: 75vh; overflow-y: auto; }
      
      .detail-label { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.05em; }
      .detail-val { font-size: 14px; font-weight: 600; color: #111827; }

      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    `}</style>
  </div>
);

}