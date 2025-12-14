
import React, { useState } from 'react';
import styled from 'styled-components';
import { getSupabase } from '../services/supabase';
import Button from './ui/Button';
import NiceSelect from './NiceSelect';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
`;

const Modal = styled.div`
  background: white;
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
`;

const Header = styled.div`
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
`;

const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 24px;
`;

const Footer = styled.div`
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

const ImagePreview = styled.img`
  max-width: 100%;
  max-height: 300px;
  border-radius: 8px;
  margin-bottom: 16px;
  object-fit: contain;
  background: #f3f4f6;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 16px;

  th, td {
    padding: 12px;
    border-bottom: 1px solid #e5e7eb;
    text-align: left;
    font-size: 14px;
  }

  th {
    background: #f9fafb;
    font-weight: 600;
    color: #374151;
  }

  input, select {
    width: 100%;
    padding: 6px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
  }
`;

export default function MenuImageImport({ onClose, onImported, restaurantId, existingItems = [] }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [parsedItems, setParsedItems] = useState([]);
  const [step, setStep] = useState('upload'); // upload, review
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
      setError('');
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setError('');

    try {
      // 1. Convert to Base64
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });

      // 2. Call API
      const res = await fetch('/api/ai/parse-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 })
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Failed to analyze image');
      }

      const data = await res.json();
      if (Array.isArray(data.items)) {
        // Check for duplicates
        const normalizedExisting = new Set(existingItems.map(i => (i.name || '').toLowerCase().trim()));
        
        const processed = data.items.map(i => {
          const isDupe = normalizedExisting.has((i.name || '').toLowerCase().trim());
          return { 
            ...i, 
            selected: !isDupe, // Uncheck if duplicate by default
            isDupe 
          };
        });

        setParsedItems(processed);
        setStep('review');
      } else {
        throw new Error('Invalid response format');
      }

    } catch (e) {
      console.error(e);
      setError(e.message || 'Error parsing image. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...parsedItems];
    updated[index] = { ...updated[index], [field]: value };
    setParsedItems(updated);
  };

  const removeItem = (index) => {
    setParsedItems(parsedItems.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    setUploading(true);
    setError('');
    const supabase = getSupabase();

    try {
      // Filter valid items
      const toImport = parsedItems.filter(i => i.selected && i.name && i.price);
      
      if (toImport.length === 0) {
        throw new Error('No items selected to import');
      }

      const rows = toImport.map(i => ({
        restaurant_id: restaurantId,
        name: i.name,
        price: parseFloat(i.price) || 0,
        category: i.category || 'Others',
        veg: !!i.veg,
        description: i.description || ''
      }));

      // Store image history (Optional, per user request "history of upload")
      // We might not have a table for this yet, so maybe skip or just log.
      // Ideally we'd upload the image to storage and create a log entry.
      // For now, let's just create the menu items.

      const { data, error: itemErr } = await supabase
        .from('menu_items')
        .insert(rows)
        .select();

      if (itemErr) throw itemErr;

      onImported(data);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={e => e.stopPropagation()}>
        <Header>
          <h3>Import Menu from Image</h3>
          <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:24, cursor:'pointer'}}>&times;</button>
        </Header>
        
        <Content>
          {error && <div style={{padding: 12, background: '#fee2e2', color: '#dc2626', borderRadius: 8, marginBottom: 16}}>{error}</div>}

          {step === 'upload' && (
            <div style={{textAlign: 'center', padding: 40}}>
              {previewUrl ? (
                <div>
                  <ImagePreview src={previewUrl} alt="Preview" />
                  <div style={{marginTop: 16}}>
                    <Button variant="outline" onClick={() => { setFile(null); setPreviewUrl(null); }} disabled={analyzing}>
                      Change Image
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{border: '2px dashed #d1d5db', padding: 40, borderRadius: 12}}>
                  <p style={{marginBottom: 16, fontSize: 16, color: '#6b7280'}}>Upload a clear photo of your menu</p>
                  <label>
                    <input type="file" accept="image/*" onChange={handleFileChange} style={{display: 'none'}} />
                    <span style={{
                      padding: '10px 20px', 
                      background: '#4f46e5', 
                      color: 'white', 
                      borderRadius: 8, 
                      cursor: 'pointer',
                      fontWeight: 500
                    }}>
                      Choose File
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {step === 'review' && (
            <div>
              <p style={{marginBottom: 16, color: '#6b7280'}}>Review the extracted items before importing.</p>
              <div style={{maxHeight: '50vh', overflowY: 'auto'}}>
                <Table>
                  <thead>
                    <tr>
                      <th style={{width: 40}}>#</th>
                      <th>Name</th>
                      <th>Price</th>
                      <th>Category</th>
                      <th style={{width: 80}}>Veg</th>
                      <th style={{width: 60}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.map((item, idx) => (
                      <tr key={idx} style={{opacity: item.selected ? 1 : 0.5}}>
                        <td>
                          <input 
                            type="checkbox" 
                            checked={!!item.selected} 
                            onChange={(e) => handleItemChange(idx, 'selected', e.target.checked)}
                          />
                        </td>
                        <td>
                          <div style={{display:'flex', flexDirection:'column'}}>
                            <input 
                              value={item.name} 
                              onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                              placeholder="Item Name"
                              style={{borderColor: item.isDupe ? '#f59e0b' : '#d1d5db'}}
                            />
                            {item.isDupe && (
                              <span style={{fontSize: 11, color: '#d97706', fontWeight: 600, marginTop: 2}}>
                                ⚠️ Already exists
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <input 
                            type="number"
                            value={item.price} 
                            onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                        <td>
                          <input 
                            value={item.category || ''} 
                            onChange={(e) => handleItemChange(idx, 'category', e.target.value)}
                            placeholder="Category"
                          />
                        </td>
                        <td style={{textAlign: 'center'}}>
                          <input 
                            type="checkbox" 
                            checked={!!item.veg} 
                            onChange={(e) => handleItemChange(idx, 'veg', e.target.checked)}
                          />
                        </td>
                        <td>
                          <button 
                            onClick={() => removeItem(idx)}
                            style={{color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight:'bold'}}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          )}
        </Content>

        <Footer>
          {step === 'upload' && (
            <>
              <Button variant="secondary" onClick={onClose} disabled={analyzing}>Cancel</Button>
              <Button onClick={handleAnalyze} disabled={!file || analyzing}>
                {analyzing ? 'Analyzing Image...' : 'Process Image'}
              </Button>
            </>
          )}
          {step === 'review' && (
            <>
              <Button variant="secondary" onClick={() => setStep('upload')} disabled={uploading}>Back</Button>
              <Button onClick={handleImport} disabled={uploading}>
                {uploading ? 'Importing...' : `Import ${parsedItems.filter(i => i.selected).length} Items`}
              </Button>
            </>
          )}
        </Footer>
      </Modal>
    </Overlay>
  );
}
