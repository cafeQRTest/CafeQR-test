// components/ItemEditor.js


import { useState, useEffect, useMemo } from "react";
import NiceSelect from "./NiceSelect";

export default function ItemEditor({
  supabase,
  open,
  onClose,
  item,
  restaurantId,
  onSaved,
  onError,
}) {
  const isEdit = !!item?.id;

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

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatErr, setNewCatErr] = useState("");

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

  useEffect(() => {
    setCode(item?.code_number || "");
    setName(item?.name || "");
    setPrice(
      item?.price !== undefined && item?.price !== null ? item.price : ""
    );
    setCategory(item?.category || "main");
    setStatus(item?.status || "available");
    setVeg(item?.veg ?? true);
    setIsPopular(!!item?.ispopular);
    setHsn(item?.hsn || "");
    setTaxRate(item?.tax_rate ?? 0);
    setIsPackaged(!!item?.is_packaged_good);
    setCessRate(item?.compensation_cess_rate ?? 0);
    setErr("");
  }, [item]);

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (price === "" || Number.isNaN(Number(price))) return false;
    if (Number(price) <= 0) return false; // price mandatory and > 0
    if (taxRate < 0 || cessRate < 0) return false;
    // code is optional, so we don't require it
    return true;
  }, [name, price, taxRate, cessRate]);
  if (!open) return null;

  const save = async (e) => {
    e.preventDefault();
    if (!supabase || !canSubmit) {
      const msg = "Please fill in all required details: name and a valid price greater than 0.";
      setErr(msg);
      onError?.(msg);
      return;
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
      };

      let newItem;
      if (isEdit) {
        const { error: updErr } = await supabase
          .from("menu_items")
          .update(payload)
          .eq("id", item.id)
          .eq("restaurant_id", restaurantId);
        if (updErr) throw updErr;
        onSaved({ ...item, ...payload });
      } else {
        const { data, error: insertErr } = await supabase
          .from("menu_items")
          .insert([payload])
          .select("*")
          .single();
        if (insertErr) throw insertErr;
        newItem = data;
        onSaved(newItem);
      }

      if (!isEdit && newItem) {
        await supabase.rpc("upsert_library_item", {
          _name: newItem.name,
          _price: newItem.price,
          _veg: newItem.veg,
          _desc: newItem.description,
          _img_url: newItem.image_url,
          _cat_id: catId,
        });
      }

      onClose();
    } catch (ex) {
      setErr(ex.message || "Failed to save");
      onError?.(ex.message);
    } finally {
      setSaving(false);
    }
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
              min="0.01"
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
            <div style={customLabel}>Status</div>
            <NiceSelect
              value={status}
              onChange={setStatus}
              options={[
                { value: "available", label: "Available" },
                { value: "out_of_stock", label: "Out of stock" },
                { value: "paused", label: "Paused" },
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
        <div style={{ marginTop: 12}}>
        <label>
          <div style={customLabel}>HSN</div>
          <input
            value={hsn}
            onChange={(e) => setHsn(e.target.value)}
            style={input}
            placeholder="Enter HSN code"
          />
        </label>
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

        <div style={actions}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={secondaryBtn}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={primaryBtn}
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
