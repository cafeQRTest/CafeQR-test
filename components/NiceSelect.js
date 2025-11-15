import { useState, useEffect, useRef } from "react";

export default function NiceSelect({ value, onChange, options, placeholder = "Select..." }) {
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
        onClick={() => setOpen((o) => !o)}
        style={{
          ...selectInput,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: current ? "#111827" : "#9ca3af" }}>
          {current?.label || placeholder}
        </span>
        <span style={selectChevron}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            marginTop: 4,
            width: "100%",
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {options.map((opt) => {
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
                  padding: "8px 10px",
                  fontSize: 14,
                  cursor: "pointer",
                  background: active ? "#fff7ed" : "#fff",
                  color: active ? "#9a3412" : "#111827",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{opt.label}</span>
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
  padding: "9px 11px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  height: "40px",
  fontSize: 14,
  outline: "none",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  boxShadow: "0 0 0 1px transparent",
  backgroundColor: "#f9fafb",
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  paddingRight: 32,
  cursor: "pointer",
};

const selectChevron = {
  position: "absolute",
  right: 10,
  top: "50%",
  transform: "translateY(-50%)",
  pointerEvents: "none",
  fontSize: 12,
  color: "#6b7280",
};
