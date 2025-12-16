// pages/api/owner/import-menu-items.js
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function safeNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function cleanCategoryName(name) {
  const nm = (name || "").trim();
  return nm || "main";
}

async function ensureCategory(restaurantId, rawName) {
  const nm = cleanCategoryName(rawName);

  // Try restaurant category
  let { data: cat, error: selErr } = await supabaseAdmin
    .from("categories")
    .select("id,name,is_global,restaurant_id")
    .eq("restaurant_id", restaurantId)
    .eq("name", nm)
    .maybeSingle();

  if (selErr) throw selErr;
  if (cat) return cat;

  // Try global category
  const { data: globalCat, error: gErr } = await supabaseAdmin
    .from("categories")
    .select("id,name,is_global,restaurant_id")
    .eq("is_global", true)
    .eq("name", nm)
    .maybeSingle();

  if (gErr) throw gErr;
  if (globalCat) return globalCat;

  // Create restaurant category
  const { data: newCat, error: insErr } = await supabaseAdmin
    .from("categories")
    .insert([{
      name: nm,
      is_global: false,
      restaurant_id: restaurantId,
    }])
    .select("id,name,is_global,restaurant_id")
    .single();

  if (insErr) throw insErr;
  return newCat;
}

// Case-insensitive exact match using ilike (no wildcards) [web:377]
async function findExistingMenuItemId(restaurantId, itemName) {
  const nm = (itemName || "").trim();
  if (!nm) return null;

  const { data, error } = await supabaseAdmin
    .from("menu_items")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .ilike("name", nm) // exact match if nm has no % or _
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

async function upsertTemplate(name) {
  const clean = (name || "Options").trim() || "Options";

  const { data, error } = await supabaseAdmin
    .from("variant_templates")
    .upsert([{ name: clean, is_active: true }], { onConflict: "name" })
    .select("id,name")
    .single();

  if (error) throw error;
  return data;
}

async function upsertOptions(templateId, optionNames) {
  const cleanNames = (optionNames || []).map(s => (s || "").trim()).filter(Boolean);
  if (!cleanNames.length) return new Map();

  const rows = cleanNames.map((name, idx) => ({
    template_id: templateId,
    name,
    is_active: true,
    display_order: idx,
  }));

  // Requires UNIQUE index/constraint on (template_id, name) for ON CONFLICT to work. [web:268][web:278]
  const { data, error } = await supabaseAdmin
    .from("variant_options")
    .upsert(rows, { onConflict: "template_id,name" })
    .select("id,name");

  if (error) throw error;
  return new Map((data || []).map(o => [o.name, o.id]));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { restaurantId, items } = req.body || {};
    if (!restaurantId) return res.status(400).json({ error: "Missing restaurantId" });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Missing items[]" });
    }

    // Deduplicate within the same import payload (client may send repeats)
    const seen = new Set(); // key: lower(name)
    const insertedItems = [];
    const skippedDuplicates = [];

    for (const it of items) {
      const name = (it?.name || "").trim();
      if (!name) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      // Ensure category row exists (so ItemEditor dropdown can show it)
      const cat = await ensureCategory(restaurantId, it.category);

      // DEDUPE against DB: skip if already exists for this restaurant
      const existingId = await findExistingMenuItemId(restaurantId, name);
      if (existingId) {
        skippedDuplicates.push({ name, existingId });
        continue;
      }

      const variants = Array.isArray(it.variants) ? it.variants : [];
      const hasVariants = variants.length > 0;

      let basePrice = safeNumber(it.price);
      if (!basePrice && hasVariants) {
        const allPrices = variants.flatMap(v => (v.options || []).map(o => safeNumber(o.price)));
        basePrice = allPrices.length ? Math.min(...allPrices) : 0;
      }

      // 1) Insert menu item
      const { data: menuItem, error: insErr } = await supabaseAdmin
        .from("menu_items")
        .insert([{
          restaurant_id: restaurantId,
          name,
          category: cat.name, // store canonical name that exists in `categories`
          price: basePrice,
          veg: !!it.veg,
          description: (it.description || "").trim(),
          has_variants: hasVariants,
          status: "available",
          is_available: true,
        }])
        .select("id,name,category,price,has_variants")
        .single();

      if (insErr) throw insErr;
      insertedItems.push(menuItem);

      // 2) Insert variants
      if (!hasVariants) continue;

      for (const v of variants) {
        const tpl = await upsertTemplate(v.template);

        const { error: linkErr } = await supabaseAdmin
          .from("menu_item_variants")
          .insert([{
            menu_item_id: menuItem.id,
            template_id: tpl.id,
            is_required: v.required !== false,
          }]);

        if (linkErr) throw linkErr;

        const opts = Array.isArray(v.options) ? v.options : [];
        const optionNames = opts.map(o => (o.name || "").trim()).filter(Boolean);
        const optionIdMap = await upsertOptions(tpl.id, optionNames);

        const pricingRows = opts
          .map(o => {
            const optName = (o.name || "").trim();
            const optionId = optionIdMap.get(optName);
            if (!optionId) return null;
            return {
              menu_item_id: menuItem.id,
              option_id: optionId,
              price: safeNumber(o.price),
              is_available: true,
            };
          })
          .filter(Boolean);

        if (pricingRows.length) {
          const { error: prErr } = await supabaseAdmin
            .from("variant_pricing")
            .insert(pricingRows);
          if (prErr) throw prErr;
        }
      }
    }

    return res.status(200).json({
      ok: true,
      inserted: insertedItems,
      skippedDuplicates,
    });
  } catch (e) {
    console.error("Import Error:", e);
    return res.status(500).json({ error: e.message || "Import failed" });
  }
}
