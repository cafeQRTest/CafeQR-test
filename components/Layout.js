// components/layout.js
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useRestaurant } from '../context/RestaurantContext';
import OwnerNotificationsBell from './OwnerNotificationsBell.jsx';
import {
  FaBars,
  FaHome,
  FaClock,
  FaChartBar,
  FaCog,
  FaFileInvoice,
  FaUtensils,
  FaSignOutAlt,
  FaCreditCard,
  FaCashRegister,
  FaBoxes,
  FaIndustry,
  FaUsers,
  FaCrown,
  FaIdBadge,
  FaFileAlt,
  FaBookOpen,
} from 'react-icons/fa';
import { signOutAndRedirect } from '../lib/authActions';
import { getSupabase } from '../services/supabase';

// --- role → allowed route prefixes ------------------------------------------
// Easy to tweak later: add or remove entries per role.
const ROLE_ALLOWED_PREFIXES = {
  admin: ['*'], // everything
  manager: [
    '/owner', // overview
    '/owner/menu',
    '/owner/orders',
    '/owner/counter',
    '/owner/inventory',
    '/owner/availability',
    '/owner/production',
    '/owner/credit-customers',
    '/owner/credit-sales-report',
    '/owner/analytics',
    '/owner/sales',
    '/owner/expenses',
    '/owner/billing',
    '/owner/customers',
    '/owner/loyalty',

    // manager CANNOT see /owner/settings or /owner/subscription
  ],
  staff: [
    '/owner/menu',
    '/owner/orders',
    '/owner/counter',
  ],
};

function canAccess(href, role) {
  if (role === 'admin') return true;
  const list = ROLE_ALLOWED_PREFIXES[role] || [];
  return list.some(
    (prefix) =>
      href === prefix || href.startsWith(prefix + '/')
  );
}

// -----------------------------------------------------------------------------
// Layout shell
// -----------------------------------------------------------------------------

