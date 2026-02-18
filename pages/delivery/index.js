// pages/delivery/index.js
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function DeliveryEntry() {
  const router = useRouter();
  const { r, name, phone, houseNo, street, loc, note } = router.query;

  useEffect(() => {
    if (!r) return;

    // Save incoming address details for later prefill in checkout
    if (typeof window !== "undefined") {
      try {
        const payload = {
          name: name ? String(name) : "",
          phone: phone ? String(phone) : "",
          houseNo: houseNo ? String(houseNo) : "",
          street: street ? String(street) : "",
          mapLocation: loc ? String(loc) : "",
          note: note ? String(note) : "",
        };
        localStorage.setItem("last_delivery_details", JSON.stringify(payload));
      } catch {}
    }

    // Continue to delivery menu (clean URL, no address params)
    router.replace(`/order?r=${encodeURIComponent(String(r))}&t=DELIVERY`);
  }, [r, name, phone, houseNo, street, loc, note, router]);

  return <div style={{ padding: 40, textAlign: "center" }}>Opening delivery menu…</div>;
}
