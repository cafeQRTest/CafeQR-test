import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../services/supabase';

const supabase = getSupabase();

// Query Keys
export const menuKeys = {
  all: ['menu-items'],
  list: (restaurantId) => [...menuKeys.all, 'list', restaurantId],
  available: (restaurantId) => [...menuKeys.all, 'available', restaurantId],
  byCategory: (restaurantId, category) => [...menuKeys.all, 'category', restaurantId, category],
};

// Fetch all available menu items for a restaurant
async function fetchAvailableMenuItems(restaurantId) {
  if (!restaurantId) return [];
  
  const { data, error } = await supabase
    .from('menu_items')
    .select(`
      id, 
      name, 
      price, 
      category, 
      description,
      image_url,
      veg, 
      tax_rate, 
      is_packaged_good, 
      status, 
      has_variants,
      uom:unit_of_measures(short_code, precision)
    `)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'available')
    .order('category')
    .order('name');

  if (error) throw error;
  return data || [];
}

// Custom Hook to fetch available menu items with optimized caching
export function useAvailableMenuItems(restaurantId) {
  return useQuery({
    queryKey: menuKeys.available(restaurantId),
    queryFn: () => fetchAvailableMenuItems(restaurantId),
    enabled: !!restaurantId,
    staleTime: 10 * 60 * 1000, // Consider data fresh for 10 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes (replaces cacheTime)
    refetchOnMount: false, // Don't refetch on mount if data is fresh
    refetchOnWindowFocus: false, // Prevent refetch on focus/screenshot
    refetchOnReconnect: false,
  });
}
