// pages/api/owner/ai-sales-insights.js
import { getSupabase } from '../../../services/supabase';
import { istSpanFromDatesUtcISO } from '../../../utils/istTime';
import { generateSalesSuggestions } from '../../../lib/callSalesAI';

function getDateRange(range) {
  const now = new Date();
  const start = new Date();
  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(now.getDate() - 7);
      break;
    case 'month':
      start.setDate(now.getDate() - 30);
      break;
    default:
      start.setHours(0, 0, 0, 0);
  }
  return { start, end: now };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.PERPLEXITY_API_KEY) {
    return res.status(500).json({ error: 'AI API key not configured' });
  }

  try {
    const supabase = getSupabase();
    const { restaurantId, timeRange = 'today' } = req.body || {};

    if (!restaurantId) {
      return res.status(400).json({ error: 'Missing restaurantId' });
    }

    const { start, end } = getDateRange(timeRange);
    const { startUtc, endUtc } = istSpanFromDatesUtcISO(start, end);



    // NEW: fetch restaurant metadata (name + location)
    const { data: restaurantRow, error: restError } = await supabase
      .from('restaurants')
      .select('name, created_at')
      .eq('id', restaurantId)
      .single();

    if (restError) throw restError;

    const { data: profileRow } = await supabase
      .from('restaurant_profiles')
      .select(`
        shipping_city,
        shipping_state,
        shipping_pincode,
        profile_address_city,
        profile_address_state,
        profile_address_pincode,
        profile_category,
        profile_subcategory
      `)
      .eq('restaurant_id', restaurantId)
      .maybeSingle(); // profile may or may not exist

    const restaurantMeta = {
      name: restaurantRow?.name || 'Unknown Restaurant',
      city: profileRow?.shipping_city || profileRow?.profile_address_city || null,
      state: profileRow?.shipping_state || profileRow?.profile_address_state || null,
      pincode: profileRow?.shipping_pincode || profileRow?.profile_address_pincode || null,
      category: profileRow?.profile_category || null,
      subcategory: profileRow?.profile_subcategory || null,
    };

    // Extra stats about the window
    const daysInRange = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    );
    const dateRangeLabel = `${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`;


    // 1) Fetch orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(
        `
        id,
        total_amount,
        total_inc_tax,
        total_tax,
        created_at,
        status,
        items,
        order_type,
        payment_method
      `
      )
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startUtc)
      .lt('created_at', endUtc)
      .neq('status', 'cancelled');

    if (ordersError) throw ordersError;
    const orderData = Array.isArray(orders) ? orders : [];

    // 2) Aggregate stats (same logic you already had)
    let totalOrders = orderData.length;
    let totalRevenue = 0;
    let totalTax = 0;
    const itemCounts = {};
    const itemRevenue = {};
    const hourlyMap = {};
    const orderTypeMap = {};

    const hourFmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hour12: false,
    });

    orderData.forEach((o) => {
      const revenue = Number(o.total_inc_tax ?? o.total_amount ?? 0);
      const tax = Number(o.total_tax ?? 0);
      totalRevenue += revenue;
      totalTax += tax;

      const hourKey = hourFmt.format(new Date(o.created_at));
      if (!hourlyMap[hourKey]) hourlyMap[hourKey] = { count: 0, revenue: 0 };
      hourlyMap[hourKey].count += 1;
      hourlyMap[hourKey].revenue += revenue;

      const type = o.order_type || 'counter';
      if (!orderTypeMap[type]) orderTypeMap[type] = { count: 0, revenue: 0 };
      orderTypeMap[type].count += 1;
      orderTypeMap[type].revenue += revenue;

      if (Array.isArray(o.items)) {
        o.items.forEach((it) => {
          const name = it.name || 'Unknown Item';
          const qty = Number(it.quantity) || 1;
          const price = Number(it.price) || 0;
          const r = qty * price;
          itemCounts[name] = (itemCounts[name] || 0) + qty;
          itemRevenue[name] = (itemRevenue[name] || 0) + r;
        });
      }
    });

    const itemsArray = Object.entries(itemCounts)
      .map(([name, qty]) => ({
        name,
        quantity: qty,
        revenue: itemRevenue[name] || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const topItems = itemsArray.slice(0, 5);
    const weakItems = itemsArray.slice(-5); // lowest revenue items

    const hourlyData = Object.keys(hourlyMap)
      .sort()
      .map((h) => ({
        hour: `${h}:00`,
        orders: hourlyMap[h].count,
        revenue: hourlyMap[h].revenue,
      }));

    const orderTypeData = Object.entries(orderTypeMap).map(([type, d]) => ({
      type,
      orders: d.count,
      revenue: d.revenue,
    }));

const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;


// After you compute orderData / hourlyData / orderTypeData...

// 3) Sales totals (you already have totalRevenue and totalTax)
const grossSales = totalRevenue;

// 4) Expenses in range
const { data: expRows, error: expErr } = await supabase
  .from('expenses')
  .select('amount, expense_date, category_id')
  .eq('restaurant_id', restaurantId)
  .gte('expense_date', startUtc)
  .lte('expense_date', endUtc);

if (expErr) throw expErr;
const totalExpenses = (expRows || []).reduce(
  (s, e) => s + Number(e.amount || 0),
  0
);

// 5) Credit ledger
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

const creditOutstanding = creditExtended - creditPayments;
const netProfitAccrual = grossSales - totalExpenses;
const netCashProfit = netProfitAccrual - creditOutstanding;

// 6) Opening hours
const { data: hoursRows } = await supabase
  .from('restaurant_hours')
  .select('weekday, open_time, close_time, is_open')
  .eq('restaurant_id', restaurantId);

const summaryForAI = {
  // existing fields...
  timeRange,
  dateRangeLabel,
  daysInRange,
  restaurant: restaurantMeta,
  totalOrders,
  totalRevenue,
  avgOrderValue,
  totalTax,
  topItems,
  weakItems,
  hourlyData,
  orderTypeData,

  // NEW:
  financialStats: {
    grossSales,
    totalExpenses,
    totalTax,
    netProfitAccrual,
    creditExtended,
    creditPayments,
    creditOutstanding,
    netCashProfit,
  },
  openingHours: hoursRows || [],
};


    // 3) Call the AI helper
    const suggestions = await generateSalesSuggestions(summaryForAI);

    res.status(200).json({ suggestions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to generate AI insights' });
  }
}
