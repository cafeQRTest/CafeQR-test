import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getSupabase } from '../services/supabase'

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

    const initializeSession = async () => {
      try {
        let token = router.query.access_token
        let type = router.query.type

        // Parse URL hash parameters (Supabase sends them here)
        if (typeof window !== 'undefined' && window.location.hash) {
          const params = new URLSearchParams(window.location.hash.slice(1))
          
          if (params.get('error')) {
            setErrorInfo({ 
              description: params.get('error_description') || 'Link invalid or expired.' 
            })
            return
          }
          
          if (!token) token = params.get('access_token')
          if (!type) type = params.get('type')
        }

        // Validate token and type
        if (!token || (type !== 'recovery' && type !== null)) {
          setErrorInfo({ 
            description: 'Invalid or missing reset token.' 
          })
          return
        }

        // IMPORTANT: Create a session from the reset token
        // This exchanges the token for a valid Supabase session
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: 'recovery'
        })

        if (error) {
          console.error('Session verification error:', error)
          setErrorInfo({ 
            description: error.message || 'Failed to verify reset link.' 
          })
          return
        }

        if (!data.session) {
          setErrorInfo({ 
            description: 'Session could not be established. Please try again.' 
          })
          return
        }

        // Session successfully established
        setReady(true)
        setMsg('')
        setErrorInfo(null)

      } catch (err) {
        console.error('Initialization error:', err)
        setErrorInfo({ 
          description: err.message || 'An unexpected error occurred.' 
        })
      }
    }

    initializeSession()
  }, [router.isReady, router.query])

  const onSubmit = async (e) => {
    e.preventDefault()
    
    if (newPw.length < 6) {
      return setMsg('Password must be at least 6 characters.')
    }
    
    if (newPw !== confirmPw) {
      return setMsg('Passwords do not match.')
    }

    setLoading(true)
    setMsg('')

    try {
      // Update password with the verified session
      const { error } = await supabase.auth.updateUser({ 
        password: newPw 
      })

      if (error) {
        return setMsg(`Error: ${error.message}`)
      }

      setMsg('✅ Password updated successfully! Redirecting to login...')
      
      // Sign out and redirect to login after successful password update
      await supabase.auth.signOut()
      
      setTimeout(() => {
        router.push('/login')
      }, 2000)
      
    } catch (err) {
      console.error('Password update error:', err)
      setMsg(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (errorInfo) {
    return (
      <div style={{ padding: '2rem', maxWidth: 480, margin: 'auto' }}>
        <h1>Reset Password</h1>
        <p style={{ color: 'red' }}>❌ {errorInfo.description}</p>
        <p>
          <Link href="/forgot-password">
            Request a new reset link
          </Link>
        </p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div style={{ padding: '2rem', maxWidth: 480, margin: 'auto' }}>
        <h1>Reset Password</h1>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 480, margin: 'auto' }}>
      <h1>Reset Password</h1>
      <form onSubmit={onSubmit}>
        <input
          type="password"
          placeholder="New password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          required
          minLength={6}
          style={{ 
            display: 'block', 
            width: '100%', 
            padding: 8, 
            marginBottom: 12,
            boxSizing: 'border-box'
          }}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          required
          minLength={6}
          style={{ 
            display: 'block', 
            width: '100%', 
            padding: 8, 
            marginBottom: 12,
            boxSizing: 'border-box'
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
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Updating…' : 'Reset Password'}
        </button>
      </form>
      {msg && (
        <p style={{ 
          marginTop: 12, 
          color: msg.includes('✅') ? 'green' : msg.includes('Error') ? 'red' : 'blue',
          fontWeight: msg.includes('✅') ? 'bold' : 'normal'
        }}>
          {msg}
        </p>
      )}
    </div>
  )
}
