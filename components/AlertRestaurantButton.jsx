import { useState, useRef } from 'react';

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
        // updated_by: null  // Only set when staff handles the alert
      }),
    });
    setSent(true);
    setTimeout(() => setSent(false), 10000 );
  } catch {
    alert('Failed to send alert!');
  } finally {
    setSending(false);
  }
};



  return (
    <div
      style={{
        position: 'relative',
        marginLeft: 18,
        display: 'flex',
        alignItems: 'center',
        height: '100%',
      }}
    >
      <button
        aria-label="Call Restaurant Staff"
        disabled={sending || sent}
        type="button"
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: sent
            ? '2.5px solid #22c55e'
            : hovered
            ? `2.5px solid ${brandColor}`
            : '2.5px solid #ced4da',
          background: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: sending || sent ? 'not-allowed' : 'pointer',
          outline: hovered ? `2px solid ${brandColor}44` : 'none',
          transition: 'border-color 0.16s, outline 0.16s',
          boxShadow: hovered
            ? `0 2px 10px -2px ${brandColor}22`
            : '0 0px 6px -2px #919eab09',
          padding: 0,
        }}
        onClick={handleAlert}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        {/* Bell SVG */}
        <svg
          width="26"
          height="26"
          viewBox="0 0 32 32"
          fill="none"
          stroke={sent ? "#22c55e" : brandColor}
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: 'stroke 0.2s' }}
        >
          <path d="M16 28a3 3 0 0 0 3-3h-6a3 3 0 0 0 3 3Zm9-6V14a9 9 0 1 0-18 0v8a2 2 0 0 1-2 2h20a2 2 0 0 1-2-2Z" />
        </svg>
      </button>
      {(hovered || sending) && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            background: '#212529ef',
            color: '#fff',
            padding: '7px 16px',
            borderRadius: 16,
            fontSize: 15,
            minWidth: 110,
            textAlign: "center",
            fontWeight: 500,
            zIndex: 20,
            whiteSpace: "nowrap",
            boxShadow: '0 5px 12px -8px #1119'
          }}
        >
          {sent ? 'Staff Called!' : sending ? 'Calling...' : 'Call Restaurant Staff'}
        </div>
      )}
    </div>
  );
}
