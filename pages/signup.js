import { useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '../services/supabase'
import { useRouter } from 'next/router'
import { FaFacebook, FaEye, FaEyeSlash, FaApple } from 'react-icons/fa'
import { FcGoogle } from 'react-icons/fc'

export default function SignupPage() {
  const supabase = getSupabase()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  
  const handleSignup = async (e) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setMessage('Passwords do not match')
      return
    }
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password
    })
    setLoading(false)

    if (error) {
      console.error('Signup Error:', error);
      // Try to show more details if available
      const detailedMsg = error.details || error.hint || error.message;
      setMessage(detailedMsg);
      return
    }

    setMessage('Account created! Please verify your email.')
  }

  return (
    <div className="page-wrapper">
      <div className="mobile-card">
        
        {/* Header Graphic (Green Base, Orange Decor) */}
        <div className="header-graphic">
           <div className="circle-overlay" />
           <div className="header-content">
             <button className="back-btn" onClick={() => router.push('/login')}>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
             </button>
             <h1>Create<br/>Account</h1>
           </div>
        </div>

        {/* Form Body (White) */}
        <div className="form-body">
          <form onSubmit={handleSignup}>
            
            <div className="input-group">
              <input
                type="email"
                id="email"
                value={email}
                className={email ? 'has-content' : ''}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder=" "
              />
              <label htmlFor="email">Email Address</label>
            </div>

            <div className="input-group">
              <div className="password-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  className={password ? 'has-content' : ''}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder=" "
                />
                <label htmlFor="password">Password</label>
                <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                   {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div className="input-group">
              <div className="password-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="confirm"
                  value={confirmPassword}
                  className={confirmPassword ? 'has-content' : ''}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder=" "
                />
                <label htmlFor="confirm">Confirm Password</label>
                {/* Optional: Second eye button, or just rely on the first one toggling both. 
                    User asked "option for both". I will add the button to both for clarity. */}
                <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                   {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            {message && <div className="alert">{message}</div>}

            <button type="submit" disabled={loading} className="submit-btn">
              {loading ? 'WAIT...' : 'SIGN UP'}
            </button>
            
            <div className="social-row">
               <button type="button" className="social-btn" disabled>
                 <span style={{ display: 'flex', flexShrink: 0 }}><FcGoogle size={24} /></span>
                 <span>Sign in with Google</span>
               </button>
               <button type="button" className="social-btn" disabled>
                 <span style={{ display: 'flex', flexShrink: 0 }}><FaFacebook size={24} color="#1877F2" /></span>
                 <span>Sign in with Facebook</span>
               </button>
               <button type="button" className="social-btn full-width" disabled>
                 <span style={{ display: 'flex', flexShrink: 0 }}><FaApple size={26} color="black" /></span>
                 <span>Sign in with Apple</span>
               </button>
            </div>
            
            <div className="login-link">
               <p>Already have an account? <Link href="/login">Sign In</Link></p>
            </div>

            <div className="copyright-footer">
              &copy; 2026 ALL RIGHTS RESERVED
            </div>

          </form>
        </div>
      </div>

      <style jsx global>{`
        body { background: #e2e8f0; margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
      `}</style>

      <style jsx>{`
        .page-wrapper {
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          background: #cbd5e1; padding: 20px;
        }

        .mobile-card {
           width: 100%; max-width: 950px; height: 650px;
           background: white; border-radius: 32px;
           overflow: hidden; box-shadow: 0 40px 80px -20px rgba(0,0,0,0.2);
           display: flex; flex-direction: row;
        }

        /* HEADER (Green Theme for Signup) */
        .header-graphic {
          width: 45%; height: 100%;
          background: #115e59; /* Green Base */
          position: relative; overflow: hidden;
        }
        .circle-overlay {
          position: absolute; top: -100px; right: -100px;
          width: 320px; height: 320px;
          background: #f97316; /* Orange Decor */
          border-radius: 50%; opacity: 1;
        }
        .header-content {
          position: relative; z-index: 2; padding: 60px 40px; height: 100%;
          display: flex; flex-direction: column; justify-content: center;
        }
        .header-content h1 { font-size: 48px; margin: 0; color: white; line-height: 1.1; font-weight: 800; }
        
        .back-btn {
          position: absolute; top: 30px; left: 30px;
          background: transparent; border: none; padding: 0; cursor: pointer;
        }
        .back-btn svg { stroke: white; }

        /* FORM BODY */
        .form-body {
          flex: 1; padding: 60px;
          display: flex; flex-direction: column; justify-content: center;
          background: white;
        }
        form { width: 100%; max-width: 360px; margin: 0 auto; }

        /* INPUTS */
        .input-group { 
           margin-bottom: 32px; position: relative; 
        }
        
        .input-group input { 
           display: block; width: 100%;
           padding: 12px 0;
           font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 500;
           font-size: 16px; 
           border: none; border-bottom: 2px solid #cbd5e1;
           background: transparent !important;
           border-radius: 0; color: #1e293b;
           outline: none; transition: all 0.2s;
        }
        .input-group input:focus { border-bottom-color: #115e59; }

        .input-group input:-webkit-autofill,
        .input-group input:-webkit-autofill:hover, 
        .input-group input:-webkit-autofill:focus, 
        .input-group input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 30px white inset !important;
        }

        /* Floating Label */
        .input-group label { 
           position: absolute; top: 12px; left: 0;
           font-size: 16px; color: #94a3b8;
           pointer-events: none; transition: all 0.2s ease;
        }
        
        .input-group input:focus + label,
        .input-group input:not(:placeholder-shown) + label,
        .password-row input:focus + label,
        .password-row input:not(:placeholder-shown) + label,
        .input-group input.has-content + label,
        .password-row input.has-content + label,
        .input-group input:-webkit-autofill + label,
        .password-row input:-webkit-autofill + label {
           top: -8px; font-size: 12px; color: #115e59; font-weight: 600;
        }

        /* Password Row & Eye */
        .password-row { position: relative; width: 100%; }
        .password-row input { padding-right: 35px; }

        .eye-btn {
           position: absolute; right: 0; top: 4px;
           background: transparent; border: none; 
           color: #cbd5e1; cursor: pointer;
           font-size: 18px; transition: color 0.2s;
        }
        .eye-btn:hover { color: #f97316; }

        .submit-btn {
           width: 100%; padding: 16px;
           background: #f97316; /* Orange for Signup */
           color: white;
           border: none; border-radius: 12px;
           font-size: 14px; font-weight: 700;
           letter-spacing: 1px; cursor: pointer; text-transform: uppercase;
           box-shadow: 0 10px 20px -5px rgba(249, 115, 22, 0.4);
           transition: transform 0.2s;
           margin-top: 10px;
        }
        .submit-btn:hover { transform: translateY(-2px); }

        /* Social Buttons (Wide) */
        .social-row { 
           display: flex; gap: 12px; flex-wrap: wrap; 
           justify-content: center; margin-top: 24px; 
        }
        .social-btn {
           flex: 1 1 45%;
           height: 48px;
           border-radius: 100px;
           border: 1px solid #e2e8f0;
           background: white;
           color: #1e293b;
           display: flex; align-items: center; justify-content: center; gap: 8px;
           font-size: 13px; font-weight: 600;
           font-family: 'Plus Jakarta Sans', sans-serif;
           cursor: not-allowed;
           transition: all 0.2s;
           box-shadow: 0 1px 2px rgba(0,0,0,0.05);
           opacity: 0.6; /* Disabled state */
           white-space: nowrap;
           padding: 0 16px;
        }
        .social-btn.full-width { flex: 1 1 100%; }
        .social-btn:hover { background: #f8fafc; }

        .login-link { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        .login-link a { color: #115e59; text-decoration: none; font-weight: 700; }
        
        .alert { 
           font-size: 13px; color: #ef4444; border-radius: 8px; 
           background: #fef2f2; padding: 10px; margin-bottom: 20px;
        }

        .copyright-footer {
          text-align: center;
          margin-top: 40px;
          font-size: 12px;
          color: #94a3b8; /* Neutral Grey to match login */
          letter-spacing: 1px;
          font-weight: 500;
        }

        /* MOBILE */
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
           .header-content h1 { font-size: 36px; }
           .form-body { padding: 40px 30px; justify-content: flex-start; }
           form { max-width: none; margin: 0; }
        }
      `}</style>
    </div>
  )
}
