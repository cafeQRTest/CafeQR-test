// components/AddOnManager.js
// Modal for creating and managing Add-on Groups (Extras) and Options

import React, { useState, useEffect } from 'react';
import { getSupabase } from '../services/supabase';
import NiceSelect from './NiceSelect';
import { useRestaurant } from '../context/RestaurantContext';

export default function AddOnManager({ onClose, onSaved }) {
  const supabase = getSupabase();
  const { restaurant } = useRestaurant();
  const restaurantId = restaurant?.id;

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState(null);
  
  // Option creation in existing group
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionPrice, setNewOptionPrice] = useState('');

  // Create Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('');
  // options structure: { name: '', price: '' }
  const [createOptions, setCreateOptions] = useState([{ name: '', price: '' }]);
  const [createError, setCreateError] = useState('');
  
  // Confirmation states
  const [deleteGroupId, setDeleteGroupId] = useState(null);
  const [deleteOptionId, setDeleteOptionId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (restaurantId) fetchGroups();
  }, [restaurantId]);

  const fetchGroups = async () => {
    setLoading(true);
    setError('');
    // Fetch groups for this restaurant
    const { data, err } = await supabase
      .from('addon_groups')
      .select(`
        *,
        options:addon_options(*)
      `)
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (!err) {
      // Filter active options and sort
      const activeData = (data || []).map(t => ({
        ...t,
        options: (t.options || [])
            .filter(o => o.is_active)
            .sort((a, b) => a.display_order - b.display_order)
      }));
      setGroups(activeData);
    }
    setLoading(false);
  };

  const handleCreateGroup = async () => {
    // 1. Validate
    if (!createName.trim()) {
      setCreateError('Please enter a group name (e.g. "Toppings").');
      return;
    }
    
    if (createOptions.some(o => !o.name.trim())) {
      setCreateError('Please fill in all option names.');
      return;
    }

    setCreateError('');
    
    // 2. Insert Group
    const { data: grp, error: grpErr } = await supabase
      .from('addon_groups')
      .insert({
        restaurant_id: restaurantId,
        name: createName.trim(),
        min_selections: 0, // Default to optional
        max_selections: null, // Unlimited
        is_active: true
      })
      .select('id')
      .single();
      
    if (grpErr) {
      setCreateError('Failed to create group: ' + grpErr.message);
      return;
    }
    
    // 3. Insert Options
    if (createOptions.length > 0) {
      const optionsPayload = createOptions.map((opt, idx) => ({
        group_id: grp.id,
        name: opt.name.trim(),
        price: parseFloat(opt.price) || 0,
        display_order: idx,
        is_active: true
      }));
      
      const { error: optErr } = await supabase
        .from('addon_options')
        .insert(optionsPayload);
        
      if (optErr) {
        setCreateError('Group created but options failed: ' + optErr.message);
        fetchGroups();
        return;
      }
    }
    
    // 4. Success
    setCreateName('');
    setCreateOptions([{ name: '', price: '' }]);
    setShowCreateForm(false);
    fetchGroups();
    onSaved?.();
  };

  const deleteGroup = async (id) => {
    setError('');
    
    // Check usage
    const { count, error: checkError } = await supabase
      .from('menu_item_addons')
      .select('*', { count: 'exact', head: true })
      .eq('addon_group_id', id);

    if (checkError) {
      setError('Error checking usage');
      return;
    }

    if (count > 0) {
      setError(`Cannot delete: This Add-on Group is used by ${count} products. Unlink it first.`);
      setDeleteGroupId(null);
      return;
    }

    // Soft delete
    const { error } = await supabase
      .from('addon_groups')
      .update({ is_active: false })
      .eq('id', id);
    
    if (!error) {
      setEditingGroup(null);
      setDeleteGroupId(null);
      fetchGroups();
      onSaved?.();
    } else {
      setError(error.message);
    }
  };

  const addOption = async (groupId) => {
    if (!newOptionName.trim()) return;
    setError('');
    
    const group = groups.find(g => g.id === groupId);
    const { error } = await supabase
      .from('addon_options')
      .insert({
        group_id: groupId,
        name: newOptionName.trim(),
        price: parseFloat(newOptionPrice) || 0,
        display_order: group?.options?.length || 0,
        is_active: true
      });
    
    if (!error) {
      setNewOptionName('');
      setNewOptionPrice('');
      fetchGroups();
    } else {
      setError('Failed to add option');
    }
  };

  const deleteOption = async (optionId) => {
    setError('');
    // Soft delete option
    const { error } = await supabase
      .from('addon_options')
      .update({ is_active: false })
      .eq('id', optionId);
    
    if (!error) {
      setDeleteOptionId(null);
      fetchGroups();
    } else {
       setError(error.message);
    }
  };

  return (
    <div className="vm-overlay" onClick={onClose}>
      <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vm-header">
          <h2 className="vm-title">Manage Add-ons</h2>
          <button className="vm-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="vm-content">
          {error && <div className="vm-error">{error}</div>}
          
          {/* Create New Group */}
          <div className="vm-section">
            <h3 className="vm-label">Create New Add-on Group</h3>
            {!showCreateForm ? (
              <button 
                onClick={() => {
                   setShowCreateForm(true);
                   setCreateName('');
                   setCreateOptions([{ name: '', price: '' }]);
                   setCreateError('');
                }} 
                className="vm-primary-btn"
                style={{ width: '100%' }}
              >
                + Create "Extras" Group
              </button>
            ) : (
              <div className="vm-create-card">
                {createError && <div className="vm-error-small">{createError}</div>}
                
                <div style={{ marginBottom: 12 }}>
                  <label className="vm-label-small">Group Name <span style={{color:'red'}}>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Burger Toppings"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="vm-input"
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label className="vm-label-small">Options</label>
                  <div className="vm-options-stack">
                    {createOptions.map((opt, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8 }}>
                         <input
                           value={opt.name}
                           onChange={(e) => {
                             const copy = [...createOptions];
                             copy[idx].name = e.target.value;
                             setCreateOptions(copy);
                           }}
                           className="vm-input-small"
                           placeholder="Option Name (e.g. Cheese)"
                           style={{ flex: 2 }}
                         />
                         <input
                           type="number"
                           value={opt.price}
                           onChange={(e) => {
                             const copy = [...createOptions];
                             copy[idx].price = e.target.value;
                             setCreateOptions(copy);
                           }}
                           className="vm-input-small"
                           placeholder="Price (₹)"
                           style={{ flex: 1 }}
                         />
                         <button 
                           onClick={() => setCreateOptions(createOptions.filter((_, i) => i !== idx))}
                           className="vm-tiny-btn vm-delete"
                           style={{ width: 24, fontSize: 14 }}
                         >
                           &times;
                         </button>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => setCreateOptions([...createOptions, { name: '', price: '' }])}
                    className="vm-secondary-btn-small"
                    style={{ marginTop: 8, width: '100%' }}
                  >
                    + Add Option Row
                  </button>
                </div>

                <div className="vm-create-actions">
                  <button onClick={() => setShowCreateForm(false)} className="vm-secondary-btn-small">Cancel</button>
                  <button onClick={handleCreateGroup} className="vm-primary-btn" style={{flex:1}}>Create</button>
                </div>
              </div>
            )}
          </div>

          <div className="vm-divider"></div>

          {/* Existing Groups */}
          <div className="vm-section">
            <h3 className="vm-label">Manage Existing Groups</h3>
            {loading ? (
              <div className="vm-loading">Loading...</div>
            ) : groups.length === 0 ? (
              <div className="vm-empty">No add-on groups found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <NiceSelect
                  value={editingGroup || ""}
                  onChange={(val) => {
                    setEditingGroup(val || null);
                    setNewOptionName('');
                    setNewOptionPrice('');
                    setDeleteGroupId(null);
                    setDeleteOptionId(null);
                  }}
                  placeholder="Select a group to manage..."
                  options={groups.map((t) => ({
                    value: t.id,
                    label: `${t.name} (${t.options?.length || 0} options)`
                  }))}
                  maxHeight={300}
                />

                {editingGroup && (() => {
                  const group = groups.find(t => t.id === editingGroup);
                  if (!group) return null;
                  
                  return (
                    <div className="vm-template-card">
                      <div className="vm-template-header">
                        <div className="vm-template-name">{group.name}</div>
                        {deleteGroupId === group.id ? (
                          <div className="vm-confirm-row">
                            <span className="vm-confirm-text">Delete "{group.name}"?</span>
                            <div className="vm-confirm-actions">
                              <button onClick={() => setDeleteGroupId(null)} className="vm-small-btn vm-cancel">Cancel</button>
                              <button onClick={() => deleteGroup(group.id)} className="vm-small-btn vm-delete">Delete</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteGroupId(group.id)}
                            className="vm-delete-link-btn"
                          >
                            Delete Group
                          </button>
                        )}
                      </div>

                      <div className="vm-divider-small"></div>

                      <div className="vm-options-label">Options</div>
                      <div className="vm-options-list">
                        {group.options?.length === 0 && (
                           <div className="vm-empty-options">No options.</div>
                        )}
                        {group.options?.map((option, idx) => (
                          <div key={option.id} className="vm-option-item">
                            <span className="vm-option-name">{option.name}</span>
                            <span className="vm-option-price">₹{option.price}</span>
                            
                            {deleteOptionId === option.id ? (
                              <div className="vm-confirm-row-small">
                                <span className="vm-confirm-text-small">Del?</span>
                                <button onClick={() => deleteOption(option.id)} className="vm-tiny-btn vm-delete">Y</button>
                                <button onClick={() => setDeleteOptionId(null)} className="vm-tiny-btn vm-cancel">N</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteOptionId(option.id)}
                                className="vm-delete-option-btn"
                                title="Remove option"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add Option Form */}
                      <div className="vm-add-option-form">
                        <input
                          type="text"
                          placeholder="Name (e.g. Extra Mayo)"
                          value={newOptionName}
                          onChange={(e) => setNewOptionName(e.target.value)}
                          className="vm-input-small"
                          style={{ flex: 2 }}
                          onKeyDown={(e) => e.key === 'Enter' && addOption(group.id)}
                        />
                        <input
                          type="number"
                          placeholder="Price"
                          value={newOptionPrice}
                          onChange={(e) => setNewOptionPrice(e.target.value)}
                          className="vm-input-small"
                          style={{ flex: 1 }}
                          onKeyDown={(e) => e.key === 'Enter' && addOption(group.id)}
                        />
                        <button
                          onClick={() => addOption(group.id)}
                          className="vm-secondary-btn-small"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .vm-overlay {
          position: fixed; inset: 0;
          background: rgba(15, 23, 42, 0.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 16px;
          backdrop-filter: blur(4px);
        }
        .vm-modal {
          background: white; border-radius: 16px;
          width: 100%; max-width: 500px;
          min-height: 600px; max-height: 95vh;
          display: flex; flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        @media (max-width: 640px) {
          .vm-modal { min-height: auto; max-height: 95vh; }
        }
        .vm-header {
          padding: 16px 24px; border-bottom: 1px solid #f3f4f6;
          display: flex; justify-content: space-between; align-items: center;
          background: #ffffff; border-radius: 16px 16px 0 0;
        }
        .vm-title { margin: 0; fontSize: 18px; fontWeight: 700; color: #111827; }
        .vm-close-btn {
          background: transparent; border: none; fontSize: 24px;
          color: #9ca3af; cursor: pointer; padding: 0; line-height: 1;
        }
        .vm-content { padding: 24px; overflow-y: auto; flex: 1; padding-bottom: 450px; }
        .vm-section { display: flex; flex-direction: column; gap: 12px; }
        .vm-label { fontSize: 13px; fontWeight: 600; color: #374151; margin-bottom: 4px; }
        .vm-input {
          flex: 1; padding: 10px 12px; border: 1px solid #d1d5db;
          border-radius: 8px; fontSize: 14px; outline: none; background: #f9fafb;
          width: 100%; box-sizing: border-box;
        }
        .vm-input-small {
          flex: 1; padding: 8px 10px; border: 1px solid #d1d5db;
          border-radius: 6px; fontSize: 13px; outline: none; background: #ffffff;
        }
        .vm-primary-btn {
          padding: 0 16px; background: #f97316; color: white; border: none;
          border-radius: 8px; fontWeight: 600; cursor: pointer; fontSize: 14px; height: 40px;
        }
        .vm-secondary-btn-small {
          padding: 0 12px; background: white; color: #374151; border: 1px solid #d1d5db;
          border-radius: 6px; fontWeight: 500; cursor: pointer; fontSize: 13px; height: 35px;
        }
        .vm-template-card {
          padding: 20px; background-color: #ffffff; border-radius: 12px;
          border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        .vm-template-header {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;
        }
        .vm-template-name { fontSize: 16px; fontWeight: 600; color: #111827; }
        .vm-delete-link-btn {
          background: none; border: none; color: #dc2626; fontSize: 13px;
          fontWeight: 600; cursor: pointer; padding: 4px 8px; border-radius: 6px;
        }
        .vm-divider { border-top: 1px solid #e5e7eb; margin: 20px 0; }
        .vm-divider-small { height: 1px; background: #f3f4f6; margin: 12px 0; }
        .vm-options-label {
          fontSize: 12px; fontWeight: 600; color: #6b7280; margin-bottom: 8px;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .vm-options-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
        .vm-option-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 12px; background: #f9fafb; border-radius: 6px;
          font-size: 14px; border: 1px solid #f3f4f6;
        }
        .vm-option-name { color: #374151; fontWeight: 500; flex: 1; }
        .vm-option-price { color: #f97316; fontWeight: 600; margin-right: 12px; }
        .vm-delete-option-btn {
          background: none; border: none; color: #9ca3af; font-size: 20px;
          cursor: pointer; line-height: 1; padding: 0 4px; display: flex;
          align-items: center;
        }
        .vm-empty-options { fontSize: 13px; color: #9ca3af; font-style: italic; padding: 4px 0; }
        .vm-add-option-form { display: flex; gap: 8px; margin-top: 8px; }
        .vm-loading, .vm-empty { text-align: center; padding: 24px; color: #9ca3af; font-size: 14px; }
        .vm-confirm-row, .vm-confirm-row-small {
          display: flex; align-items: center; gap: 8px; background: #fee2e2;
          padding: 2px 8px; border-radius: 6px;
        }
        .vm-confirm-text, .vm-confirm-text-small { color: #991b1b; fontSize: 12px; fontWeight: 500; }
        .vm-confirm-actions { display: flex; gap: 8px; }
        .vm-small-btn, .vm-tiny-btn { border-radius: 4px; border: none; cursor: pointer; }
        .vm-small-btn { padding: 4px 10px; fontSize: 12px; }
        .vm-tiny-btn { padding: 2px 8px; fontSize: 11px; }
        .vm-delete { background: #dc2626; color: white; }
        .vm-cancel { background: #e5e7eb; color: #374151; }
        .vm-error, .vm-error-small {
          background: #fef2f2; color: #b91c1c; border-radius: 8px;
          margin-bottom: 20px; fontSize: 14px; border: 1px solid #fecaca; padding: 12px;
        }
        .vm-error-small { padding: 8px 12px; margin-bottom: 12px; fontSize: 13px; }
        .vm-label-small { fontSize: 12px; fontWeight: 600; color: #4b5563; margin-bottom: 4px; display: block; }
        .vm-create-card {
          padding: 16px; background: #fff; border: 1px solid #e5e7eb;
          border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }
        .vm-options-stack { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .vm-create-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
      `}</style>
    </div>
  );
}
