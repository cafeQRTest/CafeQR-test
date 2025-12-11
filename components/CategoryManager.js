// components/CategoryManager.js
// Modal for creating and managing menu categories

import React, { useState, useEffect } from 'react';
import { getSupabase } from '../services/supabase';
import NiceSelect from './NiceSelect';

export default function CategoryManager({ restaurantId, onClose, onSaved }) {
  const supabase = getSupabase();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editName, setEditName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // id of category to confirm delete

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    setError('');
    const { data, error: fetchError } = await supabase
      .from('categories')
      .select('*')
      .or(`is_global.eq.true,restaurant_id.eq.${restaurantId}`)
      .order('name');
    
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setCategories(data || []);
    }
    setLoading(false);
  };

  const createCategory = async () => {
    if (!newCategoryName.trim()) return;
    setError('');
    
    const { error: createError } = await supabase
      .from('categories')
      .insert({
        name: newCategoryName.trim(),
        is_global: false,
        restaurant_id: restaurantId
      });
    
    if (createError) {
      setError(createError.message);
    } else {
      setNewCategoryName('');
      fetchCategories();
      onSaved?.();
    }
  };

  const updateCategory = async (id, newName) => {
    if (!newName.trim()) return;
    setError('');
    
    const { error: updateError } = await supabase
      .from('categories')
      .update({ name: newName.trim() })
      .eq('id', id);
    
    if (updateError) {
      setError(updateError.message);
    } else {
      // Don't close editing, just feedback
      fetchCategories();
      onSaved?.();
    }
  };

  const deleteCategory = async (id) => {
    setError('');
    const { error: deleteError } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);
    
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setEditingCategoryId(null);
      setDeleteConfirm(null);
      fetchCategories();
      onSaved?.();
    }
  };

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cm-header">
          <h2 className="cm-title">Manage Categories</h2>
          <button className="cm-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="cm-content">
          {error && (
            <div className="cm-error">{error}</div>
          )}

          {/* Create New Category */}
          <div className="cm-section">
            <div className="cm-label">Create New Category</div>
            <div className="cm-input-group">
              <input
                type="text"
                placeholder="e.g. Appetizers"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="cm-input"
                onKeyDown={(e) => e.key === 'Enter' && createCategory()}
              />
              <button onClick={createCategory} className="cm-primary-btn">
                Add
              </button>
            </div>
          </div>

          <div className="cm-divider"></div>

          {/* Existing Categories */}
          <div className="cm-section">
            <div className="cm-label">Manage Existing Categories</div>
            {loading ? (
              <div className="cm-loading">Loading...</div>
            ) : categories.length === 0 ? (
              <div className="cm-empty">No categories found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <NiceSelect
                  value={editingCategoryId || ""}
                  onChange={(val) => {
                    const cat = categories.find(c => c.id === val);
                    if (cat) {
                      setEditingCategoryId(cat.id);
                      setEditName(cat.name);
                      setDeleteConfirm(null);
                    } else {
                      setEditingCategoryId(null);
                    }
                  }}
                  placeholder="Select a category to edit..."
                  options={categories.map((cat) => ({
                    value: cat.id,
                    label: cat.name + (cat.is_global ? ' (Global)' : '')
                  }))}
                />

                {editingCategoryId && (
                  <div className="cm-edit-panel">
                    {categories.find(c => c.id === editingCategoryId)?.is_global ? (
                      <div className="cm-info-box">
                         ℹ️ Global categories cannot be edited or deleted.
                      </div>
                    ) : (
                      <>
                        <div className="cm-label">Edit Name</div>
                        <div className="cm-input-group">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="cm-input"
                            placeholder="Category name"
                          />
                          <button
                            onClick={() => updateCategory(editingCategoryId, editName)}
                            className="cm-secondary-btn"
                          >
                            Save
                          </button>
                        </div>
                        
                        <div className="cm-delete-section">
                          {deleteConfirm === editingCategoryId ? (
                            <div className="cm-confirm-row">
                              <span className="cm-confirm-text">
                                Are you sure? This cannot be undone.
                              </span>
                              <div className="cm-confirm-actions">
                                <button 
                                  onClick={() => setDeleteConfirm(null)}
                                  className="cm-small-btn cm-cancel"
                                >
                                  Cancel
                                </button>
                                <button 
                                  onClick={() => deleteCategory(editingCategoryId)}
                                  className="cm-small-btn cm-delete"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => setDeleteConfirm(editingCategoryId)}
                                className="cm-delete-link-btn"
                              >
                                Delete Category
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .cm-overlay {
          position: fixed; inset: 0;
          background: rgba(15, 23, 42, 0.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 16px;
          backdrop-filter: blur(4px);
        }
        .cm-modal {
          background: white;
          border-radius: 16px;
          width: 100%; max-width: 500px;
          min-height: 400px; max-height: 85vh;
          display: flex; flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        @media (max-width: 640px) {
          .cm-modal { min-height: auto; max-height: 90vh; }
        }
        .cm-header {
          padding: 16px 24px; border-bottom: 1px solid #f3f4f6;
          display: flex; justify-content: space-between; align-items: center;
          background: #ffffff; border-radius: 16px 16px 0 0;
        }
        .cm-title { margin: 0; font-size: 18px; font-weight: 700; color: #111827; }
        .cm-close-btn {
          background: transparent; border: none; font-size: 24px;
          color: #9ca3af; cursor: pointer; padding: 0; line-height: 1;
        }
        .cm-content { padding: 24px; overflow-y: auto; flex: 1; padding-bottom: 150px; }
        .cm-section { display: flex; flex-direction: column; gap: 12px; }
        .cm-label { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px; }
        .cm-input-group { display: flex; gap: 10px; }
        @media (max-width: 480px) {
           .cm-input-group { flex-direction: column; }
           .cm-primary-btn, .cm-secondary-btn { width: 100%; }
        }
        .cm-input {
          flex: 1; padding: 10px 12px; border: 1px solid #d1d5db;
          border-radius: 8px; font-size: 14px; outline: none; background: #f9fafb;
        }
        .cm-primary-btn {
          padding: 0 16px; background: #f97316; color: white; border: none;
          border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; height: 40px;
        }
        .cm-secondary-btn {
          padding: 0 16px; background: white; color: #374151; border: 1px solid #d1d5db;
          border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; height: 40px;
        }
        .cm-divider { border-top: 1px solid #e5e7eb; margin: 20px 0; }
        .cm-edit-panel {
          padding: 20px; background-color: #ffffff; border-radius: 12px;
          border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        .cm-info-box {
          font-size: 13px; color: #6b7280; background: #f9fafb;
          padding: 12px; border-radius: 8px; font-style: italic;
        }
        .cm-delete-section { margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 16px; }
        .cm-confirm-row {
          display: flex; align-items: center; justify-content: space-between;
          background: #fee2e2; padding: 10px 14px; border-radius: 8px; flex-wrap: wrap; gap: 10px;
        }
        @media (max-width: 480px) {
           .cm-confirm-row { justify-content: center; text-align: center; }
        }
        .cm-confirm-text { color: #991b1b; font-size: 13px; font-weight: 500; }
        .cm-confirm-actions { display: flex; gap: 8px; }
        .cm-small-btn {
          padding: 6px 12px; border-radius: 6px; border: none;
          font-size: 12px; font-weight: 600; cursor: pointer;
        }
        .cm-cancel { background: white; border: 1px solid #fecaca; color: #991b1b; }
        .cm-delete { background: #dc2626; color: white; }
        .cm-delete-link-btn {
          background: none; border: none; color: #dc2626; font-size: 13px;
          font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 6px;
        }
        .cm-error {
          background: #fef2f2; color: #b91c1c; padding: 12px; border-radius: 8px;
          margin-bottom: 20px; font-size: 14px; border: 1px solid #fecaca;
        }
        .cm-loading, .cm-empty { text-align: center; padding: 20px; color: #9ca3af; font-size: 14px; }
      `}</style>
    </div>
  );
}
