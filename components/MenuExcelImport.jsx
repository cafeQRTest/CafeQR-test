import React, { useMemo, useState } from "react";

function norm(s) {
  return String(s ?? "").trim();
}
function normKey(s) {
  return norm(s).toLowerCase().replace(/\s+/g, " ");
}

function pick(row, keys) {
  for (const k of keys) {
    if (row?.[k] !== undefined && row?.[k] !== null && String(row[k]).trim() !== "") return row[k];
    const foundKey = Object.keys(row || {}).find((rk) => normKey(rk) === normKey(k));
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== "")
      return row[foundKey];
  }
  return "";
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function toBool(v, fallback = false) {
  if (v === null || v === undefined || v === "") return fallback;
  const s = normKey(v);
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return fallback;
}

function isValidHsn(hsn) {
  const s = norm(hsn).replace(/\.0$/, "");
  return /^[0-9]{4,8}$/.test(s);
}

export default function MenuExcelImport({
  restaurantId,
  supabase,
  existingItems = [],
  onImported,
  onClose,
  defaults = {
    category: "General",
    veg: false,
    ispackagedgood: false, // if your shop is mainly packaged goods, set this true from MenuPage
    status: "available",
    compensationcessrate: 0,
    taxrate: 0, // NEW: default tax if Excel has no tax column/value
  },
}) {
  const [rows, setRows] = useState([]);
  const [parsingError, setParsingError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState("");

const existingByNormName = useMemo(() => {
  const set = new Set();
  for (const it of existingItems || []) {
    const nameKey = normKey(it?.name);
    if (nameKey) set.add(nameKey);
  }
  return set;
}, [existingItems]);

  const parsed = useMemo(() => {
    const drafts = (rows || []).map((r, idx) => {
      // Common Excel headers (your sample includes ITEM_NAME, ACC, SELL_RATE, TAX, HSN_CODE, CESS_PER, UOM) [file:238]
      const name = pick(r, ["name", "item_name", "item", "product", "product_name", "ITEM_NAME"]);
      const category = pick(r, ["category", "cat", "group"]) || defaults.category;

      const code = pick(r, ["codenumber", "code", "acc", "ACC", "sku", "item_code"]);
      const price =
        toNumber(pick(r, ["price", "sell_rate", "SELL_RATE", "rate", "RATE", "mrp", "MRP", "amount"])) ?? null;

      const hsnRaw = pick(r, ["hsn", "hsn_code", "HSN_CODE", "hsncode"]);
      const hsn = norm(hsnRaw) ? norm(hsnRaw).replace(/\.0$/, "") : null;

      const taxrateFromFile = toNumber(pick(r, ["taxrate", "tax", "TAX", "tax%", "gst", "gst%"]));
      const taxrate = taxrateFromFile ?? (defaults.taxrate ?? 0);

      // packaged flag: use explicit column if available; otherwise use defaults.ispackagedgood
      const ispackagedgood = toBool(
        pick(r, ["ispackagedgood", "packaged", "pkg", "is_packaged"]),
        defaults.ispackagedgood
      );

      const cessFromFile =
        toNumber(pick(r, ["compensationcessrate", "cess", "CESS", "cess%", "cess_per", "CESS_PER"])) ??
        defaults.compensationcessrate ??
        0;

      const veg = toBool(pick(r, ["veg", "isveg", "vegetarian"]), defaults.veg);

      return {
        __row: idx + 2,
        name: norm(name),
        category: norm(category),
        codenumber: norm(code) || null,
        price,
        hsn,
        taxrate,
        ispackagedgood,
        compensationcessrate: ispackagedgood ? Number(cessFromFile ?? 0) : 0,
        veg,
        __rawTaxMissing: taxrateFromFile === null, // track for warnings
        __rawHsnMissing: !hsn,
      };
    });

    const withNewFlag = drafts.map((d) => {
  const key = normKey(d.name);
  const exists = !!key && existingByNormName.has(key);
  return { ...d, __isNew: !exists };
});

let newOnes = withNewFlag.filter((d) => d.__isNew);

// de-dupe within file by name only
const seenInFile = new Set();
newOnes = newOnes.filter((d) => {
  const key = normKey(d.name);
  if (!key) return true;
  if (seenInFile.has(key)) return false;
  seenInFile.add(key);
  return true;
});


    // Validate only new ones
    const errors = [];
    const warnings = [];
    const validNew = [];

    for (const d of newOnes) {
      const rowTag = `Row ${d.__row}`;

      // hard requirements
      if (!d.name) errors.push(`${rowTag}: Name is required.`);
      if (!d.category) errors.push(`${rowTag}: Category is required (or set a default).`);
      if (d.price === null) errors.push(`${rowTag}: Price is required and must be a number.`);

      // tax: optional, but validate if present or default applied
      if (d.taxrate < 0 || d.taxrate > 100) errors.push(`${rowTag}: Tax% must be between 0 and 100.`);
      if (d.__rawTaxMissing) warnings.push(`${rowTag}: Tax% not found in file; used default ${Number(d.taxrate).toFixed(2)}.`);

      // hsn: only required when packaged good is true
      if (d.ispackagedgood) {
        if (!d.hsn) errors.push(`${rowTag}: HSN is required for packaged goods.`);
        else if (!isValidHsn(d.hsn)) errors.push(`${rowTag}: HSN must be 4–8 digits.`);
      } else {
        if (!d.hsn) warnings.push(`${rowTag}: HSN not provided (ok for non-packaged items).`);
        else if (!isValidHsn(d.hsn)) errors.push(`${rowTag}: HSN must be 4–8 digits.`);
      }

      // cess validation (only if packaged)
      if (d.ispackagedgood && (d.compensationcessrate < 0 || d.compensationcessrate > 100))
        errors.push(`${rowTag}: Cess% must be between 0 and 100 for packaged goods.`);

      const hasRowError = errors.some((e) => e.startsWith(rowTag + ":"));
      if (!hasRowError) validNew.push(d);
    }

    return {
      all: withNewFlag,
      newRows: newOnes,
      validNew,
      errors,
      warnings,
      stats: {
        total: withNewFlag.length,
        newCount: newOnes.length,
        existingSkipped: withNewFlag.length - newOnes.length,
      },
    };
  }, [rows, defaults, existingByNormName ]);

  async function onFile(e) {
    setParsingError("");
    setResultMsg("");
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import("xlsx"); // client-side only
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames?.[0];
      if (!sheetName) throw new Error("No sheet found in Excel.");

      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
      setRows(json);
    } catch (err) {
      setRows([]);
      setParsingError(err?.message || "Failed to parse Excel.");
    } finally {
      e.target.value = "";
    }
  }

  async function importNew() {
    setResultMsg("");
    if (!restaurantId || !supabase) return setResultMsg("Not ready (missing restaurantId/supabase).");
    if (parsed.errors.length) return setResultMsg("Fix validation errors before importing.");
    if (!parsed.validNew.length) return setResultMsg("No new items found to import.");

    setBusy(true);
    try {
// IMPORTANT: menu_items (not menuitems) + snake_case columns
const payload = parsed.validNew.map((d) => ({
  restaurant_id: restaurantId,
  name: d.name,
  category: d.category,
  price: Number(d.price),

  code_number: d.codenumber,          // was codenumber
  hsn: d.hsn || null,
  tax_rate: Number(d.taxrate ?? 0),   // was taxrate

  status: defaults.status ?? "available", // NOTE: must be one of: available/out_of_stock/paused/draft
  veg: !!d.veg,

  is_packaged_good: !!d.ispackagedgood,                 // was ispackagedgood
  compensation_cess_rate: Number(d.compensationcessrate ?? 0), // was compensationcessrate

  ispopular: false,
  image_url: null,     // was imageurl
  has_variants: false, // was hasvariants
  uom_id: null,        // was uomid
}));

const { data, error } = await supabase
  .from("menu_items")
  .insert(payload)
  .select(
    "id, name, category, price, code_number, hsn, tax_rate, status, veg, is_packaged_good, compensation_cess_rate, image_url, has_variants, uom_id"
  );

if (error) throw error;

      setResultMsg(`Imported ${data?.length || 0} new items.`);
      onImported?.(data || []);
      onClose?.();
    } catch (err) {
      setResultMsg(err?.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <h3 style={{ marginTop: 0 }}>Excel Import (New items only: name + category match)</h3>

      <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
        Tip: Tax%/HSN are optional; packaged items require HSN.
      </div>

      <input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy} />

      {parsingError ? (
        <div style={{ marginTop: 12, color: "#b91c1c", fontWeight: 600 }}>{parsingError}</div>
      ) : null}

      {rows?.length ? (
        <div style={{ marginTop: 12, fontSize: 14 }}>
          <div>Total rows: {parsed.stats.total}</div>
          <div>New items to add: {parsed.stats.newCount}</div>
          <div>Existing items skipped: {parsed.stats.existingSkipped}</div>
        </div>
      ) : null}

      {parsed.errors?.length ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 8 }}>
          <div style={{ fontWeight: 800, color: "#991b1b", marginBottom: 8 }}>
            Fix these (only for NEW rows):
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {parsed.errors.slice(0, 12).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {parsed.errors.length > 12 ? <div style={{ marginTop: 8 }}>…and {parsed.errors.length - 12} more</div> : null}
        </div>
      ) : null}

      {parsed.warnings?.length ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 8 }}>
          <div style={{ fontWeight: 800, color: "#92400e", marginBottom: 8 }}>
            Warnings (import will still work):
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {parsed.warnings.slice(0, 8).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {parsed.warnings.length > 8 ? <div style={{ marginTop: 8 }}>…and {parsed.warnings.length - 8} more</div> : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={importNew} disabled={busy || !rows.length || parsed.errors.length > 0}>
          {busy ? "Importing..." : "Import New Items"}
        </button>
        <button onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>

      {resultMsg ? <div style={{ marginTop: 12, fontWeight: 600 }}>{resultMsg}</div> : null}
    </div>
  );
}
