// pages/api/founder/clients/[id]/metrics.js
import { getServerSupabase } from '../../../../../services/supabase-server';
import { requireFounder } from '../../../../../services/founder-auth';
import { istSpanFromDatesUtcISO } from '../../../../../utils/istTime';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireFounder(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { id: restaurantId } = req.query;
  const { from, to } = req.query; // ISO dates or empty

  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurant id required' });
  }

  try {
    const supabase = getServerSupabase();

    // Date range defaults: today
    const startDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const endDate = to ? new Date(to) : new Date();
    const { startUtc, endUtc } = istSpanFromDatesUtcISO(startDate, endDate);

    // === 1) Sales summary (similar to pages/owner/sales) ===
    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select(`
        id,
        total_amount,
        total_inc_tax,
        total_tax,
        created_at,
        status,
        items,
        payment_method,
        actual_payment_method,
        mixed_payment_details,
        order_type
      `)
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startUtc)
      .lt('created_at', endUtc)
      .neq('status', 'cancelled');

    if (ordersErr) throw ordersErr;
    const orderData = orders || [];

    let totalOrders = orderData.length;
    let totalRevenue = 0;
    let totalTax = 0;
    let totalQuantity = 0;

    const itemCounts = {};
    const itemRevenue = {};
    const categoryMap = {};

    // Build menu item → category map
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('name, category')
      .eq('restaurant_id', restaurantId);

    const itemCategoryMap = {};
    (menuItems || []).forEach(mi => {
      itemCategoryMap[mi.name] = mi.category || 'Uncategorized';
    });

    orderData.forEach(o => {
      const revenue = Number(o.total_inc_tax ?? o.total_amount ?? 0);
      const tax = Number(o.total_tax ?? 0);
      totalRevenue += revenue;
      totalTax += tax;

      if (Array.isArray(o.items)) {
        o.items.forEach(item => {
          const name = item.name || 'Unknown Item';
          const itemCategory = itemCategoryMap[name] || item.category || 'Uncategorized';
          const quantity = Number(item.quantity) || 1;
          const price = Number(item.price) || 0;
          const itemTotal = quantity * price;

          itemCounts[name] = (itemCounts[name] || 0) + quantity;
          itemRevenue[name] = (itemRevenue[name] || 0) + itemTotal;
          totalQuantity += quantity;

          categoryMap[itemCategory] = (categoryMap[itemCategory] || 0) + itemTotal;
        });
      }
    });

    const summaryStats = {
      totalOrders,
      totalRevenue,
      totalItems: totalQuantity,
      avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      totalTax,
      cgst: totalTax / 2,
      sgst: totalTax / 2,
    };

    const itemsArray = Object.entries(itemCounts).map(([name, quantity]) => ({
      item_name: name,
      quantity_sold: quantity,
      revenue: itemRevenue[name] || 0,
      category: itemCategoryMap[name] || 'Uncategorized',
    }));

    // Payment breakdown (handles mixed)
    const paymentMap = {};
    orderData.forEach(o => {
      let method = o.actual_payment_method || o.payment_method || 'unknown';
      const amount = Number(o.total_inc_tax ?? o.total_amount ?? 0);

      if (method === 'mixed' && o.mixed_payment_details) {
        const { cash_amount, online_amount, online_method } = o.mixed_payment_details || {};
        const cashKey = 'cash';
        if (!paymentMap[cashKey]) paymentMap[cashKey] = { count: 0, amount: 0 };
        paymentMap[cashKey].count += 1;
        paymentMap[cashKey].amount += Number(cash_amount || 0);

        const onlineKey = online_method || 'online';
        if (!paymentMap[onlineKey]) paymentMap[onlineKey] = { count: 0, amount: 0 };
        paymentMap[onlineKey].count += 1;
        paymentMap[onlineKey].amount += Number(online_amount || 0);
      } else {
        if (!paymentMap[method]) paymentMap[method] = { count: 0, amount: 0 };
        paymentMap[method].count += 1;
        paymentMap[method].amount += amount;
      }
    });

    const paymentBreakdown = Object.entries(paymentMap).map(([method, data]) => ({
      payment_method: method,
      order_count: data.count,
      total_amount: data.amount,
      percentage: totalRevenue > 0 ? (data.amount / totalRevenue) * 100 : 0,
    }));

    // Order-type and category breakdown
    const orderTypeMap = {};
    orderData.forEach(o => {
      const type = o.order_type || 'counter';
      const amount = Number(o.total_inc_tax ?? o.total_amount ?? 0);
      if (!orderTypeMap[type]) orderTypeMap[type] = { count: 0, amount: 0 };
      orderTypeMap[type].count += 1;
      orderTypeMap[type].amount += amount;
    });

    const orderTypeBreakdown = Object.entries(orderTypeMap).map(([type, data]) => ({
      order_type: type,
      order_count: data.count,
      total_amount: data.amount,
      percentage: totalRevenue > 0 ? (data.amount / totalRevenue) * 100 : 0,
    }));

    const categoryBreakdown = Object.entries(categoryMap).map(([cat, amount]) => ({
      category: cat || 'Uncategorized',
      total_amount: amount,
      percentage: totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0,
    }));

    // === 2) Expenses & profit summary (similar to pages/owner/expenses) ===
    const startDateStr = startDate.toISOString().slice(0, 10);
    const endDateStr = endDate.toISOString().slice(0, 10);

    const { data: expRows, error: expErr } = await supabase
      .from('expenses')
      .select(`
        id,
        expense_date,
        amount,
        description,
        payment_method,
        category_id,
        category:expense_categories(name)
      `)
      .eq('restaurant_id', restaurantId)
      .gte('expense_date', startDateStr)
      .lte('expense_date', endDateStr)
      .order('expense_date', { ascending: false });

    if (expErr) throw expErr;

    const totalExpenses = (expRows || []).reduce(
      (s, e) => s + Number(e.amount || 0),
      0
    );

    // Sales + tax re-used from above
    // Sales + tax re-used from above
