// pages/app/auth/callback.js
import { useEffect, useState } from "react";
import { getSupabase } from "../../../services/supabase";

const DELIVERY_NEXT_KEY = "delivery.next_after_magiclink";

function getNextFromStorage() {
  try {
    return localStorage.getItem(DELIVERY_NEXT_KEY) || "/app";
  } catch {
    return "/app";
  }
}

export default function AuthCallback() {
  const supabase = getSupabase();
  const [err, setErr] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);

        // Where to go after successful login
        const next = url.searchParams.get("next") || getNextFromStorage();

        // 1) Handle PKCE code flow (?code=...)
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) return setErr(error.message);

          localStorage.removeItem(DELIVERY_NEXT_KEY);
          window.location.replace(next);
          return;
        }

        // 2) Handle implicit flow (#access_token=...&refresh_token=...)
        const hash = (window.location.hash || "").replace(/^#/, "");
        const hashParams = new URLSearchParams(hash);

        const hashError = hashParams.get("error");
        const hashErrorDesc =
          hashParams.get("error_description") || hashParams.get("error_code");

        if (hashError) {
          // example: otp_expired
          setErr(hashErrorDesc || hashError);
          return;
        }

        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) return setErr(error.message);

          // Clean up the URL (remove tokens from the address bar)
          window.history.replaceState({}, document.title, url.pathname + url.search);

          localStorage.removeItem(DELIVERY_NEXT_KEY);
          window.location.replace(next);
          return;
        }

        setErr(
          "No auth code or session found. Ensure Magic Link template uses {{ .ConfirmationURL }} and the Redirect URL is allowed."
        );
      } catch (e) {
        setErr(e?.message || "Auth callback failed");
      }
    };

    run();
  }, [supabase]);

  return (
    <div style={{ padding: 16 }}>
      <h3>Signing you in…</h3>
      {err ? <p style={{ color: "crimson" }}>{err}</p> : null}
    </div>
  );
}
