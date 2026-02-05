// pages/reset-password.js

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getSupabase } from "../services/supabase";

export default function ResetPassword() {
  const router = useRouter();
  const supabase = getSupabase();

  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [ready, setReady] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);

  // legacy tokens (only used if link comes with #access_token=...)
  const [legacyTokens, setLegacyTokens] = useState({
    access_token: "",
    refresh_token: "",
  });

  useEffect(() => {
    if (!router.isReady) return;
    if (typeof window === "undefined") return;

    let unsub = null;
    let alive = true;

    const run = async () => {
      try {
        setMsg("");
        setErrorInfo(null);

        const url = new URL(window.location.href);

        // 0) If Supabase redirected with an error, show it.
        const queryErr = url.searchParams.get("error");
        if (queryErr) {
          const desc = url.searchParams.get("error_description") || "Email link is invalid or has expired.";
          if (alive) setErrorInfo({ description: desc });
          return;
        }

        const hash = (window.location.hash || "").replace(/^#/, "");
        const hashParams = new URLSearchParams(hash);

        const hashErr = hashParams.get("error");
        if (hashErr) {
          const desc = hashParams.get("error_description") || "Email link is invalid or has expired.";
          if (alive) setErrorInfo({ description: desc });
          return;
        }

        // 1) Legacy implicit flow: if tokens exist in hash, set session manually
        const access_token = hashParams.get("access_token") || "";
        const refresh_token = hashParams.get("refresh_token") || "";
        const type = hashParams.get("type") || "";

        if (access_token && (type === "recovery" || !type)) {
          setLegacyTokens({ access_token, refresh_token });

          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token: refresh_token || undefined,
          });

          if (sessionError) {
            if (alive) setErrorInfo({ description: sessionError.message });
            return;
          }

          // Clean URL (remove tokens)
          window.history.replaceState({}, document.title, url.pathname + url.search);
          if (alive) setReady(true);
          return;
        }

        // 2) PKCE flow: URL will have ?code=...
        // IMPORTANT: Do NOT call exchangeCodeForSession here because your client has detectSessionInUrl: true,
        // so Supabase will auto-exchange the code. [page:4]
        //
        // We just wait for session to appear.
        const { data: s1 } = await supabase.auth.getSession();
        if (s1?.session) {
          // Optional: clean the URL (remove ?code=... if still present)
          if (url.searchParams.get("code")) {
            url.searchParams.delete("code");
            window.history.replaceState(
              {},
              document.title,
              url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "")
            );
          }
          if (alive) setReady(true);
          return;
        }

        // Subscribe briefly; auto-exchange may complete after a tick
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (!alive) return;
          if (session && (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY")) {
            // Optional: clean ?code
            const u = new URL(window.location.href);
            if (u.searchParams.get("code")) {
              u.searchParams.delete("code");
              window.history.replaceState(
                {},
                document.title,
                u.pathname + (u.searchParams.toString() ? `?${u.searchParams.toString()}` : "")
              );
            }
            setReady(true);
          }
        });
        unsub = data?.subscription;

        // If after a short time we still don’t have a session, treat as invalid/expired.
        setTimeout(async () => {
          if (!alive) return;
          const { data: s2 } = await supabase.auth.getSession();
          if (!s2?.session && !ready) {
            setErrorInfo({
              description:
                "Email link is invalid or has expired. Please request a new reset link (and open it in the same browser where you requested it).",
            });
          }
        }, 2000);
      } catch (e) {
        if (alive) setErrorInfo({ description: e?.message || "Reset link handling failed." });
      }
    };

    run();

    return () => {
      alive = false;
      try {
        unsub?.unsubscribe?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const onSubmit = async (e) => {
    e.preventDefault();

    if (newPw.length < 6) return setMsg("❌ Password must be ≥6 characters.");
    if (newPw !== confirmPw) return setMsg("❌ Passwords do not match.");

    setLoading(true);
    setMsg("");

    try {
      // By the time user sees the form, we have a valid session (either auto PKCE or legacy setSession).
      const { error: updateError } = await supabase.auth.updateUser({ password: newPw });
      if (updateError) {
        setMsg(`❌ ${updateError.message}`);
        return;
      }

      setMsg("✅ Password updated successfully! Redirecting to login...");

      try {
        await supabase.auth.signOut();
      } catch {}

      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setMsg(`❌ ${err?.message || "An error occurred"}`);
    } finally {
      setLoading(false);
    }
  };

  if (errorInfo) {
    return (
      <div style={{ padding: "2rem", maxWidth: 800, margin: "auto" }}>
        <h1>Reset Password</h1>
        <div
          style={{
            padding: "15px",
            backgroundColor: "#ffe6e6",
            border: "1px solid #ff0000",
            borderRadius: "4px",
            color: "#cc0000",
            marginBottom: "20px",
          }}
        >
          ❌ {errorInfo.description}
        </div>
        <Link href="/forgot-password" style={{ color: "#0070f3", textDecoration: "underline" }}>
          ← Request a new reset link
        </Link>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ padding: "2rem", maxWidth: 800, margin: "auto", textAlign: "center" }}>
        <h1>Reset Password</h1>
        <p>⏳ Verifying your reset link...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 800, margin: "auto" }}>
      <h1>Reset Password</h1>
      <form onSubmit={onSubmit}>
        <input
          type="password"
          placeholder="New password (min 6 characters)"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          required
          minLength={6}
          style={{ display: "block", width: "100%", padding: 8, marginBottom: 12, boxSizing: "border-box" }}
          disabled={loading}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          required
          minLength={6}
          style={{ display: "block", width: "100%", padding: 8, marginBottom: 12, boxSizing: "border-box" }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.75rem 1.5rem",
            width: "100%",
            backgroundColor: "#f97316",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "⏳ Updating…" : "Reset Password"}
        </button>
      </form>

      {msg && (
        <div
          style={{
            marginTop: 12,
            padding: "10px",
            backgroundColor: msg.includes("✅") ? "#e6ffe6" : "#ffe6e6",
            border: `1px solid ${msg.includes("✅") ? "#00aa00" : "#ff0000"}`,
            borderRadius: "4px",
            color: msg.includes("✅") ? "#006600" : "#cc0000",
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
