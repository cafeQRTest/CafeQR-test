import React, { useEffect, useState } from 'react'
import { useRequireAuth } from '../../lib/useRequireAuth'
import { useRestaurant } from '../../context/RestaurantContext'
import Card from '../../components/ui/Card'
import Table from '../../components/ui/Table'
import { getSupabase } from '../../services/supabase'

export default function ProductionPage() {
  const supabase = getSupabase()
  const { checking } = useRequireAuth(supabase)
  const { restaurant, loading: restLoading } = useRestaurant()
  const restaurantId = restaurant?.id || ''

  const [productionDate, setProductionDate] = useState(new Date().toISOString().split('T')[0])
  const [shift, setShift] = useState('morning')
  const [items, setItems] = useState([])
  const [newItem, setNewItem] = useState({ name: '', quantity: '', cost_per_unit: '' })
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState('entry')
  const [productionRecords, setProductionRecords] = useState([])
  const [balanceReport, setBalanceReport] = useState([])
  const [selectedReportDate, setSelectedReportDate] = useState(new Date().toISOString().split('T')[0])
  
  // Edit mode states
  const [editingRecordId, setEditingRecordId] = useState(null)
  const [editingData, setEditingData] = useState({ shift: '', items: [] })
  const [editingItems, setEditingItems] = useState([])

  // Fetch menu items on mount
  useEffect(() => {
    if (!restaurantId || !supabase) return
    const fetchMenuItems = async () => {
      const { data, error: err } = await supabase
        .from('menu_items')
        .select('id, name, category')
        .eq('restaurant_id', restaurantId)
      if (!err && data) setMenuItems(data)
    }
    fetchMenuItems()
  }, [restaurantId, supabase])

  // Load production records and balance report
  useEffect(() => {
    if (!restaurantId || !supabase || activeTab !== 'reports') return
    loadProductionRecords()
  }, [restaurantId, supabase, activeTab, selectedReportDate])

  const loadProductionRecords = async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const { data: records, error: recErr } = await supabase
        .from('production_records')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('production_date', selectedReportDate)
        .order('created_at', { ascending: false })

      if (recErr) throw recErr
      
      // Fetch items for each record
      const recordsWithItems = await Promise.all(
        records.map(async (record) => {
          const { data: items } = await supabase
            .from('production_items')
            .select('*')
            .eq('production_record_id', record.id)
          return { ...record, items: items || [] }
        })
      )
      
      setProductionRecords(recordsWithItems)
      await calculateBalance()
    } catch (err) {
      setError(err.message || 'Failed to load production records')
    } finally {
      setLoading(false)
    }
  }

  const calculateBalance = async () => {
    if (!supabase) return
    try {
      const { data: prodRecords, error: recErr } = await supabase
        .from('production_records')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('production_date', selectedReportDate)

      if (recErr) throw recErr
      if (!prodRecords || prodRecords.length === 0) {
        setBalanceReport([])
        return
      }

      const recordIds = prodRecords.map(r => r.id)

      const { data: prodItems, error: prodErr } = await supabase
        .from('production_items')
        .select('id, item_name, quantity_produced')
        .in('production_record_id', recordIds)

      if (prodErr) throw prodErr

      const { data: orders, error: ordErr } = await supabase
        .from('orders')
        .select('items')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', `${selectedReportDate}T00:00:00`)
        .lte('created_at', `${selectedReportDate}T23:59:59`)
        .neq('status', 'cancelled')

      if (ordErr) throw ordErr

      const soldMap = {}
      orders?.forEach(order => {
        order.items?.forEach(item => {
          const name = item.name || 'Unknown Item'
          soldMap[name] = (soldMap[name] || 0) + (Number(item.quantity) || 1)
        })
      })

      const balanceData = prodItems?.map(pi => ({
        item_name: pi.item_name,
        produced: pi.quantity_produced,
        sold: soldMap[pi.item_name] || 0,
        balance: pi.quantity_produced - (soldMap[pi.item_name] || 0),
        wasteStatus: pi.quantity_produced - (soldMap[pi.item_name] || 0) > 0 ? '⚠️ Unsold' : '✅ All Sold'
      })) || []

      setBalanceReport(balanceData)
    } catch (err) {
      setError(err.message || 'Failed to calculate balance')
    }
  }

  const handleAddItem = () => {
    if (!newItem.name || !newItem.quantity) {
      setError('Please fill in item name and quantity')
      return
    }
    setItems([
      ...items,
      {
        name: newItem.name,
        quantity: Number(newItem.quantity),
        cost_per_unit: Number(newItem.cost_per_unit) || 0,
        menu_item_id: menuItems.find(m => m.name === newItem.name)?.id || null
      }
    ])
    setNewItem({ name: '', quantity: '', cost_per_unit: '' })
    setError('')
  }

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleSaveProduction = async () => {
    if (items.length === 0) {
      setError('Please add at least one item')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const { data: record, error: recErr } = await supabase
        .from('production_records')
        .insert({
          restaurant_id: restaurantId,
          source_restaurant_id: restaurantId,
          production_date: productionDate,
          shift,
          status: 'pending'
        })
        .select()
        .single()

      if (recErr) throw recErr

      const itemsData = items.map(item => ({
        production_record_id: record.id,
        menu_item_id: item.menu_item_id,
        item_name: item.name,
        quantity_produced: item.quantity,
        quantity_transferred: 0,
        cost_per_unit: item.cost_per_unit
      }))

      const { error: itemsErr } = await supabase
        .from('production_items')
        .insert(itemsData)

      if (itemsErr) throw itemsErr

      setSuccess('✅ Production record saved successfully!')
      setItems([])
      setNewItem({ name: '', quantity: '', cost_per_unit: '' })
      setTimeout(() => {
        setSuccess('')
        loadProductionRecords()
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to save production record')
    } finally {
      setLoading(false)
    }
  }

  // ✅ START EDITING A RECORD
  const handleEditRecord = (record) => {
    setEditingRecordId(record.id)
    setEditingData({ shift: record.shift })
    setEditingItems(record.items.map(item => ({
      id: item.id,
      name: item.item_name,
      quantity: item.quantity_produced,
      cost_per_unit: item.cost_per_unit
    })))
    setError('')
  }

  // ✅ UPDATE ITEM IN EDIT MODE
  const handleUpdateEditItem = (index, field, value) => {
    const updated = [...editingItems]
    updated[index] = { ...updated[index], [field]: value }
    setEditingItems(updated)
  }

  // ✅ SAVE EDITED RECORD
  const handleSaveEditedRecord = async () => {
    setLoading(true)
    try {
      // Update production record
      const { error: recErr } = await supabase
        .from('production_records')
        .update({ shift: editingData.shift })
        .eq('id', editingRecordId)

      if (recErr) throw recErr

      // Update each production item
      for (let item of editingItems) {
        if (item.id) {
          const { error: itemErr } = await supabase
            .from('production_items')
            .update({
              item_name: item.name,
              quantity_produced: Number(item.quantity),
              cost_per_unit: Number(item.cost_per_unit)
            })
            .eq('id', item.id)

          if (itemErr) throw itemErr
        }
      }

      setSuccess('✅ Production record updated successfully!')
      setEditingRecordId(null)
      setTimeout(() => {
        setSuccess('')
        loadProductionRecords()
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to update production record')
    } finally {
      setLoading(false)
    }
  }

  // ✅ DELETE RECORD
  const handleDeleteRecord = async (recordId) => {
    if (!window.confirm('Are you sure you want to delete this production record? This cannot be undone.')) {
      return
    }

    setLoading(true)
    try {
      // Delete all production items first
      const { error: itemsErr } = await supabase
        .from('production_items')
        .delete()
        .eq('production_record_id', recordId)

      if (itemsErr) throw itemsErr

      // Delete production record
      const { error: recErr } = await supabase
        .from('production_records')
        .delete()
        .eq('id', recordId)

      if (recErr) throw recErr

      setSuccess('✅ Production record deleted successfully!')
      setTimeout(() => {
        setSuccess('')
        loadProductionRecords()
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to delete production record')
    } finally {
      setLoading(false)
    }
  }

  // ✅ CANCEL EDITING
  const handleCancelEdit = () => {
    setEditingRecordId(null)
    setEditingData({ shift: '' })
    setEditingItems([])
  }

  if (checking || restLoading) return <div style={{ padding: 16 }}>Loading…</div>
  if (!restaurantId) return <div style={{ padding: 16 }}>No restaurant selected</div>

  return (
    <div className="production-page-container">
      <div className="production-header">
        <h1>🏭 Production Management</h1>
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'entry' ? 'active' : ''}`}
            onClick={() => setActiveTab('entry')}
          >
            ➕ New Entry
          </button>
          <button
            className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            📊 Reports & Balance
          </button>
        </div>
      </div>

      {error && (
        <Card style={{
          marginBottom: 12,
          borderColor: '#fecaca',
          background: '#fff1f2',
          color: '#b91c1c',
          padding: 12
        }}>
          {error}
        </Card>
      )}

      {success && (
        <Card style={{
          marginBottom: 12,
          borderColor: '#86efac',
          background: '#f0fdf4',
          color: '#166534',
          padding: 12
        }}>
          {success}
        </Card>
      )}

      {activeTab === 'entry' && (
        <div className="production-entry">
          <Card style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Production Entry Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 12 }}>
                  Production Date
                </label>
                <input
                  type="date"
                  value={productionDate}
                  onChange={(e) => setProductionDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 14
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 12 }}>
                  Shift
                </label>
                <select
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 14
                  }}
                >
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </div>
            </div>
          </Card>

          <Card style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Add Items</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 12, alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 12 }}>
                  Item Name
                </label>
                <input
                  list="menu-items"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="Type or select..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 14
                  }}
                />
                <datalist id="menu-items">
                  {menuItems.map(item => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 12 }}>
                  Quantity
                </label>
                <input
                  type="number"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 14
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 12 }}>
                  Cost/Unit
                </label>
                <input
                  type="number"
                  value={newItem.cost_per_unit}
                  onChange={(e) => setNewItem({ ...newItem, cost_per_unit: e.target.value })}
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 14
                  }}
                />
              </div>
              <button
                onClick={handleAddItem}
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14
                }}
              >
                + Add
              </button>
            </div>

            {items.length > 0 && (
              <div className="production-items-table">
                <Table
                  columns={[
                    { header: 'Item Name', accessor: 'name' },
                    { header: 'Quantity', accessor: 'quantity' },
                    { header: 'Cost/Unit', accessor: 'cost_per_unit', cell: (r) => `₹${r.cost_per_unit.toFixed(2)}` },
                    {
                      header: 'Total Cost',
                      accessor: (row) => row.quantity * row.cost_per_unit,
                      cell: (r) => `₹${(r.quantity * r.cost_per_unit).toFixed(2)}`
                    },
                    {
                      header: 'Action',
                      accessor: (row, idx) => (
                        <button
                          onClick={() => handleRemoveItem(idx)}
                          style={{
                            padding: '4px 8px',
                            background: '#ef4444',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Remove
                        </button>
                      )
                    }
                  ]}
                  data={items}
                />
              </div>
            )}
          </Card>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSaveProduction}
              disabled={loading || items.length === 0}
              style={{
                padding: '12px 24px',
                background: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 14,
                opacity: loading || items.length === 0 ? 0.6 : 1
              }}
            >
              {loading ? 'Saving...' : '✅ Save Production Record'}
            </button>
            <button
              onClick={() => {
                setItems([])
                setNewItem({ name: '', quantity: '', cost_per_unit: '' })
                setError('')
              }}
              style={{
                padding: '12px 24px',
                background: '#6b7280',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 14
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="production-reports">
          <Card style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>📅 Select Date to View</h3>
            <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>⚠️ Note: Production & sales data is reset daily. Only same-day records are shown.</p>
            <input
              type="date"
              value={selectedReportDate}
              onChange={(e) => setSelectedReportDate(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                fontSize: 14
              }}
            />
          </Card>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>Loading reports…</div>
          ) : (
            <>
              <Card style={{ padding: 16, marginBottom: 16 }}>
                <h3 style={{ marginTop: 0, fontSize: '1rem' }}>📋 Production Records - {selectedReportDate}</h3>
                {productionRecords.length === 0 ? (
                  <p style={{ color: '#6b7280' }}>No production records for {selectedReportDate}</p>
                ) : (
                  <div style={{ fontSize: 13 }}>
                    {productionRecords.map((rec, idx) => (
                      <div key={rec.id}>
                        {editingRecordId === rec.id ? (
                          // ✅ EDIT MODE
                          <Card style={{ padding: 16, marginBottom: 16, background: '#fef3c7', border: '1px solid #fbbf24' }}>
                            <div style={{ marginBottom: 16 }}>
                              <label style={{ fontWeight: 600, marginBottom: 4 }}>Shift</label>
                              <select
                                value={editingData.shift}
                                onChange={(e) => setEditingData({ ...editingData, shift: e.target.value })}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: 6,
                                  fontSize: 14
                                }}
                              >
                                <option value="morning">Morning</option>
                                <option value="afternoon">Afternoon</option>
                                <option value="evening">Evening</option>
                              </select>
                            </div>

                            <h4 style={{ marginTop: 12, marginBottom: 8 }}>Edit Items</h4>
                            {editingItems.map((item, itemIdx) => (
                              <div key={itemIdx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                                <input
                                  value={item.name}
                                  onChange={(e) => handleUpdateEditItem(itemIdx, 'name', e.target.value)}
                                  placeholder="Item name"
                                  style={{ padding: '8px', border: '1px solid #e5e7eb', borderRadius: 4 }}
                                />
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateEditItem(itemIdx, 'quantity', Number(e.target.value))}
                                  placeholder="Qty"
                                  style={{ padding: '8px', border: '1px solid #e5e7eb', borderRadius: 4 }}
                                />
                                <input
                                  type="number"
                                  value={item.cost_per_unit}
                                  onChange={(e) => handleUpdateEditItem(itemIdx, 'cost_per_unit', Number(e.target.value))}
                                  placeholder="Cost"
                                  style={{ padding: '8px', border: '1px solid #e5e7eb', borderRadius: 4 }}
                                />
                              </div>
                            ))}

                            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                              <button
                                onClick={handleSaveEditedRecord}
                                disabled={loading}
                                style={{
                                  padding: '8px 16px',
                                  background: '#10b981',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                              >
                                {loading ? 'Saving...' : '💾 Save Changes'}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                style={{
                                  padding: '8px 16px',
                                  background: '#6b7280',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                              >
                                ✖️ Cancel
                              </button>
                            </div>
                          </Card>
                        ) : (
                          // ✅ VIEW MODE
                          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div><strong>Record #{idx + 1}</strong> | Shift: {rec.shift.toUpperCase()} | Status: {rec.status}</div>
                                <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
                                  Created: {new Date(rec.created_at).toLocaleString()}
                                </div>
                                {rec.items && rec.items.length > 0 && (
                                  <div style={{ marginTop: 8, fontSize: 12 }}>
                                    {rec.items.map((item, itemIdx) => (
                                      <div key={itemIdx}>
                                        • {item.item_name}: {item.quantity_produced} units @ ₹{item.cost_per_unit}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={() => handleEditRecord(rec)}
                                  style={{
                                    padding: '6px 12px',
                                    background: '#3b82f6',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    fontWeight: 600
                                  }}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteRecord(rec.id)}
                                  disabled={loading}
                                  style={{
                                    padding: '6px 12px',
                                    background: '#ef4444',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    opacity: loading ? 0.6 : 1
                                  }}
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card style={{ padding: 16 }}>
                <h3 style={{ marginTop: 0, fontSize: '1rem' }}>⚖️ Item Balance Report - {selectedReportDate}</h3>
                <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 12px 0' }}>Produced vs Sold on this date only (no carry-forward to next day)</p>
                {balanceReport.length === 0 ? (
                  <p style={{ color: '#6b7280' }}>No balance data for {selectedReportDate}</p>
                ) : (
                  <div className="balance-table-wrapper">
                    <Table
                      columns={[
                        { header: 'Item Name', accessor: 'item_name' },
                        { header: 'Produced', accessor: 'produced', cell: (r) => `${r.produced} units` },
                        { header: 'Sold', accessor: 'sold', cell: (r) => `${r.sold} units` },
                        {
                          header: 'Balance',
                          accessor: 'balance',
                          cell: (r) => (
                            <span style={{
                              color: r.balance < 0 ? '#dc2626' : r.balance === 0 ? '#059669' : '#f59e0b',
                              fontWeight: 600
                            }}>
                              {r.balance} units
                            </span>
                          )
                        },
                        {
                          header: 'Status',
                          accessor: 'wasteStatus',
                          cell: (r) => <span style={{ fontSize: 12 }}>{r.wasteStatus}</span>
                        }
                      ]}
                      data={balanceReport}
                    />
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      <style jsx>{`
        .production-page-container {
          max-width: 1200px;
          margin: 0 auto;
        }
        .production-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .production-header h1 {
          margin: 0;
          font-size: 24px;
          color: #111827;
        }
        .tab-buttons {
          display: flex;
          gap: 8px;
        }
        .tab-btn {
          padding: 10px 16px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #374151;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          font-size: 14px;
          transition: all 0.2s ease;
        }
        .tab-btn.active {
          background: #3b82f6;
          color: #fff;
          border-color: #3b82f6;
        }
        .tab-btn:hover {
          background: #f3f4f6;
        }
        .tab-btn.active:hover {
          background: #2563eb;
        }
        .production-entry {
          animation: fadeIn 0.2s ease;
        }
        .production-reports {
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
