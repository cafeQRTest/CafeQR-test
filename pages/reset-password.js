// pages/reset-password.js
// FINAL WORKING VERSION - Uses setSession() to establish authenticated session

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
  const [debugLog, setDebugLog] = useState([])

  const addLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = `[${timestamp}] ${message}${data ? ': ' + JSON.stringify(data, null, 2) : ''}`
    console.log(logEntry)
    setDebugLog(prev => [...prev, logEntry])
  }

  useEffect(() => {
    if (!router.isReady) {
      addLog('Router not ready yet')
      return
    }

    addLog('=== RESET PASSWORD INITIALIZATION ===')
    addLog('Current URL', window.location.href)

    let token = router.query.access_token
    let type = router.query.type
    let refreshToken = router.query.refresh_token

    // Check URL hash for token (from email link)
    if (typeof window !== 'undefined' && window.location.hash) {
      addLog('Hash found in URL - extracting parameters')
      const hashParams = new URLSearchParams(window.location.hash.slice(1))

      if (hashParams.get('error')) {
        const errorDescription = hashParams.get('error_description') || 'Link invalid or expired.'
        addLog('❌ ERROR in URL hash:', errorDescription)
        setErrorInfo({ description: errorDescription })
        return
      }

      if (!token) token = hashParams.get('access_token')
      if (!type) type = hashParams.get('type')
      if (!refreshToken) refreshToken = hashParams.get('refresh_token')
      
      addLog('✅ Parameters extracted from hash')
    }

    addLog('Token found:', !!token)
    addLog('Type:', type)
    addLog('Refresh token found:', !!refreshToken)

    if (token && (type === 'recovery' || !type)) {
      addLog('✅ TOKEN VALIDATION PASSED')
      setReady(true)
      setMsg('')
      setErrorInfo(null)
    } else {
      addLog('❌ TOKEN VALIDATION FAILED')
      setErrorInfo({ description: 'Invalid or missing reset token.' })
    }
  }, [router.isReady, router.query])

  const onSubmit = async (e) => {
    e.preventDefault()
    
    addLog('=== PASSWORD RESET SUBMISSION ===')

    if (newPw.length < 6) {
      const msg = '❌ Password must be ≥6 characters.'
      setMsg(msg)
      addLog(msg)
      return
    }

    if (newPw !== confirmPw) {
      const msg = '❌ Passwords do not match.'
      setMsg(msg)
      addLog(msg)
      return
    }

    addLog('✅ Password validation passed')
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
        const errorMsg = '❌ Token not found. Please request a new reset link.'
        setMsg(errorMsg)
        addLog(errorMsg)
        setLoading(false)
        return
      }

      addLog('🔐 STEP 1: Setting up session with token')
      addLog('Access token length:', token.length)
      addLog('Refresh token found:', !!refreshToken)

      // CRITICAL: Establish session from the recovery token
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: token,
        refresh_token: refreshToken || undefined
      })

      if (sessionError) {
        addLog('❌ setSession failed:', sessionError)
        setMsg(`❌ Session Error: ${sessionError.message}`)
        setLoading(false)
        return
      }

      addLog('✅ Session established successfully')
      addLog('Session user:', sessionData?.user?.email || 'No email')

      addLog('🔐 STEP 2: Updating password')
      
      // Now we have a valid session, update the password
      const { error: updateError } = await supabase.auth.updateUser({ 
        password: newPw 
      })

      if (updateError) {
        addLog('❌ Password update failed:', updateError)
        setMsg(`❌ ${updateError.message}`)
        setLoading(false)
        return
      }

      addLog('✅ Password updated successfully')

      const successMsg = '✅ Password updated successfully! Redirecting to login...'
      setMsg(successMsg)
      addLog(successMsg)
      
      // Sign out
      try {
        await supabase.auth.signOut()
        addLog('✅ User signed out')
      } catch (signOutError) {
        addLog('⚠️ Sign out error (non-critical):', signOutError.message)
      }

      setTimeout(() => {
        addLog('Redirecting to /login')
        router.push('/login')
      }, 2000)
      
    } catch (err) {
      addLog('❌ UNEXPECTED ERROR:', err)
      const msg = `❌ ${err.message || 'An error occurred'}`
      setMsg(msg)
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

        <div style={{ marginTop: '40px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '4px', maxHeight: '300px', overflowY: 'auto', border: '1px solid #ddd' }}>
          <h3>Debug Log:</h3>
          <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            {debugLog.join('\n')}
          </pre>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div style={{ padding: '2rem', maxWidth: 800, margin: 'auto', textAlign: 'center' }}>
        <h1>Reset Password</h1>
        <p>⏳ Verifying your reset link...</p>

        <div style={{ marginTop: '40px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '4px', maxHeight: '300px', overflowY: 'auto', border: '1px solid #ddd' }}>
          <h3>Debug Log:</h3>
          <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            {debugLog.join('\n')}
          </pre>
        </div>
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

      <div style={{ marginTop: '40px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '4px', maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd' }}>
        <h3>Debug Log (Scroll to see all entries):</h3>
        <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          {debugLog.join('\n') || 'No logs yet...'}
        </pre>
      </div>
    </div>
  )
}