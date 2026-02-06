// pages/app/orders/history.js

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Clock, ShoppingBag, ArrowRight as ArrowIcon, CheckCircle2, RefreshCw } from "lucide-react";
import { getSupabase } from "../../../services/supabase";
import { useCustomerAuth } from "../../../context/CustomerAuthContext";
import CafeQRLoader from "../../../components/CafeQRLoader";

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
  const { user, loading: authLoading, isLoggedIn } = useCustomerAuth();

  const [orders, setOrders] = useState([]);
  const [restaurants, setRestaurants] = useState({});
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      router.replace("/app/auth");
      return;
    }
    loadOrders();
  }, [authLoading, isLoggedIn, user?.id]);

  const loadOrders = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const { data: ordersData, error } = await supabase
        .from("orders")
        .select("*, items:order_items(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      console.log('Order Data:', ordersData);

      if (error) throw error;

      setOrders(ordersData || []);

      const restaurantIds = [...new Set((ordersData || []).map(o => o.restaurant_id).filter(Boolean))];
      if (restaurantIds.length > 0) {
        const { data: restaurantsData } = await supabase
          .from("restaurants")
          .select("id, name")
          .in("id", restaurantIds);

        const restaurantMap = {};
        (restaurantsData || []).forEach(r => {
          restaurantMap[r.id] = { name: r.name };
        });
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
      const existingCart = JSON.parse(localStorage.getItem(cartKey(order.restaurant_id)) || "[]");

      const newItems = (order.items || []).map(item => {
        // Use menu_item_id if available, otherwise fallback to id
        // We relax the UUID check to allow legacy or different ID formats
        const realId = item.menu_item_id || item.id;

        if (!realId) return null;

        return {
          id: `reorder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          menu_item_id: realId,
          name: item.item_name || item.name, // Handle DB field item_name
          displayName: item.item_name || item.name,
          price: item.price,
          quantity: item.quantity || 1,
          veg: item.veg ?? true, // order_items might not have veg flag, might need to fetch or defaulting is okay
          selectedVariant: (item.variant_option_id || item.variant_id) ? {
            variant_id: item.variant_option_id || item.variant_id,
            variant_name: item.variant_name,
          } : null,
        };
      }).filter(Boolean);

      if (newItems.length === 0) {
        alert("Unable to reorder items (items not found).");
        setReordering(null);
        return;
      }

      // Clear existing cart and set new items (overwrite)
      const finalCart = newItems;

      localStorage.setItem(cartKey(order.restaurant_id), JSON.stringify(finalCart));

      // Simulate delay for feedback
      await new Promise(r => setTimeout(r, 600));

      // Navigate to the specific restaurant menu page
      await router.push(`/app/restaurant/${order.restaurant_id}`);
    } catch (err) {
      console.error("Failed to reorder:", err);
      alert("Failed to add items to cart. Please try again.");
    } finally {
      setReordering(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).replace(' at', ',');
  };

  const getStatusDisplay = (status) => {
    const s = (status || "").toLowerCase();

    if (s === 'delivered' || s === 'completed') {
      return { text: 'Delivered', icon: <CheckCircle2 className="w-4 h-4 text-green-600" fill="#dcfce7" /> };
    }
    if (s === 'cancelled') return { text: 'Cancelled', icon: null, color: 'text-red-600' };

    return { text: s.charAt(0).toUpperCase() + s.slice(1), icon: null, color: 'text-orange-600' };
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    show: (i) => ({
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15,
        delay: i * 0.08,
      },
    }),
  };

  if (authLoading || loading) {
    return <CafeQRLoader message="Loading your orders..." />;
  }

  return (
    <div className="history-page">
      <div className="history-bg" />

      <motion.div
        className="history-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button className="back-btn" onClick={() => router.push("/app/restaurants")}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1>Past Orders</h1>
        <div className="header-spacer" />
      </motion.div>

      <div className="history-content">
        {orders.length === 0 ? (
          <motion.div
            className="empty-state"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="empty-icon">
              <ShoppingBag className="w-12 h-12 text-gray-300" />
            </div>
            <h2>No orders yet</h2>
            <p>Your food journey begins here</p>
            <button className="start-order-btn mt-8" onClick={() => router.push("/app/restaurants")}>
              Browse Restaurants
            </button>
          </motion.div>
        ) : (
          <div className="orders-list">
            <AnimatePresence>
              {orders.map((order, index) => {
                const rData = restaurants[order.restaurant_id] || {};
                const rName = order.restaurant_name || rData.name || "Restaurant";

                const { text: statusText, icon: statusIcon, color: statusColorClass } = getStatusDisplay(order.status);

                const imgIdx = (order.restaurant_id || "").charCodeAt(0) % STOCK_IMAGES.length;
                const imgUrl = STOCK_IMAGES[imgIdx || 0];

                const orderItems = Array.isArray(order.items) ? order.items : [];

                return (
                  <motion.div
                    key={order.id}
                    className="order-card"
                    variants={cardVariants}
                    initial="hidden"
                    animate="show"
                    custom={index}
                    layout
                  >
                    <div className="card-header">
                      <div className="rest-info-group">
                        <img src={imgUrl} alt="" className="rest-logo" />
                        <div className="rest-text">
                          <h3 className="rest-name">{rName}</h3>
                        </div>
                      </div>

                      <div className={`order-status ${statusColorClass || ''}`}>
                        <span>{statusText}</span>
                        {statusIcon}
                      </div>
                    </div>

                    <div className="card-divider" />

                    <div className="order-items-list">
                      {orderItems.map((item, idx) => (
                        <div key={idx} className="order-item-row">
                          <div className="item-qty-name">
                            <span className="item-qty">{item.quantity} x</span>
                            <span className="item-name">{item.item_name || item.name}</span>
                          </div>
                        </div>
                      ))}
                      {orderItems.length === 0 && <span className="text-gray-400 text-xs">Items not available</span>}
                    </div>

                    <div className="card-divider" />

                    <div className="action-row">
                      <motion.button
                        className="reorder-btn-full"
                        onClick={() => handleReorder(order)}
                        disabled={reordering === order.id}
                        whileTap={{ scale: 0.98 }}
                      >
                        {reordering === order.id ? (
                          <span>Adding...</span>
                        ) : (
                          <div className="btn-content">
                            <span>REORDER</span>
                            <ArrowIcon className="w-4 h-4 ml-1" />
                          </div>
                        )}
                      </motion.button>
                    </div>

                    <div className="card-footer-info">
                      <span>{formatDate(order.created_at)}</span>
                      <span>₹{Number(order.total_amount || 0).toFixed(0)}</span>
                    </div>

                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .history-page {
    min-height: 100vh;
    min-height: 100dvh;
    width: 100%;
    background: #f3f4f6;
    display: flex;
    flex-direction: column;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: #fff;
    position: sticky;
    top: 0;
    z-index: 10;
    border-bottom: 1px solid #e5e7eb;
  }
  .history-header h1 {
    font-size: 17px;
    font-weight: 700;
    color: #111827;
    margin: 0;
  }
  .back-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #374151;
  }
  .header-spacer { width: 36px; }

  .history-content {
    flex: 1;
    padding: 16px;
    max-width: 600px;
    width: 100%;
    margin: 0 auto;
  }

  .orders-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .order-card {
    background: #fff;
    border-radius: 16px;
    padding: 16px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .rest-info-group {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .rest-logo {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    object-fit: cover;
    background: #f3f4f6;
  }
  .rest-text {
    display: flex;
    flex-direction: column;
  }
  .rest-name {
    font-size: 15px;
    font-weight: 700;
    color: #111827;
    margin: 0;
    line-height: 1.2;
  }
  .order-status {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
  }

  .card-divider {
    height: 1px;
    background: #f3f4f6;
    margin: 12px -16px; 
  }

  .order-items-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
    padding-top: 12px;
  }
  .order-item-row {
    font-size: 13px;
    color: #374151;
  }
  .item-qty {
    font-weight: 600;
    color: #6b7280;
    margin-right: 6px;
  }

  .action-row {
    margin-top: 8px; /* Added spacing */
    margin-bottom: 12px;
  }
  .reorder-btn-full {
    width: 100%;
    background: #fff7ed;
    color: #ea580c;
    border: none;
    padding: 12px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: background 0.2s;
  }
  .reorder-btn-full:hover {
    background: #ffedd5;
  }
  .btn-content {
    display: flex;
    align-items: center;
    gap: 4px;
    letter-spacing: 0.03em;
  }

  .card-footer-info {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #9ca3af;
    font-weight: 500;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
  }
  .start-order-btn {
    padding: 12px 24px;
    background: #f97316;
    color: #fff;
    border-radius: 100px;
    font-weight: 600;
    border: none;
  }
`;
