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
    <div style={overlay}>
      <form onSubmit={save} style={modal}>
        <h3>{isEdit ? "Edit Item" : "Add Item"}</h3>
        {err && <div style={errorStyle}>{err}</div>}

        <label>
          <div style={customLabel}>
            Code
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={input}
            placeholder="Enter product code"
          />
        </label>

        <label>
          <div style={customLabel}>
            Name <span style={{ color: "red" }}>*</span>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={input}
            placeholder="Enter product name"
          />
        </label>

        {/* Small Image Upload Section */}
        {enableMenuImages && (
          <div style={{ marginTop: 14 }}>
            <div style={customLabel}>Image</div>
            <div style={imageUploadContainer}>
              {uploadingImage ? (
                <div style={uploadPlaceholder}>
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
                <div style={imagePreviewWrapper}>
                  <img src={imageUrl} alt="Preview" style={{ ...imagePreview, maxHeight: 120 }} />
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl("");
                      setImageFile(null);
                    }}
                    style={removeImageBtn}
                    title="Remove image"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label style={uploadLabel}>
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

        <div style={row2}>
          <label>
            <div style={customLabel}>
              Price <span style={{ color: "red" }}>*</span>
            </div>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
             // min="0.01"
              style={input}
              placeholder="Enter price"
            />
          </label>
          <label>
            <div style={customLabel}>Category</div>
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
                style={smallBtn}
              >
                +
              </button>
            </div>
          </label>
        </div>

        <div style={row2}>
          <label>
            <div style={customLabel}>HSN</div>
            <input
              value={hsn}
              onChange={(e) => setHsn(e.target.value)}
              style={input}
              placeholder="Enter HSN code"
            />
          </label>
          <label>
            <div style={customLabel}>Status</div>
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
        <div style={{display: "flex", gap: 12}}>
        <div style={checkboxLabel}>
          <input
            type="checkbox"
            checked={veg}
            onChange={(e) => setVeg(e.target.checked)}
          />
          <span>
          Veg
          </span>
        </div>
        <div style={checkboxLabel}>
          <input
            type="checkbox"
            checked={isPackaged}
            onChange={(e) => setIsPackaged(e.target.checked)}
          />
          <span style={{whiteSpace:"nowrap"}}>
          Packaged goods
          </span>
        </div>
        <div style={checkboxLabel}>
          <input
            type="checkbox"
            checked={isPopular}
            onChange={(e) => setIsPopular(e.target.checked)}
          />
          <span style={{whiteSpace:"nowrap"}}>
          Offers
          </span>
        </div>
        </div>
        {isPackaged && (
          <div style={row2}>
            <label>
              <div style={customLabel}>Tax %</div>
              <input
                type="number"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                style={input}
                placeholder="Enter tax %"
              />
            </label>
            <label>
              <div style={customLabel}>Cess %</div>
              <input
                type="number"
                step="0.01"
                value={cessRate}
                onChange={(e) => setCessRate(e.target.value)}
                style={input}
                placeholder="Enter cess %"
              />
            </label>
          </div>
        )}

        {/* Variants Section */}
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
          <div style={checkboxLabel}>
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
            <span>
              Is variant
            </span>
          </div>

        {hasVariants && (
            <div style={{ 
              background: 'linear-gradient(to bottom, #f9fafb, #ffffff)', 
              padding: 18, 
              borderRadius: 12, 
              marginTop: 14,
              border: '1.5px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  ...customLabel, 
                  marginBottom: 8
                }}>
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
                    style={{
                      ...smallBtn,
                      fontSize: 16,
                      width: 40
                    }}
                    title="Create new variant template"
                  >
                    +
                  </button>
                </div>
              </div>

              {selectedTemplate && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ 
                    ...customLabel,
                    marginBottom: 14
                  }}>
                    Pricing for Each Variant
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 10 
                  }}>
                    {variantTemplates
                      .find(t => t.id === selectedTemplate)
                      ?.options.map((option, idx) => {
                        const variantPrice = variantPrices.find(vp => vp.option_id === option.id);
                        return (
                          <div 
                            key={option.id} 
                            style={{ 
                              display: 'flex', 
                              gap: 12, 
                              alignItems: 'center',
                              padding: '12px 14px',
                              background: '#ffffff',
                              borderRadius: 10,
                              border: '1px solid #e5e7eb',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#d1d5db';
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.08)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '#e5e7eb';
                              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
                            }}
                          >
                            <span style={{ 
                              flex: 1, 
                              fontWeight: 500, 
                              fontSize: 14,
                              color: '#111827'
                            }}>
                              {option.name}
                            </span>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 8,
                              background: '#f9fafb',
                              padding: '6px 10px',
                              borderRadius: 8,
                              border: '1px solid #e5e7eb'
                            }}>
                              <span style={{ 
                                fontSize: 15, 
                                color: '#6b7280',
                                fontWeight: 600
                              }}>₹</span>
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
                                style={{ 
                                  width: 90, 
                                  padding: '6px 8px', 
                                  borderRadius: 6, 
                                  border: 'none',
                                  fontSize: 14,
                                  fontWeight: 600,
                                  outline: 'none',
                                  backgroundColor: 'transparent',
                                  color: '#111827'
                                }}
                                onFocus={(e) => {
                                  e.target.parentElement.style.borderColor = '#652ae2';
                                  e.target.parentElement.style.background = '#ffffff';
                                }}
                                onBlur={(e) => {
                                  e.target.parentElement.style.borderColor = '#e5e7eb';
                                  e.target.parentElement.style.background = '#f9fafb';
                                }}
                              />
                            </div>
                            <label style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 7,
                              fontSize: 13,
                              color: '#4b5563',
                              cursor: 'pointer',
                              userSelect: 'none',
                              fontWeight: 500,
                              padding: '4px 8px',
                              borderRadius: 6,
                              transition: 'background 0.15s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
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
                                style={{ 
                                  width: 17, 
                                  height: 17, 
                                  cursor: 'pointer',
                                  accentColor: '#f97316'
                                }}
                              />
                              <span>Available</span>
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


        <div style={actions}>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={secondaryBtn}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            style={{
              ...primaryBtn,
              opacity: (!canSubmit || saving) ? 0.6 : 1,
              cursor: (!canSubmit || saving) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? "Saving…" : isEdit ? "Save" : "Add"}
          </button>
        </div>
      </form>

      {showCatModal && (
        <div style={overlayInner}>
          <div style={modalInner}>
            <h4 style={{ margin: 0, marginBottom: 8 }}>Add Category</h4>
            {newCatErr && <div style={errorStyle}>{newCatErr}</div>}
            <div style={{ marginBottom: 12 }}>
              <div style={customLabel}>
                Category name <span style={{ color: "red" }}>*</span>
              </div>
              <input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                style={input}
                placeholder="Enter category name"
              />
            </div>
            <div style={actions}>
              <button
                type="button"
                onClick={() => {
                  setShowCatModal(false);
                  setNewCatErr("");
                }}
                style={secondaryBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                style={primaryBtn}
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
        <div style={overlayInner}>
          <div style={{...modalInner, maxWidth: 480}}>
            <h4 style={{ margin: 0, marginBottom: 8 }}>Create Variant Template</h4>
            {newVariantErr && <div style={errorStyle}>{newVariantErr}</div>}
            
            <div style={{ marginBottom: 14 }}>
              <div style={customLabel}>
                Template Name <span style={{ color: "red" }}>*</span>
              </div>
              <input
                value={newVariantName}
                onChange={(e) => setNewVariantName(e.target.value)}
                style={input}
                placeholder="e.g., Size, Temperature, etc."
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ ...customLabel, marginBottom: 8 }}>
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
                    style={{ ...input, flex: 1 }}
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

            <div style={actions}>
              <button
                type="button"
                onClick={() => {
                  setShowVariantModal(false);
                  setNewVariantErr("");
                }}
                style={secondaryBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                style={primaryBtn}
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
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: 24,
  zIndex: 1000,
  overflowY: "auto",
};

const overlayInner = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.12)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1100,
};
const modal = {
  background: "#ffffff",
  padding: 20,
  borderRadius: 14,
  width: "100%",
  maxWidth: 520,
  boxShadow:
    "0 18px 45px rgba(15, 23, 42, 0.35)",
  border: "1px solid #e5e7eb",
  maxHeight: "95vh",
  overflowY: "auto",
};

const modalInner = {
  background: "#ffffff",
  padding: 16,
  borderRadius: 12,
  width: "100%",
  maxWidth: 360,
  boxShadow:
    "0 16px 32px rgba(15, 23, 42, 0.25)",
  border: "1px solid #e5e7eb",
};
const input = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  height: "40px",
  fontSize: 14,
  outline: "none",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  boxShadow: "0 0 0 1px transparent",
  backgroundColor: "#f9fafb",
};

const row2 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 14,
};
const checkboxLabel = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginTop: 12,
};
const actions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 20,
};
const smallBtn = {
  padding: "0 10px",
  background: "#f97316",
  color: "#fff",
  border: "none",
  borderRadius: 999,
  cursor: "pointer",
  height: "40px",
  fontSize: 13,
  fontWeight: 500,
};
const primaryBtn = {
  padding: "10px 18px",
  background: "#f97316",
  color: "#fff",
  border: "none",
  borderRadius: 999,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
  boxShadow: "0 8px 18px rgba(249, 115, 22, 0.35)",
};
const secondaryBtn = {
  padding: "10px 18px",
  background: "#ffffff",
  color: "#4b5563",
  border: "1px solid #e5e7eb",
  borderRadius: 999,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 14,
};
const errorStyle = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: 10,
  borderRadius: 10,
  marginBottom: 14,
  fontSize: 13,
  border: "1px solid #fecaca",
};
const customLabel = {
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "#4b5563",
};

const imageUploadContainer = {
  border: "2px dashed #d1d5db",
  borderRadius: 8,
  padding: 4,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: 80, // Reduced from 120
  backgroundColor: "#f9fafb",
  marginTop: 4,
};

const uploadLabel = {
  display: "flex",
  flexDirection: "row", // Changed to row for compactness
  alignItems: "center",
  cursor: "pointer",
  width: "100%",
  padding: 10, // Reduced padding
  gap: 12, // Added gap
  justifyContent: "center",
};

const uploadPlaceholder = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  color: "#6b7280",
};

const imagePreviewWrapper = {
  position: "relative",
  width: "100%",
  textAlign: "center",
};

const imagePreview = {
  maxWidth: "100%",
  maxHeight: 200,
  borderRadius: 6,
  objectFit: "contain",
};

const removeImageBtn = {
  position: "absolute",
  top: -10,
  right: -10,
  background: "#ef4444",
  color: "white",
  border: "none",
  borderRadius: "50%",
  width: 24,
  height: 24,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 14,
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
};
