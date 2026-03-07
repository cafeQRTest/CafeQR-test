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

  const todayIst = istYmdFromDate(new Date());
  const { startUtc } = istDayRangeUtcISO(todayIst);

  // Fetch completed orders for today IST
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      invoices(*),
      order_items(*, menu_items(name, uom:unit_of_measures(precision))),
      order_customers(*, restaurant_customer(name, phone, age, customer_no))
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
    staleTime: 0,
    refetchInterval: 60000, // Refresh every minute
  });
}
