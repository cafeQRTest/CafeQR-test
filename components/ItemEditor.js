// components/ItemEditor.js
import { useState, useEffect, useMemo } from "react";

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

  const [name, setName] = useState(item?.name || "");
  const [price, setPrice] = useState(item?.price ?? 0);
  const [category, setCategory] = useState(item?.category || "main");
  const [status, setStatus] = useState(item?.status || "available");
  const [veg, setVeg] = useState(item?.veg ?? true);
  const [hsn, setHsn] = useState(item?.hsn || "");
  const [taxRate, setTaxRate] = useState(item?.tax_rate ?? 0);
  const [isPackaged, setIsPackaged] = useState(!!item?.is_packaged_good);
  const [cessRate, setCessRate] = useState(item?.compensation_cess_rate ?? 0);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

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
    setName(item?.name || "");
    setPrice(item?.price ?? 0);
    setCategory(item?.category || "main");
    setStatus(item?.status || "available");
    setVeg(item?.veg ?? true);
    setHsn(item?.hsn || "");
    setTaxRate(item?.tax_rate ?? 0);
    setIsPackaged(!!item?.is_packaged_good);
    setCessRate(item?.compensation_cess_rate ?? 0);
    setErr("");
  }, [item]);

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (Number.isNaN(Number(price)) || price < 0) return false;
    if (taxRate < 0 || cessRate < 0) return false;
    return true;
  }, [name, price, taxRate, cessRate]);

  if (!open) return null;

  const save = async (e) => {
    e.preventDefault();
    if (!supabase || !canSubmit) {
      onError?.("Please fill required fields.");
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
        name: name.trim(),
        price: Number(price),
        category: category.trim(),
        status,
        veg,
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
          <div style={customLabel}>Name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={input}
          />
        </label>
        <div style={row2}>
          <label>
            <div style={customLabel}>Price</div>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              style={input}
            />
          </label>
          <label>
            <div style={customLabel}>Category</div>
            <div style={{ display: "flex", gap: 4 }}>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={input}
              >
                {cats.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const nm = prompt("New category")?.trim();
                  if (!nm) return;
                  supabase
                    .from("categories")
                    .insert([
                      {
                        name: nm,
                        is_global: false,
                        restaurant_id: restaurantId,
                      },
                    ])
                    .select("id,name")
                    .single()
                    .then(({ data }) => {
                      setCats((prev) => [...prev, data]);
                      setCategory(data.name);
                    });
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
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={input}
            >
              <option value="available">available</option>
              <option value="out_of_stock">out_of_stock</option>
              <option value="paused">paused</option>
            </select>
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
        </div>
        <div style={{ marginTop: 12}}>
        <label>
          <div style={customLabel}>HSN</div>
          <input
            value={hsn}
            onChange={(e) => setHsn(e.target.value)}
            style={input}
            placeholder="optional"
          />
        </label>
        </div>
        <div style={row2}>
          <label>
            <div style={customLabel}>Tax %</div>
            <input
              type="number"
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              style={input}
              placeholder="0"
            />
          </label>
          <label>
            <div style={customLabel}>Cess %</div>
            <input
              type="number"
              step="0.01"
              value={cessRate}
              onChange={(e) => setCessRate(e.target.value)}
              disabled={!isPackaged}
              style={input}
              placeholder="0"
            />
          </label>
        </div>

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
            disabled={saving || !canSubmit}
            style={primaryBtn}
          >
            {saving ? "Saving…" : isEdit ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  zIndex: 1000,
};
const modal = {
  background: "#fff",
  padding: 16,
  borderRadius: 8,
  width: "100%",
  maxWidth: 420,
};
const input = {
  width: "100%",
  padding: 8,
  border: "1px solid #ddd",
  borderRadius: 4,
  height: "40px",
};
const row2 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginTop: 12,
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
  gap: 8,
  marginTop: 16,
};
const smallBtn = {
  padding: "8px",
  background: "#f97316",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  height: "40px",
};
const primaryBtn = {
  padding: "10px 16px",
  background: "#f97316",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};
const secondaryBtn = {
  padding: "10px 16px",
  background: "#fff",
  color: "#f97316",
  border: "1px solid #f97316",
  borderRadius: 6,
  cursor: "pointer",
};
const errorStyle = {
  background: "#fee2e2",
  color: "#991b1b",
  padding: 8,
  borderRadius: 4,
  marginBottom: 12,
};
const customLabel = {
  marginBottom: 6,
};
