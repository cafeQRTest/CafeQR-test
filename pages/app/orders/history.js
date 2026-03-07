// pages/app/orders/history.js

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, ShoppingBag, ArrowRight as ArrowIcon, CheckCircle2, XCircle, Package, RefreshCw } from "lucide-react";
import { getSupabase } from "../../../services/supabase";

const cartKey = (restaurantId) => `cart_delivery_${restaurantId}`;

const STOCK_IMAGES = [
  "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=200&q=80",
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80",
];

export default function OrderHistory() {
  const router = useRouter();
  const supabase = getSupabase();

  const [orders, setOrders] = useState([]);
  const [restaurants, setRestaurants] = useState({});
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState(null);
  const [reordering, setReordering] = useState(null);

  // Auth check — use getSession() instead of useCustomerAuth to avoid Android hang
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
        ]);
        if (!data?.session) {
          router.replace("/app/auth");
          return;
        }
        setSessionUser(data.session.user);
      } catch {
        router.replace("/app/auth");
      }
      setAuthLoading(false);
    };
    checkAuth();
  }, [supabase, router]);

  // Load orders when user is ready
  useEffect(() => {
    if (authLoading || !sessionUser?.id) return;
    loadOrders();
  }, [authLoading, sessionUser?.id]);

  const loadOrders = async () => {
    if (!sessionUser?.id) return;
    setLoading(true);
    try {
      const { data: ordersData, error } = await Promise.race([
        supabase
          .from("orders")
          .select("*, items:order_items(*)")
          .eq("user_id", sessionUser.id)
          .order("created_at", { ascending: false })
          .limit(50),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 12000)),
      ]);

      if (error) throw error;
      setOrders(ordersData || []);

      const restaurantIds = [...new Set((ordersData || []).map(o => o.restaurant_id).filter(Boolean))];
      if (restaurantIds.length > 0) {
        const { data: restaurantsData } = await supabase
          .from("restaurants")
          .select("id, name")
          .in("id", restaurantIds);

        const restaurantMap = {};
        (restaurantsData || []).forEach(r => { restaurantMap[r.id] = { name: r.name }; });
        setRestaurants(restaurantMap);
      }
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReorder = async (order) => {
    if (!order?.restaurant_id || !order?.items) return;
    setReordering(order.id);

    try {
      const newItems = (order.items || []).map(item => {
        const realId = item.menu_item_id || item.id;
        if (!realId) return null;
        return {
          id: `reorder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          menu_item_id: realId,
          name: item.item_name || item.name,
          displayName: item.item_name || item.name,
          price: item.price,
          quantity: item.quantity || 1,
          veg: item.veg ?? true,
          selectedVariant: (item.variant_option_id || item.variant_id) ? {
            variant_id: item.variant_option_id || item.variant_id,
            variant_name: item.variant_name,
          } : null,
        };
      }).filter(Boolean);

      if (newItems.length === 0) {
        alert("Unable to reorder items.");
        setReordering(null);
        return;
      }

      localStorage.setItem(cartKey(order.restaurant_id), JSON.stringify(newItems));
      await router.push(`/app/restaurant/${order.restaurant_id}`);
    } catch (err) {
      console.error("Failed to reorder:", err);
      alert("Failed to add items to cart.");
    } finally {
      setReordering(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true
    }).replace(' at', ',');
  };

  const getStatusInfo = (status) => {
    const s = (status || "").toLowerCase();
    if (s === 'delivered' || s === 'completed') return { text: 'Delivered', color: '#059669', bg: '#ecfdf5' };
    if (s === 'cancelled' || s === 'declined') return { text: 'Cancelled', color: '#ef4444', bg: '#fef2f2' };
    if (s === 'pending' || s === 'pending_acceptance') return { text: 'Pending', color: '#f59e0b', bg: '#fffbeb' };
    if (s === 'accepted') return { text: 'Accepted', color: '#3b82f6', bg: '#eff6ff' };
    return { text: s.charAt(0).toUpperCase() + s.slice(1), color: '#f97316', bg: '#fff7ed' };
  };

  if (authLoading || loading) {
    return (
      <div className="oh-page">
        <style>{CSS_TEXT}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div className="oh-spinner" />
          <p style={{ marginTop: 16, color: '#6b7280', fontWeight: 600, fontSize: 14 }}>Loading orders…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="oh-page">
      <style>{CSS_TEXT}</style>

      {/* Header */}
      <header className="oh-header">
        <button className="oh-back-btn" onClick={() => router.push("/app/restaurants")}>
          <ArrowLeft size={20} />
        </button>
        <h1>My Orders</h1>
        <button className="oh-refresh-btn" onClick={loadOrders}>
          <RefreshCw size={18} />
        </button>
      </header>

      <div className="oh-content">
        {orders.length === 0 ? (
          <div className="oh-empty">
            <div className="oh-empty-icon">
              <ShoppingBag size={40} color="#d1d5db" />
            </div>
            <h2>No orders yet</h2>
            <p>Your food journey begins here</p>
            <button className="oh-start-btn" onClick={() => router.push("/app/restaurants")}>
              Browse Restaurants
            </button>
          </div>
        ) : (
          <div className="oh-list">
            {orders.map((order, index) => {
              const rData = restaurants[order.restaurant_id] || {};
              const rName = order.restaurant_name || rData.name || "Restaurant";
              const statusInfo = getStatusInfo(order.status);
              const imgIdx = (order.restaurant_id || "").charCodeAt(0) % STOCK_IMAGES.length;
              const imgUrl = STOCK_IMAGES[imgIdx || 0];
              const orderItems = Array.isArray(order.items) ? order.items : [];

              return (
                <div key={order.id} className="oh-card" style={{ animationDelay: `${index * 0.06}s` }}>
                  <div className="oh-card-header">
                    <div className="oh-rest-info">
                      <img src={imgUrl} alt="" className="oh-rest-img" />
                      <div>
                        <h3 className="oh-rest-name">{rName}</h3>
                        <span className="oh-date">{formatDate(order.created_at)}</span>
                      </div>
                    </div>
                    <div className="oh-status-badge" style={{ color: statusInfo.color, background: statusInfo.bg }}>
                      {statusInfo.text}
                    </div>
                  </div>

                  <div className="oh-divider" />

                  <div className="oh-items">
                    {orderItems.map((item, idx) => (
                      <div key={idx} className="oh-item-row">
                        <span className="oh-item-qty">{item.quantity}×</span>
                        <span className="oh-item-name">{item.item_name || item.name}</span>
                      </div>
                    ))}
                    {orderItems.length === 0 && <span className="oh-no-items">Items not available</span>}
                  </div>

                  <div className="oh-divider" />

                  <div className="oh-card-footer">
                    <span className="oh-total">₹{Number(order.total_amount || 0).toFixed(0)}</span>
                    <button
                      className="oh-reorder-btn"
                      onClick={() => handleReorder(order)}
                      disabled={reordering === order.id}
                    >
                      {reordering === order.id ? "Adding..." : (
                        <>REORDER <ArrowIcon size={14} /></>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const CSS_TEXT = `
    .oh-page {
        min-height: 100vh;
        min-height: 100dvh;
        background: #f5f5f5;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        -webkit-font-smoothing: antialiased;
    }
    .oh-spinner {
        width: 32px; height: 32px;
        border: 3px solid #f3e8d8;
        border-top: 3px solid #f97316;
        border-radius: 50%;
        animation: oh-spin 0.7s linear infinite;
    }
    @keyframes oh-spin { to { transform: rotate(360deg); } }

    .oh-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        background: #fff;
        position: sticky;
        top: 0;
        z-index: 10;
        border-bottom: 1px solid #e5e7eb;
    }
    .oh-header h1 {
        font-size: 17px;
        font-weight: 800;
        color: #111827;
        margin: 0;
    }
    .oh-back-btn, .oh-refresh-btn {
        width: 36px; height: 36px;
        display: flex; align-items: center; justify-content: center;
        background: transparent;
        border: none;
        cursor: pointer;
        color: #374151;
        border-radius: 10px;
    }
    .oh-back-btn:active, .oh-refresh-btn:active { background: #f3f4f6; }

    .oh-content {
        max-width: 600px;
        margin: 0 auto;
        padding: 16px;
    }

    /* Empty */
    .oh-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        text-align: center;
    }
    .oh-empty-icon {
        width: 80px; height: 80px;
        background: #f3f4f6;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        margin-bottom: 20px;
    }
    .oh-empty h2 {
        font-size: 20px;
        font-weight: 800;
        color: #374151;
        margin: 0 0 8px;
    }
    .oh-empty p {
        font-size: 14px;
        color: #6b7280;
        margin: 0;
    }
    .oh-start-btn {
        margin-top: 24px;
        background: #f97316;
        color: #fff;
        border: none;
        padding: 14px 28px;
        border-radius: 14px;
        font-weight: 700;
        font-size: 15px;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(249,115,22,0.3);
    }

    /* Orders list */
    .oh-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    @keyframes oh-card-in {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .oh-card {
        background: #fff;
        border-radius: 18px;
        padding: 16px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.04);
        border: 1px solid rgba(0,0,0,0.04);
        animation: oh-card-in 0.35s ease-out forwards;
        opacity: 0;
    }

    .oh-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
    }
    .oh-rest-info {
        display: flex;
        gap: 12px;
        align-items: center;
        min-width: 0;
        flex: 1;
    }
    .oh-rest-img {
        width: 44px; height: 44px;
        border-radius: 10px;
        object-fit: cover;
        background: #f3f4f6;
        flex-shrink: 0;
    }
    .oh-rest-name {
        font-size: 15px;
        font-weight: 800;
        color: #1f2937;
        margin: 0 0 3px;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .oh-date {
        font-size: 11px;
        color: #9ca3af;
        font-weight: 500;
    }

    .oh-status-badge {
        padding: 4px 10px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 700;
        flex-shrink: 0;
        letter-spacing: 0.3px;
    }

    .oh-divider {
        height: 1px;
        background: #f3f4f6;
        margin: 12px 0;
    }

    .oh-items {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .oh-item-row {
        font-size: 13px;
        color: #374151;
        display: flex;
        gap: 6px;
    }
    .oh-item-qty {
        font-weight: 700;
        color: #6b7280;
        min-width: 22px;
    }
    .oh-item-name {
        font-weight: 500;
    }
    .oh-no-items {
        font-size: 12px;
        color: #9ca3af;
    }

    .oh-card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .oh-total {
        font-size: 16px;
        font-weight: 800;
        color: #1f2937;
    }
    .oh-reorder-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #fff7ed;
        color: #ea580c;
        border: none;
        padding: 10px 18px;
        border-radius: 12px;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
        letter-spacing: 0.3px;
        transition: all 0.2s;
    }
    .oh-reorder-btn:hover { background: #ffedd5; }
    .oh-reorder-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    /* Responsive */
    @media (max-width: 360px) {
        .oh-card { padding: 14px; }
        .oh-rest-img { width: 38px; height: 38px; }
        .oh-rest-name { font-size: 14px; }
    }
`;
