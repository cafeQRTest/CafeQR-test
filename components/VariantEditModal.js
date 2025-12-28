import React from 'react';
import Button from './ui/Button';

export default function VariantEditModal({ item, cartItems, onUpdate, onClose, themeColor = '#f59e0b' }) {
  return (
    <div 
      style={{
        position:'fixed', 
        inset:0, 
        background:'rgba(0,0,0,0.5)', 
        zIndex:9999, 
        display:'flex', 
        alignItems:'flex-end', 
        justifyContent:'center', 
        padding: 0
      }} 
      onClick={onClose}
    >
      <div 
        style={{
          background:'white', 
          width:'100%', 
          maxWidth: 600, 
          borderTopLeftRadius: 16, 
          borderTopRightRadius: 16, 
          overflow:'hidden',
          animation: 'slideUp 0.3s ease-out'
        }} 
        onClick={e => e.stopPropagation()}
      >
        <div style={{padding:'16px 20px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
           <div>
             <h3 style={{margin:0, fontSize:18, fontWeight:600}}>{item.name}</h3>
             <span style={{fontSize:13, color:'#6b7280'}}>Edit quantities</span>
           </div>
           <button 
             onClick={onClose} 
             style={{
               border:'none', 
               background:'transparent', 
               padding: 4,
               fontSize: 24, 
               display: 'flex', 
               alignItems: 'center', 
               justifyContent: 'center',
               color: '#92400e',
               cursor: 'pointer',
               lineHeight: 1,
               transition: 'opacity 0.2s'
             }}
             onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
             onMouseLeave={e => e.currentTarget.style.opacity = '1'}
           >
             ✕
           </button>
        </div>
        
        <div style={{padding:'20px', maxHeight:'60vh', overflowY:'auto'}}>
          {cartItems.length === 0 ? (
            <p style={{textAlign:'center', color:'#9ca3af'}}>No items in cart</p>
          ) : (
            cartItems.map((c, i) => (
              <div key={i} style={{marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom: 16, borderBottom: i === cartItems.length - 1 ? 'none' : '1px solid #f3f4f6'}}>
                <div style={{flex: 1}}>
                    <div style={{fontWeight:600, fontSize: 15, color: '#1f2937'}}>
                      {c.displayName && c.displayName !== c.name 
                        ? c.displayName.replace(c.name, '').trim().replace(/^-/, '').trim() 
                        : (c.selectedVariant?.variant_name || 'Regular')}
                    </div>
                    <div style={{fontSize:13, color:'#6b7280'}}>₹{Number(c.price).toFixed(2)}</div>
                </div>
                
                <div style={{
                  display:'flex', 
                  alignItems:'center', 
                  gap: 0, 
                  border: `1px solid ${themeColor}`, 
                  borderRadius: 8, 
                  height: 36,
                  overflow: 'hidden'
                }}>
                  <button 
                    onClick={() => onUpdate(c, c.quantity - 1)} 
                    style={{
                      border:'none', 
                      background:'transparent', 
                      color:themeColor, 
                      fontWeight:'bold', 
                      width: 36,
                      height: '100%',
                      fontSize: 18,
                      cursor: 'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center'
                    }}
                  >
                    −
                  </button>
                  <span style={{
                    fontWeight:600, 
                    minWidth: 32, 
                    textAlign:'center', 
                    fontSize: 15,
                    color: '#1f2937',
                    background: `${themeColor}15`,
                    height: '100%',
                    display:'flex', alignItems:'center', justifyContent:'center'
                  }}>
                    {c.quantity}
                  </span>
                  <button 
                    onClick={() => onUpdate(c, c.quantity + 1)} 
                    style={{
                      border:'none', 
                      background:'transparent', 
                      color:themeColor, 
                      fontWeight:'bold', 
                      width: 36,
                      height: '100%',
                      fontSize: 18,
                      cursor: 'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center'
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{padding:'16px 20px', background:'#fff', borderTop:'1px solid #f3f4f6', boxShadow: '0 -4px 12px rgba(0,0,0,0.05)'}}>
           <Button onClick={onClose} style={{width:'100%', padding: '14px', fontSize: 16}}>Done</Button>
        </div>
      </div>
      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
