// page-variants/restaurants/[id].web.js

import { useState } from 'react'
import QRCode from 'qrcode'

export async function getServerSideProps({ params, query, supabase }) {
  if (!supabase) return { notFound: true }
  const id = params.id
  const tableNumber = query.table || ''
  const { data: restaurant, error: restErr } = await supabase
    .from('restaurants').select('id,name,upi_id,tax_rate')
    .eq('id', id).single()
  if (restErr || !restaurant) return { notFound: true }
  const { data: menuItems } = await supabase
    .from('menu_items').select('id,name,price,available')
    .eq('restaurant_id', id).eq('available', true).order('created_at')
  return { props: { restaurant, menuItems: menuItems || [], tableNumber } }
}

export default function RestaurantPage({ supabase, restaurant, menuItems, tableNumber }) {
  if (!supabase) return null
  const [cart, setCart] = useState({})
  const [loading, setLoading] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [method, setMethod] = useState('cash')
  const [paymentQR, setPaymentQR] = useState('')

  const addItem = id => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }))
  const removeItem = id => setCart(c => {
    const r = { ...c }
    if (r[id] > 1) r[id]--
    else delete r[id]
    return r
  })

  const totals = (() => {
    const items = menuItems.filter(i => cart[i.id])
    const subtotal = items.reduce((sum, i) => sum + i.price * cart[i.id], 0)
    const tax = subtotal * (restaurant.tax_rate || 0) / 100
    const total = subtotal + tax
    return {
      items,
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      count: items.reduce((s, i) => s + cart[i.id], 0)
    }
  })()

  const proceed = () => {
    if (!tableNumber || totals.count === 0) {
      alert(!tableNumber ? 'Invalid table' : 'Select items'); return
    }
    setShowPayment(true)
  }

  const placeOrder = async (status) => {
    if (!supabase) return
    setLoading(true)
    const { items, subtotal, tax, total } = totals
    const orderData = {
      restaurant_id: restaurant.id,
      table_number: tableNumber,
      items: items.map(i => ({ id: i.id, name: i.name, qty: cart[i.id], price: i.price })),
      subtotal: parseFloat(subtotal), tax_amount: parseFloat(tax),
      total: parseFloat(total),
      payment_method: status,
      payment_status: status === 'upi' ? 'completed' : 'pending'
    }
    const { error } = await supabase.from('orders').insert([orderData])
    setLoading(false)
    if (error) alert(error.message)
    else { alert('Order placed!'); setCart({}); setShowPayment(false) }
  }

  const genQR = async () => {
    if (!restaurant.upi_id) return alert('UPI not set')
    setLoading(true)
    const upi = `upi://pay?pa=${restaurant.upi_id}&pn=${encodeURIComponent(restaurant.name)}&am=${totals.total}&tn=${encodeURIComponent('Table ' + tableNumber)}&cu=INR`
    try {
      const url = await QRCode.toDataURL(upi)
      setPaymentQR(url)
    } catch {
      alert('QR error')
    }
    setLoading(false)
  }

  return (
    <div style={{ margin: '0 auto', padding: 20, maxWidth: 800 }}>
      <h1>{restaurant.name} Menu</h1>
      <div>
        Table: <input value={tableNumber} readOnly style={{ width: 60 }} />
      </div>
      {!showPayment ? (
        <>
          {menuItems.map(item => (
            <div key={item.id} style={{ margin: 8 }}>
              {item.name} — ₹{item.price}
              <button onClick={() => addItem(item.id)}>+</button>
              {cart[item.id] && <button onClick={() => removeItem(item.id)}>-</button>}
            </div>
          ))}
          {totals.count > 0 && (
            <div>
              Subtotal: ₹{totals.subtotal} • GST: ₹{totals.tax} • <strong>₹{totals.total}</strong>
              <button onClick={proceed} disabled={loading}>Proceed</button>
            </div>
          )}
        </>
      ) : (
        <div>
          <h3>Payment</h3>
          <label>
            <input type="radio" checked={method === 'cash'} onChange={() => setMethod('cash')} /> Cash
          </label>
          <label style={{ marginLeft: 20 }}>
            <input type="radio" checked={method === 'upi'} onChange={() => setMethod('upi')} /> UPI
          </label>
          {method === 'cash' ? (
            <button onClick={() => placeOrder('cash')} disabled={loading}>Confirm Cash</button>
          ) : (
            <>
              {!paymentQR
                ? <button onClick={genQR} disabled={loading}>Gen UPI QR</button>
                : <>
                  <img src={paymentQR} alt="UPI QR" style={{ width: 200 }} />
                  <button onClick={() => placeOrder('upi')}>I Paid</button>
                </>
              }
            </>
          )}
        </div>
      )}
    </div>
  )
}
