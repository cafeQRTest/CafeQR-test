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
  const [otpSent, setOtpSent] = useState(false);
  const [otpToken, setOtpToken] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const sendOtp = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
    });

    setLoading(false);

    if (error) return setErr(error.message);
    setOtpSent(true);
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    if (otpToken.length !== 8) {
      return setErr("Code must be 8 digits");
    }
    setErr("");
    setLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpToken,
      type: 'email',
    });

    if (error) {
      setLoading(false);
      return setErr(error.message);
    }

    router.push("/app/address");
  };

  return (
    <div className="delivery-auth-page">
      <div className="delivery-auth-card">

        <AnimatePresence mode="wait">
          {!otpSent ? (
            <motion.div
              key="email-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="delivery-auth-logo">
                <img src="/cafeqr-logo.svg" alt="CafeQR" />
              </div>

              <div className="delivery-auth-header">
                <h1>Welcome Back</h1>
                <p>Enter your email to sign in</p>
              </div>

              <form onSubmit={sendOtp} className="delivery-auth-form">
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

                {err && <div className="delivery-auth-error">{err}</div>}

                <button type="submit" disabled={loading} className="delivery-auth-submit">
                  {loading ? 'Sending Code...' : 'Send Login Code'}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="otp-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="delivery-auth-logo">
                <img src="/cafeqr-logo.svg" alt="CafeQR" />
              </div>

              <div className="delivery-auth-header">
                <h1>Verify Code</h1>
                <p>Enter the 8-digit code sent to<br /><span className="font-bold text-gray-800">{email}</span></p>
              </div>

              <form onSubmit={verifyOtp} className="delivery-auth-form">
                <div>
                  <label htmlFor="otp">Enter Code</label>
                  <input
                    id="otp"
                    type="text"
                    required
                    value={otpToken}
                    onChange={(e) => setOtpToken(e.target.value)}
                    placeholder="12345678"
                    className="text-center tracking-widest text-xl"
                    maxLength={8}
                  />
                </div>

                {err && <div className="delivery-auth-error">{err}</div>}

                <button type="submit" disabled={loading || otpToken.length !== 8} className="delivery-auth-submit">
                  {loading ? 'Verifying...' : 'Verify & Login'}
                </button>

                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="delivery-auth-back-btn w-full mt-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  <span>Use a different email</span>
                </button>
              </form>
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