export default function Layout({
  children,
  title,
  showSidebar = false,
  hideChrome = false,
  showCustomerHeader = false,
}) {
  const router = useRouter();
  const { restaurant } = useRestaurant();

  // If landing/login/signup page or delivery app routes, render raw children (allows full screen control)
  const fullScreenRoutes = ['/', '/login', '/signup', '/forgot-password'];
  const isDeliveryApp = router.pathname.startsWith('/app');
  const isRawLayout = fullScreenRoutes.includes(router.pathname) || isDeliveryApp;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const MOBILE_BREAKPOINT = 1024; // use drawer up to 1024px wide (phones + tablets)

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (isRawLayout || hideChrome) return;
    const onResize = () => setCollapsed(window.innerWidth < 1160);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isRawLayout, hideChrome]);

  // Verify push token to prevent cross-restaurant bleed on unclean swaps
  useEffect(() => {
    if (isRawLayout || hideChrome) return;
    if (typeof window !== 'undefined' && restaurant?.id) {
      const token = localStorage.getItem('fcmtoken') || localStorage.getItem('fcm_token');
      if (token) {
        fetch('/api/push/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId: restaurant.id, deviceToken: token }),
        }).catch(e => console.warn('Silently failed to verify push token:', e));
      }
    }
  }, [restaurant?.id, isRawLayout, hideChrome]);

  // Sync scroll lock
  useEffect(() => {
    if (showLogoutConfirm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [showLogoutConfirm]);

  const handleConfirmSignOut = async () => {
    setSigningOut(true);
    const supabase = getSupabase();
    try {
      // 1. Trigger the sign out logic
      await signOutAndRedirect(supabase, async (url) => {
        // Use router.replace but also ensure we have a fallback
        await router.replace(url);
        // Fallback catchall just in case router navigation is blocked
        setTimeout(() => {
          if (typeof window !== 'undefined') window.location.href = url;
        }, 1500);
      });
    } catch (err) {
      console.error('Sign out error:', err);
      alert(`Sign out failed: ${err.message}`);
    } finally {
      // Always cleanup state in case redirection is delayed
      setSigningOut(false);
      setShowLogoutConfirm(false);
    }
  };

  const handleHamburger = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT) {
      setMobileOpen(true);
    } else {
      setCollapsed((v) => !v);
    }
  };

  // Swipe detection
  const touchStartRef = React.useRef(null);

  const handleTouchStart = (e) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartRef.current === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStartRef.current - touchEnd;
    const isEdgeSwipe = touchStartRef.current < 30; // Start from left edge

    // Swipe Left to Right (Open) - only from edge
    if (diff < -50 && isEdgeSwipe) {
      setMobileOpen(true);
    }
    // Swipe Right to Left (Close)
    else if (diff > 50 && mobileOpen) {
      setMobileOpen(false);
    }
    touchStartRef.current = null;
  };

  if (isRawLayout) {
    return <>{children}</>;
  }

  if (hideChrome) return <main style={{ padding: 20 }}>{children}</main>;

  return (
    <div
      style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: '100svh' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <Header
        showSidebar={showSidebar}
        onHamburger={handleHamburger}
        isCustomer={showCustomerHeader}
      />

      <div className="main-wrapper">
        {showSidebar && (
          <div className="desktop-sidebar">
            <Sidebar
              collapsed={collapsed}
              onSignOut={() => setShowLogoutConfirm(true)}
              isSigningOut={signingOut}
            />
          </div>
        )}

        <main className="container main-content" style={{ paddingTop: 24, paddingBottom: 40 }}>
          {title && (
            <h1 className="h1" style={{ marginBottom: 16 }}>
              {title}
            </h1>
          )}
          {children}
        </main>
      </div>

      {showSidebar && (
        <>
          <div
            className="drawer-backdrop"
            style={{ display: mobileOpen ? 'block' : 'none' }}
            onClick={() => setMobileOpen(false)}
          />
          <aside className={`drawer ${mobileOpen ? 'drawer--open' : ''}`}>
            <MobileSidebar
              onNavigate={() => setMobileOpen(false)}
              onSignOut={() => setShowLogoutConfirm(true)}
              isSigningOut={signingOut}
            />
          </aside>
        </>
      )}

      <Footer />

      {/* Logout Confirmation Modal - Rendered at root to cover sticky header */}
      {showLogoutConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', /* Darker for better contrast */
          backdropFilter: 'blur(10px)', /* More blur */
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '24px',
            padding: '32px',
            width: '90%',
            maxWidth: '360px',
            boxShadow: '0 20px 50px -12px rgba(0,0,0,0.35)',
            textAlign: 'center',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            position: 'relative'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: '#fee2e2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#dc2626',
              fontSize: '28px'
            }}>
              <FaSignOutAlt />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>
              Sign Out?
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: '15px', color: '#64748b', lineHeight: 1.5 }}>
              Are you sure you want to end your session? You will need to log in again.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  color: '#64748b',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSignOut}
                disabled={signingOut}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#dc2626',
                  color: 'white',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.2)'
                }}
              >
                {signingOut ? 'Signing Out...' : 'Yes, Sign Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .main-wrapper {
          display: grid;
          grid-template-columns: ${showSidebar
          ? collapsed
            ? '64px 1fr'
            : '240px 1fr'
          : '1fr'};
          transition: grid-template-columns 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
          background: var(--bg, #f7f8fa);
        }

        .desktop-sidebar {
          display: block;
        }

        @media (max-width: 1024px) {
          .main-wrapper {
            grid-template-columns: 1fr !important;
          }
          .desktop-sidebar {
            display: none;
          }
        }

        .drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(4px);
          z-index: 999;
          transition: opacity 0.3s ease;
        }

        .drawer {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: min(85vw, 320px);
          background: #ffffff;
          transform: translateX(-100%);
          transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          z-index: 1000;
          padding: 12px;
          padding-top: calc(12px + env(safe-area-inset-top));
          overflow-y: auto;
          box-shadow: 0 0 40px rgba(0,0,0,0.15);
        }

        .drawer--open {
          transform: translateX(0);
        }

        @media (min-width: 1025px) {
          .drawer,
          .drawer-backdrop {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function Header({ showSidebar, onHamburger, isCustomer }) {
  const router = useRouter();
  const supabase = getSupabase();
  const [hasSession, setHasSession] = React.useState(false);

  React.useEffect(() => {
    let unsub;
    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        setHasSession(!!data?.session);
      } catch { }
      const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
        setHasSession(!!session);
      });
      unsub = () => listener?.subscription?.unsubscribe();
    }
    init();
    return () => {
      try {
        unsub?.();
      } catch { }
    };
  }, [supabase]);

  const isOwnerRoute = router.pathname?.startsWith('/owner');

  return (
    <header
      className="shell-header"
      style={{
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: 72,
        position: 'sticky',
        top: 0,
        zIndex: 40,
        transition: 'all 0.3s ease',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.01), 0 2px 4px -1px rgba(0, 0, 0, 0.01)',
        gap: 20
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {showSidebar && (
          <button
            aria-label="Toggle sidebar"
            onClick={onHamburger}
            className="sidebar-toggle"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 42,
              height: 42,
              borderRadius: 14,
              border: 'none',
              background: 'transparent',
              color: '#0f172a', // Deep black/navy, not grey
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#fff7ed'; // Brand orange tint
              e.currentTarget.style.color = '#ea580c'; // Brand orange
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#0f172a';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <FaBars size={20} />
          </button>
        )}

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'default', userSelect: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <img
            src="/cafeqr-logo.svg"
            alt="Cafe QR"
            width={34}
            height={34}
            style={{ filter: 'drop-shadow(0 4px 6px rgba(234, 88, 12, 0.2))' }}
          />
          <strong style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            // Premium Brand Gradient (Orange -> Red)
            color: '#ea580c'
          }}>
            Cafe QR
          </strong>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {!isCustomer && (
          <nav style={{ display: 'flex', alignItems: 'center' }}>
            <Link
              href="/faq"
              className="header-link"
              style={{
                padding: '6px 12px',
                borderRadius: 99,
                color: '#334155', // Slate 700 - reduced grey-ness
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 13,
                background: '#f8fafc',
                border: '1px solid #e2e8f0', // lighter border
                transition: 'all 0.2s ease'
              }}
            >
              FAQ
            </Link>
          </nav>
        )}

        {isOwnerRoute && hasSession ? (
          <>
            <div style={{ width: 1, height: 24, background: '#e2e8f0' }}></div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <OwnerNotificationsBell />
            </div>
          </>
        ) : null}
      </div>
      <style jsx>{`
        .header-link:hover {
            background: #f1f5f9 !important;
            color: #334155 !important;
            border-color: #e2e8f0 !important;
        }
      `}</style>
    </header>
  );
}

