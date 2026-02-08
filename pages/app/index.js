// pages/app/index.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import LandingPage from "../../components/LandingPage";
import CafeQRLoader from "../../components/CafeQRLoader";
import { getSupabase } from "../../services/supabase";

export default function DeliveryAppHome() {
  const supabase = getSupabase();
  const router = useRouter();

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let unsub;

    const run = async () => {
      // 1) On cold start / relaunch: check existing session
      const { data } = await supabase.auth.getSession(); // [web:1867]
      const session = data?.session;

      if (session) {
        router.replace("/app/address"); // don’t keep /app/ in back stack [web:1866]
        return;
      }

      setChecking(false);

      // 2) If user signs in later, redirect immediately
      const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
        if (newSession) router.replace("/app/address"); // [web:1866]
      });
      unsub = sub?.subscription;
    };

    run();

    return () => {
      try { unsub?.unsubscribe?.(); } catch {}
    };
  }, [supabase, router]);

  if (checking) return <CafeQRLoader message="Checking session..." />;

  return <LandingPage />;
}


  return (
    // <div style={{ minHeight: "100vh", background: "#f8f9fa", paddingBottom: 84 }}>
    //   <header
    //     style={{
    //       background: "#fff",
    //       borderBottom: "1px solid #e5e7eb",
    //       padding: "14px 16px",
    //       position: "sticky",
    //       top: 0,
    //       zIndex: 10,
    //     }}
    //   >
    //     <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    //       <div style={{ flex: 1 }}>
    //         <div style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#111827" }}>
    //           CafeQR Delivery
    //         </div>
    //
    //         <Link
    //           href="/app/addresses"
    //           style={{
    //             display: "inline-flex",
    //             marginTop: 6,
    //             alignItems: "center",
    //             gap: 6,
    //             textDecoration: "none",
    //             color: "#111827",
    //             fontSize: 13,
    //             fontWeight: 700,
    //           }}
    //         >
    //           <span style={{ color: "#f59e0b" }}>Deliver to</span>
    //           <span style={{ color: "#6b7280", fontWeight: 700 }}>
    //             {topAddressText}
    //           </span>
    //           <span style={{ color: "#f59e0b", fontWeight: 900 }}>›</span>
    //         </Link>
    //       </div>
    //
    //       <Link
    //         href="/app/profile"
    //         style={{
    //           width: 40,
    //           height: 40,
    //           borderRadius: 999,
    //           border: "1px solid #e5e7eb",
    //           background: "#fff",
    //           display: "flex",
    //           alignItems: "center",
    //           justifyContent: "center",
    //           textDecoration: "none",
    //           color: "#111827",
    //           fontWeight: 900,
    //         }}
    //         aria-label="Profile"
    //         title="Profile"
    //       >
    //         ☺
    //       </Link>
    //     </div>
    //
    //     <input
    //       value={q}
    //       onChange={(e) => setQ(e.target.value)}
    //       placeholder="Search restaurants…"
    //       style={{
    //         marginTop: 12,
    //         width: "100%",
    //         padding: "12px 12px",
    //         borderRadius: 12,
    //         border: "1px solid #e5e7eb",
    //         outline: "none",
    //         background: "#f8f9fa",
    //       }}
    //     />
    //   </header>
    //
    //   <div style={{ padding: 16 }}>
    //     {loading ? (
    //       <div style={{ padding: 20, textAlign: "center" }}>Loading…</div>
    //     ) : filtered.length === 0 ? (
    //       <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
    //         No restaurants found.
    //       </div>
    //     ) : (
    //       <div style={{ display: "grid", gap: 12 }}>
    //         {filtered.map((r) => {
    //           const brand = r?.restaurant_profiles?.brand_color || "#f59e0b";
    //           return (
    //             <Link
    //               key={r.id}
    //               href={`/app/restaurant/${r.id}`}
    //               style={{
    //                 textDecoration: "none",
    //                 background: "#fff",
    //                 border: "1px solid #e5e7eb",
    //                 borderRadius: 14,
    //                 padding: 16,
    //                 display: "flex",
    //                 justifyContent: "space-between",
    //                 alignItems: "center",
    //               }}
    //             >
    //               <div>
    //                 <div style={{ fontWeight: 900, color: "#111827" }}>{r.name}</div>
    //                 <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
    //                   Tap to view menu
    //                 </div>
    //               </div>
    //               <div
    //                 style={{
    //                   background: brand,
    //                   color: "#fff",
    //                   padding: "8px 12px",
    //                   borderRadius: 999,
    //                   fontWeight: 900,
    //                   fontSize: 12,
    //                 }}
    //               >
    //                 Order
    //               </div>
    //             </Link>
    //           );
    //         })}
    //       </div>
    //     )}
    //   </div>
    //
    //   <BottomNav active="home" />
    // </div>
    <LandingPage />
  );
}

// function BottomNav({ active }) {
//   const itemStyle = (key) => ({
//     flex: 1,
//     textAlign: "center",
//     textDecoration: "none",
//     color: active === key ? "#f59e0b" : "#6b7280",
//     fontWeight: 900,
//     fontSize: 12,
//     padding: "10px 0",
//   });
//
//   return (
//     <div
//       style={{
//         position: "fixed",
//         left: 0,
//         right: 0,
//         bottom: 0,
//         background: "#fff",
//         borderTop: "1px solid #e5e7eb",
//         display: "flex",
//         height: 64,
//       }}
//     >
//       <Link href="/app" style={itemStyle("home")}>
//         Home
//       </Link>
//       <Link href="/app/addresses" style={itemStyle("addresses")}>
//         Addresses
//       </Link>
//       <Link href="/app/profile" style={itemStyle("profile")}>
//         Profile
//       </Link>
//     </div>
//   );
// }
