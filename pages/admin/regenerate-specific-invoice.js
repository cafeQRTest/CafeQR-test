//pages/admin/regenerate-specific-invoice.js

import { useState } from 'react'
import { useRouter } from 'next/router'

export default function RegenerateInvoicePage() {
  const [formData, setFormData] = useState({
    orderId: '',
    restaurantId: '',
    adminKey: ''
  })
  
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value.trim()
    }))
    setError(null)
    setSuccess(false)
  }

  const validateInputs = () => {
    if (!formData.orderId) {
      setError('Order ID is required')
      return false
    }
    if (!formData.restaurantId) {
      setError('Restaurant ID is required')
      return false
    }
    if (!formData.adminKey) {
      setError('Admin Key is required')
      return false
    }
    if (formData.orderId.length < 10) {
      setError('Invalid Order ID format (too short)')
      return false
    }
    if (formData.restaurantId.length < 10) {
      setError('Invalid Restaurant ID format (too short)')
      return false
    }
    return true
  }

  const handleRegenerate = async () => {
    if (!validateInputs()) return

    if (!window.confirm(
      `⚠️ CONFIRM INVOICE REGENERATION\n\n` +
      `Order ID: ${formData.orderId}\n` +
      `Restaurant ID: ${formData.restaurantId}\n\n` +
      `This will delete the existing invoice (if any) and create a new one.\n` +
      `Continue?`
    )) {
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(false)
    setResult(null)

    try {
      const response = await fetch('/api/admin/regenerate-specific-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_ids: [formData.orderId],
          admin_key: formData.adminKey
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || data.message || 'Failed to regenerate invoice')
        return
      }

      setResult(data)
      setSuccess(true)
      
      if (data.details?.success?.[0]?.pdfUrl) {
        setTimeout(() => {
          window.open(data.details.success[0].pdfUrl, '_blank')
        }, 1500)
      }
    } catch (err) {
      setError(err.message || 'An error occurred')
      console.error('Regeneration error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFormData({ orderId: '', restaurantId: '', adminKey: '' })
    setError(null)
    setSuccess(false)
    setResult(null)
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Regenerate Single Invoice</h1>
        <p style={styles.subtitle}>
          Regenerate an invoice for a specific order by entering the Order ID, Restaurant ID, and Admin Key
        </p>

        {/* Info Box */}
        <div style={styles.infoBox}>
          <h3 style={styles.infoHeading}>ℹ️ How It Works</h3>
          <ul style={styles.infoList}>
            <li>Enter the Order ID of the order that needs invoice regeneration</li>
            <li>Enter your Restaurant ID</li>
            <li>Provide the Admin Key for authentication</li>
            <li>Click "Regenerate Invoice" to create a new invoice</li>
            <li>If an existing invoice exists, it will be deleted and recreated</li>
          </ul>
        </div>

        {/* Error Box */}
        {error && (
          <div style={styles.errorBox}>
            <h3 style={styles.errorHeading}>❌ Error</h3>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={(e) => { e.preventDefault(); handleRegenerate() }}>
          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="orderId">Order ID *</label>
            <input
              id="orderId"
              type="text"
              name="orderId"
              value={formData.orderId}
              onChange={handleInputChange}
              placeholder="e.g., a7c59126-e157-44d9-9943-94ea003ad16b"
              disabled={loading}
              style={{ ...styles.input, opacity: loading ? 0.6 : 1 }}
            />
            <small style={styles.helpText}>The UUID of the order to regenerate</small>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="restaurantId">Restaurant ID *</label>
            <input
              id="restaurantId"
              type="text"
              name="restaurantId"
              value={formData.restaurantId}
              onChange={handleInputChange}
              placeholder="e.g., db6f4704-c264-49f6-8ff7-6d333c14ece1"
              disabled={loading}
              style={{ ...styles.input, opacity: loading ? 0.6 : 1 }}
            />
            <small style={styles.helpText}>The UUID of the restaurant</small>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="adminKey">Admin Key *</label>
            <input
              id="adminKey"
              type="password"
              name="adminKey"
              value={formData.adminKey}
              onChange={handleInputChange}
              placeholder="Enter admin regenerate key"
              disabled={loading}
              style={{ ...styles.input, opacity: loading ? 0.6 : 1 }}
            />
            <small style={styles.helpText}>Required for authentication (set in .env)</small>
          </div>

          <div style={styles.buttonGroup}>
            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.submitBtn,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Processing...' : '🔄 Regenerate Invoice'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              style={{
                ...styles.resetBtn,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              Reset
            </button>
          </div>
        </form>

        {/* Success Box */}
        {success && result && (
          <div style={styles.successBox}>
            <h3 style={styles.successHeading}>✅ Invoice Regenerated Successfully</h3>
            <div style={styles.summary}>
              <p><strong>Total Processed:</strong> {result.details?.summary?.totalProcessed || 0}</p>
              <p><strong>Successful:</strong> {result.details?.summary?.successful || 0}</p>
              {result.details?.summary?.failed > 0 && (
                <p><strong>Failed:</strong> {result.details?.summary?.failed}</p>
              )}
              {result.details?.summary?.skipped > 0 && (
                <p><strong>Skipped:</strong> {result.details?.summary?.skipped}</p>
              )}
            </div>

            {result.details?.success?.length > 0 && (
              <div style={styles.details}>
                <h4 style={styles.detailsHeading}>✓ Successfully Generated:</h4>
                {result.details.success.map((item, idx) => (
                  <div key={idx}>
                    <p><strong>Order:</strong> {item.orderId}</p>
                    <p><strong>Invoice:</strong> {item.invoiceId}</p>
                    {item.pdfUrl && (
                      <p>
                        <a 
                          href={item.pdfUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={styles.link}
                        >
                          📄 View PDF
                        </a>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.details?.failed?.length > 0 && (
              <div style={styles.failedBox}>
                <h4 style={styles.failedHeading}>✗ Failed:</h4>
                {result.details.failed.map((item, idx) => (
                  <div key={idx} style={styles.failedItem}>
                    <p><strong>Order:</strong> {item.orderId}</p>
                    <p><strong>Reason:</strong> {item.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {result.details?.skipped?.length > 0 && (
              <div style={styles.skippedBox}>
                <h4 style={styles.skippedHeading}>⚠ Skipped:</h4>
                {result.details.skipped.map((item, idx) => (
                  <div key={idx} style={styles.skippedItem}>
                    <p><strong>Order:</strong> {item.orderId}</p>
                    <p><strong>Reason:</strong> {item.reason}</p>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleReset}
              style={{
                ...styles.regenerateAgainBtn,
                marginTop: '16px'
              }}
            >
              Regenerate Another Invoice
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Simple inline styles - no CSS file needed!
const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '40px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    padding: '40px',
    maxWidth: '600px',
    width: '100%',
    animation: 'slideUp 0.4s ease-out'
  },
  heading: {
    color: '#1f2937',
    margin: '0 0 10px 0',
    fontSize: '28px',
    fontWeight: '700'
  },
  subtitle: {
    color: '#6b7280',
    margin: '0 0 30px 0',
    fontSize: '14px',
    lineHeight: '1.6'
  },
  infoBox: {
    background: '#f0f9ff',
    borderLeft: '4px solid #3b82f6',
    borderRadius: '6px',
    padding: '15px',
    marginBottom: '30px'
  },
  infoHeading: {
    margin: '0 0 10px 0',
    color: '#1e40af',
    fontSize: '14px'
  },
  infoList: {
    margin: '0',
    paddingLeft: '20px',
    listStyle: 'none'
  },
  formGroup: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    color: '#1f2937',
    fontWeight: '600',
    fontSize: '14px'
  },
  input: {
    width: '100%',
    padding: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    transition: 'all 0.3s ease',
    boxSizing: 'border-box',
    fontFamily: '"Courier New", monospace'
  },
  helpText: {
    display: 'block',
    marginTop: '4px',
    color: '#9ca3af',
    fontSize: '12px'
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px'
  },
  submitBtn: {
    flex: 1,
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  resetBtn: {
    flex: 1,
    padding: '12px 24px',
    background: '#e5e7eb',
    color: '#1f2937',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  errorBox: {
    background: '#fee2e2',
    border: '1px solid #fecaca',
    borderLeft: '4px solid #dc2626',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px'
  },
  errorHeading: {
    margin: '0 0 8px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#991b1b'
  },
  errorText: {
    margin: '0',
    fontSize: '13px',
    lineHeight: '1.5',
    color: '#991b1b'
  },
  successBox: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderLeft: '4px solid #10b981',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '20px'
  },
  successHeading: {
    margin: '0 0 16px 0',
    color: '#065f46',
    fontSize: '16px',
    fontWeight: '600'
  },
  summary: {
    background: 'rgba(255, 255, 255, 0.5)',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '16px'
  },
  details: {
    background: 'rgba(255, 255, 255, 0.5)',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '16px'
  },
  detailsHeading: {
    margin: '0 0 8px 0',
    color: '#059669',
    fontSize: '13px',
    fontWeight: '600'
  },
  link: {
    color: '#0891b2',
    textDecoration: 'none',
    fontWeight: '500'
  },
  failedBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '12px',
    marginTop: '12px'
  },
  failedHeading: {
    margin: '0 0 8px 0',
    color: '#7f1d1d',
    fontSize: '13px',
    fontWeight: '600'
  },
  failedItem: {
    background: 'white',
    padding: '8px',
    borderRadius: '4px',
    marginBottom: '8px',
    borderLeft: '2px solid #dc2626'
  },
  skippedBox: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '6px',
    padding: '12px',
    marginTop: '12px'
  },
  skippedHeading: {
    margin: '0 0 8px 0',
    color: '#78350f',
    fontSize: '13px',
    fontWeight: '600'
  },
  skippedItem: {
    background: 'white',
    padding: '8px',
    borderRadius: '4px',
    marginBottom: '8px',
    borderLeft: '2px solid #f59e0b'
  },
  regenerateAgainBtn: {
    width: '100%',
    padding: '12px 24px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  }
}