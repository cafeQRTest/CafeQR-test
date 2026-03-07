//pages/owner/billing

import React, { useEffect, useState } from 'react';
import { getSupabase } from '../../services/supabase';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import Button from '../../components/ui/Button';
import { useRestaurantProfileConfig } from '../../hooks/useCreateOrderData';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import NiceSelect from '../../components/NiceSelect';
import DateTimeRangePicker from '../../components/ui/DateTimeRangePicker';
import { istSpanFromDatesUtcISO, istSpanFromDateTimesUtcISO } from '../../utils/istTime';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { downloadInvoicePdf } from '../../lib/downloadInvoicePdf';
import { formatQtyP } from '../../lib/qty';
import {
  FaFileDownload,
  FaChartBar,
  FaClipboardList,
  FaFileAlt,
  FaFileInvoice,
  FaMoneyBillWave,
  FaReceipt,
  FaFilePdf,
  FaBan,
  FaTimes,
  FaUser,
  FaTag,
  FaCalendarDay,
  FaWallet,
  FaCheckCircle
} from 'react-icons/fa';
const REPORT_TYPE_OPTIONS = [
  { value: 'sales', label: 'Paid Sales Only' },
  { value: 'credit', label: 'Credit / Unpaid' },
  { value: 'all', label: 'Full Audit (All)' },
  { value: 'voided', label: 'Voided History' },
];

