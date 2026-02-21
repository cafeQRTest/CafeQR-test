//pages/app/success.js

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, ArrowRight, Package } from "lucide-react";
import { getSupabase } from "../../services/supabase";

export default function DeliverySuccess() {
  const router = useRouter();
  const supabase = getSupabase();
  const { orderId, method, amt } = router.query;

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);


  useEffect(() => {
    if (!orderId) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data: o } = await supabase
          .from("orders")
          .select("*")
          .eq("id", orderId)
          .single();

        setOrder(o || null);
      } catch {
        // keep UI simple even if fetch fails
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orderId, supabase]);



  const amount = Number(amt) || Number(order?.total_amount) || 0;
  const paymentLabel = method === "cod" ? "Cash on Delivery" : method === "online" ? "Paid Online" : method || "Pending";

  // Handle navigation - no print logic, just redirect
  const handleOrderAgain = () => {
    localStorage.setItem("delivery.next_after_magiclink", "/app/address");
    router.push("/app/address");
  };

  return (
    <div className="success-page">
      <div className="success-bg" />

      <div className="success-card">
        {/* Success Icon - Instant fade in */}
        <motion.div
          className="success-icon"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 12,
            delay: 0
          }}
        >
          <motion.div
            className="icon-circle"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 250, damping: 15, delay: 0.1 }}
          >
            <CheckCircle className="w-10 h-10 text-green-500" strokeWidth={2.5} />
          </motion.div>
        </motion.div>

        {/* Header - 0.3s delay */}
        <motion.div
          className="success-header"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.3 }}
        >
          <h1>Order Placed!</h1>
          <p>
            {loading
              ? "Loading order details..."
              : "Thank you! The restaurant has received your order."}
          </p>
        </motion.div>

        {/* Order Details Card - 0.3s delay */}
        <motion.div
          className="order-details"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.3 }}
        >
          <div className="detail-row order-id-row">
            <span className="detail-label">Order ID</span>
            <span className="detail-value order-id-value">{String(orderId || "")}</span>
          </div>
          <div className="divider" />
          <div className="detail-row">
            <span className="detail-label">Payment</span>
            <span className={`detail-value payment-badge ${method === "online" ? "paid" : "cod"}`}>
              {paymentLabel}
            </span>
          </div>
          <div className="divider" />
          <div className="detail-row total-row">
            <span className="detail-label">Total Amount</span>
            <span className="detail-value total-amount">₹{Number(amount || 0).toFixed(2)}</span>
          </div>
        </motion.div>

        {/* Info Message - 0.45s delay */}
        <motion.div
          className="info-message"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.45 }}
        >
          <Package className="w-4 h-4" />
          <span>You'll receive updates about your order shortly.</span>
        </motion.div>

        {/* Spacer for guaranteed gap */}
        <div className="button-spacer" />

        {/* CTA Button - 0.6s delay with shimmer */}
        <motion.div
          className="success-actions"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 80, damping: 12, delay: 0.6 }}
        >
          <motion.button
            onClick={handleOrderAgain}
            className={`success-btn mt-12`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span>Order Again</span>
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </div>

      <style jsx>{`
        .success-page {
          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          background: #f9fafb;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          position: relative;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .success-bg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 50%;
          background: linear-gradient(180deg, rgba(34, 197, 94, 0.06) 0%, transparent 100%);
          z-index: 0;
          pointer-events: none;
        }
        .success-card {
          width: 100%;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #ffffff;
          border-radius: 28px;
          padding: 44px 28px 68px;
          box-shadow: 
            0 4px 6px -1px rgba(0,0,0,0.08),
            0 10px 15px -3px rgba(0,0,0,0.1),
            0 25px 30px -5px rgba(0,0,0,0.05);
          border: 1px solid rgba(0,0,0,0.03);
          position: relative;
          z-index: 1;
        }
        .success-icon {
          margin-bottom: 28px;
        }
        .icon-circle {
          width: 88px;
          height: 88px;
          background: linear-gradient(145deg, #f0fdf4 0%, #dcfce7 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 
            0 6px 20px rgba(34, 197, 94, 0.25),
            inset 0 -2px 6px rgba(34, 197, 94, 0.1);
          border: 3px solid #86efac;
        }
        .success-header {
          text-align: center;
          margin-bottom: 28px;
        }
        .success-header h1 {
          font-size: 28px;
          font-weight: 800;
          color: #111827;
          margin: 0 0 10px;
          letter-spacing: -0.02em;
        }
        .success-header p {
          color: #6b7280;
          font-weight: 400;
          font-size: 15px;
          margin: 0;
          line-height: 1.5;
        }
        .order-details {
          width: 100%;
          background: #fafafa;
          border-radius: 18px;
          padding: 18px 22px;
          border: 1px solid #e5e7eb;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
        }
        .order-id-row {
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
        }
        .order-id-value {
          font-size: 13px;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          word-break: break-all;
          color: #374151;
          background: #f3f4f6;
          padding: 6px 10px;
          border-radius: 8px;
          width: 100%;
        }
        .detail-label {
          color: #6b7280;
          font-size: 14px;
          font-weight: 500;
        }
        .detail-value {
          font-weight: 600;
          color: #111827;
          font-size: 14px;
        }
        .payment-badge {
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        .payment-badge.paid {
          background: #dcfce7;
          color: #166534;
        }
        .payment-badge.cod {
          background: #fef3c7;
          color: #92400e;
        }
        .total-row {
          padding-top: 14px;
        }
        .total-amount {
          font-size: 20px;
          font-weight: 800;
          color: #111827;
        }
        .divider {
          height: 1px;
          background: #e5e7eb;
        }
        .info-message {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-top: 22px;
          margin-bottom: 0;
          padding: 14px 18px;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border-radius: 14px;
          color: #1d4ed8;
          font-size: 13px;
          font-weight: 500;
          width: 100%;
          border: 1px solid rgba(59, 130, 246, 0.15);
          text-align: center;
        }
        .button-spacer {
          height: 40px;
          width: 100%;
          flex-shrink: 0;
        }
        .success-actions {
          width: 100%;
          margin-top: 0;
          display: flex;
          justify-content: center;
        }
        .success-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 18px 48px;
          border-radius: 100px;
          font-weight: 700;
          font-size: 16px;
          color: #fff;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          border: none;
          cursor: pointer;
          box-shadow: 
            0 10px 25px rgba(249, 115, 22, 0.35),
            0 4px 10px rgba(249, 115, 22, 0.2);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }
        .success-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.3) 50%,
            transparent 100%
          );
          transition: none;
        }
        .success-btn.shimmer::before {
          animation: shimmerEffect 0.6s ease-out forwards;
        }
        @keyframes shimmerEffect {
          0% { left: -100%; }
          100% { left: 100%; }
        }

        @media (min-width: 640px) {
          .success-card {
            padding: 52px 40px 48px;
            max-width: 440px;
          }
          .success-header h1 {
            font-size: 32px;
          }
        }
      `}</style>
    </div>
  );
}
