// components/VariantManager.js
// Modal for creating and managing variant templates and options

import React, { useState, useEffect } from 'react';
import { getSupabase } from '../services/supabase';
import NiceSelect from './NiceSelect';

export default function VariantManager({ onClose, onSaved }) {
  const supabase = getSupabase();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newOptionName, setNewOptionName] = useState('');
  
  // Confirmation states
  const [deleteTemplateId, setDeleteTemplateId] = useState(null);
  const [deleteOptionId, setDeleteOptionId] = useState(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('variant_templates')
      .select(`
        *,
        options:variant_options(*)
      `)
      .order('display_order');
    
    if (!error) {
      setTemplates(data || []);
    }
    setLoading(false);
  };

  const createTemplate = async () => {
    if (!newTemplateName.trim()) return;
    
    const { error } = await supabase
      .from('variant_templates')
      .insert({
        name: newTemplateName.trim(),
        display_order: templates.length
      });
    
    if (!error) {
      setNewTemplateName('');
      fetchTemplates();
      onSaved?.();
    }
  };

  const deleteTemplate = async (id) => {
    const { error } = await supabase
      .from('variant_templates')
      .delete()
      .eq('id', id);
    
    if (!error) {
      setEditingTemplate(null);
      setDeleteTemplateId(null);
      fetchTemplates();
      onSaved?.();
    }
  };

  const addOption = async (templateId) => {
    if (!newOptionName.trim()) return;
    
    const template = templates.find(t => t.id === templateId);
    const { error } = await supabase
      .from('variant_options')
      .insert({
        template_id: templateId,
        name: newOptionName.trim(),
        display_order: template?.options?.length || 0
      });
    
    if (!error) {
      setNewOptionName('');
      fetchTemplates();
    }
  };

  const deleteOption = async (optionId) => {
    const { error } = await supabase
      .from('variant_options')
      .delete()
      .eq('id', optionId);
    
    if (!error) {
      setDeleteOptionId(null);
      fetchTemplates();
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Manage Variant Templates</h2>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div style={styles.content}>
          {/* Create New Template */}
          <div style={styles.section}>
            <h3 style={styles.label}>Create New Template</h3>
            <div style={styles.inputGroup}>
              <input
                type="text"
                placeholder="e.g. Size, Spice Level"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                style={styles.input}
                onKeyDown={(e) => e.key === 'Enter' && createTemplate()}
              />
              <button onClick={createTemplate} style={styles.primaryBtn}>
                Create
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', margin: '20px 0' }}></div>

          {/* Existing Templates */}
          <div style={styles.section}>
            <h3 style={styles.label}>Manage Existing Templates</h3>
            {loading ? (
              <div style={styles.loading}>Loading...</div>
            ) : templates.length === 0 ? (
              <div style={styles.empty}>No templates available.</div>
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
                />

                {editingTemplate && (() => {
                  const template = templates.find(t => t.id === editingTemplate);
                  if (!template) return null;
                  
                  return (
                    <div style={styles.templateCard}>
                      <div style={styles.templateHeader}>
                        <div style={styles.templateName}>{template.name}</div>
                        {deleteTemplateId === template.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fee2e2', padding: '6px 12px', borderRadius: 8, flex: 1, marginLeft: 16 }}>
                            <span style={{ color: '#991b1b', fontSize: 13, fontWeight: 500 }}>
                              Are you sure? This cannot be undone.
                            </span>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => setDeleteTemplateId(null)} style={styles.cancelBtnSmall}>Cancel</button>
                              <button onClick={() => deleteTemplate(template.id)} style={styles.confirmBtnSmall}>Delete</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteTemplateId(template.id)}
                            style={styles.deleteLinkBtn}
                          >
                            Delete Template
                          </button>
                        )}
                      </div>

                      <div style={styles.divider}></div>

                      {/* Options List */}
                      <div style={styles.optionsLabel}>Options</div>
                      <div style={styles.optionsList}>
                        {template.options?.length === 0 && (
                          <div style={styles.emptyOptions}>No options added yet.</div>
                        )}
                        {template.options?.map((option, idx) => (
                          <div key={option.id} style={styles.optionItem}>
                            <span style={styles.optionName}>{idx + 1}. {option.name}</span>
                            
                            {deleteOptionId === option.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', padding: '2px 8px', borderRadius: 6 }}>
                                <span style={{ color: '#991b1b', fontSize: 12 }}>Sure?</span>
                                <button onClick={() => deleteOption(option.id)} style={styles.confirmBtnSmall}>Yes</button>
                                <button onClick={() => setDeleteOptionId(null)} style={styles.cancelBtnSmall}>No</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteOptionId(option.id)}
                                style={styles.deleteOptionBtn}
                                title="Remove option"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add Option Form */}
                      <div style={styles.addOptionForm}>
                        <input
                          type="text"
                          placeholder="New option name"
                          value={newOptionName}
                          onChange={(e) => setNewOptionName(e.target.value)}
                          style={styles.inputSmall}
                          onKeyDown={(e) => e.key === 'Enter' && addOption(template.id)}
                        />
                        <button
                          onClick={() => addOption(template.id)}
                          style={styles.secondaryBtnSmall}
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
    // overflow: 'hidden', 
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
  inputSmall: {
    flex: 1,
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 13,
    outline: 'none',
    background: '#ffffff',
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
  secondaryBtnSmall: {
    padding: '0 12px',
    background: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontWeight: 500,
    cursor: 'pointer',
    fontSize: 13,
  },
  templateCard: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
  },
  templateHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  templateName: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
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
  divider: {
    height: 1,
    background: '#f3f4f6',
    margin: '12px 0',
  },
  optionsLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  optionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 16,
  },
  optionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#f9fafb',
    borderRadius: 6,
    fontSize: 14,
    border: '1px solid #f3f4f6',
  },
  optionName: {
    color: '#374151',
    fontWeight: 500,
  },
  deleteOptionBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: 20,
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 4px',
    display: 'flex',
    alignItems: 'center',
  },
  emptyOptions: {
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
    padding: '4px 0',
  },
  addOptionForm: {
    display: 'flex',
    gap: 8,
    marginTop: 8,
  },
  loading: {
    textAlign: 'center',
    padding: 24,
    color: '#9ca3af',
  },
  empty: {
    textAlign: 'center',
    padding: 24,
    color: '#9ca3af',
    fontSize: 14,
  },
  confirmRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  confirmRowSmall: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  confirmBtn: {
    background: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  cancelBtn: {
    background: '#e5e7eb',
    color: '#374151',
    border: 'none',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  confirmBtnSmall: {
    background: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
  },
  cancelBtnSmall: {
    background: '#e5e7eb',
    color: '#374151',
    border: 'none',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
  },
};