export default function BillingPage() {
  const supabase = getSupabase();
  const { checking } = useRequireAuth(supabase);
  const { restaurant, loading: restLoading } = useRestaurant();

  const [range, setRange] = useState({
    start: new Date(new Date().setHours(0, 0, 0, 0)),
    end: new Date(),
    startTime: '00:00',
    endTime: '23:59'
  });

  const icons = {
    invoices: <FaFileInvoice style={{ color: '#6366f1', marginRight: '6px' }} />,
    taxable: <FaChartBar style={{ color: '#10b981', marginRight: '6px' }} />,
    tax: <FaReceipt style={{ color: '#ef4444', marginRight: '6px' }} />,
    cash: <FaMoneyBillWave style={{ color: '#f59e0b', marginRight: '6px' }} />,
    online: <FaClipboardList style={{ color: '#3b82f6', marginRight: '6px' }} />,
    credit: <FaFileAlt style={{ color: '#8b5cf6', marginRight: '6px' }} />
  };

  // sales = paid, credit = open credit, all = everything, voided = void only
  const [reportType, setReportType] = useState('sales');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedInvoice, setExpandedInvoice] = useState(null);

  // Void Modal State
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState('');

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
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

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const formatMoney = (n) => `₹${Number(n || 0).toFixed(2)}`;

  const getPayMethod = (inv) =>
    String(inv?.payment_method ?? inv?.paymentmethod ?? inv?.paymentMethod ?? '').toLowerCase();

  const getMixedDetails = (inv) =>
    inv?.mixed_payment_details ?? inv?.mixedpaymentdetails ?? inv?.mixedPaymentDetails ?? null;

  const pickNum = (obj, keys, fallback = 0) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null && v !== '') {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    }
    return fallback;
  };

  const getMixedSplit = (inv) => {
    const d = getMixedDetails(inv);
    return {
      cash: pickNum(d, ['cash_amount', 'cashAmount', 'cashamount'], 0),
      online: pickNum(d, ['online_amount', 'onlineAmount', 'onlineamount'], 0),
    };
  };

  const isMixed = (inv) => getPayMethod(inv) === 'mixed' && !!getMixedDetails(inv);


  const prettyMethod = (method) => {
    const m = String(method || '').toLowerCase();
    if (!m || m === 'none' || m === 'unassigned') return 'None';
    if (m === 'upi') return 'UPI';
    if (m === 'card') return 'Card';
    if (m === 'online') return 'Online';
    if (m === 'cash') return 'Cash';
    if (m === 'credit') return 'Credit';
    if (m === 'mixed') return 'Mixed';
    if (m === 'unknown') return 'None';
    return m;
  };

  const getInvoiceTotal = (inv) => {
    // Priority: total_inc_gst (Final Bill Amount with Round Off) -> total_inc_tax (Legacy)
    if (inv.total_inc_gst !== null && inv.total_inc_gst !== undefined) return Number(inv.total_inc_gst);
    return Number(inv.total_inc_tax || 0);
  };

  const getStatusLabel = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'paid') return 'Paid';
    if (s === 'unpaid') return 'Unpaid';
    if (s === 'open') return 'Open';
    if (s === 'void') return 'Void';
    return status || 'Unassigned';
  };


  const loadInvoices = async () => {
    if (!restaurant?.id || !supabase || restLoading || checking) return;

    setLoading(true);
    setError('');
    try {
      // Convert IST date range to UTC for database query
      const { startUtc, endUtc } = istSpanFromDateTimesUtcISO(range.start, range.startTime || '00:00', range.end, range.endTime || '23:59');

      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('date_ordered', startUtc)
        .lte('date_ordered', endUtc)
        .order('date_ordered', { ascending: false });

      if (error) throw error;

      // Base: exclude invoices that are not yet settled (pending, non-credit) and unrelated orphans (unpaid, non-credit)
      // Kept: paid, void, credit (even if pending/unpaid)
      let list = (data || []).filter(inv => {
        const status = String(inv.status || '').toLowerCase();
        const isCredit = String(inv.payment_method || '').toLowerCase() === 'credit';
        if (!isCredit && (status === 'pending' || status === 'unpaid')) return false;
        return true;
      });

      // Filter by report type
      if (reportType === 'sales') {
        // Paid non-credit only
        list = list.filter(inv => {
          const status = String(inv.status || '').toLowerCase();
          const isCredit = String(inv.payment_method || '').toLowerCase() === 'credit';
          return status === 'paid' && !isCredit;
        });
      } else if (reportType === 'credit') {
        // Credit orders (may be unpaid or pending)
        list = list.filter(inv => {
          const status = String(inv.status || '').toLowerCase();
          const isCredit = String(inv.payment_method || '').toLowerCase() === 'credit';
          return (isCredit || status === 'unpaid') && status !== 'void';
        });
      } else if (reportType === 'voided') {
        list = list.filter(inv => String(inv.status || '').toLowerCase() === 'void');
      } // 'all' shows everything kept by the base filter (paid + credit + void)


      // Batch-enrich invoices from order_customers junction
      const needsEnrich = list.filter(inv => inv.order_id);
      if (needsEnrich.length > 0) {
        const orderIds = needsEnrich.map(inv => inv.order_id);
        // Fetch all junction links for these orders at once
        const { data: links } = await supabase
          .from('order_customers')
          .select('order_id, customer_id, is_primary')
          .in('order_id', orderIds);

        if (links && links.length > 0) {
          const uniqueCustIds = [...new Set(links.map(l => l.customer_id).filter(Boolean))];
          const { data: rcRows } = await supabase
            .from('restaurant_customers')
            .select('customer_id, name')
            .eq('restaurant_id', restaurant.id)
            .in('customer_id', uniqueCustIds);
          const rcMap = new Map((rcRows || []).map(r => [r.customer_id, r.name]));

          // Group links by order_id
          const linksByOrder = {};
          links.forEach(l => {
            if (!linksByOrder[l.order_id]) linksByOrder[l.order_id] = [];
            linksByOrder[l.order_id].push(l);
          });

          list = list.map(inv => {
            if (!linksByOrder[inv.order_id]) return inv;
            const names = linksByOrder[inv.order_id]
              .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
              .map(l => rcMap.get(l.customer_id))
              .filter(Boolean);
            return names.length > 0 ? { ...inv, _customer_names: names } : inv;
          });
        }
      }

      setInvoices(list);

      // Compute statistics from the visible list
      const computed = {
        total_invoices: list.length,
        total_taxable: list.reduce((s, inv) => s + (parseFloat(inv.taxable_amount) || 0), 0),
        total_tax: list.reduce((s, inv) => s + (parseFloat(inv.total_tax) || 0), 0),
        total_cgst: list.reduce((s, inv) => s + (parseFloat(inv.cgst) || 0), 0),
        total_sgst: list.reduce((s, inv) => s + (parseFloat(inv.sgst) || 0), 0),
        total_igst: list.reduce((s, inv) => s + (parseFloat(inv.igst) || 0), 0),
        cash_sales: list.reduce((sum, inv) => {
          const pm = getPayMethod(inv);
          if (pm === 'cash') return sum + getInvoiceTotal(inv);
          if (isMixed(inv)) return sum + getMixedSplit(inv).cash;
          return sum;
        }, 0),

        online_sales: list.reduce((sum, inv) => {
          const pm = getPayMethod(inv);
          if (['online', 'upi', 'card'].includes(pm)) return sum + getInvoiceTotal(inv);
          if (isMixed(inv)) return sum + getMixedSplit(inv).online;
          return sum;
        }, 0),

        credit_sales: list
          .filter(inv => inv.payment_method === 'credit')
          .reduce((s, inv) => s + getInvoiceTotal(inv), 0),
      };

      setStats(computed);
      setCurrentPage(1); // Reset page on data load
    } catch (e) {
      setError(e.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const { data: profileConfig } = useRestaurantProfileConfig(restaurant?.id);
  const allowMultipleCustomers = profileConfig?.allow_multiple_customers_per_order === true;

  useEffect(() => {
    if (supabase && restaurant?.id && !restLoading && !checking) {
      loadInvoices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, range, reportType, supabase, restLoading, checking, allowMultipleCustomers]);
  const exportBillingCSV = async (type) => {
    if (!restaurant?.id) return;

    // Filter by type if specifically requested (sales or credit)
    let exportData = invoices;
    if (type === 'sales') {
      exportData = invoices.filter(inv => {
        const s = String(inv.status || '').toLowerCase();
        const pm = getPayMethod(inv);
        return s === 'paid' && pm !== 'credit';
      });
    } else if (type === 'credit') {
      exportData = invoices.filter(inv => {
        const s = String(inv.status || '').toLowerCase();
        const pm = getPayMethod(inv);
        return (pm === 'credit' || s === 'unpaid') && s !== 'void';
      });
    }

    if (exportData.length === 0) {
      alert(`No ${type} records found in the current view to export.`);
      return;
    }

    const headers = [
      'Invoice No',
      'Date',
      'Order ID',
      'Customer',
      'Status',
      'Payment Method',
      'Taxable Amount',
      'Total Tax',
      'Grand Total'
    ];
    if (allowMultipleCustomers) headers.push('All Customers');

    const rows = exportData.map(inv => {
      const date = inv.date_ordered ? new Date(inv.date_ordered).toLocaleDateString('en-IN') : '';
      const total = getInvoiceTotal(inv);
      const statusLabel = getStatusLabel(inv.status);
      const methodLabel = prettyMethod(getPayMethod(inv));
      
      const primaryCustomer = inv.customer_name || '';
      const allCustomers = allowMultipleCustomers && Array.isArray(inv._customer_names) && inv._customer_names.length > 0
        ? inv._customer_names.join(', ')
        : primaryCustomer;

      const row = [
        inv.invoice_no || '',
        date,
        inv.order_id || '',
        primaryCustomer,
        statusLabel,
        methodLabel,
        inv.taxable_amount || '0',
        inv.total_tax || '0',
        total
      ];
      if (allowMultipleCustomers) row.push(allCustomers);
      return row.map(v => `"${v}"`).join(',');
    });

    const csvContent = [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
    const dateTag = `${range.start.toISOString().slice(0, 10)}_to_${range.end.toISOString().slice(0, 10)}`;
    const fileName = `Invoices_${type}_${dateTag}.csv`;
    // Use Capacitor share similar to other exports
    if (!Capacitor.isNativePlatform()) {
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    try {
      await Filesystem.writeFile({
        directory: Directory.Cache,
        path: fileName,
        data: csvContent,
        encoding: 'utf8',
      });
      const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: fileName });
      await Share.share({ title: fileName, text: 'Cafe QR billing CSV export', url: uri, dialogTitle: 'Share billing CSV' });
    } catch (e) {
      console.error('Billing CSV export failed', e);
      alert(e.message || 'Failed to export CSV');
    }
  };

  // Keep original exportCSV for backward compatibility (optional) but replace calls
  const exportCSV = exportBillingCSV;

  const exportHsnSummary = async () => {
    if (!restaurant?.id) return;
    const { startUtc, endUtc } = istSpanFromDateTimesUtcISO(
      range.start,
      range.startTime || '00:00',
      range.end,
      range.endTime || '23:59'
    );

    const qs = new URLSearchParams({
      from: startUtc,
      to: endUtc,
      restaurant_id: restaurant.id,
    }).toString();

    const relUrl = `/api/reports/gst-hsn-summary?${qs}`;

    const dateTag = `${range.start.toISOString().slice(0, 10)}_to_${range.end.toISOString().slice(0, 10)}`;

    if (!Capacitor.isNativePlatform()) {
      window.location.href = relUrl;
      return;
    }

    try {
      const res = await fetch(relUrl);
      if (!res.ok) throw new Error('Failed to generate HSN summary CSV');
      const csv = await res.text();

      const fileName = `GST_HSN_Summary_${dateTag}.csv`;

      await Filesystem.writeFile({
        directory: Directory.Cache,
        path: fileName,
        data: csv,
        encoding: 'utf8',
      });

      const { uri } = await Filesystem.getUri({
        directory: Directory.Cache,
        path: fileName,
      });

      await Share.share({
        title: fileName,
        text: 'Cafe QR GST HSN summary CSV export',
        url: uri,
        dialogTitle: 'Share billing CSV',
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

  const handleViewDetails = async (invoice) => {
    setSelectedInvoice(invoice);
    setDetailsLoading(true);
    setInvoiceItems([]);
    try {
      // 1. Fetch order items
      const { data: items, error: itemsErr } = await supabase
        .from('order_items')
        .select('*, menu_items(name)')
        .eq('order_id', invoice.order_id);
      if (itemsErr) throw itemsErr;
      setInvoiceItems(items || []);

      // 2. Fetch customer info for this order
      // Priority: order.customer_id → restaurant_customers
      //           else → order_customers junction → restaurant_customers (batch)
      if (invoice.order_id && restaurant?.id) {
        // Already has customer_name on invoice — no need to fetch
        if (!invoice.customer_name) {
          const { data: order } = await supabase
            .from('orders')
            .select('customer_id, customer_name, customer_phone')
            .eq('id', invoice.order_id)
            .maybeSingle();

          let enrichedCustomers = null;

          if (order?.customer_name || order?.customer_phone) {
            // Direct name on order
            enrichedCustomers = [{ name: order.customer_name, phone: order.customer_phone, is_primary: true }];
          } else if (order?.customer_id) {
            // Look up by customer_id
            const { data: rc } = await supabase
              .from('restaurant_customers')
              .select('name, phone, customer_no')
              .eq('customer_id', order.customer_id)
              .eq('restaurant_id', restaurant.id)
              .maybeSingle();
            if (rc?.name || rc?.phone) {
              enrichedCustomers = [{ name: rc.name, phone: rc.phone, customer_no: rc.customer_no, is_primary: true }];
            }
          }

          if (!enrichedCustomers) {
            // Fall back to order_customers junction
            const { data: links } = await supabase
              .from('order_customers')
              .select('customer_id, is_primary')
              .eq('order_id', invoice.order_id);

            if (links && links.length > 0) {
              const ids = links.map(l => l.customer_id).filter(Boolean);
              const { data: rcRows } = await supabase
                .from('restaurant_customers')
                .select('customer_id, name, phone, customer_no')
                .eq('restaurant_id', restaurant.id)
                .in('customer_id', ids);
              const rcMap = new Map((rcRows || []).map(r => [r.customer_id, r]));
              const mapped = links.map(l => {
                const rc = rcMap.get(l.customer_id);
                return { name: rc?.name || null, phone: rc?.phone || null, customer_no: rc?.customer_no || null, is_primary: l.is_primary };
              }).filter(c => c.name || c.phone);
              if (mapped.length > 0) enrichedCustomers = mapped;
            }
          }

          if (enrichedCustomers) {
            setSelectedInvoice(prev => prev ? { ...prev, customers: enrichedCustomers } : prev);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch invoice details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const toggleInvoiceExpand = (invoiceId) => {
    setExpandedInvoice(expandedInvoice === invoiceId ? null : invoiceId);
  };

  // ... (existing handlers) ...

  const openVoidModal = (inv) => {
    setVoidTarget(inv);
    setVoidError('');
  };

  const handleConfirmVoid = async () => {
    if (!voidTarget?.id || !restaurant?.id) return;
    setVoidLoading(true);
    setVoidError('');
    try {
      const res = await fetch('/api/invoices/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: voidTarget.id,
          restaurant_id: restaurant.id,
          reason: 'Owner voided from Billing',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to void');
      }
      // Success
      setVoidTarget(null);
      await loadInvoices(); // Refresh list
    } catch (e) {
      setVoidError(e.message || 'Failed to void invoice');
    } finally {
      setVoidLoading(false);
    }
  };

  // ... (inside render) ...



  if (checking || restLoading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!restaurant?.id) return <div style={{ padding: 16 }}>No restaurant selected</div>;

  return (
    <div className="expenses-page page">
      <div className="expenses-header-row">
        <div>
          <h1 className="expenses-title">Billing & GST</h1>
          <p className="expenses-sub">
            Track your invoices, GST collections and export period audits.
          </p>
        </div>
        <DateTimeRangePicker
          start={range.start}
          end={range.end}
          startTime={range.startTime}
          endTime={range.endTime}
          onChange={setRange}
        />
      </div>

      {error && (
        <Card className="expenses-error">
          {error}
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>Loading…</div>
      ) : (
        <>
          {/* KPI strip - 6 Pills style like Sales Reports */}
          <div className="expenses-kpis">
            <Card className="kpi-pill" style={{ '--pill-color': '#6366f1' }}>
              <div className="label">{icons.invoices} Total Invoices</div>
              <div className="value">{stats.total_invoices}</div>
            </Card>

            <Card className="kpi-pill" style={{ '--pill-color': '#10b981' }}>
              <div className="label">{icons.taxable} Taxable Value</div>
              <div className="value" style={{ color: '#059669' }}>{formatMoney(stats.total_taxable)}</div>
            </Card>

            <Card className="kpi-pill" style={{ '--pill-color': '#ef4444' }}>
              <div className="label">{icons.tax} Total Tax (GST)</div>
              <div className="value" style={{ color: '#dc2626' }}>{formatMoney(stats.total_tax)}</div>
            </Card>

            <Card className="kpi-pill" style={{ '--pill-color': '#f59e0b' }}>
              <div className="label">{icons.cash} Cash Sales</div>
              <div className="value" style={{ color: '#b45309' }}>{formatMoney(stats.cash_sales)}</div>
            </Card>

            <Card className="kpi-pill" style={{ '--pill-color': '#3b82f6' }}>
              <div className="label">{icons.online} Online Sales</div>
              <div className="value" style={{ color: '#1d4ed8' }}>{formatMoney(stats.online_sales)}</div>
            </Card>

            <Card className="kpi-pill" style={{ '--pill-color': '#8b5cf6' }}>
              <div className="label">{icons.credit} Credit Sales</div>
              <div className="value" style={{ color: '#7c3aed' }}>{formatMoney(stats.credit_sales)}</div>
            </Card>
          </div>

          {/* Export Section - Horizontal Strip */}
          <div className="export-reports-strip">
            <div className="strip-info">
              <FaFileDownload className="info-icon" />
              <span>Export Reports</span>
            </div>
            <div className="export-actions">
              <button className="exp-pill" onClick={() => exportCSV('sales')} disabled={loading || stats.total_invoices === 0}>
                <FaChartBar /> Export Sales CSV
              </button>
              <button className="exp-pill" onClick={() => exportCSV('credit')} disabled={loading || stats.total_invoices === 0}>
                <FaClipboardList /> Export Credit CSV
              </button>
              <button className="exp-pill" onClick={() => exportCSV('all')} disabled={loading || stats.total_invoices === 0}>
                <FaFileAlt /> Export All CSV
              </button>
              <button className="exp-pill" onClick={exportHsnSummary} disabled={loading || stats.total_invoices === 0}>
                <FaFileInvoice /> HSN Summary CSV
              </button>
            </div>
          </div>

          <Card className="expenses-card">
            <div className="expenses-list-head">
              <h3 className="section-title">Recent Invoices ({invoices.length})</h3>
              <div className="expenses-filters">
                <div style={{ width: 220 }}>
                  <NiceSelect
                    options={REPORT_TYPE_OPTIONS}
                    value={reportType}
                    onChange={setReportType}
                    placeholder="Report Type"
                  />
                </div>
              </div>
            </div>

            <div className="expenses-table-wrapper">
              <Table
                columns={[
                  {
                    header: 'No.',
                    accessor: 'invoice_no',
                    cell: (r) => (
                      <button className="id-bubble" onClick={() => handleViewDetails(r)}>
                        {r.invoice_no}
                      </button>
                    )
                  },
                  {
                    header: 'Date & Time',
                    accessor: 'date_ordered',
                    cell: (r) =>
                      new Date(r.date_ordered || r.invoice_date).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      }),
                  },

                  { header: 'Customer', accessor: 'customer_name', cell: (r) => {
                    if (r.customer_name) return r.customer_name;
                    if (r._customer_names?.length > 0) {
                      return (
                        <span style={{ color: '#334155' }}>
                          {r._customer_names.map((n, i) => (
                            <span key={i}>
                              {i > 0 && <span style={{ color: '#94a3b8', margin: '0 2px' }}>,</span>}
                              <span style={{ background: '#f1f5f9', borderRadius: 4, padding: '1px 5px', fontSize: 12, fontWeight: 600 }}>{n}</span>
                            </span>
                          ))}
                        </span>
                      );
                    }
                    return '';
                  }},
                  { header: 'Taxable', accessor: 'taxable_amount', cell: (r) => formatMoney(r.taxable_amount) },
                  { header: 'Tax', accessor: 'total_tax', cell: (r) => <span style={{ color: '#dc2626', fontWeight: 600 }}>{formatMoney(r.total_tax)}</span> },
                  { header: 'Total', accessor: 'total_inc_tax', cell: (r) => <span style={{ fontWeight: 800, color: '#0f172a' }}>{formatMoney(getInvoiceTotal(r))}</span> },
                  { header: 'Payment', accessor: 'payment_method', cell: (r) => <span className={`status-pill ${r.payment_method}`}>{prettyMethod(r.payment_method)}</span> },
                  { header: 'Status', accessor: 'status', cell: (r) => <span className={`status-pill status-${r.status}`}>{getStatusLabel(r.status)}</span> },
                  {
                    header: 'Actions',
                    accessor: 'actions',
                    cell: (r) => (
                      <div className="expenses-actions" style={{ display: 'flex', gap: '8px' }}>
                        <button className="action-bubble pdf" onClick={() => handleViewInvoice(r)}>
                          <FaFilePdf size={12} /> PDF
                        </button>
                        <button
                          className="action-bubble void"
                          onClick={() => openVoidModal(r)}
                          disabled={String(r.status || '').toLowerCase() === 'void'}
                        >
                          <FaBan size={11} /> Void
                        </button>
                      </div>
                    )
                  }
                ]}
                data={invoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
              />

              {invoices.length > itemsPerPage && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{ fontSize: 13, padding: '8px 16px' }}
                  >
                    Previous
                  </Button>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>
                    Page {currentPage} of {Math.ceil(invoices.length / itemsPerPage)}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(invoices.length / itemsPerPage), p + 1))}
                    disabled={currentPage >= Math.ceil(invoices.length / itemsPerPage)}
                    style={{ fontSize: 13, padding: '8px 16px' }}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Invoice Details Modal */}
          {selectedInvoice && (
            <div className="modal-overlay" onClick={() => setSelectedInvoice(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <div className="modal-tag">Invoice Details</div>
                    <h2 className="modal-title">{selectedInvoice.invoice_no}</h2>
                  </div>
                  <button className="close-btn" onClick={() => setSelectedInvoice(null)} title="Close">
                    <span className="close-icon">&times;</span>
                  </button>
                </div>

                <div className="modal-body">
                  <div className="details-grid">
                    {/* Customer section: show if invoice has direct name, or enriched customers array */}
                    {(selectedInvoice.customer_name || selectedInvoice.customers?.length > 0) && (
                      selectedInvoice.customers?.length > 0 ? (
                        selectedInvoice.customers.map((c, idx) => (
                          <div key={idx} className="detail-item">
                            <div className="d-label"><FaUser /> {c.is_primary ? 'Customer' : `Customer ${idx + 1}`}</div>
                            <div className="d-value">{c.name}{c.phone ? <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12, marginLeft: 8 }}>{c.phone}</span> : null}</div>
                          </div>
                        ))
                      ) : (
                        <div className="detail-item">
                          <div className="d-label"><FaUser /> Customer</div>
                          <div className="d-value">{selectedInvoice.customer_name}</div>
                        </div>
                      )
                    )}
                    <div className="detail-item">
                      <div className="d-label"><FaCalendarDay /> Date</div>
                      <div className="d-value">{new Date(selectedInvoice.date_ordered || selectedInvoice.invoice_date)
                        .toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })
                      }</div>
                    </div>
                    {prettyMethod(selectedInvoice.payment_method) && (
                      <div className="detail-item">
                        <div className="d-label"><FaWallet /> Payment</div>
                        <div className="d-value">
                          <span className={`status-pill ${selectedInvoice.payment_method}`}>
                            {prettyMethod(selectedInvoice.payment_method)}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="detail-item">
                      <div className="d-label"><FaCheckCircle /> Status</div>
                      <div className="d-value">
                        <span className={`status-pill status-${selectedInvoice.status}`}>
                          {getStatusLabel(selectedInvoice.status)}
                        </span>
                      </div>
                    </div>
                    {String(selectedInvoice.status || '').toLowerCase() === 'void' && selectedInvoice.regeneration_reason && (
                      <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                        <div className="d-label"><FaBan /> Cancellation Reason</div>
                        <div className="d-value" style={{
                          background: '#fef2f2', color: '#dc2626', padding: '8px 12px',
                          borderRadius: 8, fontSize: 13, fontWeight: 600, lineHeight: 1.5,
                          border: '1px solid #fee2e2'
                        }}>
                          {selectedInvoice.regeneration_reason.replace(/^void:\s*/i, '')}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="items-section">
                    <h3 className="section-label">Order Items</h3>
                    {detailsLoading ? (
                      <div className="details-loader">Fetching items…</div>
                    ) : (
                      <div className="items-list">
                        {invoiceItems.map((item, idx) => {
                          // Very robust fallback for price keys across different versions
                          const price = Number(
                            item.price ??
                            item.unit_price ??
                            item.price_at_order ??
                            item.unit_price_inc_tax ??
                            item.unit_price_ex_tax ??
                            0
                          );
                          return (
                            <div key={idx} className="item-row">
                              <div className="item-main">
                                <span className="qty">{formatQtyP(item.quantity, item.uom_precision ?? 2)}x</span>
                                <span className="name">
                                  {(() => {
                                    let n = item.menu_items?.name || item.item_name || 'Item';
                                    if (item.variant_name) {
                                      const suffix = ` (${item.variant_name})`;
                                      if (!n.endsWith(suffix)) n += suffix;
                                    }
                                    return n;
                                  })()}
                                </span>
                              </div>
                              <div className="item-price" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span>{formatMoney(price * item.quantity)}</span>
                                {(() => {
                                  const lDisc = Number(item.line_discount_amount || 0);
                                  // Fallback if line_discount_amount is missing (calc as Total - Order Share)
                                  const displayDisc = lDisc > 0 ? lDisc : Math.max(0, Number(item.discount_amount || 0) - Number(item.order_discount_share || 0));

                                  return displayDisc > 0 ? (
                                    <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>
                                      -{formatMoney(displayDisc)}
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="summary-section">
                    {Number(selectedInvoice.total_tax || 0) > 0.01 && (
                      <div className="sum-row tax">
                        <span>GST Total {selectedInvoice.prices_include_tax ? '(incl)' : ''}</span>
                        <span>{formatMoney(selectedInvoice.total_tax)}</span>
                      </div>
                    )}
                    {(Number(selectedInvoice.discount_amount || 0) > 0 || Number(selectedInvoice.order_discount_total || 0) > 0) && (
                      <div className="sum-row" style={{ color: '#ef4444' }}>
                        <span>Discount</span>
                        <span>-{formatMoney(selectedInvoice.discount_amount || selectedInvoice.order_discount_total)}</span>
                      </div>
                    )}
                    {(() => {
                      // Robust Round-off Calculation
                      const rAmt = Number(selectedInvoice.round_off_amount || 0);
                      const finalTotal = getInvoiceTotal(selectedInvoice);
                      const preRound = Number(selectedInvoice.total_inc_tax || 0);

                      // If explicit round-off is 0, but there's a difference, use derived
                      const displayRoundOff = rAmt !== 0 ? rAmt : (finalTotal - preRound);

                      if (Math.abs(displayRoundOff) > 0.01) {
                        return (
                          <div className="sum-row" style={{ color: displayRoundOff > 0 ? '#10b981' : '#ef4444' }}>
                            <span>Round-off</span>
                            <span>{displayRoundOff > 0 ? '+' : ''}{formatMoney(displayRoundOff)}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <div className="sum-row grand">
                      <span>Grand Total</span>
                      <span>{formatMoney(getInvoiceTotal(selectedInvoice))}</span>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <Button variant="outline" onClick={() => setSelectedInvoice(null)}>Close</Button>
                  <Button variant="outline" onClick={() => exportBillingCSV('sales')} title="Export to CSV">
                    <FaFileDownload /> Export
                  </Button>
                  <Button onClick={() => handleViewInvoice(selectedInvoice)}>Download PDF</Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Void Confirmation Modal */}
      {voidTarget && (
        <div className="modal-overlay" onClick={() => !voidLoading && setVoidTarget(null)}>
          <div className="modal-content" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-tag" style={{ background: '#fef2f2', color: '#dc2626' }}>Destructive Action</div>
                <h2 className="modal-title">Void Invoice {voidTarget.invoice_no}?</h2>
              </div>
              <button className="close-btn" disabled={voidLoading} onClick={() => setVoidTarget(null)}>
                <span className="close-icon">&times;</span>
              </button>
            </div>

            <div className="modal-body">
              <p style={{ color: '#475569', margin: '0 0 16px', lineHeight: 1.5 }}>
                Are you sure you want to void this invoice? This action cannot be undone and the linked order will be cancelled.
              </p>

              {voidError && (
                <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                  {voidError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <Button variant="outline" onClick={() => setVoidTarget(null)} disabled={voidLoading}>Cancel</Button>
                <Button
                  onClick={handleConfirmVoid}
                  disabled={voidLoading}
                  style={{ background: '#dc2626', borderColor: '#dc2626', color: 'white' }}
                >
                  {voidLoading ? 'Voiding...' : 'Confirm Void'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .expenses-page {
          width: 100%;
          background: #f8fafc;
          min-height: 100vh;
          padding-bottom: 40px;
        }

        .expenses-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 32px;
          flex-wrap: wrap;
        }

        .expenses-title {
          margin: 0;
          font-size: 28px;
          color: #0f172a;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .expenses-sub {
          margin: 4px 0 0;
          font-size: 15px;
          color: #64748b;
        }

        @media (max-width: 600px) {
          .expenses-header-row {
            flex-direction: column;
            align-items: stretch;
          }
          .expenses-title {
            font-size: 1.2rem;
          }
          .expenses-sub {
            font-size: 0.8rem;
          }
        }

        /* Export Strip Styles */
        .export-reports-strip {
           background: white;
           padding: 16px 24px;
           border-radius: 20px;
           border: 1px solid #e2e8f0;
           display: flex;
           align-items: center;
           justify-content: space-between;
           margin-bottom: 32px;
           box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
           flex-wrap: wrap;
           gap: 20px;
        }

        .strip-info {
           display: flex;
           align-items: center;
           gap: 10px;
           font-size: 16px;
           font-weight: 800;
           color: #1e293b;
        }
        .info-icon { color: #f97316; font-size: 20px; }

        .export-actions {
           display: flex;
           gap: 12px;
           flex-wrap: wrap;
        }

        .exp-pill {
           display: flex;
           align-items: center;
           gap: 8px;
           padding: 10px 18px;
           background: #ffedd5;
           border: 1px solid #fed7aa;
           border-radius: 12px;
           color: #9a3412;
           font-size: 13px;
           font-weight: 700;
           cursor: pointer;
           transition: all 0.2s;
        }
        
        .exp-pill:hover:not(:disabled) {
           background: #fdba74;
           transform: translateY(-1px);
           box-shadow: 0 4px 12px rgba(249, 115, 22, 0.15);
        }

        .exp-pill:disabled {
           opacity: 0.5;
           cursor: not-allowed;
           background: #f1f5f9;
           border-color: #e2e8f0;
           color: #94a3b8;
        }

        .expenses-kpis {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 16px;
          margin-bottom: 32px;
        }

        @media (max-width: 1400px) {
           .expenses-kpis { grid-template-columns: repeat(3, 1fr); }
        }

        @media (max-width: 900px) {
           .expenses-kpis { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 600px) {
           .expenses-kpis { grid-template-columns: 1fr; }
        }

        :global(.kpi-pill) {
          background: white;
          padding: 12px 24px;
          border-radius: 99px;
          border: 1px solid #e2e8f0;
          border-top: 3px solid var(--pill-color, #f97316);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 2px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        
        :global(.kpi-pill:hover) {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08);
          border-color: var(--pill-color, #f97316);
        }

        :global(.kpi-pill .label) {
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #64748b;
          font-weight: 700;
          margin-bottom: 2px;
        }
        :global(.kpi-pill .value) {
          font-size: 18px;
          font-weight: 800;
          color: #1e293b;
          line-height: 1;
          letter-spacing: -0.01em;
        }

        .value-row { display: flex; align-items: center; gap: 12px; }
        .v-item { font-size: 13px; font-weight: 700; color: #475569; }
        .v-sep { color: #cbd5e1; font-weight: 400; }

        .expenses-card {
          background: white;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
          overflow: hidden;
        }

        .expenses-list-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 2px solid #f97316;
        }
        .section-title {
          margin: 0;
          font-size: 18px;
          color: #0f172a;
          font-weight: 800;
        }

        .expenses-filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
        }

        .expenses-table-wrapper {
          overflow-x: auto;
        }

        .link-button {
           display: none; /* Deprecated */
        }

        .action-bubble {
           display: flex;
           align-items: center;
           gap: 6px;
           padding: 6px 12px;
           border-radius: 99px;
           font-size: 11px;
           font-weight: 800;
           cursor: pointer;
           border: 1px solid transparent;
           transition: all 0.2s;
           text-transform: uppercase;
           letter-spacing: 0.02em;
           line-height: 1;
        }

        .action-bubble.pdf {
           background: #fff7ed;
           color: #ea580c;
           border-color: #fed7aa;
        }
        .action-bubble.pdf:hover {
           background: #ea580c;
           color: white;
           box-shadow: 0 4px 12px rgba(234, 88, 12, 0.2);
        }

        .action-bubble.void {
           background: #fef2f2;
           color: #dc2626;
           border-color: #fecaca;
        }
        .action-bubble.void:hover:not(:disabled) {
           background: #dc2626;
           color: white;
           box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
        }
        .action-bubble:disabled {
           opacity: 0.4;
           cursor: not-allowed;
           filter: grayscale(1);
        }

        /* Unified status-pill from Overview */
        .status-pill {
           display: inline-block; padding: 4px 12px; border-radius: 999px;
           font-size: 11px; font-weight: 700; text-transform: uppercase;
           white-space: nowrap;
        }
        /* Methods */
        .status-pill.cash { background: #f0fdf4; color: #16a34a; }
        .status-pill.upi, .status-pill.card, .status-pill.online { background: #eff6ff; color: #2563eb; }
        .status-pill.credit { background: #fef9c3; color: #854d0e; }
        .status-pill.mixed { background: #f5f3ff; color: #7c3aed; }

        /* Invoice Status */
         .status-pill.status-paid { background: #f0fdf4; color: #16a34a; }
         .status-pill.status-open { background: #fff7ed; color: #ea580c; }
         .status-pill.status-void { background: #fef2f2; color: #dc2626; }
         .status-pill.status-unpaid { background: #fff1f2; color: #e11d48; }

        @media (max-width: 1024px) {
           .expenses-kpis { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 640px) {
          .expenses-page {
            padding: 16px;
          }
          .expenses-title {
            font-size: 22px;
          }
          .expenses-kpis {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .kpi-pill { padding: 12px 20px; border-radius: 16px; }
          .kpi-pill .value { font-size: 20px; }
        }

        .id-bubble {
           background: #f1f5f9;
           color: #0f172a;
           border: 1px solid #e2e8f0;
           padding: 4px 12px;
           border-radius: 99px;
           font-size: 12px;
           font-weight: 800;
           cursor: pointer;
           transition: all 0.2s;
        }
        .id-bubble:hover {
           background: #e2e8f0;
           border-color: #cbd5e1;
           box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal-content {
          background: white;
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
          animation: slideIn 0.3s ease-out;
          display: flex;
          flex-direction: column;
        }
        @keyframes slideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .modal-header {
          padding: 24px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }
        .modal-tag {
          font-size: 10px;
          text-transform: uppercase;
          font-weight: 800;
          color: #f97316;
          letter-spacing: 0.1em;
          margin-bottom: 4px;
        }
        .modal-title { margin: 0; font-size: 24px; color: #0f172a; font-weight: 800; }
        .close-btn {
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          margin-top: -4px;
          margin-right: -4px;
        }
        .close-icon {
          font-size: 32px;
          line-height: 1;
          color: #92400e; /* Brown cross */
          font-weight: 300;
        }
        .close-btn:hover .close-icon {
          color: #78350f;
          transform: scale(1.1);
        }

        .modal-body { 
          padding: 24px; 
          overflow-y: auto;
          flex: 1;
        }
        .modal-body::-webkit-scrollbar {
          width: 6px;
        }
        .modal-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .modal-body::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .modal-body::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 32px;
        }
        .d-label { font-size: 11px; color: #64748b; font-weight: 700; display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
        .d-value { font-size: 14px; color: #1e293b; font-weight: 700; }

        .section-label { font-size: 12px; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
        
        .items-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }
        .item-row { display: flex; justify-content: space-between; align-items: flex-start; }
        .item-main { display: flex; flex: 1; flex-direction: row; gap: 8px; align-items: baseline; }
        .qty { display: inline-block; color: #f97316; font-weight: 800; font-size: 13px; margin-right: 6px; background: #fff7ed; padding: 2px 6px; border-radius: 6px; align-self: flex-start; margin-bottom: 2px; width: fit-content; }
        .name { font-weight: 700; color: #334155; font-size: 14px; line-height: 1.4; }
        .item-price { font-weight: 800; color: #0f172a; font-size: 14px; }

        .summary-section { background: #f8fafc; padding: 20px; border-radius: 16px; display: flex; flex-direction: column; gap: 8px; }
        .sum-row { display: flex; justify-content: space-between; font-size: 14px; color: #64748b; font-weight: 600; }
        .sum-row.tax { color: #dc2626; }
        .sum-row.grand { margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 18px; color: #0f172a; font-weight: 900; }

        .modal-footer {
          padding: 16px 24px;
          border-top: 1px solid #e2e8f0;
          display: flex; gap: 12px;
          justify-content: flex-end;
          background: #f8fafc;
        }
      `}</style>
    </div>
  );
}
