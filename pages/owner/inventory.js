//pages/owner/inventory

import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import { getSupabase } from '../../services/supabase';
import NiceSelect from '../../components/NiceSelect';

// Standard units commonly used in restaurants for ingredients
const RESTAURANT_UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'dozen'];

function UnitSelect({ value, onChange, disabled, placeholder = 'Select unit...' }) {
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
          {RESTAURANT_UNITS.map((unit) => (
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
  const [error, setError] = useState('')
  const [editingIngredient, setEditingIngredient] = useState(null)
  const [ingredientForm, setIngredientForm] = useState({ name: '', unit: '', current_stock: 0, reorder_threshold: 0 })
  const [recipeForm, setRecipeForm] = useState({ menuItemId: '', items: [] })
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
      supabase.from('recipes').select('id,menu_item_id,recipe_items(*,ingredients(name,unit))').eq('restaurant_id', restaurantId),
      supabase.from('menu_items').select('id,name,is_packaged_good').eq('restaurant_id', restaurantId).eq('is_packaged_good', false)
    ]).then(([ingRes, recRes, menuRes]) => {
      if (ingRes.error || recRes.error || menuRes.error) {
        setError(ingRes.error?.message || recRes.error?.message || menuRes.error?.message)
      } else {
        setIngredients(ingRes.data || [])
        setRecipes(recRes.data || [])
        setMenuItems(menuRes.data || [])
      }
      setLoading(false)
    })
  }, [checking, restLoading, restaurantId, supabase])

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

  const openRecipe = (menuItem, recipe) => {
    setShowRecipeEditor(true)
    setRecipeFormError('')
    setSelectedMenuItem(menuItem || null)
    if (recipe) {
      setRecipeForm({
        menuItemId: menuItem?.id || recipe.menu_item_id,
        items: (recipe.recipe_items || []).map((ri, i) => ({
          _key: `${ri.ingredient_id || 'ri'}-${i}`,
          ingredientId: ri.ingredient_id,
          quantity: Number(ri.quantity) || 0,
        })),
      })
    } else {
      setRecipeForm({ menuItemId: menuItem?.id || '', items: [] })
    }
  }

  const handleCloseRecipeEditor = () => {
    setShowRecipeEditor(false)
    setSelectedMenuItem(null)
    setRecipeForm({ menuItemId: '', items: [] })
    setRecipeFormError('')
  }

  const changeRecipeByKey = (key, field, value) => {
    // Store raw input (as string) for quantity so the field can be fully cleared
    setRecipeForm((prev) => {
      const items = prev.items.map((it) =>
        it._key === key ? { ...it, [field]: value } : it
      )
      return { ...prev, items }
    })
  }
  const addRecipeItem = () => {
    const _key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    setRecipeForm((prev) => ({
      ...prev,
      // start with empty quantity so the input shows placeholder instead of 0
      items: [...prev.items, { _key, ingredientId: '', quantity: '' }],
    }))
  }
  const removeRecipeItemByKey = (key) => {
    setRecipeForm((prev) => ({ ...prev, items: prev.items.filter((it) => it._key !== key) }))
  }

  const normalizedIngredientSearch = ingredientSearch.trim().toLowerCase()
  const filteredIngredients = normalizedIngredientSearch
    ? ingredients.filter((ing) => (ing.name || '').toLowerCase().includes(normalizedIngredientSearch))
    : ingredients

  const normalizedRecipeSearch = recipeSearch.trim().toLowerCase()
  const filteredMenuItems = normalizedRecipeSearch
    ? menuItems.filter((mi) => (mi.name || '').toLowerCase().includes(normalizedRecipeSearch))
    : menuItems

  const saveRecipe = async () => {
    if (!supabase || savingRecipe) return
    try {
      setSavingRecipe(true)
      setError('')
      setRecipeFormError('')

      const rawItems = recipeForm.items

      // Block save if any selected ingredient has no quantity or non-positive quantity
      const hasMissingQty = rawItems.some((item) =>
        item.ingredientId && (!item.quantity || Number(item.quantity) <= 0)
      )
      if (hasMissingQty) {
        throw new Error('Please enter a quantity greater than 0 for each selected ingredient.')
      }

      // Only keep fully valid items
      const items = rawItems.filter(
        (item) => item.ingredientId && Number(item.quantity) > 0
      )
      if (items.length === 0) {
        throw new Error('Add at least one ingredient with quantity before saving recipe.')
      }

      // Disallow duplicate ingredients in a single recipe
      const seen = new Set()
      for (const it of items) {
        if (seen.has(it.ingredientId)) {
          throw new Error('Each ingredient can only appear once in a recipe.')
        }
        seen.add(it.ingredientId)
      }

      const payload = {
        menu_item_id: recipeForm.menuItemId,
        items,
      }
      if (!payload.menu_item_id) {
        throw new Error('Select a menu item before saving recipe')
      }
      // Ensure a recipe row exists (avoid on_conflict upsert)
      let recipeId
      const { data: existingRows, error: existErr } = await supabase
        .from('recipes')
        .select('id')
        .eq('menu_item_id', payload.menu_item_id)
        .eq('restaurant_id', restaurantId)
        .limit(1)
      if (existErr) throw existErr
      if (existingRows && existingRows.length > 0) {
        recipeId = existingRows[0].id
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('recipes')
          .insert([{ menu_item_id: payload.menu_item_id, restaurant_id: restaurantId }])
          .select('id')
          .single()
        if (insertErr) throw insertErr
        recipeId = inserted.id
      }

      await supabase.from('recipe_items').delete().eq('recipe_id', recipeId)

      if (payload.items.length > 0) {
        const itemsToInsert = payload.items.map((item) => ({
          recipe_id: recipeId,
          ingredient_id: item.ingredientId,
          quantity: Number(item.quantity)
        }))
        await supabase.from('recipe_items').insert(itemsToInsert)
      }

      // Optimistically update UI for this menu item
      setRecipes((prev) => {
        const idx = prev.findIndex((r) => r.menu_item_id === payload.menu_item_id)
        const ingMap = new Map(ingredients.map((i) => [i.id, i]))
        const recipeObj = {
          id: recipeId,
          menu_item_id: payload.menu_item_id,
          recipe_items: payload.items.map((it) => ({
            ingredient_id: it.ingredientId,
            quantity: Number(it.quantity),
            ingredients: ingMap.get(it.ingredientId)
              ? { name: ingMap.get(it.ingredientId).name, unit: ingMap.get(it.ingredientId).unit }
              : null,
          })),
        }
        if (idx === -1) return [...prev, recipeObj]
        const copy = [...prev]
        copy[idx] = recipeObj
        return copy
      })

      // Close modal immediately after successful write
      setShowRecipeEditor(false)
      setSelectedMenuItem(null)
      setRecipeForm({ menuItemId: '', items: [] })

      // Background refresh (non-blocking)
      try {
        const { data: recipesData, error: recipesError } = await supabase
          .from('recipes')
          .select('id,menu_item_id,recipe_items(*,ingredients(name,unit))')
          .eq('restaurant_id', restaurantId)
        if (!recipesError) setRecipes(recipesData || [])
      } catch {}
    } catch (e) {
      setRecipeFormError(e.message)
    } finally {
      setSavingRecipe(false)
    }
  }

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
                const recipe = recipes.find((r) => r.menu_item_id === menuItem.id)
                return (
                  <RecipeCard key={menuItem.id}>
                    <RecipeCardHeader>
                      <RecipeTitle>{menuItem.name}</RecipeTitle>
                    </RecipeCardHeader>
                    <RecipeContent>
                      {recipe?.recipe_items?.length ? (
                        <IngredientsList>
                          {recipe.recipe_items.map((ri) => (
                            <IngredientItem key={`${ri.ingredient_id}-${ri.quantity}`}>
                              <span>{ri.quantity}×</span>
                              <span>{ri.ingredients?.name || '–'}</span>
                              <span className="unit">({ri.ingredients?.unit})</span>
                            </IngredientItem>
                          ))}
                        </IngredientsList>
                      ) : (
                        <NoRecipe>No ingredients assigned yet</NoRecipe>
                      )}
                    </RecipeContent>
                    <RecipeActions>
                      <RecipeButton onClick={() => openRecipe(menuItem, recipe)}>
                        ✎ {recipe ? 'Edit' : 'Add'} Recipe
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
                  options={RESTAURANT_UNITS.map((u) => ({ value: u, label: u }))}
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
          <div className="modal__card" style={{ maxWidth: 700 }}>
            <h3>{selectedMenuItem ? `Recipe for ${selectedMenuItem.name}` : 'Edit Recipe'}</h3>
            {selectedMenuItem ? (
              <div className="form-row" style={{ marginBottom: 8 }}>
                <strong style={{ marginRight: 6 }}>Menu Item:</strong>
                <span>{selectedMenuItem.name}</span>
              </div>
            ) : (
              <div style={{ maxWidth: 320 }}>
                <NiceSelect
                  value={recipeForm.menuItemId}
                  onChange={(val) => setRecipeForm({ ...recipeForm, menuItemId: val })}
                  placeholder="Select Menu Item"
                  options={menuItems.map((mi) => ({ value: mi.id, label: mi.name }))}
                />
              </div>
            )}
            {recipeFormError && (
              <InlineError style={{ marginTop: 8 }}>{recipeFormError}</InlineError>
            )}
            {recipeForm.items.map((item) => (
              <div className="form-row" key={item._key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 2 }}>
                  <NiceSelect
                    value={item.ingredientId}
                    onChange={(val) => changeRecipeByKey(item._key, 'ingredientId', val)}
                    placeholder="Select Ingredient"
                    options={ingredients.map((ing) => ({ value: ing.id, label: ing.name }))}
                  />
                </div>
                <input
                  type="number"
                  placeholder="Quantity"
                  value={item.quantity}
                  onChange={(e) => changeRecipeByKey(item._key, 'quantity', e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={() => removeRecipeItemByKey(item._key)}>Remove</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <SaveButton onClick={addRecipeItem}>+ Add Ingredient</SaveButton>
            </div>
            <div className="modal-actions" style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <SaveButton onClick={saveRecipe} disabled={savingRecipe}>
                {savingRecipe ? 'Saving…' : 'Save'}
              </SaveButton>
              <CancelButton onClick={handleCloseRecipeEditor} disabled={savingRecipe}>Cancel</CancelButton>
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
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
`
const Header = styled.div`
  margin-bottom: 2rem;
`
const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.5rem 0;
`
const Subtitle = styled.p`
  color: #6b7280;
  font-size: 1rem;
  margin: 0;
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
`
const Tab = styled.button`
  padding: 1rem 1.5rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  color: ${props => props.$active ? '#3b82f6' : '#6b7280'};
  border-bottom: 3px solid ${props => props.$active ? '#3b82f6' : 'transparent'};
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
`
const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
`
const SectionTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
`
const AddButton = styled.button`
  background: #10b981;
  color: #fff;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  &:hover {
    background: #059669;
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
  font-size: 1.1rem;
`
const SearchRow = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
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
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
`
const IngredientCard = styled.div`
  background: ${props => props.lowStock ? '#fef3c7' : '#f3f4f6'};
  border: 2px solid ${props => props.lowStock ? '#fcd34d' : '#e5e7eb'};
  border-radius: 10px;
  padding: 1.5rem;
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
  margin-bottom: 1rem;
`
const CardTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
`
const LowStockBadge = styled.span`
  background: #fcd34d;
  color: #78350f;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
`
const CardInfo = styled.div`
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
`
const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
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
  color: ${props => props.$low ? '#dc2626' : '#059669'};
  font-weight: 700;
`
const CardActions = styled.div`
  display: flex;
  gap: 0.5rem;
`
const ActionButton = styled.button`
  flex: 1;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: ${props => props.$edit ? '#3b82f6' : '#ef4444'};
  color: #fff;
  &:hover {
    background: ${props => props.$edit ? '#2563eb' : '#dc2626'};
    transform: translateY(-1px);
  }
`
const RecipesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
`
const RecipeCard = styled.div`
  background: #f3f4f6;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  padding: 1.5rem;
  transition: all 0.2s;
  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: #8b5cf6;
  }
`
const RecipeCardHeader = styled.div`
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #e5e7eb;
`
const RecipeTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
  word-break: break-word;
`
const RecipeContent = styled.div`
  background: #fff;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  min-height: 80px;
  display: flex;
  align-items: center;
`
const IngredientsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`
const IngredientItem = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.95rem;
  color: #374151;
  span:first-child {
    font-weight: 700;
    color: #3b82f6;
  }
  .unit {
    color: #9ca3af;
    font-size: 0.85rem;
  }
`
const NoRecipe = styled.div`
  color: #9ca3af;
  text-align: center;
  font-style: italic;
`
const RecipeActions = styled.div`
  display: flex;
  gap: 0.5rem;
`
const RecipeButton = styled.button`
  flex: 1;
  padding: 0.75rem;
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
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
  align-items: center;
  padding: 1rem;
  z-index: 1000;
`
const IngredientModal = styled.div`
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
`
const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 2px solid #f3f4f6;
`
const ModalTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
`
const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  transition: color 0.2s;
  &:hover {
    color: #111827;
  }
`
const ModalBody = styled.div`
  padding: 1.5rem;
`
const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`
const FormLabel = styled.label`
  display: block;
  font-size: 0.95rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
`
const FormInput = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;
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
  gap: 1rem;
  padding: 1.5rem;
  border-top: 2px solid #f3f4f6;
  justify-content: flex-end;
`
const InlineError = styled.div`
  background: #fee2e2;
  color: #991b1b;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border-left: 4px solid #dc2626;
  margin-bottom: 1rem;
`
const CancelButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: #e5e7eb;
  color: #374151;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  &:hover {
    background: #d1d5db;
  }
`
const SaveButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: #10b981;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  &:hover {
    background: #059669;
  }
`
