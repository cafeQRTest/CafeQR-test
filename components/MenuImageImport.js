//components/MenuImageImport

import React, { useState, useRef } from "react";
import Button from "./ui/Button";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Compress image to ~900px to speed up AI
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_DIM = 900;
        let w = img.width;
        let h = img.height;
        if (w > h) { if (w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; } } 
        else { if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; } }
        canvas.width = w; canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

export default function MenuImageImport({ onClose, onImported, restaurantId, existingItems = [] }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [items, setItems] = useState([]);
  const [step, setStep] = useState("upload");
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setError("");
    }
  };

  const processImage = async () => {
    if (!file) return;
    setStep("processing");
    setStatusMsg("Preparing image...");
    setError("");

    try {
      const base64 = await compressImage(file);
      setStatusMsg("Analyzing with Gemini... (may take 30s)");

      // Try calling API; if 503/504, retry once more
      let finalResult = null;
      for (let i = 0; i < 2; i++) {
        try {
          const res = await fetch("/api/ai/parse-menu", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: base64 })
          });

          if (res.status === 503 || res.status === 504) {
             setStatusMsg("AI is busy, retrying one last time...");
             await sleep(3000); 
             continue;
          }

          if (!res.ok) {
             const errData = await res.json();
             throw new Error(errData.details || errData.message || "Analysis failed");
          }

          finalResult = await res.json();
          break; 
        } catch (e) {
          if (i === 1) throw e; 
        }
      }

      if (!finalResult?.items) throw new Error("No items found. Try a clearer image.");

      const existingNames = new Set(existingItems.map(x => x.name.toLowerCase()));
      const processed = finalResult.items.map(it => ({
        ...it,
        selected: !existingNames.has(it.name.toLowerCase()),
        isDupe: existingNames.has(it.name.toLowerCase())
      }));

      setItems(processed);
      setStep("review");

    } catch (err) {
      setError(err.message || "Failed to process image.");
      setStep("upload");
    }
  };

  const doImport = async () => {
    setStep("importing");
    setStatusMsg("Saving items...");
    try {
      const toImport = items.filter(i => i.selected);
      const res = await fetch("/api/owner/import-menu-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, items: toImport })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      onImported(json.inserted);
      onClose();
    } catch (e) {
      setError("Import Error: " + e.message);
      setStep("review");
    }
  };

  return (
    <div className="import-overlay">
      <div className="import-modal">
        {/* Header */}
        <div className="import-header">
          <div className="import-header-left">
            <div className="import-icon">📋</div>
            <h2 className="import-title">Menu Import</h2>
          </div>
          <button onClick={onClose} className="import-close" aria-label="Close">✕</button>
        </div>

        {/* Content */}
        <div className="import-content">
          {error && (
            <div className="import-error">
              ⚠️ {error}
            </div>
          )}
          
          {step === "upload" && (
            <>
              {preview ? (
                <div className="import-preview-wrap">
                  <img src={preview} alt="Menu preview" className="import-preview-img" />
                  <button onClick={() => { setPreview(null); setFile(null); }} className="import-change-btn">
                    🔄 Change Image
                  </button>
                </div>
              ) : (
                <div 
                  className="import-dropzone" 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    accept="image/*" 
                    onChange={handleFile} 
                    style={{ display: 'none' }}
                  />
                  <div className="import-dropzone-icon">📸</div>
                  <div className="import-dropzone-text">
                    <span className="import-dropzone-highlight">Click to upload</span> your menu photo
                  </div>
                  <div className="import-dropzone-hint">PNG, JPG, or GIF</div>
                </div>
              )}
            </>
          )}

          {step === "processing" && (
             <div className="import-processing">
                <div className="import-processing-icon">📄</div>
                <div className="import-processing-text">Analyzing menu...</div>
                <div className="import-processing-hint">This may take a moment</div>
             </div>
          )}

          {step === "importing" && (
             <div className="import-processing">
                <div className="import-processing-icon">💾</div>
                <div className="import-processing-text">Importing items...</div>
                <div className="import-processing-hint">Please wait</div>
             </div>
          )}

          {step === "review" && (
            <div className="import-review">
              <div className="import-stats">
                <div className="import-stat">
                  <span className="import-stat-num">{items.length}</span>
                  <span className="import-stat-label">Found</span>
                </div>
                <div className="import-stat import-stat-primary">
                  <span className="import-stat-num">{items.filter(i => i.selected).length}</span>
                  <span className="import-stat-label">Selected</span>
                </div>
                <div className="import-stat import-stat-warn">
                  <span className="import-stat-num">{items.filter(i => i.isDupe).length}</span>
                  <span className="import-stat-label">Duplicates</span>
                </div>
              </div>

              <div className="import-items">
                {items.map((it, idx) => (
                  <div key={idx} className={`import-item ${it.selected ? 'import-item-selected' : ''}`}>
                    <div className="import-item-header">
                      <input 
                        type="checkbox" 
                        checked={it.selected} 
                        onChange={e => { 
                          const c = [...items]; 
                          c[idx].selected = e.target.checked; 
                          setItems(c); 
                        }} 
                        className="import-checkbox"
                      />
                      {it.isDupe && <span className="import-badge">⚠️ Duplicate</span>}
                    </div>
                    <div className="import-item-fields">
                      <div className="import-field import-field-full">
                        <label>Name</label>
                        <input 
                          value={it.name} 
                          onChange={e => { 
                            const c = [...items]; 
                            c[idx].name = e.target.value; 
                            setItems(c); 
                          }} 
                          placeholder="Item name"
                        />
                      </div>
                      <div className="import-field-row">
                        <div className="import-field">
                          <label>Price</label>
                          <div className="import-price">
                            <span>₹</span>
                            <input 
                              type="number" 
                              value={it.price} 
                              onChange={e => { 
                                const c = [...items]; 
                                c[idx].price = e.target.value; 
                                setItems(c); 
                              }} 
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <div className="import-field">
                          <label>Category</label>
                          <input 
                            value={it.category} 
                            onChange={e => { 
                              const c = [...items]; 
                              c[idx].category = e.target.value; 
                              setItems(c); 
                            }} 
                            placeholder="Category"
                          />
                        </div>
                      </div>
                      
                      {/* Variants Section */}
                      {it.variants && it.variants.length > 0 && (
                        <div className="import-variants-section">
                           {it.variants.map((v, vIdx) => (
                             <div key={vIdx} className="import-variant-card">
                                <div className="import-variant-header-row">
                                   <label>Variant Group</label>
                                   <input 
                                      value={v.template || ''}
                                      onChange={e => {
                                         const c = [...items];
                                         if (!c[idx].variants[vIdx]) return;
                                         c[idx].variants[vIdx].template = e.target.value;
                                         setItems(c);
                                      }}
                                      placeholder="e.g. Size, Color"
                                      className="variant-template-input"
                                   />
                                </div>
                                <div className="import-variant-options-list">
                                   <div className="import-options-header-row">
                                      <span>Option Name</span>
                                      <span>Price</span>
                                   </div>
                                   {v.options && v.options.map((opt, optIdx) => (
                                      <div key={optIdx} className="import-variant-option-row">
                                         <input 
                                           value={opt.name || ''}
                                           onChange={e => {
                                             const c = [...items];
                                             c[idx].variants[vIdx].options[optIdx].name = e.target.value;
                                             setItems(c);
                                           }}
                                           placeholder="Option (e.g. Small)"
                                           className="variant-opt-name"
                                         />
                                         <div className="import-price-compact">
                                            <span>₹</span>
                                            <input 
                                              type="number"
                                              value={opt.price}
                                              onChange={e => {
                                                const c = [...items];
                                                c[idx].variants[vIdx].options[optIdx].price = e.target.value;
                                                setItems(c);
                                              }}
                                              placeholder="0"
                                            />
                                         </div>
                                      </div>
                                   ))}
                                </div>
                             </div>
                           ))}
                        </div>
                      )}

                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="import-footer">
          <Button variant="outline" onClick={onClose} disabled={step === "processing" || step === "importing"}>Cancel</Button>
          {step === "upload" && <Button onClick={processImage} disabled={!file}>✨ Analyze</Button>}
          {step === "review" && (
            <Button onClick={doImport} disabled={items.filter(i => i.selected).length === 0}>
              Import ({items.filter(i => i.selected).length})
            </Button>
          )}
          {step === "importing" && (
            <Button disabled>Importing...</Button>
          )}
        </div>
      </div>

      <style jsx>{`
        .import-overlay {
          position: fixed;
          inset: 0;
          background: rgba(11, 18, 32, 0.5);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { 
            transform: translateY(20px);
            opacity: 0;
          }
          to { 
            transform: translateY(0);
            opacity: 1;
          }
        }

        .import-modal {
          background: white;
          width: 100%;
          max-width: 560px;
          max-height: 88vh;
          border-radius: 12px;
          box-shadow: 
            0 0 0 1px rgba(0, 0, 0, 0.05),
            0 20px 40px rgba(0, 0, 0, 0.15);
          display: flex;
          flex-direction: column;
          animation: slideUp 0.25s ease-out;
          overflow: hidden;
        }

        .import-header {
          padding: 18px 20px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
          color: #111827;
        }

        .import-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .import-icon {
          font-size: 22px;
        }

        .import-title {
          margin: 0;
          font-size: 17px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        .import-close {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          font-size: 24px;
          color: #92400e;
          cursor: pointer;
          transition: opacity 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .import-close:hover {
          opacity: 0.7;
        }

        .import-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          background: white;
        }

        .import-content::-webkit-scrollbar {
          width: 8px;
        }

        .import-content::-webkit-scrollbar-track {
          background: #f1f1f1;
        }

        .import-content::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 4px;
        }

        .import-content::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }

        .import-error {
          background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
          color: #dc2626;
          padding: 14px 18px;
          border-radius: 10px;
          margin-bottom: 20px;
          font-size: 14px;
          font-weight: 500;
          border: 1px solid #fecaca;
          box-shadow: 0 2px 8px rgba(220, 38, 38, 0.08);
        }

        .import-dropzone {
          border: 1.5px dashed #d1d5db;
          border-radius: 8px;
          padding: 40px 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #fafafa;
        }

        .import-dropzone:hover {
          border-color: #f97316;
          background: #fff7ed;
        }

        .import-dropzone-icon {
          font-size: 40px;
          margin-bottom: 12px;
          opacity: 0.9;
        }

        .import-dropzone-text {
          font-size: 14px;
          color: #374151;
          margin-bottom: 6px;
          font-weight: 500;
        }

        .import-dropzone-highlight {
          color: #f97316;
          font-weight: 600;
        }

        .import-dropzone-hint {
          font-size: 12px;
          color: #9ca3af;
        }

        .import-preview-wrap {
          text-align: center;
        }

        .import-preview-img {
          width: 100%;
          max-height: 320px;
          object-fit: contain;
          border-radius: 10px;
          background: #f9fafb;
          margin-bottom: 18px;
          border: 1px solid #e5e7eb;
        }

        .import-change-btn {
          padding: 12px 28px;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .import-change-btn:hover {
          background: #fff7ed;
          border-color: #f97316;
          color: #f97316;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.15);
        }

        .import-processing {
          text-align: center;
          padding: 50px 24px;
        }

        .import-processing-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.8;
        }

        .import-processing-text {
          font-size: 15px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 6px;
        }

        .import-processing-hint {
          font-size: 13px;
          color: #9ca3af;
        }

        .import-review {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .import-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          padding: 20px;
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }

        .import-stat {
          text-align: center;
          padding: 8px;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .import-stat:hover {
          background: #f9fafb;
        }

        .import-stat-num {
          display: block;
          font-size: 32px;
          font-weight: 800;
          color: #0b1220;
          margin-bottom: 6px;
          background: linear-gradient(135deg, #0b1220 0%, #374151 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .import-stat-primary .import-stat-num {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .import-stat-warn .import-stat-num {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .import-stat-label {
          font-size: 11px;
          color: #6b7280;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }

        .import-items {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .import-item {
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          padding: 18px;
          background: white;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .import-item:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .import-item-selected {
          border-color: #f97316;
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.15);
        }

        .import-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }

        .import-checkbox {
          width: 22px;
          height: 22px;
          accent-color: #f97316;
          cursor: pointer;
        }

        .import-badge {
          font-size: 11px;
          padding: 5px 12px;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border: 1px solid #fcd34d;
          border-radius: 8px;
          color: #92400e;
          font-weight: 700;
          letter-spacing: 0.3px;
          text-transform: uppercase;
          box-shadow: 0 2px 4px rgba(217, 119, 6, 0.1);
        }

        .import-item-fields {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .import-field {
          display: flex;
          flex-direction: column;
        }

        .import-field-full {
          width: 100%;
        }

        .import-field label {
          font-size: 11px;
          font-weight: 700;
          color: #6b7280;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }

        .import-field input {
          padding: 12px 14px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          font-size: 14px;
          background: #fafafa;
          outline: none;
          transition: all 0.2s;
          font-weight: 500;
        }

        .import-field input:focus {
          border-color: #f97316;
          background: white;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }

        .import-field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .import-price {
          display: flex;
          align-items: center;
          padding: 12px 14px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          background: #fafafa;
          transition: all 0.2s;
        }

        .import-price:focus-within {
          border-color: #f97316;
          background: white;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }

        .import-price span {
          font-size: 15px;
          font-weight: 700;
          color: #6b7280;
          margin-right: 8px;
        }

        .import-price input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 14px;
          font-weight: 600;
          outline: none;
          color: #0b1220;
          padding: 0;
        }

        .import-footer {
          padding: 18px 24px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: white;
          box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.03);
        }

        @media (max-width: 640px) {
          .import-modal {
            max-width: 100%;
            max-height: 95vh;
            border-radius: 16px 16px 0 0;
          }
          .import-field-row {
            grid-template-columns: 1fr;
          }
          .import-content {
            padding: 20px;
          }
          .import-dropzone {
            padding: 48px 24px;
          }
        }

        .import-variants-section {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .import-variant-card {
           background: #f8fafc;
           border: 1px solid #e2e8f0;
           border-radius: 10px;
           padding: 16px;
        }

        .import-variant-header-row {
           margin-bottom: 14px;
        }

        .import-variant-header-row label {
           display: block;
           font-size: 10px;
           font-weight: 700;
           color: #64748b;
           margin-bottom: 6px;
           text-transform: uppercase;
           letter-spacing: 0.8px;
        }

        .variant-template-input {
           width: 100%;
           padding: 10px 12px;
           border: 1px solid #cbd5e1;
           border-radius: 8px;
           font-size: 14px;
           font-weight: 600;
           color: #1e293b;
           background: white;
           transition: all 0.2s;
        }

        .variant-template-input:focus {
           border-color: #f97316;
           box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
           outline: none;
        }

        .import-variant-options-list {
           display: flex;
           flex-direction: column;
           gap: 8px;
        }

        .import-options-header-row {
           display: grid;
           grid-template-columns: 2fr 1fr;
           gap: 12px;
           padding: 0 4px;
           margin-bottom: 2px;
        }

        .import-options-header-row span {
           font-size: 10px;
           font-weight: 700;
           color: #94a3b8;
           text-transform: uppercase;
           letter-spacing: 0.5px;
        }

        .import-variant-option-row {
           display: grid;
           grid-template-columns: 2fr 1fr;
           gap: 12px;
           align-items: center;
        }

        .variant-opt-name {
           padding: 10px 12px;
           border: 1px solid #e2e8f0;
           border-radius: 8px;
           font-size: 13px;
           background: white;
           width: 100%;
           outline: none;
           transition: all 0.2s;
           font-weight: 500;
           color: #334155;
        }

        .variant-opt-name:focus {
           border-color: #f97316;
           box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.1);
        }

        .import-price-compact {
           display: flex;
           align-items: center;
           padding: 10px 12px;
           border: 1px solid #e2e8f0;
           border-radius: 8px;
           background: white;
           transition: all 0.2s;
        }

        .import-price-compact:focus-within {
           border-color: #f97316;
           box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.1);
        }

        .import-price-compact span {
           font-size: 13px;
           font-weight: 600;
           color: #64748b;
           margin-right: 6px;
        }

        .import-price-compact input {
           width: 100%;
           border: none;
           background: transparent;
           font-size: 13px;
           font-weight: 600;
           outline: none;
           padding: 0;
           color: #0f172a;
        }


/* Legacy CSS removed */


      `}</style>
    </div>
  );
}
