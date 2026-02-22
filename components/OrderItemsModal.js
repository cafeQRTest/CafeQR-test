import React from 'react';
import styled from 'styled-components';
import { formatQtyP } from '../lib/qty';

// Reuse brand colors or similar
const BRAND = { orange: '#f97316' };

function getOrderTypeLabel(order) {
  if (!order) return '';
  if (order.table_number && order.table_number !== null) {
    return `Table ${order.table_number}`;
  }
  if (order.order_type === 'parcel' || order.order_type === 'takeaway') return 'Takeaway';
  return '';
}

function toDisplayItems(order) {
    if (!order) return [];
    // Priority: order.lines (local edit) > order.order_items (fetched) > order.items (legacy/jsonb)
    if (order.lines && Array.isArray(order.lines)) return order.lines;
    
    // Transform order_items
    if (order.order_items && Array.isArray(order.order_items)) {
        return order.order_items.map(i => {
            let n = i.menu_items?.name || i.item_name || i.name || 'Unknown';
            if (i.variant_name) {
                const suffix = ` (${i.variant_name})`;
                if (n.endsWith(suffix)) {
                    n = n.slice(0, -suffix.length);
                }
            }
            return {
                ...i,
                name: n,
                price: Number(i.price),
                quantity: Number(i.quantity),
                variant_id: i.variant_option_id || i.variant_id || null,
                variant_name: i.variant_name || null,
                uom_precision: i.menu_items?.uom?.precision ?? 0
            };
        });
    }
    
    // Legacy JSONB
    if (order.items && Array.isArray(order.items)) return order.items;
    
    return [];
}

function computeOrderTotalDisplay(order) {
    if (!order) return 0;
    return Number(order.total_amount || order.total || 0);
}

export default function OrderItemsModal({ order, onClose, modalLoyalty }) {
  if (!order) return null;

  return (
    <div 
        style={{
          position:'fixed', inset: 0,
          background:'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(5px)', 
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:10000,
          padding: 12
        }}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <div 
          style={{
            background:'white', width:'100%', maxWidth:340, borderRadius:16, padding: 20,
            boxShadow:'0 15px 30px -10px rgba(0, 0, 0, 0.15)',
            maxHeight:'85vh', display:'flex', flexDirection:'column', animation: 'fadeIn 0.2s ease-out', position: 'relative',
          }}
          onClick={e => e.stopPropagation()}
        >
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8}}>
              <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{fontSize:20, fontWeight: 900, color:'#0f172a', margin: 0, letterSpacing: '-0.02em'}}>Order #{order.id.slice(0,8)}</h3>
                    {order.status === 'completed' && (
                      <span style={{ 
                        background: '#10b981', color: 'white', fontSize: 8, fontWeight: 700, 
                        padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em'
                      }}>Paid</span>
                    )}
                  </div>
                  
                  <div style={{
                    display:'flex', gap:10, marginTop:10, alignItems: 'center', flexWrap: 'wrap',
                    fontSize: 9, color: '#94a3b8', lineHeight: 1
                  }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{fontWeight:700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 7.5, color: '#cbd5e1'}}>Placed</span>
                          <span style={{fontWeight:600, color: '#475569'}}>
                            {new Date(order.date_ordered || order.created_at).toLocaleString('en-IN', {
                              month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: true
                            })}
                          </span>
                      </div>

                      {order.updated_at && new Date(order.updated_at) - new Date(order.created_at) > 5000 && (
                        <>
                          <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }}></div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{fontWeight:700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 7.5, color: '#cbd5e1'}}>Edited</span>
                              <span style={{fontWeight:600, color: '#475569'}}>
                                {new Date(order.updated_at).toLocaleString('en-IN', {
                                  hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: true
                                })}
                              </span>
                          </div>
                        </>
                      )}

                      {order.number_of_customers && (
                         <>
                           <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }}></div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{fontSize: 10, opacity: 0.8}}>👥</span>
                              <span style={{fontWeight:700, color: '#475569', fontSize: 10}}>{order.number_of_customers}</span>
                           </div>
                         </>
                      )}

                      <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }}></div>
<div style={{
  background:'#f8fafc', padding:'2px 8px', borderRadius:6, border: '1px solid #f1f5f9',
  fontSize:9, fontWeight: 700, color: '#64748b'
}}>
  {getOrderTypeLabel(order)}
</div>

