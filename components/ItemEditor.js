// components/ItemEditor.js

import { useState, useEffect, useMemo, useRef } from "react";
import NiceSelect from "./NiceSelect";

const STORAGE_KEY = 'itemEditorDraft';

export default function ItemEditor({
  supabase,
  open,
  onClose,
  item,
  restaurantId,
  onSaved,
  onError,
  enableMenuImages, // Check enabled state
}) {
  const isEdit = !!item?.id;
  const hasInitialized = useRef(false);

  const [cats, setCats] = useState([]);
  const [loadingCats, setLoadingCats] = useState(false);

  const [code, setCode] = useState(item?.code_number || "");
  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(
    item?.price !== undefined && item?.price !== null ? item.price : ""
  );
  const [category, setCategory] = useState(item?.category || "main");
  const [status, setStatus] = useState(item?.status || "available");
  const [veg, setVeg] = useState(item?.veg ?? true);
  const [isPopular, setIsPopular] = useState(!!item?.ispopular);
  const [hsn, setHsn] = useState(item?.hsn || "");
  const [taxRate, setTaxRate] = useState(item?.tax_rate ?? 0);
  const [isPackaged, setIsPackaged] = useState(!!item?.is_packaged_good);
  const [cessRate, setCessRate] = useState(item?.compensation_cess_rate ?? 0);
  const [imageUrl, setImageUrl] = useState(item?.image_url || "");
  const [imageFile, setImageFile] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Variant-related state
  const [hasVariants, setHasVariants] = useState(!!item?.has_variants);
  const [variantTemplates, setVariantTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [variantPrices, setVariantPrices] = useState([]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatErr, setNewCatErr] = useState("");

  // Variant template creation modal state
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [newVariantName, setNewVariantName] = useState("");
  const [newVariantOptions, setNewVariantOptions] = useState([""]);
  const [newVariantErr, setNewVariantErr] = useState("");

  useEffect(() => {
    if (!supabase || !open || !restaurantId) return;
    setLoadingCats(true);
    supabase
      .from("categories")
      .select("id,name,is_global,restaurant_id")
      .or(`is_global.eq.true,restaurant_id.eq.${restaurantId}`)
      .order("name")
      .then(({ data, error }) => {
        setLoadingCats(false);
        if (!error) setCats(data || []);
      });
  }, [open, restaurantId, supabase]);

  // Fetch variant templates
  useEffect(() => {
    if (!supabase || !open) return;
    const fetchTemplates = async () => {
      const { data } = await supabase
        .from('variant_templates')
        .select(`
          *,
          options:variant_options(*)
        `)
        .eq('is_active', true)
        .order('display_order');
      
      setVariantTemplates(data || []);
    };
    fetchTemplates();
  }, [open, supabase]);

  // Load existing variants if editing
  useEffect(() => {
    if (!supabase || !open || !item?.id || !item?.has_variants) return;
    
    const fetchVariants = async () => {
      // Get linked template
      const { data: link } = await supabase
        .from('menu_item_variants')
        .select('template_id')
        .eq('menu_item_id', item.id)
        .maybeSingle();
      
      if (link) {
        setSelectedTemplate(link.template_id);
        
        // Get pricing
        const { data: pricing } = await supabase
          .from('variant_pricing')
          .select('*')
          .eq('menu_item_id', item.id);
        
        setVariantPrices(pricing || []);
      }
    };
    fetchVariants();
  }, [open, item, supabase]);

  // Initialize form data when modal opens
  useEffect(() => {
    if (open && !hasInitialized.current) {
      // Try to restore from sessionStorage
      const saved = sessionStorage.getItem(STORAGE_KEY);
      let restored = false;

      if (saved) {
        try {
          const data = JSON.parse(saved);
          // Only restore if the saved draft matches the current item ID
          const currentId = item?.id || null;
          const savedId = data.id || null;

          if (currentId === savedId) {
            setCode(data.code || "");
            setName(data.name || "");
            setPrice(data.price !== undefined ? data.price : "");
            setCategory(data.category || "main");
            setStatus(data.status || "available");
            setVeg(data.veg ?? true);
            setIsPopular(!!data.isPopular);
            setHsn(data.hsn || "");
            setTaxRate(data.taxRate ?? 0);
            setIsPackaged(!!data.isPackaged);
            setCessRate(data.cessRate ?? 0);
            setImageUrl(data.imageUrl || "");
            setHasVariants(!!data.hasVariants);
            restored = true;
          }
        } catch (e) {
          console.error('Failed to restore form data:', e);
        }
      } 
      
      if (!restored) {
        // No saved data or ID mismatch - initialize from item prop
        setCode(item?.code_number || "");
        setName(item?.name || "");
        setPrice(item?.price !== undefined && item?.price !== null ? item.price : "");
        setCategory(item?.category || "main");
        setStatus(item?.status || "available");
        setVeg(item?.veg ?? true);
        setIsPopular(!!item?.ispopular);
        setHsn(item?.hsn || "");
        setTaxRate(item?.tax_rate ?? 0);
        setIsPackaged(!!item?.is_packaged_good);
        setCessRate(item?.compensation_cess_rate ?? 0);
        setImageUrl(item?.image_url || "");
        setHasVariants(!!item?.has_variants);
        setSelectedTemplate(null);
        setVariantPrices([]);
        setImageFile(null);
      }
      setErr("");
      hasInitialized.current = true;
    } else if (!open) {
      hasInitialized.current = false;
    }
  }, [open, item]);

  // Save form data to sessionStorage whenever it changes
  useEffect(() => {
    if (open && hasInitialized.current) {
      const formData = {
        id: item?.id || null,
        code, name, price, category, status, veg, isPopular,
        hsn, taxRate, isPackaged, cessRate, imageUrl, hasVariants
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    }
  }, [open, item, code, name, price, category, status, veg, isPopular, hsn, taxRate, isPackaged, cessRate, imageUrl, hasVariants]);

  const clearDraft = () => {
    sessionStorage.removeItem(STORAGE_KEY);
  };

  // Ultra-compressed COLORFUL images (MINIMUM size!)
  const compressImage = async (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // VERY SMALL size for minimum storage (250px max)
        const MAX_SIZE = 250;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Good quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);
        
        // Try WebP first (better compression), fallback to JPEG
        let base64;
        try {
          // WebP at 45% quality = MAXIMUM compression, still looks good
          base64 = canvas.toDataURL('image/webp', 0.45);
          if (!base64.startsWith('data:image/webp')) {
            throw new Error('WebP not supported');
          }
        } catch (e) {
          // Fallback to JPEG at 50% quality
          base64 = canvas.toDataURL('image/jpeg', 0.5);
        }
        
        URL.revokeObjectURL(objectUrl);
        
        resolve(base64);
      };
      
      img.onerror = (e) => {
        URL.revokeObjectURL(objectUrl);
        reject(e);
      };
      
      img.src = objectUrl;
    });
  };

  // Removed uploadImage as we are now using Base64 strings directly in the DB


  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { 
        setErr("Image size should be less than 10MB");
        return;
      }
      
      setUploadingImage(true);
      try {
        // Compress and Convert to Base64
        const base64 = await compressImage(file);
        setImageUrl(base64);
        setImageFile(null);
      } catch (err) {
        console.error(err);
        setErr("Failed to process image");
      } finally {
        setUploadingImage(false);
        e.target.value = '';
      }
    }
  };

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (price === "" || Number.isNaN(Number(price))) return false;
    if (price !== "" && Number(price) === 0) return false; // block zero only
    if (taxRate < 0 || cessRate < 0) return false;
    // code is optional, so we don't require it
    return true;
  }, [name, price, taxRate, cessRate]);
  if (!open) return null;

  const saveVariants = async (menuItemId) => {
    if (!hasVariants || !selectedTemplate) {
      // If variants are disabled, clear any existing variant data
      if (item?.id) {
        await supabase.from('menu_item_variants').delete().eq('menu_item_id', item.id);
        await supabase.from('variant_pricing').delete().eq('menu_item_id', item.id);
      }
      return;
    }
    
    // Link menu item to template
    await supabase
      .from('menu_item_variants')
      .upsert({
        menu_item_id: menuItemId,
        template_id: selectedTemplate,
        is_required: true
      }, {
        onConflict: 'menu_item_id'
      });
    
    // Save pricing for each option
    const template = variantTemplates.find(t => t.id === selectedTemplate);
    if (!template?.options) return;
    
    const pricingData = template.options.map(option => {
      const existing = variantPrices.find(vp => vp.option_id === option.id);
      return {
        menu_item_id: menuItemId,
        option_id: option.id,
        price: existing?.price || price, // Use variant price or base price
        is_available: existing?.is_available ?? true
      };
    });
    
    // Delete old pricing and insert new
    await supabase.from('variant_pricing').delete().eq('menu_item_id', menuItemId);
    await supabase.from('variant_pricing').insert(pricingData);
  };

  const save = async (e) => {
    e.preventDefault();
    
    if (!supabase || !canSubmit) {
      const msg = "Please fill in all required details: name and a valid price greater than 0.";
      setErr(msg);
      onError?.(msg);
      return;
    }
    
    if (saving) {
      return; // Prevent double-click
    }
    
    setErr("");
    setSaving(true);

    try {
      // ensure category
      let catId = cats.find((c) => c.name === category)?.id;
      if (!catId) {
        const { data: newCat, error: catErr } = await supabase
          .from("categories")
          .insert([
            {
              name: category.trim(),
              is_global: false,
              restaurant_id: restaurantId,
            },
          ])
          .select("id,name")
          .single();
        if (catErr) throw catErr;
        catId = newCat.id;
        setCats((prev) => [...prev, newCat]);
      }

      const payload = {
        restaurant_id: restaurantId,
        code_number: code.trim() || null,
        name: name.trim(),
        price: Number(price),
        category: category.trim(),
        status,
        veg,
        ispopular: isPopular,
        hsn: hsn.trim() || null,
        tax_rate: Number(taxRate),
        is_packaged_good: isPackaged,
        compensation_cess_rate: Number(cessRate),
        image_url: imageUrl || null,
        has_variants: hasVariants,
      };

      let savedItemId;
      if (isEdit) {
        const { error: updErr } = await supabase
          .from("menu_items")
          .update(payload)
          .eq("id", item.id)
          .eq("restaurant_id", restaurantId);
        if (updErr) throw updErr;
        savedItemId = item.id;
        onSaved({ ...item, ...payload });
      } else {
        const { data, error: insertErr } = await supabase
          .from("menu_items")
          .insert([payload])
          .select("*")
          .single();
        if (insertErr) throw insertErr;
        savedItemId = data.id;
        onSaved(data);
      }

      // Save variants
      if (savedItemId) {
        await saveVariants(savedItemId);
      }

      if (!isEdit && savedItemId) {
        await supabase.rpc("upsert_library_item", {
          _name: name.trim(),
          _price: Number(price),
          _veg: veg,
          _desc: null,
          _img_url: imageUrl || null,
          _cat_id: catId,
        });
      }

      clearDraft();
      
      // Small delay to ensure parent state updates
      setTimeout(() => {
        onClose();
      }, 100);
    } catch (ex) {
      const errorMsg = ex.message || "Failed to save";
      setErr(errorMsg);
      onError?.(errorMsg);
      alert(`Error saving item: ${errorMsg}`); // Show alert for visibility
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    clearDraft();
    onClose();
  };

  return (
    <div className="ie-overlay">
      <form onSubmit={save} className="ie-modal">
        <h3 className="ie-title">{isEdit ? "Edit Item" : "Add Item"}</h3>
        {err && <div className="ie-error">{err}</div>}

        <label>
          <div className="ie-label">
            Code
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="ie-input"
            placeholder="Enter product code"
          />
        </label>

        <label>
          <div className="ie-label">
            Name <span style={{ color: "red" }}>*</span>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="ie-input"
            placeholder="Enter product name"
          />
        </label>

        {/* Small Image Upload Section */}
        {enableMenuImages && (
          <div style={{ marginTop: 14 }}>
            <div className="ie-label">Image</div>
            <div className="ie-image-upload">
              {uploadingImage ? (
                <div className="ie-upload-placeholder">
                  <div className="spinner" style={{ 
                    border: '3px solid #f3f3f3', 
                    borderTop: '3px solid #652ae2', 
                    borderRadius: '50%', 
                    width: 24, 
                    height: 24, 
                    animation: 'spin 1s linear infinite',
                    marginBottom: 8 
                  }} />
                  <span style={{ fontSize: 13, color: '#652ae2', fontWeight: 500 }}>Uploading...</span>
                  <style>{`
                    @keyframes spin {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                  `}</style>
                </div>
              ) : imageUrl ? (
                <div className="ie-image-preview-wrapper">
                  <img src={imageUrl} alt="Preview" className="ie-image-preview" style={{ maxHeight: 120 }} />
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl("");
                      setImageFile(null);
                    }}
                    style={{}}
                    className="ie-remove-image-btn"
                    title="Remove image"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="ie-upload-label">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                  />
                  <span style={{ fontSize: 24 }}>📷</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#4b5563' }}>Upload Image</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Max 10MB</div>
                  </div>
                </label>
              )}
            </div>
          </div>
        )}

        <div className="ie-row-2">
          <label>
            <div className="ie-label">
              Price <span style={{ color: "red" }}>*</span>
            </div>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
             // min="0.01"
              className="ie-input"
              placeholder="Enter price"
            />
          </label>
          <label>
            <div className="ie-label">Category</div>
            <div style={{ display: "flex", gap: 4 }}>
              <NiceSelect
                value={category}
                onChange={setCategory}
                placeholder="Select category"
                options={[
                  // ensure default category appears first
                  ...(cats.find((c) => c.name === "main")
                    ? [{ value: "main", label: "main" }]
                    : []),
                  ...cats
                    .filter((c) => c.name !== "main")
                    .map((c) => ({ value: c.name, label: c.name })),
                ]}
              />
              <button
                type="button"
                onClick={() => {
                  setNewCatName("");
                  setNewCatErr("");
                  setShowCatModal(true);
                }}
                className="ie-btn-small"
              >
                +
              </button>
            </div>
          </label>
        </div>

        <div className="ie-row-2">
          <label>
            <div className="ie-label">HSN</div>
            <input
              value={hsn}
              onChange={(e) => setHsn(e.target.value)}
              className="ie-input"
              placeholder="Enter HSN code"
            />
          </label>
          <label>
            <div className="ie-label">Status</div>
            <NiceSelect
              value={status}
              onChange={setStatus}
              options={[
                { value: "available", label: "Available" },
                { value: "out_of_stock", label: "Out of stock" },
              ]}
            />
          </label>
        </div>

        {/* <hr /> */}
        <div className="ie-checkbox-wrapper">
        <label className="ie-checkbox-group">
          <input
            type="checkbox"
            checked={veg}
            onChange={(e) => setVeg(e.target.checked)}
          />
          <span>Veg</span>
        </label>
        <label className="ie-checkbox-group">
          <input
            type="checkbox"
            checked={isPackaged}
            onChange={(e) => setIsPackaged(e.target.checked)}
          />
          <span style={{whiteSpace:"nowrap"}}>Packaged goods</span>
        </label>
        <label className="ie-checkbox-group">
          <input
            type="checkbox"
            checked={isPopular}
            onChange={(e) => setIsPopular(e.target.checked)}
          />
          <span style={{whiteSpace:"nowrap"}}>Offers</span>
        </label>
        </div>
        {isPackaged && (
          <div className="ie-row-2">
            <label>
              <div className="ie-label">Tax %</div>
              <input
                type="number"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="ie-input"
                placeholder="Enter tax %"
              />
            </label>
            <label>
              <div className="ie-label">Cess %</div>
              <input
                type="number"
                step="0.01"
                value={cessRate}
                onChange={(e) => setCessRate(e.target.value)}
                className="ie-input"
                placeholder="Enter cess %"
              />
            </label>
          </div>
        )}

        {/* Variants Section */}
        <div className="ie-section-variants">
          <div className="ie-checkbox-label">
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(e) => {
                setHasVariants(e.target.checked);
                if (!e.target.checked) {
                  setSelectedTemplate(null);
                  setVariantPrices([]);
                }
              }}
            />
            <span>Is variant</span>
          </div>

          {hasVariants && (
            <div className="ie-variant-card">
              <div style={{ marginBottom: 16 }}>
                <div className="ie-label" style={{ marginBottom: 8 }}>
                  Variant Type
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <NiceSelect
                    value={selectedTemplate || ''}
                    onChange={setSelectedTemplate}
                    placeholder="Select variant type..."
                    options={variantTemplates.map(template => ({
                      value: template.id,
                      label: `${template.name} (${template.options?.length} options)`
                    }))}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setNewVariantName("");
                      setNewVariantOptions([""]);
                      setNewVariantErr("");
                      setShowVariantModal(true);
                    }}
                    className="ie-btn-small-add"
                    title="Create new variant template"
                  >
                    +
                  </button>
                </div>
              </div>

              {selectedTemplate && (
                <div style={{ marginTop: 18 }}>
                  <div className="ie-label" style={{ marginBottom: 14 }}>
                    Pricing for Each Variant
                  </div>
                  <div className="ie-variant-list">
                    {variantTemplates
                      .find(t => t.id === selectedTemplate)
                      ?.options.map((option, idx) => {
                        const variantPrice = variantPrices.find(vp => vp.option_id === option.id);
                        return (
                          <div key={option.id} className="ie-variant-row">
                            <span className="ie-variant-name">
                              {option.name}
                            </span>
                            <div className="ie-price-input-wrapper">
                              <span className="prefix">₹</span>
                              <input
                                type="number"
                                placeholder="0.00"
                                step="0.01"
                                value={variantPrice?.price || ''}
                                onChange={(e) => {
                                  const newPrices = variantPrices.filter(vp => vp.option_id !== option.id);
                                  newPrices.push({
                                    option_id: option.id,
                                    price: parseFloat(e.target.value) || 0,
                                    is_available: variantPrice?.is_available ?? true
                                  });
                                  setVariantPrices(newPrices);
                                }}
                                className="ie-price-input"
                              />
                            </div>
                            <label className="ie-avail-label">
                              <input
                                type="checkbox"
                                checked={variantPrice?.is_available ?? true}
                                onChange={(e) => {
                                  const newPrices = variantPrices.filter(vp => vp.option_id !== option.id);
                                  newPrices.push({
                                    option_id: option.id,
                                    price: variantPrice?.price || 0,
                                    is_available: e.target.checked
                                  });
                                  setVariantPrices(newPrices);
                                }}
                                style={{ width: 17, height: 17, accentColor: '#f97316', cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: 12 }}>Enabled</span>
                            </label>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>


        <div className="ie-actions">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="ie-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="ie-btn-primary"
            style={{
              opacity: (!canSubmit || saving) ? 0.6 : 1,
              cursor: (!canSubmit || saving) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? "Saving…" : isEdit ? "Save" : "Add"}
          </button>
        </div>
      </form>

      {showCatModal && (
        <div className="ie-overlay-inner">
          <div className="ie-modal-inner">
            <h4 style={{ margin: 0, marginBottom: 8 }}>Add Category</h4>
            {newCatErr && <div className="ie-error">{newCatErr}</div>}
            <div style={{ marginBottom: 12 }}>
              <div className="ie-label">
                Category name <span style={{ color: "red" }}>*</span>
              </div>
              <input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="ie-input"
                placeholder="Enter category name"
              />
            </div>
            <div className="ie-actions">
              <button
                type="button"
                onClick={() => {
                  setShowCatModal(false);
                  setNewCatErr("");
                }}
                className="ie-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                className="ie-btn-primary"
                onClick={async () => {
                  const nm = newCatName.trim();
                  if (!nm) {
                    setNewCatErr("Please enter a category name.");
                    return;
                  }
                  try {
                    if (!supabase) throw new Error("Client not ready");
                    const { data, error } = await supabase
                      .from("categories")
                      .insert([
                        {
                          name: nm,
                          is_global: false,
                          restaurant_id: restaurantId,
                        },
                      ])
                      .select("id,name")
                      .single();
                    if (error) throw error;
                    setCats((prev) => [...prev, data]);
                    setCategory(data.name);
                    setShowCatModal(false);
                    setNewCatErr("");
                  } catch (ex) {
                    setNewCatErr(ex.message || "Failed to add category");
                  }
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showVariantModal && (
        <div className="ie-overlay-inner">
          <div className="ie-modal-inner" style={{ maxWidth: 480 }}>
            <h4 style={{ margin: 0, marginBottom: 8 }}>Create Variant Template</h4>
            {newVariantErr && <div className="ie-error">{newVariantErr}</div>}
            
            <div style={{ marginBottom: 14 }}>
              <div className="ie-label">
                Template Name <span style={{ color: "red" }}>*</span>
              </div>
              <input
                value={newVariantName}
                onChange={(e) => setNewVariantName(e.target.value)}
                className="ie-input"
                placeholder="e.g., Size, Temperature, etc."
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div className="ie-label" style={{ marginBottom: 8 }}>
                Variant Options <span style={{ color: "red" }}>*</span>
              </div>
              {newVariantOptions.map((option, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    value={option}
                    onChange={(e) => {
                      const updated = [...newVariantOptions];
                      updated[idx] = e.target.value;
                      setNewVariantOptions(updated);
                    }}
                    className="ie-input" style={{ flex: 1 }}
                    placeholder={`Option ${idx + 1} (e.g., Small, Medium, Large)`}
                  />
                  {newVariantOptions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewVariantOptions(newVariantOptions.filter((_, i) => i !== idx));
                      }}
                      style={{
                        padding: '8px 12px',
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setNewVariantOptions([...newVariantOptions, ""])}
                style={{
                  padding: '8px 14px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  marginTop: 4
                }}
              >
                + Add Option
              </button>
            </div>

            <div className="ie-actions">
              <button
                type="button"
                onClick={() => {
                  setShowVariantModal(false);
                  setNewVariantErr("");
                }}
                className="ie-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                className="ie-btn-primary"
                onClick={async () => {
                  const name = newVariantName.trim();
                  const options = newVariantOptions.filter(o => o.trim());
                  
                  if (!name) {
                    setNewVariantErr("Please enter a template name.");
                    return;
                  }
                  if (options.length < 2) {
                    setNewVariantErr("Please add at least 2 variant options.");
                    return;
                  }
                  
                  try {
                    if (!supabase) throw new Error("Client not ready");
                    
                    // Insert template
                    const { data: template, error: templateErr } = await supabase
                      .from("variant_templates")
                      .insert([{
                        name: name,
                        is_active: true,
                        display_order: 999
                      }])
                      .select("id,name")
                      .single();
                    
                    if (templateErr) throw templateErr;
                    
                    // Insert options
                    const optionsData = options.map((opt, idx) => ({
                      template_id: template.id,
                      name: opt.trim(),
                      display_order: idx
                    }));
                    
                    const { data: createdOptions, error: optionsErr } = await supabase
                      .from("variant_options")
                      .insert(optionsData)
                      .select("*");
                    
                    if (optionsErr) throw optionsErr;
                    
                    // Add to templates list
                    const newTemplate = {
                      ...template,
                      options: createdOptions
                    };
                    setVariantTemplates((prev) => [...prev, newTemplate]);
                    setSelectedTemplate(template.id);
                    setShowVariantModal(false);
                    setNewVariantErr("");
                  } catch (ex) {
                    setNewVariantErr(ex.message || "Failed to create template");
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .ie-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: flex-start; justify-content: center; padding: 24px; z-index: 1000; overflow-y: auto; backdrop-filter: blur(2px); }
        .ie-modal { 
          background: #ffffff; padding: 24px; border-radius: 16px; 
          width: 100%; max-width: 550px; 
          box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25); border: 1px solid #e5e7eb; margin: auto; 
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          max-height: 85vh; overflow-y: auto;
          scrollbar-width: thin; scrollbar-color: #d1d5db transparent;
        }
        .ie-modal::-webkit-scrollbar { width: 6px; }
        .ie-modal::-webkit-scrollbar-track { background: transparent; }
        .ie-modal::-webkit-scrollbar-thumb { background-color: #d1d5db; border-radius: 20px; }
        .ie-modal::-webkit-scrollbar-thumb:hover { background-color: #9ca3af; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .ie-title { margin: 0 0 20px 0; font-size: 1.25rem; font-weight: 700; color: #111827; }
        .ie-row-2 { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 16px; }
        @media (min-width: 640px) { .ie-row-2 { grid-template-columns: 1fr 1fr; } }
        .ie-input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.875rem; outline: none; background: #f9fafb; transition: all 0.2s; }
        .ie-input:focus { border-color: #f97316; background: white; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1); }
        .ie-label { font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 6px; display: block; }
        .ie-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; padding-top: 20px; border-top: 1px solid #f3f4f6; }
        .ie-btn-primary { padding: 10px 20px; background: #f97316; color: white; border: none; border-radius: 99px; font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.2); }
        .ie-btn-secondary { padding: 10px 20px; background: white; color: #4b5563; border: 1px solid #d1d5db; border-radius: 99px; font-weight: 500; font-size: 0.875rem; cursor: pointer; transition: all 0.2s; }
        .ie-btn-small { padding: 6px 12px; background: #f97316; color: white; border: none; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; }
        .ie-checkbox-wrapper { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
        .ie-checkbox-group { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; cursor: pointer; flex: 1; min-width: 120px; }
        .ie-checkbox-group input { width: 16px; height: 16px; accent-color: #f97316; }
        .ie-error { background: #fef2f2; color: #b91c1c; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 0.875rem; border: 1px solid #fecaca; }
        
        /* Inner Modal */
        .ie-overlay-inner { position: fixed; inset: 0; background: rgba(0,0,0,0.2); z-index: 1100; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(1px); }
        .ie-modal-inner { background: white; padding: 20px; border-radius: 12px; width: 90%; max-width: 360px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }
        
        /* Image Upload */
        .ie-image-upload { border: 2px dashed #d1d5db; border-radius: 8px; padding: 4px; display: flex; justify-content: center; align-items: center; min-height: 80px; background-color: #f9fafb; margin-top: 4px; }
        .ie-upload-placeholder { display: flex; flex-direction: column; align-items: center; color: #6b7280; }
        .ie-image-preview-wrapper { position: relative; width: 100%; text-align: center; }
        .ie-image-preview { max-width: 100%; max-height: 200px; border-radius: 6px; object-fit: contain; }
        .ie-remove-image-btn { position: absolute; top: -10px; right: -10px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .ie-upload-label { display: flex; flex-direction: row; align-items: center; cursor: pointer; width: 100%; padding: 10px; gap: 12px; justify-content: center; }

        /* Variants Section */
        .ie-section-variants { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
        .ie-checkbox-label { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 0.95rem; color: #111827; cursor: pointer; }
        .ie-checkbox-label input { width: 18px; height: 18px; accent-color: #f97316; }
        .ie-variant-card { background: linear-gradient(to bottom, #f9fafb, #ffffff); padding: 18px; border-radius: 12px; margin-top: 14px; border: 1.5px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .ie-btn-small-add { width: 40px; height: 38px; border-radius: 6px; border: none; background: #f97316; color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .ie-btn-small-add:hover { background: #ea580c; }
        .ie-variant-list { display: flex; flex-direction: column; gap: 10px; }
        .ie-variant-row { display: flex; gap: 12px; align-items: center; padding: 12px 14px; background: #ffffff; border-radius: 10px; border: 1px solid #e5e7eb; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
        .ie-variant-row:hover { border-color: #d1d5db; box-shadow: 0 2px 4px rgba(0,0,0,0.08); }
        .ie-variant-name { flex: 1; font-weight: 500; font-size: 14px; color: #111827; }
        .ie-price-input-wrapper { display: flex; align-items: center; gap: 8px; background: #f9fafb; padding: 6px 10px; border-radius: 8px; border: 1px solid #e5e7eb; transition: all 0.2s; }
        .ie-price-input-wrapper:focus-within { border-color: #652ae2; background: white; }
        .ie-price-input-wrapper .prefix { font-size: 15px; color: #6b7280; font-weight: 600; }
        .ie-price-input { width: 90px; padding: 6px 8px; border-radius: 6px; border: none; font-size: 14px; font-weight: 600; outline: none; background: transparent; color: #111827; }
        .ie-avail-label { display: flex; align-items: center; gap: 7px; font-size: 13px; color: #4b5563; cursor: pointer; user-select: none; font-weight: 500; padding: 4px 8px; border-radius: 6px; transition: background 0.15s ease; }
        .ie-avail-label:hover { background: #f3f4f6; }
      `}</style>
    </div>
  );
}
