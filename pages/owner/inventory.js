import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useRequireAuth } from '../../lib/useRequireAuth';
import { useRestaurant } from '../../context/RestaurantContext';
import { getSupabase } from '../../services/supabase';
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
    setIngredientForm({
      name: ing.name,
      unit: ing.unit,
      current_stock: ing.current_stock,
      reorder_threshold: ing.reorder_threshold
    })
  }
  const resetForm = () => {
    setEditingIngredient(null)
    setIngredientForm({ name: '', unit: '', current_stock: 0, reorder_threshold: 0 })
  }

  const saveIngredient = async () => {
    if (!supabase) return
    try {
      setError('')
      const payload = {
        restaurant_id: restaurantId,
        name: ingredientForm.name,
        unit: ingredientForm.unit,
        current_stock: Number(ingredientForm.current_stock),
        reorder_threshold: Number(ingredientForm.reorder_threshold)
      }
      let res
      if (editingIngredient) {
        res = await supabase
          .from('ingredients')
          .update({
            name: payload.name,
            unit: payload.unit,
            current_stock: payload.current_stock,
            reorder_threshold: payload.reorder_threshold
          })
          .eq('id', editingIngredient)
      } else {
        res = await supabase.from('ingredients').insert([payload])
      }
      if (res.error) throw res.error
      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .eq('restaurant_id', restaurantId)
      if (error) throw error
      setIngredients(data || [])
      resetForm()
    } catch (e) {
      setError(e.message)
    }
  }

  const deleteIngredient = async (id) => {
    if (!supabase) return
    const { error } = await supabase.from('ingredients').delete().eq('id', id)
    if (error) setError(error.message)
    else setIngredients((prev) => prev.filter((i) => i.id !== id))
  }

  const askDeleteIngredient = (id) => {
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
  }

  const changeRecipeByKey = (key, field, value) => {
    setRecipeForm((prev) => {
      const items = prev.items.map((it) =>
        it._key === key ? { ...it, [field]: field === 'quantity' ? Number(value) : value } : it
      )
      return { ...prev, items }
    })
  }
  const addRecipeItem = () => {
    const _key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    setRecipeForm((prev) => ({
      ...prev,
      items: [...prev.items, { _key, ingredientId: '', quantity: 0 }],
    }))
  }
  const removeRecipeItemByKey = (key) => {
    setRecipeForm((prev) => ({ ...prev, items: prev.items.filter((it) => it._key !== key) }))
  }

  const saveRecipe = async () => {
    if (!supabase) return
    try {
      setError('')
      const payload = {
        menu_item_id: recipeForm.menuItemId,
        items: recipeForm.items.filter((item) => item.ingredientId && item.quantity > 0)
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
      setError(e.message)
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
            <AddButton onClick={() => setIngredientDialog('add')}>
              + Add Ingredient
            </AddButton>
          </SectionHeader>

          {loading ? (
            <LoadingContainer>Loading ingredients…</LoadingContainer>
          ) : ingredients.length === 0 ? (
            <EmptyState>No ingredients yet. Add your first ingredient!</EmptyState>
          ) : (
            <IngredientGrid>
              {ingredients.map((ing) => (
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
                      <StockValue>{ing.current_stock}</StockValue>
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

          {loading ? (
            <LoadingContainer>Loading recipes…</LoadingContainer>
          ) : menuItems.length === 0 ? (
            <EmptyState>No menu items found.</EmptyState>
          ) : (
            <RecipesGrid>
              {menuItems.filter(mi => !mi.is_packaged_good).map((menuItem) => {
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
                <FormInput
                  placeholder="e.g., kg, L, pcs, g..."
                  value={ingredientForm.unit}
                  onChange={(e) => setIngredientForm({ ...ingredientForm, unit: e.target.value })}
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
                <FormLabel>Reorder Threshold *</FormLabel>
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
                setIngredientDialog(null)
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
              <SaveButton onClick={() => confirmDialog?.onConfirm?.()}>Confirm</SaveButton>
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
              <select
                value={recipeForm.menuItemId}
                onChange={(e) => setRecipeForm({ ...recipeForm, menuItemId: e.target.value })}
              >
                <option value="">Select Menu Item</option>
                {menuItems.map((mi) => (
                  <option key={mi.id} value={mi.id}>
                    {mi.name}
                  </option>
                ))}
              </select>
            )}
            {recipeForm.items.map((item) => (
              <div className="form-row" key={item._key}>
                <select
                  value={item.ingredientId}
                  onChange={(e) => changeRecipeByKey(item._key, 'ingredientId', e.target.value)}
                >
                  <option value="">Select Ingredient</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Quantity"
                  value={item.quantity}
                  onChange={(e) => changeRecipeByKey(item._key, 'quantity', e.target.value)}
                />
                <button type="button" onClick={() => removeRecipeItemByKey(item._key)}>Remove</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <SaveButton onClick={addRecipeItem}>+ Add Ingredient</SaveButton>
            </div>
            <div className="modal-actions" style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <SaveButton onClick={saveRecipe}>Save</SaveButton>
              <CancelButton onClick={handleCloseRecipeEditor}>Cancel</CancelButton>
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
  color: #059669;
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
const ModalFooter = styled.div`
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 2px solid #f3f4f6;
  justify-content: flex-end;
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
