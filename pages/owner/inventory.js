//pages/owner/inventory

import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import { getSupabase } from '../../services/supabase';
import NiceSelect from '../../components/NiceSelect';

// Standard units commonly used in restaurants for ingredients
// We now fetch these from the DB, but keep a fallback just in case
const FALLBACK_UNITS = ['kg', 'g', 'L', 'ml', 'pc', 'dozen'];

function UnitSelect({ value, onChange, disabled, placeholder = 'Select unit...', options = [] }) {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (!wrapperRef.current || wrapperRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (unit) => {
    onChange(unit);
    setOpen(false);
  };

  return (
    <UnitSelectWrapper ref={wrapperRef}>
      <UnitSelectButton
        type="button"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={!value ? 'placeholder' : ''}>
          {value || placeholder}
        </span>
        <span className="chevron">▾</span>
      </UnitSelectButton>
      {open && !disabled && (
        <UnitSelectList role="listbox">
          {(options && options.length > 0 ? options : FALLBACK_UNITS).map((unit) => (
            <UnitOption
              key={unit}
              type="button"
              onClick={() => handleSelect(unit)}
              $active={unit === value}
            >
              <span>{unit}</span>
              {unit === value && <span className="check">✓</span>}
            </UnitOption>
          ))}
        </UnitSelectList>
      )}
    </UnitSelectWrapper>
  );
}

export default function InventoryPage() {
  const supabase = getSupabase();
  const { checking } = useRequireAuth(supabase)
  const { restaurant, loading: restLoading } = useRestaurant()
  const restaurantId = restaurant?.id

  const [ingredients, setIngredients] = useState([])
  const [recipes, setRecipes] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uoms, setUoms] = useState([]) // From valid unit_of_measures table
  const [error, setError] = useState('')
  const [editingIngredient, setEditingIngredient] = useState(null)
  const [ingredientForm, setIngredientForm] = useState({ name: '', unit: '', current_stock: 0, reorder_threshold: 0 })
  const [showRecipeEditor, setShowRecipeEditor] = useState(false)
  const [activeTab, setActiveTab] = useState('ingredients') // 'ingredients' or 'recipes'
  const [ingredientDialog, setIngredientDialog] = useState(null) // null, 'add', or ingredient id for edit
  const [selectedMenuItem, setSelectedMenuItem] = useState(null) // menu item currently being edited in recipe modal
  const [confirmDialog, setConfirmDialog] = useState(null) // { message, onConfirm, onCancel }
  const [ingredientFormError, setIngredientFormError] = useState('')
  const [savingRecipe, setSavingRecipe] = useState(false)
  const [recipeFormError, setRecipeFormError] = useState('')
  const [ingredientSearch, setIngredientSearch] = useState('')
  const [recipeSearch, setRecipeSearch] = useState('')

  useEffect(() => {
    if (checking || restLoading || !restaurantId || !supabase) return
    setLoading(true)
    Promise.all([
      supabase.from('ingredients').select('*').eq('restaurant_id', restaurantId),
      supabase.from('recipes').select('id,menu_item_id,variant_option_id,recipe_items(*,ingredients(name,unit))').eq('restaurant_id', restaurantId),
      supabase.from('menu_items').select('id,name,is_packaged_good').eq('restaurant_id', restaurantId),
      supabase.from('unit_of_measures').select('short_code').or(`restaurant_id.is.null,restaurant_id.eq.${restaurantId}`).order('short_code')
    ]).then(async ([ingRes, recRes, menuRes, uomRes]) => {
      if (ingRes.error || recRes.error || menuRes.error) {
        setError(ingRes.error?.message || recRes.error?.message || menuRes.error?.message)
      } else {
        setIngredients(ingRes.data || [])
        setRecipes(recRes.data || [])
        
        // Populate UOM options
        if (uomRes.data) {
           const codes = uomRes.data.map(u => u.short_code);
           // Dedup
           setUoms([...new Set(codes)]);
        }

        let items = menuRes.data || []
        // Fetch variants for these items
        if (items.length > 0) {
          const ids = items.map(i => i.id)
          const { data: vData } = await supabase
            .from('menu_items_with_variants')
            .select('id, has_variants, variants')
            .in('id', ids)
          
          if (vData) {
            items = items.map(i => {
              const enriched = vData.find(v => v.id === i.id)
              return enriched ? { ...i, ...enriched } : i
            })
          }
        }
        setMenuItems(items)
      }
      setLoading(false)
    })
  }, [checking, restLoading, restaurantId, supabase])

  // Realtime subscription for ingredients
  useEffect(() => {
    if (!restaurantId || !supabase) return;

    const channel = supabase
      .channel(`inventory-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ingredients',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setIngredients((prev) => [...prev, payload.new]);
          } else if (payload.eventType === 'UPDATE') {
            setIngredients((prev) =>
              prev.map((i) => (i.id === payload.new.id ? payload.new : i))
            );
          } else if (payload.eventType === 'DELETE') {
            setIngredients((prev) => prev.filter((i) => i.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, supabase]);

  const startEdit = (ing) => {
    setEditingIngredient(ing.id)
    setIngredientFormError('')
    setIngredientForm({
      name: ing.name,
      unit: ing.unit,
      current_stock: ing.current_stock,
      reorder_threshold: ing.reorder_threshold
    })
  }
  const resetForm = () => {
    setEditingIngredient(null)
    setIngredientFormError('')
    setIngredientForm({ name: '', unit: '', current_stock: 0, reorder_threshold: 0 })
  }

  const saveIngredient = async () => {
    if (!supabase) return
    try {
      setError('')
      setIngredientFormError('')
      const name = (ingredientForm.name || '').trim()
      const unit = (ingredientForm.unit || '').trim()
      const current_stock_num = Number(ingredientForm.current_stock)
      const reorder_threshold_num = ingredientForm.reorder_threshold === '' || ingredientForm.reorder_threshold === null || typeof ingredientForm.reorder_threshold === 'undefined'
        ? 0
        : Number(ingredientForm.reorder_threshold)

      // Validate required fields (threshold excluded)
      if (!name) throw new Error('Ingredient name is required')
      if (!editingIngredient && !unit) throw new Error('Unit is required')
      if (Number.isNaN(current_stock_num)) throw new Error('Current stock is required')

      // Uniqueness check (case-insensitive) within this restaurant
      const { data: dup, error: dupErr } = await supabase
        .from('ingredients')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .ilike('name', name)
        .limit(1)
      if (dupErr) throw dupErr
      if (dup && dup.length > 0 && (!editingIngredient || dup[0].id !== editingIngredient)) {
        throw new Error('Ingredient name must be unique')
      }

      let res
      if (editingIngredient) {
        // Do NOT allow unit change once created
        res = await supabase
          .from('ingredients')
          .update({
            name,
            current_stock: current_stock_num,
            reorder_threshold: Number.isNaN(reorder_threshold_num) ? 0 : reorder_threshold_num
          })
          .eq('id', editingIngredient)
      } else {
        res = await supabase
          .from('ingredients')
          .insert([{ restaurant_id: restaurantId, name, unit, current_stock: current_stock_num, reorder_threshold: Number.isNaN(reorder_threshold_num) ? 0 : reorder_threshold_num }])
      }
      if (res.error) throw res.error

      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .eq('restaurant_id', restaurantId)
      if (error) throw error
      setIngredients(data || [])
      resetForm()
      setIngredientDialog(null)
    } catch (e) {
      // Show error inside the modal and keep it open
      setIngredientFormError(e.message)
    }
  }

  const deleteIngredient = async (id) => {
    if (!supabase) return
    const { error } = await supabase.from('ingredients').delete().eq('id', id)
    if (error) setError(error.message)
    else setIngredients((prev) => prev.filter((i) => i.id !== id))
  }

  const askDeleteIngredient = async (id) => {
    // Check if ingredient is referenced in any recipe items
    try {
      const { data: refs, error: refsErr } = await supabase
        .from('recipe_items')
        .select('id')
        .eq('ingredient_id', id)
        .limit(1)
      if (refsErr) throw refsErr
      if (refs && refs.length > 0) {
        setConfirmDialog({
          message: 'This ingredient is used in one or more recipes and cannot be deleted.',
          onCancel: () => setConfirmDialog(null),
        })
        return
      }
    } catch (e) {
      setError(e.message)
      return
    }

    setConfirmDialog({
      message: 'Delete this ingredient?',
      onConfirm: async () => {
        await deleteIngredient(id)
        setConfirmDialog(null)
      },
      onCancel: () => setConfirmDialog(null),
    })
  }

  /* -------------------------------------------------------------------------- */
  /*                            RECIPE EDITOR STATE                             */
  /* -------------------------------------------------------------------------- */
  const [activeVariantId, setActiveVariantId] = useState("base"); // 'base' or UUID
  const [variantsRecipeState, setVariantsRecipeState] = useState({}); // { [variantId]: { items: [] } }

  const openRecipe = (menuItem) => {
    setSelectedMenuItem(menuItem || null)
    setActiveVariantId("base")
    setShowRecipeEditor(true)
    setRecipeFormError('')

    if (!menuItem) return;

    // Build initial state for all variants + base
    const initialState = {
      base: { items: [] }
    };

    if (menuItem.has_variants && menuItem.variants) {
      menuItem.variants.forEach(v => {
        initialState[v.variant_id] = { items: [] };
      });
    }

    // Populate with existing recipes
    const itemRecipes = recipes.filter(r => r.menu_item_id === menuItem.id);
    
    // Helper to map DB items to Form items
    const mapItems = (dbItems) => (dbItems || []).map((ri, i) => ({
       _key: `${ri.ingredient_id}-${i}`,
       ingredientId: ri.ingredient_id,
       quantity: Number(ri.quantity) || 0
    }));

    itemRecipes.forEach(r => {
       const key = r.variant_option_id || "base";
       if (initialState[key]) {
          initialState[key].items = mapItems(r.recipe_items);
       }
    });

    setVariantsRecipeState(initialState);
  }

  const updateVariantState = (variantId, newItems) => {
     setVariantsRecipeState(prev => ({
        ...prev,
        [variantId]: { ...prev[variantId], items: newItems }
     }));
  };

  const handleCloseRecipeEditor = () => {
    setShowRecipeEditor(false)
    setSelectedMenuItem(null)
    setVariantsRecipeState({})
    setRecipeFormError('')
  }

  // Helper: Persist a single recipe to DB
  const upsertRecipeToDb = async (menuItemId, variantId, finalItems) => {
    // 1. Check for existing recipe row
    let query = supabase
      .from('recipes')
      .select('id')
      .eq('menu_item_id', menuItemId)
      .eq('restaurant_id', restaurantId);

    if (variantId) {
      query = query.eq('variant_option_id', variantId);
    } else {
      query = query.is('variant_option_id', null);
    }

    const { data: existingRows, error: existErr } = await query.limit(1);
    if (existErr) throw existErr;

    let recipeId;
    if (existingRows && existingRows.length > 0) {
      recipeId = existingRows[0].id; // Update existing
    } else {
      // Create new
      const { data: inserted, error: insertErr } = await supabase
        .from('recipes')
        .insert([{
          menu_item_id: menuItemId,
          restaurant_id: restaurantId,
          variant_option_id: variantId
        }])
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      recipeId = inserted.id;
    }

    // 2. Replace items (transaction-like)
    await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);

    if (finalItems.length > 0) {
      const itemsToInsert = finalItems.map((item) => ({
        recipe_id: recipeId,
        ingredient_id: item.ingredientId,
        quantity: Number(item.quantity)
      }));
      await supabase.from('recipe_items').insert(itemsToInsert);
    }

    return recipeId;
  };

  // --- SAVE ALL LOGIC ---
  const handleSaveAll = async () => {
    if (!supabase || savingRecipe) return;
    try {
      setSavingRecipe(true);
      setError('');
      setRecipeFormError('');

      const menuItemId = selectedMenuItem?.id;
      if (!menuItemId) throw new Error('No menu item selected.');

      // Validate ALL recipes first
      const updatesToProcess = [];

      for (const [key, data] of Object.entries(variantsRecipeState)) {
         const rawItems = data.items || [];
         
         // Filter valid items
         const validItems = rawItems.filter(it => it.ingredientId && Number(it.quantity) > 0);
         
         // Check constraints
         const seen = new Set();
         for(const it of validItems) {
            if(seen.has(it.ingredientId)) {
               const variantName = key === 'base' ? 'Base Recipe' : (selectedMenuItem.variants?.find(v=>v.variant_id===key)?.variant_name || 'Unknown Variant');
               throw new Error(`Duplicate ingredient in ${variantName}.`);
            }
            seen.add(it.ingredientId);
         }
         
         const isBase = key === 'base';
         const variantId = isBase ? null : key;
         updatesToProcess.push({ variantId, items: validItems });
      }

      // If validation passes, save all sequentially
      const newRecipeObjects = [];
      const ingMap = new Map(ingredients.map((i) => [i.id, i]));

      for (const update of updatesToProcess) {
         const rId = await upsertRecipeToDb(menuItemId, update.variantId, update.items);
         
         newRecipeObjects.push({
           id: rId,
           menu_item_id: menuItemId,
           variant_option_id: update.variantId,
           recipe_items: update.items.map((it) => ({
             ingredient_id: it.ingredientId,
             quantity: Number(it.quantity),
             ingredients: ingMap.get(it.ingredientId) 
               ? { name: ingMap.get(it.ingredientId).name, unit: ingMap.get(it.ingredientId).unit } 
               : null
           })),
         });
      }

      // Update Local State
      setRecipes((prev) => {
         // Remove all old recipes for this item
         const otherItemsRecipes = prev.filter(r => r.menu_item_id !== menuItemId);
         return [...otherItemsRecipes, ...newRecipeObjects];
      });

      handleCloseRecipeEditor();

    } catch(e) {
       setRecipeFormError(e.message);
    } finally {
       setSavingRecipe(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                            SEARCH FILTERS                                  */
  /* -------------------------------------------------------------------------- */
  const normalizedIngredientSearch = ingredientSearch.trim().toLowerCase()
  const filteredIngredients = normalizedIngredientSearch
    ? ingredients.filter((ing) => (ing.name || '').toLowerCase().includes(normalizedIngredientSearch))
    : ingredients

  const normalizedRecipeSearch = recipeSearch.trim().toLowerCase()
  const filteredMenuItems = normalizedRecipeSearch
    ? menuItems.filter((mi) => (mi.name || '').toLowerCase().includes(normalizedRecipeSearch))
    : menuItems

  /* -------------------------------------------------------------------------- */
  /*                            RENDER                                          */
  /* -------------------------------------------------------------------------- */


  if (checking || restLoading) return <LoadingContainer>Loading…</LoadingContainer>
  if (!restaurantId) return <LoadingContainer>No restaurant found.</LoadingContainer>

  return (
    <Container>
      <Header>
        <Title>📦 Inventory Management</Title>
        <Subtitle>Manage ingredients and recipes for your menu items</Subtitle>
      </Header>

      {error && <ErrorAlert>{error}</ErrorAlert>}

      <TabContainer>
        <Tab
          $active={activeTab === 'ingredients'}
          onClick={() => setActiveTab('ingredients')}
        >
          🧂 Ingredients
        </Tab>
        <Tab
          $active={activeTab === 'recipes'}
          onClick={() => setActiveTab('recipes')}
        >
          🍳 Recipes
        </Tab>
      </TabContainer>

      {activeTab === 'ingredients' && (
        <Section>
        <SectionHeader>
          <SectionTitle>Ingredients Inventory</SectionTitle>
          <AddButton onClick={() => { setIngredientFormError(''); setIngredientDialog('add') }}>
            + Add Ingredient
          </AddButton>
        </SectionHeader>

        <SearchRow>
          <SearchInput
            type="text"
            placeholder="Search ingredients..."
            value={ingredientSearch}
            onChange={(e) => setIngredientSearch(e.target.value)}
          />
          {ingredientSearch && (
            <ClearSearchButton type="button" onClick={() => setIngredientSearch('')} aria-label="Clear ingredient search">
              ✕
            </ClearSearchButton>
          )}
        </SearchRow>

          {loading ? (
            <LoadingContainer>Loading ingredients…</LoadingContainer>
          ) : filteredIngredients.length === 0 ? (
            <EmptyState>No ingredients found.</EmptyState>
          ) : (
            <IngredientGrid>
              {filteredIngredients.map((ing) => (
                <IngredientCard key={ing.id} lowStock={ing.low_stock}>
                  <CardHeader>
                    <CardTitle>{ing.name}</CardTitle>
                    {ing.low_stock && <LowStockBadge>⚠️ Low Stock</LowStockBadge>}
                  </CardHeader>
                  <CardInfo>
                    <InfoRow>
                      <Label>Unit:</Label>
                      <Value>{ing.unit}</Value>
                    </InfoRow>
                    <InfoRow>
                      <Label>Current Stock:</Label>
                      <StockValue $low={Number(ing.current_stock) <= 0}>{ing.current_stock}</StockValue>
                    </InfoRow>
                    <InfoRow>
                      <Label>Reorder Threshold:</Label>
                      <Value>{ing.reorder_threshold}</Value>
                    </InfoRow>
                  </CardInfo>
                  <CardActions>
                    <ActionButton $edit onClick={() => {
                      startEdit(ing)
                      setIngredientDialog(ing.id)
                    }}>
                      ✎ Edit
                    </ActionButton>
                    <ActionButton onClick={() => askDeleteIngredient(ing.id)}>
                      🗑️ Delete
                    </ActionButton>
                  </CardActions>
                </IngredientCard>
              ))}
            </IngredientGrid>
          )}
        </Section>
      )}

      {activeTab === 'recipes' && (
        <Section>
        <SectionHeader>
          <SectionTitle>Menu Item Recipes</SectionTitle>
        </SectionHeader>

        <SearchRow>
          <SearchInput
            type="text"
            placeholder="Search recipes..."
            value={recipeSearch}
            onChange={(e) => setRecipeSearch(e.target.value)}
          />
          {recipeSearch && (
            <ClearSearchButton type="button" onClick={() => setRecipeSearch('')} aria-label="Clear recipe search">
              ✕
            </ClearSearchButton>
          )}
        </SearchRow>

          {loading ? (
            <LoadingContainer>Loading recipes…</LoadingContainer>
          ) : filteredMenuItems.length === 0 ? (
            <EmptyState>No menu items found.</EmptyState>
          ) : (
            <RecipesGrid>
              {filteredMenuItems.map((menuItem) => {
                // Find all recipes for this item
                const itemRecipes = recipes.filter((r) => r.menu_item_id === menuItem.id)
                // Use default recipe for preview, or first one
                const defaultRecipe = itemRecipes.find(r => !r.variant_option_id) || itemRecipes[0]
                
                const recipeCount = itemRecipes.length
                const hasVariants = menuItem.has_variants && menuItem.variants?.length > 0

                return (
                  <RecipeCard key={menuItem.id}>
                    <RecipeCardHeader>
                      <RecipeTitle>
                        {menuItem.name}
                        {hasVariants && (
                          <span style={{ fontSize: '0.7em', fontWeight: 'normal', color: '#666', marginLeft: 8, background: '#e5e7eb', padding: '2px 6px', borderRadius: 4 }}>
                            {menuItem.variants.length} Variants
                          </span>
                        )}
                        {menuItem.is_packaged_good && (
                          <span style={{ fontSize: '0.7em', fontWeight: 'normal', color: '#166534', marginLeft: 8, background: '#dcfce7', padding: '2px 6px', borderRadius: 4 }}>
                            Packaged
                          </span>
                        )}
                      </RecipeTitle>
                    </RecipeCardHeader>
                    <RecipeContent>
                      {itemRecipes.length > 0 ? (
                        <IngredientsList>
                          {/* If Base Recipe exists, show it */}
                          {itemRecipes.find(r => !r.variant_option_id)?.recipe_items?.length ? (
                             <>
                               {recipeCount > 1 && <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: 4, fontStyle: 'italic' }}>Base Recipe:</div>}
                               {itemRecipes.find(r => !r.variant_option_id).recipe_items.map(ri => (
                                 <IngredientItem key={`base-${ri.ingredient_id}`}>
                                    <span>{ri.quantity}×</span>
                                    <span>{ri.ingredients?.name}</span>
                                    <span className="unit">({ri.ingredients?.unit})</span>
                                 </IngredientItem>
                               ))}
                             </>
                          ) : (
                             /* If NO Base Recipe, but has variants, list them */
                             <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                                <div style={{ marginBottom: 4, fontWeight: 500 }}>Configured Variants:</div>
                                {itemRecipes.filter(r => r.variant_option_id).map(r => {
                                   const vName = menuItem.variants?.find(v => v.variant_id === r.variant_option_id)?.variant_name || 'Variant';
                                   const ingCount = r.recipe_items?.length || 0;
                                   return (
                                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                         <span style={{ color: '#059669' }}>✓</span>
                                         <span>{vName}</span>
                                         <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>({ingCount} ingredients)</span>
                                      </div>
                                   )
                                })}
                             </div>
                          )}

                          {/* Summary footer if base shown */}
                          {itemRecipes.find(r => !r.variant_option_id)?.recipe_items?.length > 0 && recipeCount > 1 && (
                            <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#3b82f6' }}>
                               + {recipeCount - 1} other variant recipe(s)
                            </div>
                          )}
                        </IngredientsList>
                      ) : (
                        <NoRecipe>No ingredients assigned yet</NoRecipe>
                      )}
                    </RecipeContent>
                    <RecipeActions>
                      <RecipeButton onClick={() => openRecipe(menuItem, defaultRecipe)}>
                        ✎ Manage Recipes
                      </RecipeButton>
                    </RecipeActions>
                  </RecipeCard>
                )
              })}
            </RecipesGrid>
          )}
        </Section>
      )}

      {ingredientDialog && (
        <IngredientModalOverlay onClick={() => setIngredientDialog(null)}>
          <IngredientModal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{editingIngredient ? 'Edit Ingredient' : 'Add New Ingredient'}</ModalTitle>
              <CloseButton onClick={() => {
                setIngredientDialog(null)
                resetForm()
              }}>✕</CloseButton>
            </ModalHeader>
            <ModalBody>
              {ingredientFormError && (
                <InlineError>{ingredientFormError}</InlineError>
              )}
              <FormGroup>
                <FormLabel>Ingredient Name *</FormLabel>
                <FormInput
                  placeholder="e.g., Tomato, Cheese, Oil..."
                  value={ingredientForm.name}
                  onChange={(e) => setIngredientForm({ ...ingredientForm, name: e.target.value })}
                />
              </FormGroup>
              <FormGroup>
                <FormLabel>Unit of Measurement *</FormLabel>
                <NiceSelect
                  value={ingredientForm.unit}
                  onChange={(unit) => setIngredientForm({ ...ingredientForm, unit })}
                  disabled={!!editingIngredient}
                  placeholder="Select unit..."
                  options={(uoms.length > 0 ? uoms : FALLBACK_UNITS).map((u) => ({ value: u, label: u }))}
                />
              </FormGroup>
              <FormGroup>
                <FormLabel>Current Stock *</FormLabel>
                <FormInput
                  type="number"
                  placeholder="0"
                  value={ingredientForm.current_stock}
                  onChange={(e) => setIngredientForm({ ...ingredientForm, current_stock: e.target.value })}
                />
              </FormGroup>
              <FormGroup>
                <FormLabel>Reorder Threshold</FormLabel>
                <FormInput
                  type="number"
                  placeholder="Alert when stock drops below this"
                  value={ingredientForm.reorder_threshold}
                  onChange={(e) => setIngredientForm({ ...ingredientForm, reorder_threshold: e.target.value })}
                />
              </FormGroup>
            </ModalBody>
            <ModalFooter>
              <CancelButton onClick={() => {
                setIngredientDialog(null)
                resetForm()
              }}>
                Cancel
              </CancelButton>
              <SaveButton onClick={() => {
                saveIngredient()
              }}>
                {editingIngredient ? 'Update' : 'Add'} Ingredient
              </SaveButton>
            </ModalFooter>
          </IngredientModal>
        </IngredientModalOverlay>
      )}

      {confirmDialog && (
        <IngredientModalOverlay onClick={() => confirmDialog?.onCancel?.()}>
          <IngredientModal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Confirm</ModalTitle>
              <CloseButton onClick={() => confirmDialog?.onCancel?.()}>✕</CloseButton>
            </ModalHeader>
            <ModalBody>
              <div style={{ fontSize: '1rem', color: '#374151' }}>{confirmDialog.message}</div>
            </ModalBody>
            <ModalFooter>
              <CancelButton onClick={() => confirmDialog?.onCancel?.()}>Cancel</CancelButton>
              {confirmDialog?.onConfirm && (
                <SaveButton onClick={() => confirmDialog?.onConfirm?.()}>Confirm</SaveButton>
              )}
            </ModalFooter>
          </IngredientModal>
        </IngredientModalOverlay>
      )}

      {showRecipeEditor && (
        <div
          className="modal"
          onClick={(e) => e.target === e.currentTarget && handleCloseRecipeEditor()}
        >
          <div
            className="modal__card"
            style={{ maxWidth: 900, height: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
          >
            {/* Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{selectedMenuItem ? `Recipes for ${selectedMenuItem.name}` : 'Edit Recipe'}</h3>
              <CloseButton onClick={handleCloseRecipeEditor}>✕</CloseButton>
            </div>

            {/* Split Content */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              
              {/* SIDEBAR - Variants List */}
              {selectedMenuItem?.has_variants && (
                <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid #e5e7eb', background: '#f9fafb', overflowY: 'auto' }}>
                  <div style={{ padding: '16px 16px 8px 16px', fontWeight: 600, fontSize: '0.85rem', color: '#6b7280', textTransform: 'uppercase' }}>
                    Select Variant
                  </div>
                  
                  {/* Base Recipe Option */}
                  <div 
                    onClick={() => setActiveVariantId("base")}
                    style={{ 
                      padding: '12px 16px', 
                      cursor: 'pointer',
                      background: activeVariantId === "base" ? '#fff' : 'transparent',
                      borderLeft: activeVariantId === "base" ? '3px solid #3b82f6' : '3px solid transparent',
                      color: activeVariantId === "base" ? '#2563eb' : '#374151',
                      fontWeight: activeVariantId === "base" ? 600 : 400,
                      display: 'flex', justifyContent: 'space-between'
                    }}
                  >
                     <span>Base Recipe</span>
                     {variantsRecipeState["base"]?.items?.length > 0 && <span style={{fontSize: '1rem', color: '#059669', marginLeft: 'auto'}}>✓</span>}
                  </div>

                  {selectedMenuItem.variants.map(v => (
                    <div 
                      key={v.variant_id}
                      onClick={() => setActiveVariantId(v.variant_id)}
                      style={{ 
                        padding: '12px 16px', 
                        cursor: 'pointer',
                        background: activeVariantId === v.variant_id ? '#fff' : 'transparent',
                        borderLeft: activeVariantId === v.variant_id ? '3px solid #3b82f6' : '3px solid transparent',
                        color: activeVariantId === v.variant_id ? '#2563eb' : '#374151',
                        fontWeight: activeVariantId === v.variant_id ? 600 : 400,
                        display: 'flex', flexDirection: 'column'
                      }}
                    >
                       <div style={{display:'flex', justifyContent: 'space-between'}}>
                          <span>{v.variant_name}</span>
                          {variantsRecipeState[v.variant_id]?.items?.length > 0 && <span style={{fontSize: '1rem', color: '#059669', marginLeft: 'auto'}}>✓</span>}
                       </div>
                       <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{v.template_name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* MAIN CONTENT - Editor */}
              <div style={{ flex: 1, padding: 24, overflowY: 'auto', background: '#fff' }}>
                 {!selectedMenuItem?.has_variants ? (
                    /* Simple view for non-variant items */
                    <RecipeEditorContent 
                       items={variantsRecipeState["base"]?.items || []}
                       onChange={(newItems) => updateVariantState("base", newItems)}
                       ingredients={ingredients}
                    />
                 ) : (
                    <>
                       <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#111827' }}>
                             {activeVariantId === 'base' ? 'Base Recipe (Default)' : (
                                selectedMenuItem.variants.find(v => v.variant_id === activeVariantId)?.variant_name + ' Recipe'
                             )}
                          </h4>
                          
                          {/* Copy Action */}
                          {activeVariantId !== 'base' && (
                             <button 
                               onClick={() => {
                                  // Copy from base
                                  const baseItems = variantsRecipeState["base"]?.items || [];
                                  if (baseItems.length === 0) {
                                    setRecipeFormError("Base recipe is empty. Nothing to copy.");
                                    return;
                                  }
                                  // Deep copy with new keys
                                  const copy = baseItems.map(it => ({...it, _key: `cp-${Date.now()}-${Math.random()}`}));
                                  updateVariantState(activeVariantId, copy);
                                  setRecipeFormError(""); // Clear any previous error
                               }}
                               style={{ fontSize: '0.85rem', padding: '6px 12px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                             >
                               Copy Base Recipe
                             </button>
                          )}
                           {activeVariantId === 'base' && (
                             <button 
                               onClick={() => {
                                  const baseItems = variantsRecipeState["base"]?.items || [];
                                  if (baseItems.length === 0) {
                                    setRecipeFormError("Base recipe is empty. Nothing to apply.");
                                    return;
                                  }

                                  // Confirm UI
                                  setConfirmDialog({
                                    message: "This will overwrite all variant recipes with the current base recipe ingredients. Are you sure?",
                                    onConfirm: () => {
                                      const nextState = { ...variantsRecipeState };
                                      selectedMenuItem.variants.forEach(v => {
                                         nextState[v.variant_id] = {
                                            items: baseItems.map(it => ({...it, _key: `cp-all-${v.variant_id}-${Date.now()}-${Math.random()}`}))

                                         };
                                      });
                                      setVariantsRecipeState(nextState);
                                      setConfirmDialog(null);
                                      setRecipeFormError(""); 
                                    },
                                    onCancel: () => setConfirmDialog(null)
                                  });
                               }}
                               style={{ fontSize: '0.85rem', padding: '6px 12px', background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                             >
                               Apply to All Variants
                             </button>
                          )}
                       </div>

                       {recipeFormError && <InlineError>{recipeFormError}</InlineError>}

                       <RecipeEditorContent 
                          items={variantsRecipeState[activeVariantId]?.items || []}
                          onChange={(newItems) => updateVariantState(activeVariantId, newItems)}
                          ingredients={ingredients}
                       />
                    </>
                 )}
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', background: '#fff', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <CancelButton onClick={handleCloseRecipeEditor} disabled={savingRecipe}>Cancel</CancelButton>
                <SaveButton onClick={handleSaveAll} disabled={savingRecipe} style={{ minWidth: 120 }}>
                  {savingRecipe ? 'Saving All...' : 'Save All Changes'}
                </SaveButton>
            </div>
          </div>
        </div>
      )}

    </Container>
  )
}

// ============ STYLED COMPONENTS ============

const Container = styled.div`
  background: #f9fafb;
  min-height: 100vh;
  padding: 2rem 2rem 3rem;
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: 1024px) {
    padding: 1.5rem 1.25rem 3.5rem;
  }

  @media (max-width: 640px) {
    padding: 1rem 0.75rem 4rem;
  }
`

const Header = styled.div`
  margin-bottom: 2rem;

  @media (max-width: 640px) {
    margin-bottom: 1.5rem;
  }
`

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.5rem 0;

  @media (max-width: 640px) {
    font-size: 1.5rem;
  }
`

const Subtitle = styled.p`
  color: #6b7280;
  font-size: 1rem;
  margin: 0;

  @media (max-width: 640px) {
    font-size: 0.9rem;
  }
`

const ErrorAlert = styled.div`
  background: #fee2e2;
  color: #991b1b;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border-left: 4px solid #dc2626;
`

const TabContainer = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  border-bottom: 2px solid #e5e7eb;
  overflow-x: auto;
`

const Tab = styled.button`
  padding: 1rem 1.5rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  color: ${props => (props.$active ? '#3b82f6' : '#6b7280')};
  border-bottom: 3px solid ${props => (props.$active ? '#3b82f6' : 'transparent')};
  transition: all 0.2s;
  margin-bottom: -2px;

  &:hover {
    color: #3b82f6;
  }
`

const Section = styled.div`
  background: #fff;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  @media (max-width: 768px) {
    padding: 1.25rem 1rem 1.5rem;
  }
`

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }
`

const SectionTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0;

  @media (max-width: 640px) {
    font-size: 1.25rem;
  }
`

const AddButton = styled.button`
  background: #10b981;
  color: #fff;
  border: none;
  padding: 10px 24px;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);
  transition: all 0.2s;

  &:hover {
    background: #059669;
    transform: translateY(-1px);
  }
`

const LoadingContainer = styled.div`
  text-align: center;
  padding: 3rem 2rem;
  color: #6b7280;
  font-size: 1rem;
`

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 2rem;
  color: #9ca3af;
  font-size: 1.05rem;
`

const SearchRow = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;

  @media (max-width: 768px) {
    justify-content: stretch;
  }

  @media (max-width: 640px) {
    flex-direction: row;
  }
`

const SearchInput = styled.input`
  width: 100%;
  max-width: 260px;
  padding: 0.5rem 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 9999px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;

  &:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  @media (max-width: 640px) {
    max-width: none;
  }
`

const ClearSearchButton = styled.button`
  border: none;
  background: #e5e7eb;
  color: #4b5563;
  border-radius: 9999px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0;

  &:hover {
    background: #d1d5db;
  }
`

const IngredientGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.25rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const IngredientCard = styled.div`
  background: ${props => (props.lowStock ? '#fef3c7' : '#f3f4f6')};
  border: 2px solid ${props => (props.lowStock ? '#fcd34d' : '#e5e7eb')};
  border-radius: 10px;
  padding: 1.25rem;
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: #3b82f6;
  }
