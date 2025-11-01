// In: pages/owner/billing.js

import React, { useEffect, useState } from 'react';
import { getSupabase } from '../../services/supabase';
import { useRestaurant } from '../../context/RestaurantContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';

export default function BillingPage() {
  const supabase = getSupabase();
  const { restaurant } = useRestaurant();
  const today = new Date().toISOString().slice(0, 10);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reportType, setReportType] = useState('sales'); // 'sales', 'credit', 'all'
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    total_invoices: 0,
    total_taxable: 0,
    total_tax: 0,
    cash_sales: 0,
    online_sales: 0,
    credit_sales: 0,
  });

  const loadInvoices = async () => {
    if (!restaurant?.id || !supabase) return;

    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('invoice_date', `${from}T00:00:00Z`)
        .lte('invoice_date', `${to}T23:59:59Z`)
        .order('invoice_date', { ascending: false });

      if (error) throw error;

      let filtered = data || [];

      // Filter by report type
      if (reportType === 'sales') {
        filtered = filtered.filter(inv => inv.payment_method !== 'credit');
      } else if (reportType === 'credit') {
        filtered = filtered.filter(inv => inv.payment_method === 'credit');
      }

      setInvoices(filtered);

      // Calculate statistics
      const calculatedStats = {
        total_invoices: filtered.length,
        total_taxable: filtered.reduce((sum, inv) => sum + (parseFloat(inv.subtotal_ex_tax) || 0), 0),
        total_tax: filtered.reduce((sum, inv) => sum + (parseFloat(inv.total_tax) || 0), 0),
        cash_sales: filtered
          .filter(inv => inv.payment_method === 'cash')
          .reduce((sum, inv) => sum + (parseFloat(inv.total_inc_tax) || 0), 0),
        online_sales: filtered
          .filter(inv => ['online', 'upi', 'card'].includes(inv.payment_method))
          .reduce((sum, inv) => sum + (parseFloat(inv.total_inc_tax) || 0), 0),
        credit_sales: filtered
          .filter(inv => inv.payment_method === 'credit')
          .reduce((sum, inv) => sum + (parseFloat(inv.total_inc_tax) || 0), 0),
      };

      setStats(calculatedStats);
    } catch (e) {
      setError(e.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (supabase && restaurant?.id) {
      loadInvoices();
    }
  }, [restaurant?.id, from, to, reportType, supabase]);

  const exportCSV = (type) => {
    if (!restaurant?.id) return;
    const qs = new URLSearchParams({
      from,
      to,
      restaurant_id: restaurant.id,
      report_type: type,
    }).toString();
    window.location.href = `/api/reports/sales?${qs}`;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>📊 Billing & GST Management</h1>

      {/* Filters */}
      <Card padding={16} style={{ marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              From Date:
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              To Date:
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>
              Report Type:
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              <option value="sales">Sales (Paid Orders Only)</option>
              <option value="credit">Credit (Open Invoices)</option>
              <option value="all">All Invoices</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Statistics Dashboard */}
      <Card padding={16} style={{ marginBottom: '20px', backgroundColor: '#f0fdf4' }}>
        <h2 style={{ marginTop: 0, marginBottom: '15px' }}>📈 Report Statistics</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
          <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Total Invoices</p>
            <p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: 'bold' }}>
              {stats.total_invoices}
            </p>
          </div>

          <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Taxable Value</p>
            <p style={{ margin: '5px 0 0 0', fontSize: '18px', fontWeight: 'bold' }}>
              ₹{stats.total_taxable.toFixed(2)}
            </p>
          </div>

          <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Total Tax (GST)</p>
            <p style={{ margin: '5px 0 0 0', fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>
              ₹{stats.total_tax.toFixed(2)}
            </p>
          </div>

          <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>💵 Cash Sales</p>
            <p style={{ margin: '5px 0 0 0', fontSize: '16px', fontWeight: 'bold' }}>
              ₹{stats.cash_sales.toFixed(2)}
            </p>
          </div>

          <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>🏦 Online Sales</p>
            <p style={{ margin: '5px 0 0 0', fontSize: '16px', fontWeight: 'bold' }}>
              ₹{stats.online_sales.toFixed(2)}
            </p>
          </div>

          <div style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>💳 Credit Sales</p>
            <p style={{ margin: '5px 0 0 0', fontSize: '16px', fontWeight: 'bold' }}>
              ₹{stats.credit_sales.toFixed(2)}
            </p>
          </div>
        </div>
      </Card>

      {/* Export Buttons */}
      <Card padding={16} style={{ marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px' }}>📥 Export Reports</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button
            onClick={() => exportCSV('sales')}
            variant="primary"
            disabled={loading || stats.total_invoices === 0}
          >
            📊 Export Sales CSV (Payment Method Included)
          </Button>

          <Button
            onClick={() => exportCSV('credit')}
            variant="outline"
            disabled={loading || stats.credit_sales === 0}
          >
            📋 Export Credit CSV
          </Button>

          <Button
            onClick={() => exportCSV('all')}
            variant="outline"
            disabled={loading || stats.total_invoices === 0}
          >
            📄 Export All CSV
          </Button>
        </div>
        <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
          💡 <strong>Tip:</strong> Payment Method column shows (cash/online/upi/card) for tax filing purposes
        </p>
      </Card>

      {/* Invoices Table */}
      <Card padding={16}>
        <h3 style={{ marginTop: 0 }}>📋 {reportType === 'credit' ? 'Open Credit Invoices' : 'Invoices'}</h3>
        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p style={{ color: 'red' }}>Error: {error}</p>
        ) : invoices.length === 0 ? (
          <p>No invoices found</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #ddd' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Invoice No</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Customer</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Taxable</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Tax</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Total</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>Payment Method</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{inv.invoice_no}</td>
                    <td style={{ padding: '10px' }}>
                      {new Date(inv.invoice_date).toLocaleDateString('en-IN')}
                    </td>
                    <td style={{ padding: '10px' }}>{inv.customer_name || 'N/A'}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      ₹{(inv.subtotal_ex_tax || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#dc2626' }}>
                      ₹{(inv.total_tax || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>
                      ₹{(inv.total_inc_tax || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor:
                            inv.payment_method === 'cash'
                              ? '#dcfce7'
                              : inv.payment_method === 'credit'
                              ? '#fef08a'
                              : '#dbeafe',
                          fontSize: '12px',
                          fontWeight: 'bold',
                        }}
                      >
                        {inv.payment_method === 'cash'
                          ? '💵 Cash'
                          : inv.payment_method === 'credit'
                          ? '💳 Credit'
                          : '🏦 Online'}
                      </span>
                    </td>

<td style={{ padding: '10px', textAlign: 'center' }}>
  <span
    style={{
      padding: '6px 10px',
      borderRadius: '6px',
      backgroundColor:
        inv.status === 'open'
          ? '#fef08a'  // Yellow for open
          : '#dcfce7', // Green for paid
      fontSize: '12px',
      fontWeight: 'bold',
      color: inv.status === 'open' ? '#92400e' : '#166534'
    }}
  >
    {inv.status === 'open' 
      ? '⏳ Open (Credit)' 
      : '✅ Paid'}
  </span>
</td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}