import { useState, useEffect, useRef } from "react";

export default function NiceSelect({ value, onChange, options, placeholder = "Select...", disabled = false, maxHeight = 300 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = options.find((o) => o.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div style={selectWrapper} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          ...selectInput,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
          borderColor: open ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
          background: open ? 'white' : 'rgba(255,255,255,0.1)',
          color: open ? '#1e293b' : 'white',
          boxShadow: open ? '0 10px 25px -5px rgba(0,0,0,0.2)' : 'none',
        }}
      >
        <span style={{ 
          fontSize: 14, 
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginRight: 20
        }}>
          {current?.label || placeholder}
        </span>
        <span style={{
          ...selectChevron,
          color: open ? '#f97316' : 'white',
          transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
          transition: 'all 0.3s ease'
        }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 9999,
            top: 'calc(100% + 8px)',
            left: 0,
            width: "100%",
            minWidth: 280,
            background: "#fff",
            borderRadius: 16,
            border: "1.5px solid #e2e8f0",
            boxShadow: "0 20px 40px -10px rgba(0,0,0,0.25)",
            maxHeight: maxHeight,
            overflowY: "auto",
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
              No options available
            </div>
          ) : options.map((opt) => {
            const active = opt.value === value;
            return (
              <div
                key={opt.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  padding: "12px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: active ? "#fff7ed" : "#fff",
                  color: active ? "#f97316" : "#1e293b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: 'all 0.2s',
                  borderBottom: '1px solid #f1f5f9'
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = '#fff';
                }}
              >
                <span>{opt.label}</span>
                {active && <span style={{ color: '#f97316' }}>✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const selectWrapper = {
  position: "relative",
  width: "100%",
};

const selectInput = {
  width: "100%",
  padding: "10px 16px",
  borderRadius: 12,
  height: "44px",
  fontSize: 14,
  outline: "none",
  transition: "all 0.25s ease",
  border: "1.5px solid rgba(255,255,255,0.2)",
  backdropFilter: 'blur(10px)',
};

const selectChevron = {
  position: "absolute",
  right: 14,
  top: "50%",
  transform: "translateY(-50%)",
  pointerEvents: "none",
  fontSize: 16,
};

