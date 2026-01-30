// pages/app/auth.js
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { getSupabase } from "../../services/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Sparkles, ArrowLeft } from "lucide-react";

const DELIVERY_NEXT_KEY = "delivery.next_after_magiclink";

export default function CustomerAuthPage() {
  const supabase = getSupabase();
  const router = useRouter();

  const next =
    typeof router.query.next === "string" ? router.query.next : "/app/address";

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMagicLink = async (e) => {
    e.preventDefault(); // support form submit
    setErr("");
    setLoading(true);

    // Persist where to go after login
    if (typeof window !== "undefined") {
      localStorage.setItem(DELIVERY_NEXT_KEY, next);
    }

    // Strictly use NEXT_PUBLIC_BASE_URL - must be set in .env.local or Vercel
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      setErr("Configuration error: NEXT_PUBLIC_BASE_URL environment variable is not set");
      setLoading(false);
      return;
    }
    const emailRedirectTo = `${baseUrl}/app/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    setLoading(false);

    if (error) return setErr(error.message);
    setSent(true);
  };

  return (
    <div className="delivery-auth-page">
      <div className="delivery-auth-card">

        <AnimatePresence mode="wait">
          {!sent ? (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Logo & Header */}
              <div className="delivery-auth-logo">
                <img src="/cafeqr-logo.svg" alt="CafeQR" />
              </div>

              <div className="delivery-auth-header">
                <h1>Welcome Back</h1>
                <p>Enter your email to sign in</p>
              </div>

              <form onSubmit={sendMagicLink} className="delivery-auth-form">
                <div>
                  <label htmlFor="email">Email Address</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>

                {err && (
                  <div className="delivery-auth-error">{err}</div>
                )}

                <button type="submit" disabled={loading} className="delivery-auth-submit">
                  {loading ? 'Sending Link...' : 'Send Login Link'}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="delivery-auth-sent"
            >
              <div className="delivery-auth-sent-icon">
                <motion.div
                  animate={{ y: [-5, 5, -5], rotate: [0, 5, 0, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Mail className="w-16 h-16 text-green-500" strokeWidth={1.5} />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="sparkle-badge"
                  >
                    <Sparkles className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                  </motion.div>
                </motion.div>
              </div>

              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                Check your email
              </motion.h3>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                We sent a magic login link to<br />
                <span className="email-highlight">{email}</span>
              </motion.p>

              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSent(false)}
                className="delivery-auth-back-btn"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                <span>Try a different email</span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Scoped styles - ONLY affects this delivery auth page */}
      <style jsx>{`
        .delivery-auth-page {
          min-height: 100vh;
          width: 100%;
          max-width: none;
          background: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .delivery-auth-card {
          width: 100%;
          max-width: 400px;
          background: #fff;
          padding: 32px;
          border-radius: 16px;
        }
        .delivery-auth-logo {
          display: flex;
          justify-content: center;
          margin-bottom: 32px;
        }
        .delivery-auth-logo img {
          height: 48px;
          width: auto;
        }
        .delivery-auth-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .delivery-auth-header h1 {
          font-size: 24px;
          font-weight: 800;
          color: #111827;
          margin: 0 0 8px;
        }
        .delivery-auth-header p {
          color: #6b7280;
          margin: 0;
        }
        .delivery-auth-form {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .delivery-auth-form label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 8px;
        }
        .delivery-auth-form input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          font-size: 16px;
          outline: none;
          background: #f9fafb;
          transition: all 0.2s;
        }
        .delivery-auth-form input:focus {
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249,115,22,0.1);
        }
        .delivery-auth-error {
          padding: 12px;
          background: #fef2f2;
          color: #dc2626;
          font-size: 14px;
          border-radius: 8px;
        }
        .delivery-auth-submit {
          width: 100%;
          background: #f97316;
          color: #fff;
          font-weight: 700;
          padding: 14px;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(249,115,22,0.3);
          transition: all 0.2s;
        }
        .delivery-auth-submit:hover {
          background: #ea580c;
        }
        .delivery-auth-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .delivery-auth-sent {
          text-align: center;
          background: rgba(240,253,244,0.8);
          padding: 32px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.4);
        }
        .delivery-auth-sent-icon {
          display: flex;
          justify-content: center;
          margin-bottom: 24px;
          position: relative;
        }
        .delivery-auth-sent-icon > div {
          position: relative;
        }
        .sparkle-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          background: #fff;
          border-radius: 50%;
          padding: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .delivery-auth-sent h3 {
          font-size: 20px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 8px;
        }
        .delivery-auth-sent p {
          color: #475569;
          margin: 0 0 32px;
          line-height: 1.6;
        }
        .email-highlight {
          font-weight: 700;
          color: #111827;
          background: rgba(255,255,255,0.5);
          padding: 2px 8px;
          border-radius: 6px;
        }
        .delivery-auth-back-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #fff;
          border: 1px solid #e5e7eb;
          color: #f97316;
          font-weight: 600;
          font-size: 14px;
          padding: 12px 24px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .delivery-auth-back-btn:hover {
          background: #f97316;
          color: #fff;
          border-color: #f97316;
        }
      `}</style>
    </div>
  );
}
