import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  FaHome,
  FaBars,
  FaUtensils,
  FaCashRegister,
  FaBoxes,
  FaClock,
  FaTags,
  FaChartBar,
  FaCreditCard,
  FaCog,
  FaFileInvoice,
  FaSignOutAlt,
} from 'react-icons/fa'

export default function Shell({ children, showSidebar = false }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const init = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile && showSidebar) {
        const stored = sessionStorage.getItem('sidebarCollapsed')
        if (stored != null) setSidebarCollapsed(stored === '1')
      }
    }
    init()
    window.addEventListener('resize', init)
    return () => window.removeEventListener('resize', init)
  }, [showSidebar])

  const toggleDesktopCollapse = () => {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    sessionStorage.setItem('sidebarCollapsed', next ? '1' : '0')
  }

  return (
    <>
      <div className="shell-container">
        <header className="shell-header">
          <div className="header-content">
            {showSidebar && (
  <button
    className="menu-toggle"
    onClick={() => setSidebarOpen(!sidebarOpen)}
    aria-label="Menu"
  >
    ☰
  </button>
)}

            <div className="logo">
              <Image src="/cafeqr-logo.svg" alt="Cafe QR" width={32} height={32} priority />
              <span>Cafe QR</span>
            </div>
            <nav className="header-nav">
              <Link href="/">Home</Link>
              <Link href="/faq">FAQ</Link>
            </nav>
          </div>
        </header>

        <div className="main-layout">
          {isMobile && showSidebar && sidebarOpen && (
            <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
          )}

          {showSidebar && (
            <aside
              className={[
                'sidebar',
                isMobile ? (sidebarOpen ? 'open' : '') : '',
                sidebarCollapsed ? 'collapsed' : '',
              ].join(' ')}
            >
              <div className="sidebar-content">
                <div className="sidebar-header">
                  <h2 className="sidebar-title">Owner Panel</h2>
                  {!isMobile && (
                    <button
                      className="collapse-btn"
                      onClick={toggleDesktopCollapse}
                      title={sidebarCollapsed ? 'Expand' : 'Collapse'}
                    >
                      {sidebarCollapsed ? '»' : '«'}
                    </button>
                  )}
                  {isMobile && (
                    <button className="close-btn" onClick={() => setSidebarOpen(false)} aria-label="Close">
                      ×
                    </button>
                  )}
                </div>
                <nav className="sidebar-nav">
                  <Link href="/dashboard" className="nav-item">
                    <FaHome className="nav-icon" />
                    <span className="nav-text">Overview</span>
                  </Link>
                  <Link href="/menu" className="nav-item">
                    <FaBars className="nav-icon" />
                    <span className="nav-text">Menu</span>
                  </Link>
                  <Link href="/orders" className="nav-item">
                    <FaUtensils className="nav-icon" />
                    <span className="nav-text">Orders</span>
                  </Link>
                  <Link href="/counter" className="nav-item">
                    <FaCashRegister className="nav-icon" />
                    <span className="nav-text">Counter Sale</span>
                  </Link>
                  <Link href="/inventory" className="nav-item">
                    <FaBoxes className="nav-icon" />
                    <span className="nav-text">Inventory</span>
                  </Link>
                  <Link href="/availability" className="nav-item">
                    <FaClock className="nav-icon" />
                    <span className="nav-text">Availability</span>
                  </Link>
                  <Link href="/promotions" className="nav-item">
                    <FaTags className="nav-icon" />
                    <span className="nav-text">Promotions</span>
                  </Link>
                  <Link href="/analytics" className="nav-item">
                    <FaChartBar className="nav-icon" />
                    <span className="nav-text">Analytics</span>
                  </Link>
                  <Link href="/sales" className="nav-item">
                    <FaCreditCard className="nav-icon" />
                    <span className="nav-text">Sales</span>
                  </Link>
                  <Link href="/settings" className="nav-item">
                    <FaCog className="nav-icon" />
                    <span className="nav-text">Settings</span>
                  </Link>
                  <Link href="/billing" className="nav-item">
                    <FaFileInvoice className="nav-icon" />
                    <span className="nav-text">Billing</span>
                  </Link>

                  <div className="nav-divider" />

                  <Link href="/logout" className="nav-item logout">
                    <FaSignOutAlt className="nav-icon" />
                    <span className="nav-text">Sign Out</span>
                  </Link>
                </nav>
              </div>
            </aside>
          )}

          <main className="main-content">
            <div className="content-wrapper">{children}</div>
          </main>
        </div>

        <footer className="shell-footer">
          <div className="footer-content">
            🔒 Powered by The Online Wala • Secure payments by Cashfree •{' '}
            <Link href="/privacy-policy" className="footer-link">
              Privacy Policy
            </Link>
          </div>
        </footer>
      </div>
      {/* Keep existing CSS in your globals/responsive files */}
    </>
  )
}
