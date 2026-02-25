import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { ShoppingBag, X } from 'lucide-react';

export default function PushBanner() {
    const [notification, setNotification] = useState(null);
    const router = useRouter();
    const audioRef = useRef(null);
    const timerRef = useRef(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const h = window.location.hostname;
            const isTargetDomain = h === 'localhost' || h === '127.0.0.1' || h === 'test-cafeqr.vercel.app';
            const isDeliveryApp = window.location.pathname.startsWith('/app');
            if (!isTargetDomain || isDeliveryApp) return;
        }

        // Preload audio
        if (typeof window !== 'undefined') {
            audioRef.current = new Audio('/beep.mp3');
            audioRef.current.load();
        }

        const handlePush = (e) => {
            const payload = e.detail;
            if (!payload) return;

            const title = payload.title || payload.notification?.title || payload.data?.title || 'New Order';
            const body = payload.body || payload.notification?.body || payload.data?.body || 'You have a new order.';
            const url = payload.url || payload.data?.url || '/owner/orders';
            const pushRestaurantId = payload.data?.restaurantId || payload.restaurantId;

            // Strict POS Isolation: Only show push notification if it matches the current active restaurant
            try {
                const activeRid = localStorage.getItem('active_restaurant_id');
                if (pushRestaurantId && activeRid && String(pushRestaurantId) !== String(activeRid)) {
                    console.log('[PushBanner] Ignoring push for different restaurant:', pushRestaurantId);
                    return;
                }
            } catch (err) {
                console.warn('[PushBanner] Error checking active_restaurant_id:', err);
            }

            setNotification({ title, body, url, id: Date.now() });

            // Play sound
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(err => {
                    console.warn('[PushBanner] Could not play audio:', err);
                });
            }

            // Auto dismiss after 6 seconds
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                setNotification(null);
            }, 6000);
        };

        window.addEventListener('new-order-push', handlePush);

        return () => {
            window.removeEventListener('new-order-push', handlePush);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    if (!notification) return null;

    return (
        <div
            onClick={() => {
                if (notification.url) {
                    router.push(notification.url).catch(() => {
                        window.location.href = notification.url;
                    });
                }
                setNotification(null);
            }}
            style={{
                position: 'fixed',
                top: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 999999,
                background: '#fff',
                borderRadius: 12,
                padding: '16px 20px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                minWidth: 320,
                maxWidth: '90vw',
                cursor: 'pointer',
                animation: 'slideDown 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                borderLeft: '4px solid #f97316'
            }}
        >
            <div style={{
                background: '#fff7ed',
                borderRadius: 8,
                padding: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <ShoppingBag color="#ea580c" size={24} />
            </div>
            <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                    {notification.title}
                </h4>
                <p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.4 }}>
                    {notification.body}
                </p>
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setNotification(null);
                }}
                style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    color: '#94a3b8',
                    display: 'flex'
                }}
            >
                <X size={20} />
            </button>
            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes slideDown {
          from { transform: translate(-50%, -120%); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}} />
        </div>
    );
}
