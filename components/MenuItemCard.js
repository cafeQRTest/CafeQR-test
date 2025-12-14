import React, { useState, useEffect } from 'react';
import Button from './ui/Button';

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

export default function MenuItemCard({
  item,
  quantity = 0,
  onAdd,
  onRemove,
  // NEW: direct quantity setter, preferred for decimals
  onQuantityChange,
  // NEW: constraints (tune these to your “above said” rules)
  quantityStep = 1,
  minQuantity = 0,
  maxQuantity = 999,
  decimalPlaces = 2,
  showImage = true,
}) {
  const hasImage = !!item.image_url;
  const isOutOfStock =
    item.status === 'out_of_stock' ||
    item.available === false ||
    item.is_available === false;

   const isVariantItem =
  !!(item.hasvariants || item.has_variants) && (item.variants?.length || 0) > 0;


  // Local string state for the input so user can type freely
  const [qtyInput, setQtyInput] = useState(
    quantity > 0 ? String(quantity) : ''
  );

  // Sync input if parent quantity changes (cart updates, etc.)
  useEffect(() => {
    setQtyInput(quantity > 0 ? String(quantity) : '');
  }, [quantity]);

  // Helper to enforce min/max/step and rounding
  // Helper to enforce min/max and rounding (NO step snapping here)
const clampQuantity = (rawValue) => {
  if (Number.isNaN(rawValue)) return minQuantity;

  let value = rawValue;

  // Enforce min/max
  value = Math.max(minQuantity, Math.min(maxQuantity, value));

  // Round to required decimal places only
  return Number(value.toFixed(decimalPlaces));
};


  const handleQtyInputChange = (e) => {
    const raw = e.target.value.replace(',', '.');

    // Allow empty (user clearing field) and partial numbers like "0."
    if (raw === '') {
      setQtyInput('');
      return;
    }

    // Only allow digits and a single decimal point
    if (!/^\d*\.?\d*$/.test(raw)) {
      return;
    }

    setQtyInput(raw);
  };

  const commitQtyFromInput = () => {
    if (qtyInput === '') {
      // Treat empty as 0
      if (onQuantityChange) {
        onQuantityChange(item, 0);
      } else if (quantity > 0 && onRemove) {
        // Backwards: if we have old handlers only, remove once
        onRemove(item);
      }
      return;
    }

    const parsed = parseFloat(qtyInput);
    if (Number.isNaN(parsed)) {
      // Reset to last known quantity from parent
      setQtyInput(quantity > 0 ? String(quantity) : '');
      return;
    }

    const finalQty = clampQuantity(parsed);
    setQtyInput(String(finalQty));

    if (onQuantityChange) {
      onQuantityChange(item, finalQty);
    } else {
      // Fallback: keep display in sync but let parent handle increments via buttons
      // (no-op here to avoid firing many add/remove calls).
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
      {showImage && (
        <div style={styles.imageContainer}>
          {hasImage ? (
            <img
              src={item.image_url}
              alt={item.name}
              style={{
                ...styles.image,
                ...(isOutOfStock ? styles.outOfStockImage : {}),
              }}
              loading="lazy"
              onMouseEnter={(e) => (e.target.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.target.style.transform = 'scale(1)')}
            />
          ) : (
            <div style={styles.placeholder}>
              <span style={{ fontSize: 32, opacity: 0.3 }}>🍽️</span>
            </div>
          )}
          {isOutOfStock && (
            <div style={styles.outOfStockOverlay}>
              <span style={styles.outOfStockText}>OUT OF STOCK</span>
            </div>
          )}
          <div style={styles.typeBadge}>
            {item.veg ? vegIcon : nonVegIcon}
          </div>
        </div>
      )}

      <div style={styles.content}>
        <div style={styles.header}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}
          >
            {!showImage && (
              <div style={{ flexShrink: 0 }}>
                {item.veg ? vegIcon : nonVegIcon}
              </div>
            )}
            <h3 style={styles.title} title={item.name}>
              {item.name}
            </h3>
          </div>
          <span style={styles.price}>
            {item.has_variants && item.variants?.length > 0
              ? `₹${Number(item.variants[0]?.price || item.price).toFixed(
                  2
                )}+`
              : `₹${Number(item.price).toFixed(2)}`}
          </span>
        </div>

        {item.category && <div style={styles.category}>{item.category}</div>}

        <div style={styles.actions}>
  {isVariantItem ? (
    <button
      style={styles.addButton}
      onClick={() => !isOutOfStock && onAdd?.(item)}
      disabled={isOutOfStock}
    >
      {isOutOfStock ? 'OUT OF STOCK' : 'ADD'}
    </button>
  ) : quantity <= 0 ? (
    <button
      style={styles.addButton}
      onClick={handleInitialAdd}
      disabled={isOutOfStock}
    >
      {isOutOfStock ? 'OUT OF STOCK' : 'ADD'}
    </button>
  ) : (
    <div style={styles.counter}>
              <button
                style={styles.counterBtn}
                onClick={handleDecrease}
                aria-label="Decrease quantity"
                disabled={isOutOfStock}
              >
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
              <button
                style={styles.counterBtn}
                onClick={handleIncrease}
                aria-label="Increase quantity"
                disabled={isOutOfStock}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
      {isOutOfStock && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255,255,255,0.4)',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}
    </div>
  );
}

const styles = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-1)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.2s, box-shadow 0.2s',
    height: '100%',
    minHeight: '230px',
    maxHeight: '230px',
    position: 'relative',
  },
  imageContainer: {
    width: '100%',
    height: '100px',
    background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
    position: 'relative',
    overflow: 'hidden',
    borderBottom: '1px solid var(--border)',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'transform 0.3s ease',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
  },
  typeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    background: 'rgba(255, 255, 255, 0.95)',
    padding: '3px',
    borderRadius: 4,
    display: 'flex',
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    backdropFilter: 'blur(4px)',
  },
  content: {
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: 6,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: 1.3,
    color: 'var(--text)',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    flex: 1,
    minHeight: '36px',
    maxHeight: '36px',
  },
  price: {
    fontWeight: 700,
    color: 'var(--brand)',
    fontSize: '15px',
    whiteSpace: 'nowrap',
  },
  variantBadge: {
    fontSize: '11px',
    color: 'var(--brand)',
    background: 'var(--brand-50, #eff6ff)',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  category: {
    fontSize: '11px',
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 500,
  },
  actions: {
    marginTop: 'auto',
    paddingTop: 8,
  },
  addButton: {
    width: '100%',
    padding: '6px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--brand)',
    fontWeight: 700,
    fontSize: '13px',
    cursor: 'pointer',
    boxShadow: '0 2px 0 rgba(0,0,0,0.02)',
    transition: 'all 0.2s',
  },
  counter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--brand-50)',
    borderRadius: '8px',
    padding: '2px',
    border: '1px solid var(--brand)',
  },
  counterBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: 'var(--brand-600)',
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
    color: 'var(--brand-600)',
    outline: 'none',
  },
  outOfStockImage: {
    filter: 'grayscale(100%)',
    opacity: 0.6,
  },
  outOfStockOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.3)',
    zIndex: 2,
  },
  outOfStockText: {
    color: '#fff',
    background: 'rgba(0,0,0,0.6)',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
  },
};
