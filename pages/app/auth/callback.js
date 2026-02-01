import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getSupabase } from "../../../services/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, ArrowRight, Link as LinkIcon, RefreshCcw } from "lucide-react";

const DELIVERY_NEXT_KEY = "delivery.next_after_magiclink";

// Strictly use NEXT_PUBLIC_BASE_URL - must be set in .env.local or Vercel
function getBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    console.error("NEXT_PUBLIC_BASE_URL environment variable is not set!");
  }
  return baseUrl || '';
}

// Get the redirect destination, defaulting to /app/address
function getNextFromStorage() {
  try {
    return localStorage.getItem(DELIVERY_NEXT_KEY) || "/app/address";
  } catch {
    return "/app/address";
  }
}

// Build full redirect URL using environment variable
function buildRedirectUrl(path) {
  const baseUrl = getBaseUrl();
  // If path is already a full URL, return it; otherwise prepend base URL
  if (path.startsWith('http')) {
    return path;
  }
  return `${baseUrl}${path}`;
}

export default function AuthCallback() {
  const supabase = getSupabase();
  const router = useRouter();
  const [err, setErr] = useState("");
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);

        // Where to go after successful login - default to /app/address
        const nextPath = url.searchParams.get("next") || getNextFromStorage();
        const next = buildRedirectUrl(nextPath);

        // 1) Handle PKCE code flow (?code=...)
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setErr("Link Expired or Invalid Code");
            setProcessing(false);
            return;
          }

          localStorage.removeItem(DELIVERY_NEXT_KEY);
          window.location.replace(next);
          return;
        }

        // 2) Handle implicit flow (#access_token=...&refresh_token=...)
        const hash = (window.location.hash || "").replace(/^#/, "");
        const hashParams = new URLSearchParams(hash);

        const hashError = hashParams.get("error");

        if (hashError) {
          setErr("Link Expired");
          setProcessing(false);
          return;
        }

        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) {
            setErr(error.message);
            setProcessing(false);
            return;
          }

          // Clean up the URL (remove tokens from the address bar)
          window.history.replaceState({}, document.title, url.pathname + url.search);

          localStorage.removeItem(DELIVERY_NEXT_KEY);
          window.location.replace(next);
          return;
        }

        // If nothing found and not error, maybe wait or show error
        // If we are here, we have no code, no hash error, no tokens.
        // Wait briefly then show error if nothing happens (usually implies direct visit)
        setTimeout(() => {
          setErr("Invalid Magic Link");
          setProcessing(false);
        }, 1500);

      } catch (e) {
        setErr(e?.message || "Auth callback failed");
        setProcessing(false);
      }
    };

    if (supabase) run();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <AnimatePresence mode="wait">
        {err ? (
          <motion.div
            key="error-card"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-md bg-white rounded-3xl p-8 text-center shadow-xl shadow-gray-100 border border-gray-100"
          >
            <motion.div
              className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6"
              animate={{ x: [-5, 5, -5, 5, 0] }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <LinkIcon className="w-10 h-10 text-red-500 opacity-80" strokeWidth={2} />
              <div className="absolute bg-white rounded-full p-1 -bottom-1 -right-1 shadow-sm">
                <AlertCircle className="w-6 h-6 text-red-500 fill-white" />
              </div>
            </motion.div>

            <h1 className="text-2xl font-extrabold text-[#111827] mb-2">
              Link Expired
            </h1>

            <p className="text-gray-500 mb-8 leading-relaxed font-medium">
              For your security, magic links are only valid for 15 minutes. No worries, we can send you a new one.
            </p>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.replace('/app/auth')}
              className="w-full bg-[#FF5200] text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-200 hover:shadow-orange-300 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-5 h-5" />
              <span>Send New Magic Link</span>
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 border-4 border-[#FF5200]/20 border-t-[#FF5200] rounded-full animate-spin mb-6" />
            <h2 className="text-xl font-bold text-gray-800 animate-pulse">
              Signing you in...
            </h2>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
