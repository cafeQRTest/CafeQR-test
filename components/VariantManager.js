// components/VariantManager.js
// Modal for creating and managing variant templates and options

import React, { useState, useEffect } from 'react';
import { getSupabase } from '../services/supabase';
import NiceSelect from './NiceSelect';

export default function VariantManager({ onClose, onSaved, restaurantId }) {
  const supabase = getSupabase();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [newOptionName, setNewOptionName] = useState('');
  
  // Create Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createOptions, setCreateOptions] = useState(['', '']);
  const [createError, setCreateError] = useState('');
  
  // Confirmation states
  
  // Confirmation states
  const [deleteTemplateId, setDeleteTemplateId] = useState(null);
  const [deleteOptionId, setDeleteOptionId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    setError('');
    // Only fetch active templates
    const { data, err } = await supabase
      .from('variant_templates')
      .select(`
        *,
        options:variant_options(*)
      `)
      .eq('is_active', true)
      .or(`restaurant_id.is.null,restaurant_id.eq.${restaurantId || ''}`)
      .order('display_order');
    
    if (!err) {
      // Filter active options and sort
      const activeData = (data || []).map(t => ({
        ...t,
        options: (t.options || [])
            .filter(o => o.is_active)
            .sort((a, b) => a.display_order - b.display_order)
      }));
      setTemplates(activeData);
    }
    setLoading(false);
  };

  // Renaming State
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const handleCreateFullTemplate = async () => {
    // 1. Validate
    if (!createName.trim()) {
      setCreateError('Please enter a template name.');
      return;
    }
    
    // Duplicate Check
    const exists = templates.some(t => t.name.toLowerCase() === createName.trim().toLowerCase());
    if (exists) {
        setCreateError(`Variant template "${createName.trim()}" already exists.`);
        return;
    }
    
    // Check for empty options
    if (createOptions.some(o => !o.trim())) {
      setCreateError('Please fill in all option fields.');
      return;
    }
    
    // Check minimum count
    if (createOptions.length < 2) {
      setCreateError('Please add at least 2 options.');
      return;
    }
    
    setCreateError('');
    
    // 2. Insert Template
    const { data: tmpl, error: tmplErr } = await supabase
      .from('variant_templates')
      .insert({
        name: createName.trim(),
        display_order: templates.length, // approximate order
        is_active: true,
        restaurant_id: restaurantId
      })
      .select('id')
      .single();
      
    if (tmplErr) {
      setCreateError('Failed to create template: ' + tmplErr.message);
      return;
    }
    
    // 3. Insert Options
    const optionsPayload = createOptions.map((opt, idx) => ({
      template_id: tmpl.id,
      name: opt.trim(),
      display_order: idx,
      is_active: true
    }));
    
    const { error: optErr } = await supabase
      .from('variant_options')
      .insert(optionsPayload);
      
    if (optErr) {
      setCreateError('Template created but options failed: ' + optErr.message);
      // Ideally rollback or notify, but for now we just show error
      fetchTemplates();
      return;
    }
    
    // 4. Success
    setCreateName('');
    setCreateOptions(['', '']);
    setShowCreateForm(false);
    fetchTemplates();
    onSaved?.();
  };

  const updateTemplateName = async (id, newName) => {
      const rawName = newName.trim();
      if (!rawName) return;
      setError('');

      // Duplicate Check
      const exists = templates.some(t => t.name.toLowerCase() === rawName.toLowerCase() && t.id !== id);
      if (exists) {
          setError(`Variant template "${rawName}" already exists.`);
          return;
      }

      const { error: updErr } = await supabase
        .from('variant_templates')
        .update({ name: rawName })
        .eq('id', id);

      if (updErr) {
          setError(updErr.message);
      } else {
          setIsRenaming(false);
          fetchTemplates();
          onSaved?.();
      }
  };

  const deleteTemplate = async (id) => {
    setError('');
    
    // Check if currently used by any active Menu Item
    const { count, error: checkError } = await supabase
      .from('menu_item_variants')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', id);

    if (checkError) {
      setError('Error checking usage');
      return;
    }

    if (count > 0) {
      setError(`Cannot delete: This variant type is currently used by ${count} products. Please remove it from those products first.`);
      setDeleteTemplateId(null);
      return;
    }

    // Soft delete: set is_active = false
    const { error } = await supabase
      .from('variant_templates')
      .update({ is_active: false })
      .eq('id', id);
    
    if (!error) {
      setEditingTemplate(null);
      setDeleteTemplateId(null);
      fetchTemplates();
      onSaved?.();
    } else {
      setError(error.message);
    }
  };

  const addOption = async (templateId) => {
    if (!newOptionName.trim()) return;
    setError('');
    
    const template = templates.find(t => t.id === templateId);
    const { error } = await supabase
      .from('variant_options')
      .insert({
        template_id: templateId,
        name: newOptionName.trim(),
        display_order: template?.options?.length || 0,
        is_active: true
      });
    
    if (!error) {
      setNewOptionName('');
      fetchTemplates();
    } else {
      setError('Failed to add option');
    }
  };

  const deleteOption = async (optionId) => {
    setError('');
    
    // Check if currently used by any active Menu Item Pricing
    const { count: pricingCount, error: checkError } = await supabase
       .from('variant_pricing')
       .select('*', { count: 'exact', head: true })
       .eq('option_id', optionId);

    if (pricingCount > 0) {
        setError(`Cannot delete: This option is currently used by ${pricingCount} products. Please remove it from those products first.`);
        setDeleteOptionId(null);
        return;
    }

    // Soft delete: set is_active = false
    const { error } = await supabase
      .from('variant_options')
      .update({ is_active: false })
      .eq('id', optionId);
    
    if (!error) {
      setDeleteOptionId(null);
      fetchTemplates();
    } else {
       setError(error.message);
    }
  };

  return (
    <div className="vm-overlay" onClick={onClose}>
      <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vm-header">
          <h2 className="vm-title">Manage Variants</h2>
          <button className="vm-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="vm-content">
          {error && <div className="vm-error">{error}</div>}
          
          {/* Create New Variant */}
          <div className="vm-section">
            <h3 className="vm-label">Create New Variant</h3>
            {!showCreateForm ? (
              <button 
                onClick={() => {
                   setShowCreateForm(true);
                   setCreateName('');
                   setCreateOptions(['', '']);
                   setCreateError('');
                }} 
                className="vm-primary-btn"
                style={{ width: '100%' }}
              >
                + Create New Variant Type
              </button>
            ) : (
              <div className="vm-create-card">
                {createError && <div className="vm-error-small">{createError}</div>}
                
                <div style={{ marginBottom: 12 }}>
                  <label className="vm-label-small">Variant Name <span style={{color:'red'}}>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Size"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="vm-input"
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label className="vm-label-small">Options (min 2) <span style={{color:'red'}}>*</span></label>
                  <div className="vm-options-stack">
                    {createOptions.map((opt, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8 }}>
                         <input
                           value={opt}
                           onChange={(e) => {
                             const copy = [...createOptions];
                             copy[idx] = e.target.value;
                             setCreateOptions(copy);
                           }}
                           className="vm-input-small"
                           placeholder={`Option ${idx + 1}`}
                         />
                         {createOptions.length > 2 && (
                           <button 
                             onClick={() => setCreateOptions(createOptions.filter((_, i) => i !== idx))}
                             className="vm-tiny-btn vm-delete"
                             style={{ width: 24, fontSize: 14 }}
                           >
                             &times;
                           </button>
                         )}
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => setCreateOptions([...createOptions, ''])}
                    className="vm-secondary-btn-small"
                    style={{ marginTop: 8, width: '100%' }}
                  >
                    + Add Option
                  </button>
                </div>

                <div className="vm-create-actions">
                  <button onClick={() => setShowCreateForm(false)} className="vm-secondary-btn-small">Cancel</button>
                  <button onClick={handleCreateFullTemplate} className="vm-primary-btn" style={{flex:1}}>Create</button>
                </div>
              </div>
            )}
          </div>

          <div className="vm-divider"></div>

          {/* Existing Variants */}
          <div className="vm-section">
            <h3 className="vm-label">Manage Existing Variants</h3>
            {loading ? (
              <div className="vm-loading">Loading...</div>
            ) : templates.length === 0 ? (
              <div className="vm-empty">No templates available.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <NiceSelect
                  value={editingTemplate || ""}
                  onChange={(val) => {
                    setEditingTemplate(val || null);
                    setNewOptionName('');
                    setDeleteTemplateId(null);
                    setDeleteOptionId(null);
                  }}
                  placeholder="Select a template to manage..."
                  options={templates.map((t) => ({
                    value: t.id,
                    label: `${t.name} (${t.options?.length || 0} options)`
                  }))}
                  maxHeight={300}
                />

                {editingTemplate && (() => {
                  const template = templates.find(t => t.id === editingTemplate);
                  if (!template) return null;
                  
                  return (
                    <div className="vm-template-card">
                      <div className="vm-template-header">
                        {isRenaming ? (
                            <div style={{display:'flex', gap:8, alignItems:'center', flex:1}}>
                                <input 
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    className="vm-input-small"
                                    autoFocus
                                />
                                <button onClick={() => updateTemplateName(template.id, renameValue)} className="vm-primary-btn" style={{height:34, fontSize:13, padding:'0 12px'}}>Save</button>
                                <button onClick={() => setIsRenaming(false)} className="vm-secondary-btn-small">Cancel</button>
                            </div>
                        ) : (
                            <div style={{display:'flex', alignItems:'center', gap:10}}>
                                <div className="vm-template-name">{template.name}</div>
                                <button 
                                    onClick={() => {
                                        setRenameValue(template.name);
                                        setIsRenaming(true);
                                    }}
                                    className="vm-edit-link-btn"
                                    title="Rename Template"
                                >
                                    ✎
                                </button>
                            </div>
                        )}

                        {deleteTemplateId === template.id ? (
                          <div className="vm-confirm-row">
                            <span className="vm-confirm-text">
                              Are you sure? This cannot be undone.
                            </span>
                            <div className="vm-confirm-actions">
                              <button onClick={() => setDeleteTemplateId(null)} className="vm-small-btn vm-cancel">Cancel</button>
                              <button onClick={() => deleteTemplate(template.id)} className="vm-small-btn vm-delete">Delete</button>
                            </div>
                          </div>
                        ) : (
                          !isRenaming && (
                              <button
                                onClick={() => setDeleteTemplateId(template.id)}
                                className="vm-delete-link-btn"
                              >
                                Delete Template
                              </button>
                          )
                        )}
                      </div>

                      <div className="vm-divider-small"></div>

                      {/* Options List */}
                      <div className="vm-options-label">Options</div>
                      <div className="vm-options-list">
                        {template.options?.length === 0 && (
                          <div className="vm-empty-options">No options added yet.</div>
                        )}
                        {template.options?.map((option, idx) => (
                          <div key={option.id} className="vm-option-item">
                            <span className="vm-option-name">{idx + 1}. {option.name}</span>
                            
                            {deleteOptionId === option.id ? (
                              <div className="vm-confirm-row-small">
                                <span className="vm-confirm-text-small">Sure?</span>
                                <button onClick={() => deleteOption(option.id)} className="vm-tiny-btn vm-delete">Yes</button>
                                <button onClick={() => setDeleteOptionId(null)} className="vm-tiny-btn vm-cancel">No</button>
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
                          placeholder="New option name"
                          value={newOptionName}
                          onChange={(e) => setNewOptionName(e.target.value)}
                          className="vm-input-small"
                          onKeyDown={(e) => e.key === 'Enter' && addOption(template.id)}
                        />
                        <button
                          onClick={() => addOption(template.id)}
                          className="vm-secondary-btn-small"
                        >
                          Add Option
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
        .vm-input-group { display: flex; gap: 10px; }
        @media (max-width: 480px) {
           .vm-input-group { flex-direction: column; }
           .vm-primary-btn { width: 100%; }
        }
        .vm-input {
          flex: 1; padding: 10px 12px; border: 1px solid #d1d5db;
          border-radius: 8px; fontSize: 14px; outline: none; background: #f9fafb;
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
        .vm-edit-link-btn {
          background: none; border: none; color: #3b82f6; fontSize: 16px;
          cursor: pointer; padding: 0 4px; border-radius: 4px;
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
        .vm-option-name { color: #374151; fontWeight: 500; }
        .vm-delete-option-btn {
          background: none; border: none; color: #9ca3af; font-size: 20px;
          cursor: pointer; line-height: 1; padding: 0 4px; display: flex;
          align-items: center;
        }
        .vm-empty-options { fontSize: 13px; color: #9ca3af; font-style: italic; padding: 4px 0; }
        .vm-add-option-form { display: flex; gap: 8px; margin-top: 8px; }
        @media (max-width: 480px) {
           .vm-add-option-form { flex-direction: column; }
           .vm-secondary-btn-small { width: 100%; }
        }
        .vm-loading, .vm-empty { text-align: center; padding: 24px; color: #9ca3af; font-size: 14px; }
        .vm-confirm-row {
          display: flex; align-items: center; justify-content: space-between;
          background: #fee2e2; padding: 6px 12px; border-radius: 8px; flex: 1;
          margin-left: 16px; flex-wrap: wrap; gap: 8px;
        }
        @media (max-width: 500px) {
           .vm-confirm-row { margin-left: 0; width: 100%; justify-content: center; text-align: center; }
           .vm-template-header { justify-content: center; text-align: center; flex-direction: column; }
        }
        .vm-confirm-row-small {
          display: flex; align-items: center; gap: 8px; background: #fee2e2;
          padding: 2px 8px; border-radius: 6px;
        }
        .vm-confirm-text { color: #991b1b; fontSize: 13px; fontWeight: 500; }
        .vm-confirm-text-small { color: #991b1b; fontSize: 12px; }
        .vm-confirm-actions { display: flex; gap: 8px; }
        .vm-small-btn {
          border-radius: 6px; border: none; padding: 4px 10px;
          font-size: 12px; cursor: pointer;
        }
        .vm-tiny-btn {
          border-radius: 4px; border: none; padding: 2px 8px;
          font-size: 11px; cursor: pointer;
        }
        .vm-delete { background: #dc2626; color: white; }
        .vm-cancel { background: #e5e7eb; color: #374151; }
        .vm-error {
          background: #fef2f2; color: #b91c1c; padding: 12px; border-radius: 8px;
          margin-bottom: 20px; font-size: 14px; border: 1px solid #fecaca;
        }
        .vm-error-small {
          background: #fee2e2; color: #b91c1c; padding: 8px 12px; border-radius: 6px;
          margin-bottom: 12px; fontSize: 13px; border: 1px solid #fecaca;
        }
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
