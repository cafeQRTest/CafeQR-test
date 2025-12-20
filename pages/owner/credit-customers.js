// pages/owner/credit-customers.js
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import { getSupabase } from '../../services/supabase'
import { FaUserFriends, FaExclamationTriangle, FaExchangeAlt, FaSearch, FaWallet, FaBan, FaEye, FaEyeSlash, FaTimes } from 'react-icons/fa'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import NiceSelect from '../../components/NiceSelect'

export default function CreditCustomersPage() {
  const BRAND = {
    orange: '#f97316',
    orange600: '#ea580c',
    black: '#111827',
    border: '#e5e7eb',
    bg: '#ffffff',
    soft: '#fff7ed'
  }

  const supabase = getSupabase()
  const { checking } = useRequireAuth(supabase)
  const { restaurant, loading: restLoading } = useRestaurant()
  const restaurantId = restaurant?.id
  const router = useRouter()

  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [expandedCustomerId, setExpandedCustomerId] = useState(null)
  const [customerOrders, setCustomerOrders] = useState({})
  const [pendingSuspendId, setPendingSuspendId] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
      }),
    []
  )

  useEffect(() => {
    if (checking || restLoading || !restaurantId) return
    loadCustomers()
  }, [checking, restLoading, restaurantId, supabase])

  // pages/owner/credit-customers.js
const loadCustomers = async () => {
  setLoading(true);
  try {
    const { data, error } = await supabase
      .from('v_credit_customer_ledger')
      .select('id, name, phone, status, total_extended_calc, current_balance_calc')
      .eq('restaurant_id', restaurantId)
      .order('name');
    if (error) throw error;
    // normalize to existing prop names the UI expects
    const normalized = (data || []).map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      status: r.status,
      total_credit_extended: Number(r.total_extended_calc || 0),
      current_balance: Number(r.current_balance_calc || 0),
    }));
    setCustomers(normalized);
  } catch (err) {
    setError(err.message || 'Failed to load customers');
  } finally {
    setLoading(false);
  }
};



