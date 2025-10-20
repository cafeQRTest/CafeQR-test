// pages/signup.js
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
      if (
        error.message.toLowerCase().includes('already registered') ||
        error.message.toLowerCase().includes('already exists')
      ) {
        setMessage(
          <span>
            This email is already registered. Please{' '}
            <Link href="/login" style={{ color: '#0070f3', textDecoration: 'underline' }}>
              log in
            </Link>{' '}
            instead.
          </span>
        )
        passwordRef.current && passwordRef.current.focus()
      } else {
        setMessage('Error: ' + error.message)
      }
      return
    }

    // NEW: Start free trial for new user
    if (data?.user?.id) {
      try {
        await fetch('/api/subscription/start-trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurant_id: data.user.id }),
        })
      } catch (e) {
        console.error('Trial start failed:', e)
      }
    }

    setMessage(
      'Account created! A confirmation link has been sent to your email. Please verify to continue.'
    )

    // NEW: Redirect to /owner after signup
    setTimeout(() => {
      router.push('/owner')
    }, 2000)
  }

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: 20 }}>
      <h1>Restaurant Owner Signup</h1>
      <form onSubmit={handleSignup}>
        <input
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }}
        />
        <input
          ref={passwordRef}
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={{ display: 'block', width: '100%', marginBottom: 10, padding: 8 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: '10px 20px', marginBottom: 10 }}
        >
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>
      </form>

      {message && (
        <div
          style={{
            padding: 10,
            backgroundColor:
              typeof message === 'string' && message.startsWith('Error') ? '#ffe6e6' : '#e6ffe6',
            border:
              '1px solid ' +
              (typeof message === 'string' && message.startsWith('Error') ? '#ff0000' : '#00aa00'),
            borderRadius: 4,
            marginBottom: 10,
          }}
        >
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
