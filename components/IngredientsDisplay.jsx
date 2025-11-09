import React, { useState, useEffect } from 'react'
import { getSupabase } from '../services/supabase'

export default function IngredientsDisplay({ menuItemId, restaurantId, onClose }) {
  const supabase = getSupabase()
  const [recipe, setRecipe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!menuItemId || !restaurantId) return

    const loadRecipe = async () => {
      try {
        setLoading(true)
        const { data, error: err } = await supabase
          .from('recipes')
          .select(`
            id,
            menu_item_id,
            recipe_items (
              id,
              ingredient_id,
              quantity,
              ingredients ( id, name, unit, current_stock, reorder_threshold, low_stock )
            )
          `)
          .eq('menu_item_id', menuItemId)
          .eq('restaurant_id', restaurantId)
          .single()

        if (err && err.code !== 'PGRST116') {
          throw err
        }

        setRecipe(data)
      } catch (e) {
        setError(e.message || 'Failed to load recipe')
      } finally {
        setLoading(false)
      }
    }

    loadRecipe()
  }, [menuItemId, restaurantId, supabase])

  if (loading) {
    return <div style={{ padding: '1rem', textAlign: 'center' }}>Loading...</div>
  }

  if (error) {
    return <div style={{ padding: '1rem', color: 'red' }}>Error: {error}</div>
  }

  const recipeItems = recipe?.recipe_items || []

  return (
    <div style={{ 
      background: '#fff', 
      border: '1px solid #e5e7eb', 
      borderRadius: '8px', 
      padding: '1rem',
      marginTop: '0.5rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>📋 Ingredients</h3>
        {onClose && (
          <button 
            onClick={onClose}
            style={{ 
              background: 'none', 
              border: 'none', 
              fontSize: '1.2rem', 
              cursor: 'pointer' 
            }}
          >
            ✕
          </button>
        )}
      </div>

      {recipeItems.length === 0 ? (
        <p style={{ color: '#6b7280', margin: 0 }}>No ingredients defined</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {recipeItems.map((item) => {
            const ing = item.ingredients
            const isLowStock = ing?.low_stock || (ing?.current_stock || 0) < (ing?.reorder_threshold || 0)
            const stockStatus = isLowStock ? '⚠️ Low Stock' : '✓ In Stock'

            return (
              <div
                key={item.id}
                style={{
                  padding: '0.75rem',
                  background: isLowStock ? '#fef3c7' : '#f3f4f6',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <strong>{ing?.name || 'Unknown'}</strong>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {item.quantity} {ing?.unit || 'unit'} needed
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
                  <div style={{ fontWeight: 600, color: isLowStock ? '#d97706' : '#059669' }}>
                    {stockStatus}
                  </div>
                  <div style={{ color: '#6b7280' }}>
                    Stock: {ing?.current_stock || 0}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
