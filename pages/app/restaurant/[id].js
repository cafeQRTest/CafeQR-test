//pages/app/restaurant/[id].js

import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../../../services/supabase";

const cartKey = (restaurantId) => `cart_delivery_${restaurantId}`;

export default function DeliveryRestaurantMenu() {
  const router = useRouter();
  const supabase = getSupabase();
  const { id: restaurantId } = router.query;

  const [restaurant, setRestaurant] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  // Variant modal
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [variantTargetItem, setVariantTargetItem] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState(null);

  const brandColor = restaurant?.restaurant_profiles?.brand_color || "#f59e0b";
  const showImages = !!restaurant?.restaurant_profiles?.features_menu_images_enabled;

  useEffect(() => {
    if (!restaurantId) return;
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(cartKey(restaurantId));
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setCart(Array.isArray(parsed) ? parsed : []);
      } catch {
        setCart([]);
      }
    } else {
      setCart([]);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    if (typeof window === "undefined") return;
    localStorage.setItem(cartKey(restaurantId), JSON.stringify(cart));
  }, [cart, restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;

    const load = async () => {
      setLoading(true);

      // Restaurant + profile
      const { data: rest, error: restErr } = await supabase
        .from("restaurants")
        .select(
          `
          id,
          name,
          online_paused,
          restaurant_profiles(
            brand_color,
            features_menu_images_enabled,
            online_payment_enabled,
            use_own_gateway,
            gst_enabled,
            default_tax_rate,
            prices_include_tax
          )
        `
        )
        .eq("id", restaurantId)
        .single();

      if (restErr || !rest) {
        setRestaurant(null);
        setMenuItems([]);
        setLoading(false);
        return;
      }

      // Menu items
      const { data: rawItems, error: menuErr } = await supabase
        .from("menu_items")
        .select(
          `
          id,
          name,
          price,
          description,
          category,
          veg,
          status,
          is_packaged_good,
          image_url,
          has_variants
        `
        )
        .eq("restaurant_id", restaurantId)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (menuErr) {
        setRestaurant(rest);
        setMenuItems([]);
        setLoading(false);
        return;
      }

      const items = (rawItems || []).map((i) => ({ ...i, variantOptions: [] }));

      // Variant pricing for items with variants
      const variantItemIds = items.filter((i) => i.has_variants).map((i) => i.id);

      if (variantItemIds.length > 0) {
        const { data: vpData } = await supabase
          .from("variant_pricing")
          .select(
            `
            menu_item_id,
            price,
            is_available,
            variant_options (id, name, display_order, template_id)
          `
          )
          .in("menu_item_id", variantItemIds);

        const map = new Map();
        (vpData || []).forEach((vp) => {
          if (!vp?.menu_item_id || !vp?.variant_options) return;
          if (!map.has(vp.menu_item_id)) map.set(vp.menu_item_id, []);
          map.get(vp.menu_item_id).push({
            variant_id: vp.variant_options.id,
            variant_name: vp.variant_options.name,
            price: Number(vp.price) || 0,
            is_available: vp.is_available !== false,
            display_order: vp.variant_options.display_order ?? 0,
          });
        });

        items.forEach((i) => {
          if (map.has(i.id)) {
            i.variantOptions = map
              .get(i.id)
              .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
          }
        });
      }

      setRestaurant(rest);
      setMenuItems(items);
      setLoading(false);
    };

    load();
  }, [restaurantId, supabase]);

  const categories = useMemo(() => {
    const s = new Set();
    (menuItems || []).forEach((i) => s.add(i.category || "Others"));
    return ["All", ...Array.from(s)];
  }, [menuItems]);

  const [cat, setCat] = useState("All");
  useEffect(() => setCat("All"), [restaurantId]);

  const visibleItems = useMemo(() => {
    if (cat === "All") return menuItems;
    return menuItems.filter((i) => (i.category || "Others") === cat);
  }, [menuItems, cat]);

  const cartCount = useMemo(
    () => cart.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
    [cart]
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0),
        0
      ),
    [cart]
  );

  const addDirect = (item) => {
    setCart((prev) => {
      const idx = prev.findIndex(
        (c) =>
          c.id === item.id &&
          (!c.selectedVariant && !item.selectedVariant
            ? true
            : c.selectedVariant?.variant_id === item.selectedVariant?.variant_id)
      );

      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: (next[idx].quantity || 0) + 1 };
        return next;
      }

      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          displayName: item.displayName || item.name,
          price: Number(item.price) || 0,
          quantity: 1,
          veg: !!item.veg,
          image_url: item.image_url,
          is_packaged_good: !!item.is_packaged_good,
          selectedVariant: item.selectedVariant || null,
        },
      ];
    });
  };

  const openVariantModal = (item) => {
    setVariantTargetItem(item);
    const first = (item.variantOptions || []).find((v) => v.is_available !== false);
    setSelectedVariantId(first?.variant_id || null);
    setVariantModalOpen(true);
  };

  const confirmVariant = () => {
    const item = variantTargetItem;
    if (!item) return;

    const v = (item.variantOptions || []).find((x) => x.variant_id === selectedVariantId);
    if (!v) return;

    addDirect({
      ...item,
      price: v.price,
      displayName: `${item.name} (${v.variant_name})`,
      selectedVariant: { variant_id: v.variant_id, variant_name: v.variant_name },
    });

    setVariantModalOpen(false);
    setVariantTargetItem(null);
    setSelectedVariantId(null);
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading menu…</div>;
  }

  if (!restaurant) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        Restaurant not found.
        <div style={{ marginTop: 12 }}>
          <Link href="/app">Back</Link>
        </div>
      </div>
    );
  }

  if (restaurant.online_paused) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        {restaurant.name} is currently closed.
        <div style={{ marginTop: 12 }}>
          <Link href="/app">Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", paddingBottom: 90 }}>
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          onClick={() => router.push("/app")}
          style={{
            border: "1px solid #e5e7eb",
            background: "#fff",
            borderRadius: 10,
            padding: "8px 10px",
            cursor: "pointer",
          }}
        >
          {"<"}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{restaurant.name}</div>
          <div style={{ color: "#6b7280", fontSize: 12 }}>Delivery menu</div>
        </div>
      </header>

      <div style={{ padding: 12, display: "flex", gap: 8, overflowX: "auto" }}>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            style={{
              border: "1px solid #e5e7eb",
              background: c === cat ? brandColor : "#fff",
              color: c === cat ? "#fff" : "#111827",
              borderRadius: 999,
              padding: "10px 14px",
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        {visibleItems.map((item) => {
          const isAvailable = item.status !== "out_of_stock" && item.status !== "inactive";
          return (
            <div
              key={item.id}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 14,
                opacity: isAvailable ? 1 : 0.6,
              }}
            >
              <div style={{ display: "flex", gap: 12 }}>
                {showImages && item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    style={{
                      width: 70,
                      height: 70,
                      borderRadius: 12,
                      objectFit: "cover",
                      flexShrink: 0,
                    }}
                  />
                ) : null}

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12 }}>{item.veg ? "🟢" : "🔺"}</span>
                    <div style={{ fontWeight: 800 }}>{item.name}</div>
                  </div>
                  {item.description ? (
                    <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
                      {item.description}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 10, fontWeight: 800 }}>
                    ₹{Number(item.price || 0).toFixed(2)}
                    {item.has_variants ? (
                      <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>
                        (Variants)
                      </span>
                    ) : null}
                  </div>

                  <button
                    disabled={!isAvailable}
                    onClick={() => {
                      if (item.has_variants && (item.variantOptions || []).length > 0) {
                        openVariantModal(item);
                      } else {
                        addDirect(item);
                      }
                    }}
                    style={{
                      marginTop: 10,
                      width: "100%",
                      background: brandColor,
                      border: "none",
                      color: "#fff",
                      borderRadius: 12,
                      padding: "10px 12px",
                      fontWeight: 800,
                      cursor: isAvailable ? "pointer" : "not-allowed",
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {cartCount > 0 && (
        <Link
          href={`/app/cart?r=${restaurantId}`}
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: 16,
            background: "#111827",
            color: "#fff",
            textDecoration: "none",
            borderRadius: 14,
            padding: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontWeight: 800,
          }}
        >
          <span>{cartCount} item(s)</span>
          <span>View cart • ₹{cartTotal.toFixed(2)}</span>
        </Link>
      )}

      {variantModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 12,
          }}
          onClick={() => setVariantModalOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              borderRadius: 16,
              padding: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              Choose variant • {variantTargetItem?.name}
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {(variantTargetItem?.variantOptions || []).map((v) => (
                <label
                  key={v.variant_id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    opacity: v.is_available ? 1 : 0.5,
                    cursor: v.is_available ? "pointer" : "not-allowed",
                  }}
                >
                  <span>
                    <input
                      type="radio"
                      disabled={!v.is_available}
                      checked={selectedVariantId === v.variant_id}
                      onChange={() => setSelectedVariantId(v.variant_id)}
                      style={{ marginRight: 10 }}
                    />
                    {v.variant_name}
                  </span>
                  <span style={{ fontWeight: 800 }}>₹{Number(v.price).toFixed(2)}</span>
                </label>
              ))}
            </div>

            <button
              onClick={confirmVariant}
              disabled={!selectedVariantId}
              style={{
                marginTop: 12,
                width: "100%",
                background: brandColor,
                border: "none",
                color: "#fff",
                borderRadius: 12,
                padding: 12,
                fontWeight: 900,
                cursor: selectedVariantId ? "pointer" : "not-allowed",
              }}
            >
              Add to cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