const grossSales = totalRevenue;
const totalTaxAmount = totalTax; // reuse the earlier totalTax


    // Credit transactions for period
    const { data: txns, error: txnErr } = await supabase
      .from('credit_transactions')
      .select('transaction_type, amount, transaction_date')
      .eq('restaurant_id', restaurantId)
      .gte('transaction_date', startUtc)
      .lt('transaction_date', endUtc);

    if (txnErr) throw txnErr;

    let creditExtended = 0;
    let creditPayments = 0;
    (txns || []).forEach(t => {
      const amt = Number(t.amount || 0);
      if (t.transaction_type === 'credit' || t.transaction_type === 'adjustment') {
        creditExtended += amt;
      } else if (t.transaction_type === 'payment') {
        creditPayments += amt;
      }
    });

    const netProfitAccrual = grossSales - totalExpenses;
    const creditOutstanding = creditExtended - creditPayments;
    const netCashProfit = netProfitAccrual - creditOutstanding;

    // Expenses by payment method vs sales by method
    const expenseByMethodMap = {};
    (expRows || []).forEach(e => {
      const method = e.payment_method || 'none';
      const amt = Number(e.amount || 0);
      if (!expenseByMethodMap[method]) expenseByMethodMap[method] = 0;
      expenseByMethodMap[method] += amt;
    });

    const salesByMethodMap = {};
    paymentBreakdown.forEach(row => {
      salesByMethodMap[row.payment_method] = row.total_amount;
    });

    const methodKeys = new Set([
      ...Object.keys(expenseByMethodMap),
      ...Object.keys(salesByMethodMap),
    ]);

    const paymentProfit = Array.from(methodKeys).map(m => {
      const salesAmt = salesByMethodMap[m] || 0;
      const expenseAmt = expenseByMethodMap[m] || 0;
      return {
        payment_method: m,
        sales_amount: salesAmt,
        expense_amount: expenseAmt,
        profit: salesAmt - expenseAmt,
      };
    });

    // === 3) Credit snapshot (using existing views) ===
    const { data: customersNow, error: ledgerErr } = await supabase
      .from('v_credit_customer_ledger')
      .select('id, name, phone, status, total_extended_calc, current_balance_calc')
      .eq('restaurant_id', restaurantId);

    if (ledgerErr && ledgerErr.code !== '42P01') throw ledgerErr;

return res.status(200).json({
  range: {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  },
  sales: {
    summaryStats,
    items: itemsArray,
    paymentBreakdown,
    orderTypeBreakdown,
    categoryBreakdown,
  },
  expenses: {
    summary: {
      grossSales,
      totalTax: totalTaxAmount,
      totalExpenses,
      creditExtended,
      creditPayments,
      netProfitAccrual,
      creditOutstanding,
      netCashProfit,
    },
    entries: expRows || [],
    paymentProfit,
  },
  credit: {
    customersNow: customersNow || [],
  },
});

  } catch (err) {
    console.error('[founder/clients/:id/metrics] Error:', err);
    return res.status(500).json({ error: 'Failed to load client metrics' });
  }
}
