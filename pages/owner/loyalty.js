// pages/owner/loyalty.js
import { useEffect, useMemo, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import { getSupabase } from '../../services/supabase'
import { FaGift, FaCog, FaSearch, FaWallet } from 'react-icons/fa'
import Button from '../../components/ui/Button'
import NiceSelect from '../../components/NiceSelect'

export default function OwnerLoyaltyPage() {
  const BRAND = { orange: '#f97316', black: '#111827' }
  const supabase = getSupabase()
  const { checking } = useRequireAuth(supabase)
  const { restaurant, loading: restLoading } = useRestaurant()
  const restaurantId = restaurant?.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // settings form
  const [enabled, setEnabled] = useState(false)
  const [pointsPerRupee, setPointsPerRupee] = useState('0.01') // 1 point / ₹100
  const [minOrderValue, setMinOrderValue] = useState('0')

  const [redeemThreshold, setRedeemThreshold] = useState('100')
  const [redeemDiscountType, setRedeemDiscountType] = useState('percent')
  const [redeemDiscountValue, setRedeemDiscountValue] = useState('10')
  const [maxDiscount, setMaxDiscount] = useState('100')

  const [pointsExpiryDays, setPointsExpiryDays] = useState('') // empty => disabled

  // Preview calculator (helps restaurants understand)
  const [previewBill, setPreviewBill] = useState('500')
  const fmt = useMemo(() => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }), [])

  const loadSettings = async () => {
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      // via RPC so you can later enforce RLS properly
      const { data, error } = await supabase.rpc('get_loyalty_settings', { p_restaurant_id: restaurantId })
      if (error) throw error

      if (!data) {
        // defaults (already in UI state)
        setEnabled(false)
        return
      }

      setEnabled(!!data.enabled)
      setPointsPerRupee(String(data.points_per_rupee ?? '0.01'))
      setMinOrderValue(String(data.min_order_value ?? '0'))

      setRedeemThreshold(String(data.redeem_threshold ?? '100'))
      setRedeemDiscountType(data.redeem_discount_type ?? 'percent')
      setRedeemDiscountValue(String(data.redeem_discount_value ?? '10'))
      setMaxDiscount(String(data.max_discount ?? '100'))

      setPointsExpiryDays(data.points_expiry_days == null ? '' : String(data.points_expiry_days))
    } catch (e) {
      setError(e?.message || 'Failed to load loyalty settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (checking || restLoading || !restaurantId) return
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, restLoading, restaurantId])

  const preview = useMemo(() => {
    const bill = Number(previewBill || 0)
    const ppr = Number(pointsPerRupee || 0)
    const minV = Number(minOrderValue || 0)
    const th = Number(redeemThreshold || 0)

    const earns = bill >= minV ? Math.floor(bill * ppr) : 0

    let discount = 0
    if (th > 0 && th <= 999999) {
      if (redeemDiscountType === 'amount') {
        discount = Number(redeemDiscountValue || 0)
      } else {
        discount = bill * (Number(redeemDiscountValue || 0) / 100)
      }
      discount = Math.min(discount, Number(maxDiscount || 0))
      discount = Math.min(discount, bill)
    }

    return { earns, discount }
  }, [previewBill, pointsPerRupee, minOrderValue, redeemThreshold, redeemDiscountType, redeemDiscountValue, maxDiscount])

  const onSave = async () => {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const payload = {
        p_restaurant_id: restaurantId,
        p_enabled: !!enabled,
        p_points_per_rupee: Number(pointsPerRupee || 0),
        p_min_order_value: Number(minOrderValue || 0),
        p_redeem_threshold: Number(redeemThreshold || 0),
        p_redeem_discount_type: redeemDiscountType,
        p_redeem_discount_value: Number(redeemDiscountValue || 0),
        p_max_discount: Number(maxDiscount || 0),
        p_points_expiry_days: pointsExpiryDays === '' ? null : Number(pointsExpiryDays)
      }

      const { error } = await supabase.rpc('upsert_loyalty_settings', payload)
      if (error) throw error

      setSuccess('✅ Loyalty settings saved')
      setTimeout(() => setSuccess(''), 2000)
    } catch (e) {
      setError(e?.message || 'Failed to save loyalty settings')
    } finally {
      setSaving(false)
    }
  }

  if (checking || restLoading) return <div style={{ padding: 24 }}>Loading…</div>
  if (!restaurantId) return <div style={{ padding: 24 }}>No restaurant</div>

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <h1 className="h1">Loyalty</h1>
          <p className="subtitle">Configure earning, redemption, and expiry rules</p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" onClick={loadSettings} disabled={loading || saving}>Refresh</Button>
          <Button onClick={onSave} disabled={loading || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="cr-summary-grid">
        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="kpi-label">Status</span>
              <span className="kpi-value" style={{ color: enabled ? '#059669' : '#6b7280' }}>
                {enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="kpi-icon"><FaCog /></div>
          </div>
        </div>

        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="kpi-label">Earn rate</span>
              <span className="kpi-value">{Number(pointsPerRupee || 0).toFixed(3)} / ₹1</span>
            </div>
            <div className="kpi-icon"><FaGift /></div>
          </div>
        </div>

        <div className="summary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="kpi-label">Redeem threshold</span>
              <span className="kpi-value">{Number(redeemThreshold || 0)} pts</span>
            </div>
            <div className="kpi-icon"><FaWallet /></div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ color: '#b91c1c', marginBottom: 12, padding: 12, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 10 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ color: '#065f46', marginBottom: 12, padding: 12, background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 10 }}>
          {success}
        </div>
      )}

      <div className="panel">
        <div className="panel-title">Program toggle</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ color: '#6b7280', fontSize: 14 }}>
            When enabled, points will be awarded on completed orders and visible on the Customers page.
          </div>

          <Button
            variant={enabled ? 'outline' : undefined}
            onClick={() => setEnabled(v => !v)}
            style={{ minWidth: 140 }}
          >
            {enabled ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Earning rules</div>

        <div className="grid">
          <div className="field">
            <label>Points per ₹1 spent</label>
            <input value={pointsPerRupee} onChange={e => setPointsPerRupee(e.target.value)} type="number" step="0.001" />
            <div className="hint">Example: 0.01 = 1 point per ₹100.</div>
          </div>

          <div className="field">
            <label>Minimum order value (₹)</label>
            <input value={minOrderValue} onChange={e => setMinOrderValue(e.target.value)} type="number" step="1" />
            <div className="hint">Earn points only if bill is at least this amount.</div>
          </div>

          <div className="field">
            <label>Points expiry (days)</label>
            <input value={pointsExpiryDays} onChange={e => setPointsExpiryDays(e.target.value)} type="number" step="1" placeholder="Leave empty to disable" />
            <div className="hint">Optional. Common policy is 180–365 days. Leave empty to never expire.</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Redemption rules</div>

        <div className="grid">
          <div className="field">
            <label>Minimum points to redeem</label>
            <input value={redeemThreshold} onChange={e => setRedeemThreshold(e.target.value)} type="number" step="1" />
          </div>

          <div className="field">
            <label>Discount type</label>
            <NiceSelect
              value={redeemDiscountType}
              onChange={setRedeemDiscountType}
              options={[
                { value: 'percent', label: 'Percent (%)' },
                { value: 'amount', label: 'Fixed amount (₹)' }
              ]}
            />
          </div>

          <div className="field">
            <label>Discount value</label>
            <input value={redeemDiscountValue} onChange={e => setRedeemDiscountValue(e.target.value)} type="number" step="1" />
          </div>

          <div className="field">
            <label>Max discount per redemption (₹)</label>
            <input value={maxDiscount} onChange={e => setMaxDiscount(e.target.value)} type="number" step="1" />
            <div className="hint">Caps discounts to prevent misuse.</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Quick preview</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Bill amount (₹)</label>
            <input value={previewBill} onChange={e => setPreviewBill(e.target.value)} type="number" step="1" />
          </div>

          <div style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff7ed' }}>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Earns</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.black }}>{preview.earns} pts</div>
          </div>

          <div style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff7ed' }}>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Redeem value</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.orange }}>{fmt.format(preview.discount)}</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 12px; flex-wrap: wrap; }
        .subtitle { color: #6b7280; margin: 4px 0 0 0; }

        .cr-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .summary-card {
          background: white;
          padding: 16px 20px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          border-top: 4px solid #f97316;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .kpi-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.05em; }
        .kpi-value { font-size: 1.35rem; font-weight: 800; color: #1f2937; letter-spacing: -0.02em; }
        .kpi-icon { font-size: 1.25rem; color: #fed7aa; }

        .panel {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          margin-bottom: 16px;
        }
        .panel-title {
          font-weight: 800;
          color: #111827;
          margin-bottom: 12px;
          font-size: 14px;
        }
        .grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }
        .field label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }
        .field input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          outline: none;
          font-size: 14px;
          font-weight: 600;
          background: #fff;
        }
        .field input:focus {
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249,115,22,0.1);
        }
        .hint { font-size: 12px; color: #6b7280; margin-top: 6px; }
      `}</style>
    </div>
  )
}
