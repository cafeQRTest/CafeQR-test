import React, { useState } from "react";
import styled from "styled-components";
import Button from "./ui/Button"; 

const Overlay = styled.div`
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
`;
const Modal = styled.div`
  background: white; width: 90%; max-width: 900px; max-height: 90vh;
  border-radius: 12px; display: flex; flex-direction: column; overflow: hidden;
`;
const Content = styled.div`
  flex: 1; overflow-y: auto; padding: 24px;
`;
const Header = styled.div`
  padding: 16px 24px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between;
  h3 { margin: 0; font-size: 1.2rem; }
`;
const Footer = styled.div`
  padding: 16px 24px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px;
`;
const PreviewImg = styled.img`
  max-width: 100%; height: 200px; object-fit: contain; background: #f0f0f0; border-radius: 8px;
`;
const Table = styled.table`
  width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;
  th { text-align: left; background: #f9f9f9; padding: 8px; }
  td { border-bottom: 1px solid #eee; padding: 8px; vertical-align: top; }
  input { width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px; }
`;

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
      setStatusMsg("");
    }
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={e => e.stopPropagation()}>
        <Header>
          <h3>Import Menu</h3>
          <button onClick={onClose} style={{border:'none',background:'none',fontSize:20,cursor:'pointer'}}>×</button>
        </Header>
        <Content>
          {error && <div style={{background:'#fee', color:'red', padding:10, borderRadius:4, marginBottom:10}}>{error}</div>}
          
          {step === "upload" && (
            <div style={{textAlign:'center', padding:40}}>
               {preview ? <PreviewImg src={preview} /> : <div style={{border:'2px dashed #ccc', padding:40, color:'#666'}}>Select Menu Photo</div>}
               <input type="file" accept="image/*" onChange={handleFile} style={{marginTop:20}} />
            </div>
          )}

          {step === "processing" && (
             <div style={{textAlign:'center', padding:50}}>
                <div style={{fontSize:24, marginBottom:10}}>🤖</div>
                <p>{statusMsg}</p>
             </div>
          )}

          {step === "review" && (
            <Table>
              <thead><tr><th width="30"></th><th>Name</th><th width="80">Price</th><th>Category</th></tr></thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} style={{opacity: it.selected ? 1 : 0.5}}>
                    <td><input type="checkbox" checked={it.selected} onChange={e => { const c = [...items]; c[idx].selected = e.target.checked; setItems(c); }} /></td>
                    <td>
                        <input value={it.name} onChange={e => { const c = [...items]; c[idx].name = e.target.value; setItems(c); }} />
                        {it.isDupe && <div style={{fontSize:11, color:'orange'}}>Duplicate</div>}
                    </td>
                    <td><input type="number" value={it.price} onChange={e => { const c = [...items]; c[idx].price = e.target.value; setItems(c); }} /></td>
                    <td><input value={it.category} onChange={e => { const c = [...items]; c[idx].category = e.target.value; setItems(c); }} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Content>
        <Footer>
          {step === "upload" && <Button onClick={processImage} disabled={!file}>Analyze</Button>}
          {step === "review" && <Button onClick={doImport}>Import ({items.filter(i=>i.selected).length})</Button>}
        </Footer>
      </Modal>
    </Overlay>
  );
}
