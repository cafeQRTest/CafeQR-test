//components/LibraryPicker.js

import React, { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import NiceSelect from './NiceSelect'

export default function LibraryPicker({ supabase, open, onClose, restaurantId, onAdded, enableMenuImages }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [list, setList] = useState([])
  const [cats, setCats] = useState([])       // [{id,name}]
  const [q, setQ] = useState('')
  const [vegOnly, setVegOnly] = useState(false)
  const [cat, setCat] = useState('all')      // category_id filter
  const [selected, setSelected] = useState({}) // id -> price

  const [markPackaged, setMarkPackaged] = useState(false)
  const [defaultTax, setDefaultTax] = useState(0)
  const [defaultCess, setDefaultCess] = useState(0)

  useEffect(() => {
    if (!open) return
    setSelected({})
    setQ('')
    setVegOnly(false)
    setCat('all')
    setMarkPackaged(false)
    setDefaultTax(0)
    setDefaultCess(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [open])

  useEffect(() => {
    if (!supabase) return
    if (!open || !restaurantId) return
    const load = async () => {
      setLoading(true); setError('')
      try {
        const { data: categories, error: catErr } = await supabase
          .from('categories')
          .select('id,name')
          .or(`is_global.eq.true,restaurant_id.eq.${restaurantId}`)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true })
        if (catErr) throw catErr

        const { data: items, error: libErr } = await supabase
          .from('menu_library_items')
          .select('id,name,default_price,veg,description,image_url,category_id')
        if (libErr) throw libErr

        setCats(categories || [])
        setList(items || [])
      } catch (e) {
        setError(e.message || 'Failed to load library')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open, restaurantId, supabase])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (list || []).filter(it => {
      if (vegOnly && !it.veg) return false
      if (cat !== 'all' && it.category_id !== cat) return false
      if (!needle) return true
      return (it.name || '').toLowerCase().includes(needle)
    })
  }, [list, vegOnly, cat, q])

  const toggle = it => {
    setSelected(prev => {
      const next = { ...prev }
      if (next[it.id] !== undefined) delete next[it.id]
      else next[it.id] = Number(it.default_price ?? 0)
      return next
    })
  }

  const setPrice = (id, price) => {
    const num = Number(price)
    setSelected(prev => ({ ...prev, [id]: Number.isFinite(num) ? num : 0 }))
  }

  const addSelected = async () => {
    if (!supabase) return
    const ids = Object.keys(selected)
    if (!ids.length) {
      setError('Please select at least one item to add.')
      return
    }
    if (!restaurantId) {
      setError('Restaurant not selected.')
      return
    }
    setLoading(true); setError('')
    try {
      const rows = ids.map(id => {
        const it = list.find(x => x.id === id)
        const price = Number(selected[id] ?? it?.default_price ?? 0)
        const catName = cats.find(c => c.id === it?.category_id)?.name || 'main'
        return {
          restaurant_id: restaurantId,
          name: it?.name || '',
          price: Number.isFinite(price) ? price : 0,
          veg: !!it?.veg,
          category: catName,
          is_available: true,
          description: it?.description ?? null,
          image_url: it?.image_url ?? null,
          library_item_id: it?.id || null,
          is_packaged_good: !!markPackaged,
          tax_rate: Number(defaultTax || 0),
          compensation_cess_rate: Number(defaultCess || 0),
        }
      })

      const { data, error } = await supabase
        .from('menu_items')
        .insert(rows)
        .select('id, name, price, category, veg, status, hsn, tax_rate, is_packaged_good, compensation_cess_rate, image_url, description')
      if (error) throw error

      onAdded?.(data || [])
      onClose?.()
    } catch (e) {
      setError(e.message || 'Failed to add selected items')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="lib-overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="lib-card">
        <div className="lib-head">
          <h2 style={{ margin: 0, fontSize: 20 }}>Add from Library</h2>
          <Button size="sm" variant="outline" onClick={onClose} disabled={loading}>Close</Button>
        </div>

        <div className="lib-filters">
          <div className="filters-row">
            <input
              className="input"
              placeholder="Search items…"
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ fontSize: 16 }}
            />
            <label className="flag">
              <input type="checkbox" checked={vegOnly} onChange={e => setVegOnly(e.target.checked)} />
              <span className="muted">Veg only</span>
            </label>
            <div style={{ minWidth: 180 }}>
              <NiceSelect
                value={cat}
                onChange={setCat}
                placeholder="All categories"
                options={[
                  { value: 'all', label: 'All categories' },
                  ...cats.map(c => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
          </div>

          <div className="filters-row filters-row--packaged">
            <label className="flag">
              <input type="checkbox" checked={markPackaged} onChange={e => setMarkPackaged(e.target.checked)} />
              <span className="muted">Mark as packaged</span>
            </label>
            {markPackaged && (
              <div className="grid-2">
                <label className="field">
                  <span>Default Tax %</span>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={defaultTax}
                    onChange={e => setDefaultTax(e.target.value)}
                    style={{ fontSize: 16 }}
                    placeholder="e.g., 28"
                  />
                </label>
                <label className="field">
                  <span>Cess %</span>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={defaultCess}
                    onChange={e => setDefaultCess(e.target.value)}
                    style={{ fontSize: 16 }}
                    placeholder="e.g., 12"
                  />
                </label>
              </div>
            )}
          </div>

          {error && (
            <div className="card" style={{ padding: 12, borderColor: '#fecaca', background: '#fff1f2' }}>
              <div style={{ color: '#b91c1c' }}>{error}</div>
            </div>
          )}
        </div>

        <div className="lib-body">
          {loading ? (
            <div className="card" style={{ padding: 16 }}>Loading…</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Name</th>
                    {enableMenuImages && <th style={{ width: 60 }}>Image</th>}
                    <th style={{ width: 100 }}>Veg</th>
                    <th style={{ width: 140 }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 12, color: '#6b7280' }}>No items match your filters.</td></tr>
                  ) : filtered.map(it => {
                    const checked = selected[it.id] !== undefined
                    const currentPrice = selected[it.id] ?? it.default_price ?? 0
                    return (
                      <tr key={it.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(it)}
                            aria-label={`Select ${it.name}`}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="truncate">{it.name}</span>
                            {it.description && <span style={{ fontSize: 11, color: '#999' }} className="truncate">{it.description}</span>}
                          </div>
                        </td>
                        {enableMenuImages && (
                          <td>
                            {it.image_url ? (
                              <img src={it.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: 32, height: 32, background: '#f3f4f6', borderRadius: 4 }} />
                            )}
                          </td>
                        )}
                        <td>{it.veg ? 'Veg' : 'Non-veg'}</td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            step="0.01"
                            value={currentPrice}
                            onChange={e => setPrice(it.id, e.target.value)}
                            disabled={!checked}
                            style={{ width: 100, fontSize: 14 }}
                            inputMode="decimal"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lib-foot">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={addSelected} disabled={loading || !Object.keys(selected).length}>
            {loading ? 'Adding…' : 'Add Selected'}
          </Button>
        </div>
      </div>

      <style jsx>{`
        .lib-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.45);
          z-index: 1000;
          display: grid; place-items: center;
          padding: env(safe-area-inset-top) 8px calc(8px + env(safe-area-inset-bottom)) 8px;
          overscroll-behavior: contain;
        }
        .lib-card {
          width: min(100%, 740px);
          max-height: 90vh;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0,0,0,.25);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .lib-head {
          position: sticky; top: 0; z-index: 2;
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 12px 14px; border-bottom: 1px solid #e5e7eb; background: #fff;
        }
        .lib-filters { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; background: #fff; }
        .filters-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; }
        @media (max-width: 480px) { .filters-row { grid-template-columns: 1fr auto; } }
        .filters-row--packaged { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .flag { display: inline-grid; grid-auto-flow: column; align-items: center; column-gap: 6px; white-space: nowrap; }
        .flag input[type="checkbox"] { margin: 0; inline-size: 20px; block-size: 20px; }
        .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
        .field span { display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px; }
        .lib-body { overflow: auto; -webkit-overflow-scrolling: touch; padding: 0 14px 14px 14px; }
        .truncate { display: inline-block; max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        @media (max-width: 640px) { .truncate { max-width: 160px; } }
        .table { width: 100%; border-collapse: collapse; background: #fff; }
        .table th, .table td { padding: 10px; border-bottom: 1px solid #f3f4f6; text-align: left; white-space: nowrap; }
        .table thead th { position: sticky; top: 0; z-index: 1; background: #f9fafb; }
        .lib-foot { position: sticky; bottom: 0; padding: 12px 14px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid #e5e7eb; background: #fff; display: flex; gap: 8px; justify-content: flex-end; }
      `}</style>
    </div>
  )
}
