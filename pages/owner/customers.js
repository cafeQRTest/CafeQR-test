// pages/owner/customers.js
import { useEffect, useMemo, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import { getSupabase } from '../../services/supabase'
import { FaUserFriends, FaExchangeAlt, FaSearch } from 'react-icons/fa'
import Button from '../../components/ui/Button'

export default function OwnerCustomersPage() {
  const BRAND = {
    orange: '#f97316',
    black: '#111827',
  }

  const supabase = getSupabase()
  const { checking } = useRequireAuth(supabase)
  const { restaurant, loading: restLoading } = useRestaurant()
  const restaurantId = restaurant?.id

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
      }),
    []
  )

  const loadCustomers = async () => {
    setError('')
    setLoading(true)
    try {
      const { data, error } = await supabase
  .from('v_owner_customers')
  .select('restaurant_id, customer_id, name, phone, first_order_at, last_order_at, order_count, visit_count, total_spent, loyalty_points')
  .eq('restaurant_id', restaurantId)
  .order('last_order_at', { ascending: false })


      if (error) throw error
      setRows(data || [])
    } catch (e) {
      setError(e?.message || 'Failed to load customers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (checking || restLoading || !restaurantId) return
    loadCustomers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, restLoading, restaurantId])

  const filtered = rows.filter(r => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      (r.name || '').toLowerCase().includes(q) ||
      (r.phone || '').includes(q)
    )
  })

  const totalCustomers = rows.length
  const repeatCustomers = rows.filter(r => Number(r.order_count || 0) >= 2).length
  const totalSpent = rows.reduce((s, r) => s + Number(r.total_spent || 0), 0)

  const pageCount = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const pageRows = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  if (checking || restLoading) return <div style={{ padding: 24 }}>Loading…</div>
  if (!restaurantId) return <div style={{ padding: 24 }}>No restaurant</div>

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <h1 className="h1">Customers</h1>
          <p className="subtitle">Track customer visits and orders for this restaurant</p>
        </div>

        <Button variant="outline" onClick={loadCustomers} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="cr-summary-grid">
        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="kpi-label">Total Customers</span>
              <span className="kpi-value">{totalCustomers}</span>
            </div>
            <div className="kpi-icon"><FaUserFriends /></div>
          </div>
        </div>

        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="kpi-label">Repeat Customers</span>
              <span className="kpi-value">{repeatCustomers}</span>
            </div>
            <div className="kpi-icon"><FaExchangeAlt  /></div>
          </div>
        </div>

        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="kpi-label">Total Spent</span>
              <span className="kpi-value">{fmt.format(totalSpent)}</span>
            </div>
            <div className="kpi-icon"><FaExchangeAlt  /></div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          color: '#b91c1c', marginBottom: 12, padding: 12,
          background: '#fee2e2', border: `1px solid #fecaca`, borderRadius: 10
        }}>
          {error}
        </div>
      )}

      <div className="search-bar-premium">
        <FaSearch className="search-icon-svg" />
        <input
          type="text"
          placeholder="Search by name or phone…"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1) }}
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
          No customers yet
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="cc-mobile-list">
            {pageRows.map(c => (
              <div key={`${c.restaurant_id}-${c.phone}`} className="cc-card">
                <div className="cc-row">
                  <div>
                    <div className="cc-name">{c.name || 'Customer'}</div>
                    <div className="cc-phone">{c.phone}</div>
                  </div>
                  <span className="cc-status-badge cc-status-active">
                    {Number(c.visit_count || 0)} visits
                  </span>
                </div>

                <div className="cc-metrics">
                  <div className="cc-metric">
                    <div className="l">Orders</div>
                    <div className="v">{Number(c.order_count || 0)}</div>
                  </div>
                  <div className="cc-metric">
                    <div className="l">Spent</div>
                    <div className="v" style={{ color: BRAND.orange }}>
                      {fmt.format(Number(c.total_spent || 0))}
                    </div>
                  </div>
                </div>

                <div style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>
                  Last order: {c.last_order_at ? new Date(c.last_order_at).toLocaleString('en-IN') : '-'}
                </div>
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
                  <th className="cr-center">Visits</th>
                  <th className="cr-center">Orders</th>
                  <th className="cr-right">Total spent</th>
                  <th>Last order</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c, idx) => (
                  <tr key={`${c.restaurant_id}-${c.phone}`} style={{ background: idx % 2 ? '#fff' : '#f9fafb' }}>
                    <td><strong>{c.name || 'Customer'}</strong></td>
                    <td>{c.phone}</td>
                    <td className="cr-center">{Number(c.visit_count || 0)}</td>
                    <td className="cr-center">{Number(c.order_count || 0)}</td>
                    <td className="cr-right" style={{ fontWeight: 800, color: BRAND.orange }}>
                      {fmt.format(Number(c.total_spent || 0))}
                    </td>
                    <td>{c.last_order_at ? new Date(c.last_order_at).toLocaleString('en-IN') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > itemsPerPage && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24, paddingBottom: 24 }}>
              <Button
                variant="outline"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ fontSize: 13, padding: '8px 16px' }}
              >
                Previous
              </Button>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>
                Page {currentPage} of {pageCount}
              </span>
              <Button
                variant="outline"
                onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
                disabled={currentPage >= pageCount}
                style={{ fontSize: 13, padding: '8px 16px' }}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Borrowed styling approach from your credit customers page */}
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
        .clear-search-btn-premium { background: none; border: none; cursor: pointer; color: #9ca3af; }
        .clear-search-btn-premium:hover { color: #f97316; }

        .cr-table-wrap { background: white; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .cr-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .cr-table th {
          background: #fafafa;
          padding: 16px;
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          color: #6b7280;
          font-weight: 700;
          border-bottom: 2px solid #f97316;
          letter-spacing: 0.5px;
          white-space: nowrap;
          position: sticky; top: 0; z-index: 10;
        }
        .cr-table td {
          padding: 16px;
          border-bottom: 1px solid #f3f4f6;
          font-size: 14px;
          color: #374151;
          white-space: nowrap;
          vertical-align: middle;
        }
        .cr-table tr:hover { background: #fff7ed; }
        .cr-right { text-align: right; }
        .cr-center { text-align: center; }

        .cc-mobile-list { display: none; }
        .cc-card {
          background: white; border-radius: 12px; border: 1px solid #e5e7eb;
          margin-bottom: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .cc-row { padding: 16px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f3f4f6; }
        .cc-name { font-weight: 800; font-size: 16px; color: #111827; }
        .cc-phone { font-size: 13px; color: #6b7280; margin-top: 2px; }
        .cc-metrics { display: flex; background: #fafafa; }
        .cc-metric { flex: 1; padding: 12px; text-align: center; border-right: 1px solid #f3f4f6; }
        .cc-metric:last-child { border-right: none; }
        .cc-metric .l { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-bottom: 2px; }
        .cc-metric .v { font-size: 14px; font-weight: 800; }
        .cc-status-badge { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
        .cc-status-active { background: #ecfdf5; color: #059669; }

        .table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }

        @media (max-width: 768px) {
          .cc-mobile-list { display: block; }
          .cr-table-wrap { display: none; }
          .cr-summary-grid { grid-template-columns: 1fr; }
          .page-header { flex-direction: column; gap: 8px; align-items: flex-start; }
        }
      `}</style>
    </div>
  )
}
