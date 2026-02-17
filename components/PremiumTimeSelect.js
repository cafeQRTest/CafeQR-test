import React, { useState, useEffect, useRef } from 'react';
import { FaChevronDown, FaClock } from 'react-icons/fa';

export default function PremiumTimeSelect({ value, onChange, disabled, themeColor = '#f97316', overrideStyle = {}, triggerTextColor = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  
  // Parse current value
  const [hh, mm] = (value || '00:00').split(':');

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ... (keeping existing scroll logic) ...

  // Scroll to selected item when opened
  useEffect(() => {
    if (isOpen && wrapperRef.current) {
      setTimeout(() => {
        if (!wrapperRef.current) return;
        const hEl = wrapperRef.current.querySelector(`.hour-${hh}`);
        const mEl = wrapperRef.current.querySelector(`.minute-${mm}`);
        if (hEl) hEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (mEl) mEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 50);
    }
  }, [isOpen]);

  const updateTime = (newH, newM) => {
    if (onChange) onChange({ target: { value: `${newH}:${newM}` } });
  };

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  return (
    <div className="premium-time-select" ref={wrapperRef}>
      {/* Trigger Button */}
      <div 
        className={`trigger ${disabled ? 'disabled' : ''} ${isOpen ? 'open' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={overrideStyle}
      >
        <div className="trigger-content">
           <span className="time-display">{value || '00:00'}</span>
        </div>
        {!disabled && (
           <FaChevronDown 
             className="chevron"
             style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} 
           />
        )}
      </div>

      {/* Dropdown Panel */}
      {isOpen && !disabled && (
        <div className="dropdown-panel">
          <div className="dropdown-header">
            <div className="col-label">HOURS</div>
            <div className="col-label">MINUTES</div>
          </div>
          
          <div className="picker-body">
            {/* Hours Column */}
            <div className="scroll-col hours-col">
              <div className="spacer"></div>
              {hours.map(h => (
                <div 
                  key={h} 
                  className={`time-cell hour-${h} ${h === hh ? 'selected' : ''}`}
                  onClick={() => updateTime(h, mm)}
                >
                  {h}
                </div>
              ))}
              <div className="spacer"></div>
            </div>

            {/* Visual Divider */}
            <div className="divider">
              <span>:</span>
            </div>

            {/* Minutes Column */}
             <div className="scroll-col minutes-col">
              <div className="spacer"></div>
              {minutes.map(m => (
                <div 
                  key={m} 
                  className={`time-cell minute-${m} ${m === mm ? 'selected' : ''}`}
                  onClick={() => updateTime(hh, m)}
                >
                  {m}
                </div>
              ))}
              <div className="spacer"></div>
            </div>
          </div>
          
          {/* Quick Action Footer */}
          <div className="dropdown-footer" onClick={() => {
            const now = new Date();
            const h = String(now.getHours()).padStart(2, '0');
            const m = String(now.getMinutes()).padStart(2, '0');
            updateTime(h, m);
            setIsOpen(false);
          }}>
             Set to Now
          </div>
        </div>
      )}

      <style jsx>{`
        .premium-time-select {
          position: relative;
          width: 100%;
          font-family: 'Inter', sans-serif;
        }

        /* --- Trigger --- */
        .trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          background: #ffffff;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          user-select: none;
        }
        .trigger:hover {
          border-color: ${themeColor};
          background: #fafafa;
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .trigger.open {
          border-color: ${themeColor};
          box-shadow: 0 0 0 3px ${themeColor}20;
        }
        .trigger.disabled {
          opacity: 0.6;
          cursor: not-allowed;
          background: #f1f5f9;
        }

        .trigger-content {
          display: flex;
          align-items: center;
          gap: 0px;
        }

        .icon-badge {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          background: ${themeColor}15;
          color: ${themeColor};
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .time-display {
          font-size: 15px;
          font-weight: 700;
          color: ${triggerTextColor || '#0f172a'};
          letter-spacing: 0.5px;
          font-variant-numeric: tabular-nums;
        }

        .chevron {
          font-size: 10px;
          color: ${triggerTextColor || '#94a3b8'};
          transition: transform 0.2s;
          margin-left: 2px;
        }

        /* --- Dropdown --- */
        .dropdown-panel {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          left: auto;
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #f1f5f9;
          box-shadow: 
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 4px 6px -2px rgba(0, 0, 0, 0.05),
            0 0 0 1px rgba(0,0,0,0.02);
          z-index: 9999;
          overflow: hidden;
          animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          min-width: 180px;
          width: max-content;
        }

        @media (max-width: 480px) {
          .dropdown-panel {
            position: fixed;
            top: auto;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100%;
            min-width: unset;
            border-radius: 16px 16px 0 0;
            animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
          }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .dropdown-header {
          display: flex;
          padding: 10px 0 6px;
          border-bottom: 1px solid #f1f5f9;
          background: #fafafa;
        }
        .col-label {
          flex: 1;
          text-align: center;
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
        }

        .picker-body {
          display: flex;
          height: 180px;
          position: relative;
        }

        .scroll-col {
          flex: 1;
          height: 100%;
          overflow-y: auto;
          scrollbar-width: thin; /* Firefox */
          scrollbar-color: #cbd5e1 transparent;
        }
        .scroll-col::-webkit-scrollbar {
          width: 4px;
        }
        .scroll-col::-webkit-scrollbar-track {
          background: transparent;
        }
        .scroll-col::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 99px;
        }

        .divider {
          width: 1px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #cbd5e1;
          font-weight: 300;
          font-size: 20px;
          padding-bottom: 8px; /* Alignment tweak */
        }

        .time-cell {
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 500;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s;
          font-variant-numeric: tabular-nums;
        }
        .time-cell:hover {
          background: #f8fafc;
          color: #0f172a;
        }
        .time-cell.selected {
          font-size: 18px;
          font-weight: 800;
          color: ${themeColor};
          background: transparent;
        }

        /* Spacer to allow top/bottom items to be centered */
        .spacer {
          height: 72px; /* (180px container - 36px item) / 2 */
        }

        .dropdown-footer {
          padding: 10px;
          text-align: center;
          font-size: 12px;
          font-weight: 600;
          color: ${themeColor};
          background: #fafafa;
          border-top: 1px solid #f1f5f9;
          cursor: pointer;
          transition: background 0.2s;
        }
        .dropdown-footer:hover {
          background: #f1f5f9;
        }
      `}</style>
    </div>
  );
}
