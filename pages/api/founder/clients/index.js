// pages/api/founder/clients/index.js
import { getServerSupabase } from '../../../../services/supabase-server';
import { requireFounder } from '../../../../services/founder-auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireFounder(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const supabase = getServerSupabase();

    // 1) Base restaurant info + subscription + feature flags
    const { data: restaurants, error: restErr } = await supabase
      .from('restaurants')
      .select(`
        id,
        name,
        owner_email,
        created_at,
        restaurant_profiles(
          subscription_status,
          features_credit_enabled,
          features_production_enabled,
          features_inventory_enabled,
          features_table_ordering_enabled,
          online_payment_enabled,
          swiggy_enabled,
          zomato_enabled
        ),
        restaurant_subscriptions:restaurant_subscriptions!restaurant_subscriptions_restaurant_id_fkey(
          status,
          is_active,
          trial_ends_at,
          current_period_end,
          next_due_at
        )
      `)
      .order('created_at', { ascending: false });

    if (restErr) throw restErr;

    const rows = restaurants || [];
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      return res.status(200).json({ clients: [] });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // 2) Orders for last 30 days (no aggregates in SQL)
    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('restaurant_id, total_inc_tax, total_tax, status, created_at')
      .in('restaurant_id', ids)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .lt('created_at', now.toISOString())
      .neq('status', 'cancelled');

    if (ordersErr) throw ordersErr;

    const salesIndex = new Map();
    (orders || []).forEach((o) => {
      const rid = o.restaurant_id;
      if (!rid) return;

      let agg = salesIndex.get(rid);
      if (!agg) {
        agg = { orders_count: 0, revenue: 0, tax: 0 };
        salesIndex.set(rid, agg);
      }

      agg.orders_count += 1;
      agg.revenue += Number(o.total_inc_tax ?? 0);
      agg.tax += Number(o.total_tax ?? 0);
    });

    // 3) Expenses (last 30 days), summed in JS
    const startDateStr = thirtyDaysAgo.toISOString().slice(0, 10);
    const endDateStr = now.toISOString().slice(0, 10);

    const { data: expenses, error: expErr } = await supabase
      .from('expenses')
      .select('restaurant_id, amount, expense_date')
      .in('restaurant_id', ids)
      .gte('expense_date', startDateStr)
      .lte('expense_date', endDateStr);

    if (expErr) throw expErr;

    const expIndex = new Map();
    (expenses || []).forEach((e) => {
      const rid = e.restaurant_id;
      if (!rid) return;

      let total = expIndex.get(rid) || 0;
      total += Number(e.amount || 0);
      expIndex.set(rid, total);
    });

    // 4) Credit outstanding per restaurant, summed in JS
    const { data: creditRows, error: creditErr } = await supabase
      .from('v_credit_customer_ledger')
      .select('restaurant_id, current_balance_calc')
      .in('restaurant_id', ids);

    if (creditErr && creditErr.code !== '42P01') {
      // ignore if view doesn't exist; only throw for real errors
      throw creditErr;
    }

    const creditIndex = new Map();
    (creditRows || []).forEach((c) => {
      const rid = c.restaurant_id;
      if (!rid) return;

      let total = creditIndex.get(rid) || 0;
      total += Number(c.current_balance_calc || 0);
      creditIndex.set(rid, total);
    });

    // 5) Compute subscription days_left
    function computeSubscriptionStatus(subRow) {
      if (!subRow) {
        return { is_active: false, status: 'none', days_left: 0 };
      }

      const now = new Date();
      let isActive = false;
      let daysLeft = 0;

      if (subRow.status === 'trial' && subRow.trial_ends_at) {
        const trialEnd = new Date(subRow.trial_ends_at);
        if (now <= trialEnd) {
          isActive = true;
          daysLeft = Math.ceil(
            (trialEnd - now) / (1000 * 60 * 60 * 24)
          );
        }
      }

      if (subRow.status === 'active' && subRow.current_period_end) {
        const periodEnd = new Date(subRow.current_period_end);
        if (now <= periodEnd) {
          isActive = true;
          daysLeft = Math.ceil(
            (periodEnd - now) / (1000 * 60 * 60 * 24)
          );
        }
      }

      return {
        is_active: isActive,
        status: subRow.status,
        days_left: Math.max(0, daysLeft),
      };
    }

    const clients = rows.map((r) => {
      const sales = salesIndex.get(r.id) || {};
      const expensesTotal = expIndex.get(r.id) || 0;
      const creditOutstanding = creditIndex.get(r.id) || 0;

      const subSource =
        Array.isArray(r.restaurant_subscriptions)
          ? r.restaurant_subscriptions[0]
          : r.restaurant_subscriptions;

      const subInfo = computeSubscriptionStatus(subSource);

      return {
        id: r.id,
        name: r.name,
        owner_email: r.owner_email,
        created_at: r.created_at,
        subscription: {
          ...subInfo,
          trial_ends_at: subSource?.trial_ends_at || null,
          current_period_end: subSource?.current_period_end || null,
        },
        features: {
          credit: !!r.restaurant_profiles?.features_credit_enabled,
          production: !!r.restaurant_profiles?.features_production_enabled,
          inventory: !!r.restaurant_profiles?.features_inventory_enabled,
          table_ordering:
            !!r.restaurant_profiles?.features_table_ordering_enabled,
          online_payment: !!r.restaurant_profiles?.online_payment_enabled,
          swiggy: !!r.restaurant_profiles?.swiggy_enabled,
          zomato: !!r.restaurant_profiles?.zomato_enabled,
        },
        metrics_30d: {
          orders_count: Number(sales.orders_count || 0),
          revenue: Number(sales.revenue || 0),
          tax: Number(sales.tax || 0),
          expenses: Number(expensesTotal || 0),
          credit_outstanding: Number(creditOutstanding || 0),
        },
      };
    });

    return res.status(200).json({ clients });
  } catch (err) {
    console.error('[founder/clients] Error:', err);
    return res.status(500).json({ error: 'Failed to load clients' });
  }
}
