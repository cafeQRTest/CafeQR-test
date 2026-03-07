import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { ShoppingBag, X } from 'lucide-react';
import { arePushAlertsDisabled } from '../lib/push/tokenStore';

const AUDIO_SOURCES = [
    '/beep.mp3?v=20260305-2',
    '/notification.mp3?v=20260305-2',
    '/notification-sound.mp3?v=20260305-2',
    '/alert.mp3?v=20260305-2',
];

function normalizePushPayload(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const data = source.data && typeof source.data === 'object' ? source.data : {};
    const notification = source.notification && typeof source.notification === 'object' ? source.notification : {};

    const type = String(data.type || source.type || '').toLowerCase();
    const orderId = String(data.orderId || source.orderId || '');
    const title = source.title || notification.title || data.title || 'New Order';
    const body = source.body || notification.body || data.body || 'You have a new order.';
    const fallbackUrl = orderId
        ? `/owner/orders?highlight=${encodeURIComponent(orderId)}`
        : '/owner/orders';
    const url = source.url || data.url || fallbackUrl;
    const pushRestaurantId = data.restaurantId || source.restaurantId || '';

    return {
        title,
        body,
        url,
        orderId,
        type,
        pushRestaurantId,
        isDeliveryPending: type === 'delivery_pending' && Boolean(orderId),
    };
}