// -----------------------------------------------------------------------------
// Desktop sidebar (role-aware)
// -----------------------------------------------------------------------------

function Sidebar({ collapsed, onSignOut, isSigningOut }) {
  const router = useRouter();
  const supabase = getSupabase();
  const { restaurant, role: ctxRole } = useRestaurant();
  const hasAggregatorIntegration = Boolean(
    restaurant?.swiggy_api_key || restaurant?.zomato_api_key
  );

  const feature = restaurant?.features || {};
  const role = ctxRole || 'admin';

  const sectionStyle = {
    margin: '16px 16px 8px',
    fontSize: 11,
    fontWeight: 800,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };


  /* Haptic helper */
  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(5);
    }
  };

  const renderItem = (it) => {
    if (!canAccess(it.href, role)) return null;
    const active =
      router.pathname === it.href ||
      (it.href !== '/owner' && router.pathname.startsWith(it.href + '/'));
    return (
      <Link
        key={it.href}
        href={it.href}
        className={`sidebar-link ${active ? 'active' : ''}`}
        onClick={triggerHaptic}
      >
        <div className="icon-box sidebar-icon">{it.icon}</div>
        {!collapsed && <span className="label sidebar-label">{it.label}</span>}
      </Link>
    );
  };

  // Arrange links into sections
  const ops = [
    { href: '/owner', label: 'Overview', icon: <FaHome /> },
    { href: '/owner/menu', label: 'Menu', icon: <FaBookOpen /> },
    { href: '/owner/orders', label: 'Orders', icon: <FaUtensils /> },
    { href: '/owner/counter', label: 'Counter Sale', icon: <FaCashRegister /> },
  ];


  const addons = [
    ...(feature.inventory_enabled
      ? [{ href: '/owner/inventory', label: 'Inventory', icon: <FaBoxes /> }]
      : []),
    ...(feature.table_ordering_enabled
      ? [
        { href: '/owner/tables', label: 'Tables', icon: <FaUtensils /> },
        ...(feature.qr_ordering_enabled !== false ? [{ href: '/owner/availability', label: 'Availability', icon: <FaClock /> }] : [])
      ]
      : []),
    ...(feature.production_enabled
      ? [{ href: '/owner/production', label: 'Production', icon: <FaIndustry /> }]
      : []),
  ];

  const credit =
    feature.credit_enabled && canAccess('/owner/credit-customers', role)
      ? [
        {
          href: '/owner/credit-customers',
          label: 'Credit Customers',
          icon: <FaUsers />,
        },
        {
          href: '/owner/credit-sales-report',
          label: 'Credit Sales Report',
          icon: <FaFileAlt />,
        },
      ]
      : [];

  const customersSection = [
    ...(feature.customers_enabled
      ? [{ href: '/owner/customers', label: 'Customers', icon: <FaIdBadge /> }]
      : []),
    ...(feature.loyalty_enabled
      ? [{ href: '/owner/loyalty', label: 'Loyalty', icon: <FaCrown /> }]
      : []),
  ];



  const insights = [
    { href: '/owner/analytics', label: 'Analytics', icon: <FaChartBar /> },
    { href: '/owner/sales', label: 'Sales', icon: <FaCreditCard /> },
    {
      href: '/owner/expenses',
      label: 'Expenses & P&L',
      icon: <FaFileAlt />,
    },
  ];

  const account = [
    // Only admin should see Team & Access
    ...(role === 'admin'
      ? [
        {
          href: '/owner/staff',
          label: 'Team & Access',
          icon: <FaUsers />,
        },
      ]
      : []),
    {
      href: '/owner/subscription',
      label: 'Subscription',
      icon: <FaCrown />,
    },
    { href: '/owner/settings', label: 'Settings', icon: <FaCog /> },
    { href: '/owner/billing', label: 'Billing', icon: <FaFileInvoice /> },
  ];

  const integrations = hasAggregatorIntegration
    ? [
      {
        href: '/owner/aggregator-poller',
        label: 'Aggregator Orders',
        icon: <FaUtensils />,
      },
    ]
    : [];

  const handleSignOutClick = () => {
    triggerHaptic();
    onSignOut();
  };

  return (
    <aside
      className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}
      style={{
        background: '#ffffff',
        borderRight: '1px solid #f1f5f9',
        padding: 12,
        position: 'sticky',
        top: 64,
        height: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '4px 0 24px rgba(0,0,0,0.02)',
        zIndex: 20
      }}
    >

      <nav
        className="sidebar-nav"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flex: 1,
          overflowY: 'auto',
          paddingBottom: 8,
          // scrollbarWidth: 'none', // Removed to show scrollbar
          // msOverflowStyle: 'none',  // Removed to show scrollbar
        }}
      >
        {!collapsed && <div style={sectionStyle}>Operations</div>}
        {ops.map(renderItem)}

        {(feature.inventory_enabled ||
          feature.table_ordering_enabled ||
          feature.production_enabled ||
          feature.credit_enabled) &&
          !collapsed && <div style={sectionStyle}>Add-ons</div>}
        {addons.map(renderItem)}
        {credit.map(renderItem)}

        {!collapsed && customersSection.length > 0 && (
          <div style={sectionStyle}>Customers</div>
        )}
        {customersSection.map(renderItem)}


        {!collapsed && <div style={sectionStyle}>Insights</div>}
        {insights.map(renderItem)}


        {!collapsed && <div style={sectionStyle}>Account</div>}
        {account.map(renderItem)}

        {hasAggregatorIntegration && (
          <>
            {!collapsed && <div style={sectionStyle}>Integrations</div>}
            {integrations.map(renderItem)}
          </>
        )}
      </nav>

      <div style={{ marginTop: 'auto', padding: collapsed ? '12px 0' : '16px 12px' }}>
        <button
          onClick={handleSignOutClick}
          className="sidebar-link-logout"
          title="Sign Out"
          disabled={isSigningOut}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'center',
            gap: collapsed ? 0 : 10,
            padding: collapsed ? '12px 0' : '12px 20px',
            background: 'linear-gradient(135deg, #FFFBFC 0%, #FFF1F2 100%)',
            border: '1px solid #FFE4E6',
            borderRadius: '16px',
            color: '#E11D48',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
            boxShadow: '0 4px 12px rgba(225, 29, 72, 0.05)',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(225, 29, 72, 0.12)';
            e.currentTarget.style.borderColor = '#FECDD3';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(225, 29, 72, 0.05)';
            e.currentTarget.style.borderColor = '#FFE4E6';
          }}
        >
          <div style={{ fontSize: 18, display: 'flex' }}>
            <FaSignOutAlt />
          </div>
          {!collapsed && (
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.02em' }}>
              Sign Out
            </span>
          )}
        </button>
      </div>
      <style jsx global>{`
        /* Global Sidebar Styles - Premium & Dynamic */
        .sidebar-nav {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .sidebar-nav::-webkit-scrollbar {
          width: 4px;
        }
        .sidebar-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-nav::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 20px;
        }
        .sidebar-nav::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }

        .sidebar-link {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 20px;
          margin: 4px 12px;
          border-radius: 12px;
          background: transparent;
          color: #64748b;
          font-weight: 500;
          font-size: 15px;
          text-decoration: none;
          justify-content: flex-start;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          position: relative;
          overflow: hidden;
          cursor: pointer;
          user-select: none; /* App-like feel */
          -webkit-tap-highlight-color: transparent;
        }

        .sidebar-link:active {
          transform: scale(0.98); /* Subtle press effect */
        }

        .sidebar-link:hover {
          background: #f1f5f9;
          color: #1e293b;
          transform: translateX(4px);
          box-shadow: 0 2px 12px rgba(0,0,0,0.03);
        }

        .sidebar-link.active {
          background: linear-gradient(90deg, var(--brand-50, #fff7ed), rgba(255,255,255,0));
          color: var(--brand, #ea580c);
          font-weight: 700;
        }

        .sidebar-link.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          height: 24px;
          width: 4px;
          background: var(--brand, #ea580c);
          border-radius: 0 6px 6px 0;
          box-shadow: 0 0 10px var(--brand-50, #fff7ed);
        }

        .sidebar-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          font-size: 20px;
          transition: transform 0.3s ease, color 0.3s ease;
          flex-shrink: 0;
        }

        .sidebar-link:hover .sidebar-icon {
          transform: scale(1.15) rotate(2deg);
          color: var(--brand, #ea580c);
        }

        .sidebar-link.active .sidebar-icon {
          transform: scale(1.05);
        }

        .sidebar-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Collapsed State Overrides */
        .sidebar-collapsed .sidebar-link {
          gap: 0;
          padding: 12px 0;
          margin: 4px 0;
          justify-content: center;
          border-radius: 12px;
        }
        .sidebar-collapsed .sidebar-link:hover {
          transform: none;
          background: var(--brand-50, #fff7ed);
        }
        .sidebar-collapsed .sidebar-link.active {
           background: var(--brand-50, #fff7ed);
        }
        .sidebar-collapsed .sidebar-link.active::before {
          display: none;
        }
        
      `}</style>
    </aside>
  );
}

