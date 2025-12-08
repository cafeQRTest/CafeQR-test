// pages/founder/[id].js
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabase } from '../../services/supabase';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import DateRangePicker from '../../components/ui/DateRangePicker';

function formatMoney(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

export default function FounderClientDetailPage() {
  const supabase = getSupabase();
  const router = useRouter();
  const { id } = router.query;

  const [range, setRange] = useState({
    start: new Date(new Date().setHours(0, 0, 0, 0)),
    end: new Date(),
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError('Please log in as a founder to view this client.');
          setLoading(false);
          return;
        }

        const params = new URLSearchParams({
          from: range.start.toISOString().slice(0, 10),
          to: range.end.toISOString().slice(0, 10),
        });

        const res = await fetch(`/api/founder/clients/${id}/metrics?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load client metrics');

        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load client metrics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id, supabase, range.start, range.end]);

  if (!id) return <div style={{ padding: 24 }}>Loading…</div>;
  if (loading) return <div style={{ padding: 24 }}>Loading client details…</div>;

  if (error) {
    return (
      <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <Card style={{ padding: 16, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b' }}>
          {error}
        </Card>
      </div>
    );
  }

  const { sales, expenses, credit } = data || {};

  return (
    <div className="page" style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
      <button
        onClick={() => router.push('/founder')}
        style={{ marginBottom: 12, border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer' }}
      >
        ← Back to clients
      </button>

      <div className="header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 4 }}>Client overview</h1>
        <DateRangePicker start={range.start} end={range.end} onChange={setRange} />
      </div>

      {/* KPI strip */}
      <div
        className="grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Card>
          <div className="label">Total Orders</div>
          <div className="value">{sales?.summaryStats?.totalOrders || 0}</div>
        </Card>
        <Card>
          <div className="label">Revenue</div>
          <div className="value">{formatMoney(sales?.summaryStats?.totalRevenue || 0)}</div>
        </Card>
        <Card>
          <div className="label">Items Sold</div>
          <div className="value">{sales?.summaryStats?.totalItems || 0}</div>
        </Card>
        <Card>
          <div className="label">Net Profit (Accrual)</div>
          <div className="value">
            {formatMoney(expenses?.summary?.netProfitAccrual || 0)}
          </div>
        </Card>
        <Card>
          <div className="label">Credit Outstanding</div>
          <div className="value">
            {formatMoney(expenses?.summary?.creditOutstanding || 0)}
          </div>
        </Card>
        <Card>
          <div className="label">Net Cash Profit</div>
          <div className="value">
            {formatMoney(expenses?.summary?.netCashProfit || 0)}
          </div>
        </Card>
      </div>

      {/* Sales item-wise table */}
      <Card style={{ marginBottom: 16 }}>
        <h3>Item-wise sales</h3>
        <div className="table-wrap">
          <Table
            columns={[
              { header: 'Item', accessor: 'item_name' },
              { header: 'Qty', accessor: 'quantity_sold' },
              {
                header: 'Revenue',
                accessor: 'revenue',
                cell: (r) => formatMoney(r.revenue),
              },
              { header: 'Category', accessor: 'category' },
            ]}
            data={sales?.items || []}
          />
        </div>
      </Card>

      {/* Payment method profit */}
      <Card style={{ marginBottom: 16 }}>
        <h3>Profit by payment method</h3>
        <div className="table-wrap">
          <Table
            columns={[
              { header: 'Method', accessor: 'payment_method' },
              {
                header: 'Sales',
                accessor: 'sales_amount',
                cell: (r) => formatMoney(r.sales_amount),
              },
              {
                header: 'Expenses',
                accessor: 'expense_amount',
                cell: (r) => formatMoney(r.expense_amount),
              },
              {
                header: 'Profit',
                accessor: 'profit',
                cell: (r) => formatMoney(r.profit),
              },
            ]}
            data={expenses?.paymentProfit || []}
          />
        </div>
      </Card>

      {/* Credit snapshot */}
      <Card>
        <h3>Credit customers snapshot</h3>
        <div className="table-wrap">
          <Table
            columns={[
              { header: 'Name', accessor: 'name' },
              { header: 'Phone', accessor: 'phone' },
              { header: 'Status', accessor: 'status' },
              {
                header: 'Total Extended',
                accessor: 'total_extended_calc',
                cell: (r) => formatMoney(r.total_extended_calc),
              },
              {
                header: 'Current Balance',
                accessor: 'current_balance_calc',
                cell: (r) => formatMoney(r.current_balance_calc),
              },
            ]}
            data={credit?.customersNow || []}
          />
        </div>
      </Card>
    </div>
  );
}
