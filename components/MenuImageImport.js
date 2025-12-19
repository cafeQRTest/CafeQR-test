import React, { useState } from "react";
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
      setStatusMsg("Analyzing with Gemini 2.5... (may take 30s)");

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
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="header">
          <div className="title-row">
            <div className="icon-badge">📋</div>
            <h3 className="title">Menu Import</h3>
          </div>
          <button onClick={onClose} className="close-btn" aria-label="Close">×</button>
        </div>

        <div className="content">
          {error && (
            <div className="error-box">
              ⚠️ {error}
            </div>
          )}
          
          {step === "upload" && (
            <div className="upload-section">
              {preview ? (
                <div className="preview-container">
                  <img src={preview} alt="Menu preview" className="preview-image" />
                  <button onClick={() => { setPreview(null); setFile(null); }} className="change-btn">
                    🔄 Change Image
                  </button>
                </div>
              ) : (
                <label className="upload-dropzone">
                  <input type="file" accept="image/*" onChange={handleFile} className="file-input" />
                  <div className="upload-icon">📸</div>
                  <div className="upload-text">
                    <span className="highlight">Click to upload</span> your menu photo
                  </div>
                  <div className="upload-hint">PNG, JPG, or GIF</div>
                </label>
              )}
            </div>
          )}

          {step === "processing" && (
             <div className="processing-section">
                <div className="loading-icon">📄</div>
                <div className="processing-text">Analyzing menu...</div>
                <div className="processing-hint">This may take a moment</div>
             </div>
          )}

          {step === "importing" && (
             <div className="processing-section">
                <div className="loading-icon">💾</div>
                <div className="processing-text">Importing items...</div>
                <div className="processing-hint">Please wait</div>
             </div>
          )}

          {step === "review" && (
            <div className="review-section">
              <div className="stats-bar">
                <div className="stat">
                  <span className="num">{items.length}</span>
                  <span className="lbl">Found</span>
                </div>
                <div className="stat primary">
                  <span className="num">{items.filter(i => i.selected).length}</span>
                  <span className="lbl">Selected</span>
                </div>
                <div className="stat warn">
                  <span className="num">{items.filter(i => i.isDupe).length}</span>
                  <span className="lbl">Duplicates</span>
                </div>
              </div>

              <div className="items-list">
                {items.map((it, idx) => (
                  <div key={idx} className={`item ${it.selected ? 'selected' : ''}`}>
                    <div className="item-top">
                      <input 
                        type="checkbox" 
                        checked={it.selected} 
                        onChange={e => { 
                          const c = [...items]; 
                          c[idx].selected = e.target.checked; 
                          setItems(c); 
                        }} 
                        className="chk"
                      />
                      {it.isDupe && <span className="badge">⚠️ Duplicate</span>}
                    </div>
                    <div className="item-fields">
                      <div className="field full">
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
                      <div className="field-row">
                        <div className="field">
                          <label>Price</label>
                          <div className="price-wrap">
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
                        <div className="field">
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="footer">
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
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 16px;
          animation: fadeIn 0.2s;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .modal {
          background: white;
          width: 100%;
          max-width: 520px;
          max-height: 85vh;
          border-radius: 10px;
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          animation: slideUp 0.2s ease-out;
        }

        .header {
          padding: 12px 14px;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .icon-badge {
          width: 28px;
          height: 28px;
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }

        .title {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          color: #111;
        }

        .close-btn {
          width: 28px;
          height: 28px;
          border: none;
          background: #f3f4f6;
          border-radius: 6px;
          font-size: 18px;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: #e5e7eb;
          color: #111;
        }

        .content {
          flex: 1;
          overflow-y: auto;
          padding: 14px;
        }

        .content::-webkit-scrollbar {
          width: 4px;
        }

        .content::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 10px;
        }

        .error-box {
          background: #fef2f2;
          color: #dc2626;
          padding: 10px 12px;
          border-radius: 6px;
          margin-bottom: 12px;
          font-size: 13px;
          border: 1px solid #fecaca;
        }

        /* Upload */
        .upload-section {
          padding: 4px 0;
        }

        .upload-dropzone {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px 16px;
          border: 2px dashed #d1d5db;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          background: #fafafa;
          position: relative;
        }

        .upload-dropzone:hover {
          border-color: #8b5cf6;
          background: #faf5ff;
        }

        .file-input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }

        .upload-icon {
          font-size: 36px;
          margin-bottom: 8px;
        }

        .upload-text {
          font-size: 13px;
          color: #374151;
          margin-bottom: 2px;
        }

        .highlight {
          color: #8b5cf6;
          font-weight: 600;
        }

        .upload-hint {
          font-size: 11px;
          color: #9ca3af;
        }

        .preview-container {
          position: relative;
          border-radius: 8px;
          overflow: hidden;
        }

        .preview-image {
          width: 100%;
          max-height: 280px;
          object-fit: contain;
          display: block;
          background: #f9fafb;
        }

        .change-btn {
          margin-top: 10px;
          width: 100%;
          padding: 10px;
          background: white;
          border: 1.5px solid #e5e7eb;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
        }

        .change-btn:hover {
          background: #f9fafb;
          border-color: #8b5cf6  ;
          color: #8b5cf6;
        }

        /* Processing */
        .processing-section {
          text-align: center;
          padding: 50px 20px;
        }

        .loading-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.9;
        }

        .processing-text {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 4px;
        }

        .processing-hint {
          font-size: 12px;
          color: #9ca3af;
        }

        /* Review */
        .review-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .stats-bar {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          padding: 10px;
          background: #f9fafb;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }

        .stat {
          text-align: center;
          padding: 6px;
        }

        .num {
          display: block;
          font-size: 22px;
          font-weight: 700;
          color: #111;
          margin-bottom: 2px;
        }

        .stat.primary .num {
          color: #8b5cf6;
        }

        .stat.warn .num {
          color: #f59e0b;
        }

        .lbl {
          font-size: 11px;
          color: #6b7280;
          font-weight: 500;
        }

        .items-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 380px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .items-list::-webkit-scrollbar {
          width: 4px;
        }

        .items-list::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 10px;
        }

        .item {
          border: 1.5px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
          background: white;
          transition: all 0.2s;
        }

        .item.selected {
          border-color: #8b5cf6;
          background: #faf5ff;
        }

        .item-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .chk {
          width: 18px;
          height: 18px;
          accent-color: #8b5cf6;
          cursor: pointer;
        }

        .badge {
          font-size: 10px;
          padding: 3px 8px;
          background: #fef3c7;
          border: 1px solid #fcd34d;
          border-radius: 4px;
          color: #d97706;
          font-weight: 600;
        }

        .item-fields {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field {
          display: flex;
          flex-direction: column;
        }

        .field.full {
          grid-column: 1 / -1;
        }

        .field label {
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 4px;
        }

        .field input {
          padding: 8px 10px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 13px;
          background: #f9fafb;
          outline: none;
          transition: all 0.2s;
        }

        .field input:focus {
          border-color: #8b5cf6;
          background: white;
        }

        .field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .price-wrap {
          display: flex;
          align-items: center;
          padding: 8px 10px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: #f9fafb;
          transition: all 0.2s;
        }

        .price-wrap:focus-within {
          border-color: #8b5cf6;
          background: white;
        }

        .price-wrap span {
          font-size: 13px;
          font-weight: 600;
          color: #6b7280;
          margin-right: 4px;
        }

        .price-wrap input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 13px;
          font-weight: 600;
          outline: none;
          color: #111;
          padding: 0;
        }

        .footer {
          padding: 12px 16px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        @media (max-width: 640px) {
          .modal {
            max-width: 100%;
            max-height: 92vh;
          }
          .field-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
