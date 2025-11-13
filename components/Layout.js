// components/layout.js

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useRestaurant } from '../context/RestaurantContext'
import OwnerNotificationsBell from './OwnerNotificationsBell.jsx'
import {
  FaBars,
  FaHome,
  FaList,
  FaClock,
  FaLeaf,
  FaTags,
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
  FaFileAlt,
} from 'react-icons/fa'
import { signOutAndRedirect } from '../lib/authActions'
import { getSupabase } from '../services/supabase'

export default function Layout({
  children,
  title,
  showSidebar = false,
  hideChrome = false,
  showCustomerHeader = false,
}) {
  if (hideChrome) return <main style={{ padding: 20 }}>{children}</main>

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onResize = () => setCollapsed(window.innerWidth < 1160)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handleHamburger = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setMobileOpen(true)
    } else {
      setCollapsed((v) => !v)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: '100svh' }}>
      <Header showSidebar={showSidebar} onHamburger={handleHamburger} isCustomer={showCustomerHeader} />

      <div className="main-wrapper">
        {showSidebar && (
          <div className="desktop-sidebar">
            <Sidebar collapsed={collapsed} />
          </div>
        )}

        <main className="container main-content" style={{ paddingTop: 24, paddingBottom: 40 }}>
          {title && <h1 className="h1" style={{ marginBottom: 16 }}>{title}</h1>}
          {children}
        </main>
      </div>

      {showSidebar && (
        <>
          <div className="drawer-backdrop" style={{ display: mobileOpen ? 'block' : 'none' }} onClick={() => setMobileOpen(false)} />
          <aside className={`drawer ${mobileOpen ? 'drawer--open' : ''}`}>
            <MobileSidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </>
      )}

      <Footer />

      <style jsx>{`
        .main-wrapper {
          display: grid;
          grid-template-columns: ${showSidebar ? (collapsed ? '64px 1fr' : '240px 1fr') : '1fr'};
          transition: grid-template-columns 0.18s ease;
          background: var(--bg, #f7f8fa);
        }
        .desktop-sidebar {
          display: block;
        }
        @media (max-width: 768px) {
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
          background: rgba(0, 0, 0, 0.35);
          z-index: 999;
        }
        .drawer {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: min(80vw, 300px);
          background: #f9fafb;
          border-right: 1px solid #e5e7eb;
          transform: translateX(-100%);
          transition: transform 0.28s ease-out;
          z-index: 1000;
          padding: 12px;
          padding-top: calc(12px + env(safe-area-inset-top));
          overflow-y: auto;
        }
        .drawer--open {
          transform: translateX(0);
        }
        @media (min-width: 769px) {
          .drawer,
          .drawer-backdrop {
            display: none;
          }
        }
      `}</style>
    </div>
  )
}

function Header({ showSidebar, onHamburger, isCustomer }) {
  const router = useRouter()
  const supabase = getSupabase()
  const [hasSession, setHasSession] = React.useState(false)

  React.useEffect(() => {
    let unsub
    async function init() {
      try {
        const { data } = await supabase.auth.getSession()
        setHasSession(!!data?.session)
      } catch {}
      const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
        setHasSession(!!session)
      })
      unsub = () => listener?.subscription?.unsubscribe()
    }
    init()
    return () => { try { unsub?.() } catch {} }
  }, [supabase])

  const isOwnerRoute = router.pathname?.startsWith('/owner')
  return (
    <header
      className="shell-header"
      style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        height: 64,
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        {showSidebar && (
          <button
            aria-label="Toggle sidebar"
            onClick={onHamburger}
            className="sidebar-toggle"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#fff',
              cursor: 'pointer',
              marginRight: 12,
            }}
          >
            <FaBars color="#111827" />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/cafeqr-logo.svg" alt="Cafe QR" width={28} height={28} />
          <strong style={{ color: '#111827', fontSize: 20 }}>Cafe QR</strong>
        </div>
      </div>

      {!isCustomer && (
        <nav style={{ display: 'flex', gap: 24 }}>
          <Link href="/faq" style={{ color: '#374151', textDecoration: 'none' }}>
            FAQ
          </Link>
        </nav>
      )}
       {isOwnerRoute && hasSession ? <OwnerNotificationsBell /> : null}
    </header>
  )
}

