// pages/forgot-password.js

import { useState } from "react";
import Link from "next/link";
import { getSupabase } from "../services/supabase";

function getBaseUrl() {
  // Preferred for production (set in Vercel): https://cafe-qr-app.vercel.app
  const env = process.env.NEXT_PUBLIC_BASE_URL;
  if (env && typeof env === "string") return env.replace(/\/$/, "");

  // Local/dev in browser
  if (typeof window !== "undefined") return window.location.origin;

  // SSR fallback
  return "http://localhost:3000";
}

export default function ForgotPassword() {
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState(""); // 'success', 'error'

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const redirectUrl = `${getBaseUrl()}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        console.error("Supabase Reset Password Error:", error);
        setMsgType("error");
        // If it's a 500, provide more context
        if (error.status === 500) {
          setMsg(`Error: ${error.message} (This is usually an SMTP or Configuration issue in Supabase Dashboard)`);
        } else {
          setMsg(`Error: ${error.message}`);
        }
      } else {
        setMsgType("success");
        setMsg("✅ If this email exists, a password reset link has been sent. Check your inbox and spam folder.");
        setEmail("");
      }
    } catch (err) {
      setMsgType("error");
      setMsg(`Error: ${err?.message || "An unexpected error occurred"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="mobile-card">
        <div className="header-graphic">
          <div className="circle-overlay" />
          <div className="header-content">
            <button className="back-btn" onClick={() => window.history.back()}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </div>
        </div>

        <div className="form-body">
          <form onSubmit={handleSubmit}>
            <h1 className="form-title">Reset Password</h1>

            <p className="instruction-text">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <div className="input-group">
              <input
                type="email"
                id="email"
                className={email ? "has-content" : ""}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder=" "
                disabled={loading}
              />
              <label htmlFor="email">Email Address</label>
            </div>

            {msg && <div className={`alert ${msgType}`}>{msg}</div>}

            <button type="submit" disabled={loading} className="submit-btn">
              {loading ? "SENDING..." : "SEND RESET LINK"}
            </button>

            <div className="login-link">
              <p>
                Remembered it? <Link href="/login">Sign In</Link>
              </p>
            </div>

            <div className="copyright-footer">&copy; 2026 ALL RIGHTS RESERVED</div>
          </form>
        </div>
      </div>

      <style jsx global>{`
        body { background: #e2e8f0; margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
      `}</style>

      {/* keep your existing styles unchanged */}
      <style jsx>{`
        .page-wrapper {
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          background: white; padding: 20px;
        }
        .mobile-card {
          width: 100%; max-width: 950px; height: 650px;
          background: white; border-radius: 32px;
          overflow: hidden; box-shadow: 0 40px 80px -20px rgba(0,0,0,0.2);
          display: flex; flex-direction: row;
        }
        .header-graphic {
          width: 45%; height: 100%;
          background: #f97316;
          position: relative; overflow: hidden;
        }
        .circle-overlay {
          position: absolute; top: -100px; right: -100px;
          width: 320px; height: 320px;
          background: #115e59; border-radius: 50%;
        }
        .header-content {
          position: relative; z-index: 2; padding: 60px 40px; height: 100%;
          display: flex; flex-direction: column; justify-content: center;
        }
        .back-btn {
          position: absolute; top: 30px; left: 30px;
          background: transparent; border: none; padding: 0; cursor: pointer;
        }
        .form-body {
          flex: 1; padding: 60px;
          display: flex; flex-direction: column; justify-content: center;
          background: white;
        }
        form { width: 100%; max-width: 360px; margin: 0 auto; }
        .form-title { display: none; }
        .instruction-text {
          font-size: 15px; color: #64748b; line-height: 1.5; margin-bottom: 32px;
        }
        .input-group { margin-bottom: 32px; position: relative; }
        .input-group input {
          display: block; width: 100%;
          padding: 12px 0;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 500;
          font-size: 16px;
          border: none; border-bottom: 2px solid #cbd5e1;
          background: transparent !important;
          border-radius: 0; color: #1e293b;
          outline: none; transition: all 0.2s;
          box-shadow: none !important;
        }
        .input-group input:focus { border-bottom-color: #f97316; }
        .input-group label {
          position: absolute; top: 12px; left: 0;
          font-size: 16px; color: #94a3b8;
          pointer-events: none; transition: all 0.2s ease;
        }
        .input-group input:focus + label,
        .input-group input:not(:placeholder-shown) + label,
        .input-group input.has-content + label {
          top: -8px; font-size: 12px; color: #115e59; font-weight: 600;
        }
        .submit-btn {
          width: 100%; padding: 16px;
          background: #115e59; color: white;
          border: none; border-radius: 12px;
          font-size: 14px; font-weight: 700;
          letter-spacing: 1px; cursor: pointer; text-transform: uppercase;
          box-shadow: 0 10px 20px -5px rgba(17, 94, 89, 0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .alert {
          font-size: 13px; border-radius: 8px;
          padding: 12px; margin-bottom: 24px; line-height: 1.4;
        }
        .alert.error { background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; }
        .alert.success { background: #f0fdf4; color: #15803d; border: 1px solid #dcfce7; }
        .login-link { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        .login-link a { color: #f97316; text-decoration: none; font-weight: 700; }
        .copyright-footer {
          text-align: center;
          margin-top: 40px;
          font-size: 12px;
          color: #94a3b8;
          letter-spacing: 1px;
          font-weight: 500;
        }
        @media (max-width: 900px) {
          .page-wrapper { padding: 0; align-items: flex-start; background: #fff; }
          .mobile-card {
            flex-direction: column; height: 100%; min-height: 100vh;
            max-width: none; border-radius: 0; box-shadow: none;
          }
          .header-graphic {
            width: 100%; height: 280px; flex: none;
            border-bottom-left-radius: 50px; border-bottom-right-radius: 50px;
          }
          .circle-overlay { top: -60px; right: -60px; width: 220px; height: 220px; }
          .header-content { justify-content: flex-start; padding-top: 60px; }
          .form-body { padding: 40px 30px; justify-content: flex-start; }
          form { max-width: none; margin: 0; }
        }
      `}</style>
    </div>
  );
}
