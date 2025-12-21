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

  // Upsells State (formerly Add-ons)
  const [upsellCandidates, setUpsellCandidates] = useState([]); // All other active menu items
  const [selectedUpsells, setSelectedUpsells] = useState(new Set()); // Set of item IDs

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatErr, setNewCatErr] = useState("");

  const findDuplicate = async (nm) => {
  const q = supabase
    .from("menu_items")
    .select("id,name")
    .eq("restaurant_id", restaurantId)
    .ilike("name", nm.trim()); // exact match if no %/_ [web:377]

  // If editing, ignore self
  if (isEdit) q.neq("id", item.id);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data; // null or {id,name}
};

  const checkDuplicateCode = async (c) => {
    if (!c || c.trim() === "") return null;
    const q = supabase
      .from("menu_items")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .eq("code_number", c.trim());

    // If editing, ignore self
    if (isEdit) q.neq("id", item.id);

    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data; 
  };

  // Variant template creation modal state
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [newVariantName, setNewVariantName] = useState("");
  const [newVariantOptions, setNewVariantOptions] = useState([""]);
  const [newVariantErr, setNewVariantErr] = useState("");

  // Upsell Picker Modal State
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [upsellSearch, setUpsellSearch] = useState("");
  const [tempSelectedUpsells, setTempSelectedUpsells] = useState(new Set());

  useEffect(() => {
// ... existing code ...

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

  // Load existing variants if editing
  useEffect(() => {
    if (!supabase || !open || !item?.id) return;
    
    const fetchVariants = async () => {
      // Get linked template
      const { data: link, error: linkError } = await supabase
        .from('menu_item_variants')
        .select('template_id')
        .eq('menu_item_id', item.id)
        .maybeSingle();
      
      if (linkError) console.error('Error fetching variant link:', linkError);

      if (link) {
        // We found a link, so this is definitely a variant item
        setHasVariants(true);
        setSelectedTemplate(link.template_id);
        
        // Get pricing
        const { data: pricing, error: pricingError } = await supabase
          .from('variant_pricing')
          .select('*')
          .eq('menu_item_id', item.id);
        
        if (pricingError) console.error('Error fetching variant pricing:', pricingError);
        
        setVariantPrices(pricing || []);
      }
    };
    fetchVariants();
  }, [open, item?.id, supabase]);

  // Fetch variant templates
  useEffect(() => {
    if (!supabase || !open) return;
    const fetchTemplates = async () => {
      // Fetch templates with their options, ensuring correct order
      const { data, error } = await supabase
        .from('variant_templates')
        .select(`
          id, name, display_order, description, is_active,
          options:variant_options (
            id, name, display_order, is_active
          )
        `)
        .eq('is_active', true)
        .order('display_order');
      
      if (error) {
        console.error('Error fetching templates:', error);
      } else {
        // Sort options client-side and filter inactive ones
        const sortedData = (data || []).map(t => ({
            ...t,
            options: (t.options || [])
              .filter(o => o.is_active !== false)
              .sort((a, b) => a.display_order - b.display_order)
        }));
        setVariantTemplates(sortedData);
      }
    };
    fetchTemplates();
  }, [open, supabase]);

  // Fetch Upsell Candidates (other menu items)
  useEffect(() => {
    if (!supabase || !open || !restaurantId) return;
    const fetchCandidates = async () => {
      let q = supabase
        .from('menu_items')
        .select('id, name, price, category')
        .eq('restaurant_id', restaurantId)
        .eq('status', 'available'); // Only available items as candidates? Or all? Let's say available.
      
      // If editing, exclude self
      if (item?.id) {
        q = q.neq('id', item.id);
      }

      const { data } = await q.order('category').order('name');
      if (data) setUpsellCandidates(data);
    };
    fetchCandidates();
  }, [open, supabase, restaurantId, item?.id]);

  // Load existing Upsell Links
  useEffect(() => {
    if (!supabase || !open || !item?.id) return;
    const fetchLinks = async () => {
       const { data } = await supabase
         .from('menu_item_upsells')
         .select('upsell_menu_item_id')
         .eq('parent_menu_item_id', item.id);
       if (data) {
         setSelectedUpsells(new Set(data.map(d => d.upsell_menu_item_id)));
       }
    };
    fetchLinks();
  }, [open, item?.id, supabase]);

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
            
            // Restore variant state
            setSelectedTemplate(data.selectedTemplate || null);
            setVariantPrices(data.variantPrices || []);
            
            // Restore addons/upsells
            if (data.selectedUpsells) {
               setSelectedUpsells(new Set(data.selectedUpsells));
            } else if (data.selectedAddons) {
                // migration from draft? Just ignore
            }

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
        setHasVariants(!!item?.has_variants);
        setSelectedTemplate(null);
        setVariantPrices([]);
        setSelectedUpsells(new Set());
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
        hsn, taxRate, isPackaged, cessRate, imageUrl, hasVariants,
        id: item?.id || null,
        code, name, price, category, status, veg, isPopular,
        hsn, taxRate, isPackaged, cessRate, imageUrl, hasVariants,
        id: item?.id || null,
        code, name, price, category, status, veg, isPopular,
        hsn, taxRate, isPackaged, cessRate, imageUrl, hasVariants,
        selectedTemplate, variantPrices, selectedUpsells: Array.from(selectedUpsells)
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    }
  }, [open, item, code, name, price, category, status, veg, isPopular, hsn, taxRate, isPackaged, cessRate, imageUrl, hasVariants, selectedTemplate, variantPrices, selectedUpsells]);

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
    if (hasVariants && !selectedTemplate) return false; // Require template if variants enabled
    return true;
  }, [name, price, taxRate, cessRate, hasVariants, selectedTemplate]);
  if (!open) return null;

  const saveVariants = async (menuItemId) => {
    // Always clean up existing variant links to ensure 1:1 relationship
    // This fixes issues where multiple templates could be accidentally linked
    await supabase.from('menu_item_variants').delete().eq('menu_item_id', menuItemId);

    if (!hasVariants || !selectedTemplate) {
      // If variants are disabled, also clear pricing (already done by above delete for link? no, pricing is separate table)
      await supabase.from('variant_pricing').delete().eq('menu_item_id', menuItemId);
      return;
    }
    
    // Link menu item to template
    const { error: linkErr } = await supabase
      .from('menu_item_variants')
      .insert({
        menu_item_id: menuItemId,
        template_id: selectedTemplate,
        is_required: true
      });
      
    if (linkErr) throw linkErr;
    
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

  const saveUpsells = async (menuItemId) => {
    // Current links
    const { data: existing } = await supabase.from('menu_item_upsells').select('upsell_menu_item_id').eq('parent_menu_item_id', menuItemId);
    const existingIds = new Set((existing || []).map(e => e.upsell_menu_item_id));

    const toAdd = [...selectedUpsells].filter(id => !existingIds.has(id));
    const toRemove = [...existingIds].filter(id => !selectedUpsells.has(id));

    if (toRemove.length > 0) {
      await supabase.from('menu_item_upsells').delete().eq('parent_menu_item_id', menuItemId).in('upsell_menu_item_id', toRemove);
    }
    if (toAdd.length > 0) {
      await supabase.from('menu_item_upsells').insert(toAdd.map(uid => ({
        parent_menu_item_id: menuItemId,
        upsell_menu_item_id: uid
      })));
    }
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

// Dedupe check
const dupe = await findDuplicate(name);
if (dupe?.id) {
  throw new Error(`Item "${name.trim()}" already exists in your menu.`);
}

if (code.trim()) {
  const dupeCode = await checkDuplicateCode(code);
  if (dupeCode?.id) {
     throw new Error(`Item code "${code.trim()}" is already used by item "${dupeCode.name}".`);
  }
}

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
        await saveUpsells(savedItemId);
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
      // alert(`Error saving item: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    clearDraft();
    onClose();
  };

  return (
    <div className="ie-overlay" onClick={handleClose}>
      <form 
        onSubmit={save} 
        className="ie-modal" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ie-header-area">
          <h3 className="ie-title">{isEdit ? "Edit Item" : "Add Item"}</h3>
        </div>
        <div className="ie-scroll-content">
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

        {/* Enhanced Image Upload Section */}
        {enableMenuImages && (
          <div style={{ marginTop: 20, marginBottom: 4 }}>
            <div className="ie-label" style={{ marginBottom: 10 }}>
              Menu Item Image
              <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
                (Optional)
              </span>
            </div>
            <div className="ie-image-upload-enhanced">
              {uploadingImage ? (
                <div className="ie-upload-loading">
                  <div className="ie-spinner" />
                  <span className="ie-loading-text">Processing image...</span>
                  <span className="ie-loading-subtext">Optimizing for best quality</span>
                </div>
              ) : imageUrl ? (
                <div className="ie-image-preview-container">
                  <div className="ie-image-preview-box">
                    <img src={imageUrl} alt="Menu item preview" className="ie-image-preview-img" />
                    <div className="ie-image-overlay">
                      <button
                        type="button"
                        onClick={() => {
                          setImageUrl("");
                          setImageFile(null);
                        }}
                        className="ie-image-remove-btn"
                        title="Remove image"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                        </svg>
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="ie-image-info">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span>Image uploaded successfully</span>
                  </div>
                </div>
              ) : (
                <label className="ie-upload-dropzone">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="ie-file-input"
                  />
                  <div className="ie-upload-icon-wrapper">
                    <svg className="ie-upload-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <div className="ie-upload-text-primary">
                    <span className="ie-upload-highlight">Click to upload</span> or drag and drop
                  </div>
                  <div className="ie-upload-text-secondary">
                    PNG, JPG, GIF up to 10MB
                  </div>
                  <div className="ie-upload-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Auto-compressed for optimal quality
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
          <span>Packaged Good</span>
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
                const checked = e.target.checked;
                setHasVariants(checked);
                if (checked && variantTemplates.length === 0) {
                   // Auto-open creation modal if no templates exist
                   setNewVariantName("");
                   setNewVariantOptions([""]);
                   setNewVariantErr("");
                   setShowVariantModal(true);
                }
                
                // Don't clear state immediately on uncheck, to allow re-checking to restore context
                if (!checked) {
                   // We keep the internal state so if they re-check it, it's still there.
                   // It will only be wiped from DB on Save.
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
                          <div key={option.id} className="ie-variant-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
                              <span className="ie-variant-name" style={{ flex: 1 }}>
                                {option.name}
                              </span>
                              <div className="ie-price-input-wrapper">
                                <span className="prefix">₹</span>
                                <input
                                  type="number"
                                  placeholder="0.00"
                                  step="0.01"
                                  min="0"
                                  value={variantPrice?.price ?? ''}
                                  onChange={(e) => {
                                    const valStr = e.target.value;
                                    if (valStr !== '' && parseFloat(valStr) < 0) return;

                                    const newPrices = variantPrices.filter(vp => vp.option_id !== option.id);
                                    newPrices.push({
                                      option_id: option.id,
                                      price: valStr === '' ? 0 : (parseFloat(valStr) || 0),
                                      is_available: variantPrice?.is_available ?? true
                                    });
                                    setVariantPrices(newPrices);
                                  }}
                                  className="ie-price-input"
                                />
                              </div>
                            </div>
                            <label className="ie-avail-label" style={{ marginLeft: 0 }}>
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

        {/* Upsells (Add-ons) Section Minimal Premium */}
        <div style={{ marginTop: 24 }}>
           <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
             <div className="ie-label" style={{ margin: 0, fontSize: 15, color: '#1f2937' }}>Recommended Add-ons</div>
             {selectedUpsells.size === 0 && (
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Optional</span>
             )}
           </div>
           
           {/* Selected List - Premium Dynamic Chips */}
           <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: selectedUpsells.size > 0 ? 12 : 0 }}>
             {[...selectedUpsells].map((id) => {
               const uItem = upsellCandidates.find(u => u.id === id);
               if (!uItem) return null;
               return (
                 <div key={id} style={{
                   display: 'inline-flex', alignItems: 'center', gap: 8,
                   padding: '8px 16px', 
                   background: 'white',
                   border: '1px solid #fdba74',
                   borderRadius: 99,
                   fontSize: 15,
                   color: '#334155',
                   transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                   cursor: 'default',
                   boxShadow: '0 1px 2px rgba(249, 115, 22, 0.05)'
                 }}
                 onMouseEnter={(e) => { 
                   e.currentTarget.style.background = '#fff7ed';
                   e.currentTarget.style.boxShadow = '0 4px 12px rgba(249, 115, 22, 0.15)'; 
                   e.currentTarget.style.transform = 'translateY(-1px)';
                 }}
                 onMouseLeave={(e) => { 
                   e.currentTarget.style.background = 'white';
                   e.currentTarget.style.boxShadow = '0 1px 2px rgba(249, 115, 22, 0.05)'; 
                   e.currentTarget.style.transform = 'none';
                 }}
                 >
                   <span style={{ fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em' }}>{uItem.name}</span>
                   <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>₹{uItem.price}</span>
                   <button 
                     type="button" 
                     onClick={() => {
                        setSelectedUpsells(prev => {
                          const next = new Set(prev);
                          next.delete(id);
                          return next;
                        });
                     }}
                     style={{ 
                       border: 'none', background: '#e2e8f0', color: '#64748b', 
                       cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                       width: 22, height: 22, borderRadius: '50%', padding: 0, marginLeft: 6,
                       transition: 'all 0.2s',
                       fontSize: 16, lineHeight: 0.5
                     }}
                     onMouseEnter={(e) => { e.currentTarget.style.background = '#cbd5e1'; e.currentTarget.style.color = '#1e293b'; }}
                     onMouseLeave={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}
                   >
                     &times;
                   </button>
                 </div>
               );
             })}
           </div>

           <button 
             type="button" 
             onClick={() => {
               setTempSelectedUpsells(new Set(selectedUpsells));
               setShowUpsellModal(true);
             }}
             style={{ 
               background: 'none', border: 'none', padding: 0,
               color: '#f97316', fontSize: 14, fontWeight: 500,
               cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
               marginTop: 8
             }}
           >
             <span style={{ fontSize: 18 }}>+</span> Add Add-ons from Menu
           </button>
        </div>


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
        <div className="ie-overlay-inner" onClick={(e) => e.stopPropagation()}>
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
                  
                  // DUPLICATE CHECK
                  const exists = cats.some(c => c.name.toLowerCase() === nm.toLowerCase());
                  if (exists) {
                    setNewCatErr("Category with this name already exists.");
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

      {showUpsellModal && (
        <div className="ie-overlay-inner" onClick={() => setShowUpsellModal(false)}>
          <div className="ie-modal-inner" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450, height: '70vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', background: '#f8fafc' }}>
              <button 
                onClick={() => setShowUpsellModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, color: '#94a3b8', cursor: 'pointer', padding: 4, display: 'flex', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <input
                  value={upsellSearch}
                  onChange={(e) => setUpsellSearch(e.target.value)}
                  className="ie-input ie-search-focus"
                  placeholder="Search menu items..."
                  autoFocus
                  style={{ marginBottom: 16, borderRadius: 99, paddingLeft: 16, border: '1px solid #fdba74', outline: 'none', boxShadow: '0 0 0 1px #fdba74' }}
                />
                
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                  {upsellCandidates
                    .filter(u => !upsellSearch || u.name.toLowerCase().includes(upsellSearch.toLowerCase()))
                    .length === 0 ? (
                      <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                        No items found.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {upsellCandidates
                          .filter(u => !upsellSearch || u.name.toLowerCase().includes(upsellSearch.toLowerCase()))
                          .map(u => {
                            const isSelected = tempSelectedUpsells.has(u.id);
                            return (
                              <div 
                                key={u.id}
                                onClick={() => {
                                  setTempSelectedUpsells(prev => {
                                    const next = new Set(prev);
                                    next.has(u.id) ? next.delete(u.id) : next.add(u.id);
                                    return next;
                                  });
                                }}
                                style={{ 
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '10px 4px', 
                                  borderBottom: '1px solid #f1f5f9',
                                  cursor: 'pointer'
                                }}
                              >
                                 <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                   <span style={{ fontSize: 14, color: '#334155' }}>{u.name}</span>
                                   <span style={{ fontSize: 12, color: '#94a3b8' }}>₹{u.price}</span>
                                 </div>
                                 
                                 <div style={{ width: 20, display: 'flex', justifyContent: 'center' }}>
                                   {isSelected && (
                                     <span style={{ color: '#16a34a', fontSize: 16 }}>✓</span>
                                   )}
                                 </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                </div>
            </div>

            <div style={{ padding: '16px 20px', borderTop: '1px solid #f3f4f6', background: 'white' }}>
               <button 
                 onClick={() => {
                   setSelectedUpsells(new Set(tempSelectedUpsells));
                   setShowUpsellModal(false);
                 }} 
                 className="ie-btn-primary" 
                 style={{ width: '100%', borderRadius: 12, background: '#f97316', border: 'none', padding: '12px', fontSize: 16, fontWeight: 600, color: 'white' }}
               >
                 Done
               </button>
            </div>
          </div>
        </div>
      )}

      {showVariantModal && (
        <div className="ie-overlay-inner" onClick={(e) => e.stopPropagation()}>
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
                  // Validate no empty options
                  if (newVariantOptions.some(o => !o.trim())) {
                    setNewVariantErr("Please fill all option fields.");
                    return;
                  }

                  const name = newVariantName.trim();
                  const options = newVariantOptions.map(o => o.trim());
                  
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
          background: #ffffff; padding: 0; border-radius: 16px; 
          width: 100%; max-width: 550px; 
          box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25); border: 1px solid #e5e7eb; margin: auto; 
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          max-height: 90vh; overflow-y: auto;
          display: flex; flex-direction: column;
          scrollbar-width: thin; scrollbar-color: #d1d5db transparent;
        }
        .ie-modal::-webkit-scrollbar { width: 6px; }
        .ie-modal::-webkit-scrollbar-track { background: transparent; }
        .ie-modal::-webkit-scrollbar-thumb { background-color: #d1d5db; border-radius: 20px; }
        .ie-modal::-webkit-scrollbar-thumb:hover { background-color: #9ca3af; }

        .ie-header-area { padding: 24px 24px 0 24px; }
        .ie-title { margin: 0 0 16px 0; font-size: 1.25rem; font-weight: 700; color: #111827; }
        .ie-scroll-content { 
          padding: 0 24px 160px 24px; 
        }
        
        /* Actions now sticky bottom */
        .ie-actions { 
          padding: 20px 24px 24px 24px; border-top: 1px solid #f3f4f6; 
          display: flex; justify-content: flex-end; gap: 12px; background: white; flex-shrink: 0;
        }

        .ie-checkbox-group { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; cursor: pointer; flex: auto; min-width: 120px; }
        .ie-checkbox-group input { width: 16px; height: 16px; accent-color: #f97316; }
        .ie-error { background: #fef2f2; color: #b91c1c; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 0.875rem; border: 1px solid #fecaca; }
        
        .ie-variant-list { display: flex; flex-direction: column; gap: 10px; }

        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .ie-row-2 { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 16px; }
        @media (min-width: 640px) { .ie-row-2 { grid-template-columns: 1fr 1fr; } }
        .ie-input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.875rem; outline: none; background: #f9fafb; transition: all 0.2s; }
        .ie-input:focus { border-color: #f97316; background: white; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1); }
        .ie-label { font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 6px; display: block; }

        .ie-btn-primary { padding: 10px 20px; background: #f97316; color: white; border: none; border-radius: 99px; font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.2); }
        .ie-btn-secondary { padding: 10px 20px; background: white; color: #4b5563; border: 1px solid #d1d5db; border-radius: 99px; font-weight: 500; font-size: 0.875rem; cursor: pointer; transition: all 0.2s; }
        .ie-btn-small { padding: 6px 12px; background: #f97316; color: white; border: none; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; }
        .ie-checkbox-wrapper { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; }

        /* Inner Modal */
        .ie-overlay-inner { position: fixed; inset: 0; background: rgba(0,0,0,0.2); z-index: 1100; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(1px); }
        .ie-modal-inner { background: white; padding: 20px; border-radius: 12px; width: 90%; max-width: 360px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }
        
        /* Enhanced Image Upload Styles */
        .ie-image-upload-enhanced {
          border: 2px dashed #e5e7eb;
          border-radius: 12px;
          background: linear-gradient(135deg, #fafafa 0%, #ffffff 100%);
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .ie-upload-dropzone {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
        }
        
        .ie-upload-dropzone:hover {
          border-color: #f97316;
          background: linear-gradient(135deg, #fff7ed 0%, #ffffff 100%);
        }
        
        .ie-upload-dropzone:hover .ie-upload-icon-wrapper {
          transform: translateY(-4px) scale(1.05);
          background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
        }
        
        .ie-upload-dropzone:hover .ie-upload-icon {
          stroke: white;
        }
        
        .ie-file-input {
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
          opacity: 0;
          cursor: pointer;
        }
        
        .ie-upload-icon-wrapper {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 4px 12px rgba(251, 146, 60, 0.15);
        }
        
        .ie-upload-icon {
          stroke: #f97316;
          transition: all 0.3s ease;
        }
        
        .ie-upload-text-primary {
          font-size: 15px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 6px;
          text-align: center;
        }
        
        .ie-upload-highlight {
          color: #f97316;
          font-weight: 600;
        }
        
        .ie-upload-text-secondary {
          font-size: 13px;
          color: #9ca3af;
          margin-bottom: 14px;
        }
        
        .ie-upload-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
          border: 1px solid #a7f3d0;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          color: #059669;
          box-shadow: 0 2px 4px rgba(5, 150, 105, 0.1);
        }
        
        .ie-upload-badge svg {
          stroke: #059669;
        }
        
        /* Loading State */
        .ie-upload-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          gap: 10px;
        }
        
        .ie-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #fee2e2;
          border-top: 4px solid #f97316;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .ie-loading-text {
          font-size: 14px;
          font-weight: 600;
          color: #f97316;
        }
        
        .ie-loading-subtext {
          font-size: 12px;
          color: #9ca3af;
        }
        
        /* Preview State */
        .ie-image-preview-container {
          padding: 16px;
        }
        
        .ie-image-preview-box {
          position: relative;
          border-radius: 10px;
          overflow: hidden;
          background: #f9fafb;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          transition: all 0.3s ease;
        }
        
        .ie-image-preview-box:hover .ie-image-overlay {
          opacity: 1;
        }
        
        .ie-image-preview-img {
          width: 100%;
          height: 200px;
          object-fit: cover;
          display: block;
          border-radius: 10px;
        }
        
        .ie-image-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.7));
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        
        .ie-image-remove-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }
        
        .ie-image-remove-btn:hover {
          background: #dc2626;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
        }
        
        .ie-image-remove-btn:active {
          transform: translateY(0);
        }
        
        .ie-image-info {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 10px 14px;
          background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
          border: 1px solid #a7f3d0;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          color: #059669;
        }
        
        /* Old styles (keeping for backward compatibility) */
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
        .ie-variant-list { display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; padding-right: 4px; }
        /* Custom scrollbar for variant list */
        .ie-variant-list::-webkit-scrollbar { width: 4px; }
        .ie-variant-list::-webkit-scrollbar-track { background: transparent; }
        .ie-variant-list::-webkit-scrollbar-thumb { background-color: #d1d5db; border-radius: 20px; }
        .ie-variant-row { display: flex; gap: 12px; align-items: center; padding: 12px 14px; background: #ffffff; border-radius: 10px; border: 1px solid #e5e7eb; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
        .ie-variant-row:hover { border-color: #d1d5db; box-shadow: 0 2px 4px rgba(0,0,0,0.08); }
        .ie-variant-name { flex: 1; font-weight: 500; font-size: 14px; color: #111827; }
        .ie-price-input-wrapper { display: flex; align-items: center; gap: 8px; background: #f9fafb; padding: 6px 10px; border-radius: 8px; border: 1px solid #e5e7eb; transition: all 0.2s; }
        .ie-price-input-wrapper:focus-within { border-color: #652ae2; background: white; }
        .ie-price-input-wrapper .prefix { font-size: 15px; color: #6b7280; font-weight: 600; }
        .ie-price-input { width: 90px; padding: 6px 8px; border-radius: 6px; border: none; font-size: 14px; font-weight: 600; outline: none; background: transparent; color: #111827; }
        .ie-price-input { width: 90px; padding: 6px 8px; border-radius: 6px; border: none; font-size: 14px; font-weight: 600; outline: none; background: transparent; color: #111827; }
        .ie-avail-label { display: flex; align-items: center; gap: 7px; font-size: 13px; color: #4b5563; cursor: pointer; user-select: none; font-weight: 500; padding: 4px 8px; border-radius: 6px; transition: background 0.15s ease; }
        .ie-avail-label:hover { background: #f3f4f6; }

        .ie-addons-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; margin-top: 8px; }
        .ie-addon-item { display: flex; align-items: center; gap: 10px; background: #f9fafb; padding: 10px 14px; border-radius: 8px; border: 1px solid #e5e7eb; cursor: pointer; transition: all 0.2s; }
        .ie-addon-item:hover { border-color: #d1d5db; background: white; }
        .ie-addon-checkbox { width: 16px; height: 16px; accent-color: #059669; }
        .ie-addon-name { font-size: 14px; font-weight: 500; color: #374151; }
      `}</style>
    </div>
  );
}
