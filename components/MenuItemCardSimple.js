import React, { useState, useEffect } from 'react';

const vegIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="1" y="1" width="22" height="22" stroke="#166534" strokeWidth="2" />
    <circle cx="12" cy="12" r="6" fill="#166534" />
  </svg>
);

const nonVegIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="1" y="1" width="22" height="22" stroke="#991b1b" strokeWidth="2" />
    <path d="M12 6L18 16H6L12 6Z" fill="#991b1b" />
  </svg>
);

export default function MenuItemCardSimple({
  item,
  quantity = 0,
  onAdd,
  onRemove,
  onQuantityChange,
  quantityStep = 1,
  minQuantity = 0,
  maxQuantity = 999,
  decimalPlaces = 2,
}) {
  const isOutOfStock =
    item.status === 'out_of_stock' ||
    item.available === false ||
    item.is_available === false;

  const [qtyInput, setQtyInput] = useState(
    quantity > 0 ? String(quantity) : ''
  );

  useEffect(() => {
    setQtyInput(quantity > 0 ? String(quantity) : '');
  }, [quantity]);

  const clampQuantity = (rawValue) => {
  if (Number.isNaN(rawValue)) return minQuantity;

  let value = rawValue;
  value = Math.max(minQuantity, Math.min(maxQuantity, value));

  // Round to required decimal places only (NO step snapping)
  return Number(value.toFixed(decimalPlaces));
};


  const handleQtyInputChange = (e) => {
    const raw = e.target.value.replace(',', '.');
    if (raw === '') {
      setQtyInput('');
      return;
    }
    if (!/^\d*\.?\d*$/.test(raw)) return;
    setQtyInput(raw);
  };

  const commitQtyFromInput = () => {
    if (qtyInput === '') {
      if (onQuantityChange) {
        onQuantityChange(item, 0);
      } else if (quantity > 0 && onRemove) {
        onRemove(item);
      }
      return;
    }

    const parsed = parseFloat(qtyInput);
    if (Number.isNaN(parsed)) {
      setQtyInput(quantity > 0 ? String(quantity) : '');
      return;
    }

    const finalQty = clampQuantity(parsed);
    setQtyInput(String(finalQty));
    if (onQuantityChange) {
      onQuantityChange(item, finalQty);
    }
  };

  const handleIncrease = () => {
    if (isOutOfStock) return;
    if (onQuantityChange) {
      const base = quantity || 0;
      const next = clampQuantity(base + quantityStep);
      onQuantityChange(item, next);
    } else if (onAdd) {
      onAdd(item);
    }
  };

  const handleDecrease = () => {
    if (isOutOfStock) return;
    if (onQuantityChange) {
      const base = quantity || 0;
      const next = clampQuantity(base - quantityStep);
      onQuantityChange(item, next);
    } else if (onRemove) {
      onRemove(item);
    }
  };

  const handleInitialAdd = () => {
    if (isOutOfStock) return;
    if (onQuantityChange) {
      const start =
        quantityStep > 0
          ? clampQuantity(Math.max(minQuantity, quantityStep))
          : clampQuantity(Math.max(minQuantity, 1));
      onQuantityChange(item, start);
    } else if (onAdd) {
      onAdd(item);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.iconAndName}>
          <div style={styles.icon}>{item.veg ? vegIcon : nonVegIcon}</div>
          <h3 style={styles.name}>{item.name}</h3>
        </div>
        {item.category && (
          <div style={styles.category}>[{item.category}]</div>
        )}
      </div>

      <div style={styles.priceRow}>
        <span style={styles.price}>₹{Number(item.price).toFixed(2)}</span>
      </div>

      <div style={styles.actions}>
        {quantity <= 0 ? (
          <button
            style={{
              ...styles.addButton,
              ...(isOutOfStock ? styles.disabledButton : {}),
            }}
            onClick={handleInitialAdd}
            disabled={isOutOfStock}
          >
            {isOutOfStock ? 'Out of Stock' : 'Add'}
          </button>
        ) : (
          <div style={styles.counter}>
            <button style={styles.counterBtn} onClick={handleDecrease}>
              −
            </button>
<input
  type="text"
  inputMode="decimal"
  value={qtyInput}
  onChange={handleQtyInputChange}
  onBlur={commitQtyFromInput}
  onKeyDown={(e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setQtyInput(quantity > 0 ? String(quantity) : '');
      e.currentTarget.blur();
    }
  }}
  style={styles.countInput}
/>

            <button style={styles.counterBtn} onClick={handleIncrease}>
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    height: '100%',
    minHeight: '120px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  iconAndName: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  icon: {
    marginTop: '2px',
    flexShrink: 0,
  },
  name: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    lineHeight: 1.3,
    color: '#111827',
    flex: 1,
  },
  category: {
    fontSize: '11px',
    color: '#6b7280',
    marginLeft: '24px',
  },
  priceRow: {
    marginTop: 'auto',
  },
  price: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#f97316',
  },
  actions: {
    marginTop: '4px',
  },
  addButton: {
    width: '100%',
    padding: '8px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    color: '#f97316',
    fontWeight: 700,
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
    color: '#6b7280',
  },
  counter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#fff7ed',
    borderRadius: '6px',
    padding: '4px',
    border: '1px solid #f97316',
  },
  counterBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: '#f97316',
    fontWeight: 'bold',
    fontSize: '16px',
    cursor: 'pointer',
    padding: 0,
  },
  countInput: {
    width: '52px',
    textAlign: 'center',
    border: 'none',
    background: 'transparent',
    fontSize: '14px',
    fontWeight: 700,
    color: '#f97316',
    outline: 'none',
  },
};