`

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.85rem;
  gap: 0.75rem;
`

const CardTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
  word-break: break-word;
`

const LowStockBadge = styled.span`
  background: #fcd34d;
  color: #78350f;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;
`

const CardInfo = styled.div`
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  padding: 0.85rem;
  margin-bottom: 0.85rem;
`

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.45rem;
  font-size: 0.9rem;

  &:last-child {
    margin-bottom: 0;
  }
`

const Label = styled.span`
  color: #6b7280;
  font-weight: 500;
`

const Value = styled.span`
  color: #111827;
  font-weight: 600;
`

const StockValue = styled.span`
  color: ${props => (props.$low ? '#dc2626' : '#059669')};
  font-weight: 700;
`

const CardActions = styled.div`
  display: flex;
  gap: 0.5rem;

  @media (max-width: 480px) {
    flex-direction: column;
  }
`

const ActionButton = styled.button`
  flex: 1;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: ${props => (props.$edit ? '#3b82f6' : '#ef4444')};
  color: #fff;

  &:hover {
    background: ${props => (props.$edit ? '#2563eb' : '#dc2626')};
    transform: translateY(-1px);
  }
`

const RecipesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const RecipeCard = styled.div`
  background: #f3f4f6;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  padding: 1.25rem;
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: #8b5cf6;
  }
`

