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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Manage Categories</h2>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div style={styles.content}>
          {error && (
            <div style={styles.error}>{error}</div>
          )}

          {/* Create New Category */}
          <div style={styles.section}>
            <div style={styles.label}>Create New Category</div>
            <div style={styles.inputGroup}>
              <input
                type="text"
                placeholder="e.g. Appetizers"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                style={styles.input}
                onKeyDown={(e) => e.key === 'Enter' && createCategory()}
              />
              <button onClick={createCategory} style={styles.primaryBtn}>
                Add
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', margin: '20px 0' }}></div>

          {/* Existing Categories */}
          <div style={styles.section}>
            <div style={styles.label}>Manage Existing Categories</div>
            {loading ? (
              <div style={styles.loading}>Loading...</div>
            ) : categories.length === 0 ? (
              <div style={styles.empty}>No categories found.</div>
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
                  <div style={styles.editPanel}>
                    {categories.find(c => c.id === editingCategoryId)?.is_global ? (
                      <div style={styles.infoBox}>
                         ℹ️ Global categories cannot be edited or deleted.
                      </div>
                    ) : (
                      <>
                        <div style={styles.label}>Edit Name</div>
                        <div style={styles.inputGroup}>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={styles.input}
                            placeholder="Category name"
                          />
                          <button
                            onClick={() => updateCategory(editingCategoryId, editName)}
                            style={styles.secondaryBtn}
                          >
                            Save
                          </button>
                        </div>
                        
                        <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                          {deleteConfirm === editingCategoryId ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fee2e2', padding: '10px 14px', borderRadius: 8 }}>
                              <span style={{ color: '#991b1b', fontSize: 13, fontWeight: 500 }}>
                                Are you sure? This cannot be undone.
                              </span>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button 
                                  onClick={() => setDeleteConfirm(null)}
                                  style={{ ...styles.smallBtn, background: 'white', border: '1px solid #fecaca', color: '#991b1b' }}
                                >
                                  Cancel
                                </button>
                                <button 
                                  onClick={() => deleteCategory(editingCategoryId)}
                                  style={{ ...styles.smallBtn, background: '#dc2626', color: 'white' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => setDeleteConfirm(editingCategoryId)}
                                style={styles.deleteLinkBtn}
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
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 20,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: 'white',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    minHeight: 500, // Enforce minimum height
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    // overflow: 'hidden', // Removed to prevent clipping if possible, though 'content' scrolls
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid #f3f4f6',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#ffffff',
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#111827',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: 24,
    color: '#9ca3af',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  content: {
    padding: 24,
    overflowY: 'auto',
    flex: 1,
    paddingBottom: 150, // Added extra padding at bottom for dropdown space
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 4,
  },
  inputGroup: {
    display: 'flex',
    gap: 10,
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    background: '#f9fafb',
  },
  primaryBtn: {
    padding: '0 16px',
    background: '#f97316',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 14,
  },
  secondaryBtn: {
    padding: '0 16px',
    background: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 14,
  },
  deleteLinkBtn: {
    background: 'none',
    border: 'none',
    color: '#dc2626',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 6,
  },
  smallBtn: {
    padding: '6px 12px',
    borderRadius: 6,
    border: 'none',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  editPanel: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
  },
  infoBox: {
    fontSize: 13,
    color: '#6b7280',
    background: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    fontStyle: 'italic',
  },
  error: {
    background: '#fef2f2',
    color: '#b91c1c',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    fontSize: 14,
    border: '1px solid #fecaca',
  },
  loading: {
    textAlign: 'center',
    padding: 20,
    color: '#9ca3af',
  },
  empty: {
    textAlign: 'center',
    padding: 20,
    color: '#9ca3af',
    fontSize: 14,
  },
};
