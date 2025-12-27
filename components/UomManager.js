// components/UomManager.js
// Modal for creating and managing units of measure

import React, { useState, useEffect } from 'react';
import { getSupabase } from '../services/supabase';
import NiceSelect from './NiceSelect';

export default function UomManager({ restaurantId, onClose, onSaved }) {
  const supabase = getSupabase();
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUomId, setEditingUomId] = useState(null);
  
  // Edit State
  const [editName, setEditName] = useState('');
  const [editShortCode, setEditShortCode] = useState('');
  const [editPrecision, setEditPrecision] = useState(0);

  // New State
  const [newName, setNewName] = useState('');
  const [newShortCode, setNewShortCode] = useState('');
  const [newPrecision, setNewPrecision] = useState(0);

  const [error, setError] = useState('');
  const [defaultUomId, setDefaultUomId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    fetchUoms();
    fetchDefaultUom();
  }, [restaurantId]);

  const fetchDefaultUom = async () => {
    const { data } = await supabase
        .from('restaurants')
        .select('default_uom_id')
        .eq('id', restaurantId)
        .single();
    if (data) setDefaultUomId(data.default_uom_id);
  };
  
  const handleSetDefault = async (newId) => {
    const { error: err } = await supabase
       .from('restaurants')
       .update({ default_uom_id: newId })
       .eq('id', restaurantId);
    
    if (err) setError(err.message);
    else {
        setDefaultUomId(newId);
        if (onSaved) onSaved();
    }
  };

  const fetchUoms = async () => {
    setLoading(true);
    setError('');
    const { data, error: fetchError } = await supabase
      .from('unit_of_measures')
      .select('*')
      .or(`restaurant_id.is.null,restaurant_id.eq.${restaurantId}`)
      .order('name');
    
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setUoms(data || []);
    }
    setLoading(false);
  };

  const validate = (n, sc, p) => {
    if (!n.trim()) return "Name is required.";
    if (!sc.trim()) return "Short code is required.";
    if (p < 0 || p > 4) return "Precision must be between 0 and 4.";
    return null;
  };

  const createUom = async () => {
    const err = validate(newName, newShortCode, newPrecision);
    if (err) { setError(err); return; }
    setError('');

    // Duplicate Check (Name or ShortCode) within this restaurant scope or global
    // Global duplicates depend on how we want to handle it. Usually same name is fine if ID differs?
    // Let's just check local list.
    const exists = uoms.some(u => 
      (u.name.toLowerCase() === newName.trim().toLowerCase() ||
       u.short_code.toLowerCase() === newShortCode.trim().toLowerCase()) &&
       (u.restaurant_id === restaurantId || u.restaurant_id === null)
    );

    if (exists) {
        setError(`Unit with name "${newName}" or code "${newShortCode}" already exists.`);
        return;
    }
    
    const { error: createError } = await supabase
      .from('unit_of_measures')
      .insert({
        name: newName.trim(),
        short_code: newShortCode.trim(),
        precision: Number(newPrecision),
        restaurant_id: restaurantId
      });
    
    if (createError) {
      setError(createError.message);
    } else {
      setNewName('');
      setNewShortCode('');
      setNewPrecision(0);
      fetchUoms();
      onSaved?.();
    }
  };

  const updateUom = async (id) => {
    const err = validate(editName, editShortCode, editPrecision);
     if (err) { setError(err); return; }
    setError('');

    // Duplicate Check
    const exists = uoms.some(u => 
      u.id !== id &&
      (u.name.toLowerCase() === editName.trim().toLowerCase() ||
       u.short_code.toLowerCase() === editShortCode.trim().toLowerCase())
    );

    if (exists) {
        setError(`Unit with name "${editName}" or code "${editShortCode}" already exists.`);
        return;
    }
    
    const { error: updateError } = await supabase
      .from('unit_of_measures')
      .update({
        name: editName.trim(),
        short_code: editShortCode.trim(),
        precision: Number(editPrecision)
      })
      .eq('id', id);
    
    if (updateError) {
      setError(updateError.message);
    } else {
       fetchUoms();
       onSaved?.();
    }
  };

  const deleteUom = async (id) => {
    setError('');
    
    const uom = uoms.find(u => u.id === id);
    if (!uom) return;

    // Check usage in menu_items
    const { count, error: usageErr } = await supabase
      .from('menu_items')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('uom_id', id);
    
    if (usageErr) {
      setError('Failed to check usage');
      return;
    }

    if (count > 0) {
      setError(`Cannot delete: This unit is used by ${count} products.`);
      setDeleteConfirm(null);
      return;
    }

    const { error: deleteError } = await supabase
      .from('unit_of_measures')
      .delete()
      .eq('id', id);
    
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setEditingUomId(null);
      setDeleteConfirm(null);
      fetchUoms();
      onSaved?.();
    }
  };

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cm-header">
          <h2 className="cm-title">Manage Units (UOM)</h2>
          <button className="cm-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="cm-content">
          {error && (
            <div className="cm-error">{error}</div>
          )}

          {/* Create New UOM */}
          {/* Unit Defaults Section - Redesigned */}
          <div className="cm-section" style={{marginBottom: 8}}>
             <div style={{
                padding:'16px', borderRadius:'12px', border:'1px solid #e2e8f0', 
                background: 'linear-gradient(to bottom, #ffffff, #f8fafc)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                display:'flex', flexDirection:'column', gap:12
             }}>
                 <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap'}}>
                    <div style={{flex:1, minWidth:'200px'}}>
                       <div style={{fontSize:15, fontWeight:600, color:'#0f172a', marginBottom:4}}>
                          Default Unit
                       </div>
                       <div style={{fontSize:13, color:'#64748b', lineHeight:1.5}}>
                          This unit will be automatically selected when you add new menu items or ingredients.
                       </div>
                    </div>
                    <div style={{width:'180px', flexShrink:0}}>
                       <NiceSelect
                         value={defaultUomId}
                         onChange={(val) => handleSetDefault(val)}
                         placeholder="Select default..."
                         options={uoms.map(u => ({ value: u.id, label: `${u.name} (${u.short_code})` }))}
                       />
                    </div>
                 </div>
             </div>
          </div>

           {/* Create New UOM */}
          <div className="cm-section">
             <div className="cm-label">Create New Unit</div>
             <div className="cm-create-grid">
               <div style={{ flex: 2 }}>
                  <label className="sub-label">Name <span style={{color:'red'}}>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Bundle"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="cm-input"
                  />
               </div>
               <div style={{ flex: 1 }}>
                  <label className="sub-label">Code <span style={{color:'red'}}>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. bdl"
                    value={newShortCode}
                    onChange={(e) => setNewShortCode(e.target.value)}
                    className="cm-input"
                  />
               </div>
               <div style={{ flex: 1 }}>
                  <label className="sub-label">Precision <span style={{color:'red'}}>*</span></label>
                  <input
                    type="number"
                    min="0" max="4"
                    value={newPrecision}
                    onChange={(e) => setNewPrecision(e.target.value)}
                    className="cm-input"
                  />
               </div>
             </div>
             <button onClick={createUom} className="cm-primary-btn" style={{ marginTop: 8 }}>
                Add Unit
             </button>
          </div>

          <div className="cm-divider"></div>

          {/* Existing UOMs */}
          <div className="cm-section">
            <div className="cm-label">Manage Existing Units</div>
            {loading ? (
              <div className="cm-loading">Loading...</div>
            ) : uoms.length === 0 ? (
              <div className="cm-empty">No units found.</div>
            ) : (
                <div style={{maxHeight:'300px', overflowY:'auto', border:'1px solid #e5e7eb', borderRadius:12}}>
                    <table style={{width:'100%', borderCollapse:'collapse', fontSize:14}} className="cm-table">
                        <thead style={{position:'sticky', top:0, background:'#f9fafb', zIndex:10}}>
                            <tr>
                                <th style={{textAlign:'left', padding:'12px 8px', borderBottom:'1px solid #e5e7eb', color:'#4b5563', fontWeight:600, width:'40%'}}>Name</th>
                                <th style={{textAlign:'center', padding:'12px 8px', borderBottom:'1px solid #e5e7eb', color:'#4b5563', fontWeight:600, width:'15%'}}>Code</th>
                                <th style={{textAlign:'center', padding:'12px 8px', borderBottom:'1px solid #e5e7eb', color:'#4b5563', fontWeight:600, width:'20%'}} className="hide-precision-mobile">Precision</th>
                                <th style={{textAlign:'right', padding:'12px 8px', borderBottom:'1px solid #e5e7eb', color:'#4b5563', fontWeight:600, width:'25%'}}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {uoms.map(u => (
                                <tr key={u.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                                    <td style={{padding:'12px 8px', color:'#111827'}}>
                                        <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                                            {u.name}
                                            {!u.restaurant_id && <span style={{fontSize:9, background:'#e0e7ff', color:'#3730a3', padding:'2px 6px', borderRadius:12, fontWeight:600, border:'1px solid #c7d2fe'}}>Global</span>}
                                        </div>
                                    </td>
                                    <td style={{padding:'12px 8px', color:'#374151', textAlign:'center', fontFamily:'monospace', fontSize:13}}>{u.short_code}</td>
                                    <td style={{padding:'12px 8px', textAlign:'center', color:'#374151'}} className="hide-precision-mobile">{u.precision || 0}</td>
                                    <td style={{padding:'12px 8px', textAlign:'right'}}>
                                         <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center'}}>
                                            {u.restaurant_id ? (
                                                <button 
                                                    onClick={() => {
                                                        setEditingUomId(u.id);
                                                        setEditName(u.name);
                                                        setEditShortCode(u.short_code);
                                                        setEditPrecision(u.precision || 0);
                                                        setDeleteConfirm(null);
                                                    }}
                                                    style={{fontSize:13, color:'#f97316', background:'none', border:'none', cursor:'pointer', fontWeight:600}}
                                                >
                                                    Edit
                                                </button>
                                            ) : (
                                                <span style={{fontSize:12, color:'#9ca3af', minWidth: 26, textAlign: 'center'}}>Locked</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            {editingUomId && (
                <div className="cm-edit-modal-overlay" onClick={() => setEditingUomId(null)}>
                     <div className="cm-edit-modal" onClick={e => e.stopPropagation()}>
                        <h3 className="cm-title" style={{marginBottom:16}}>Edit Unit</h3>
                        {/* Edit Form */}
                        <div className="cm-create-grid" style={{flexDirection:'column', gap:12}}>
                             <div>
                                <label className="sub-label">Name</label>
                                <input className="cm-input" value={editName} onChange={e => setEditName(e.target.value)} />
                             </div>
                             <div>
                                <label className="sub-label">Short Code</label>
                                <input className="cm-input" value={editShortCode} onChange={e => setEditShortCode(e.target.value)} />
                             </div>
                             <div>
                                <label className="sub-label">Precision (Decimals)</label>
                                <input type="number" className="cm-input" value={editPrecision} onChange={e => setEditPrecision(e.target.value)} />
                             </div>
                        </div>
                        <div style={{display:'flex', justifyContent:'space-between', marginTop:24}}>
                             <button onClick={() => deleteUom(editingUomId)} style={{color:'#ef4444', background:'none', border:'none', cursor:'pointer', fontWeight:600}}>Delete</button>
                             <div style={{display:'flex', gap:10}}>
                                 <button onClick={() => setEditingUomId(null)} className="cm-secondary-btn">Cancel</button>
                                 <button onClick={() => updateUom(editingUomId)} className="cm-primary-btn" style={{width:'auto'}}>Save Changes</button>
                             </div>
                        </div>
                     </div>
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
        .cm-content { padding: 24px; overflow-y: auto; flex: 1; padding-bottom: 200px; }
        .cm-section { display: flex; flex-direction: column; gap: 12px; }
        .cm-label { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px; }
        
        .cm-create-grid { display: flex; gap: 10px; }
        .sub-label { display: block; font-size: 11px; color: #6b7280; margin-bottom: 4px; font-weight: 500; }

        @media (max-width: 480px) {
           .cm-create-grid { flex-direction: column; }
           .hide-precision-mobile { display: none !important; }
           /* Adjust existing th/td if needed */
        }

        .cm-input {
          width: 100%; padding: 10px 12px; border: 1px solid #d1d5db;
          border-radius: 8px; font-size: 14px; outline: none; background: #f9fafb;
        }
        .cm-primary-btn {
          padding: 0 16px; background: #f97316; color: white; border: none;
          border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; height: 40px;
          width: 100%;
        }
        .cm-secondary-btn {
          padding: 0 16px; background: white; color: #374151; border: 1px solid #d1d5db;
          border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; height: 36px;
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
        .cm-edit-modal-overlay {
          position: absolute; inset: 0; background: rgba(0,0,0,0.2);
          display: flex; align-items: center; justify-content: center;
          border-radius: 16px;
        }
        .cm-edit-modal {
          background: white; padding: 24px; border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          width: 90%; max-width: 400px;
        }
      `}</style>
    </div>
  );
}