function Sidebar({ collapsed }) {
  const router = useRouter()
  const supabase = getSupabase()
  const { restaurant } = useRestaurant()
  const hasAggregatorIntegration = Boolean(restaurant?.swiggy_api_key || restaurant?.zomato_api_key)
  const [signingOut, setSigningOut] = useState(false)

  const feature = restaurant?.features || {};
  const items = [
  // defaults (always shown)
  { href: '/owner', label: 'Overview', icon: <FaHome /> },
  { href: '/owner/menu', label: 'Menu', icon: <FaBars /> },
  { href: '/owner/orders', label: 'Orders', icon: <FaUtensils /> },
  { href: '/owner/counter', label: 'Counter Sale', icon: <FaCashRegister /> },

  // optional modules
  ...(feature.inventory_enabled ? [{ href: '/owner/inventory', label: 'Inventory', icon: <FaBoxes /> }] : []),
  ...(feature.table_ordering_enabled ? [{ href: '/owner/availability', label: 'Availability', icon: <FaClock /> }] : []),
  ...(feature.production_enabled ? [{ href: '/owner/production', label: 'Production', icon: <FaIndustry /> }] : []),
  ...(feature.credit_enabled ? [
    { href: '/owner/credit-customers', label: 'Credit Customers', icon: <FaUsers /> },
    { href: '/owner/credit-sales-report', label: 'Credit Sales Report', icon: <FaFileAlt /> },
  ] : []),

  // analytics/sales/settings/billing (always shown)
  { href: '/owner/analytics', label: 'Analytics', icon: <FaChartBar /> },
  { href: '/owner/sales', label: 'Sales', icon: <FaCreditCard /> },
  { href: '/owner/settings', label: 'Settings', icon: <FaCog /> },
  { href: '/owner/billing', label: 'Billing', icon: <FaFileInvoice /> },
];

// Keep existing aggregator push-on condition
if (hasAggregatorIntegration) {
  items.push({ href: '/owner/aggregator-poller', label: 'Aggregator Orders', icon: <FaUtensils /> });
}

const sectionStyle = { margin: '10px 6px 4px', fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.03em' };

const renderItem = (it) => {
  const active = router.pathname === it.href || router.pathname.startsWith(it.href + '/');
  return (
    <Link key={it.href} href={it.href} style={itemStyle(active)}>
      <span style={{ width: 18, textAlign: 'center' }}>{it.icon}</span>
      {!collapsed && <span>{it.label}</span>}
    </Link>
  );
};

// Arrange links into sections
const ops = [
  { href: '/owner', label: 'Overview', icon: <FaHome /> },
  { href: '/owner/menu', label: 'Menu', icon: <FaBars /> },
  { href: '/owner/orders', label: 'Orders', icon: <FaUtensils /> },
  { href: '/owner/counter', label: 'Counter Sale', icon: <FaCashRegister /> },
];

const addons = [
  ...(feature.inventory_enabled ? [{ href: '/owner/inventory', label: 'Inventory', icon: <FaBoxes /> }] : []),
  ...(feature.table_ordering_enabled ? [{ href: '/owner/availability', label: 'Availability', icon: <FaClock /> }] : []),
  ...(feature.production_enabled ? [{ href: '/owner/production', label: 'Production', icon: <FaIndustry /> }] : []),
];

const credit = feature.credit_enabled ? [
  { href: '/owner/credit-customers', label: 'Credit Customers', icon: <FaUsers /> },
  { href: '/owner/credit-sales-report', label: 'Credit Sales Report', icon: <FaFileAlt /> },
] : [];

const insights = [
  { href: '/owner/analytics', label: 'Analytics', icon: <FaChartBar /> },
  { href: '/owner/sales', label: 'Sales', icon: <FaCreditCard /> },
];

const account = [
  { href: '/owner/subscription', label: 'Subscription', icon: <FaCrown /> },
  { href: '/owner/settings', label: 'Settings', icon: <FaCog /> },
  { href: '/owner/billing', label: 'Billing', icon: <FaFileInvoice /> },
];

const integrations = hasAggregatorIntegration ? [
  { href: '/owner/aggregator-poller', label: 'Aggregator Orders', icon: <FaUtensils /> },
] : [];

  const itemStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: collapsed ? 0 : 10,
    padding: '10px 12px',
    borderRadius: 8,
    background: active ? '#fef3c7' : 'transparent',
    color: active ? '#92400e' : '#374151',
    textDecoration: 'none',
    justifyContent: collapsed ? 'center' : 'flex-start',
    transition: 'all .15s ease',
  })

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOutAndRedirect(supabase, router.replace)
    } catch (err) {
      console.error('Sign out error:', err)
      alert(`Sign out failed: ${err.message}`)
      setSigningOut(false)
    }
  }

