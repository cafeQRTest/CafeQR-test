// pages/owner/credit-customers.js
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import { getSupabase } from '../../services/supabase'

export default function CreditCustomersPage() {
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

  useEffect(() => {
    if (checking || restLoading || !restaurantId) return
    loadCustomers()
  }, [checking, restLoading, restaurantId, supabase])

  const loadCustomers = async () => {
    setLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('credit_customers')
        .select(`
          id,
          name,
          phone,
          email,
          address,
          current_balance,
          total_credit_extended,
          status,
          created_at
        `)
        .eq('restaurant_id', restaurantId)
        .order('name')

      if (err) throw err
      setCustomers(data || [])
    } catch (err) {
      setError(err.message || 'Failed to load customers')
    } finally {
      setLoading(false)
    }
  }

  const handleMakePayment = async () => {
    if (!paymentAmount || paymentAmount <= 0) {
      setError('Enter valid amount')
      return
    }

    if (paymentAmount > selectedCustomer.current_balance) {
      setError('Payment cannot exceed outstanding balance')
      return
    }

    setLoading(true)
    try {
      const newBalance = selectedCustomer.current_balance - parseFloat(paymentAmount)

      const { error: updateErr } = await supabase
        .from('credit_customers')
        .update({ current_balance: newBalance })
        .eq('id', selectedCustomer.id)

      if (updateErr) throw updateErr

      // Record transaction
      const { error: txnErr } = await supabase
        .from('credit_transactions')
        .insert({
          restaurant_id: restaurantId,
          credit_customer_id: selectedCustomer.id,
          order_id: null,
          transaction_type: 'payment',
          amount: parseFloat(paymentAmount),
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
      setError('Failed to record payment: ' + err.message)
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

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  )

// Add this function to load customer transactions:

const loadCustomerTransactions = async (customerId) => {
  if (!customerId) return []
  
  try {
    const { data, error } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('credit_customer_id', customerId)
      .order('transaction_date', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Failed to load transactions:', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('Error loading transactions:', err)
    return []
  }
}


  if (checking || restLoading) return <div style={{ padding: 24 }}>Loading…</div>
  if (!restaurantId) return <div style={{ padding: 24 }}>No restaurant</div>

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <button onClick={() => router.back()} style={{ marginBottom: 16 }}>← Back</button>
      <h1>💳 Credit Customers</h1>

      {error && <div style={{ color: 'red', marginBottom: 12, padding: 12, background: '#ffe5e5', borderRadius: 6 }}>{error}</div>}
      {success && <div style={{ color: '#10b981', marginBottom: 12, padding: 12, background: '#e5fef0', borderRadius: 6 }}>{success}</div>}

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            fontSize: 14
          }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : filteredCustomers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>No credit customers yet</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Name</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Phone</th>
                <th style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>Balance</th>
                <th style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>Total Extended</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: 600 }}>Status</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer, idx) => (
                <tr key={customer.id} style={{ borderBottom: '1px solid #e5e7eb', background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                  <td style={{ padding: 12 }}><strong>{customer.name}</strong></td>
                  <td style={{ padding: 12 }}>{customer.phone}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>
                    <strong style={{ color: customer.current_balance > 0 ? '#dc2626' : '#059669' }}>
                      ₹{customer.current_balance.toFixed(2)}
                    </strong>
                  </td>
                  <td style={{ padding: 12, textAlign: 'right' }}>₹{customer.total_credit_extended.toFixed(2)}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      background: customer.status === 'active' ? '#ecfdf5' : '#fef2f2',
                      color: customer.status === 'active' ? '#059669' : '#dc2626'
                    }}>
                      {customer.status}
                    </span>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <button
                      onClick={() => {
                        setSelectedCustomer(customer)
                        setShowPaymentModal(true)
                      }}
                      style={{
                        padding: '6px 12px',
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 12,
                        marginRight: 8
                      }}
                    >
                      Payment
                    </button>
                    {customer.status === 'active' && (
                      <button
                        onClick={() => handleSuspendCustomer(customer.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedCustomer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#fff',
            padding: 24,
            borderRadius: 8,
            maxWidth: 400,
            width: '90%',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h2>Record Payment - {selectedCustomer.name}</h2>
            <p style={{ color: '#6b7280', marginBottom: 16 }}>
              Outstanding Balance: <strong>₹{selectedCustomer.current_balance.toFixed(2)}</strong>
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Amount (₹)</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Payment Method</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 14
                }}
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
                  flex: 1,
                  padding: '10px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {loading ? 'Recording...' : 'Record Payment'}
              </button>
              <button
                onClick={() => {
                  setShowPaymentModal(false)
                  setPaymentAmount('')
                  setSelectedCustomer(null)
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#6b7280',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600
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
