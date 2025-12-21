import { useState } from 'react';

export default function AlertRestaurantButton({ restaurantId, tableNumber, brandColor = 'var(--brand)' }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleAlert = async () => {
    setSending(true);
    try {
      const alertTime = new Date().toISOString();
      await fetch('/api/customeralert/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          table_number: tableNumber,
          created_at: alertTime,
          status: 'pending',
          message: 'Customer request for staff',
        }),
      });
      setSent(true);
      setTimeout(() => setSent(false), 10000);
    } catch {
      alert('Failed to send alert!');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        aria-label="Call Restaurant Staff"
        disabled={sending || sent}
        type="button"
        style={{
          width: 44,
          height: 44,
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          background: sent ? '#f0fdf4' : hovered ? `${brandColor}10` : '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: sending || sent ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          padding: 0,
          color: sent ? '#16a34a' : brandColor,
          boxShadow: hovered ? `0 4px 12px ${brandColor}15` : 'none',
        }}
        onClick={handleAlert}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: 'all 0.2s',
            transform: hovered ? 'rotate(15deg)' : 'none'
          }}
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
      </button>

      {(hovered || sending) && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            background: '#1e293b',
            color: '#fff',
            padding: '8px 14px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600',
            zIndex: 100,
            whiteSpace: 'nowrap',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            pointerEvents: 'none',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {sent ? 'Staff Called!' : sending ? 'Calling...' : 'Call Staff'}
          <style jsx>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(-4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
