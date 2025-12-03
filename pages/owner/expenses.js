// pages/owner/expenses.js
import React, { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../services/supabase';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import DateRangePicker from '../../components/ui/DateRangePicker';
import Button from '../../components/ui/Button';
import { istSpanFromDatesUtcISO } from '../../utils/istTime';
import { exportExpensesToCSV } from '../../utils/exportExpenses';


const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' }, // generic online
  { value: 'credit', label: 'Credit' },
  { value: 'none', label: 'None / Other' }
];


export default function ExpensesPage() {
  const supabase = getSupabase();
  const { checking } = useRequireAuth(supabase);
  const { restaurant, loading: restLoading } = useRestaurant();
  const restaurantId = restaurant?.id || '';

  const [range, setRange] = useState({
    start: new Date(new Date().setHours(0, 0, 0, 0)),
    end: new Date()
  });


  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [summary, setSummary] = useState({
    grossSales: 0,
    totalTax: 0,
    totalExpenses: 0,
    creditExtended: 0,
    creditPayments: 0
  });

  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formNewCategory, setFormNewCategory] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formMethod, setFormMethod] = useState('');

const [editingExpense, setEditingExpense] = useState(null);
const [paymentProfit, setPaymentProfit] = useState([]);


  const handleExportCSV = () => {
    try {
      const ok = exportExpensesToCSV({
        range,
        summary,
        expenses
      });
      if (!ok) {
        alert('❌ CSV export failed');
      } else {
        // optional: toast/snackbar instead of alert
      }
    } catch (error) {
      console.error('Expenses CSV export error:', error);
      alert(`Error exporting CSV: ${error.message}`);
    }
  };


  const NEW_CATEGORY_SENTINEL = '__NEW__';

  const startDateStr = useMemo(
    () => range.start.toISOString().slice(0, 10),
    [range.start]
  );
  const endDateStr = useMemo(
    () => range.end.toISOString().slice(0, 10),
    [range.end]
  );

  useEffect(() => {
    if (checking || restLoading || !restaurantId || !supabase) return;
    loadData();
  }, [checking, restLoading, restaurantId, range, supabase]);

  async function loadData() {
    if (!supabase || !restaurantId) return;
    setLoading(true);
    setError('');
    try {
      // 1) Categories
      const { data: catRows, error: catErr } = await supabase
        .from('expense_categories')
        .select('id, name, sort_order, is_active')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (catErr) throw catErr;
      setCategories(catRows || []);

      // 2) Expenses in range (with category name)
      const { data: expRows, error: expErr } = await supabase
        .from('expenses')
        .select(
          `
          id,
          expense_date,
          amount,
          description,
          payment_method,
          category_id,
          category:expense_categories(name)
        `
        )
        .eq('restaurant_id', restaurantId)
        .gte('expense_date', startDateStr)
        .lte('expense_date', endDateStr)
        .order('expense_date', { ascending: false });

      if (expErr) throw expErr;
      setExpenses(expRows || []);

      // 3) Sales summary (same pattern as Sales page)
      const { startUtc, endUtc } = istSpanFromDatesUtcISO(
        range.start,
        range.end
      );

      const { data: orders, error: ordersErr } = await supabase
  .from('orders')
  .select(`
    total_amount,
    total_inc_tax,
    total_tax,
    created_at,
    status,
    payment_method,
    actual_payment_method,
    mixed_payment_details
  `)

        .eq('restaurant_id', restaurantId)
        .gte('created_at', startUtc)
        .lt('created_at', endUtc)
        .neq('status', 'cancelled');

      if (ordersErr) throw ordersErr;

      let grossSales = 0;
      let totalTax = 0;
      (orders || []).forEach((o) => {
        const rev = Number(o.total_inc_tax ?? o.total_amount ?? 0);
        const tax = Number(o.total_tax ?? 0);
        grossSales += rev;
        totalTax += tax;
      });

const orderData = orders || [];

// Build sales by payment method (handles "mixed" the same way as Sales page)
const paymentMap = {};

orderData.forEach((o) => {
  let method = o.actual_payment_method || o.payment_method || 'unknown';
  const amount = Number(o.total_inc_tax ?? o.total_amount ?? 0);

  if (method === 'mixed' && o.mixed_payment_details) {
    const { cash_amount, online_amount, online_method } = o.mixed_payment_details || {};

    const cashKey = 'cash';
    if (!paymentMap[cashKey]) paymentMap[cashKey] = 0;
    paymentMap[cashKey] += Number(cash_amount || 0);

    const onlineKey = online_method || 'online';
    if (!paymentMap[onlineKey]) paymentMap[onlineKey] = 0;
    paymentMap[onlineKey] += Number(online_amount || 0);
  } else {
    if (!paymentMap[method]) paymentMap[method] = 0;
    paymentMap[method] += amount;
  }
});

      // 4) Credit ledger summary (like credit sales report)
      const { data: txns, error: txnErr } = await supabase
        .from('credit_transactions')
        .select('transaction_type, amount, transaction_date')
        .eq('restaurant_id', restaurantId)
        .gte('transaction_date', startUtc)
        .lt('transaction_date', endUtc);

      if (txnErr) throw txnErr;

      let creditExtended = 0;
      let creditPayments = 0;
      (txns || []).forEach((t) => {
        const amt = Number(t.amount || 0);
        if (t.transaction_type === 'credit' || t.transaction_type === 'adjustment') {
          creditExtended += amt;
        } else if (t.transaction_type === 'payment') {
          creditPayments += amt;
        }
      });

      const totalExpenses = (expRows || []).reduce(
        (s, e) => s + Number(e.amount || 0),
        0
      );

// Expenses by payment method
const expenseByMethodMap = {};
(expRows || []).forEach((e) => {
  const method = e.payment_method || 'none';
  const amt = Number(e.amount || 0);
  if (!expenseByMethodMap[method]) expenseByMethodMap[method] = 0;
  expenseByMethodMap[method] += amt;
});

// Combine into profit by method
const methodKeys = new Set([
  ...Object.keys(paymentMap),
  ...Object.keys(expenseByMethodMap)
]);

const profitRows = Array.from(methodKeys).map((m) => {
  const salesAmt = paymentMap[m] || 0;
  const expenseAmt = expenseByMethodMap[m] || 0;
  return {
    payment_method: m,
    sales_amount: salesAmt,
    expense_amount: expenseAmt,
    profit: salesAmt - expenseAmt
  };
});

setPaymentProfit(
  profitRows.sort((a, b) => b.profit - a.profit)
);

      setSummary({
        grossSales,
        totalTax,
        totalExpenses,
        creditExtended,
        creditPayments
      });
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }

  const filteredExpenses = useMemo(() => {
    if (!selectedCategoryId) return expenses;
    return expenses.filter((e) => e.category_id === selectedCategoryId);
  }, [expenses, selectedCategoryId]);

  const totalExpensesVisible = useMemo(
    () => filteredExpenses.reduce((s, e) => s + Number(e.amount || 0), 0),
    [filteredExpenses]
  );

  const netProfitAccrual = summary.grossSales - summary.totalExpenses;
  const creditOutstanding = summary.creditExtended - summary.creditPayments;
  const netCashProfit = netProfitAccrual - creditOutstanding;

const prettyMethod = (m) => {
  if (m === 'none' || m === 'unassigned') return 'Other / Not tagged';
  if (m === 'upi') return 'UPI';
  if (m === 'card') return 'Card';
  if (m === 'online') return 'Online';
  if (m === 'cash') return 'Cash';
  if (m === 'credit') return 'Credit';
  if (m === 'unknown') return 'Unknown';
  return m || 'Other';
};

  function formatMoney(n) {
    return `₹${Number(n || 0).toFixed(2)}`;
  }

async function handleSubmitExpense(e) {
  e.preventDefault();
  if (!supabase || !restaurantId) return;

  const amt = Number(formAmount);
  if (!amt || amt <= 0) {
    alert('Enter a positive amount');
    return;
  }

  let categoryId = formCategoryId || null;

  try {
    if (formCategoryId === NEW_CATEGORY_SENTINEL) {
      const name = formNewCategory.trim();
      if (!name) {
        alert('Enter a category name');
        return;
      }
      const { data: newCat, error: catErr } = await supabase
        .from('expense_categories')
        .insert({
          restaurant_id: restaurantId,
          name,
          sort_order: (categories?.length || 0) + 1
        })
        .select('id, name, sort_order, is_active')
        .maybeSingle();
      if (catErr) throw catErr;
      if (newCat) {
        setCategories((prev) => [...prev, newCat]);
        categoryId = newCat.id;
      }
    }

    const payload = {
      restaurant_id: restaurantId,
      category_id: categoryId,
      expense_date: formDate,
      amount: amt,
      description: formDesc || null,
      payment_method: formMethod || null
    };

    if (editingExpense) {
      // UPDATE existing row
      const { error: expErr } = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', editingExpense.id)
        .eq('restaurant_id', restaurantId);
      if (expErr) throw expErr;
    } else {
      // INSERT new row
      const { error: expErr } = await supabase.from('expenses').insert(payload);
      if (expErr) throw expErr;
    }

    // Reset form
    setEditingExpense(null);
    setFormAmount('');
    setFormDesc('');
    setFormMethod('');
    setFormNewCategory('');
    setFormCategoryId('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setShowForm(false);

    await loadData();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Failed to save expense');
  }
}


function openAddExpense() {
  setEditingExpense(null);
  setFormDate(new Date().toISOString().split('T')[0]);
  setFormCategoryId('');
  setFormNewCategory('');
  setFormAmount('');
  setFormMethod('');
  setFormDesc('');
  setShowForm(true);
}

function openEditExpense(expense) {
  setEditingExpense(expense);
  setFormDate(expense.expense_date);
  setFormCategoryId(expense.category_id || '');
  setFormNewCategory(''); // not used when editing
  setFormAmount(String(expense.amount || ''));
  setFormMethod(expense.payment_method || '');
  setFormDesc(expense.description || '');
  setShowForm(true);
}

async function handleDeleteExpense(id) {
  if (!supabase || !restaurantId) return;
  if (!window.confirm('Delete this expense?')) return;

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId);

  if (error) {
    console.error(error);
    alert(error.message || 'Failed to delete expense');
    return;
  }
  setEditingExpense(null);
  await loadData();
}

  if (checking || restLoading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!restaurantId) return <div style={{ padding: 16 }}>No restaurant selected</div>;

  return (
    <div className="expenses-page page">
      <div className="expenses-header-row">
        <div>
          <h1 className="expenses-title">Expenses &amp; Profit</h1>
          <p className="expenses-sub">
            Track daily spend and see clear profit / loss for the selected dates.
          </p>
        </div>
        <div className="expenses-header-actions">
          <DateRangePicker
            start={range.start}
            end={range.end}
            onChange={setRange}
          />
          <Button onClick={handleExportCSV}>📥 CSV</Button>
          <Button onClick={openAddExpense}>+ Add Expense</Button>

        </div>
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
          {/* KPI strip */}
          <div className="expenses-kpis grid grid-3">
            <Card className="expenses-kpi">
              <div className="label">Gross Sales</div>
              <div className="value">{formatMoney(summary.grossSales)}</div>
            </Card>
            <Card className="expenses-kpi">
              <div className="label">Total Expenses</div>
              <div className="value">{formatMoney(summary.totalExpenses)}</div>
            </Card>
            <Card className="expenses-kpi">
              <div className="label">Net Profit (Accrual)</div>
              <div className="value">{formatMoney(netProfitAccrual)}</div>
            </Card>
            <Card className="expenses-kpi">
              <div className="label">Credit Outstanding</div>
              <div className="value">{formatMoney(creditOutstanding)}</div>
            </Card>
            <Card className="expenses-kpi">
              <div className="label">Net Cash Profit</div>
              <div className="value">{formatMoney(netCashProfit)}</div>
            </Card>
          </div>

{/* Payment-method profit summary */}
<Card className="expenses-card">
  <div className="expenses-list-head">
    <h3>Profit by payment method</h3>
  </div>
  <div className="expenses-table-wrapper">
    <Table
      columns={[
        { header: 'Method', accessor: 'payment_method', cell: (r) => prettyMethod(r.payment_method) },
        {
          header: 'Sales',
          accessor: 'sales_amount',
          cell: (r) => formatMoney(r.sales_amount)
        },
        {
          header: 'Expenses',
          accessor: 'expense_amount',
          cell: (r) => formatMoney(r.expense_amount)
        },
        {
          header: 'Profit',
          accessor: 'profit',
          cell: (r) => formatMoney(r.profit)
        }
      ]}
      data={paymentProfit}
    />
  </div>
</Card>


          {/* List + filters */}
          <Card className="expenses-card">
            <div className="expenses-list-head">

              <h3>Expense entries</h3>
              <div className="expenses-filters">
                <select
                  className="expenses-select"
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="expenses-total-pill">
                  In view: {formatMoney(totalExpensesVisible)}
                </span>
              </div>
            </div>

            {/* On phones show a simple stacked list; on tablets/desktop show table */}
            <div className="expenses-mobile-list only-mobile">
  {filteredExpenses.length === 0 ? (
    <div className="expenses-empty">No expenses for this period.</div>
  ) : (
    filteredExpenses.map((e) => (
      <div key={e.id} className="expenses-tile">
        <div className="tile-row">
          <span className="tile-date">{e.expense_date}</span>
          <span className="tile-amount">{formatMoney(e.amount)}</span>
        </div>
        <div className="tile-row">
          <span className="tile-category">
            {e.category?.name || 'Uncategorized'}
          </span>
          {e.payment_method && (
            <span className="tile-method">{e.payment_method}</span>
          )}
        </div>
        {e.description && <div className="tile-desc">{e.description}</div>}

        <div className="tile-row tile-actions">
          <button
            type="button"
            className="link-button"
            onClick={() => openEditExpense(e)}
          >
            Edit
          </button>
          <button
            type="button"
            className="link-button danger"
            onClick={() => handleDeleteExpense(e.id)}
          >
            Delete
          </button>
        </div>
      </div>
    ))
  )}
</div>


            <div className="expenses-table-wrapper hide-mobile">
  <Table
    columns={[
      { header: 'Date', accessor: 'expense_date' },
      { header: 'Category', accessor: 'category_name' },
      { header: 'Description', accessor: 'description' },
      { header: 'Pay Method', accessor: 'payment_method' },
      {
        header: 'Amount',
        accessor: 'amount',
        cell: (r) => formatMoney(r.amount)
      },
      {
        header: 'Actions',
        accessor: 'actions',
        cell: (r) => (
          <div className="expenses-actions">
            <button
              type="button"
              className="link-button"
              onClick={() => openEditExpense(r._raw)}
            >
              Edit
            </button>
            <button
              type="button"
              className="link-button danger"
              onClick={() => handleDeleteExpense(r.id)}
            >
              Delete
            </button>
          </div>
        )
      }
    ]}
    data={filteredExpenses.map((e) => ({
      id: e.id,
      expense_date: e.expense_date,
      category_name: e.category?.name || 'Uncategorized',
      description: e.description || '',
      payment_method: e.payment_method || '',
      amount: e.amount,
      _raw: e
    }))}
  />
</div>

          </Card>
        </>
      )}

      {/* Modal for adding expense */}
      {showForm && (
        <div className="expenses-modal-backdrop" onClick={() => setShowForm(false)}>
          <div
            className="expenses-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="expenses-modal-header">
  <h3>{editingExpense ? 'Edit expense' : 'Add expense'}</h3>
  <button
    className="x"
    onClick={() => {
      setShowForm(false);
      setEditingExpense(null);
    }}
    aria-label="Close"
  >
    ×
  </button>
</div>

            <form onSubmit={handleSubmitExpense} className="expenses-form">
              <label>
                Date
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </label>

              <label>
                Category
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY_SENTINEL}>+ New category…</option>
                </select>
              </label>

              {formCategoryId === NEW_CATEGORY_SENTINEL && (
                <label>
                  New category name
                  <input
                    type="text"
                    value={formNewCategory}
                    onChange={(e) => setFormNewCategory(e.target.value)}
                    required
                  />
                </label>
              )}

              <label>
                Amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  required
                />
              </label>

              <label>
  Payment method
  <select
    value={formMethod}
    onChange={(e) => setFormMethod(e.target.value)}
    required
  >
    <option value="">Select…</option>
    {PAYMENT_METHOD_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
</label>


              <label>
                Description
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Optional note (grocery, staff, travel…)"
                />
              </label>

              <div className="expenses-modal-actions">
  <Button type="submit" variant="success">
    {editingExpense ? 'Update' : 'Save'}
  </Button>
  <Button
    type="button"
    variant="outline"
    onClick={() => {
      setShowForm(false);
      setEditingExpense(null);
    }}
  >
    Cancel
  </Button>
</div>

            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .expenses-page {
          width: 100%;
        }

        .expenses-header-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
        }

        .expenses-title {
          margin: 0;
          font-size: 1.4rem;
        }

        .expenses-sub {
          margin: 2px 0 0;
          font-size: 0.85rem;
          color: #6b7280;
        }

        .expenses-header-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 6px;
        }

        @media (min-width: 768px) {
          .expenses-header-row {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
          }
          .expenses-header-actions {
            margin-top: 0;
          }
        }

        .expenses-kpis {
          margin-bottom: 12px;
        }

        .expenses-kpi {
          padding: 10px;
        }
        .expenses-kpi .label {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: #6b7280;
          margin-bottom: 4px;
        }
        .expenses-kpi .value {
          font-size: 1rem;
          font-weight: 700;
        }

        .expenses-card {
          padding: 10px;
        }

        .expenses-list-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .expenses-list-head h3 {
          margin: 0;
          font-size: 0.95rem;
        }

        .expenses-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-left: auto;
        }

        .expenses-select {
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid #d1d5db;
          font-size: 0.85rem;
        }

        .expenses-total-pill {
          padding: 4px 10px;
          border-radius: 999px;
          background: #f3f4f6;
          font-size: 0.8rem;
          color: #374151;
        }

        .expenses-table-wrapper {
          max-height: 60vh;
          overflow: auto;
        }

        .expenses-error {
          margin-bottom: 10px;
          border-color: #fecaca;
          background: #fef2f2;
          color: #991b1b;
          padding: 10px;
        }

        /* Mobile list tiles */
        .expenses-tile {
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          padding: 10px;
          background: #fff;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tile-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 0.85rem;
        }
        .tile-date {
          color: #6b7280;
        }
        .tile-amount {
          font-weight: 700;
        }
        .tile-category {
          font-weight: 600;
        }
        .tile-method {
          font-size: 0.8rem;
          color: #6b7280;
        }
        .tile-desc {
          font-size: 0.8rem;
          color: #4b5563;
        }
        .expenses-empty {
          font-size: 0.85rem;
          color: #6b7280;
        }

        /* Modal */
        .expenses-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.35);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 999;
          padding: 12px;
        }
        .expenses-modal {
          background: #ffffff;
          border-radius: 10px;
          max-width: 420px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          padding: 12px 14px 14px;
        }
        .expenses-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .expenses-modal-header h3 {
          margin: 0;
          font-size: 1rem;
        }
        .expenses-modal-header .x {
          border: none;
          background: transparent;
          font-size: 20px;
          cursor: pointer;
          line-height: 1;
        }
        .expenses-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 0.9rem;
        }
        .expenses-form label {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .expenses-form input,
        .expenses-form select,
        .expenses-form textarea {
          border-radius: 6px;
          border: 1px solid #d1d5db;
          padding: 6px 8px;
          font-size: 0.9rem;
        }
        .expenses-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 6px;
        }

        @media (max-width: 480px) {
          .expenses-modal {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

