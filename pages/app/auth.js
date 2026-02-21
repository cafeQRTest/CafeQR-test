// pages/app/auth.js
export const runtime = "edge";

import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { getSupabase } from "../../services/supabase";
import { ArrowLeft } from "lucide-react";

const DELIVERY_NEXT_KEY = "delivery.next_after_magiclink";

function getBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://cafe-qr-app.vercel.app';
}

export default function CustomerAuthPage() {
  const router = useRouter();

  const next =
    typeof router.query.next === "string" ? router.query.next : "/app/restaurants";

  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpToken, setOtpToken] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase(); // Initialize safely once inside the effect

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data?.session) {
        const nextUrl = localStorage.getItem(DELIVERY_NEXT_KEY);
        if (nextUrl) {
          localStorage.removeItem(DELIVERY_NEXT_KEY);
          router.replace(nextUrl);
        } else {
          // Already logged in, no explicit next, let's keep them here.
          setIsChecking(false);
        }
      } else {
        if (!cancelled) setIsChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const sendOtp = (e) => {
    e.preventDefault();
    setErr("");

    const supabase = getSupabase(); // Use localized singleton call

    // 1. Immediate UI Feedback: Move to next screen instantly
    setOtpSent(true);

    try {
      localStorage.setItem(DELIVERY_NEXT_KEY, next);
    } catch { }

    const baseUrl = getBaseUrl();
    const redirectTo = `${baseUrl}/app/auth/callback?next=${encodeURIComponent(next)}`;

    // 2. Fire and Forget the Async call
    supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
        data: {
          app_type: 'delivery',
        },
      },
    }).then(({ error }) => {
      if (error) {
        setOtpSent(false);
        setErr(error.message);
      }
    });
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    if (otpToken.length !== 8) {
      return setErr("Code must be 8 digits");
    }
    setErr("");
    setLoading(true);

    const supabase = getSupabase(); // localized usage

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpToken,
      type: 'email',
    });

    if (error) {
      setLoading(false);
      return setErr(error.message);
    }

    try {
      localStorage.removeItem(DELIVERY_NEXT_KEY);
    } catch { }

    router.replace(next);
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-[#FF5200]/20 border-t-[#FF5200] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="delivery-auth-page">
      <div className="delivery-auth-card">
        {!otpSent ? (
          <div>
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

              <button type="submit" className="delivery-auth-submit">
                Send Login Code
              </button>
            </form>
          </div>
        ) : (
          <div>
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
          </div>
        )}
      </div>

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
        }
      `}</style>
    </div>
  );
}
