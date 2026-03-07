// components/RecentOrders.js
export default function RecentOrders({ orders, loading }) {
  return (
    <div className="recent-orders">
      <h2>Recent Orders</h2>
      {loading ? (
        <p>Loading orders…</p>
      ) : orders.length === 0 ? (
        <p>No recent orders.</p>
      ) : (
        <ul>
          {orders.map((o) => (
            <li key={o.id}>
              <span>#{o.id.slice(0,8)}</span>
              <span>{new Date(o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
              <span>{o.status}</span>
              <span>₹{o.total_amount.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
      <style jsx>{`
        .recent-orders {
          background: #fff;
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 1px 4px rgba(0,0,0,0.1);
        }
        h2 {
          margin-top: 0;
        }
        ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        li {
          display: grid;
          grid-template-columns: 1fr auto auto auto;
          gap: 1rem;
          padding: 0.5rem 0;
          border-bottom: 1px solid #eee;
          font-size: 0.9rem;
        }
        li:last-child { border-bottom: none; }
        @media (max-width: 600px) {
          li {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: auto auto;
          }
        }
      `}</style>
    </div>
  )
}
