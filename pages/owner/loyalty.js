// pages/owner/loyalty.js
import { useEffect, useMemo, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import { getSupabase } from '../../services/supabase'
import { FaGift, FaWallet, FaCalculator, FaPlus, FaEdit, FaTrash, FaCheckCircle, FaStar } from 'react-icons/fa'
import Button from '../../components/ui/Button'

export default function OwnerLoyaltyPage() {
  const BRAND = { orange: '#f97316', black: '#111827', soft: '#fff7ed', strong: '#ea580c' }
  const supabase = getSupabase()
  const { checking } = useRequireAuth(supabase)
  const { restaurant, loading: restLoading } = useRestaurant()
  const restaurantId = restaurant?.id

  const [loading, setLoading] = useState(true)
  const [programs, setPrograms] = useState([])
  const [view, setView] = useState('list') // 'list' | 'edit'
  
  // Editor State
  const [edtId, setEdtId] = useState(null)
  
  // -- UX Fields --
  const [edtName, setEdtName] = useState('New Loyalty Program')
  const [edtActive, setEdtActive] = useState(true)
  const [edtDefault, setEdtDefault] = useState(false)
  
  const [spendBasis, setSpendBasis] = useState('100')
  const [earnPoints, setEarnPoints] = useState('1')
  const [minOrderValue, setMinOrderValue] = useState('0')
  const [pointsExpiryDays, setPointsExpiryDays] = useState('')

  const [pointValue, setPointValue] = useState('1.0') 
  const [redeemMinPoints, setRedeemMinPoints] = useState('100')
  const [maxRedeemAmount, setMaxRedeemAmount] = useState('500') 

  // Preview
  const [previewBill, setPreviewBill] = useState('1000')
  const fmt = useMemo(() => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }), [])

  useEffect(() => {
    if (checking || restLoading || !restaurantId) return
    loadPrograms()
  }, [checking, restLoading, restaurantId])

  const loadPrograms = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('loyalty_programs')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setPrograms(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const startCreate = () => {
    setEdtId(null)
    setEdtName('Standard Rewards')
    setEdtActive(true)
    setEdtDefault(programs.length === 0) // Default if first
    
    // Default Rules
    setSpendBasis('100')
    setEarnPoints('1')
    setMinOrderValue('0')
    setPointsExpiryDays('')
    setPointValue('1.0')
    setRedeemMinPoints('100')
    setMaxRedeemAmount('500')
    
    setView('edit')
  }

  const startEdit = (prog) => {
    setEdtId(prog.id)
    setEdtName(prog.name)
    setEdtActive(prog.is_active)
    setEdtDefault(prog.is_default)
    
    // Rev-Calc Ratio
    const ratio = Number(prog.earn_rate_ratio || 0.01)
    setSpendBasis('100')
    setEarnPoints(String(+(ratio * 100).toFixed(2)))

    setMinOrderValue(String(prog.min_order_value_for_earning || 0))
    setPointsExpiryDays(prog.expiry_days || '')
    
    setPointValue(String(prog.redemption_conversion_rate || 1.0))
    setRedeemMinPoints(String(prog.redemption_min_points || 100))
    setMaxRedeemAmount(String(prog.max_redemption_amount_per_order || 500))
    
    setView('edit')
  }

  const handleDelete = async (id, e) => {
     e.stopPropagation();
     if(!confirm('Are you sure? Customers assigned to this program might stop earning points.')) return;
     await supabase.from('loyalty_programs').delete().eq('id', id);
     loadPrograms();
  }

  const onSave = async () => {
    try {
      const sb = Number(spendBasis) || 100
      const ep = Number(earnPoints) || 0
      const ratio = sb > 0 ? (ep / sb) : 0

      // If setting default, unset others first
      if (edtDefault) {
         await supabase.from('loyalty_programs').update({ is_default: false }).eq('restaurant_id', restaurantId)
      }

      const payload = {
         restaurant_id: restaurantId,
         name: edtName,
         is_active: edtActive,
         is_default: edtDefault,
         
         earn_rate_ratio: ratio,
         min_order_value_for_earning: Number(minOrderValue) || 0,
         earn_rate_description: `Earn ${ep} pt/${sb} spent`,
         
         redemption_conversion_rate: Number(pointValue) || 0,
         redemption_min_points: Number(redeemMinPoints) || 0,
         max_redemption_amount_per_order: Number(maxRedeemAmount) || 0,
         
         expiry_days: pointsExpiryDays ? Number(pointsExpiryDays) : null
         // updated_at: new Date().toISOString() // removed as column does not exist
      }

      if (edtId) {
        const { error } = await supabase.from('loyalty_programs').update(payload).eq('id', edtId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('loyalty_programs').insert([payload])
        if (error) throw error
      }
      
      await loadPrograms()
      setView('list')
    } catch (e) {
      alert('Error saving: ' + e.message)
    }
  }

  // Preview Logic
  const preview = useMemo(() => {
    const bill = Number(previewBill || 0)
    const sb = Number(spendBasis) || 100
    const ep = Number(earnPoints) || 0
    const ratio = sb > 0 ? (ep / sb) : 0
    const minV = Number(minOrderValue || 0)
    
    const earned = bill >= minV ? Math.floor(bill * ratio) : 0
    const valPerPt = Number(pointValue || 0)
    const value = earned * valPerPt
    
    return { earned, value }
  }, [previewBill, spendBasis, earnPoints, minOrderValue, pointValue])

  if (checking || restLoading) return <div style={{ padding: 40, color: '#6b7280' }}>Loading...</div>
  
  // ---- LIST VIEW ----
  if (view === 'list') {
      return (
        <div className="container page">
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
             <div>
                <h1 className="h1" style={{ marginBottom: 4 }}>Loyalty Programs</h1>
                <p className="subtitle">Manage tier levels or special earning programs.</p>
             </div>
             <Button onClick={startCreate} style={{ padding: '10px 24px', fontSize: 14 }}>
               <FaPlus /> New Program
             </Button>
           </div>
           
           <div className="prog-grid">
              {programs.map(p => (
                 <div key={p.id} className="prog-card" onClick={() => startEdit(p)}>
                    <div className="prog-head">
                       <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                           <span style={{ fontWeight: 800, fontSize: 16 }}>{p.name}</span>
                           {p.is_default && <span className="badge badge-def"><FaStar size={10} /> Default</span>}
                           {!p.is_active && <span className="badge badge-inact">Inactive</span>}
                       </div>
                       <div className="acts">
                           {/* <button className="act-btn" onClick={(e) => handleDelete(p.id, e)}><FaTrash /></button> */}
                       </div>
                    </div>
                    
                    <div className="prog-stat">
                       <div className="lbl">Earn Rate</div>
                       <div className="val">{p.earn_rate_description}</div>
                    </div>
                    <div className="prog-stat">
                       <div className="lbl">Redemption</div>
                       <div className="val">1 Pt = ₹{p.redemption_conversion_rate}</div>
                    </div>
                 </div>
              ))}
              
              {programs.length === 0 && !loading && (
                 <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#6b7280', background: '#f9fafb', borderRadius: 12, border: '1px dashed #e5e7eb' }}>
                    No programs created yet.
                 </div>
              )}
           </div>
           
           <style jsx>{`
             .prog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
             .prog-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s; }
             .prog-card:hover { border-color: ${BRAND.orange}; box-shadow: 0 4px 12px rgba(0,0,0,0.05); transform: translateY(-2px); }
             .prog-head { display: flex; justify-content: space-between; margin-bottom: 20px; }
             .badge { font-size: 10px; padding: 2px 8px; borderRadius: 20px; text-transform: uppercase; fontWeight: 800; display: flex; align-items: center; gap: 4px; }
             .badge-def { background: #fef3c7; color: #d97706; }
             .badge-inact { background: #f3f4f6; color: #6b7280; }
             
             .prog-stat { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
             .prog-stat .lbl { color: #6b7280; }
             .prog-stat .val { color: #111827; fontWeight: 600; }
             
             .act-btn { border: none; background: transparent; color: #ef4444; padding: 8px; border-radius: 6px; cursor: pointer; }
             .act-btn:hover { background: #fee2e2; }
           `}</style>
        </div>
      )
  }

  // ---- EDIT VIEW ----
  return (
    <div className="container page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280' }}>←</button>
            <div>
              <h1 className="h1" style={{ marginBottom: 4 }}>{edtId ? 'Edit Program' : 'New Program'}</h1>
            </div>
         </div>
         <Button onClick={onSave} style={{ padding: '10px 24px', fontSize: 16 }}>
            Save Changes
         </Button>
      </div>

      {/* Main Grid */}
      <div className="loyalty-grid">
         
         {/* Config Card */}
         <div className="panel status-panel" style={{ gridColumn: '1 / -1' }}>
            <div className="field-group">
                <label>Program Name</label>
                <input type="text" value={edtName} onChange={e => setEdtName(e.target.value)} placeholder="e.g. Gold Tier" style={{ fontSize: 18, border: '1px solid #d1d5db', padding: '12px', borderRadius: 8, width: '100%' }} />
            </div>
            
            <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="active-check" checked={edtActive} onChange={e => setEdtActive(e.target.checked)} style={{ width: 18, height: 18, accentColor: BRAND.orange }} />
                    <label htmlFor="active-check" style={{ margin: 0, fontSize: 14, cursor: 'pointer' }}>Program Active</label>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="default-check" checked={edtDefault} onChange={e => setEdtDefault(e.target.checked)} style={{ width: 18, height: 18, accentColor: BRAND.orange }} />
                    <label htmlFor="default-check" style={{ margin: 0, fontSize: 14, cursor: 'pointer' }}>Is Default <span style={{ color: '#6b7280', fontSize: 12 }}>(Auto-assigned to new customers)</span></label>
                </div>
            </div>
         </div>

         {/* Earning Rules */}
         <div className="panel">
            <div className="panel-header">
               <div className="icon-box" style={{ color: BRAND.orange, background: BRAND.soft }}><FaGift /></div>
               <h3>Earning Rules</h3>
            </div>
            
            <div className="field-group">
               <label>Reward Rate</label>
               <div className="input-row">
                  <span>Give</span>
                  <input type="number" value={earnPoints} onChange={e => setEarnPoints(e.target.value)} style={{ width: 60, textAlign: 'center' }} />
                  <span>Point(s) for every ₹</span>
                  <input type="number" value={spendBasis} onChange={e => setSpendBasis(e.target.value)} style={{ width: 80, textAlign: 'center' }} />
                  <span>spent</span>
               </div>
               <div className="hint">
                  Ratio: {((Number(earnPoints)/Number(spendBasis))*100).toFixed(1)}% return
               </div>
            </div>

            <div className="field-group">
               <label>Minimum Order Value</label>
               <input type="number" value={minOrderValue} onChange={e => setMinOrderValue(e.target.value)} placeholder="0" />
               <div className="hint">Minimum bill amount required to earn points</div>
            </div>

            <div className="field-group">
               <label>Points Expiry (Days)</label>
               <input type="number" value={pointsExpiryDays} onChange={e => setPointsExpiryDays(e.target.value)} placeholder="Never" />
               <div className="hint">Days before unused points expire</div>
            </div>
         </div>

         {/* Redemption Rules - UPDATED COLORS (No Blue) */}
         <div className="panel">
            <div className="panel-header">
               {/* Was blue/blue, now orange/orange-soft */}
               <div className="icon-box" style={{ color: BRAND.strong, background: '#ffedd5' }}><FaWallet /></div>
               <h3>Redemption Rules</h3>
            </div>

            <div className="field-group">
               <label>Point Value</label>
               <div className="input-row">
                  <span>1 Point = ₹</span>
                  {/* Was blue, now strong orange */}
                  <input type="number" step="0.1" value={pointValue} onChange={e => setPointValue(e.target.value)} style={{ width: 80, fontWeight: 800, color: BRAND.strong }} />
               </div>
               <div className="hint">Cash value of each point during redemption</div>
            </div>

            <div className="field-group">
               <label>Minimum Points to Redeem</label>
               <input type="number" value={redeemMinPoints} onChange={e => setRedeemMinPoints(e.target.value)} />
               <div className="hint">Customer needs at least this many points</div>
            </div>

            <div className="field-group">
               <label>Max Redemption (₹)</label>
               <input type="number" value={maxRedeemAmount} onChange={e => setMaxRedeemAmount(e.target.value)} />
               <div className="hint">Maximum discount allowed per order</div>
            </div>
         </div>

         {/* Preview - UPDATED COLORS (No Black) */}
         <div className="panel preview-panel" style={{ gridColumn: '1 / -1', background: '#fff7ed', color: '#111827', border: '1px solid #fed7aa' }}>
            <div className="panel-header" style={{ marginBottom: 16 }}>
               <div className="icon-box" style={{ background: '#fff', color: '#f97316', border: '1px solid #fdba74' }}><FaCalculator /></div>
               <h3 style={{ color: '#9a3412' }}>Live Preview</h3>
            </div>
            
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
               <div className="preview-input">
                  <label style={{ color: '#9a3412' }}>If a customer spends</label>
                  <div className="p-input-wrap" style={{ background: '#fff', border: '1px solid #fdba74' }}>
                     <span style={{ color: '#f97316' }}>₹</span>
                     <input type="number" value={previewBill} onChange={e => setPreviewBill(e.target.value)} style={{ color: '#7c2d12' }} />
                  </div>
               </div>

               <div className="arrow" style={{ color: '#fb923c' }}>➜</div>

               <div className="preview-result">
                  <div className="lbl" style={{ color: '#9a3412' }}>They Earn</div>
                  <div className="val" style={{ color: '#111827' }}>{preview.earned} <span className="unit" style={{ color: '#9a3412' }}>Points</span></div>
               </div>

               <div className="arrow" style={{ color: '#fb923c' }}>➜</div>

               <div className="preview-result">
                  <div className="lbl" style={{ color: '#9a3412' }}>Worth</div>
                  <div className="val" style={{ color: '#ea580c' }}>{fmt.format(preview.value)}</div>
               </div>
            </div>
         </div>

      </div>

      <style jsx>{`
        .loyalty-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          gap: 24px;
          max-width: 1000px;
        }

        .panel {
          background: white;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          padding: 24px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }

        .panel-header {
           display: flex;
           align-items: center;
           gap: 12px;
           margin-bottom: 20px;
        }
        .panel-header h3 { margin: 0; font-size: 18px; font-weight: 700; color: #111827; }
        .icon-box {
           width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justifyContent: center; font-size: 18px;
        }

        .field-group { margin-bottom: 20px; }
        .field-group label {
           display: block; font-size: 13px; font-weight: 700; color: #4b5563; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.02em;
        }
        .field-group input {
           width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; fontSize: 15px; font-weight: 600; outline: none; transition: all 0.2s;
        }
        .field-group input:focus { border-color: ${BRAND.orange}; box-shadow: 0 0 0 3px ${BRAND.orange}20; }
        
        .input-row {
           display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500; color: #374151;
        }
        .hint { font-size: 13px; color: #9ca3af; margin-top: 6px; }

        /* Preview */
        .preview-input label { font-size: 12px; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 6px; }
        .p-input-wrap { display: flex; align-items: center; border-radius: 8px; padding: 0 12px; }
        .p-input-wrap span { font-weight: 600; }
        .p-input-wrap input { background: transparent; border: none; font-size: 18px; font-weight: 700; padding: 10px 0 10px 8px; width: 100px; }
        
        .arrow { font-size: 20px; }
        .preview-result .lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
        .preview-result .val { font-size: 24px; font-weight: 800; line-height: 1; }
        .preview-result .unit { font-size: 14px; font-weight: 600; }
      `}</style>
    </div>
  )
}
