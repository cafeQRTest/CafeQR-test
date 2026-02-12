import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../services/supabase';

const supabase = getSupabase();

// --- Query Keys ---
export const orderKeys = {
  all: ['create-order'],
  customers: (restaurantId) => [...orderKeys.all, 'customers', restaurantId],
  creditCustomers: (restaurantId) => [...orderKeys.all, 'creditCustomers', restaurantId],
  profile: (restaurantId) => [...orderKeys.all, 'profile', restaurantId],
};

// --- Fetch Functions ---

// 1. Fetch All Customers for search
async function fetchAllCustomers(restaurantId) {
  if (!restaurantId) return [];
  const { data, error } = await supabase
    .from('restaurant_customers')
    .select('customer_id, name, phone') 
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);
  
  if (error) throw error;
  return data || [];
}

// 2. Fetch Credit Customers
async function fetchCreditCustomers(restaurantId) {
  if (!restaurantId) return [];
  const { data, error } = await supabase
    .from('v_credit_customer_ledger')
    .select('id, name, phone, status, current_balance_calc')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .order('name');

  if (error) throw error;
  
  // Transform to match component expectation
  return (data || []).map(r => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    status: r.status,
    current_balance: Number(r.current_balance_calc || 0)
  }));
}

// 3. Fetch Restaurant Profile Config
async function fetchRestaurantProfile(restaurantId) {
  if (!restaurantId) return null;
  const { data, error } = await supabase
    .from('restaurant_profiles')
    .select('round_off_enabled, round_off_mode, round_off_auto_factor, round_off_manual_limit')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (error) throw error;
  
  if (data) {
    return {
      round_off_enabled: !!data.round_off_enabled,
      round_off_mode: data.round_off_mode || 'automatic',
      round_off_auto_factor: Number(data.round_off_auto_factor || 1),
      round_off_manual_value: 0,
      round_off_manual_limit: Number(data.round_off_manual_limit || 10)
    };
  }
  return null;
}


// --- Hooks ---

export function useAllCustomers(restaurantId) {
  return useQuery({
    queryKey: orderKeys.customers(restaurantId),
    queryFn: () => fetchAllCustomers(restaurantId),
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000, 
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCreditCustomers(restaurantId) {
  return useQuery({
    queryKey: orderKeys.creditCustomers(restaurantId),
    queryFn: () => fetchCreditCustomers(restaurantId),
    enabled: !!restaurantId,
    staleTime: 2 * 60 * 1000, 
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useRestaurantProfileConfig(restaurantId) {
  return useQuery({
    queryKey: orderKeys.profile(restaurantId),
    queryFn: () => fetchRestaurantProfile(restaurantId),
    enabled: !!restaurantId,
    staleTime: 60 * 60 * 1000, 
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
