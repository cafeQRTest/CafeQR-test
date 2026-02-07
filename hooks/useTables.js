import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '../services/supabase';

const supabase = getSupabase();

// Query Keys
export const tableKeys = {
  all: ['tables'],
  list: (restaurantId) => [...tableKeys.all, 'list', restaurantId],
  detail: (id) => [...tableKeys.all, 'detail', id],
  sections: (restaurantId) => ['sections', restaurantId],
  floors: (restaurantId) => ['floors', restaurantId],
};

// Fetch Tables
async function fetchTables(restaurantId) {
  const { data, error } = await supabase
    .from('tables')
    .select(`
      *,
      current_order:orders!current_order_id(id)
    `)
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('identifier');

  if (error) throw error;
  return data || [];
}

// Fetch Sections
async function fetchSections(restaurantId) {
  const { data, error } = await supabase
    .from('table_sections')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('display_order');

  if (error) {
    if (error.code === '42P01') {
      return [{ id: 'default', section_name: 'Main', restaurant_id: restaurantId }];
    }
    throw error;
  }
  return data || [];
}

// Fetch Floors
async function fetchFloors(restaurantId, tablesData) {
  const { data, error } = await supabase
    .from('table_floors')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('display_order');

  if (error) {
    const uniqueFloors = Array.from(new Set((tablesData || []).map(t => t.floor_level))).filter(Boolean);
    if (uniqueFloors.length === 0) uniqueFloors.push('Ground Floor', 'First Floor');
    return uniqueFloors.map((name, i) => ({ id: i, floor_name: name, fallback: true }));
  }
  return data || [];
}

// Custom Hooks
export function useTables(restaurantId) {
  return useQuery({
    queryKey: tableKeys.list(restaurantId),
    queryFn: () => fetchTables(restaurantId),
    enabled: !!restaurantId,
  });
}

export function useSections(restaurantId) {
  return useQuery({
    queryKey: tableKeys.sections(restaurantId),
    queryFn: () => fetchSections(restaurantId),
    enabled: !!restaurantId,
  });
}

export function useFloors(restaurantId, tablesData) {
  return useQuery({
    queryKey: tableKeys.floors(restaurantId),
    queryFn: () => fetchFloors(restaurantId, tablesData),
    enabled: !!restaurantId,
  });
}

// Create/Update Table Mutation
export function useTableMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ table, isEdit, restaurantId }) => {
      if (isEdit) {
        const { data, error } = await supabase
          .from('tables')
          .update(table)
          .eq('id', table.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('tables')
          .insert(table)
          .select();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch tables
      queryClient.invalidateQueries({ queryKey: tableKeys.list(variables.restaurantId) });
    },
  });
}

// Delete Table Mutation
export function useDeleteTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tableId, restaurantId }) => {
      const { error } = await supabase
        .from('tables')
        .update({ is_active: false })
        .eq('id', tableId);
      if (error) throw error;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: tableKeys.list(variables.restaurantId) });
    },
  });
}

// Update Table Status Mutation
export function useUpdateTableStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tableId, status, restaurantId }) => {
      const { error } = await supabase
        .from('tables')
        .update({ status })
        .eq('id', tableId);
      if (error) throw error;
    },
    onSuccess: (data, variables) => {
      // Optimistically update the cache
      queryClient.setQueryData(
        tableKeys.list(variables.restaurantId),
        (old) => {
          if (!old) return old;
          return old.map(table =>
            table.id === variables.tableId
              ? { ...table, status: variables.status }
              : table
          );
        }
      );
    },
  });
}
