// pages/founder/index.js
import React, { useEffect, useState } from 'react';
import { getSupabase } from '../../services/supabase';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import { useRouter } from 'next/router';

function formatMoney(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

export default function FounderClientsPage() {
  const supabase = getSupabase();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clients, setClients] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError('Please log in as a founder to view this dashboard.');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/founder/clients', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load clients');

        if (!cancelled) setClients(json.clients || []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load clients');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [supabase]);

  if (loading) return <div style={{ padding: 24 }}>Loading founder dashboard…</div>;

  if (error) {
    return (
      <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <Card style={{ padding: 16, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b' }}>
          {error}
        </Card>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Founders Dashboard — Clients</h1>
      <p style={{ marginTop: 0, color: '#6b7280' }}>
        Read-only overview of all restaurants, subscriptions, and key 30‑day metrics.
      </p>

      <Card style={{ padding: 12 }}>
        <Table
          columns={[
            { header: 'Name', accessor: 'name' },
            { header: 'Owner Email', accessor: 'owner_email' },
            {
              header: 'Sub Status',
              accessor: 'subscription_status',
              cell: (row) => `${row.subscription.status} (${row.subscription.days_left}d)`
            },
            {
              header: '30d Revenue',
              accessor: 'revenue_30d',
              cell: (row) => formatMoney(row.metrics_30d.revenue),
            },
            {
              header: '30d Orders',
              accessor: 'orders_30d',
              cell: (row) => row.metrics_30d.orders_count,
            },
            {
              header: '30d Expenses',
              accessor: 'expenses_30d',
              cell: (row) => formatMoney(row.metrics_30d.expenses),
            },
            {
              header: 'Credit Outst.',
              accessor: 'credit_outstanding',
              cell: (row) => formatMoney(row.metrics_30d.credit_outstanding),
            },
            {
              header: 'Features',
              accessor: 'features',
              cell: (row) => {
                const f = row.features;
                const enabled = [];
                if (f.credit) enabled.push('Credit');
                if (f.production) enabled.push('Prod');
                if (f.inventory) enabled.push('Inv');
                if (f.table_ordering) enabled.push('Tables');
                if (f.online_payment) enabled.push('OnlinePay');
                if (f.swiggy) enabled.push('Swiggy');
                if (f.zomato) enabled.push('Zomato');
                return enabled.join(', ') || '—';
              },
            },
            {
              header: 'View',
              accessor: 'actions',
              cell: (row) => (
                <button
                  onClick={() => router.push(`/founder/${row.id}`)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#111827',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Open
                </button>
              ),
            },
          ]}
          data={clients}
        />
      </Card>
    </div>
  );
}