// -----------------------------------------------------------------------------
// Mobile sidebar (role-aware)
// -----------------------------------------------------------------------------

function MobileSidebar({ onNavigate, onSignOut, isSigningOut }) {
  const router = useRouter();
  const { restaurant, role: ctxRole } = useRestaurant();
  const hasAggregatorIntegration = Boolean(
    restaurant?.swiggy_api_key || restaurant?.zomato_api_key
  );

  const feature = restaurant?.features || {};
  const role = ctxRole || 'admin';

  const ops = [
    { href: '/owner', label: 'Overview', icon: <FaHome /> },
    { href: '/owner/menu', label: 'Menu', icon: <FaBars /> },
    { href: '/owner/orders', label: 'Orders', icon: <FaUtensils /> },
    { href: '/owner/counter', label: 'Counter Sale', icon: <FaCashRegister /> },
  ].filter((it) => canAccess(it.href, role));

  const addons = [
    ...(feature.inventory_enabled
      ? [{ href: '/owner/inventory', label: 'Inventory', icon: <FaBoxes /> }]
      : []),
    ...(feature.table_ordering_enabled
      ? [
        { href: '/owner/tables', label: 'Tables', icon: <FaUtensils /> },
        ...(feature.qr_ordering_enabled !== false ? [{ href: '/owner/availability', label: 'Availability', icon: <FaClock /> }] : [])
      ]
      : []),
    ...(feature.production_enabled
      ? [{ href: '/owner/production', label: 'Production', icon: <FaIndustry /> }]
      : []),
  ].filter((it) => canAccess(it.href, role));

  const credit = feature.credit_enabled
    ? [
      {
        href: '/owner/credit-customers',
        label: 'Credit Customers',
        icon: <FaUsers />,
      },
      {
        href: '/owner/credit-sales-report',
        label: 'Credit Sales Report',
        icon: <FaFileAlt />,
      },
    ].filter((it) => canAccess(it.href, role))
    : [];

  const customers = [
    ...(feature.customers_enabled
      ? [{ href: '/owner/customers', label: 'Customers', icon: <FaIdBadge /> }]
      : []),
    ...(feature.loyalty_enabled
      ? [{ href: '/owner/loyalty', label: 'Loyalty', icon: <FaCrown /> }]
      : []),
  ].filter((it) => canAccess(it.href, role));



  const insights = [
    { href: '/owner/analytics', label: 'Analytics', icon: <FaChartBar /> },
    { href: '/owner/sales', label: 'Sales', icon: <FaCreditCard /> },
    {
      href: '/owner/expenses',
      label: 'Expenses & P&L',
      icon: <FaFileAlt />,
    },
  ].filter((it) => canAccess(it.href, role));

  const account = [
    ...(role === 'admin'
      ? [
        {
          href: '/owner/staff',
          label: 'Team & Access',
          icon: <FaUsers />,
        },
      ]
      : []),

    {
      href: '/owner/subscription',
      label: 'Subscription',
      icon: <FaCrown />,
    },
    { href: '/owner/settings', label: 'Settings', icon: <FaCog /> },
    { href: '/owner/billing', label: 'Billing', icon: <FaFileInvoice /> },
  ].filter((it) => canAccess(it.href, role));

  const integrations = hasAggregatorIntegration
    ? [
      {
        href: '/owner/aggregator-poller',
        label: 'Aggregator Orders',
        icon: <FaUtensils />,
      },
    ].filter((it) => canAccess(it.href, role))
    : [];

  const handleSignOut = () => {
    onNavigate();
    onSignOut();
  };

  const groups = [
    { title: 'Operations', items: ops },
    {
      title: addons.length || credit.length ? 'Add-ons' : null,
      items: [...addons, ...credit],
    },
    {
      title: customers.length ? 'Customers' : null,
      items: customers,
    },
    { title: 'Insights', items: insights },
    { title: 'Account', items: account },
    { title: integrations.length ? 'Integrations' : null, items: integrations },
  ];


  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {groups.map((g, idx) => (
          <React.Fragment key={idx}>
            {g.title && (
              <div
                style={{
                  margin: '16px 16px 8px',
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {g.title}
              </div>
            )}
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={onNavigate}
                className={`sidebar-link ${router.pathname === it.href ? 'active' : ''}`}
              >
                <div className="icon-box sidebar-icon">{it.icon}</div>
                <span className="label sidebar-label">{it.label}</span>
              </Link>
            ))}
          </React.Fragment>
        ))}
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '12px', paddingTop: '12px' }}>
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 12,
            color: isSigningOut ? '#dc2626' : '#64748b',
            background: isSigningOut ? '#fee2e2' : '#f8fafc',
            border: 'none',
            cursor: isSigningOut ? 'not-allowed' : 'pointer',
            width: '100%',
            fontWeight: 600,
            justifyContent: 'flex-start',
          }}
        >
          <FaSignOutAlt />
          <span>{isSigningOut ? 'Signing Out...' : 'Sign Out'}</span>
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Footer
// -----------------------------------------------------------------------------

function Footer() {
  return (
    <footer
      style={{
        background: '#fff',
        borderTop: '1px solid #e5e7eb',
        padding: '12px 24px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
        display: 'flex',
        justifyContent: 'center',
        gap: 12,
        fontSize: 14,
        color: '#6b7280',
      }}
    >
      <span>🔒 Powered by SharpINtell</span>
      <span>•</span>
      <span>Secure payments by Razorpay</span>
      <Link
        href="/privacy-policy"
        style={{ color: '#2563eb', textDecoration: 'underline' }}
      >
        Privacy Policy
      </Link>
    </footer>
  );
}
