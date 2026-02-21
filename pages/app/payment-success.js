//pages/app/payment-success.js

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { getSupabase } from "../../services/supabase";

export default function DeliveryPaymentSuccess() {
  const router = useRouter();
  const supabase = getSupabase();
  const [status, setStatus] = useState("processing");
  const [message, setMessage] = useState("Processing your payment...");

  useEffect(() => {
    processPaymentReturn();
  }, []);

  const processPaymentReturn = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session found. Please re-login.");
      const token = session.access_token;

      const pendingStr = localStorage.getItem("pending_delivery_order");
      if (!pendingStr) throw new Error("No pending delivery order found.");

      const pendingOrder = JSON.parse(pendingStr || "{}");
      if (!pendingOrder?.restaurant_id) throw new Error("Order data incomplete.");

      const paymentSession = JSON.parse(localStorage.getItem("delivery_payment_session") || "{}");

      setMessage("Creating your order...");

      const payload = {
        ...pendingOrder,
        order_type: "delivery",
        payment_status: "completed",
        payment_details: {
          ...(pendingOrder.payment_details || {}),
          razorpay_payment_id: paymentSession.razorpay_payment_id || null,
          razorpay_signature: paymentSession.razorpay_signature || null,
        },
      };

      console.log("Antigravity Debug: Online Order Payload:", payload);

      const response = await fetch("/api/orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        console.error("Antigravity Debug: Database Error:", result.error || result, result.details, result.hint);
        throw new Error(result.error || "Order creation failed");
      }

      // Best-effort owner notification
      fetch("/api/notify-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: pendingOrder.restaurant_id,
          orderId: result.order_id ?? result.id,
          orderItems: pendingOrder.items || [],
        }),
      }).catch(() => { });

      // Cleanup local storage
      localStorage.removeItem("pending_delivery_order");
      localStorage.removeItem("delivery_payment_session");

      if (pendingOrder?.restaurant_id) {
        localStorage.removeItem(`cart_delivery_${pendingOrder.restaurant_id}`);
      }

      const paidAmount = String(pendingOrder.total_amount ?? "");
      try {
        sessionStorage.setItem("last_paid_amount", paidAmount);
      } catch { }

      const amt = encodeURIComponent(paidAmount || "");
      await router.replace(
        `/app/success?orderId=${encodeURIComponent(
          result.order_id ?? result.id
        )}&method=online&amt=${amt}`
      );
    } catch (error) {
      console.error("Delivery payment processing failed:", error);
      setStatus("error");
      setMessage(error.message || "Payment processing failed");
    }
  };

  return (
    <div className="payment-processing-page">
      <div className="processing-bg" />

      <motion.div
        className="processing-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
      >
        {status === "processing" ? (
          <>
            <motion.div
              className="icon-circle processing"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            >
              <Loader2 className="w-8 h-8 text-orange-500" />
            </motion.div>
            <h2 className="processing-title">Processing Payment</h2>
            <p className="processing-message">{message}</p>
            <div className="dots-loader">
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
              />
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
              />
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}
              />
            </div>
          </>
        ) : (
          <>
            <div className="icon-circle error">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="processing-title error-title">Something went wrong</h2>
            <p className="processing-message error-message">{message}</p>
            <Link href="/app/address" className="retry-btn">
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Delivery</span>
            </Link>
          </>
        )}
      </motion.div>

      <style jsx>{`
        .payment-processing-page {
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
        .processing-bg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 50%;
          background: linear-gradient(180deg, rgba(249, 115, 22, 0.05) 0%, transparent 100%);
          z-index: 0;
          pointer-events: none;
        }
        .processing-card {
          width: 100%;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #ffffff;
          border-radius: 24px;
          padding: 48px 32px;
          box-shadow: 
            0 4px 6px -1px rgba(0,0,0,0.1),
            0 10px 15px -3px rgba(0,0,0,0.1);
          border: 1px solid rgba(0,0,0,0.04);
          position: relative;
          z-index: 1;
          text-align: center;
        }
        .icon-circle {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
        }
        .icon-circle.processing {
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          border: 2px solid #fed7aa;
        }
        .icon-circle.error {
          background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
          border: 2px solid #fecaca;
        }
        .processing-title {
          font-size: 20px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 8px;
        }
        .error-title {
          color: #dc2626;
        }
        .processing-message {
          color: #6b7280;
          font-size: 14px;
          margin: 0;
          line-height: 1.5;
        }
        .error-message {
          color: #9ca3af;
          max-width: 280px;
        }
        .dots-loader {
          display: flex;
          gap: 6px;
          margin-top: 24px;
        }
        .dots-loader span {
          width: 8px;
          height: 8px;
          background: #f97316;
          border-radius: 50%;
        }
        .retry-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 24px;
          padding: 14px 24px;
          background: #f97316;
          color: #fff;
          text-decoration: none;
          border-radius: 14px;
          font-weight: 600;
          font-size: 15px;
          transition: all 0.2s ease;
        }
        .retry-btn:hover {
          background: #ea580c;
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
}
