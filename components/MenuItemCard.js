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
  showImage = true,
  badge = 0,
  onEdit,
  // NEW: direct quantity setter, preferred for decimals
  onQuantityChange,
  // NEW: constraints
  quantityStep = 1,
  minQuantity = 0,
  maxQuantity = 999,
  decimalPlaces = 2,
  isActive = false,
  highlightColor,
  compact = false,
  onItemClick
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
    setQtyInput(quantity > 0 ? quantity.toFixed(decimalPlaces) : '');
  }, [quantity, decimalPlaces]);

  // Helper to enforce min/max and rounding
  const clampQuantity = (rawValue) => {
    if (Number.isNaN(rawValue)) return minQuantity;

    let value = rawValue;

    // Enforce min/max
    value = Math.max(minQuantity, Math.min(maxQuantity, value));

    // Round based on decimalPlaces to ensure alignment with display
    if (decimalPlaces > 0) {
       const factor = Math.pow(10, decimalPlaces);
       // Check if step suggests a coarser grain (e.g. 0.5 where precision might be 1 or 2)
       // If step is standard 10^-N, just use standard rounding
       // Otherwise, respect step
       
       if (quantityStep > 0 && quantityStep < 1 && (1/quantityStep) < factor) {
          // Step is coarser (e.g. 0.5 vs precision 2 which allows 0.01)
          // We likely want to snap to step
           const stepFactor = 1 / quantityStep;
           return Math.round(value * stepFactor) / stepFactor;
       }
       
       return Math.round(value * factor) / factor;
    }

    return Math.round(value);
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
        // Backwards compatibility
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
    setQtyInput(finalQty > 0 ? finalQty.toFixed(decimalPlaces) : '');

    if (onQuantityChange) {
      onQuantityChange(item, finalQty);
    } else {
        // Fallback or do nothing
    }
  };

  const handleIncrease = (e) => {
    e?.stopPropagation();
    if (isOutOfStock) return;

    if (onQuantityChange) {
      const base = quantity || 0;
      const next = clampQuantity(base + quantityStep);
      onQuantityChange(item, next);
    } else if (onAdd) {
      onAdd(item);
    }
  };

  const handleDecrease = (e) => {
    e?.stopPropagation();
    if (isOutOfStock) return;

    if (onQuantityChange) {
      const base = quantity || 0;
      const next = clampQuantity(base - quantityStep);
      onQuantityChange(item, next);
    } else if (onRemove) {
      onRemove(item);
    }
  };

  const handleInitialAdd = (e) => {
    e?.stopPropagation();
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
  
  // Dynamic styles based on usage
  const cardStyle = {
    ...styles.card,
    cursor: onItemClick ? 'pointer' : 'default',
    ...(compact ? {
      minHeight: 'auto',
      maxHeight: 'none', // Allow it to shrink
      borderRadius: '16px',
    } : {}),
    ...(isActive || quantity > 0 ? {
      borderColor: 'var(--brand)',
      boxShadow: '0 0 0 1px var(--brand) inset, 0 4px 12px rgba(0,0,0,0.05)',
      background: 'linear-gradient(to bottom, var(--surface), var(--brand-50) 150%)'
    } : {}),
    ...(!showImage ? {
      borderTop: `4px solid ${highlightColor || (isOutOfStock ? '#f97316' : '#16a34a')}`
    } : (highlightColor ? {
      borderBottom: `3px solid ${isOutOfStock ? '#cbd5e1' : highlightColor}`
    } : {}))
  };

  const imageContainerStyle = {
    ...styles.imageContainer,
    ...(compact ? { height: '100px' } : {})
  };

  return (
    <div 
      style={cardStyle}
      onClick={onItemClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.03)';
      }}
    >
      {showImage && (
        <div style={imageContainerStyle}>
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
              <svg width={compact ? "32" : "48"} height={compact ? "32" : "48"} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Fork */}
                <path d="M5 4V10C5 11.1 5.9 12 7 12V20" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 4H7M9 4H7M7 4V8" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 4V10C9 11.1 8.1 12 7 12" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                
                {/* Plate */}
                <circle cx="12" cy="12" r="5" stroke="#cbd5e1" strokeWidth="1.5" fill="#cbd5e120"/>
                <circle cx="12" cy="12" r="3" stroke="#cbd5e1" strokeWidth="1" opacity="0.5"/>

                {/* Spoon */}
                <path d="M17 12C18.1 12 19 11.1 19 10V6C19 4.9 18.1 4 17 4C15.9 4 15 4.9 15 6V10C15 11.1 15.9 12 17 12Z" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 12V20" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
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

      <div style={{...styles.content, ...(compact ? { padding: '12px' } : {})}}>
        <div style={styles.header}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}
          >
            {!showImage && (
              <div style={{ flexShrink: 0 }}>
                {item.veg ? vegIcon : nonVegIcon}
              </div>
            )}
            <h3 style={{
               ...styles.title, 
               ...(compact ? { fontSize: '13px', lineHeight: '1.3', height: '34px' } : {}) 
            }} title={item.name}>
              {item.name}
            </h3>
          </div>
          <span style={{
             ...styles.price, 
             ...(compact ? { fontSize: '14px' } : {})
          }}>
            {item.has_variants && item.variants?.length > 0
              ? `₹${Number(item.variants[0]?.price || item.price).toFixed(
                  2
                )}+`
              : `₹${Number(item.price).toFixed(2)}`}
          </span>
        </div>

        {item.category && !compact && <div style={styles.category}>{item.category}</div>}

        <div style={styles.actions}>
          {isVariantItem ? (
            <button
              style={{
                ...styles.addButton,
                ...(compact ? { padding: '8px', fontSize: '12px' } : {})
              }}
              onClick={(e) => { e.stopPropagation(); !isOutOfStock && onAdd?.(item); }}
              disabled={isOutOfStock}
            >
              {isOutOfStock ? 'OUT OF STOCK' : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>View Options</span>
                  <span style={{ fontSize: '18px', lineHeight: 0.5, marginTop: -2 }}>›</span>
                </span>
              )}
            </button>
          ) : quantity <= 0 ? (
            <div style={{ display: 'flex', gap: 6, width: '100%' }}>
              {!isOutOfStock && onEdit && badge > 0 && (
                 <button
                   onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                   style={{
                     flex: 1,
                     padding: '6px',
                     background: 'var(--brand-50)',
                     border: '1px solid var(--brand)',
                     borderRadius: '8px',
                     color: 'var(--brand)',
                     fontWeight: 700,
                     fontSize: '13px',
                     cursor: 'pointer',
                     whiteSpace: 'nowrap'
                   }}
                 >
                   {badge} Added ✎
                 </button>
              )}
              <button
                style={{ 
                  ...styles.addButton, 
                  flex: 1,
                  ...(compact ? { padding: '8px', fontSize: '13px' } : {})
                }}
                onClick={handleInitialAdd}
                aria-label={`Add ${item.name}`}
                disabled={isOutOfStock}
              >
                {isOutOfStock ? 'OUT OF STOCK' : (onEdit && badge > 0 ? '+ ADD' : 'ADD')}
                {!onEdit && !isOutOfStock && badge > 0 && (
                  <span style={{
                    marginLeft: 6,
                    fontSize: 10,
                    background: 'var(--brand)',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: 99,
                    verticalAlign: 'text-bottom'
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            </div>
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
    border: '1px solid #f1f5f9',
    borderRadius: '20px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
    height: '100%',
    minHeight: '280px',
    maxHeight: '280px',
    position: 'relative',
    cursor: 'default',
  },
  imageContainer: {
    width: '100%',
    height: '150px',
    background: '#f8fafc',
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'transform 0.5s ease',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f1f5f9',
    color: '#cbd5e1',
  },
  typeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'rgba(255, 255, 255, 0.9)',
    padding: '3px',
    borderRadius: '6px',
    display: 'flex',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    backdropFilter: 'blur(4px)',
    zIndex: 2,
  },
  content: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: '4px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '2px',
  },
  title: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '700',
    lineHeight: '1.35',
    color: '#1e293b',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    flex: 1,
    height: '42px', // fixed height for 2 lines
  },
  price: {
    fontWeight: '800',
    color: '#0f172a',
    fontSize: '16px',
    whiteSpace: 'nowrap',
    letterSpacing: '-0.02em',
  },
  category: {
    fontSize: '10px',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontWeight: 700,
    background: '#f1f5f9',
    padding: '2px 8px',
    borderRadius: '99px',
    alignSelf: 'flex-start',
    marginTop: 'auto',
    marginBottom: '8px',
  },
  variantsStart: {
    fontSize: '10px',
    color: '#64748b',
    fontWeight: 500,
  },
  actions: {
    marginTop: 'auto',
    width: '100%',
  },
  addButton: {
    width: '100%',
    padding: '10px',
    background: '#fff',
    border: '1.5px solid var(--brand)',
    borderRadius: '14px',
    color: 'var(--brand)',
    fontWeight: '800',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    boxShadow: '0 4px 12px var(--brand)15',
  },
  counter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#f8fafc',
    borderRadius: '14px',
    border: '1px solid #e2e8f0',
    padding: '4px',
    gap: '4px',
  },
  counterBtn: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: '#fff',
    color: 'var(--brand)',
    fontWeight: '800',
    fontSize: '18px',
    cursor: 'pointer',
    padding: 0,
    borderRadius: '10px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    transition: 'all 0.2s',
  },
  countInput: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    border: 'none',
    background: 'transparent',
    fontSize: '15px',
    fontWeight: '800',
    color: '#0f172a',
    outline: 'none',
    height: '100%',
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
    background: 'rgba(255,255,255,0.6)',
    backdropFilter: 'blur(2px)',
    zIndex: 2,
  },
  outOfStockText: {
    color: '#fff',
    background: '#1f2937',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.05em',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
  },
  // Keep badges if referenced
  variantBadge: {
    fontSize: '10px',
    color: 'var(--brand)',
    background: 'var(--brand-50, #eff6ff)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
};