const RecipeCardHeader = styled.div`
  margin-bottom: 0.85rem;
  padding-bottom: 0.85rem;
  border-bottom: 2px solid #e5e7eb;
`

const RecipeTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
  word-break: break-word;
`

const RecipeContent = styled.div`
  background: #fff;
  border-radius: 8px;
  padding: 0.9rem;
  margin-bottom: 0.85rem;
  min-height: 72px;
  display: flex;
  align-items: center;
`

const IngredientsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
`

const IngredientItem = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.9rem;
  color: #374151;
  flex-wrap: wrap;

  span:first-child {
    font-weight: 700;
    color: #3b82f6;
  }

  .unit {
    color: #9ca3af;
    font-size: 0.8rem;
  }
`

const NoRecipe = styled.div`
  color: #9ca3af;
  text-align: center;
  font-style: italic;
  font-size: 0.9rem;
`

const RecipeActions = styled.div`
  display: flex;
  gap: 0.5rem;

  @media (max-width: 480px) {
    flex-direction: column;
  }
`

const RecipeButton = styled.button`
  flex: 1;
  padding: 0.7rem;
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #7c3aed;
  }
`

const IngredientModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 1rem;
  z-index: 2005;
  overflow-y: auto;
`

const IngredientModal = styled.div`
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  margin-top: 4vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);

  @media (max-width: 480px) {
    margin-top: 2vh;
  }
`

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 2px solid #f3f4f6;
`

const ModalTitle = styled.h3`
  font-size: 1.15rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
