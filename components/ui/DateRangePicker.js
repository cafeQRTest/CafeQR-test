import React from 'react'

export default function DateRangePicker({ start, end, onChange }) {
  const handleStart = e => {
    const d = new Date(e.target.value);
    if (!isNaN(d.getTime())) onChange({ start: d, end });
  }
  const handleEnd = e => {
    const d = new Date(e.target.value);
    if (!isNaN(d.getTime())) onChange({ start, end: d });
  }

  const fmt = d => d.toISOString().slice(0, 10)
  return (
    <div className="date-picker-wrap" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#374151', fontWeight: 500 }}>
        From
        <input
          type="date"
          value={fmt(start)}
          onChange={handleStart}
          style={{ 
             accentColor: '#f97316', 
             padding: '6px 10px', 
             borderRadius: '6px', 
             border: '1px solid #f97316',
             fontFamily: 'inherit',
             outline: 'none',
             color: '#374151',
             minWidth: '130px'
          }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#374151', fontWeight: 500 }}>
        To
        <input
          type="date"
          value={fmt(end)}
          onChange={handleEnd}
           style={{ 
             accentColor: '#f97316', 
             padding: '6px 10px', 
             borderRadius: '6px', 
             border: '1px solid #f97316',
             fontFamily: 'inherit',
             outline: 'none',
             color: '#374151',
             minWidth: '130px'
          }}
        />
      </label>
    </div>
  )
}
