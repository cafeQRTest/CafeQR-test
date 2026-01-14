//pages/api/owner/import-menu-items.js

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

async function findExistingMenuItemId(restaurantId, itemName) {
  const nm = (itemName || "").trim();
  if (!nm) return null;

  const { data, error } = await supabaseAdmin
    .from("menu_items")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .ilike("name", nm)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

async function upsertTemplate(restaurantId, name) {
  const clean = (name || "Options").trim() || "Options";

  // STRICT RESTAURANT ISOLATION:
  // Never use global templates for imports, to avoid polluting them with custom options.
  // Always find or create a template specific to this restaurant.

  // 1. Try to find existing RESTAURANT-SPECIFIC template
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("variant_templates")
    .select("id,name")
    .eq("restaurant_id", restaurantId)
    .eq("name", clean)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing;

  // 2. Create new RESTAURANT-SPECIFIC template
  const { data: newTpl, error: insErr } = await supabaseAdmin
    .from("variant_templates")
    .insert([{ 
      name: clean, 
      restaurant_id: restaurantId,
      is_active: true 
    }])
    .select("id,name")
    .single();

  if (insErr) {
    // Handle race condition if created between select and insert
    if (insErr.code === "23505") { // unique_violation
      const { data: retry } = await supabaseAdmin
        .from("variant_templates")
        .select("id,name")
        .eq("restaurant_id", restaurantId)
        .eq("name", clean)
        .single();
      if (retry) return retry;
    }
    throw insErr;
  }

  return newTpl;
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
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Missing items[]" });

    const seen = new Set();
    const insertedItems = [];
    const skippedDuplicates = [];

    for (const it of items) {
      const name = (it?.name || "").trim();
      if (!name) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const cat = await ensureCategory(restaurantId, it.category);

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

      const { data: menuItem, error: insErr } = await supabaseAdmin
        .from("menu_items")
        .insert([{
          restaurant_id: restaurantId,
          name,
          category: cat.name,
          price: basePrice,
          veg: !!it.veg,
          description: (it.description || "").trim(),
          has_variants: hasVariants,
          status: "available",
          is_available: true,
        }])
        .select("id,name,category,price,has_variants")
        .single();

      if (insErr) {
        // unique_violation in Postgres is SQLSTATE 23505 [web:450]
        if (insErr.code === "23505") {
          skippedDuplicates.push({ name, existingId: "db_unique" });
          continue;
        }
        throw insErr;
      }

      insertedItems.push(menuItem);

      if (!hasVariants) continue;

      for (const v of variants) {
        const tpl = await upsertTemplate(restaurantId, v.template);

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

    return res.status(200).json({ ok: true, inserted: insertedItems, skippedDuplicates });
  } catch (e) {
    console.error("Import Error:", e);
    return res.status(500).json({ error: e.message || "Import failed" });
  }
}
