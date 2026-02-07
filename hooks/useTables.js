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
        // 'table' here is assumed to have an 'id'
        const { data, error } = await supabase
          .from('tables')
          .update(table)
          .eq('id', table.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        // 'table' can be a single object or an array for bulk creation
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
    mutationFn: async ({ tableId, restaurantId, status, extraUpdates = {} }) => {
      const { data, error } = await supabase
        .from('tables')
        .update({ status, ...extraUpdates })
        .eq('id', tableId)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate the list to ensure all fields are fresh
      queryClient.invalidateQueries({ queryKey: tableKeys.list(variables.restaurantId) });
    },
  });
}

// Section Mutations
export function useAddSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, restaurantId }) => {
      const { data, error } = await supabase
        .from('table_sections')
        .insert([{ restaurant_id: restaurantId, section_name: name }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: tableKeys.sections(variables.restaurantId) });
    },
  });
}

export function useDeleteSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sectionId, restaurantId }) => {
      const { error } = await supabase
        .from('table_sections')
        .update({ is_active: false })
        .eq('id', sectionId);
      if (error) throw error;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: tableKeys.sections(variables.restaurantId) });
    },
  });
}

// Floor Mutations
export function useAddFloor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, restaurantId }) => {
      const { data, error } = await supabase
        .from('table_floors')
        .insert([{ restaurant_id: restaurantId, floor_name: name }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: tableKeys.floors(variables.restaurantId) });
    },
  });
}

export function useDeleteFloor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ floorId, restaurantId }) => {
      const { error } = await supabase
        .from('table_floors')
        .update({ is_active: false })
        .eq('id', floorId);
      if (error) throw error;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: tableKeys.floors(variables.restaurantId) });
    },
  });
}
