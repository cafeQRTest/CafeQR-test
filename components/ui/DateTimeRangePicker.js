// components/ui/DateTimeRangePicker.js
// Reusable date + time range picker (IST) for reports pages

import React from 'react';
import PremiumTimeSelect from '../PremiumTimeSelect';

const timeStyle = {
  padding: '4px 8px',
  borderRadius: '8px',
  border: '1.5px solid #f97316',
  background: '#fff',
  boxShadow: 'none',
  fontSize: '13px',
  height: '34px',
  boxSizing: 'border-box',
};

export default function DateTimeRangePicker({ start, end, startTime, endTime, onChange }) {
  const st = startTime || '00:00';
  const et = endTime || '23:59';

  const fmt = d => {
    if (!d || isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const handleStartDate = e => {
    const d = new Date(e.target.value);
    if (!isNaN(d.getTime())) onChange({ start: d, end, startTime: st, endTime: et });
  };

  const handleEndDate = e => {
    const d = new Date(e.target.value);
    if (!isNaN(d.getTime())) onChange({ start, end: d, startTime: st, endTime: et });
  };

  const handleStartTime = (e) => {
    onChange({ start, end, startTime: e.target.value, endTime: et });
  };

  const handleEndTime = (e) => {
    onChange({ start, end, startTime: st, endTime: e.target.value });
  };

  return (
    <div className="dtrp">
      {/* FROM */}
      <div className="dtrp-group">
        <span className="dtrp-label">From</span>
        <input type="date" value={fmt(start)} onChange={handleStartDate} className="dtrp-date" />
        <div className="dtrp-time-wrap">
          <PremiumTimeSelect value={st} onChange={handleStartTime} overrideStyle={timeStyle} />
        </div>
      </div>

      <div className="dtrp-divider"></div>

      {/* TO */}
      <div className="dtrp-group">
        <span className="dtrp-label">To</span>
        <input type="date" value={fmt(end)} onChange={handleEndDate} className="dtrp-date" />
        <div className="dtrp-time-wrap">
          <PremiumTimeSelect value={et} onChange={handleEndTime} overrideStyle={timeStyle} />
        </div>
      </div>

      <style jsx>{`
        .dtrp {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }

        .dtrp-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .dtrp-label {
          font-size: 13px;
          font-weight: 600;
          color: #374151;
          white-space: nowrap;
        }

        .dtrp-date {
          padding: 4px 8px;
          border: 1.5px solid #f97316;
          border-radius: 8px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          color: #374151;
          background: #fff;
          outline: none;
          transition: box-shadow 0.2s;
          accent-color: #f97316;
          box-sizing: border-box;
          width: 120px;
          height: 34px;
        }
        .dtrp-date:focus {
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }

        .dtrp-time-wrap {
          width: 120px;
          flex-shrink: 0;
        }

        .dtrp-divider {
          width: 1px;
          height: 28px;
          background: #e5e7eb;
          flex-shrink: 0;
        }

        /* Tablet: wrap naturally */
        @media (max-width: 768px) {
          .dtrp {
            flex-wrap: wrap;
            gap: 8px;
          }
          .dtrp-divider {
            display: none;
          }
          .dtrp-date {
            width: 115px;
          }
          .dtrp-time-wrap {
            width: 110px;
          }
        }

        /* Mobile: full width, stack From / To vertically */
        @media (max-width: 600px) {
          .dtrp {
            display: flex;
            flex-direction: column;
            width: 100%;
            gap: 8px;
          }
          .dtrp-group {
            width: 100%;
            gap: 6px;
          }
          .dtrp-label {
            font-size: 12px;
            min-width: 32px;
          }
          .dtrp-date {
            flex: 1;
            width: auto;
            min-width: 0;
          }
          .dtrp-time-wrap {
            width: 100px;
          }
        }

        /* Very small screens */
        @media (max-width: 360px) {
          .dtrp-date {
            font-size: 12px;
            padding: 4px 4px;
          }
          .dtrp-time-wrap {
            width: 90px;
          }
        }
      `}</style>
    </div>
  );
}