const loadCustomerOrders = async (customerId) => {
  try {
    const { data: orders, error } = await supabase
      .from('v_credit_orders_effective')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('credit_customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    setCustomerOrders(prev => ({ ...prev, [customerId]: orders || [] }));
  } catch (err) {
    console.error('loadCustomerOrders error:', err);
    setError('Failed to load orders for customer');
  }
};

const handleViewOrder = async (order) => {
  // 1. First, check if the order object itself already has a JSON items array (standard for some views)
  let items = [];
  try {
    if (order.items) {
      items = Array.isArray(order.items) ? order.items : JSON.parse(order.items);
    }
  } catch (e) { console.error('Parse error:', e); }

  // 2. Set initial state so modal opens
  setSelectedOrder({ ...order, items: items.map(it => ({ ...it, name: it.name || it.item_name || 'Item' })) })
  
  if (items.length > 0) return; // If we already have items from JSON, no need to fetch

  setLoading(true)
  try {
    // 3. Fetch from order_items table specifically (without join to avoid join-related RLS/errors)
    const { data: dbItems, error: dbError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', order.id)
    
    if (dbError) throw dbError
    
    if (dbItems && dbItems.length > 0) {
      const formatted = dbItems.map(it => ({
        ...it,
        name: it.item_name || it.variant_name ? `${it.item_name} (${it.variant_name})` : it.item_name || 'Item'
      }))
      setSelectedOrder(prev => ({ ...prev, items: formatted }))
    }
  } catch (err) {
    console.error('handleViewOrder error:', err);
    // Don't show hard error here if modal is already open with partial data
  } finally {
    setLoading(false)
  }
}



  const toggleOrderExpand = (customerId) => {
    if (expandedCustomerId === customerId) {
      setExpandedCustomerId(null)
      return
    }
    setExpandedCustomerId(customerId)
    if (!customerOrders[customerId]) loadCustomerOrders(customerId)
  }

  const handleMakePayment = async () => {
    const amt = Number(paymentAmount || 0)
    if (!amt || amt <= 0) { 
      setError('Payment amount is mandatory and must be greater than 0'); 
      return 
    }
    if (amt > Number(selectedCustomer?.current_balance || 0)) {
      setError('Payment cannot exceed outstanding balance'); return
    }

    setLoading(true)
    try {
      const newBalance = Number(selectedCustomer.current_balance) - amt
      const { error: updateErr } = await supabase
        .from('credit_customers')
        .update({ current_balance: newBalance })
        .eq('id', selectedCustomer.id)
      if (updateErr) throw updateErr

      const { error: txnErr } = await supabase
        .from('credit_transactions')
        .insert({
          restaurant_id: restaurantId,
          credit_customer_id: selectedCustomer.id,
          order_id: null,
          transaction_type: 'payment',
          amount: amt,
          payment_method: paymentMethod,
          description: `Payment received from ${selectedCustomer.name}`,
          transaction_date: new Date().toISOString()
        })
      if (txnErr) throw txnErr

      setSuccess('✅ Payment recorded successfully')
      setShowPaymentModal(false)
      setPaymentAmount('')
      setPaymentMethod('cash')
      await loadCustomers()
    } catch (err) {
      setError('Failed to record payment: ' + (err?.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const handleSuspendCustomer = async (customerId) => {
    setLoading(true)
    try {
      const { error: err } = await supabase
        .from('credit_customers')
        .update({ status: 'suspended' })
        .eq('id', customerId)
      if (err) throw err
      setSuccess('Customer suspended successfully')
      setPendingSuspendId(null)
      await loadCustomers()
    } catch (err) {
      setError('Failed to suspend customer: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = customers.filter(c =>
    (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.phone || '').includes(searchQuery)
  )

  if (checking || restLoading) return <div style={{ padding: 24 }}>Loading…</div>
  if (!restaurantId) return <div style={{ padding: 24 }}>No restaurant</div>

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <h1 className="h1">Credit Customers</h1>
          <p className="subtitle">Manage customer ledger and record payments</p>
        </div>
      </div>

      <div className="cr-summary-grid">
        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
             <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="kpi-label">Active Customers</span>
                <span className="kpi-value">{customers.filter(c => c.status === 'active').length}</span>
             </div>
             <div className="kpi-icon"><FaUserFriends /></div>
          </div>
        </div>

        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
             <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="kpi-label">Total Owed</span>
                <span className="kpi-value" style={{ color: '#dc2626' }}>{fmt.format(customers.reduce((s, c) => s + Number(c.current_balance || 0), 0))}</span>
             </div>
             <div className="kpi-icon" style={{ color: '#fee2e2' }}><FaExclamationTriangle /></div>
          </div>
        </div>

        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
             <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="kpi-label">Total Credit Life</span>
                <span className="kpi-value">{fmt.format(customers.reduce((s, c) => s + Number(c.total_credit_extended || 0), 0))}</span>
             </div>
             <div className="kpi-icon"><FaExchangeAlt /></div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          color: '#b91c1c', marginBottom: 12, padding: 12,
          background: '#fee2e2', border: `1px solid #fecaca`, borderRadius: 10
        }}>{error}</div>
      )}

      {success && (
        <div style={{
          color: '#065f46', marginBottom: 12, padding: 12,
          background: '#d1fae5', border: `1px solid #a7f3d0`, borderRadius: 10
        }}>{success}</div>
      )}

      <div className="search-bar-premium">
        <FaSearch className="search-icon-svg" />
        <input
          type="text"
          placeholder="Search by name or phone…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="search-input-premium"
        />
        {searchQuery && (
          <button className="clear-search-btn-premium" onClick={() => setSearchQuery('')}>✕</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
          No credit customers yet
        </div>
      ) : (
        <>
          {/* Mobile list */}
          <div className="cc-mobile-list">
            {filtered.map(c => (
              <div key={c.id} className="cc-card">
                <div className="cc-row">
                  <div>
                    <div className="cc-name">{c.name}</div>
                    <div className="cc-phone">{c.phone}</div>
                  </div>
                  <span className={`cc-status-badge ${c.status === 'active' ? 'cc-status-active' : 'cc-status-suspended'}`}>
                    {c.status}
                  </span>
                </div>

                <div className="cc-metrics">
                  <div className="cc-metric">
                    <div className="l">Balance</div>
                    <div className="v" style={{ color: Number(c.current_balance) > 0 ? '#dc2626' : '#059669' }}>
                      {fmt.format(Number(c.current_balance || 0))}
                    </div>
                  </div>
                  <div className="cc-metric">
                    <div className="l">Total Extended</div>
                    <div className="v">{fmt.format(Number(c.total_credit_extended || 0))}</div>
                  </div>
                </div>

                <div className="cc-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '0 12px 12px' }}>
                  <Button
                    size="sm"
                    onClick={() => { setSelectedCustomer(c); setShowPaymentModal(true) }}
                    style={{ padding: '8px 4px', fontSize: 13 }}
                  >
                    <FaWallet style={{ marginRight: 4 }} /> Pay
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleOrderExpand(c.id)}
                    style={{ padding: '8px 4px', fontSize: 13 }}
                  >
                    {expandedCustomerId === c.id ? <FaEyeSlash /> : <FaEye />} {expandedCustomerId === c.id ? 'Hide' : 'Orders'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => c.status === 'active' && setPendingSuspendId(c.id)}
                    style={{ padding: '8px 4px', fontSize: 12, color: '#dc2626', borderColor: '#fee2e2' }}
                    disabled={c.status !== 'active'}
                  >
                    <FaBan style={{ marginRight: 4 }} /> Suspend
                  </Button>
                </div>

                 {expandedCustomerId === c.id && (
                  <div className="cc-orders">
                    {customerOrders[c.id]?.length ? (
                      customerOrders[c.id].map(o => (
                        <div 
                          key={o.id} 
                          className="cc-order-row" 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleViewOrder(o);
                          }} 
                          style={{ cursor: 'pointer', padding: '12px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 800, fontSize: 14 }}>#{o.id.substring(0, 8)}</span>
                            <span style={{ fontSize: 12, color: '#6b7280' }}>{formatDisplayDate(o.created_at)}</span>
                          </div>
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontWeight: 800, color: BRAND.orange }}>{fmt.format(Number(o.total_inc_tax || o.total_amount || 0))}</span>
                            <span className="cc-status-badge" style={{
                              padding: '2px 8px',
                              fontSize: 10,
                              background: o.status === 'completed' ? '#ecfdf5' : '#fff7ed',
                              color: o.status === 'completed' ? '#059669' : '#d97706'
                            }}>
                              {o.status}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#6b7280' }}>No credit orders</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="cr-table-wrap table-wrap">
            <table className="cr-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th className="cr-right">Balance</th>
                  <th className="cr-right">Total Ext.</th>
                  <th className="cr-center">Status</th>
                  <th className="cr-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => (
                  <Fragment key={c.id}>
                    <tr style={{ background: idx % 2 ? '#fff' : '#f9fafb' }}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.phone}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: Number(c.current_balance) > 0 ? '#dc2626' : '#059669' }}>
                        {fmt.format(Number(c.current_balance || 0))}
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmt.format(Number(c.total_credit_extended || 0))}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          background: c.status === 'active' ? '#ecfdf5' : '#fef2f2',
                          color: c.status === 'active' ? '#059669' : '#dc2626'
                        }}>
                          {c.status}
                        </span>
                      </td>
                      <td className="cr-center">
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <Button size="sm" onClick={() => { setSelectedCustomer(c); setShowPaymentModal(true) }} style={{ padding: '6px 12px' }}>
                            <FaWallet style={{ marginRight: 6 }} /> Pay
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => toggleOrderExpand(c.id)}>
                            {expandedCustomerId === c.id ? <><FaEyeSlash style={{ marginRight: 6 }} /> Hide Orders</> : <><FaEye style={{ marginRight: 6 }} /> Show Orders</>}
                          </Button>
                          {c.status === 'active' && (
                            <Button size="sm" variant="outline" onClick={() => setPendingSuspendId(c.id)} style={{ color: '#ef4444', borderColor: '#fee2e2' }}>
                              <FaBan style={{ marginRight: 6 }} /> Suspend
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expandedCustomerId === c.id && (
                      <tr>
                        <td colSpan={6} style={{ background: '#fff', padding: 12 }}>
                          <div style={{ marginTop: 8 }}>
                            <h4 style={{ margin: '4px 0 10px 0', color: BRAND.black }}>Credit Orders</h4>
                            {customerOrders[c.id]?.length ? (
                              <div className="table-wrap">
                                <table className="table" style={{ fontSize: 13 }}>
                                  <thead>
                                    <tr style={{ background: '#f9fafb' }}>
                                      <th>Order #</th>
                                      <th>Date</th>
                                      <th style={{ textAlign: 'right' }}>Amount</th>
                                      <th style={{ textAlign: 'right' }}>Tax</th>
                                      <th style={{ textAlign: 'right' }}>Total</th>
                                      <th>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {customerOrders[c.id].map(o => {
                                      const totalIncl = Number(o.total_inc_tax || o.total_amount || 0);
                                      const taxAmt = Number(o.total_tax || 0);
                                      const amtExcl = totalIncl - taxAmt;
                                      return (
                                        <tr key={o.id} onClick={() => handleViewOrder(o)} style={{ cursor: 'pointer' }} className="clickable-order-row">
                                          <td><strong style={{ color: '#111827' }}>#{o.id.substring(0, 8)}</strong></td>
                                          <td>{formatDisplayDate(o.created_at)}</td>
                                          <td style={{ textAlign: 'right' }}>{fmt.format(amtExcl)}</td>
                                          <td style={{ textAlign: 'right' }}>{fmt.format(taxAmt)}</td>
                                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#f97316' }}>{fmt.format(totalIncl)}</td>
                                          <td>
                                            <span style={{
                                              padding: '2px 8px',
                                              borderRadius: 999,
                                              fontSize: 10,
                                              textTransform: 'uppercase',
                                              fontWeight: 800,
                                              background: o.status === 'completed' ? '#dcfce7' : '#fef3c7',
                                              color: o.status === 'completed' ? '#166534' : '#92400e'
                                            }}>
                                              {o.status}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div style={{ color: '#6b7280' }}>No credit orders</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedCustomer && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowPaymentModal(false)}>
          <div className="modal-panel" style={{ maxWidth: 380 }}>
             <div className="modal-header">
                <h3 style={{ fontSize: '1.1rem' }}>Record Payment</h3>
                <button className="close-x" onClick={() => setShowPaymentModal(false)}><FaTimes /></button>
             </div>
             
             <div className="modal-body" style={{ padding: '20px 24px' }}>
                <div style={{ 
                  marginBottom: 20, 
                  padding: '16px', 
                  background: '#fff', 
                  borderRadius: '12px', 
                  border: '1px solid #e5e7eb',
                  borderTop: `4px solid ${BRAND.orange}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                   <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Selected Customer</div>
                   <div style={{ fontWeight: 800, fontSize: 18, color: '#111827' }}>{selectedCustomer.name}</div>
                   <div style={{ fontSize: 14, color: BRAND.orange, fontWeight: 700 }}>
                      Owed: {fmt.format(Number(selectedCustomer.current_balance || 0))}
                   </div>
                </div>

                <div className="form-field">
                  <label style={{ display: 'flex', gap: 4 }}>
                    Amount (₹) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="modal-input"
                    autoFocus
                  />
                </div>

                <div className="form-field" style={{ marginBottom: 8 }}>
                  <label>Payment Method</label>
                  <NiceSelect
                    value={paymentMethod}
                    onChange={setPaymentMethod}
                    options={[
                      { label: 'Cash', value: 'cash' },
                      { label: 'UPI / QR', value: 'upi' },
                      { label: 'Bank Transfer', value: 'bank' },
                      { label: 'Cheque', value: 'cheque' }
                    ]}
                  />
                </div>
             </div>

             <div className="modal-footer" style={{ padding: '12px 24px 20px', background: '#fff' }}>
                <Button 
                  fullWidth 
                  onClick={handleMakePayment} 
                  disabled={loading || !paymentAmount || Number(paymentAmount) <= 0} 
                  style={{ height: 44 }}
                >
                  {loading ? 'Saving...' : 'Save'}
                </Button>
                <Button fullWidth variant="outline" onClick={() => setShowPaymentModal(false)}>
                  Cancel
                </Button>
             </div>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedOrder(null)}>
          <div className="modal-panel" style={{ maxWidth: 480 }}>
             <div className="modal-header">
                <h3>Order Details #{selectedOrder.id.substring(0,8)}</h3>
                <button className="close-x" onClick={() => setSelectedOrder(null)} style={{ color: BRAND.orange, fontSize: '1.2rem' }}><FaTimes /></button>
             </div>
             <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto', padding: '24px' }}>
                <div style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                   <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Time Ordered</div>
                      <div style={{ fontSize: 14, color: '#111827', fontWeight: 600 }}>{new Date(selectedOrder.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Order Status</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: BRAND.orange }}>{selectedOrder.status.toUpperCase()}</div>
                   </div>
                   {selectedOrder.updated_at && (
                     <div style={{ gridColumn: 'span 2', padding: '8px 12px', background: '#f9fafb', borderRadius: 8, borderLeft: `3px solid ${BRAND.orange}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 }}>Last Updated</div>
                        <div style={{ fontSize: 13, color: '#374151' }}>{new Date(selectedOrder.updated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                     </div>
                   )}
                </div>

                <div className="order-items-sec">
                   <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 12, borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>Order Items</div>
                   {(selectedOrder.items || []).length > 0 ? (
                      selectedOrder.items.map((it, i) => (
                         <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
                            <div>
                               <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{it.name}</div>
                               <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>₹{Number(it.price).toFixed(2)} × {it.quantity}</div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>₹{(Number(it.price) * Number(it.quantity)).toFixed(2)}</div>
                         </div>
                      ))
                   ) : (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13, fontStyle: 'italic' }}>
                        {loading ? 'Fetching items...' : 'No items found for this order'}
                      </div>
                   )}
                </div>

                <div style={{ marginTop: 24, padding: 16, background: BRAND.soft, borderRadius: 12, border: '1px solid #ffedd5' }}>
                   {Number(selectedOrder.total_tax || 0) > 0 && (
                     <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                           <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>Amount (Excl. Tax)</span>
                           <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>
                             {fmt.format((Number(selectedOrder.total_inc_tax || 0)) - (Number(selectedOrder.total_tax || 0)))}
                           </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                           <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>Tax Amount</span>
                           <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>{fmt.format(Number(selectedOrder.total_tax || 0))}</span>
                        </div>
                     </>
                   )}
                   <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: Number(selectedOrder.total_tax || 0) > 0 ? 12 : 0, borderTop: Number(selectedOrder.total_tax || 0) > 0 ? '1px dashed #fdba74' : 'none' }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>Total Amount</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: BRAND.orange }}>
                        {fmt.format(Number(selectedOrder.total_inc_tax || selectedOrder.total_amount || 0))}
                      </span>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Suspend */}
      {pendingSuspendId && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setPendingSuspendId(null)}>
          <div className="modal-panel" style={{ maxWidth: 360 }}>
             <div className="modal-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
                <div className="warn-icon"><FaExclamationTriangle /></div>
                <h3 style={{ margin: '16px 0 8px' }}>Suspend Customer?</h3>
                <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.5 }}>
                  This will prevent the customer from making any further credit purchases. You can reactivate them later.
                </p>
             </div>
             <div className="modal-footer" style={{ gap: 12 }}>
                <Button fullWidth variant="outline" onClick={() => setPendingSuspendId(null)}>Cancel</Button>
                <Button fullWidth onClick={() => handleSuspendCustomer(pendingSuspendId)} style={{ background: '#dc2626' }}>
                  {loading ? 'Processing...' : 'Yes, Suspend'}
                </Button>
             </div>
          </div>
        </div>
      )}
      {/* Payment Modal Styling handled by existing modal classes or globals */}
      <style jsx>{`
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .subtitle { color: #6b7280; margin: 4px 0 0 0; }

        .cr-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .summary-card {
          background: white;
          padding: 16px 20px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          border-top: 4px solid #f97316;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          transition: all 0.2s ease-out;
        }
        .summary-card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }

        .kpi-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.05em; }
        .kpi-value { font-size: 1.5rem; font-weight: 800; color: #1f2937; letter-spacing: -0.02em; }
        .kpi-icon { font-size: 1.25rem; color: #fed7aa; }

        .search-bar-premium {
          display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 9999px; background: #ffffff;
          border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); transition: all 0.25s ease; margin-bottom: 24px;
        }
        .search-bar-premium:focus-within { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1); }
        .search-input-premium { border: none; outline: none; width: 100%; font-size: 14px; }

        .cr-table-wrap { background: white; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .cr-table { width: 100%; border-collapse: collapse; }
        .cr-table th { 
          background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%);
          padding: 14px 16px; text-align: left; font-size: 11px; text-transform: uppercase;
          color: #6b7280; font-weight: 700; border-bottom: 2px solid #f97316; letter-spacing: 0.5px;
        }
        .cr-table td { padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #374151; }
        .cr-table tr:hover { background: #fff7ed; }
        .clickable-order-row:hover { background: #fff1f2 !important; }
        .cr-right { text-align: right; }
        .cr-center { text-align: center; }

        /* Modal Styles */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.2s ease; }
        .modal-panel { background: white; border-radius: 16px; width: 92%; maxWidth: 460px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center; }
        .modal-header h3 { margin: 0; font-size: 1.25rem; font-weight: 700; color: #111827; }
        .close-x { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 4px; transition: color 0.2s; }
        .close-x:hover { color: #f97316; }
        .modal-body { padding: 24px; }
        .modal-footer { padding: 16px 24px; background: #f9fafb; display: flex; flex-direction: column; gap: 8px; }

        .cust-identity { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; background: #fff7ed; padding: 12px; border-radius: 12px; border: 1px solid #ffedd5; }
        .cust-avatar { width: 48px; height: 48px; border-radius: 50%; background: #f97316; color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; }
        .cust-name { font-weight: 700; color: #111827; font-size: 16px; }
        .cust-bal-tag { font-size: 13px; color: #6b7280; margin-top: 2px; }

        .form-field { margin-bottom: 20px; }
        .form-field label { display: block; font-size: 12px; font-weight: 700; color: #4b5563; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.05em; }
        .modal-input { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid #d1d5db; font-size: 16px; transition: border-color 0.2s; }
        .modal-input:focus { border-color: #f97316; outline: none; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1); }

        .warn-icon { font-size: 3rem; width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; background: #fef2f2; color: #dc2626; }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        @media (max-width: 640px) {
          .cr-summary-grid { grid-template-columns: 1fr; }
          .modal-footer { flex-direction: column; }
        }
      `}</style>
    </div>
  )
}

import { Fragment } from 'react'
