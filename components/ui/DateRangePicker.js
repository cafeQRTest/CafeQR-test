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

  const fmt = d => {
    if (!d || isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return (
    <div className="date-range-picker">
      <div className="picker-group">
        <label>
          <span>From</span>
          <input type="date" value={fmt(start)} onChange={handleStart} />
        </label>
        <label>
          <span>To</span>
          <input type="date" value={fmt(end)} onChange={handleEnd} />
        </label>
      </div>

      <style jsx>{`
        .date-range-picker {
          display: flex;
          align-items: center;
        }
        .picker-group {
          display: flex;
          gap: 16px;
          align-items: center;
        }
        label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.95rem;
          color: #374151;
          font-weight: 600;
        }
        input {
          accent-color: #f97316;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #f97316; /* Always Orange */
          font-family: inherit;
          outline: none;
          color: #374151;
          background: #fff;
          transition: box-shadow 0.2s;
        }
        input:focus {
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }

        @media (max-width: 640px) {
          .picker-group {
            gap: 8px;
            width: 100%;
            justify-content: space-between;
          }
          label {
            gap: 4px;
            font-size: 0.8rem;
            flex: 1;
          }
          input {
            padding: 6px 4px;
            font-size: 0.85rem;
            width: 100%;
            min-width: 105px;
          }
        }
      `}</style>
    </div>
  )
}