`

const CloseButton = styled.button`
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #92400e;
  padding: 4px;
  line-height: 1;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.7;
  }
`

const ModalBody = styled.div`
  padding: 1.5rem;
`

const FormGroup = styled.div`
  margin-bottom: 1.25rem;
`

const FormLabel = styled.label`
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.45rem;
`

const FormInput = styled.input`
  width: 100%;
  padding: 0.7rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.95rem;
  transition: border-color 0.2s;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`

const UnitSelectWrapper = styled.div`
  position: relative;
`

const UnitSelectButton = styled.button`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  color: #111827;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
  box-sizing: border-box;

  .placeholder {
    color: #9ca3af;
  }

  .chevron {
    font-size: 0.75rem;
    color: #6b7280;
    margin-left: 0.5rem;
  }

  &:hover {
    background-color: #f9fafb;
  }

  &:focus-visible {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &:disabled {
    cursor: not-allowed;
    background-color: #f3f4f6;
    color: #9ca3af;
  }
`

const UnitSelectList = styled.div`
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  margin-top: 0.35rem;
  background: #ffffff;
  border-radius: 10px;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.15);
  max-height: 220px;
  overflow-y: auto;
  padding: 0.35rem;
`

const UnitOption = styled.button`
  width: 100%;
  border: none;
  background: ${props => (props.$active ? '#eff6ff' : 'transparent')};
  color: #111827;
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.95rem;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: ${props => (props.$active ? '#dbeafe' : '#f3f4f6')};
  }

  .check {
    font-size: 0.85rem;
    color: #3b82f6;
  }
