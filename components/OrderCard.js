// components/OrderCard.js
import React from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import Chip from './ui/Chip';
import { timeAgo } from '../lib/timeAgo';

export default function OrderCard({ order, statusColor, onChangeStatus, onComplete, generatingInvoice, onKotPrinted }) {
  // Items is a JSONB array of { name, quantity, price, notes? }
  const items = Array.isArray(order.items) ? order.items : [];

  const total = Number(order.total_amount ?? order.total ?? 0);
  const subtotal = Number(order.subtotal ?? 0);
  const tax = Number(order.tax_amount ?? order.tax ?? 0);
  const itemCount = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
  const status = order.status || 'new';

  // Fix onClick handler missing in props but used in component
  // Assuming onChangeStatus logic handles card clicks or we need to add onClick prop
  const onClick = () => {}; 

  return (
    <div className="order-card-wrapper">
    <Card
      className="order-card"
      onClick={onClick}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <strong>#{order.id.slice(0, 8)}</strong>
          <div className="muted" style={{ fontSize: 12 }}>
            {order.table_number && `Table ${order.table_number} • `}
            {timeAgo(order.updated_at || order.created_at)}
          </div>
        </div>
        <Chip tone={
          status === 'new' ? 'avail' :
          status === 'in_progress' ? 'warn' :
          status === 'ready' ? 'success' :
          status === 'completed' ? 'info' :
          'danger'
        }>
          {status.replace('_', ' ')}
        </Chip>
      </div>

      <div style={{ fontSize: 14, color: '#374151' }}>
        {items.slice(0, 3).map((it, i) => (
          <div key={i}>
            {formatQtyP(it.quantity || 1, it.uom_precision ?? 0)}× {it.name}
            {it.notes && <em style={{ marginLeft: 4, color: '#6b7280' }}>({it.notes})</em>}
          </div>
        ))}
        {items.length > 3 && (
          <div style={{ color: '#6b7280', marginTop: 4 }}>
            +{items.length - 3} more items
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {subtotal > 0 && <div>Subtotal: ₹{subtotal.toFixed(2)}</div>}
          {tax > 0 && <div>Tax: ₹{tax.toFixed(2)}</div>}
          <div style={{ fontWeight: 600 }}>Total: ₹{total.toFixed(2)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {status === 'new' && (
            <Button size="sm" onClick={e => { e.stopPropagation(); onStatusChange(order.id, 'in_progress'); }}>
              Start
            </Button>
          )}
          {status === 'in_progress' && (
            <Button size="sm" variant="success" onClick={e => { e.stopPropagation(); onStatusChange(order.id, 'ready'); }}>
              Ready
            </Button>
          )}
          {status === 'ready' && (
            <Button size="sm" onClick={e => { e.stopPropagation(); onStatusChange(order.id, 'completed'); }}>
              Done
            </Button>
          )}
          {status !== 'completed' && (
            <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onStatusChange(order.id, 'cancelled'); }}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <style jsx>{`
        .order-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-2);
        }
      `}</style>
    </Card>
    </div>
  );
}
