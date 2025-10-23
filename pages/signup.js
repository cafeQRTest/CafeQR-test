//pages/signup

import { useState, useRef } from 'react'
import Link from 'next/link'
import { getSupabase } from '../services/supabase'
import { useRouter } from 'next/router'

export default function SignupPage() {
  const supabase = getSupabase()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
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
            <Link href="/login" style={{ color: '#0070f3', textDecoration: 'underline' }}>
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
    <div style={{ maxWidth: 400, margin: '0 auto', padding: 20 }}>
      <h1>Restaurant Owner Signup</h1>
      <form onSubmit={handleSignup}>
        <input
          type="email" placeholder="Your email" value={email}
          onChange={e => setEmail(e.target.value)} required
          style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }}
        />
        <input
          ref={passwordRef} type="password" placeholder="Password (min 6 chars)"
          value={password} onChange={e => setPassword(e.target.value)}
          required minLength={6}
          style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }}
        />
        <button type="submit" disabled={loading} style={{ padding: '10px 20px', marginBottom: 10 }}>
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>
      </form>
      {message && (
        <div style={{
          padding: 10,
          backgroundColor: typeof message === 'string' && message.startsWith('Error') ? '#ffe6e6' : '#e6ffe6',
          border: '1px solid ' + (typeof message === 'string' && message.startsWith('Error') ? '#ff0000' : '#00aa00'),
          borderRadius: 4, marginBottom: 10
        }}>
          {message}
        </div>
      )}
      <p>
        Already have an account?{' '}
        <Link href="/login" style={{ color: '#0070f3', textDecoration: 'underline' }}>
          Login here
        </Link>
      </p>
    </div>
  )
}
