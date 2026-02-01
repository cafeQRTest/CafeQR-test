//pages/app/orders/history.js

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Clock, MapPin, ChevronRight, Package, RefreshCw, ShoppingBag } from "lucide-react";
import { getSupabase } from "../../../services/supabase";
import { useCustomerAuth } from "../../../context/CustomerAuthContext";

const cartKey = (restaurantId) => `cart_delivery_${restaurantId}`;

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
      // Fetch orders for the current user, sorted by newest first
      const { data: ordersData, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      setOrders(ordersData || []);

      // Fetch restaurant names if not present in order object
      const restaurantIds = [...new Set((ordersData || []).filter(o => !o.restaurant_name).map(o => o.restaurant_id).filter(Boolean))];
      if (restaurantIds.length > 0) {
        const { data: restaurantsData } = await supabase
          .from("restaurants")
          .select("id, name")
          .in("id", restaurantIds);

        const restaurantMap = {};
        (restaurantsData || []).forEach(r => {
          restaurantMap[r.id] = r.name;
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
    // ... existing handleReorder logic ...
    // Keeping this function body unchanged for brevity in this replacement block as the user only asked for layout/data changes
    if (!order?.restaurant_id || !order?.items) return;

    setReordering(order.id);

    try {
      const existingCart = JSON.parse(localStorage.getItem(cartKey(order.restaurant_id)) || "[]");
      // Add order items to cart
      const newItems = (order.items || []).map(item => ({
        id: `reorder_${Date.now()}_${Math.random()}`, // Unique cart ID to avoid key conflicts
        menu_item_id: item.menu_item_id || item.id, // Persist the REAL UUID for backend lookup
        name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
        veg: item.veg ?? true,
        selectedVariant: item.variant_id ? {
          variant_id: item.variant_id,
          variant_name: item.variant_name,
        } : null,
      }));

      const mergedCart = [...existingCart];
      newItems.forEach(newItem => {
        const existingIndex = mergedCart.findIndex(
          c => c.id === newItem.id && (!c.selectedVariant?.variant_id || c.selectedVariant?.variant_id === newItem.selectedVariant?.variant_id)
        );
        if (existingIndex >= 0) {
          mergedCart[existingIndex].quantity += newItem.quantity;
        } else {
          mergedCart.push(newItem);
        }
      });

      localStorage.setItem(cartKey(order.restaurant_id), JSON.stringify(mergedCart));
      await router.push(`/app/restaurants?r=${order.restaurant_id}`);
    } catch (err) {
      console.error("Failed to reorder:", err);
      alert("Failed to add items to cart. Please try again.");
    } finally {
      setReordering(null);
    }
  };

  const formatDate = (dateStr) => {
    // ... existing formatDate ...
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusColor = (status) => {
    // ... existing getStatusColor ...
    switch (status?.toLowerCase()) {
      case "delivered":
      case "completed":
        return { bg: "#dcfce7", color: "#166534" };
      case "preparing":
      case "in_progress":
        return { bg: "#fef3c7", color: "#92400e" };
      case "cancelled":
        return { bg: "#fee2e2", color: "#dc2626" };
      case "new":
      case "pending":
      default:
        return { bg: "#e0e7ff", color: "#4338ca" };
    }
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
    return (
      <div className="history-page">
        <div className="history-loading">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          >
            <RefreshCw className="w-6 h-6 text-orange-500" />
          </motion.div>
          <span>Loading your orders...</span>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="history-bg" />

      {/* Header */}
      <motion.div
        className="history-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
      >
        <button className="back-btn" onClick={() => router.push("/app/restaurants")}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1>Order History</h1>
        <div className="header-spacer" />
      </motion.div>

      {/* Orders List */}
      <div className="history-content">
        {orders.length === 0 ? (
          <motion.div
            className="empty-state"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="empty-icon">
              <ShoppingBag className="w-12 h-12 text-gray-400" />
            </div>
            <h2>No orders yet</h2>
            <p>Your order history will appear here once you place your first order.</p>
            <button className="start-order-btn mt-12" onClick={() => router.push("/app/restaurants")}>
              Start Ordering
            </button>
          </motion.div>
        ) : (
          <div className="orders-list">
            <AnimatePresence>
              {orders.map((order, index) => {
                const statusStyle = getStatusColor(order.status);
                const restaurantName = order.restaurant_name || restaurants[order.restaurant_id] || "Restaurant";
                const displayId = order.id ? `#${order.id.slice(0, 8)}` : "#Pending";

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
                    <div className="order-main">
                      {/* Top Section: Restaurant Name in Bold */}
                      <div className="order-header">
                        <h3 className="restaurant-name">{restaurantName}</h3>
                        <div
                          className="status-badge"
                          style={{ background: statusStyle.bg, color: statusStyle.color }}
                        >
                          {order.status || "Pending"}
                        </div>
                      </div>

                      {/* Middle Section: Order ID + Total Amount */}
                      <div className="order-mid-section">
                        <span className="order-id-pill">{displayId}</span>
                        <span className="order-amount">₹{Number(order.total_amount || 0).toFixed(2)}</span>
                      </div>

                      {/* Footer: Date and Reorder */}
                      <div className="order-footer">
                        <div className="order-date">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(order.created_at)}</span>
                        </div>
                        <motion.button
                          className="reorder-btn"
                          onClick={() => handleReorder(order)}
                          disabled={reordering === order.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {reordering === order.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Package className="w-3 h-3" />
                              <span>Re-order</span>
                            </>
                          )}
                        </motion.button>
                      </div>
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
    background: #f9fafb;
    display: flex;
    flex-direction: column;
    font-family: system-ui, -apple-system, sans-serif;
    position: relative;
  }
  .history-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 200px;
    background: linear-gradient(180deg, rgba(249, 115, 22, 0.06) 0%, transparent 100%);
    z-index: 0;
    pointer-events: none;
  }
  .history-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: #6b7280;
    font-size: 15px;
  }
  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .history-header h1 {
    font-size: 18px;
    font-weight: 700;
    color: #111827;
    margin: 0;
  }
  .back-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f4f6;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    color: #374151;
    transition: all 0.2s ease;
  }
  .back-btn:hover {
    background: #e5e7eb;
  }
  .header-spacer {
    width: 40px;
  }
  .history-content {
    flex: 1;
    padding: 20px;
    max-width: 480px;
    width: 100%;
    margin: 0 auto;
    position: relative;
    z-index: 1;
  }
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 20px;
    background: #fff;
    border-radius: 24px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08);
    margin-top: 40px;
  }
  .empty-icon {
    width: 80px;
    height: 80px;
    background: #f3f4f6;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
  }
  .empty-state h2 {
    font-size: 20px;
    font-weight: 700;
    color: #111827;
    margin: 0 0 8px;
  }
  .empty-state p {
    color: #6b7280;
    font-size: 14px;
    margin: 0 0 40px;
    max-width: 260px;
  }
  .start-order-btn {
    padding: 14px 32px;
    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
    color: #fff;
    border: none;
    border-radius: 100px;
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
    box-shadow: 0 6px 16px rgba(249, 115, 22, 0.3);
    transition: all 0.2s ease;
  }
  .start-order-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(249, 115, 22, 0.35);
  }
  .orders-list {
    display: flex;
    flex-direction: column;
    gap: 40px;
  }
  .order-card {
    background: #fff;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 
      0 2px 4px rgba(0,0,0,0.04),
      0 4px 8px rgba(0,0,0,0.06);
    border: 1px solid rgba(0,0,0,0.04);
  }
  .order-main {
    padding: 24px;
  }
  .order-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  .restaurant-name {
    font-size: 16px;
    font-weight: 800;
    color: #111827;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .status-badge {
    padding: 6px 14px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .order-mid-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #f9fafb;
    padding: 12px 16px;
    border-radius: 12px;
    margin-bottom: 40px;
  }
  .order-id-pill {
    background: #fff;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-family: 'SF Mono', 'Monaco', monospace;
    color: #6b7280;
    font-weight: 600;
    border: 1px solid #e5e7eb;
  }
  .order-amount {
    font-size: 18px;
    font-weight: 800;
    color: #111827;
  }
  .order-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .order-date {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #9ca3af;
    font-size: 13px;
    font-weight: 500;
  }
  .reorder-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: #ffffff;
    color: #ea580c;
    border: 1px solid #ea580c;
    border-radius: 100px;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .reorder-btn:hover {
    background: #fff7ed;
  }
  .reorder-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (min-width: 640px) {
    .history-content {
      padding: 32px 20px;
    }
    .order-card {
      border-radius: 24px;
    }
    .order-main {
      padding: 28px;
    }
  }
`;
