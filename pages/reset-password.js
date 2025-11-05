// pages/reset-password.js
// PRODUCTION VERSION - Without Debug Logs

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { getSupabase } from '../services/supabase'
import Link from 'next/link'

export default function ResetPassword() {
  const router = useRouter()
  const supabase = getSupabase()
  
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [ready, setReady] = useState(false)
  const [errorInfo, setErrorInfo] = useState(null)

  useEffect(() => {
    if (!router.isReady) return

    let token = router.query.access_token
    let type = router.query.type
    let refreshToken = router.query.refresh_token

    // Check URL hash for token (from email link)
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1))

      if (hashParams.get('error')) {
        const errorDescription = hashParams.get('error_description') || 'Link invalid or expired.'
        setErrorInfo({ description: errorDescription })
        return
      }

      if (!token) token = hashParams.get('access_token')
      if (!type) type = hashParams.get('type')
      if (!refreshToken) refreshToken = hashParams.get('refresh_token')
    }

    if (token && (type === 'recovery' || !type)) {
      setReady(true)
      setMsg('')
      setErrorInfo(null)
    } else {
      setErrorInfo({ description: 'Invalid or missing reset token.' })
    }
  }, [router.isReady, router.query])

  const onSubmit = async (e) => {
    e.preventDefault()

    if (newPw.length < 6) {
      setMsg('❌ Password must be ≥6 characters.')
      return
    }

    if (newPw !== confirmPw) {
      setMsg('❌ Passwords do not match.')
      return
    }

    setLoading(true)
    setMsg('')

    try {
      // Extract tokens from URL
      let token = router.query.access_token
      let refreshToken = router.query.refresh_token

      if (!token && typeof window !== 'undefined' && window.location.hash) {
        const params = new URLSearchParams(window.location.hash.slice(1))
        token = params.get('access_token')
        refreshToken = params.get('refresh_token')
      }

      if (!token) {
        setMsg('❌ Token not found. Please request a new reset link.')
        setLoading(false)
        return
      }

      // Establish session from the recovery token
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: token,
        refresh_token: refreshToken || undefined
      })

      if (sessionError) {
        setMsg(`❌ Session Error: ${sessionError.message}`)
        setLoading(false)
        return
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({ 
        password: newPw 
      })

      if (updateError) {
        setMsg(`❌ ${updateError.message}`)
        setLoading(false)
        return
      }

      setMsg('✅ Password updated successfully! Redirecting to login...')
      
      // Sign out
      try {
        await supabase.auth.signOut()
      } catch (signOutError) {
        // Non-critical error
      }

      setTimeout(() => {
        router.push('/login')
      }, 2000)
      
    } catch (err) {
      setMsg(`❌ ${err.message || 'An error occurred'}`)
      setLoading(false)
    } finally {
      setLoading(false)
    }
  }

  if (errorInfo) {
    return (
      <div style={{ padding: '2rem', maxWidth: 800, margin: 'auto' }}>
        <h1>Reset Password</h1>
        <div style={{ padding: '15px', backgroundColor: '#ffe6e6', border: '1px solid #ff0000', borderRadius: '4px', color: '#cc0000', marginBottom: '20px' }}>
          ❌ {errorInfo.description}
        </div>
        <Link href="/forgot-password" style={{ color: '#0070f3', textDecoration: 'underline' }}>
          ← Request a new reset link
        </Link>
      </div>
    )
  }

  if (!ready) {
    return (
      <div style={{ padding: '2rem', maxWidth: 800, margin: 'auto', textAlign: 'center' }}>
        <h1>Reset Password</h1>
        <p>⏳ Verifying your reset link...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: 'auto' }}>
      <h1>Reset Password</h1>
      <form onSubmit={onSubmit}>
        <input
          type="password"
          placeholder="New password (min 6 characters)"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          required
          minLength={6}
          style={{ display: 'block', width: '100%', padding: 8, marginBottom: 12, boxSizing: 'border-box' }}
          disabled={loading}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          required
          minLength={6}
          style={{ display: 'block', width: '100%', padding: 8, marginBottom: 12, boxSizing: 'border-box' }}
          disabled={loading}
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
            opacity: loading ? 0.6 : 1
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
          color: msg.includes('✅') ? '#006600' : '#cc0000'
        }}>
          {msg}
        </div>
      )}
    </div>
  )
}