import { useState, useRef } from 'react'
import Link from 'next/link'
import { getSupabase } from '../services/supabase'
import { useRouter } from 'next/router'
import { FaEye, FaEyeSlash } from 'react-icons/fa'

export default function SignupPage() {
  const supabase = getSupabase()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const passwordRef = useRef(null)

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase.auth.signUp({ email, password })
    setLoading(false)

    if (error) {
      const msg = error.message.toLowerCase().includes('already')
        ? (
          <span>
            This email is already registered. Please{' '}
            <Link href="/login" className="link-action">
              log in
            </Link>{' '}
            instead.
          </span>
        )
        : 'Error: ' + error.message
      setMessage(msg)
      passwordRef.current?.focus()
      return
    }

    setMessage(
      'Account created! A confirmation link has been sent to your email. Please verify to continue.'
    )
  }

  return (
    <div className="login-wrapper">
      <div className="ambient-glow" />
      <div className="split-card">
        
        {/* Left Side: Form */}
        <div className="form-side">
          <div className="form-content">
            <h1 className="title">Get Started <span className="wave">🚀</span></h1>
            <p className="subtitle">
              Join thousands of restaurants managing their business with us.
              Create your account today.
            </p>

            <form onSubmit={handleSignup}>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="owner@restaurant.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <div className="password-wrapper">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password (min 6 chars)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button 
                    type="button" 
                    className="toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              {message && (
                  <div className={`alert ${typeof message === 'string' && message.startsWith('Error') ? 'error' : 'success'}`}>
                    {message}
                  </div>
              )}

              <button type="submit" disabled={loading} className="signin-btn">
                {loading ? 'Creating Account...' : 'Sign Up'}
              </button>
            </form>

            <div className="divider"><span>Or</span></div>

            <div className="social-login">
              <button className="social-btn google" disabled>
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" width="20" />
                Sign up with Google
              </button>
              <button className="social-btn facebook" disabled>
                <img src="https://www.svgrepo.com/show/475647/facebook-color.svg" alt="Facebook" width="20" />
                Sign up with Facebook
              </button>
            </div>

            <p className="signup-text">
              Already have an account? <Link href="/login">Login here</Link>
            </p>
            
            <p className="copyright">© 2026 ALL RIGHTS RESERVED</p>
          </div>
        </div>

        {/* Right Side: Image */}
        <div className="image-side">
           {/* Reusing the login background for consistency */}
        </div>
        
      </div>

      <style jsx global>{`
        body { background: #0f172a; margin: 0; font-family: 'Inter', sans-serif; }
      `}</style>
      
      <style jsx>{`
        .login-wrapper {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: #0f172a;
          position: relative;
          overflow: hidden;
        }

        .ambient-glow {
          position: absolute;
          width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(249, 115, 22, 0.08) 0%, transparent 70%);
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: 0;
        }

        .split-card {
           position: relative;
           z-index: 1;
          display: flex;
          width: 100%;
          max-width: 850px;
          min-height: 520px;
          background: #ffffff;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 50px 100px -20px rgba(0,0,0,0.5);
        }

        .form-side {
          flex: 1;
          padding: 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .image-side {
          flex: 1;
          background-image: url('/login-bg.png'); /* Shared Asset */
          background-size: cover;
          background-position: center;
          position: relative;
          min-height: 300px;
        }

        .title {
          font-size: 26px;
          font-weight: 800;
          color: #1e293b;
          margin: 0 0 8px;
        }
        .subtitle {
          font-size: 14px;
          color: #64748b;
          line-height: 1.5;
          margin: 0 0 24px;
        }
        .wave { animation: bounce 2s infinite; display: inline-block; }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

        .form-group { margin-bottom: 16px; }
        .form-group label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          margin-bottom: 6px;
        }
        .password-wrapper { position: relative; }
        .form-group input {
          width: 100%;
          padding: 12px;
          padding-right: 40px;
          border-radius: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          font-size: 14px;
          color: #1e293b;
          outline: none;
          transition: all 0.2s;
          box-sizing: border-box;
        }
        .form-group input:focus {
          border-color: #f97316; 
          background: #fff;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }

        .toggle-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 4px;
        }
        .toggle-btn:hover { color: #64748b; }

        .alert {
          padding: 12px; margin-bottom: 20px;
          border-radius: 8px; font-size: 14px;
        }
        .alert.error { background: #fee2e2; color: #ef4444; }
        .alert.success { background: #dcfce7; color: #166534; }
        
        .link-action { color: #ea580c; text-decoration: underline; font-weight: 600; }

        .signin-btn {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 15px; font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .signin-btn:hover { transform: translateY(-1px); box-shadow: 0 5px 15px -3px rgba(234, 88, 12, 0.4); }
        .signin-btn:disabled { opacity: 0.7; }


        .divider {
          text-align: center; margin: 24px 0; position: relative;
        }
        .divider:before {
          content: ''; position: absolute; left: 0; top: 50%; width: 100%; height: 1px; background: #e2e8f0;
        }
        .divider span {
          background: #fff; position: relative; padding: 0 12px; color: #94a3b8; font-size: 12px;
        }

        .social-login {
          display: flex; gap: 12px; margin-bottom: 24px;
        }
        .social-btn {
          flex: 1;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px;
          background: #f8fafc;
          border: none;
          border-radius: 10px;
          color: #334155; font-size: 13px; font-weight: 600;
          cursor: not-allowed; opacity: 0.6;
        }

        .signup-text {
          text-align: center; color: #64748b; font-size: 13px; margin-bottom: 24px;
        }
        .signup-text a { color: #ea580c; font-weight: 600; text-decoration: none; }
        
        .copyright {
          text-align: center; color: #cbd5e1; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;
        }

        /* Responsive Mobile Layout */
        @media (max-width: 900px) {
          .split-card {
            flex-direction: column-reverse;
            max-width: 500px;
            min-height: auto;
          }
          .image-side { height: 180px; width: 100%; flex: none; }
          .form-side { padding: 32px 24px; }
        }

        /* Pure Mobile Optimization (<480px) - Aggressive Compaction */
        @media (max-width: 480px) {
          .login-wrapper { padding: 12px; align-items: start; }
          .split-card {
             border-radius: 20px;
             margin-top: 5vh; 
             margin-top: 0;
          }
          .image-side { height: 80px; }
          .form-side { padding: 20px 16px; }
          
          .title { font-size: 20px; margin-bottom: 4px; }
          .subtitle { font-size: 12px; margin-bottom: 16px; line-height: 1.3; }
          .wave { display: none; }
          
          .form-group { margin-bottom: 10px; }
          .form-group label { font-size: 12px; margin-bottom: 2px; }
          .form-group input { padding: 10px; font-size: 14px; border-radius: 8px; height: 40px; }
          
          .alert { padding: 8px; font-size: 12px; margin-bottom: 12px; }
          
          .signin-btn { padding: 12px; font-size: 14px; margin-top: 0; height: 44px; }
          
          .divider { margin: 16px 0; }
          .divider span { font-size: 12px; padding: 0 8px; }
          
          .social-login { gap: 8px; margin-bottom: 16px; }
          .social-btn { padding: 8px; font-size: 12px; height: 36px; }
          .social-btn img { width: 16px; }
          
          .signup-text { margin-bottom: 12px; font-size: 12px; }
          .copyright { display: none; }
        }
      `}</style>
    </div>
  )
}
