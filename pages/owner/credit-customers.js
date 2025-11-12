// pages/owner/credit-customers.js
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import { getSupabase } from '../../services/supabase'

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
  } catch {
    setError('Failed to load orders for customer');
  }
};



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
    if (!amt || amt <= 0) { setError('Enter valid amount'); return }
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
    if (!confirm('Are you sure?')) return
    try {
      const { error: err } = await supabase
        .from('credit_customers')
        .update({ status: 'suspended' })
        .eq('id', customerId)
      if (err) throw err
      setSuccess('Customer suspended')
      await loadCustomers()
    } catch (err) {
      setError('Failed: ' + err.message)
    }
  }

  const filtered = customers.filter(c =>
    (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.phone || '').includes(searchQuery)
  )

  if (checking || restLoading) return <div style={{ padding: 24 }}>Loading…</div>
  if (!restaurantId) return <div style={{ padding: 24 }}>No restaurant</div>

  return (
    <div className="container page" style={{ maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        
        <h1 style={{ margin: 0, color: BRAND.black }}>💳 Credit Customers</h1>
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

      <div className="actions-bar" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search by name or phone…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px',
            border: `1px solid ${BRAND.border}`, borderRadius: 10, fontSize: 14
          }}
        />
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

                <div className="cc-actions">
                  <button
                    onClick={() => { setSelectedCustomer(c); setShowPaymentModal(true) }}
                    style={{ background: BRAND.orange, borderRadius: 8 }}
                  >
                    Payment
                  </button>
                  <button
                    onClick={() => toggleOrderExpand(c.id)}
                    style={{ background: BRAND.black, borderRadius: 8 }}
                  >
                    {expandedCustomerId === c.id ? 'Hide Orders' : 'View Orders'}
                  </button>
                  <button
                    onClick={() => c.status === 'active' && handleSuspendCustomer(c.id)}
                    style={{ background: '#ef4444', borderRadius: 8 }}
                    disabled={c.status !== 'active'}
                  >
                    Suspend
                  </button>
                </div>

                {expandedCustomerId === c.id && (
                  <div className="cc-orders">
                    {customerOrders[c.id]?.length ? (
                      customerOrders[c.id].map(o => (
                        <div key={o.id} className="cc-order-row">
                          <span>#{o.id.substring(0, 8)}</span>
                          <span>{new Date(o.created_at).toLocaleDateString()}</span>
                          <span style={{ fontWeight: 700 }}>{fmt.format(Number(o.total_inc_tax || o.total_amount || 0))}</span>
                          <span>
                            <span className="cc-status-badge" style={{
                              background: o.status === 'completed' ? '#dcfce7' : '#fef3c7',
                              color: o.status === 'completed' ? '#166534' : '#92400e'
                            }}>
                              {o.status}
                            </span>
                          </span>
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
          <div className="cc-table-wrap table-wrap">
            <table className="table" style={{ borderRadius: 10, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th>Name</th>
                  <th>Phone</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th style={{ textAlign: 'right' }}>Total Extended</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
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
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => { setSelectedCustomer(c); setShowPaymentModal(true) }}
                          style={{ background: BRAND.orange, borderRadius: 8, padding: '6px 10px', marginRight: 8 }}
                        >
                          Payment
                        </button>
                        <button
                          onClick={() => toggleOrderExpand(c.id)}
                          style={{ background: BRAND.black, borderRadius: 8, padding: '6px 10px', marginRight: 8 }}
                        >
                          {expandedCustomerId === c.id ? 'Hide Orders' : 'View Orders'}
                        </button>
                        {c.status === 'active' && (
                          <button
                            onClick={() => handleSuspendCustomer(c.id)}
                            style={{ background: '#ef4444', borderRadius: 8, padding: '6px 10px' }}
                          >
                            Suspend
                          </button>
                        )}
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
                                    {customerOrders[c.id].map(o => (
                                      <tr key={o.id}>
                                        <td>#{o.id.substring(0, 8)}</td>
                                        <td>{new Date(o.created_at).toLocaleDateString()}</td>
                                        <td style={{ textAlign: 'right' }}>{fmt.format(Number(o.total_amount || 0))}</td>
                                        <td style={{ textAlign: 'right' }}>{fmt.format(Number(o.total_tax || 0))}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt.format(Number(o.total_inc_tax || 0))}</td>
                                        <td>
                                          <span style={{
                                            padding: '2px 6px',
                                            borderRadius: 999,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            background: o.status === 'completed' ? '#dcfce7' : '#fef3c7',
                                            color: o.status === 'completed' ? '#166534' : '#92400e'
                                          }}>
                                            {o.status}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
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
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal__card" style={{ maxWidth: 420, width: '92%', borderRadius: 12 }}>
            <h2 style={{ marginTop: 0, color: BRAND.black }}>Record Payment — {selectedCustomer.name}</h2>
            <p style={{ color: '#6b7280' }}>
              Outstanding Balance: <strong>{fmt.format(Number(selectedCustomer.current_balance || 0))}</strong>
            </p>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>Amount (₹)</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                style={{ width: '100%', borderRadius: 10 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>Payment Method</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                style={{ width: '100%', borderRadius: 10 }}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleMakePayment}
                disabled={loading}
                style={{
                  flex: 1, background: BRAND.orange, borderRadius: 10, fontWeight: 700
                }}
              >
                {loading ? 'Recording…' : 'Record Payment'}
              </button>
              <button
                onClick={() => { setShowPaymentModal(false); setPaymentAmount(''); setSelectedCustomer(null) }}
                style={{
                  flex: 1, background: BRAND.black, borderRadius: 10, fontWeight: 700
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { Fragment } from 'react'
