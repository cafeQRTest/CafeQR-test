// pages/owner/expenses.js
import React, { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../services/supabase';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import DateRangePicker from '../../components/ui/DateRangePicker';
import Button from '../../components/ui/Button';
import NiceSelect from '../../components/NiceSelect';
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

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [manageCatName, setManageCatName] = useState('');
  const [manageEditId, setManageEditId] = useState(null);
  const [manageEditName, setManageEditName] = useState('');
  const [manageError, setManageError] = useState(null);
  const [catDeleteConfirmId, setCatDeleteConfirmId] = useState(null);

  // Reset Manager State on Open
  useEffect(() => {
    if (showCategoryManager) {
      setManageEditId(null);
      setManageCatName('');
      setManageEditName('');
      setManageError(null);
      setCatDeleteConfirmId(null);
    }
  }, [showCategoryManager]);

  useEffect(() => {
    if (showQuickAdd) {
      setManageCatName('');
      setManageError(null);
    }
  }, [showQuickAdd]);

  // Category Manager Logic
  async function addCategory() {
    if (!manageCatName.trim()) return;
    const { error } = await supabase.from('expense_categories').insert({ restaurant_id: restaurantId, name: manageCatName.trim(), sort_order: 99 });
    if (error) console.error(error);
    else { setManageCatName(''); await loadData(); }
  }
  async function saveCategoryEdit() {
    if (!manageEditId || !manageEditName.trim()) return;
    const { error } = await supabase.from('expense_categories').update({ name: manageEditName.trim() }).eq('id', manageEditId);
    if (error) console.error(error);
    else { setManageEditId(null); await loadData(); }
  }
  async function deleteCategory(id) {
    // Check if category is in use
    const { count, error: checkErr } = await supabase
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)
      .eq('restaurant_id', restaurantId);

    if (checkErr) { 
      console.error(checkErr); 
      return; 
    }

    if (count > 0) {
      setManageError(`Cannot delete: This category is used by ${count} expense(s).`);
      return;
    }

    const { error } = await supabase.from('expense_categories').delete().eq('id', id);
    if (error) { 
      console.error(error); 
      setManageError('Failed to delete category.'); 
    } else {
      setManageError(null);
      await loadData();
    }
  }

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
        expenses,
        paymentProfit,
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

  const filterCategoryOptions = useMemo(() => [
    { value: '', label: 'All categories' },
    ...categories.map((c) => ({ value: c.id, label: c.name }))
  ], [categories]);

  const formCategoryOptions = useMemo(() => [
     ...categories.map((c) => ({ value: c.id, label: c.name })),
     { value: NEW_CATEGORY_SENTINEL, label: '+ New category…' }
  ], [categories]);

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
        .gte('date_ordered', startUtc)
        .lt('date_ordered', endUtc)
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

  if (!formCategoryId) {
    alert('Please select a category');
    return;
  }
  if (!formMethod) {
    alert('Please select a payment method');
    return;
  }

  let categoryId = formCategoryId;

  try {
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

  // Trigger modal instead of window.confirm
  function handleDeleteExpense(id) {
    setDeleteConfirmId(id);
  }

  // Actual delete logic
  async function performDelete() {
    if (!supabase || !restaurantId || !deleteConfirmId) return;

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', deleteConfirmId)
      .eq('restaurant_id', restaurantId);

    if (error) {
      console.error(error);
      // No alert, just log
    }
    
    setDeleteConfirmId(null);
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
          <Button 
            onClick={openAddExpense}
            style={{ padding: '6px 16px', fontSize: '0.9rem', background: '#f97316', borderColor: '#f97316', color: 'white' }}
          >
            + Expense
          </Button>
          <Button
            onClick={handleExportCSV}
            style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#ea580c', padding: '6px 12px', fontSize: '0.9rem' }}
          >
            CSV
          </Button>
          <Button
            onClick={() => setShowCategoryManager(true)}
            style={{ background: 'white', border: '1px solid #d1d5db', color: '#374151', padding: '6px 12px', fontSize: '0.9rem' }}
          >
            Categories
          </Button>

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
            {/* Gross Sales */}
            <Card className="expenses-kpi" style={{ borderTop: '4px solid #10b981' }}>
              <div className="label">Gross Sales</div>
              <div className="value" style={{ color: '#059669' }}>{formatMoney(summary.grossSales)}</div>
            </Card>

            {/* Total Expenses */}
            <Card className="expenses-kpi" style={{ borderTop: '4px solid #ef4444' }}>
              <div className="label">Total Expenses</div>
              <div className="value" style={{ color: '#dc2626' }}>{formatMoney(summary.totalExpenses)}</div>
            </Card>

            {/* Net Profit */}
            <Card className="expenses-kpi" style={{ borderTop: `4px solid ${netProfitAccrual >= 0 ? '#10b981' : '#ef4444'}` }}>
              <div className="label">Net Profit (Accrual)</div>
              <div className="value" style={{ color: netProfitAccrual >= 0 ? '#059669' : '#dc2626' }}>
                {formatMoney(netProfitAccrual)}
              </div>
            </Card>

            {/* Credit */}
            <Card className="expenses-kpi" style={{ borderTop: '4px solid #f59e0b' }}>
              <div className="label">Credit Outstanding</div>
              <div className="value" style={{ color: '#d97706' }}>{formatMoney(creditOutstanding)}</div>
            </Card>

            {/* Net Cash */}
            <Card className="expenses-kpi" style={{ borderTop: `4px solid ${netCashProfit >= 0 ? '#10b981' : '#ef4444'}` }}>
              <div className="label" style={{ color: netCashProfit >= 0 ? '#047857' : '#b91c1c' }}>Net Cash Profit</div>
              <div className="value" style={{ color: netCashProfit >= 0 ? '#047857' : '#dc2626', fontSize: '1.5rem' }}>{formatMoney(netCashProfit)}</div>
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
                <div style={{ width: 220 }}>
                  <NiceSelect
                    options={filterCategoryOptions}
                    value={selectedCategoryId}
                    onChange={setSelectedCategoryId}
                    placeholder="All categories"
                  />
                </div>
                <span className="expenses-total-pill">
                  In view: {formatMoney(totalExpensesVisible)}
                </span>
              </div>
            </div>

            {/* On phones show a simple stacked list; on tablets/desktop show table */}


            {/* Table View (for all devices) */}
            <div className="expenses-table-wrapper">
              <Table
                columns={[
                  { header: 'Date', accessor: 'expense_date', cell: (r) => new Date(r.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
                  { header: 'Category', accessor: 'category_name' },
                  { header: 'Description', accessor: 'description' },
                  { header: 'Pay Method', accessor: 'payment_method', cell: (r) => prettyMethod(r.payment_method) },
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
    ✕
  </button>
</div>

            <form onSubmit={handleSubmitExpense} className="expenses-form">
              <label>
                <span>Date <span style={{ color: '#ef4444' }}>*</span></span>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </label>

              <label>
                <span>Category <span style={{ color: '#ef4444' }}>*</span></span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <NiceSelect
                      options={[{ value: '', label: 'Select Category' }, ...categories.map(c => ({ value: c.id, label: c.name }))]}
                      value={formCategoryId}
                      onChange={setFormCategoryId}
                      placeholder="Select Category"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQuickAdd(true)}
                    title="Add Category"
                    style={{
                      height: '42px', width: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#f97316', border: 'none', borderRadius: '6px',
                      color: 'white', fontSize: '1.5rem', lineHeight: '1', cursor: 'pointer', padding: 0,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                    }}
                  >
                    +
                  </button>
                </div>
              </label>

              <label>
                <span>Amount <span style={{ color: '#ef4444' }}>*</span></span>
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
  <NiceSelect
    options={PAYMENT_METHOD_OPTIONS}
    value={formMethod}
    onChange={setFormMethod}
    placeholder="Select..."
  />
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

              <div className="expenses-modal-actions" style={{ gap: '24px' }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingExpense(null);
                  }}
                  style={{ padding: '10px 24px' }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={!formDate || !formCategoryId || !formAmount || !formMethod}
                  style={{ 
                    padding: '10px 32px', 
                    background: (!formDate || !formCategoryId || !formAmount || !formMethod) ? '#d1d5db' : '#f97316', 
                    borderColor: (!formDate || !formCategoryId || !formAmount || !formMethod) ? '#d1d5db' : '#f97316', 
                    color: 'white',
                    cursor: (!formDate || !formCategoryId || !formAmount || !formMethod) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {editingExpense ? 'Update' : 'Save'}
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="expenses-modal-backdrop" onClick={() => setDeleteConfirmId(null)}>
          <div className="expenses-modal" style={{ maxWidth: '360px' }} onClick={(e) => e.stopPropagation()}>
            <div className="expenses-modal-header" style={{ marginBottom: '16px', borderBottom: 'none', paddingBottom: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Confirm Delete</h3>
              <button className="x" onClick={() => setDeleteConfirmId(null)}>✕</button>
            </div>
            <p style={{ color: '#4b5563', marginBottom: '24px', lineHeight: '1.5', fontSize: '0.95rem' }}>
              Are you sure you want to delete this expense? This action cannot be undone.
            </p>
            <div className="expenses-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', border: 'none', padding: 0 }}>
              <button
                type="button"
                className="link-button"
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db',
                  background: 'white', cursor: 'pointer', fontWeight: 500, color: '#374151',
                  textDecoration: 'none', fontSize: '0.9rem'
                }}
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="link-button danger"
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none',
                  background: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 600,
                  fontSize: '0.9rem'
                }}
                onClick={performDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      {showCategoryManager && (
        <div className="expenses-modal-backdrop" onClick={() => setShowCategoryManager(false)}>
          <div className="expenses-modal" style={{ maxWidth: '400px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="expenses-modal-header">
              <h3>Manage Categories</h3>
              <button className="x" onClick={() => setShowCategoryManager(false)}>✕</button>
            </div>
            
            <div style={{ padding: '24px' }}>
              {manageError && (
                <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#ef4444', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.9rem' }}>
                  {manageError}
                </div>
              )}
              
              {/* Create Section */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Create New Category</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="New Category Name"
                    value={manageCatName}
                    onChange={(e) => setManageCatName(e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                    onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                  />
                  <Button onClick={addCategory} disabled={!manageCatName.trim()} style={{ background: '#f97316', borderColor: '#f97316' }}>
                    Add
                  </Button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e5e7eb', margin: '24px 0' }}></div>

              {/* Edit Section */}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Edit Existing Category</div>
                <NiceSelect 
                   value={manageEditId || ''}
                   onChange={val => {
                      const c = categories.find(x => x.id === val);
                      if (c) { setManageEditId(c.id); setManageEditName(c.name); setCatDeleteConfirmId(null); }
                      else { setManageEditId(null); }
                   }}
                   options={categories.map(c => ({ value: c.id, label: c.name }))}
                   placeholder="Select a category to manage..."
                />

                {manageEditId && (
                   <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #e5e7eb', borderRadius: '12px', background: '#fafafa' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Edit Name</div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                         <input 
                            value={manageEditName} 
                            onChange={e=>setManageEditName(e.target.value)} 
                            style={{ flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }} 
                         />
                         <Button onClick={saveCategoryEdit} style={{ background: '#f97316', borderColor: '#f97316', color: 'white' }}>Save</Button>
                      </div>

                      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                         {catDeleteConfirmId === manageEditId ? (
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: '#fee2e2', padding: '8px 12px', borderRadius: '8px' }}>
                               <span style={{ color: '#991b1b', fontSize: '0.85rem', fontWeight: 600 }}>Confirm Delete?</span>
                               <button onClick={() => deleteCategory(manageEditId)} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Yes</button>
                               <button onClick={() => setCatDeleteConfirmId(null)} style={{ background: 'white', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>No</button>
                            </div>
                         ) : (
                            <button 
                              onClick={() => setCatDeleteConfirmId(manageEditId)} 
                              style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}
                            >
                              Delete Category
                            </button>
                         )}
                      </div>
                   </div>
                )}
              </div>
            </div>
            
            <div className="expenses-modal-actions" style={{ marginTop: '16px' }}>
              <Button onClick={() => setShowCategoryManager(false)} variant="outline">Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Category Modal */}
      {showQuickAdd && (
        <div className="expenses-modal-backdrop" onClick={() => setShowQuickAdd(false)}>
          <div className="expenses-modal" style={{ maxWidth: '360px' }} onClick={(e) => e.stopPropagation()}>
            <div className="expenses-modal-header">
              <h3>Add Category</h3>
              <button className="x" onClick={() => setShowQuickAdd(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Category Name"
                value={manageCatName}
                onChange={(e) => setManageCatName(e.target.value)}
                style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                autoFocus
              />
            </div>
            <div className="expenses-modal-actions" style={{ gap: '16px', paddingTop: '8px' }}>
              <Button 
                onClick={async () => { await addCategory(); setShowQuickAdd(false); }} 
                disabled={!manageCatName.trim()}
                style={{ padding: '8px 32px' }}
              >
                Create
              </Button>
              <Button 
                onClick={() => setShowQuickAdd(false)} 
                variant="outline"
                style={{ padding: '8px 24px' }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        /* Premium Expenses Page Styling */
        .only-mobile { display: block; }
        .hide-mobile { display: none; }

        @media (min-width: 768px) {
          .only-mobile { display: none; }
          .hide-mobile { display: block; }
        }

        .expenses-page {
          width: 100%;
          background: #f9fafb;
          min-height: 100vh;
          padding-bottom: 40px;
        }

        .expenses-header-row {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 24px;
        }

        .expenses-title {
          margin: 0;
          font-size: 1.5rem;
          color: #111827;
          font-weight: 700;
          letter-spacing: -0.025em;
        }

        .expenses-sub {
          margin: 4px 0 0;
          font-size: 0.9rem;
          color: #6b7280;
        }

        .expenses-header-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
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

        .expenses-filter-row {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        /* nice-select styling removed as requested */

        .expenses-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .expenses-kpi {
          background: white;
          padding: 20px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: transform 0.2s;
        }
        
        .expenses-kpi:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .expenses-kpi .label {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
          font-weight: 600;
        }
        .expenses-kpi .value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1f2937;
          line-height: 1.2;
        }

        .expenses-card {
          background: white;
          padding: 20px;
          border-radius: 16px;
          border: 1px solid #f3f4f6;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
          margin-bottom: 24px;
        }

        .expenses-list-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f3f4f6;
        }
        .expenses-list-head h3 {
          margin: 0;
          font-size: 1.1rem;
          color: #111827;
          font-weight: 600;
        }

        .expenses-filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
        }

        .expenses-total-pill {
          padding: 6px 12px;
          border-radius: 999px;
          background: #fff7ed;
          border: 1px solid #ffedd5;
          font-size: 0.85rem;
          color: #c2410c;
          font-weight: 600;
        }

        .expenses-table-wrapper {
          overflow: auto;
        }

        .expenses-error {
          border-radius: 12px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #991b1b;
          padding: 16px;
          margin-bottom: 24px;
        }

        /* Mobile list tiles */
        /* Mobile list tiles */
        .expenses-mobile-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .expenses-tile {
          border-radius: 12px;
          border: 1px solid #f3f4f6;
          padding: 16px;
          background: #fff;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        
        .tile-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .tile-date {
          color: #9ca3af;
          font-size: 0.85rem;
        }
        .tile-amount {
          font-weight: 700;
          font-size: 1.1rem;
          color: #111827;
        }
        
        .tile-category {
          display: inline-block;
          padding: 4px 10px;
          background: #eff6ff;
          color: #1d4ed8;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        
        .tile-method {
          display: inline-block;
          padding: 4px 10px;
          background: #fdf2f8;
          color: #be185d;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .tile-desc {
          background: #f9fafb;
          padding: 8px;
          border-radius: 6px;
          font-size: 0.85rem;
          color: #4b5563;
          margin-top: 4px;
        }

        .tile-actions {
          margin-top: 8px;
          padding-top: 12px;
          border-top: 1px solid #f3f4f6;
          justify-content: flex-end;
          gap: 12px;
        }
        
        .link-button {
          background: none;
          border: none;
          color: #f97316;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          padding: 4px 8px;
        }
        
        .link-button.danger {
          color: #ef4444;
        }

        .expenses-empty {
          text-align: center;
          padding: 40px;
          color: #9ca3af;
          background: white;
          border-radius: 12px;
          border: 1px dashed #e5e7eb;
        }

        /* Modal */
        .expenses-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(2px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 999;
          padding: 16px;
        }
        .expenses-modal {
          background: #ffffff;
          border-radius: 16px;
          max-width: 480px;
          width: 95%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          padding: 24px;
        }
        .expenses-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f3f4f6;
        }
        .expenses-modal-header h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: #111827;
        }
        .expenses-modal-header .x {
          border: none;
          background: transparent;
          color: #92400e;
          font-size: 24px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.2s;
          padding: 4px;
        }
        .expenses-modal-header .x:hover {
          opacity: 0.7;
        }

        .expenses-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .expenses-form label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-weight: 500;
          color: #374151;
          font-size: 0.9rem;
        }
        .expenses-form input,
        .expenses-form textarea {
          border-radius: 8px;
          border: 1px solid #d1d5db;
          padding: 10px 12px;
          font-size: 0.95rem;
          transition: border-color 0.15s;
          outline: none;
        }
        .expenses-form input:focus,
        .expenses-form textarea:focus {
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }
        
        .expenses-modal-actions {
          margin-top: 16px;
          padding-top: 20px;
          border-top: 1px solid #f3f4f6;
          display: flex;
          justify-content: flex-end;
          gap: 16px;
        }

        @media (max-width: 480px) {
          .expenses-page {
            padding: 12px;
          }
          .expenses-title {
            font-size: 1.25rem;
          }
          .expenses-kpis {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

