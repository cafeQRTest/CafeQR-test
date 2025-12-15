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

async function upsertTemplate(name) {
  const clean = (name || "Options").trim() || "Options";

  const { data, error } = await supabaseAdmin
    .from("variant_templates")
    .upsert(
      [{ name: clean, is_active: true }],
      { onConflict: "name" }
    )
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

  // This requires UNIQUE constraint on (template_id, name) in DB
  const { data, error } = await supabaseAdmin
    .from("variant_options")
    .upsert(rows, { onConflict: "template_id,name" }) 
    .select("id,name");

  if (error) {
    console.error("Error upserting options:", error);
    throw error;
  }

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

    const insertedItems = [];

    // Process sequentially to avoid race conditions
    for (const it of items) {
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
          name: (it.name || "").trim(),
          category: (it.category || "Others").trim(),
          price: basePrice,
          veg: !!it.veg,
          description: (it.description || "").trim(),
          has_variants: hasVariants,
          status: "available",
        }])
        .select("id,name,category,price,has_variants")
        .single();

      if (insErr) throw insErr;
      insertedItems.push(menuItem);

      // 2) Insert variants
      if (!hasVariants) continue;

      // Clean up previous variants if re-importing (optional safety)
      // await supabaseAdmin.from("variant_pricing").delete().eq("menu_item_id", menuItem.id);
      // await supabaseAdmin.from("menu_item_variants").delete().eq("menu_item_id", menuItem.id);

      for (const v of variants) {
        const tpl = await upsertTemplate(v.template);

        // Link template to menu item
        const { error: linkErr } = await supabaseAdmin
          .from("menu_item_variants")
          .insert([{
            menu_item_id: menuItem.id,
            template_id: tpl.id,
            is_required: v.required !== false,
          }]);

        if (linkErr) throw linkErr;

        // Create options
        const opts = Array.isArray(v.options) ? v.options : [];
        const optionNames = opts.map(o => (o.name || "").trim()).filter(Boolean);
        const optionIdMap = await upsertOptions(tpl.id, optionNames);

        // Link prices
        const pricingRows = opts
          .map(o => {
            const optName = (o.name || "").trim();
            const optionId = optionIdMap.get(optName);
            if(!optionId) return null;
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

    return res.status(200).json({ ok: true, inserted: insertedItems });
  } catch (e) {
    console.error("Import Error:", e);
    return res.status(500).json({ error: e.message || "Import failed" });
  }
}