export default function PushBanner() {
    const [notification, setNotification] = useState(null);
    const router = useRouter();
    const audioRef = useRef(null);
    const recentPushKeysRef = useRef(new Map());
    const audioSourceIndexRef = useRef(0);
    const webAudioContextRef = useRef(null);
    const webAudioTimerRef = useRef(null);

    const stopWebAudioAlarm = useCallback(() => {
        if (webAudioTimerRef.current) {
            window.clearInterval(webAudioTimerRef.current);
            webAudioTimerRef.current = null;
        }
    }, []);

    const startWebAudioAlarm = useCallback(() => {
        if (typeof window === 'undefined') return false;
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return false;

        try {
            if (!webAudioContextRef.current) {
                webAudioContextRef.current = new AudioContextCtor();
            }
            const ctx = webAudioContextRef.current;
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => { });
            }
            if (webAudioTimerRef.current) return true;

            const beep = () => {
                const now = ctx.currentTime;
                const oscillator = ctx.createOscillator();
                const gain = ctx.createGain();

                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(880, now);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

                oscillator.connect(gain);
                gain.connect(ctx.destination);
                oscillator.start(now);
                oscillator.stop(now + 0.3);
            };

            beep();
            webAudioTimerRef.current = window.setInterval(beep, 900);
            return true;
        } catch (err) {
            console.warn('[PushBanner] WebAudio alarm failed:', err);
            return false;
        }
    }, []);

    const stopAlarm = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.loop = false;
        }
        stopWebAudioAlarm();
    }, [stopWebAudioAlarm]);

    const startAlarm = useCallback(() => {
        stopAlarm();

        const audio = audioRef.current;
        if (!audio) {
            startWebAudioAlarm();
            return;
        }

        audio.loop = true;
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((err) => {
                console.warn('[PushBanner] Could not play media alarm, falling back to WebAudio:', err);
                startWebAudioAlarm();
            });
        }
    }, [startWebAudioAlarm, stopAlarm]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isOwnerRoute = window.location.pathname.startsWith('/owner');
            if (!isOwnerRoute) return;
        }

        let unlockAudio = null;
        let handleSwMessage = null;
        let onAudioError = null;

        // Preload audio with source failover to avoid codec/cache issues.
        if (typeof window !== 'undefined') {
            const audio = new Audio();
            audio.preload = 'auto';
            audioRef.current = audio;

            const loadAudioSource = (index) => {
                if (!audioRef.current) return;
                if (index < 0 || index >= AUDIO_SOURCES.length) return;
                audioSourceIndexRef.current = index;
                audioRef.current.src = AUDIO_SOURCES[index];
                audioRef.current.load();
            };

            onAudioError = () => {
                const nextIndex = audioSourceIndexRef.current + 1;
                if (nextIndex < AUDIO_SOURCES.length) {
                    loadAudioSource(nextIndex);
                    return;
                }
                console.warn('[PushBanner] All media alarm sources failed; WebAudio fallback will be used.');
            };

            audio.addEventListener('error', onAudioError);
            loadAudioSource(0);

            unlockAudio = () => {
                const a = audioRef.current;
                if (a) {
                    const wasMuted = a.muted;
                    a.muted = true;
                    const unlockPlay = a.play();
                    if (unlockPlay && typeof unlockPlay.catch === 'function') {
                        unlockPlay.catch(() => { });
                    }
                    a.pause();
                    a.currentTime = 0;
                    a.muted = wasMuted;
                }

                if (webAudioContextRef.current?.state === 'suspended') {
                    webAudioContextRef.current.resume().catch(() => { });
                }

                window.removeEventListener('touchstart', unlockAudio, { capture: true });
                window.removeEventListener('click', unlockAudio, { capture: true });
            };
            window.addEventListener('touchstart', unlockAudio, { capture: true, once: true });
            window.addEventListener('click', unlockAudio, { capture: true, once: true });
        }

        const handlePush = (e) => {
            if (arePushAlertsDisabled()) return;
            const payload = e?.detail ?? e;
            if (!payload) return;

            const normalized = normalizePushPayload(payload);
            const {
                type,
                orderId,
                isDeliveryPending,
                title,
                body,
                url,
                pushRestaurantId,
            } = normalized;

            const dedupeBase = orderId || `${title}|${body}|${url}`;
            const dedupeKey = `${type || 'unknown'}:${dedupeBase}`;
            const now = Date.now();
            const recent = recentPushKeysRef.current;
            const prevTs = recent.get(dedupeKey) || 0;
            if (now - prevTs < 10000) {
                return;
            }
            recent.set(dedupeKey, now);
            if (recent.size > 500) {
                const trimCount = Math.max(100, recent.size - 350);
                let idx = 0;
                for (const key of recent.keys()) {
                    recent.delete(key);
                    idx += 1;
                    if (idx >= trimCount) break;
                }
            }

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

            setNotification({
                title,
                body,
                url,
                orderId,
                isDeliveryPending,
                id: Date.now()
            });

            // Keep ringing until user acknowledges.
            startAlarm();
        };

        window.addEventListener('new-order-push', handlePush);

        if (navigator.serviceWorker?.addEventListener) {
            handleSwMessage = (event) => {
                const message = event?.data || {};
                if (!message || typeof message !== 'object') return;
                if (message.type === 'stop-order-alarm') {
                    stopAlarm();
                    setNotification(null);
                    return;
                }
                if (message.type !== 'new-order-push') return;
                handlePush(message.payload || message.detail || message);
            };
            navigator.serviceWorker.addEventListener('message', handleSwMessage);
        }

        return () => {
            window.removeEventListener('new-order-push', handlePush);
            if (navigator.serviceWorker?.removeEventListener && handleSwMessage) {
                navigator.serviceWorker.removeEventListener('message', handleSwMessage);
            }
            stopAlarm();
            if (audioRef.current && onAudioError) {
                audioRef.current.removeEventListener('error', onAudioError);
            }
            if (typeof window !== 'undefined' && unlockAudio) {
                window.removeEventListener('touchstart', unlockAudio, { capture: true });
                window.removeEventListener('click', unlockAudio, { capture: true });
            }
            audioRef.current = null;
        };
    }, [startAlarm, stopAlarm]);

    if (!notification) return null;

    const acknowledge = () => {
        stopAlarm();
        setNotification(null);
    };

    const routeTo = (url) => {
        if (!url) return;
        router.push(url).catch(() => {
            window.location.href = url;
        });
    };

    const actionNonce = Date.now();
    const acceptUrl = notification?.orderId
        ? `/owner/orders?highlight=${encodeURIComponent(notification.orderId)}&action=accept&n=${actionNonce}`
        : null;
    const declineUrl = notification?.orderId
        ? `/owner/orders?highlight=${encodeURIComponent(notification.orderId)}&action=decline&n=${actionNonce}`
        : null;

    return (
        <div
            onClick={() => {
                if (!notification?.isDeliveryPending) {
                    acknowledge();
                    routeTo(notification.url);
                }
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
                minWidth: 360,
                maxWidth: '90vw',
                cursor: notification?.isDeliveryPending ? 'default' : 'pointer',
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
                {notification?.isDeliveryPending && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                acknowledge();
                                routeTo(acceptUrl);
                            }}
                            style={{
                                border: 'none',
                                background: '#16a34a',
                                color: '#fff',
                                borderRadius: 8,
                                padding: '7px 12px',
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Accept
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                acknowledge();
                                routeTo(declineUrl);
                            }}
                            style={{
                                border: 'none',
                                background: '#dc2626',
                                color: '#fff',
                                borderRadius: 8,
                                padding: '7px 12px',
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Decline
                        </button>
                    </div>
                )}
            </div>
            {!notification?.isDeliveryPending && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        acknowledge();
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
            )}
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
