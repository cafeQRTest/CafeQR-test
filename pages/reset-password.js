import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getSupabase } from '../services/supabase'

export default function ResetPassword() {
  const router = useRouter()
  const supabase = getSupabase()
  const initRef = useRef(false)

  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [pageState, setPageState] = useState('loading') // 'loading', 'ready', 'error'
  const [errorDescription, setErrorDescription] = useState('')

  // Parse URL and validate token on mount
  useEffect(() => {
    if (!router.isReady || initRef.current) return
    initRef.current = true

    const parseAndValidateToken = async () => {
      console.log('[RESET_PASSWORD] Component mounted')
      console.log('[RESET_PASSWORD] Router query:', router.query)

      try {
        // Get token from URL query string
        const token = router.query.token
        const type = router.query.type

        console.log('[RESET_PASSWORD] Token found:', !!token)
        console.log('[RESET_PASSWORD] Token type:', type)

        // Log full URL for debugging
        if (typeof window !== 'undefined') {
          console.log('[RESET_PASSWORD] Full URL:', window.location.href)
          console.log('[RESET_PASSWORD] Query string:', window.location.search)
          console.log('[RESET_PASSWORD] Hash:', window.location.hash)
        }

        // Validate token exists
        if (!token) {
          console.warn('[RESET_PASSWORD] ERROR: Token is missing from URL')
          setErrorDescription('Invalid or missing reset token. Please request a new password reset link.')
          setPageState('error')
          return
        }

        // Validate token type
        if (type !== 'recovery') {
          console.warn('[RESET_PASSWORD] ERROR: Invalid token type:', type)
          setErrorDescription('Invalid token type. Expected "recovery" type.')
          setPageState('error')
          return
        }

        console.log('[RESET_PASSWORD] Token and type validated successfully')
        console.log('[RESET_PASSWORD] Waiting for user to submit new password...')
        
        // Token is valid, we'll verify it when user submits the form
        setPageState('ready')

      } catch (err) {
        console.error('[RESET_PASSWORD] ERROR during token parsing:', err)
        setErrorDescription(err.message || 'An unexpected error occurred')
        setPageState('error')
      }
    }

    parseAndValidateToken()
  }, [router.isReady, router.query])

  const onSubmit = async (e) => {
    e.preventDefault()
    
    console.log('[RESET_PASSWORD] Form submitted')
    console.log('[RESET_PASSWORD] New password length:', newPw.length)

    // Validation
    if (newPw.length < 6) {
      console.warn('[RESET_PASSWORD] ERROR: Password too short')
      setMsg('❌ Password must be at least 6 characters.')
      return
    }
    
    if (newPw !== confirmPw) {
      console.warn('[RESET_PASSWORD] ERROR: Passwords do not match')
      setMsg('❌ Passwords do not match.')
      return
    }

    setLoading(true)
    setMsg('')

    try {
      const token = router.query.token

      console.log('[RESET_PASSWORD] Attempting to verify OTP with Supabase...')
      console.log('[RESET_PASSWORD] Token:', token?.substring(0, 20) + '...')

      // STEP 1: Verify the OTP token and create a session
      const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'recovery'
      })

      console.log('[RESET_PASSWORD] verifyOtp response:', {
        hasData: !!otpData,
        hasError: !!otpError,
        errorMessage: otpError?.message
      })

      if (otpError) {
        console.error('[RESET_PASSWORD] OTP Verification failed:', otpError.message)
        const errorMsg = otpError.message.toLowerCase()
        
        if (errorMsg.includes('expired')) {
          console.warn('[RESET_PASSWORD] Token has expired')
          setMsg('❌ Your reset link has expired. Please request a new one.')
        } else if (errorMsg.includes('invalid')) {
          console.warn('[RESET_PASSWORD] Token is invalid')
          setMsg('❌ Invalid reset token. Please request a new one.')
        } else {
          setMsg(`❌ Error: ${otpError.message}`)
        }
        
        setLoading(false)
        return
      }

      if (!otpData?.session) {
        console.error('[RESET_PASSWORD] ERROR: No session created after OTP verification')
        setMsg('❌ Failed to create session. Please try again.')
        setLoading(false)
        return
      }

      console.log('[RESET_PASSWORD] ✓ OTP verified and session created')
      console.log('[RESET_PASSWORD] Session user:', otpData.session.user?.email)

      // STEP 2: Update password with the session
      console.log('[RESET_PASSWORD] Attempting to update password...')

      const { error: updateError } = await supabase.auth.updateUser({ 
        password: newPw 
      })

      console.log('[RESET_PASSWORD] updateUser response:', {
        hasError: !!updateError,
        errorMessage: updateError?.message
      })

      if (updateError) {
        console.error('[RESET_PASSWORD] Password update failed:', updateError.message)
        setMsg(`❌ Error: ${updateError.message}`)
        setLoading(false)
        return
      }

      console.log('[RESET_PASSWORD] ✓ Password updated successfully!')
      console.log('[RESET_PASSWORD] Signing out user...')

      setMsg('✅ Password updated successfully! Redirecting to login...')
      
      // Sign out the user
      await supabase.auth.signOut()
      console.log('[RESET_PASSWORD] ✓ User signed out')

      // Redirect to login after 2 seconds
      setTimeout(() => {
        console.log('[RESET_PASSWORD] Redirecting to login page...')
        router.push('/login')
      }, 2000)
      
    } catch (err) {
      console.error('[RESET_PASSWORD] UNEXPECTED ERROR:', err)
      setMsg(`❌ Error: ${err.message || 'An unexpected error occurred'}`)
    } finally {
      setLoading(false)
    }
  }

  // Loading state
  if (pageState === 'loading') {
    return (
      <div style={{ padding: '2rem', maxWidth: 480, margin: 'auto', textAlign: 'center' }}>
        <h1>Reset Password</h1>
        <p>⏳ Verifying your reset link...</p>
      </div>
    )
  }

  // Error state
  if (pageState === 'error') {
    return (
      <div style={{ padding: '2rem', maxWidth: 480, margin: 'auto' }}>
        <h1>Reset Password</h1>
        <div style={{ 
          padding: '15px', 
          backgroundColor: '#ffe6e6', 
          border: '1px solid #ff0000',
          borderRadius: '4px',
          color: '#cc0000',
          marginBottom: '20px'
        }}>
          ❌ {errorDescription}
        </div>
        <Link href="/forgot-password" style={{ color: '#0070f3', textDecoration: 'underline' }}>
          ← Request a new reset link
        </Link>
      </div>
    )
  }

  // Ready state - show form
  return (
    <div style={{ padding: '2rem', maxWidth: 480, margin: 'auto' }}>
      <h1>Reset Password</h1>
      <form onSubmit={onSubmit}>
        <input
          type="password"
          placeholder="New password (min 6 characters)"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          required
          minLength={6}
          disabled={loading}
          style={{ 
            display: 'block', 
            width: '100%', 
            padding: 8, 
            marginBottom: 12,
            boxSizing: 'border-box',
            fontSize: '14px',
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'not-allowed' : 'auto'
          }}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          required
          minLength={6}
          disabled={loading}
          style={{ 
            display: 'block', 
            width: '100%', 
            padding: 8, 
            marginBottom: 12,
            boxSizing: 'border-box',
            fontSize: '14px',
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'not-allowed' : 'auto'
          }}
        />
        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            padding: '0.75rem 1.5rem',
            width: '100%',
            backgroundColor: '#f97316',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          {loading ? '⏳ Updating…' : 'Reset Password'}
        </button>
      </form>
      {msg && (
        <div style={{ 
          marginTop: 12,
          padding: '10px',
          backgroundColor: msg.includes('✅') ? '#e6ffe6' : '#ffe6e6',
          border: `1px solid ${msg.includes('✅') ? '#00aa00' : '#ff0000'}`,
          borderRadius: '4px',
          color: msg.includes('✅') ? '#006600' : '#cc0000',
          fontSize: 14
        }}>
          {msg}
        </div>
      )}
    </div>
  )
}