{order?.taken_by_name ? (
  <>
    <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }}></div>

    <div style={{
      background:'#fff7ed',
      padding:'2px 8px',
      borderRadius:6,
      border: '1px solid #ffedd5',
      fontSize:9,
      fontWeight: 800,
      color: '#c2410c'
    }}>
      Staff: {order.taken_by_name}
    </div>
  </>
) : null}

                  </div>
              </div>
{order?.special_instructions ? (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 8, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
      Delivery / Instructions
    </div>
    <pre style={{ margin: 0, whiteSpace: "pre-wrap", background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 12, padding: 12, fontSize: 12, color: "#0f172a" }}>
      {order.special_instructions}
    </pre>
  </div>
) : null}

              <div 
                className="dynamic-close-btn"
                onClick={onClose} 
                style={{
                    cursor:'pointer', width:32, height:32, 
                    background:'transparent', color: '#92400e', display:'flex', 
                    alignItems:'center', justifyContent:'center', fontSize:24,
                    flexShrink:0, marginTop: -4, marginRight: -8,
                    transition: 'opacity 0.2s'
                }}
              >✕</div>
            </div>

            {(order.customer_name || order.customer_phone) && (
              <div style={{ 
                padding: '12px', background: '#f8fafc', borderRadius: 12, border: '1px solid #f1f5f9',
                marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12
              }}>
                {order.customer_name && (
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Customer</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{order.customer_name}</div>
                  </div>
                )}
                {order.customer_phone && (
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Contact</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{order.customer_phone}</div>
                  </div>
                )}
              </div>
            )}

             <div style={{overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:0, marginBottom: 12}}>
               <div style={{ fontSize: 8.5, fontWeight: 800, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, borderBottom: '1.5px solid #f1f5f9', paddingBottom: 6 }}>Order Details</div>
               {toDisplayItems(order).map((it, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#334155' }}>
                        <span style={{ color: BRAND.orange, fontWeight: 700, marginRight: 5 }}>{formatQtyP(it.quantity, it.uom_precision ?? 0)}×</span>
                        {it.name}
                      </div>
                      {it.variant_name && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1, marginLeft: 20 }}>{it.variant_name}</div>}
                    </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', textAlign: 'right' }}>
                        ₹{((it.quantity || 1) * (it.price || 0)).toFixed(2)}
                        {(() => {
                           const lDisc = Number(it.line_discount_amount || 0);
                           // Fallback calculation for robust UI
                           const displayDisc = lDisc > 0 ? lDisc : Math.max(0, Number(it.discount_amount || 0) - Number(it.order_discount_share || 0));
                           
                           return displayDisc > 0 ? (
                             <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>
                               - ₹{displayDisc.toFixed(2)}
                             </div>
                           ) : null;
                        })()}
                      </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 0 0', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Number(order.total_tax || order.tax_amount || order.tax || 0) > 0.01 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                    <span style={{ color: '#94a3b8', fontWeight: 500 }}>GST {order.prices_include_tax ? '(incl)' : ''}</span>
                    <span style={{ fontWeight: 600, color: '#64748b' }}>₹{Number(order.total_tax || order.tax_amount || order.tax || 0).toFixed(2)}</span>
                  </div>
                )}

                {Number(order.discount_amount || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4 }}>
                    <span style={{ color: '#ef4444', fontWeight: 500 }}>Bill Discount (-)</span>
                    <span style={{ fontWeight: 600, color: '#ef4444' }}>- ₹{Number(order.discount_amount).toFixed(2)}</span>
                  </div>
                )}
                
                {(modalLoyalty?.amount_used > 0 || Number(order.loyalty_amount_used || 0) > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4 }}>
                    <span style={{ color: '#10b981', fontWeight: 500 }}>Loyalty Redemption (-)</span>
                    <span style={{ fontWeight: 600, color: '#10b981' }}>- ₹{(Number(modalLoyalty?.amount_used) || Number(order.loyalty_amount_used) || 0).toFixed(2)}</span>
                  </div>
                )}

                {Number(order.round_off_amount || 0) !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4 }}>
                    <span style={{ color: order.round_off_amount > 0 ? '#10b981' : '#ef4444', fontWeight: 500 }}>Round Off</span>
                    <span style={{ fontWeight: 600, color: order.round_off_amount > 0 ? '#10b981' : '#ef4444' }}>
                      {order.round_off_amount > 0 ? '+' : ''}₹{Number(order.round_off_amount).toFixed(2)}
                    </span>
                  </div>
                )}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                  <span style={{ fontSize : 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Grand Total</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: BRAND.orange }}>
                    ₹{computeOrderTotalDisplay(order).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
        </div>
        <style jsx>{`
        .dynamic-close-btn { transition: opacity 0.2s ease; }
        .dynamic-close-btn:hover { opacity: 0.7; }
        .dynamic-close-btn:active { opacity: 0.9; }
        `}</style>
      </div>
  );
}
