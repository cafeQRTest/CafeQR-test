import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../services/supabase';
import { istDayRangeUtcISO, istYmdFromDate } from '../utils/istTime';

const supabase = getSupabase();

export const orderHistoryKeys = {
  all: ['order-history'],
  today: (restaurantId) => [...orderHistoryKeys.all, 'today', restaurantId],
};

async function fetchCompletedOrders(restaurantId) {
  if (!restaurantId) return [];

  // Get boundaries for today in Asia/Kolkata (IST) mathematically
  // to prevent iPhone/Safari "Invalid Date" errors
  const todayIST = istYmdFromDate(new Date());
  let startUtc;
  try {
     const [y, m, d] = todayIST.split('-').map(Number);
     const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
     const midnightUtcTimestamp = Date.UTC(y, m - 1, d, 0, 0, 0);
     startUtc = new Date(midnightUtcTimestamp - istOffsetMs).toISOString();
  } catch (e) {
     // Fallback to old behavior just in case
     startUtc = istDayRangeUtcISO(todayIST).startUtc;
  }

  // Fetch completed orders for today IST
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      tables:table_id (identifier),
      invoices (invoice_no, bill_no, paid_amount, status),
      order_items (
        *,
        menu_items (name)
      ),
      order_customers (customer_id, is_primary)
    `)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed')
    .gte('created_at', startUtc)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Error fetching completed orders:', error);
    throw error;
  }

  let orders = data || [];

  // Batch-enrich orders missing customer_name from order_customers junction
  const needsEnrich = orders.filter(o => !o.customer_name && o.order_customers?.length > 0);
  if (needsEnrich.length > 0) {
    const allLinks = needsEnrich.flatMap(o => o.order_customers);
    const uniqueCustIds = [...new Set(allLinks.map(l => l.customer_id).filter(Boolean))];
    if (uniqueCustIds.length > 0) {
      const { data: rcRows } = await supabase
        .from('restaurant_customers')
        .select('customer_id, name')
        .eq('restaurant_id', restaurantId)
        .in('customer_id', uniqueCustIds);
      const rcMap = new Map((rcRows || []).map(r => [r.customer_id, r.name]));

      orders = orders.map(o => {
        if (o.customer_name || !o.order_customers?.length) return o;
        const names = o.order_customers
          .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
          .map(l => rcMap.get(l.customer_id))
          .filter(Boolean);
        return names.length > 0 ? { ...o, _customer_names: names } : o;
      });
    }
  }

  return orders;

}

export function useCompletedOrders(restaurantId) {
  return useQuery({
    queryKey: orderHistoryKeys.today(restaurantId),
    queryFn: () => fetchCompletedOrders(restaurantId),
    enabled: !!restaurantId,
    refetchInterval: 60000, // Refresh every minute
  });
}
