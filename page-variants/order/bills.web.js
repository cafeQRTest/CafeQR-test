// page-variants/order/bills.web.js

import React, { useEffect, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'

export async function getServerSideProps() {
  return { props: {} }
}

export default function CustomerBills({ supabase }) {
  const { checking } = useRequireAuth(supabase)
  const [user, setUser] = useState(null)
  const [bills, setBills] = useState([])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => setUser(data?.user))
  }, [supabase])

  useEffect(() => {
    if (!supabase) return
    if (!user) return
    supabase.from('bills')
      .select('*').eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setBills(data || []))
  }, [user, supabase])

  if (checking) return <div style={{ padding: 24 }}>Loading...</div>

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h2>Your Bills</h2>
      {bills.length === 0
        ? <p>No bills found.</p>
        : bills.map(bill => (
          <div key={bill.id} style={{ padding: 12, margin: 12, border: '1px solid #ddd' }}>
            <strong>#{bill.order_id.slice(0, 8)}</strong>
            <span>{new Date(bill.created_at).toLocaleString()}</span>
            {bill.pdf_url
              ? <a href={bill.pdf_url} target="_blank" rel="noopener noreferrer">Download</a>
              : <span>Unavailable</span>
            }
          </div>
        ))
      }
    </div>
  )
}
