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
      current_order:orders!current_order_id(id, is_credit, credit_customer_id)
    `)
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('identifier');

  if (error) throw error;
  
  const tables = data || [];
  return tables.sort((a, b) => 
    a.identifier.localeCompare(b.identifier, undefined, { numeric: true, sensitivity: 'base' })
  );
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
        // On edit: check if another active table already uses this identifier (case-insensitive)
        const editId = table.id;
        const { data: conflict } = await supabase
          .from('tables')
          .select('id, identifier, is_active')
          .eq('restaurant_id', restaurantId)
          .ilike('identifier', table.identifier.trim())
          .eq('is_active', true)
          .neq('id', editId);

        if (conflict && conflict.length > 0) {
          throw new Error(`A table with identifier "${table.identifier.trim()}" already exists. Please use a unique name.`);
        }

        const { data, error } = await supabase
          .from('tables')
          .update(table)
          .eq('id', editId)
          .select()
          .single();
        if (error) throw error;
        return data;

      } else {
        // On create: table can be a single object or an array (bulk)
        const tablesToInsert = Array.isArray(table) ? table : [table];
        const results = [];

        for (const t of tablesToInsert) {
          const identifier = t.identifier.trim();

          // DB-level case-insensitive check (active + soft-deleted)
          const { data: existing } = await supabase
            .from('tables')
            .select('id, identifier, is_active')
            .eq('restaurant_id', restaurantId)
            .ilike('identifier', identifier);

          const activeMatch = (existing || []).find(e => e.is_active);
          const deletedMatch = (existing || []).find(e => !e.is_active);

          if (activeMatch) {
            throw new Error(`Table "${identifier}" already exists. Please use a unique identifier.`);
          }

          if (deletedMatch) {
            // Reactivate the soft-deleted row with new field values
            const { data: restored, error: restoreErr } = await supabase
              .from('tables')
              .update({ ...t, is_active: true, identifier })
              .eq('id', deletedMatch.id)
              .select()
              .single();
            if (restoreErr) throw restoreErr;
            results.push(restored);
          } else {
            // Fresh insert
            const { data: created, error: createErr } = await supabase
              .from('tables')
              .insert([{ ...t, identifier }])
              .select()
              .single();
            if (createErr) throw createErr;
            results.push(created);
          }
        }

        return Array.isArray(table) ? results : results[0];
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
      const trimmedName = name.trim();

      // Check if a record with the same name exists (active or inactive)
      const { data: existingList } = await supabase
        .from('table_sections')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .ilike('section_name', trimmedName);

      if (existingList && existingList.length > 0) {
        // Block if already active
        if (existingList.some(e => e.is_active)) {
          throw new Error(`A section named "${trimmedName}" already exists.`);
        }
        // Reactivate the soft-deleted record, updating name to new casing
        const existing = existingList[0];
        const { data, error } = await supabase
          .from('table_sections')
          .update({ section_name: trimmedName, is_active: true })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      // No previous record — insert fresh
      const { data, error } = await supabase
        .from('table_sections')
        .insert([{ restaurant_id: restaurantId, section_name: trimmedName }])
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
      const trimmedName = name.trim();

      // Check if a record with the same name exists (active or inactive)
      const { data: existingList } = await supabase
        .from('table_floors')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .ilike('floor_name', trimmedName);

      if (existingList && existingList.length > 0) {
        // Block if already active
        if (existingList.some(e => e.is_active)) {
          throw new Error(`A floor level named "${trimmedName}" already exists.`);
        }
        // Reactivate the soft-deleted record, updating name to new casing
        const existing = existingList[0];
        const { data, error } = await supabase
          .from('table_floors')
          .update({ floor_name: trimmedName, is_active: true })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      // No previous record — insert fresh
      const { data, error } = await supabase
        .from('table_floors')
        .insert([{ restaurant_id: restaurantId, floor_name: trimmedName }])
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
