import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../services/supabase';

const supabase = getSupabase();

export const orderHistoryKeys = {
  all: ['order-history'],
  today: (restaurantId) => [...orderHistoryKeys.all, 'today', restaurantId],
};

async function fetchTodayCompletedOrders(restaurantId) {
  if (!restaurantId) return [];

  // Get boundaries for today in Asia/Kolkata (IST)
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

  // Fetch completed orders for today
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      tables (identifier),
      invoices (invoice_no, bill_no),
      order_items (
        *,
        menu_items (name)
      )
    `)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed')
    .gte('created_at', startOfDay)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching today completed orders:', error);
    throw error;
  }

  return data || [];
}

export function useCompletedOrders(restaurantId) {
  return useQuery({
    queryKey: orderHistoryKeys.today(restaurantId),
    queryFn: () => fetchTodayCompletedOrders(restaurantId),
    enabled: !!restaurantId,
    refetchInterval: 60000, // Refresh every minute
  });
}
