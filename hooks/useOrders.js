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
      ),
      order_customers(*, restaurant_customer(name, phone, age, customer_no))
    `)
    .eq('restaurant_id', restaurantId)
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .neq('status', 'pending_acceptance');

  if (type && type !== 'all') {
    query = query.eq('order_type', type);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;
  
  if (data) {
    data.forEach(order => {
      if (order.customer_name || order.customer_phone) {
        order.customers = [{
          name: order.customer_name,
          phone: order.customer_phone,
          is_primary: true
        }];
      } else if (order.order_customers && order.order_customers.length > 0) {
        order.customers = order.order_customers.map(link => ({
          id: link.customer_id,
          name: link.restaurant_customer?.name || null,
          phone: link.restaurant_customer?.phone || null,
          age: link.restaurant_customer?.age || null,
          customer_no: link.restaurant_customer?.customer_no || null,
          is_primary: link.is_primary
        }));
      }
    });
  }
  
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
