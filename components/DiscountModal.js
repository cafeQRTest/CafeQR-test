
import React, { useState, useEffect } from 'react';

const DiscountModal = ({ visible, onClose, onSaveTotal, cart = [], onUpdateCartItem, currentTotalDiscount, theme, totalAmount }) => {
  const [tab, setTab] = useState('total'); // 'total' | 'items'
  // Total Discount State
  const [type, setType] = useState(currentTotalDiscount?.type || 'amount');
  const [value, setValue] = useState(currentTotalDiscount?.value || '');

  useEffect(() => {
    if (visible) {
      setType(currentTotalDiscount?.type || 'amount');
      setValue(currentTotalDiscount?.value || '');
      // If we are in item mode but cart is empty/invalid, switch to total
      if (tab === 'items' && (!cart || cart.length === 0)) setTab('total');
    }
  }, [visible, currentTotalDiscount, cart]);

  if (!visible) return null;

  const handleSaveTotal = () => {
    const numVal = parseFloat(value) || 0;
    if (numVal < 0) { alert('Positive numbers only'); return; }
    if (type === 'percent' && numVal > 100) { alert('Max 100%'); return; }
    
    onSaveTotal({ type, value: numVal });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15, 23, 42, 0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000,
      padding: '20px',
      animation: 'fadeIn 0.2s ease-out'
    }} onClick={onClose}>
      <div style={{
        position: 'relative',
        background: '#fff',
        padding: '0',
        borderRadius: 16,
        width: '100%',
        maxWidth: tab === 'items' ? 600 : 400,
        boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.2)',
        animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        maxHeight: '90vh'
      }} onClick={e => e.stopPropagation()}>
         
         {/* Close Button */}
         <button 
           onClick={onClose}
           style={{
             position: 'absolute',
             top: 8,
             right: 8,
             width: 28,
             height: 28,
             borderRadius: '50%',
             background: '#f1f5f9',
             border: 'none',
             color: '#64748b',
             fontSize: 18,
             fontWeight: 700,
             cursor: 'pointer',
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'center',
             zIndex: 10,
             transition: 'all 0.2s'
           }}
           onMouseEnter={e => { e.target.style.background = '#e2e8f0'; e.target.style.color = '#0f172a'; }}
           onMouseLeave={e => { e.target.style.background = '#f1f5f9'; e.target.style.color = '#64748b'; }}
         >
           ×
         </button>
         
         {/* Tabs */}
         <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            <button 
              onClick={() => setTab('total')}
              style={{ 
                flex: 1, padding: '16px', 
                background: tab === 'total' ? '#fff' : '#f8fafc', 
                fontWeight: 700, 
                color: tab === 'total' ? theme.main : '#64748b', 
                border: 'none', cursor: 'pointer', 
                borderBottom: tab === 'total' ? `3px solid ${theme.main}` : 'none' 
              }}
            >
              Bill Discount
            </button>
            <button 
              onClick={() => setTab('items')}
              disabled={!cart || cart.length === 0 || !onUpdateCartItem}
              style={{ flex: 1, padding: '16px', background: tab === 'items' ? '#fff' : '#f8fafc', fontWeight: 700, color: tab === 'items' ? theme.main : '#64748b', border: 'none', cursor: (!cart || cart.length===0 || !onUpdateCartItem) ? 'not-allowed' : 'pointer', borderBottom: tab === 'items' ? `3px solid ${theme.main}` : 'none', opacity: (!cart || cart.length===0 || !onUpdateCartItem) ? 0.5 : 1 }}
            >
              Item Wise ({cart?.length || 0})
            </button>
         </div>

         <div style={{ padding: '24px', overflowY: 'auto' }}>
            {tab === 'total' ? (
              <>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Order Total Discount</h3>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 10, marginBottom: 16 }}>
                   <button onClick={() => setType('amount')} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 8, background: type === 'amount' ? '#fff' : 'transparent', fontWeight: 600, color: type === 'amount' ? theme.main : '#64748b', boxShadow: type === 'amount' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>₹ Amount</button>
                   <button onClick={() => setType('percent')} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 8, background: type === 'percent' ? '#fff' : 'transparent', fontWeight: 600, color: type === 'percent' ? theme.main : '#64748b', boxShadow: type === 'percent' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>% Percent</button>
                </div>
                <div style={{ marginBottom: 20 }}>
                   <input
                     type="number" min="0" step={type === 'amount' ? "1" : "0.1"}
                     value={value} onChange={e => setValue(e.target.value)}
                     placeholder="0" autoFocus
                     style={{ 
                       width: '100%', padding: '12px', fontSize: 18, fontWeight: 700, 
                       border: '2px solid #e2e8f0', 
                       borderRadius: 10, outline: 'none',
                       background: '#fff',
                       color: '#1e293b'
                     }}
                     onFocus={e => e.target.style.borderColor = theme.main}
                     onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                   />
                </div>
                <button 
                  onClick={handleSaveTotal} 
                  style={{ 
                    width: '100%', padding: '14px', 
                    background: theme.main, 
                    border: 'none', color: '#fff', borderRadius: 12, 
                    fontWeight: 700, cursor: 'pointer', 
                    fontSize: 16, transition: 'all 0.2s'
                  }}
                >
                  Apply Bill Discount
                </button>

                {/* Remove Discount button removed as per user request */}
              </>
            ) : (
             <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {cart.map((item) => {
                  const d = item.discount || { type: 'amount', value: 0 };
                  const itemTotal = (item.price * item.quantity);
                  const effective = d.type === 'amount' ? d.value : (itemTotal * d.value / 100);
                  const id = item.cartId || item.id;
                  
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>₹{item.price} × {item.quantity}{item.uom_short_code ? ` ${item.uom_short_code}` : ''} = <strong>₹{(itemTotal || 0).toFixed(2)}</strong></div>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 4, background: '#f8fafc', padding: 2, borderRadius: 6 }}>
                           <button onClick={() => onUpdateCartItem && onUpdateCartItem(id, { ...item, discount: { ...d, type: 'amount', value: d.type === 'amount' ? d.value : 0 } })} style={{ padding: '4px 8px', fontSize: 11, border: 'none', borderRadius: 4, background: d.type === 'amount' ? '#fff' : 'transparent', color: d.type === 'amount' ? theme.main : '#64748b', boxShadow: d.type === 'amount' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>₹</button>
                           <button onClick={() => onUpdateCartItem && onUpdateCartItem(id, { ...item, discount: { ...d, type: 'percent', value: d.type === 'percent' ? d.value : 0 } })} style={{ padding: '4px 8px', fontSize: 11, border: 'none', borderRadius: 4, background: d.type === 'percent' ? '#fff' : 'transparent', color: d.type === 'percent' ? theme.main : '#64748b', boxShadow: d.type === 'percent' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}>%</button>
                        </div>
                        <input
                          type="number" 
                          min="0"
                          placeholder="0"
                          value={d.value === 0 ? '' : d.value}
                          onChange={(e) => {
                             if (!onUpdateCartItem) return;
                             const v = parseFloat(e.target.value);
                             if (isNaN(v)) {
                               onUpdateCartItem(id, { ...item, discount: { ...d, value: 0 } });
                               return;
                             }
                             // Validation
                             if (d.type === 'percent' && v > 100) return;
                             if (d.type === 'amount' && v > itemTotal) return;
                             
                             onUpdateCartItem(id, { ...item, discount: { ...d, value: v } });
                          }}
                          readOnly={!onUpdateCartItem}
                          style={{ width: 80, padding: '6px', borderRadius: 6, border: `1px solid ${d.value > 0 ? theme.main : '#e2e8f0'}`, textAlign: 'right', fontWeight: 600, fontSize: 14, outline: 'none', background: !onUpdateCartItem ? '#f1f5f9' : '#fff', cursor: !onUpdateCartItem ? 'not-allowed' : 'text' }}
                        />
                        {effective > 0 && <div style={{ fontSize: 11, color: '#ef4444' }}>-₹{(effective || 0).toFixed(2)}</div>}
                      </div>
                    </div>
                  );
                })}
                <button onClick={onClose} style={{ marginTop: 12, width: '100%', padding: '14px', background: '#f1f5f9', border: 'none', color: '#475569', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Done</button>
             </div>
           )}
         </div>
      </div>
    </div>
  );
};

export default DiscountModal;
