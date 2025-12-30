// pages/app/auth.js
import { useRouter } from "next/router";
import { useState } from "react";
import { getSupabase } from "../../services/supabase";

const DELIVERY_NEXT_KEY = "delivery.next_after_magiclink";

export default function CustomerAuthPage() {
  const supabase = getSupabase();
  const router = useRouter();

  const next =
    typeof router.query.next === "string" ? router.query.next : "/app";

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const sendMagicLink = async () => {
    setErr("");

    // Persist where to go after login
    if (typeof window !== "undefined") {
      localStorage.setItem(DELIVERY_NEXT_KEY, next);
    }

    // Clean callback URL (no querystring)
    const emailRedirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/app/auth/callback`
        : undefined;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    if (error) return setErr(error.message);
    setSent(true);
  };

  return (
    <div style={{ padding: 16, maxWidth: 420, margin: "0 auto" }}>
      <h2>Customer login</h2>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginBottom: 10 }}
      />

      <button onClick={sendMagicLink} style={{ width: "100%", padding: 10 }}>
        Send login link
      </button>

      {sent ? <p style={{ marginTop: 12 }}>Link sent. Check your email.</p> : null}
      {err ? <p style={{ color: "crimson" }}>{err}</p> : null}
    </div>
  );
}
