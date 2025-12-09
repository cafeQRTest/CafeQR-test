// pages/owner/billing.js

import React, { useEffect, useState } from 'react';
import { getSupabase } from '../../services/supabase';
import { useRestaurant } from '../../context/RestaurantContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { istSpanUtcISO } from '../../utils/istTime';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { downloadInvoicePdf } from '../../lib/downloadInvoicePdf'



export default function BillingPage() {
  const supabase = getSupabase();
  const { restaurant } = useRestaurant();
  const today = new Date().toISOString().slice(0, 10);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  // sales = paid, credit = open credit, all = everything, voided = void only
  const [reportType, setReportType] = useState('sales');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const [stats, setStats] = useState({
    total_invoices: 0,
    total_taxable: 0,
    total_tax: 0,
    total_cgst: 0,
    total_sgst: 0,
    total_igst: 0,
    cash_sales: 0,
    online_sales: 0,
    credit_sales: 0,
  });

  // Helpers
  const shortOrder = (id) => (id ? `#${id.slice(0, 8).toUpperCase()}` : '—');
  const isMixed = (inv) => inv?.payment_method === 'mixed' && inv?.mixed_payment_details;

  const paymentBadge = (inv) => {
    const pm = inv?.payment_method || 'unknown';
    if (pm === 'cash') return { cls: 'payment-cash', label: '💵 Cash' };
    if (pm === 'credit') return { cls: 'payment-credit', label: '💳 Credit' };
    if (pm === 'upi') return { cls: 'payment-online', label: '🏦 UPI' };
    if (pm === 'card') return { cls: 'payment-online', label: '🏦 Card' };
    if (pm === 'online') return { cls: 'payment-online', label: '🏦 Online' };
    if (pm === 'mixed') {
      const details = inv?.mixed_payment_details || {};
      const cash = Number(details.cash_amount || 0).toFixed(2);
      const onl = Number(details.online_amount || 0).toFixed(2);
      const om = (details.online_method || 'online').toUpperCase();
      return { cls: 'payment-online', label: `🔀 Mixed (₹${cash} + ₹${onl} ${om})` };
    }
    return { cls: 'payment-online', label: pm };
  };

  const statusBadge = (inv) => {
    if (String(inv?.status || '').toLowerCase() === 'void') {
      return { cls: 'status-void', label: '🚫 Void' };
    }
    return {
      cls: inv?.status === 'open' ? 'status-open' : 'status-paid',
      label: inv?.status === 'open' ? '⏳ Open' : '✅ Paid',
    };
  };
   
  
  const loadInvoices = async () => {
    if (!restaurant?.id || !supabase) return;

    setLoading(true);
    setError('');
    try {
      const { startUtc, endUtc } = istSpanUtcISO(from, to);
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('invoice_date', startUtc)
        .lt('invoice_date', endUtc)
        .neq('status', 'unpaid')
        .order('invoice_date', { ascending: false });

      if (error) throw error;

      let list = data || [];
      // Filter by report type
      if (reportType === 'sales') {
        list = list.filter(inv => inv.payment_method !== 'credit' && String(inv.status || '').toLowerCase() !== 'void');
       } else if (reportType === 'credit') {
         list = list.filter(inv => inv.payment_method === 'credit' && String(inv.status || '').toLowerCase() !== 'void');
      } else if (reportType === 'voided') {
        list = list.filter(inv => String(inv.status || '').toLowerCase() === 'void');
      } // 'all' shows everything

      setInvoices(list);

      // Compute statistics from the visible list
      const computed = {
        total_invoices: list.length,
        total_taxable: list.reduce((s, inv) => s + (parseFloat(inv.subtotal_ex_tax) || 0), 0),
        total_tax: list.reduce((s, inv) => s + (parseFloat(inv.total_tax) || 0), 0),
        total_cgst: list.reduce((s, inv) => s + (parseFloat(inv.cgst) || 0), 0),
        total_sgst: list.reduce((s, inv) => s + (parseFloat(inv.sgst) || 0), 0),
        total_igst: list.reduce((s, inv) => s + (parseFloat(inv.igst) || 0), 0),
        cash_sales: list.reduce((sum, inv) => {
          if (inv.payment_method === 'cash') return sum + (parseFloat(inv.total_inc_tax) || 0);
          if (isMixed(inv)) return sum + (parseFloat(inv.mixed_payment_details.cash_amount) || 0);
          return sum;
        }, 0),
        online_sales: list.reduce((sum, inv) => {
          if (['online', 'upi', 'card'].includes(inv.payment_method)) return sum + (parseFloat(inv.total_inc_tax) || 0);
          if (isMixed(inv)) return sum + (parseFloat(inv.mixed_payment_details.online_amount) || 0);
          return sum;
        }, 0),
        credit_sales: list
          .filter(inv => inv.payment_method === 'credit')
          .reduce((s, inv) => s + (parseFloat(inv.total_inc_tax) || 0), 0),
      };

      setStats(computed);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, from, to, reportType, supabase]);

  const exportCSV = async (type) => {
    if (!restaurant?.id) return;
    const qs = new URLSearchParams({
      from,
      to,
      restaurant_id: restaurant.id,
      report_type: type,
    }).toString();
    const relUrl = `/api/reports/sales?${qs}`;

    // Web / desktop: keep existing behavior
    if (!Capacitor.isNativePlatform()) {
      window.location.href = relUrl;
      return;
    }

    try {
      // In Capacitor WebView we can just fetch the same relative URL
      const res = await fetch(relUrl);
      if (!res.ok) throw new Error('Failed to generate CSV');
      const csv = await res.text();

      const fileName = `Billing_${type}_${from}_to_${to}.csv`;
      const path = `CafeQR/${fileName}`;

      await Filesystem.writeFile({
        directory: Directory.Documents,
        path,
        data: csv,
        encoding: 'utf8',
      });

      const { uri } = await Filesystem.getUri({
        directory: Directory.Documents,
        path,
      });

      await Share.share({
        title: fileName,
        text: 'Cafe QR billing CSV export',
        url: uri,
      });
    } catch (e) {
      console.error('Billing CSV export failed', e);
      alert(e.message || 'Failed to export CSV');
    }
  };

   const exportHsnSummary = async () => {
    if (!restaurant?.id) return;

    const qs = new URLSearchParams({
      from,
      to,
      restaurant_id: restaurant.id,
    }).toString();

    const relUrl = `/api/reports/gst-hsn-summary?${qs}`;

    // Web / desktop: direct download
    if (!Capacitor.isNativePlatform()) {
      window.location.href = relUrl;
      return;
    }

    try {
      // In Capacitor WebView we fetch and then share the file
      const res = await fetch(relUrl);
      if (!res.ok) throw new Error('Failed to generate HSN summary CSV');
      const csv = await res.text();

      const fileName = `GST_HSN_Summary_${from}_to_${to}.csv`;
      const path = `CafeQR/${fileName}`;

      await Filesystem.writeFile({
        directory: Directory.Documents,
        path,
        data: csv,
        encoding: 'utf8',
      });

      const { uri } = await Filesystem.getUri({
        directory: Directory.Documents,
        path,
      });

      await Share.share({
        title: fileName,
        text: 'Cafe QR GST HSN summary CSV export',
        url: uri,
      });
    } catch (e) {
      console.error('HSN summary CSV export failed', e);
      alert(e.message || 'Failed to export HSN summary CSV');
    }
  };

  const handleViewInvoice = async (invoice) => {
  if (!invoice?.order_id) {
    alert('Missing order id for this invoice')
    return
  }
  try {
    await downloadInvoicePdf(invoice.order_id)
  } catch (e) {
    alert(e.message || 'Failed to open invoice PDF')
  }
}


  const toggleInvoiceExpand = (invoiceId) => {
    setExpandedInvoice(expandedInvoice === invoiceId ? null : invoiceId);
  };

  const voidInvoice = async (inv) => {
    if (!inv?.id || !restaurant?.id) return;
    const ok = confirm(`Void invoice ${inv.invoice_no}? This will mark the invoice as void and cancel the linked order.`);
    if (!ok) return;
    try {
      const res = await fetch('/api/invoices/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: inv.id,
          restaurant_id: restaurant.id,
          reason: 'Customer return / quality issue',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to void');
      }
      await loadInvoices();
      alert('Invoice voided successfully');
    } catch (e) {
      alert(e.message || 'Failed to void invoice');
    }
  };

  return (
    <div className="billing-page-wrapper">
      <style jsx>{`
        .billing-page-wrapper { padding: 16px; max-width: 1400px; margin: 0 auto; width: 100%; box-sizing: border-box; }
        .billing-header { margin-bottom: 16px; }
        .billing-header h1 { font-size: 20px; margin: 0 0 8px 0; font-weight: 700; }
        .filters-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .filter-group label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px; color: #374151; }
        .filter-group input, .filter-group select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid #d1d5db; font-size: 14px; box-sizing: border-box; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .stat-card { padding: 12px; background: white; border-radius: 8px; border: 1px solid #e5e7eb; }
        .stat-label { font-size: 11px; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; font-weight: 600; }
        .stat-value { font-size: 18px; font-weight: 700; color: #111827; }
        .export-buttons { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
        .export-buttons button { flex: 1; min-width: 160px; }
        .table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 8px; background: white; }
        .invoices-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 960px; }
        .invoices-table thead { background: #f9fafb; border-bottom: 2px solid #e5e7eb; position: sticky; top: 0; z-index: 10; }
        .invoices-table th { text-align: left; padding: 12px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #6b7280; }
        .invoices-table td { padding: 12px; border-bottom: 1px solid #f3f4f6; }
        .invoices-table tbody tr:hover { background: #f9fafb; }
        .payment-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .payment-cash { background: #dcfce7; color: #166534; }
        .payment-online { background: #dbeafe; color: #1e40af; }
        .payment-credit { background: #fef08a; color: #854d0e; }
        .status-badge { display: inline-block; padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
        .status-paid { background: #dcfce7; color: #166534; }
        .status-open { background: #fef08a; color: #854d0e; }
        .status-void { background: #fee2e2; color: #991b1b; }
        .action-btn { padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; transition: all 0.2s; }
        .action-btn:hover { background: #2563eb; }
        .btn-void { background: #ef4444; }
        .btn-void:hover { background: #dc2626; }
        .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .mobile-invoice-list { display: none; }
        .mobile-invoice-card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; margin-bottom: 12px; }
        .mobile-invoice-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; cursor: pointer; }
        .mobile-invoice-number { font-weight: 700; font-size: 14px; color: #111827; }
        .mobile-expand-icon { font-size: 18px; color: #6b7280; transition: transform 0.2s; }
        .mobile-expand-icon.expanded { transform: rotate(180deg); }
        .mobile-invoice-summary { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .mobile-invoice-total { font-size: 16px; font-weight: 700; color: #111827; }
        .mobile-invoice-details { display: none; padding-top: 12px; border-top: 1px solid #f3f4f6; margin-top: 12px; }
        .mobile-invoice-details.expanded { display: block; }
        .mobile-detail-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
        .mobile-detail-label { color: #6b7280; font-weight: 500; }
        .mobile-detail-value { color: #111827; font-weight: 600; }
        .mobile-action-btn { width: 100%; margin-top: 12px; }
        @media (max-width: 768px) {
          .billing-page-wrapper { padding: 12px; }
          .billing-header h1 { font-size: 18px; }
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .export-buttons button { min-width: 120px; font-size: 12px; padding: 8px 12px; }
          .table-wrapper { display: none; }
          .mobile-invoice-list { display: block; }
        }
        @media (max-width: 480px) {
          .billing-page-wrapper { padding: 8px; }
          .filters-grid { grid-template-columns: 1fr; }
          .stats-grid { grid-template-columns: 1fr; }
          .stat-card { padding: 10px; }
          .export-buttons { flex-direction: column; }
          .export-buttons button { width: 100%; min-width: 100%; }
        }
      `}</style>

      <div className="billing-header">
        <h1>📊 Billing & GST Management</h1>
      </div>

      <Card padding={16} style={{ marginBottom: '16px' }}>
        <div className="filters-grid">
          <div className="filter-group">
            <label htmlFor="from-date">From Date:</label>
            <input id="from-date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="filter-group">
            <label htmlFor="to-date">To Date:</label>
            <input id="to-date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="filter-group">
            <label htmlFor="report-type">Report Type:</label>
            <select id="report-type" value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="sales">Sales (Paid Orders Only)</option>
              <option value="credit">Credit (Open Invoices)</option>
              <option value="all">All Invoices</option>
              <option value="voided">Voided Only</option>
            </select>
          </div>
        </div>
      </Card>

      <Card padding={16} style={{ marginBottom: '16px', backgroundColor: '#f0fdf4' }}>
        <h2 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>📈 Report Statistics</h2>
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Total Invoices</div><div className="stat-value">{stats.total_invoices}</div></div>
          <div className="stat-card"><div className="stat-label">Taxable Value</div><div className="stat-value">₹{stats.total_taxable.toFixed(2)}</div></div>
          <div className="stat-card"><div className="stat-label">Total Tax (GST)</div><div className="stat-value" style={{ color: '#dc2626' }}>₹{stats.total_tax.toFixed(2)}</div></div>
          <div className="stat-card"><div className="stat-label">💵 Cash Sales</div><div className="stat-value">₹{stats.cash_sales.toFixed(2)}</div></div>
          <div className="stat-card"><div className="stat-label">🏦 Online Sales</div><div className="stat-value">₹{stats.online_sales.toFixed(2)}</div></div>
          <div className="stat-card"><div className="stat-label">💳 Credit Sales</div><div className="stat-value">₹{stats.credit_sales.toFixed(2)}</div></div>
        </div>
      </Card>

      <Card padding={16} style={{ marginBottom: '16px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '14px' }}>📥 Export Reports</h3>
        <div className="export-buttons">
          <Button
            onClick={() => exportCSV('sales')}
            variant="primary"
            disabled={loading || stats.total_invoices === 0}
          >
            📊 Export Sales CSV
          </Button>

          <Button
            onClick={() => exportCSV('credit')}
            variant="primary"
            disabled={loading || stats.credit_sales === 0}
          >
            📋 Export Credit CSV
          </Button>

          <Button
            onClick={() => exportCSV('all')}
            variant="primary"
            disabled={loading || stats.total_invoices === 0}
          >
            📄 Export All CSV
          </Button>

          {/* NEW: HSN-wise GST summary */}
          <Button
            onClick={exportHsnSummary}
            variant="primary"
            disabled={loading || stats.total_invoices === 0}
          >
            🧾 Export HSN Summary CSV
          </Button>
        </div>
        <p style={{ marginTop: '10px', fontSize: '11px', color: '#6b7280', margin: '8px 0 0 0' }}>
          💡 <strong>Tip:</strong> Payment column shows Cash, UPI, Card, Online, Credit, or Mixed (with split) based on the invoice record. 
        </p>
      </Card>


      <Card padding={16}>
        <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>
          📋 {reportType === 'credit' ? 'Open Credit Invoices' : reportType === 'voided' ? 'Voided Invoices' : 'Invoices'}
        </h3>

        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p style={{ color: 'red' }}>Error: {error}</p>
        ) : invoices.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>No invoices found</p>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="invoices-table">
                <thead>
                  <tr>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>Order</th>
                    <th>Customer</th>
                    <th style={{ textAlign: 'right' }}>Taxable</th>
                    <th style={{ textAlign: 'right' }}>Tax</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Payment</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const pb = paymentBadge(inv);
                    const sb = statusBadge(inv);
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 'bold' }}>{inv.invoice_no}</td>
                        <td>{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</td>
                        <td>{shortOrder(inv.order_id)}</td>
                        <td>{inv.customer_name || 'N/A'}</td>
                        <td style={{ textAlign: 'right' }}>₹{Number(inv.subtotal_ex_tax || 0).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', color: '#dc2626' }}>₹{Number(inv.total_tax || 0).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{Number(inv.total_inc_tax || 0).toFixed(2)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`payment-badge ${pb.cls}`} title={isMixed(inv) ? pb.label : undefined}>
                            {isMixed(inv) ? '🔀 Mixed' : pb.label}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`status-badge ${sb.cls}`}>{sb.label}</span>
                        </td>
                        <td style={{ textAlign: 'center', display: 'flex', gap: 8 }}>
                          <button className="action-btn" onClick={() => handleViewInvoice(inv)}>👁️ View</button>
                          <button className="action-btn btn-void" onClick={() => voidInvoice(inv)} disabled={String(inv.status || '').toLowerCase() === 'void'}>
                            🚫 Void
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-invoice-list">
              {invoices.map((inv) => {
                const pb = paymentBadge(inv);
                const sb = statusBadge(inv);
                return (
                  <div key={inv.id} className="mobile-invoice-card">
                    <div className="mobile-invoice-header" onClick={() => toggleInvoiceExpand(inv.id)}>
                      <div className="mobile-invoice-number">{inv.invoice_no}</div>
                      <div className={`mobile-expand-icon ${expandedInvoice === inv.id ? 'expanded' : ''}`}>▼</div>
                    </div>

                    <div className="mobile-invoice-summary">
                      <div className="mobile-invoice-total">₹{Number(inv.total_inc_tax || 0).toFixed(2)}</div>
                      <div>
                        <span className={`payment-badge ${pb.cls}`} title={isMixed(inv) ? pb.label : undefined}>
                          {isMixed(inv) ? '🔀 Mixed' : pb.label}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className={`status-badge ${sb.cls}`}>{sb.label}</span>
                    </div>

                    <div className={`mobile-invoice-details ${expandedInvoice === inv.id ? 'expanded' : ''}`}>
                      <div className="mobile-detail-row"><span className="mobile-detail-label">Date</span><span className="mobile-detail-value">{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</span></div>
                      <div className="mobile-detail-row"><span className="mobile-detail-label">Order</span><span className="mobile-detail-value">{shortOrder(inv.order_id)}</span></div>
                      <div className="mobile-detail-row"><span className="mobile-detail-label">Customer</span><span className="mobile-detail-value">{inv.customer_name || 'N/A'}</span></div>
                      <div className="mobile-detail-row"><span className="mobile-detail-label">Taxable</span><span className="mobile-detail-value">₹{Number(inv.subtotal_ex_tax || 0).toFixed(2)}</span></div>
                      <div className="mobile-detail-row"><span className="mobile-detail-label">Tax</span><span className="mobile-detail-value" style={{ color: '#dc2626' }}>₹{Number(inv.total_tax || 0).toFixed(2)}</span></div>

                      <button className="action-btn mobile-action-btn" onClick={() => handleViewInvoice(inv)}>👁️ View Invoice PDF</button>
                      <button className="action-btn btn-void mobile-action-btn" onClick={() => voidInvoice(inv)} disabled={String(inv.status || '').toLowerCase() === 'void'}>🚫 Void</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
