import { useState } from 'react'
import { useRouter } from 'next/router'

export default function RegenerateInvoices() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [adminKey, setAdminKey] = useState('')
  const router = useRouter()

  const handleRegenerate = async () => {
    if (!adminKey.trim()) {
      setError('Admin key is required')
      return
    }

    if (!confirm('⚠️  This will regenerate ALL invoices from scratch.\n\nMake sure you have backed up your database first!\n\nContinue?')) {
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/admin/regenerate-all-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_key: adminKey })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to regenerate invoices')
        return
      }

      setResult(data)
      setAdminKey('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: 20, fontFamily: 'Arial' }}>
      <h1>Invoice Regeneration Tool</h1>
      <p style={{ color: '#d9534f', fontWeight: 'bold' }}>
        ⚠️  WARNING: This will regenerate ALL invoices for ALL restaurants!
      </p>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 10 }}>
          Admin Key:
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Enter admin regenerate key"
            style={{
              display: 'block',
              width: '100%',
              padding: 10,
              marginTop: 5,
              border: '1px solid #ccc',
              borderRadius: 4
            }}
            disabled={loading}
          />
        </label>
      </div>

      <button
        onClick={handleRegenerate}
        disabled={loading || !adminKey.trim()}
        style={{
          padding: '12px 24px',
          fontSize: 16,
          backgroundColor: loading ? '#ccc' : '#d9534f',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: 20
        }}
      >
        {loading ? 'Processing... (This may take a few minutes)' : 'Start Regeneration'}
      </button>

      {error && (
        <div style={{
          padding: 15,
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: 4,
          marginBottom: 20
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{
          padding: 15,
          backgroundColor: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb',
          borderRadius: 4,
          marginBottom: 20
        }}>
          <h3>✓ Regeneration Complete!</h3>
          <p><strong>Total Processed:</strong> {result.summary.total}</p>
          <p><strong>Successful:</strong> {result.summary.successful}</p>
          <p><strong>Failed:</strong> {result.summary.failed}</p>
          
          {result.summary.failed > 0 && (
            <details style={{ marginTop: 15 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>View Failed Orders</summary>
              <pre style={{
                backgroundColor: '#fff3cd',
                padding: 10,
                borderRadius: 4,
                overflow: 'auto',
                fontSize: 12,
                marginTop: 10
              }}>
                {JSON.stringify(result.details.failed, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
