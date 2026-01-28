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

    // Explicitly hardcoded redirect to Address page (Bypassing env/dynamic logic for debugging)
    const emailRedirectTo = 'http://localhost:3000/app/address';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    setLoading(false);

    if (error) return setErr(error.message);
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-none">

        <AnimatePresence mode="wait">
          {!sent ? (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Logo & Header (Only visible in Form state) */}
              <div className="flex justify-center mb-8">
                <img src="/cafeqr-logo.svg" alt="CafeQR" className="h-16 w-auto" />
              </div>

              <div className="text-center mb-8">
                <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Welcome Back</h1>
                <p className="text-gray-500">Enter your email to sign in</p>
              </div>

              <form onSubmit={sendMagicLink} className="space-y-6">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all font-medium text-gray-900 placeholder-gray-400 bg-gray-50"
                    placeholder="you@example.com"
                  />
                </div>

                {err && (
                  <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg font-medium">
                    {err}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#f97316] text-white font-bold py-3.5 rounded-xl shadow-lg shadow-orange-200 hover:bg-orange-600 transition-all hover:shadow-orange-300 disabled:opacity-70 disabled:cursor-not-allowed"
                >
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
              className="text-center bg-green-50/80 backdrop-blur-md p-8 rounded-3xl border border-white/40 shadow-xl shadow-green-100/50"
            >
              <div className="flex justify-center mb-6 relative">
                <motion.div
                  animate={{
                    y: [-5, 5, -5],
                    rotate: [0, 5, 0, -5, 0]
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="relative"
                >
                  <Mail className="w-16 h-16 text-green-500" strokeWidth={1.5} />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-sm"
                  >
                    <Sparkles className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                  </motion.div>
                </motion.div>
              </div>

              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-xl font-bold text-gray-900 mb-2"
              >
                Check your email
              </motion.h3>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-slate-600 mb-8 font-medium leading-relaxed"
              >
                We sent a magic login link to<br />
                <span className="font-bold text-gray-900 bg-white/50 px-2 py-0.5 rounded-lg border border-green-100/50">{email}</span>
              </motion.p>

              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                whileHover="hover"
                whileTap="tap"
                variants={{
                  hover: { scale: 1.05 },
                  tap: { scale: 0.95 }
                }}
                onClick={() => setSent(false)}
                className="group flex items-center justify-center mx-auto bg-white border border-gray-200 text-[#f97316] hover:bg-[#f97316] hover:text-white hover:border-[#f97316] font-semibold text-sm mt-8 px-8 py-3 rounded-xl shadow-md hover:shadow-orange-200/50 transition-all duration-300 ease-in-out"
              >
                <motion.div
                  variants={{ hover: { x: -4 } }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="mr-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                </motion.div>

                <span>Try a different email</span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
