//pages/app/payment-success.js

import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function DeliveryPaymentSuccess() {
  const router = useRouter();
  const [status, setStatus] = useState("processing");
  const [message, setMessage] = useState("Processing your payment...");

  useEffect(() => {
    processPaymentReturn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processPaymentReturn = async () => {
    try {
      const pendingStr = localStorage.getItem("pending_delivery_order");
      if (!pendingStr) throw new Error("No pending delivery order found.");

      const pendingOrder = JSON.parse(pendingStr || "{}");
      if (!pendingOrder?.restaurant_id) throw new Error("Order data incomplete.");

      const session = JSON.parse(localStorage.getItem("delivery_payment_session") || "{}");

      setMessage("Creating your order on the server...");

      const response = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pendingOrder,
          payment_status: "completed",
          payment_details: {
            ...(pendingOrder.payment_details || {}),
            razorpay_payment_id: session.razorpay_payment_id || null,
            razorpay_signature: session.razorpay_signature || null,
          },
        }),
      });

      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Order creation failed: ${txt || response.statusText}`);
      }

      const result = await response.json();

      // Best-effort owner notification
      fetch("/api/notify-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: pendingOrder.restaurant_id,
          orderId: result.order_id ?? result.id,
          orderItems: pendingOrder.items || [],
        }),
      }).catch(() => {});

      // Cleanup local storage
      localStorage.removeItem("pending_delivery_order");
      localStorage.removeItem("delivery_payment_session");

      if (pendingOrder?.restaurant_id) {
        localStorage.removeItem(`cart_delivery_${pendingOrder.restaurant_id}`);
      }

      const paidAmount = String(pendingOrder.total_amount ?? "");
      try {
        sessionStorage.setItem("last_paid_amount", paidAmount);
      } catch {}

      const amt = encodeURIComponent(paidAmount || "");
      await router.replace(
        `/app/success?orderId=${encodeURIComponent(
          result.order_id ?? result.id
        )}&method=online&amt=${amt}`
      );
    } catch (error) {
      console.error("Delivery payment processing failed:", error);
      setStatus("error");
      setMessage(`Payment processing failed: ${error.message}`);
    }
  };

  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h2 style={{ marginBottom: 8 }}>Payment status</h2>
      <div style={{ color: "#6b7280" }}>{message}</div>

      {status === "error" ? (
        <div style={{ marginTop: 16 }}>
          <a href="/app" style={{ textDecoration: "underline" }}>
            Go back to Delivery Home
          </a>
        </div>
      ) : null}
    </div>
  );
}
