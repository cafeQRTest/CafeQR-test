// components/UomManager.js
// Modal for creating and managing units of measure

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';
import { keyframes } from 'styled-components';
import { FaPencilAlt, FaTimes } from 'react-icons/fa';
import { getSupabase } from '../services/supabase';
import NiceSelect from './NiceSelect';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999999;
  padding: 16px;
  backdrop-filter: blur(8px);
`;

const Modal = styled.div`
  background: white;
  border-radius: 20px;
  width: 100%;
  max-width: 550px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  position: relative;
  overflow: hidden;
  padding: 24px;
`;

const Header = styled.div`
  padding: 0 0 16px 0;
  margin-bottom: 20px;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;

  @media (max-width: 480px) {
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
`;

const CloseBtn = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: #92400e;
  line-height: 1;
  transition: opacity 0.2s;
  
  &:hover {
    opacity: 0.7;
  }
`;

const Content = styled.div`
  padding: 0;
  overflow-y: auto;
  flex: 1;
`;

const Section = styled.div`
  margin-bottom: 24px;
  &:last-child { margin-bottom: 0; }
`;

const Label = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 8px;
`;

const InputGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  @media (max-width: 480px) { flex-direction: column; }
`;

const InputField = styled.div`
  flex: ${props => props.width || 1};
`;

const SubLabel = styled.label`
  display: block;
  font-size: 0.75rem;
  color: #64748b;
  margin-bottom: 4px;
  font-weight: 500;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 0.9375rem;
  outline: none;
  background: #f8fafc;
  transition: all 0.2s;
  &:focus {
    border-color: #f97316;
    background: white;
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
  }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 24px;
  background: #f97316;
  color: white;
  border: 1px solid #f97316;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);

  &:hover { background: #ea580c; border-color: #ea580c; transform: translateY(-1px); }
  &:active { transform: translateY(0); }
  &:disabled { background: #d1d5db; border-color: #d1d5db; cursor: not-allowed; }
`;

const OutlineButton = styled(PrimaryButton)`
  background: white;
  color: #f97316;
  border-color: #f97316;
  box-shadow: none;
  &:hover { background: #fff7ed; color: #ea580c; }
`;

const TableContainer = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  margin-top: 12px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  table-layout: fixed;
`;

const Th = styled.th`
  text-align: left;
  padding: 12px 16px;
  background: #f8fafc;
  color: #64748b;
  font-weight: 600;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;

  @media (max-width: 480px) {
    padding: 10px 4px;
    font-size: 0.7rem;
  }
`;

const Td = styled.td`
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
  word-break: break-all;

  @media (max-width: 480px) {
    padding: 10px 4px;
    font-size: 0.75rem;
  }
`;

const EditModalOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  z-index: 100;
`;

const EditModal = styled.div`
  background: white;
  padding: 24px;
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
`;

const ErrorMsg = styled.div`
  background: #fff1f2;
  color: #be123c;
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 20px;
  font-size: 0.875rem;
  border: 1px solid #ffe4e6;
`;

export default function UomManager({ restaurantId, onClose, onSaved }) {
  const supabase = getSupabase();
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUomId, setEditingUomId] = useState(null);
  const [mounted, setMounted] = useState(false);
  
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

  useEffect(() => {
    setMounted(true);
    if (restaurantId) {
      fetchUoms();
      fetchDefaultUom();
    }
    return () => setMounted(false);
  }, [restaurantId]);

  const fetchDefaultUom = async () => {
    if (!restaurantId) return;
    const { data } = await supabase
        .from('restaurants')
        .select('default_uom_id')
        .eq('id', restaurantId)
        .single();
    if (data) setDefaultUomId(data.default_uom_id);
  };
  
  const handleSetDefault = async (newId) => {
    try {
      // Step 1: Get current default UOM ID to find items using it
      const { data: currentRestaurant, error: fetchErr } = await supabase
        .from('restaurants')
        .select('default_uom_id')
        .eq('id', restaurantId)
        .single();
      
      if (fetchErr) {
        setError(`Failed to fetch current default: ${fetchErr.message}`);
        return;
      }
      
      const oldDefaultId = currentRestaurant?.default_uom_id;
      
      // Step 2: Update restaurant's default_uom_id
      const { error: updateRestErr } = await supabase
        .from('restaurants')
        .update({ default_uom_id: newId })
        .eq('id', restaurantId);
      
      if (updateRestErr) {
        setError(updateRestErr.message);
        return;
      }
      
      // Step 3: Update menu items that were using the old default
      // Update both items with uom_id = null AND items with uom_id = oldDefaultId
      if (oldDefaultId) {
        // Update items that explicitly have the old default UOM
        const { error: updateOldErr } = await supabase
          .from('menu_items')
          .update({ uom_id: newId })
          .eq('restaurant_id', restaurantId)
          .eq('uom_id', oldDefaultId);
        
        if (updateOldErr) {
          console.error('Failed to update items with old default:', updateOldErr);
        }
      }
      
      // Also update items with null UOM
      const { error: updateNullErr } = await supabase
        .from('menu_items')
        .update({ uom_id: newId })
        .eq('restaurant_id', restaurantId)
        .is('uom_id', null);
      
      if (updateNullErr) {
        console.error('Failed to update items with null UOM:', updateNullErr);
      }
      
      // Even if item updates had issues, the restaurant default is updated
      setDefaultUomId(newId);
      setError(''); // Clear any previous errors
      onSaved?.();
      
    } catch (ex) {
      setError(`Error updating default UOM: ${ex.message}`);
    }
  };

  const fetchUoms = async () => {
    setLoading(true);
    setError('');
    const filter = `restaurant_id.is.null${restaurantId ? `,restaurant_id.eq.${restaurantId}` : ''}`;
    const { data, error: fetchError } = await supabase
      .from('unit_of_measures')
      .select('*')
      .or(filter)
      .order('name');
    
    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }
    
    // Deduplicate UOMs: if same name exists multiple times, prefer restaurant-specific over global
    const uomMap = new Map();
    (data || []).forEach(uom => {
      const key = uom.name.toLowerCase();
      const existing = uomMap.get(key);
      
      if (!existing) {
        // First occurrence, add it
        uomMap.set(key, uom);
      } else {
        // Duplicate found - prefer restaurant-specific entry
        if (uom.restaurant_id && !existing.restaurant_id) {
          uomMap.set(key, uom);
        }
      }
    });
    
    const deduplicatedUoms = Array.from(uomMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    setUoms(deduplicatedUoms);
    setLoading(false);
  };

  const createUom = async () => {
    if (!newName.trim() || !newShortCode.trim()) { 
      setError("Name and code are required."); 
      return; 
    }
    
    // Check for duplicate name (case-insensitive) across all UOMs
    const { data: existingUoms, error: checkError } = await supabase
      .from('unit_of_measures')
      .select('id, name, restaurant_id')
      .or(`restaurant_id.is.null,restaurant_id.eq.${restaurantId}`)
      .ilike('name', newName.trim());
    
    if (checkError) {
      setError(checkError.message);
      return;
    }
    
    if (existingUoms && existingUoms.length > 0) {
      const existing = existingUoms[0];
      const isSystem = !existing.restaurant_id;
      const errorMsg = isSystem 
        ? `Unit "${newName.trim()}" already exists as a system-level UOM. Please use a different name.`
        : `Unit "${newName.trim()}" already exists. Please use a different name or edit the existing one.`;
      setError(errorMsg);
      return;
    }
    
    // Check for duplicate short code
    const { data: existingCodes, error: codeCheckError } = await supabase
      .from('unit_of_measures')
      .select('id, short_code, restaurant_id')
      .or(`restaurant_id.is.null,restaurant_id.eq.${restaurantId}`)
      .ilike('short_code', newShortCode.trim());
    
    if (codeCheckError) {
      setError(codeCheckError.message);
      return;
    }
    
    if (existingCodes && existingCodes.length > 0) {
      setError(`Short code "${newShortCode.trim()}" is already in use. Please use a different code.`);
      return;
    }
    
    // No duplicates found, proceed with creation
    const { error: createError } = await supabase
      .from('unit_of_measures')
      .insert({
        name: newName.trim(),
        short_code: newShortCode.trim(),
        precision: Number(newPrecision),
        restaurant_id: restaurantId
      });
    
    if (createError) setError(createError.message);
    else {
      setNewName(''); setNewShortCode(''); setNewPrecision(0);
      setError(''); // Clear any previous errors
      fetchUoms(); onSaved?.();
    }
  };

  const updateUom = async (id) => {
    // Check for duplicate name (excluding current UOM being edited)
    const { data: existingUoms, error: checkError } = await supabase
      .from('unit_of_measures')
      .select('id, name, restaurant_id')
      .or(`restaurant_id.is.null,restaurant_id.eq.${restaurantId}`)
      .ilike('name', editName.trim())
      .neq('id', id);
    
    if (checkError) {
      setError(checkError.message);
      return;
    }
    
    if (existingUoms && existingUoms.length > 0) {
      const existing = existingUoms[0];
      const isSystem = !existing.restaurant_id;
      const errorMsg = isSystem 
        ? `Unit "${editName.trim()}" already exists as a system-level UOM. Please use a different name.`
        : `Unit "${editName.trim()}" already exists. Please use a different name.`;
      setError(errorMsg);
      return;
    }
    
    // Check for duplicate short code (excluding current UOM)
    const { data: existingCodes, error: codeCheckError } = await supabase
      .from('unit_of_measures')
      .select('id, short_code, restaurant_id')
      .or(`restaurant_id.is.null,restaurant_id.eq.${restaurantId}`)
      .ilike('short_code', editShortCode.trim())
      .neq('id', id);
    
    if (codeCheckError) {
      setError(codeCheckError.message);
      return;
    }
    
    if (existingCodes && existingCodes.length > 0) {
      setError(`Short code "${editShortCode.trim()}" is already in use. Please use a different code.`);
      return;
    }
    
    // No duplicates found, proceed with update
    const { error: updateError } = await supabase
      .from('unit_of_measures')
      .update({
        name: editName.trim(),
        short_code: editShortCode.trim(),
        precision: Number(editPrecision)
      })
      .eq('id', id);
    
    if (updateError) setError(updateError.message);
    else {
       setError(''); // Clear any previous errors
       fetchUoms(); onSaved?.(); setEditingUomId(null);
    }
  };

  const deleteUom = async (id) => {
     // Check usage (simplified for brevity, usually you'd check in DB)
    const { error: deleteError } = await supabase
      .from('unit_of_measures')
      .delete()
      .eq('id', id);
    
    if (deleteError) setError("Could not delete. Unit might be in use.");
    else { fetchUoms(); onSaved?.(); setEditingUomId(null); }
  };

  if (!mounted) return null;

  const modalJSX = (
    <Overlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>Manage Units (UOM)</Title>
          <CloseBtn onClick={onClose}>✕</CloseBtn>
        </Header>

        <Content>
          {error && <ErrorMsg>{error}</ErrorMsg>}

          <Section>
             <Label>Default Unit</Label>
             <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <NiceSelect
                  value={defaultUomId}
                  onChange={handleSetDefault}
                  placeholder="Select default..."
                  options={uoms.map(u => ({ value: u.id, label: `${u.name} (${u.short_code === 'ea' ? 'Ea' : u.short_code})` }))}
                />
             </div>
          </Section>

          <Section>
             <Label>Add New Unit</Label>
             <InputGroup>
               <InputField width={2}>
                  <SubLabel>Name</SubLabel>
                  <Input placeholder="e.g. Grams" value={newName} onChange={e => setNewName(e.target.value)} />
               </InputField>
               <InputField>
                  <SubLabel>Code</SubLabel>
                  <Input placeholder="g" value={newShortCode} onChange={e => setNewShortCode(e.target.value)} />
               </InputField>
               <InputField>
                  <SubLabel>Decimals</SubLabel>
                  <Input type="number" min="0" max="4" value={newPrecision} onChange={e => setNewPrecision(e.target.value)} />
               </InputField>
             </InputGroup>
             <PrimaryButton onClick={createUom} style={{width:'100%'}}>Add Unit</PrimaryButton>
          </Section>

          <Section>
            <Label>Existing Units</Label>
            <TableContainer>
                <Table>
                    <thead>
                        <tr>
                            <Th style={{width: '40%'}}>Unit Name</Th>
                            <Th style={{textAlign:'center', width: '20%'}}>Code</Th>
                            <Th style={{textAlign:'center', width: '20%'}}>Precision</Th>
                            <Th style={{textAlign:'right', width: '20%'}}>Action</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {uoms.map(u => (
                            <tr key={u.id}>
                                <Td>{u.name}</Td>
                                <Td style={{textAlign:'center', fontFamily:'monospace'}}>{u.short_code === 'ea' ? 'Ea' : u.short_code}</Td>
                                <Td style={{textAlign:'center'}}>{u.precision || 0}</Td>
                                <Td style={{textAlign:'right', whiteSpace:'nowrap'}}>
                                    {u.restaurant_id ? (
                                        <button 
                                          onClick={() => {
                                              setEditingUomId(u.id); setEditName(u.name);
                                              setEditShortCode(u.short_code); setEditPrecision(u.precision || 0);
                                          }}
                                          style={{color:'#f97316', background:'none', border:'none', cursor:'pointer', fontWeight:600}}
                                        >
                                          <FaPencilAlt size={14} />
                                        </button>
                                    ) : (
                                        <span style={{color:'#cbd5e1', fontSize:12}}>System</span>
                                    )}
                                </Td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </TableContainer>
          </Section>
        </Content>

        {editingUomId && (
            <EditModalOverlay onClick={() => setEditingUomId(null)}>
                <EditModal onClick={e => e.stopPropagation()}>
                    <Title style={{marginBottom:16}}>Edit Unit</Title>
                    <div style={{display:'flex', flexDirection:'column', gap:12}}>
                        <div>
                            <SubLabel>Name</SubLabel>
                            <Input value={editName} onChange={e => setEditName(e.target.value)} />
                        </div>
                        <div>
                            <SubLabel>Short Code</SubLabel>
                            <Input value={editShortCode} onChange={e => setEditShortCode(e.target.value)} />
                        </div>
                        <div>
                            <SubLabel>Precision</SubLabel>
                            <Input type="number" value={editPrecision} onChange={e => setEditPrecision(e.target.value)} />
                        </div>
                    </div>
                    <div style={{display:'flex', justifyContent:'space-between', marginTop:24}}>
                        <button onClick={() => deleteUom(editingUomId)} style={{color:'#ef4444', background:'none', border:'none', cursor:'pointer', fontWeight:600}}>Delete</button>
                        <div style={{display:'flex', gap:10}}>
                            <OutlineButton onClick={() => setEditingUomId(null)}>Cancel</OutlineButton>
                            <PrimaryButton onClick={() => updateUom(editingUomId)}>Save</PrimaryButton>
                        </div>
                    </div>
                </EditModal>
            </EditModalOverlay>
        )}
      </Modal>
    </Overlay>
  );

  return ReactDOM.createPortal(modalJSX, document.body);
}