`

const ModalFooter = styled.div`
  display: flex;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem 1.5rem;
  border-top: 2px solid #f3f4f6;
  justify-content: flex-end;

  @media (max-width: 480px) {
    flex-direction: row-reverse;
    flex-wrap: wrap;
  }
`

const InlineError = styled.div`
  background: #fee2e2;
  color: #991b1b;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border-left: 4px solid #dc2626;
  margin-bottom: 1rem;
  font-size: 0.9rem;
`

const CancelButton = styled.button`
  padding: 10px 24px;
  background: transparent;
  color: #4b5563;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }
`

const SaveButton = styled.button`
  padding: 10px 24px;
  background: #10b981;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);
  transition: all 0.2s;

  &:hover {
    background: #059669;
    transform: translateY(-1px);
  }
`

// Helper Component for the Editor Form Section (Hoisted)
function RecipeEditorContent({ items, onChange, ingredients }) {
  const handleChange = (key, field, val) => {
    const next = items.map(it => it._key === key ? { ...it, [field]: val } : it);
    onChange(next);
  };
  const remove = (key) => {
    onChange(items.filter(it => it._key !== key));
  };
  const add = () => {
    const _key = `new-${Date.now()}-${Math.random()}`;
    onChange([...items, { _key, ingredientId: '', quantity: '' }]);
  };

  return (
    <div>
      {items.length === 0 && (
        <div style={{ color: '#9ca3af', fontStyle: 'italic', marginBottom: 16 }}>
          No ingredients assigned to this recipe yet.
        </div>
      )}
      {items.map(item => (
        <div
          className="form-row"
          key={item._key}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}
        >
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <NiceSelect
              value={item.ingredientId}
              onChange={(val) => handleChange(item._key, 'ingredientId', val)}
              placeholder="Select Ingredient"
              options={ingredients.map((ing) => ({ value: ing.id, label: ing.name }))}
            />
          </div>
          <input
            type="number"
            placeholder="Quantity"
            value={item.quantity}
            onChange={(e) => handleChange(item._key, 'quantity', e.target.value)}
            style={{ flex: '0 0 120px', minWidth: 0, padding: '0.7rem', border: '2px solid #e5e7eb', borderRadius: 8 }}
          />
          <button
            type="button"
            onClick={() => remove(item._key)}
            style={{ flexShrink: 0, background: '#fee2e2', color: '#b91c1c', border: 'none', padding: '0.5rem 1rem', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            Remove
          </button>
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <SaveButton onClick={add} style={{ background: '#f3f4f6', color: '#374151' }}>+ Add Ingredient</SaveButton>
      </div>
    </div>
  );
}
