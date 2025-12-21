import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import { getSupabase } from '../../services/supabase'; // 1. IMPORT ADDED

function formatCurrency(n) {
  const num = Number(n || 0);
  return `₹${num.toFixed(2)}`;
}
function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

import {
  FaFire,
  FaMoneyBillWave,
  FaTicketAlt,
  FaExclamationTriangle,
  FaBookOpen,
  FaCashRegister,
  FaFileInvoice,
  FaBoxOpen,
  FaArrowRight,
  FaTimes
} from 'react-icons/fa';

import { useRouter } from 'next/router';
import { useSubscription } from '../../context/SubscriptionContext';

export default function OwnerOverview() {
  // 2. & 3. APPLY SINGLETON PATTERN
  const supabase = getSupabase();
  const { checking } = useRequireAuth(supabase);
  const router = useRouter(); 
  
  const { restaurant, loading: restLoading, error: restError } = useRestaurant();
  const { subscription, loading: subLoading } = useSubscription();

  const [stats, setStats] = useState({ liveOrders: 0, revenueToday: 0, avgTicket: 0, outOfStock: 0 });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  
  // Modal State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loadingItems, setLoadingItems] = useState(false);

  const restaurantId = restaurant?.id || '';
  
  const BRAND = {
    orange: '#ea580c',
    soft: '#fff7ed'
  };

  // Subscription check
  useEffect(() => {
    if (!subLoading && subscription && !subscription.is_active) {
       router.replace('/owner/subscription');
    }
  }, [subscription, subLoading, router]);
  
  // Handle View Order (Copied logic from credit-customers)
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
  
    setLoadingItems(true);
    try {
      // 3. Fetch from order_items table specifically
      const { data: dbItems, error: dbError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', order.id)
      
      if (dbError) throw dbError
      
      if (dbItems && dbItems.length > 0) {
        const formatted = dbItems.map(it => ({
          ...it,
          name: it.item_name || 'Item',
          // Append variant name if present
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

  useEffect(() => {
    if (!supabase || checking || restLoading) return;
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    let cancel = false;

    async function fetchOverview() {
      try {
        setErr('');
        const startISO = startOfTodayISO();

        const { count: liveCount, error: liveErr } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .in('status', ['new', 'in_progress', 'ready']);
        if (liveErr) throw liveErr;
        const liveOrders = typeof liveCount === 'number' ? liveCount : 0;

        const { data: todayRows, error: todayErr } = await supabase
          .from('orders')
          .select('total_inc_tax, status, created_at') // Simplified select
          .eq('restaurant_id', restaurantId)
          .gte('created_at', startISO);
        if (todayErr) throw todayErr;

        const rows = Array.isArray(todayRows) ? todayRows : [];
        const totalFor = (o) => Number(o.total_inc_tax ?? 0);
        const revenueToday = rows.reduce((a, o) => a + totalFor(o), 0);
        const completed = rows.filter((o) => String(o.status) === 'completed');
        const avgTicket = completed.length > 0
          ? completed.reduce((a, o) => a + totalFor(o), 0) / completed.length
          : 0;

        const { count: outCount, error: outErr } = await supabase
          .from('menu_items')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('status', 'out_of_stock'); // Corrected from 'is_available'
        if (outErr) throw outErr;

        if (!cancel) setStats({ liveOrders, revenueToday, avgTicket, outOfStock: outCount || 0 });
      } catch (e) {
        if (!cancel) {
          setErr(e?.message || 'Failed to load KPIs');
          setStats({ liveOrders: 0, revenueToday: 0, avgTicket: 0, outOfStock: 0 });
        }
      }
    }

    async function fetchRecentOrders() {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, created_at, status, total_inc_tax, gst_enabled, total_tax, subtotal_ex_tax') // Simplified select
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) throw error;
        if (!cancel) setOrders(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancel) {
          setErr((prev) => prev || e?.message || 'Failed to load recent orders');
          setOrders([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    }

    fetchOverview();
    fetchRecentOrders();
    return () => { cancel = true; };
  }, [checking, restLoading, restaurantId, supabase]);

  if (checking || restLoading) return <div style={{ padding: 24 }}>Loading…</div>;

  if (!restaurantId) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>Dashboard Overview</h1>
        <div style={{ padding: 12, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff' }}>
          {restError
            ? `Unable to resolve your restaurant: ${restError}`
            : 'No restaurant is linked to this login (owner_email).'}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard-page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Dashboard Overview</h1>
            <p className="page-subtitle">Welcome back! Here's what's happening today.</p>
          </div>
        </div>

        {err && (
          <div className="alert-error">
            <span className="error-icon">⚠️</span> {err}
          </div>
        )}

        <KpiGrid stats={stats} />
        
        <div style={{ marginBottom: '32px' }}>
          <QuickActions />
        </div>
        
        <RecentOrders orders={orders} loading={loading} onViewOrder={handleViewOrder} />
      </div>

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
                      <div className="detail-val" style={{ color: BRAND.orange, textTransform: 'uppercase' }}>{selectedOrder.status}</div>
                   </div>
                </div>

                <div className="order-items-sec">
                   <div className="detail-label" style={{ marginBottom: 12, borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>Order Items</div>
                   
                   {loadingItems ? (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 13 }}>
                        <div className="spinner" style={{ margin: '0 auto 8px' }}></div>
                        Fetching items...
                      </div>
                   ) : (selectedOrder.items || []).length > 0 ? (
                      selectedOrder.items.map((it, i) => {
                         // Prefer fully calculated fields if available, else fallback
                         const unitInc = it.unit_price_inc_tax ?? it.price;
                         const itemTotal = it.unit_price_inc_tax ? (it.unit_price_inc_tax * it.quantity) : (it.price * it.quantity);

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
                        No items found for this order
                      </div>
                   )}
                </div>

                <div style={{ marginTop: 24, padding: 16, background: BRAND.soft, borderRadius: 12, border: '1px solid #ffedd5' }}>
                   {Number(selectedOrder.total_tax || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                         <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>Tax Amount</span>
                         <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>{formatCurrency(Number(selectedOrder.total_tax || 0))}</span>
                      </div>
                   )}
                   <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: Number(selectedOrder.total_tax || 0) > 0 ? 12 : 0, borderTop: Number(selectedOrder.total_tax || 0) > 0 ? '1px dashed #fdba74' : 'none' }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>Total Amount</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: BRAND.orange }}>
                        {formatCurrency(Number(selectedOrder.total_inc_tax || selectedOrder.total_amount || 0))}
                      </span>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .dashboard-page {
          padding: 24px;
          padding-top: 24px; 
          min-height: 100vh;
          background: #f8fafc;
        }
        
        .page-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
        }

        .page-title { font-size: 28px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; letter-spacing: -0.02em; }
        .page-subtitle { font-size: 15px; color: #64748b; margin: 0; }

        .dashboard-content {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
        }
        
        /* content-grid Removed as layout is now vertical stack */

        .cta-wrap { display: flex; gap: 12px; }

        .btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 20px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          color: #334155;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        
        .btn-secondary:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .section-head { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          margin-bottom: 24px;
        }
        .section-title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0; }
        
        .view-all-link {
          background: #f97316;
          color: #ffffff;
          padding: 10px 24px;
          border-radius: 99px;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          transition: all 0.2s;
          box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.2);
        }

        .view-all-link:hover {
          background: #ea580c;
          transform: translateY(-1px);
          box-shadow: 0 8px 12px -1px rgba(249, 115, 22, 0.3);
        }

        .orders-card { 
          background: #fff; 
          border: 1px solid #e2e8f0; 
          border-radius: 16px; 
          overflow: hidden; 
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
        }

        .alert-error {
          padding: 16px; 
          border-radius: 12px; 
          border: 1px solid #fecaca; 
          background: #fff1f2; 
          color: #991b1b; 
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 500;
        }

        .content-grid {
          display: grid;
          grid-template-columns: 1fr 2.5fr; /* Sidebar Left, Main Right */
          gap: 24px;
          margin-top: 24px;
        }

        @media (max-width: 1024px) {
          .content-grid { grid-template-columns: 1fr; }
          .side-col { order: -1; } /* Quick Actions on top for mobile */
        }

        @media (max-width: 640px) {
          .dashboard-page { padding: 16px; }
          .page-head { flex-direction: column; align-items: flex-start; gap: 16px; }
          .cta-wrap { width: 100%; }
          .btn-secondary { width: 100%; }
        }

        /* Modal Styles */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.2s ease; }
        .modal-panel { background: white; border-radius: 16px; width: 92%; max-width: 460px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center; }
        .modal-header h3 { margin: 0; font-size: 1.15rem; font-weight: 700; color: #111827; }
        .close-x { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 4px; transition: color 0.2s; font-size: 1.2rem; display: flex; align-items: center; }
        .close-x:hover { color: #ea580c; }
        .modal-body { padding: 24px; max-height: 75vh; overflow-y: auto; }
        
        .detail-label { fontSize: 11px; fontWeight: 700; color: #9ca3af; textTransform: uppercase; marginBottom: 4px; letterSpacing: 0.05em; }
        .detail-val { fontSize: 14px; fontWeight: 600; color: #111827; }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </>
  );
}

// ... (previous code structure)

function KpiGrid({ stats }) {
  const router = useRouter();
  const tiles = [
    { label: 'Live Orders', value: stats.liveOrders, color: '#f97316', bgHover: '#fff7ed', borderHover: '#f97316', path: '/owner/orders' },
    { label: 'Revenue Today', value: formatCurrency(stats.revenueToday), color: '#f97316', bgHover: '#fff7ed', borderHover: '#f97316', path: '/owner/analytics' },
    { label: 'Avg Ticket', value: formatCurrency(stats.avgTicket), color: '#f97316', bgHover: '#fff7ed', borderHover: '#f97316', path: '/owner/sales' },
    { label: 'Out of Stock', value: stats.outOfStock, color: '#f97316', bgHover: '#fff7ed', borderHover: '#f97316', path: '/owner/menu' },
  ];

  return (
    <div className="kpi-grid">
      {tiles.map((t, i) => (
        <div 
          key={t.label} 
          className="kpi-card" 
          onClick={() => router.push(t.path)}
          style={{ 
            '--kpi-color': t.color, 
            '--kpi-bg-hover': t.bgHover, 
            '--kpi-border-hover': t.borderHover,
            animationDelay: `${i * 0.2}s`
          }}
        >
          <div className="kpi-content">
             <div className="kpi-label">{t.label}</div>
             <div className="kpi-value">{t.value}</div>
          </div>
        </div>
      ))}
      <style jsx>{`
        .kpi-grid {
          display: grid;
          gap: 24px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          margin-bottom: 32px;
        }

        .kpi-card { 
          background: #fff;
          border: 1px solid #e2e8f0;
          border-top: 4px solid #f97316; 
          border-radius: 16px; 
          padding: 24px; 
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          position: relative;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          min-height: 100px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03); /* Softer initial shadow for float */
          animation: float 6s ease-in-out infinite;
        }

        .kpi-card:hover {
          transform: translateY(-2px) scale(1.02); /* Slight scale on hover too */
          border-color: #fb923c;
          box-shadow: 0 12px 24px -4px rgba(0, 0, 0, 0.1);
        }

        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
          100% { transform: translateY(0px); }
        }

        .kpi-label { 
          color: #64748b; 
          font-size: 11px; 
          font-weight: 700; 
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }

        .kpi-value { 
          font-size: 32px; 
          font-weight: 800; 
          color: #0f172a; 
          line-height: 1.1;
          letter-spacing: -0.03em;
        }

        @media (max-width: 1100px) {
           .kpi-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
           .kpi-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function QuickActions() {
  const actions = [
    { href: '/owner/menu', label: 'Manage Menu', icon: <FaBookOpen />, desc: 'Edit Items' },
    { href: '/owner/counter', label: 'Counter Sale', icon: <FaCashRegister />, desc: 'POS' },
    { href: '/owner/billing', label: 'Billing', icon: <FaFileInvoice />, desc: 'Invoices & Reports' },
  ];

  return (
    <div className="qa-section">
      <h3 className="section-title">Quick Actions</h3>
      <div className="qa-list">
        {actions.map((a, i) => (
          <Link href={a.href} key={a.label} className="qa-item" style={{ animationDelay: `${i * 0.4}s` }}>
            <div className="qa-icon-bubble">
              {a.icon}
            </div>
            <div className="qa-text">
              <span className="qa-label">{a.label}</span>
              <span className="qa-desc">{a.desc}</span>
            </div>
          </Link>
        ))}
      </div>

      <style jsx>{`
        .qa-section { padding: 0; }
        .section-title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 32px 0; }

        .qa-list {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 48px; /* More space between bubbles */
        }

        .qa-item {
          display: flex;
          flex-direction: column; /* Vertical Layout */
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 16px;
          text-decoration: none;
          cursor: pointer;
          
          /* Floating Bubble Card */
          background: linear-gradient(180deg, #ffffff 0%, #fff7ed 100%);
          padding: 32px 24px;
          border-radius: 32px; 
          border: 2px solid #f97316; /* Strong Highlight Border */
          box-shadow: 0 8px 20px -6px rgba(249, 115, 22, 0.15), 
                      0 0 0 1px rgba(249, 115, 22, 0.05);
          
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          animation: floatBobble 6s ease-in-out infinite;
          will-change: transform;
        }

        .qa-item:hover {
          transform: translateY(-5px) scale(1.02);
          box-shadow: 0 12px 30px -8px rgba(249, 115, 22, 0.3);
          border-color: #ea580c;
          background: #ffffff;
          animation-play-state: paused;
        }

        .qa-icon-bubble {
          width: 68px; height: 68px;
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          border-radius: 50%; 
          display: flex; align-items: center; justify-content: center;
          font-size: 26px;
          color: #ea580c;
          flex-shrink: 0;
          
          box-shadow: inset 0 2px 4px #ffffff, 
                      0 8px 20px -8px rgba(234, 88, 12, 0.25);
          
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .qa-item:hover .qa-icon-bubble {
          background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
          color: #fff; 
          transform: rotate(-10deg) scale(1.1);
          box-shadow: 0 8px 24px -6px rgba(234, 88, 12, 0.4);
        }

        .qa-text { display: flex; flex-direction: column; gap: 4px; align-items: center; }
        
        .qa-label { font-size: 16px; font-weight: 800; color: #0f172a; line-height: 1.2; letter-spacing: -0.01em; }
        .qa-desc { font-size: 13px; font-weight: 500; color: #64748b; }
        
        @keyframes floatBobble {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
          100% { transform: translateY(0px); }
        }

        @media (max-width: 1200px) {
           .qa-list { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 800px) {
           .qa-list { grid-template-columns: 1fr; gap: 24px; } 
           .qa-item { padding: 24px; } 
        }
      `}</style>
    </div>
  );
}

function RecentOrders({ orders, loading, onViewOrder }) {
  return (
    <div className="cr-table-wrap">
      <div className="ro-header">
        <h3 className="section-title">Recent Orders</h3>
        <Link href="/owner/orders" className="btn-view-orders">
          View Orders
        </Link>
      </div>

      <div className="table-container">
        {loading ? (
          <div className="state-msg"><div className="spinner"></div>Loading...</div>
        ) : orders.length === 0 ? (
          <div className="state-msg empty">No recent orders found.</div>
        ) : (
          <table className="cr-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Time</th>
                <th>Status</th>
                <th style={{textAlign: 'right'}}>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} onClick={() => onViewOrder && onViewOrder(o)} style={{ cursor: 'pointer' }}>
                  <td><strong>#{String(o.id).slice(0, 8)}</strong></td>
                  <td>
                    {o.created_at ? new Date(o.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--'}
                  </td>
                  <td>
                     <span className={`status-pill ${String(o.status || 'new')}`}>
                        {String(o.status || 'new').replace('_', ' ')}
                     </span>
                  </td>
                  <td style={{textAlign: 'right', fontWeight: 800, color: '#0f172a'}}>
                     {formatCurrency(o.total_inc_tax ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style jsx>{`
        .cr-table-wrap {
           background: #fff;
           border-radius: 16px;
           border: 1px solid #e2e8f0;
           overflow: hidden;
           box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
           height: 100%;
           display: flex; flex-direction: column;
        }

        .ro-header {
           padding: 20px 24px;
           border-bottom: 1px solid #f1f5f9;
           display: flex; justify-content: space-between; align-items: center;
        }

        .section-title { margin: 0; font-size: 18px; font-weight: 800; color: #1e293b; }

        .btn-view-orders {
           display: inline-flex; align-items: center; justify-content: center;
           font-size: 14px; font-weight: 700; color: #fff; text-decoration: none;
           padding: 10px 24px; 
           background: #f97316; 
           border-radius: 99px;
           transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
           box-shadow: 0 4px 10px -2px rgba(249, 115, 22, 0.3);
        }
        .btn-view-orders:hover { 
           background: #ea580c; color: #fff;
           transform: translateY(-2px);
           box-shadow: 0 8px 20px -4px rgba(234, 88, 12, 0.4);
        }

        .table-container { flex: 1; overflow-x: auto; }

        .cr-table { width: 100%; border-collapse: collapse; }
        .cr-table th {
           background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%);
           padding: 14px 24px; text-align: left; font-size: 11px; text-transform: uppercase;
           color: #64748b; font-weight: 700; border-bottom: 2px solid #ea580c; letter-spacing: 0.05em;
        }
        .cr-table td { padding: 16px 24px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #334155; }
        .cr-table tr:last-child td { border-bottom: none; }
        .cr-table tr:hover { background: #fff7ed; }

        .status-pill {
           display: inline-block; padding: 4px 10px; border-radius: 999px;
           font-size: 11px; font-weight: 700; text-transform: uppercase;
        }
        .status-pill.new { background: #eff6ff; color: #2563eb; }
        .status-pill.in_progress { background: #fff7ed; color: #ea580c; }
        .status-pill.ready { background: #ecfeff; color: #0891b2; }
        .status-pill.completed { background: #f0fdf4; color: #16a34a; }
        .status-pill.cancelled { background: #fef2f2; color: #dc2626; }

        .state-msg { padding: 40px; text-align: center; color: #94a3b8; font-size: 14px; }
        .spinner {
           width: 20px; height: 20px; border: 2px solid #e2e8f0; border-top-color: #ea580c;
           border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 10px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ... Styling for layout swap ...
/* 
   We need to update the main styling block in OwnerOverview to swap columns. 
   I will include the styles for .content-grid in the block below the component definitions 
   or assume the existing styles in OwnerOverview component handle it. 
   
   Wait, the OwnerOverview component has its own styles. I need to update THAT file's render logic 
   and its internal styles for .content-grid.
   
   Since I am replacing the components separately, I should also update OwnerOverview's return 
   render to swap the placement of <RecentOrders> and <QuickActions> AND update the css grid.
*/

