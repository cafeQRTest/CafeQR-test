// components/OrderDetailsModal.js
import React from 'react';
import Card from './ui/Card';
import Button from './ui/Button';

export default function OrderDetailsModal({ order, onClose, onStatusChange }) {
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal__card" style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Order #{order.id.slice(0,8)}</h2>
          <Button variant="outline" onClick={onClose}>×</Button>
        </div>

        {/* Customer & Table Info */}
        <Card padding={16}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <div>
              <div className="muted">Time</div>
              <div>{new Date(order.date_ordered || order.created_at).toLocaleString()}</div>
            </div>
            {order.table_number && (
              <div>
                <div className="muted">Table</div>
                <div>{order.table_number}</div>
              </div>
            )}
            {order.customer_name && (
              <div>
                <div className="muted">Customer</div>
                <div>{order.customer_name}</div>
              </div>
            )}
          </div>
        </Card>

        {/* Item List */}
        <Card padding={16} style={{ marginTop: 16 }}>
          <h3 style={{ margin: '0 0 12px 0' }}>Items</h3>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                {it.quantity || 1}× {it.name} {it.variant_name ? `(${it.variant_name})` : ''}
                {it.notes && <div className="muted" style={{ fontSize: 13 }}>{it.notes}</div>}
              </div>
              <div>₹{((it.quantity||1)*(it.price||0)).toFixed(2)}</div>
            </div>
          ))}
        </Card>

        {/* Totals */}
        <Card padding={16} style={{ marginTop: 16 }}>
          {order.subtotal != null && (
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span className="muted">Subtotal</span>
              <span>₹{Number(order.subtotal).toFixed(2)}</span>
            </div>
          )}
          {order.tax_amount != null && (
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span className="muted">Tax</span>
              <span>₹{Number(order.tax_amount).toFixed(2)}</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', marginTop: 8, fontWeight:600 }}>
            <span>Total</span>
            <span>₹{Number(order.total_amount || order.total).toFixed(2)}</span>
          </div>
        </Card>

        {/* Special Instructions */}
        {order.special_instructions && (
          <Card padding={16} style={{ marginTop: 16 }}>
            <div className="muted" style={{ marginBottom: 8 }}>Instructions</div>
            <div>{order.special_instructions}</div>
          </Card>
        )}

        {/* Status Buttons */}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop: 16 }}>
          {order.status === 'new' && (
            <Button onClick={() => { onStatusChange(order.id, 'in_progress'); onClose(); }}>
              Start Cooking
            </Button>
          )}
          {order.status === 'in_progress' && (
            <Button variant="success" onClick={() => { onStatusChange(order.id, 'ready'); onClose(); }}>
              Mark Ready
            </Button>
          )}
          {order.status === 'ready' && (
            <Button onClick={() => { onStatusChange(order.id, 'completed'); onClose(); }}>
              Complete
            </Button>
          )}
          {order.status !== 'completed' && (
            <Button variant="outline" onClick={() => { onStatusChange(order.id, 'cancelled'); onClose(); }}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