return (
  <aside
    className="sidebar"
    style={{
      background: '#f9fafb',
      borderRight: '1px solid #e5e7eb',
      padding: 12,
      position: 'sticky',
      top: 64,
      height: 'calc(100vh - 64px)',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    {!collapsed && (
      <div style={{ fontWeight: 700, margin: '6px 6px 12px', color: '#111827' }}>
        Owner Panel
      </div>
    )}

    <nav
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flex: 1,                 // fills available space
        overflowY: 'auto',       // scrolls if long
        paddingBottom: 8,        // breathing room above footer
      }}
    >
      {/* Sections */}
      {!collapsed && <div style={sectionStyle}>Operations</div>}
      {ops.map(renderItem)}

      {(feature.inventory_enabled || feature.table_ordering_enabled || feature.production_enabled || feature.credit_enabled) && !collapsed && (
        <div style={sectionStyle}>Add‑ons</div>
      )}
      {addons.map(renderItem)}
      {credit.map(renderItem)}

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

    <div style={{ marginTop: 'auto' }}>
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        title="Sign Out"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 8,
          padding: '10px 12px',
          width: '100%',
          background: 'transparent',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          color: signingOut ? '#d1d5db' : '#6b7280',
          cursor: signingOut ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          opacity: signingOut ? 0.6 : 1,
        }}
      >
        <FaSignOutAlt />
        {!collapsed && <span>{signingOut ? 'Signing Out...' : 'Sign Out'}</span>}
      </button>
    </div>
  </aside>
)
}

function MobileSidebar({ onNavigate }) {
  const router = useRouter();
  const supabase = getSupabase();
  const { restaurant } = useRestaurant();
  const hasAggregatorIntegration = Boolean(restaurant?.swiggy_api_key || restaurant?.zomato_api_key);
  const [signingOut, setSigningOut] = useState(false);

  const feature = restaurant?.features || {};

  // Sectioned lists (same grouping as desktop)
  const ops = [
    { href: '/owner', label: 'Overview', icon: <FaHome /> },
    { href: '/owner/menu', label: 'Menu', icon: <FaBars /> },
    { href: '/owner/orders', label: 'Orders', icon: <FaUtensils /> },
    { href: '/owner/counter', label: 'Counter Sale', icon: <FaCashRegister /> },
  ];

  const addons = [
    ...(feature.inventory_enabled ? [{ href: '/owner/inventory', label: 'Inventory', icon: <FaBoxes /> }] : []),
    ...(feature.table_ordering_enabled ? [{ href: '/owner/availability', label: 'Availability', icon: <FaClock /> }] : []),
    ...(feature.production_enabled ? [{ href: '/owner/production', label: 'Production', icon: <FaIndustry /> }] : []),
  ];

  const credit = feature.credit_enabled
    ? [
        { href: '/owner/credit-customers', label: 'Credit Customers', icon: <FaUsers /> },
        { href: '/owner/credit-sales-report', label: 'Credit Sales Report', icon: <FaFileAlt /> },
      ]
    : [];

  const insights = [
    { href: '/owner/analytics', label: 'Analytics', icon: <FaChartBar /> },
    { href: '/owner/sales', label: 'Sales', icon: <FaCreditCard /> },
  ];

  const account = [
    { href: '/owner/subscription', label: 'Subscription', icon: <FaCrown /> },
    { href: '/owner/settings', label: 'Settings', icon: <FaCog /> },
    { href: '/owner/billing', label: 'Billing', icon: <FaFileInvoice /> },
  ];

  const integrations = hasAggregatorIntegration
    ? [{ href: '/owner/aggregator-poller', label: 'Aggregator Orders', icon: <FaUtensils /> }]
    : [];

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutAndRedirect(supabase, router.replace);
      onNavigate();
    } catch (err) {
      alert(`Sign out failed: ${err.message}`);
      setSigningOut(false);
    }
  };

  const groups = [
    { title: 'Operations', items: ops },
    { title: (addons.length || credit.length) ? 'Add-ons' : null, items: [...addons, ...credit] },
    { title: 'Insights', items: insights },
    { title: 'Account', items: account },
    { title: integrations.length ? 'Integrations' : null, items: integrations },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ fontWeight: 700, margin: '6px 6px 12px', color: '#111827' }}>Owner Panel</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto' }}>
        {groups.map((g, idx) => (
          <React.Fragment key={idx}>
            {g.title && (
              <div style={{ margin: '6px 6px 2px', fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.03em' }}>
                {g.title}
              </div>
            )}
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={onNavigate}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px',
                  borderRadius: 8,
                  color: '#374151',
                  textDecoration: 'none',
                }}
              >
                <span style={{ width: 18, textAlign: 'center' }}>{it.icon}</span>
                <span>{it.label}</span>
              </Link>
            ))}
          </React.Fragment>
        ))}
      </div>

      <div style={{ borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px',
          borderRadius: 8,
          color: signingOut ? '#fca5a5' : '#dc2626',
          background: 'transparent',
          border: 'none',
          cursor: signingOut ? 'not-allowed' : 'pointer',
        }}
      >
        <FaSignOutAlt />
        <span>{signingOut ? 'Signing Out...' : 'Sign Out'}</span>
      </button>
    </div>
  );
}



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
      <Link href="/privacy-policy" style={{ color: '#2563eb', textDecoration: 'underline' }}>
        Privacy Policy
      </Link>
    </footer>
  )
}