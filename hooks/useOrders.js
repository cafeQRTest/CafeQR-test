import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '../services/supabase';

const supabase = getSupabase();

export const orderKeys = {
  all: ['orders'],
  list: (restaurantId, type) => [...orderKeys.all, 'list', restaurantId, type],
};

async function fetchOrders(restaurantId, type) {
  let query = supabase
    .from('orders')
    .select(`
      *,
      order_items!inner(
        *,
        menu_items(name)
      )
    `)
    .eq('restaurant_id', restaurantId)
    .neq('status', 'completed')
    .neq('status', 'cancelled');

  if (type && type !== 'all') {
    query = query.eq('order_type', type);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export function useOrders(restaurantId, type) {
  return useQuery({
    queryKey: orderKeys.list(restaurantId, type),
    queryFn: () => fetchOrders(restaurantId, type),
    enabled: !!restaurantId,
    refetchInterval: 10000, // Poll every 10 seconds for real-time feel
  });
}
