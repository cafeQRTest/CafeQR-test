// pages/delivery/index.js
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function DeliveryEntry() {
  const router = useRouter();
  const { r } = router.query;

  useEffect(() => {
    if (!r) return;

    // Reuse existing QR menu page, but force table = DELIVERY
    router.replace(`/order?r=${encodeURIComponent(String(r))}&t=DELIVERY`);
  }, [r, router]);

  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      Opening delivery menu…
    </div>
  );
}
