import { useState } from 'react'
import Link from 'next/link'
import { getSupabase } from '../services/supabase'

export default function ForgotPassword() {
  const supabase = getSupabase()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('') // 'success', 'error'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg('')
    setLoading(true)

    console.log('[FORGOT_PASSWORD] Starting password reset flow...')
    console.log('[FORGOT_PASSWORD] Email:', email)

    try {
      // Get the redirect URL
      const redirectUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/reset-password`
        : 'http://localhost:3000/reset-password'

      console.log('[FORGOT_PASSWORD] Redirect URL:', redirectUrl)

      // Call Supabase official method
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      })

      console.log('[FORGOT_PASSWORD] Response:', { data, error })

      if (error) {
        console.error('[FORGOT_PASSWORD] Error occurred:', error.message)
        setMsgType('error')
        setMsg(`Error: ${error.message}`)
      } else {
        console.log('[FORGOT_PASSWORD] SUCCESS - Email sent successfully')
        setMsgType('success')
        setMsg('✅ If this email exists, a password reset link has been sent. Check your inbox and spam folder.')
        setEmail('')
      }
    } catch (err) {
      console.error('[FORGOT_PASSWORD] Unexpected error:', err)
      setMsgType('error')
      setMsg(`Error: ${err.message || 'An unexpected error occurred'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: 20 }}>
      <h1>Forgot Password</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ 
            display: 'block', 
            width: '100%', 
            marginBottom: 10, 
            padding: 8,
            boxSizing: 'border-box',
            fontSize: '14px'
          }}
          disabled={loading}
        />
        <button 
          disabled={loading} 
          style={{ 
            padding: '10px 20px', 
            marginBottom: 10,
            width: '100%',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            backgroundColor: '#f97316',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      {msg && (
        <div style={{
          padding: 10,
          backgroundColor: msgType === 'error' ? '#ffe6e6' : '#e6ffe6',
          border: `1px solid ${msgType === 'error' ? '#ff0000' : '#00aa00'}`,
          borderRadius: 4,
          marginBottom: 10,
          color: msgType === 'error' ? '#cc0000' : '#006600'
        }}>{msg}</div>
      )}
      <p>
        Remembered it? <Link href="/login" style={{ color: '#0070f3', textDecoration: 'underline' }}>Login</Link>
      </p>
    </div>
  )
}
