//pages/owner/analytics.js

import React, { useEffect, useState } from 'react';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { getSupabase } from '../../services/supabase'; // 1. IMPORT ADDED
import { istSpanFromDatesUtcISO } from '../../utils/istTime';
import { FaShoppingBag, FaMoneyBillWave, FaChartLine, FaClipboardList, FaRobot, FaTimes, FaFire, FaFileInvoiceDollar, FaClock, FaMagic, FaTrophy, FaMedal } from 'react-icons/fa';



export default function AnalyticsPage() {
  // 2. & 3. APPLY SINGLETON PATTERN
  const supabase = getSupabase();
  const { checking } = useRequireAuth(supabase);
  
  const { restaurant, loading: restLoading } = useRestaurant();

  const [timeRange, setTimeRange] = useState('today');
  const [stats, setStats] = useState({
    orders: 0,
    revenue: 0,
    avgOrderValue: 0,
    topItems: [],
    hourlyData: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const restaurantId = restaurant?.id || '';

  useEffect(() => {
    if (checking || restLoading || !restaurantId || !supabase) return;
    loadAnalytics();
    // The supabase dependency is stable, but loadAnalytics is not, so keep it for now.
    // To optimize further, wrap loadAnalytics in useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, restLoading, restaurantId, timeRange, supabase]);

  const loadAnalytics = async () => {
    if (!supabase) return; // Guard
    setLoading(true);
    setError('');
    try {
      const { start, end } = getDateRange(timeRange);
      const { startUtc, endUtc } = istSpanFromDatesUtcISO(start, end);

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, total_amount, total_inc_tax, created_at, date_ordered, status, items')
        .eq('restaurant_id', restaurantId)
        .gte('date_ordered', startUtc)
        .lt('date_ordered', endUtc)
        .neq('status', 'cancelled');

      if (ordersError) throw ordersError;
      const orderData = Array.isArray(orders) ? orders : [];

      const totalOrders = orderData.length;
      const totalRevenue = orderData.reduce((sum, o) =>
        sum + Number(o.total_inc_tax ?? o.total_amount ?? 0), 0);
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const itemCounts = {};
      orderData.forEach(o => {
        if (Array.isArray(o.items)) {
          o.items.forEach(it => {
            const name = it.name || 'Unknown Item';
            itemCounts[name] = (itemCounts[name] || 0) + (Number(it.quantity) || 1);
          });
        }
      });
      const topItems = Object.entries(itemCounts)
        .sort(([, a], [, b]) => b - a).slice(0, 5)
        .map(([name, quantity]) => ({ name, quantity }));

      const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12:         false });
      const hMap = {};
      orderData.forEach(o => {
      const h = hourFmt.format(new Date(o.date_ordered || o.created_at));
      const amt = Number(o.total_inc_tax ?? o.total_amount ?? 0);
      if (!hMap[h]) hMap[h] = { count: 0, amount: 0 };
      hMap[h].count += 1; hMap[h].amount += amt;
      });
      const hourlyData = Object.keys(hMap).sort().map(h => ({ hour: `${h}:00`, orders: hMap[h].count, revenue:     hMap[h].amount }));

      setStats({ orders: totalOrders, revenue: totalRevenue, avgOrderValue, topItems, hourlyData });
    } catch (e) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = (range) => {
    const now = new Date();
    const start = new Date();
    switch (range) {
      case 'today': start.setHours(0, 0, 0, 0); return { start, end: now };
      case 'week': start.setDate(now.getDate() - 7); return { start, end: now };
      case 'month': start.setDate(now.getDate() - 30); return { start, end: now };
      default: start.setHours(0, 0, 0, 0); return { start, end: now };
    }
  };



  const formatCurrency = (n) => `₹${Number(n).toFixed(2)}`;

// inside AnalyticsPage component:
const [aiLoading, setAiLoading] = useState(false);
const [aiError, setAiError] = useState('');
const [aiSuggestions, setAiSuggestions] = useState('');
const [showAiPanel, setShowAiPanel] = useState(false);

// Inside your AnalyticsPage component...

const fetchAiSuggestions = async () => {
  try {
    setAiLoading(true);
    setAiError('');
    setAiSuggestions(''); // Clear previous suggestions
    setShowAiPanel(true); // Open panel immediately

    const response = await fetch('/api/owner/ai-sales-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, timeRange })
    });

    if (!response.ok) {
      const json = await response.json();
      throw new Error(json.error || 'Failed to fetch AI insights');
    }

    // STREAM READER LOGIC
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        // Append new text to the existing text state
        setAiSuggestions((prev) => prev + chunk);
      }
    }

  } catch (e) {
    setAiError(e.message);
  } finally {
    setAiLoading(false);
  }
};

const formatAIResponse = (text) => {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    // Headers
    if (line.match(/^#{1,6}\s/)) {
      const level = line.match(/^#{1,6}/)[0].length;
      const content = line.replace(/^#{1,6}\s/, '');
      const fontSize = level === 1 ? '1.25rem' : level === 2 ? '1.1rem' : '1rem';
      return <div key={i} style={{ fontSize, fontWeight: 700, color: '#111827', marginTop: 16, marginBottom: 8 }}>{content}</div>;
    }
    // Lists
    if (line.match(/^(\*|-|\d+\.)\s/)) {
      return (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, paddingLeft: 8 }}>
          <span style={{ color: '#f97316', fontWeight: 'bold' }}>•</span>
          <span style={{ color: '#374151', lineHeight: 1.5 }}>{line.replace(/^(\*|-|\d+\.)\s/, '')}</span>
        </div>
      );
    }
    // Empty lines
    if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
    // Normal text
    return <p key={i} style={{ marginBottom: 8, lineHeight: 1.6, color: '#4b5563' }}>{line}</p>;
  });
};

  if (checking || restLoading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!restaurantId) return <div style={{ padding: 24 }}>No restaurant found</div>;

  return (
    <>
      <div className="analytics-page">
        <div className="page-header">
          <div>
            <h1>Analytics</h1>
            <p className="subtitle">Track your restaurant's performance</p>
          </div>
          <div className="time-filters">
            {['today', 'week', 'month'].map((range) => (
              <Button
                key={range}
                onClick={() => setTimeRange(range)}
                style={{
                  background: timeRange === range ? '#f97316' : '#fff7ed',
                  color: timeRange === range ? 'white' : '#ea580c',
                  border: `1px solid ${timeRange === range ? '#f97316' : '#fed7aa'}`,
                  textTransform: 'capitalize',
                  fontWeight: 600
                }}
              >
                {range === 'week' ? '7 Days' : range === 'month' ? '30 Days' : 'Today'}
              </Button>
            ))}

            <Button
              variant="outline"
              onClick={fetchAiSuggestions}
              disabled={aiLoading}
              style={{ position: 'relative', overflow: 'visible', borderColor: '#fed7aa', color: '#ea580c' }}
            >
              <span className="ai-badge">AI</span>
              {aiLoading ? 'Asking AI…' : 'Ask AI'}
            </Button>
          </div>
        </div>

        {error && (
          <Card padding="12px" style={{ marginBottom: 16, borderColor: '#fecaca', background: '#fff1f2' }}>
            <div style={{ color: '#b91c1c' }}>{error}</div>
          </Card>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>Loading analytics…</div>
        ) : (
          <>
            <div className="kpi-grid">
              {/* Orders */}
              <div className="summary-card">
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                   <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="kpi-label">Total Orders</span>
                      <span className="kpi-value">{stats.orders}</span>
                   </div>
                   <div className="kpi-icon"><FaClipboardList /></div>
                 </div>
              </div>

              {/* Revenue */}
              <div className="summary-card">
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                   <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="kpi-label">Revenue</span>
                      <span className="kpi-value">{formatCurrency(stats.revenue)}</span>
                   </div>
                   <div className="kpi-icon"><FaMoneyBillWave /></div>
                 </div>
              </div>

              {/* Avg Order */}
              <div className="summary-card">
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                   <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="kpi-label">Avg Order Value</span>
                      <span className="kpi-value">{formatCurrency(stats.avgOrderValue)}</span>
                   </div>
                   <div className="kpi-icon"><FaChartLine /></div>
                 </div>
              </div>
            </div>

            <div className="charts-grid">
              <Card padding="20px" className="chart-card">
                <h3 className="chart-title">Top Items</h3>
                {stats.topItems.length === 0 ? (
                  <div className="empty-chart">No data available</div>
                ) : (
                  <div className="top-items-list">
                    {stats.topItems.map((item, index) => (
                      <div key={item.name} className="top-item">
                        <div className="item-rank">{index + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span className="item-name">{item.name}</span>
                            <span className="item-count">{item.quantity} orders</span>
                          </div>
                          <div className="item-bar-bg">
                            <div 
                              className="progress-fill" 
                              style={{ width: `${(item.quantity / stats.topItems[0].quantity) * 100}%` }} 
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {timeRange === 'today' && (
                <Card padding="0" className="chart-card">
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
                    <h3 className="chart-title" style={{ margin: 0 }}>Hourly Revenue</h3>
                  </div>
                  
                  {stats.hourlyData.length === 0 || stats.hourlyData.every(d => d.revenue === 0) ? (
                    <div className="empty-chart">No orders today</div>
                  ) : (
                    <div className="hourly-scroll-container">
                      <div className="hourly-chart-wrapper">
                         {stats.hourlyData.map((d, i) => {
                           const maxRev = Math.max(...stats.hourlyData.map(x => x.revenue)) || 1;
                           const heightPct = (d.revenue / maxRev) * 100;
                           const isZero = d.revenue === 0;
                           
                           return (
                             <div key={d.hour} className="hour-col-group">
                                <div className="bar-area">
                                   <div 
                                     className="revenue-bar" 
                                     style={{ 
                                       height: isZero ? '4px' : `${Math.max(heightPct, 4)}%`,
                                       background: isZero ? '#f3f4f6' : 'linear-gradient(180deg, #f97316 0%, #fb923c 100%)',
                                       opacity: isZero ? 1 : 1
                                     }} 
                                   >
                                      {!isZero && (
                                        <div className="bar-tooltip">₹{Number(d.revenue).toFixed(2)}</div>
                                      )}
                                   </div>
                                </div>
                                <div className="hour-axis-label">{d.hour.slice(0, 5)}</div>
                             </div>
                           );
                         })}
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </div>

{/* Slide Over Panel */}
{(showAiPanel) && (
  <>
    <div className="ai-panel-backdrop" onClick={() => setShowAiPanel(false)} />
    <div className="ai-panel">
      <button className="close-btn" onClick={() => setShowAiPanel(false)} aria-label="Close">
        &times;
      </button>
      <div className="ai-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="ai-icon-circle"><FaMagic /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#111827' }}>AI Insights</h3>
          </div>
        </div>
      </div>
      
      <div className="ai-panel-content">
        {aiLoading && !aiSuggestions && (
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 40, gap: 12 }}>
             <div className="spinner"></div>
             <p style={{ color: '#6b7280' }}>Analyzing your data...</p>
           </div>
        )}
        
        {aiError && (
          <div style={{ padding: 12, borderRadius: 8, background: '#fee2e2', color: '#dc2626', fontSize: '0.9rem' }}>
            {aiError}
          </div>
        )}

        <div className="ai-text-content">
          {formatAIResponse(aiSuggestions)}
        </div>
        
        {/* Streaming Cursor */}
        {aiLoading && <span className="cursor-blink">|</span>}
      </div>
    </div>
  </>
)}

            <div className="roadmap-card">
              <h3>Upcoming Features</h3>
              <div className="roadmap-grid">
                <div className="roadmap-item"><FaChartLine /> Sales trend charts</div>
                <div className="roadmap-item"><FaFire /> Peak hours heatmap</div>
                <div className="roadmap-item"><FaFileInvoiceDollar /> HSN & Tax summaries</div>
                <div className="roadmap-item"><FaClock /> Order completion times</div>
                <div className="roadmap-item"><FaMagic /> Revenue forecasting</div>
              </div>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .analytics-page { max-width: 1200px; margin: 0 auto; padding: 1rem; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .page-header h1 { margin: 0; font-size: 2rem; }
        .subtitle { color: #6b7280; margin: 4px 0 0 0; }
        .time-filters { display: flex; gap: 8px; flex-wrap: wrap; }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 24px; }
        
        /* Standard Dashboard Card Style */
        .summary-card {
          background: white;
          padding: 16px 20px;
          border-radius: 8px;
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

        .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 16px; }
        .chart-card { min-height: 300px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border-radius: 8px !important; }
        .chart-title { margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: #1f2937; }
        .empty-chart { display: flex; align-items: center; justify-content: center; height: 200px; color: #9ca3af; }
        .top-items-list { display: flex; flex-direction: column; gap: 0; }
        .top-item { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid #f9fafb; }
        .top-item:last-child { border-bottom: none; }
        .item-rank { 
          width: 28px; height: 28px; 
          background: #fff7ed; color: #ea580c; 
          border-radius: 50%; 
          display: flex; align-items: center; justify-content: center; 
          font-weight: 700; font-size: 0.85rem;
          margin-right: 12px; flex-shrink: 0;
        }
        .item-name { font-weight: 600; color: #374151; font-size: 0.95rem; }
        .item-count { font-size: 0.85rem; font-weight: 600; color: #1f2937; }
        .item-bar-bg { height: 6px; background: #f3f4f6; border-radius: 99px; width: 100%; overflow: hidden; }
        .progress-fill { height: 100%; background: #f97316; border-radius: 99px; transition: width 0.5s ease; }
        .hourly-scroll-container {
          overflow-x: auto;
          padding: 24px;
          /* Hide scrollbar for clean look */
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .hourly-chart-wrapper {
          display: flex;
          align-items: flex-end;
          gap: 12px;
          height: 200px;
          min-width: max-content;
          padding-top: 30px; /* Space for tooltip */
        }
        .hour-col-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          width: 48px;
          height: 100%;
        }
        .bar-area {
          flex: 1;
          width: 100%;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          position: relative;
        }
        .revenue-bar {
          width: 12px;
          border-radius: 99px;
          position: relative;
          transition: height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .revenue-bar:hover .bar-tooltip {
          opacity: 1; transform: translateX(-50%) translateY(-6px);
        }
        
        .bar-tooltip {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%) translateY(0);
          background: #ffffff;
          color: #ea580c;
          padding: 6px 10px;
          border: 1px solid #fed7aa;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          border-radius: 8px;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          margin-bottom: 8px;
          z-index: 10;
        }
        .hour-axis-label {
          font-size: 11px;
          color: #9ca3af;
          font-weight: 600;
          transform: rotate(-45deg);
          transform-origin: center;
          margin-top: 8px;
        }
          @media (max-width: 768px) {
            .analytics-page { padding: 0.5rem; }
            .page-header { flex-direction: column; gap: 16px; align-items: stretch; }
            .time-filters { justify-content: center; }
            .charts-grid { grid-template-columns: 1fr; }
            .kpi-grid { grid-template-columns: 1fr; }
          }
          
          .ai-badge {
            position: absolute;
            top: -10px;
            left: -6px;
            background: white;
            border: 1px solid #ea580c;
            color: #ea580c;
            font-size: 9px;
            font-weight: 900;
            padding: 1px 5px;
            border-radius: 6px;
            line-height: 1.2;
            z-index: 10;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            animation: pulse 2s infinite;
            pointer-events: none;
          }
          @keyframes pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.4); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 4px rgba(234, 88, 12, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(234, 88, 12, 0); }
          }
          
          /* AI Panel Styles */
          .ai-panel-backdrop {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.3); z-index: 999;
            backdrop-filter: blur(2px);
            animation: fadeIn 0.3s;
          }
          .ai-panel {
            position: fixed; 
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 90%; max-width: 600px;
            max-height: 85vh;
            background: white; z-index: 1000;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            border-radius: 16px;
            display: flex; flex-direction: column;
            animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes popIn {
            from { transform: translate(-50%, -45%); opacity: 0; scale: 0.95; }
            to { transform: translate(-50%, -50%); opacity: 1; scale: 1; }
          }
          .ai-panel-header {
            padding: 20px 24px;
            border-bottom: 1px solid #f3f4f6;
            display: flex; justify-content: space-between; align-items: center;
            background: #fff;
            border-radius: 16px 16px 0 0;
          }
          .ai-panel-content {
            padding: 24px;
            overflow-y: auto;
            flex: 1;
            background: #ffffff;
          }
          .ai-icon-circle {
            width: 40px; height: 40px;
            background: #fff7ed; color: #f97316;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 1.25rem;
          }
          .close-btn {
            position: absolute;
            top: 16px; right: 16px;
            background: none;
            color: #f97316;
            border: none;
            width: 32px; height: 32px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            font-size: 32px;
            line-height: 1;
            z-index: 1010;
            transition: all 0.2s;
            opacity: 0.7;
          }
          .close-btn:hover { color: #ea580c; transform: scale(1.1); opacity: 1; }
          .spinner {
            width: 24px; height: 24px;
            border: 3px solid #f3f4f6;
            border-top-color: #f97316;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          .cursor-blink { animation: blink 1s step-end infinite; font-weight: bold; color: #f97316; }
          @keyframes blink { 50% { opacity: 0; } }

          /* Roadmap Card */
          .roadmap-card {
            background: linear-gradient(135deg, #fff7ed 0%, #ffffff 100%);
            border: 1px dashed #fed7aa;
            border-radius: 12px;
            padding: 24px;
            margin-top: 24px;
          }
          .roadmap-card h3 {
            margin: 0 0 20px 0;
            color: #ea580c;
            display: flex; align-items: center;
            font-size: 1.1rem;
          }
          .roadmap-grid {
            display: flex; flex-wrap: wrap; gap: 12px;
          }
          .roadmap-item {
            background: white;
            padding: 10px 16px;
            border-radius: 99px;
            border: 1px solid #fed7aa;
            color: #9a3412;
            font-weight: 600;
            font-size: 0.9rem;
            display: flex; align-items: center; gap: 8px;
            box-shadow: 0 1px 2px rgba(249, 115, 22, 0.05);
            transition: transform 0.2s;
          }
          .roadmap-item:hover { transform: translateY(-2px); box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.1); }
          .roadmap-item svg { color: #f97316; font-size: 1rem; }
        `}</style>
    </>
  );
}
