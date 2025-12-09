import React from 'react';
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

export default function MenuItemCard({ item, quantity = 0, onAdd, onRemove }) {
  const hasImage = !!item.image_url;
  
  return (
    <div style={styles.card}>
      <div style={styles.imageContainer}>
        {hasImage ? (
          <img 
            src={item.image_url} 
            alt={item.name}
            style={styles.image}
            loading="lazy"
          />
        ) : (
          <div style={styles.placeholder}>
            <span style={{ fontSize: 32, opacity: 0.3 }}>🍽️</span>
          </div>
        )}
        <div style={styles.typeBadge}>
          {item.veg ? vegIcon : nonVegIcon}
        </div>
      </div>
      
      <div style={styles.content}>
        <div style={styles.header}>
          <h3 style={styles.title} title={item.name}>{item.name}</h3>
          <span style={styles.price}>₹{Number(item.price).toFixed(2)}</span>
        </div>
        
        {item.category && (
          <div style={styles.category}>{item.category}</div>
        )}
        
        <div style={styles.actions}>
          {quantity === 0 ? (
            <button 
              style={styles.addButton}
              onClick={() => onAdd(item)}
              aria-label={`Add ${item.name}`}
            >
              ADD
            </button>
          ) : (
            <div style={styles.counter}>
              <button 
                style={styles.counterBtn} 
                onClick={() => onRemove(item)}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span style={styles.count}>{quantity}</span>
              <button 
                style={styles.counterBtn} 
                onClick={() => onAdd(item)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
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
  },
  imageContainer: {
    width: '100%',
    aspectRatio: '4/3',
    background: '#f3f4f6',
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'transform 0.3s',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f9fafb',
  },
  typeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'rgba(255, 255, 255, 0.9)',
    padding: 4,
    borderRadius: 4,
    display: 'flex',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  content: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: 8,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    lineHeight: 1.4,
    color: 'var(--text)',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    flex: 1,
  },
  price: {
    fontWeight: 700,
    color: 'var(--brand)',
    fontSize: '15px',
    whiteSpace: 'nowrap',
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
    padding: '8px',
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
  count: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--brand-600)',
  },
};
