//pages/index.js

import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <div className="landing-page" style={{ backgroundColor: '#0f172a' }}>
      {/* Background Ambience */}
      <div className="ambient-light orange" />
      <div className="ambient-light green" />
      <div className="mesh-grid" />

      {/* Hero Section */}
      <main className="hero">
        <div className="hero-content">
          <div className="hero-text">
            {/* Integrated Header/Logo Area */}
            <div className="hero-header">
              <div className="logo-section">
                <Image src="/cafeqr-logo.svg" alt="Cafe QR" width={48} height={48} priority />
                <span className="logo-text">Cafe QR</span>
              </div>
            </div>
            <div className="hero-badge">
              <span className="badge-dot"></span>
              The #1 Choice for Modern Restaurants
            </div>
            
            <h1 className="hero-title">
              Manage Your Restaurant<br />
              <span className="gradient-text">Anywhere, Anytime.</span>
            </h1>
            
            <p className="hero-sub">
              A complete POS ecosystem that works on <strong>Web & App</strong>. 
              Take orders, manage tables, and track sales from any device.
              <span className="highlight"> Seamless. Powerful. Elegant.</span>
            </p>
            
            <div className="cta-group">
              <a href="/login" className="large-hero-btn">
                <span>Start Now</span>
                <span className="arrow">→</span>
              </a>
            </div>

            <div className="feature-checklist">
              <div className="check-item"><span className="check">✓</span> Unlimited Orders</div>
              <div className="check-item"><span className="check">✓</span> QR Code Menus</div>
              <div className="check-item"><span className="check">✓</span> Owner Dashboard</div>
              <div className="check-item"><span className="check">✓</span> Kitchen Display</div>
              <div className="check-item"><span className="check">✓</span> Customer Ordering</div>
              <div className="check-item"><span className="check">✓</span> Invoice Management</div>
            </div>
          </div>

          {/* 3D Visual Section with Counter Sale UI */}
          <div className="hero-visual">
            <div className="phone-container">
              <div className="phone-3d">
                <div className="phone-screen">
                  {/* Simulated Counter Sale UI */}
                  <div className="pos-header">
                    <div className="pos-title">Counter Sale</div>
                    <div className="pos-actions">
                      <div className="pos-btn-icon">⚡</div>
                      <div className="pos-btn-icon">⚙️</div>
                    </div>
                  </div>
                  
                  {/* Search Bar Simulation */}
                  <div className="pos-search">
                    <span className="search-icon">🔍</span>
                    <div className="search-placeholder">Search menu items...</div>
                  </div>

                  {/* Categories */}
                  <div className="pos-cats">
                    <div className="pos-cat active">All</div>
                    <div className="pos-cat">Burger</div>
                    <div className="pos-cat">Pizza</div>
                    <div className="pos-cat">Coffee</div>
                  </div>

                  {/* Items Grid */}
                  <div className="pos-grid">
                    <div className="pos-card">
                      <div className="pos-img burger">🍔</div>
                      <div className="pos-info">
                        <div className="pos-name">Cheese Burger</div>
                        <div className="pos-price">₹149</div>
                      </div>
                    </div>
                    <div className="pos-card">
                      <div className="pos-img pizza">🍕</div>
                      <div className="pos-info">
                        <div className="pos-name">Margherita</div>
                        <div className="pos-price">₹299</div>
                      </div>
                    </div>
                    <div className="pos-card">
                      <div className="pos-img coffee">☕</div>
                      <div className="pos-info">
                        <div className="pos-name">Latte</div>
                        <div className="pos-price">₹120</div>
                      </div>
                    </div>
                    <div className="pos-card">
                      <div className="pos-img fries">🍟</div>
                      <div className="pos-info">
                        <div className="pos-name">Fries</div>
                        <div className="pos-price">₹89</div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Cart Bar */}
                  <div className="pos-cart-bar">
                    <div className="cart-summary">
                      <span className="item-count">2 Items</span>
                      <span className="cart-total">₹448.00</span>
                    </div>
                    <div className="checkout-btn">Place Order ›</div>
                  </div>
                </div>
                <div className="phone-shine" />
              </div>
              
              {/* Floating Elements */}
              <div className="float-card card-1">
                <span className="float-icon">📈</span>
                <div>
                  <strong>Live Analytics</strong>
                  <p>Sales up by 24%</p>
                </div>
              </div>
              <div className="float-card card-2">
                <span className="float-icon">🔔</span>
                <div>
                  <strong>Kitchen Display</strong>
                  <p>New Order #1024</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Features Grid */}
      <section className="features">
        <div className="section-header">
          <h2>Everything you need to run a modern restaurant</h2>
          <p>Powerful features packed into a simple, elegant interface.</p>
        </div>
        
        <div className="features-grid">
          <div className="feature-card">
            <div className="icon-box gradient-1">🖥️</div>
            <h3>POS & Billing</h3>
            <p>Fast, reliable billing for dine-in, takeaway, and delivery. Works offline.</p>
          </div>
          <div className="feature-card">
            <div className="icon-box gradient-2">📱</div>
            <h3>Digital Menu</h3>
            <p>Scanning QR code opens a beautiful, interactive menu for customers.</p>
          </div>
          <div className="feature-card">
            <div className="icon-box gradient-3">👨‍🍳</div>
            <h3>Kitchen Display</h3>
            <p>Send orders directly to the kitchen screen. Paperless and efficient.</p>
          </div>
          <div className="feature-card">
            <div className="icon-box gradient-4">📊</div>
            <h3>Reports & Analytics</h3>
            <p>Track sales, best-selling items, and staff performance in real-time.</p>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="bottom-cta">
        <div className="bottom-cta-content">
          <h2>Ready to transform your restaurant?</h2>
          <p>Join thousands of restaurants using Cafe QR today.</p>
          <a href="/login" className="large-hero-btn">
            <span>Start Now</span>
            <span className="arrow">→</span>
          </a>
        </div>
      </section>

      <style jsx>{`
        /* --- Layout & Global --- */
        :global(html),
        :global(body),
        :global(#__next) {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden !important; /* Kill global scrollbars */
          background: #0f172a !important;
          font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
        }

        .landing-page {
          height: 100%; /* Fill window */
          width: 100%;
          position: relative;
          display: flex;
          flex-direction: column;
          color: white;
          overflow-y: auto; /* The ONE valid scrollbar */
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch; /* Smooth iOS scroll */
        }

        .ambient-light {
          position: absolute;
          width: 800px;
          height: 800px;
          border-radius: 50%;
          filter: blur(140px);
          opacity: 0.15;
          z-index: 0;
          pointer-events: none;
          animation: pulse 12s ease-in-out infinite;
        }
        .orange { top: -300px; right: -200px; background: #ea580c; }
        .green { bottom: -300px; left: -200px; background: #15803d; animation-delay: -6s; }

        .mesh-grid {
          position: fixed;
          inset: 0;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(circle at 50% 50%, black 20%, transparent 80%);
          z-index: 0;
          pointer-events: none;
        }

        /* --- Hero Header (Logo) --- */
        .hero-header {
          margin-bottom: 20px;
          position: relative;
          z-index: 10;
        }
        .logo-section { 
          display: inline-flex; 
          align-items: center; 
          gap: 16px; 
          font-weight: 800; 
          font-size: 28px; 
          letter-spacing: -1px;
          color: white;
        }
        .logo-text { 
          color: white; /* Fallback */
          background: linear-gradient(to right, #ffffff, #e2e8f0); 
          -webkit-background-clip: text; 
          -webkit-text-fill-color: transparent; 
        }

        /* --- Hero --- */
        .hero {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          /* align-items: center; REMOVED rigid centering to prevent clipping */
          justify-content: center;
          padding: 40px 32px 120px; /* Added large bottom buffer */
          box-sizing: border-box;
          gap: 40px;
        }

        .hero-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          gap: 80px;
          margin: auto 0; /* Safe centering (centers if space, scrolls if not) */
        }

        .hero-text { flex: 1; z-index: 2; max-width: 650px; }
        
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          padding: 8px 16px;
          border-radius: 99px;
          font-size: 13px;
          font-weight: 600;
          color: #94a3b8;
          margin-bottom: 20px;
        }
        .badge-dot { width: 6px; height: 6px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 10px #22c55e; }

        .hero-title {
          font-size: 56px;
          line-height: 1.05;
          font-weight: 800;
          margin-bottom: 16px;
          letter-spacing: -2px;
        }
        .gradient-text {
          background: linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .hero-sub {
          font-size: 16px;
          color: #94a3b8;
          margin-bottom: 24px;
          line-height: 1.5;
          max-width: 500px;
        }
        .highlight { color: #e2e8f0; font-weight: 500; }

        .cta-group { display: flex; gap: 16px; margin-bottom: 24px; }
        .cta-btn {
          display: flex; align-items: center; gap: 12px;
          padding: 16px 32px; border-radius: 16px;
          font-weight: 600; font-size: 16px;
          cursor: pointer; text-decoration: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .cta-btn.primary {
          background: white; color: #0f172a; border: none;
          box-shadow: 0 10px 25px -5px rgba(255, 255, 255, 0.2);
        }
        .cta-btn.primary:hover { transform: translateY(-2px); box-shadow: 0 20px 30px -10px rgba(255, 255, 255, 0.3); }
        
        .large-hero-btn {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 24px 64px;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%) !important;
          border-radius: 99px;
          color: white !important;
          font-size: 24px;
          font-weight: 800;
          text-decoration: none;
          box-shadow: 0 25px 50px -12px rgba(249, 115, 22, 0.6);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: 4px solid rgba(255,255,255,0.1);
          animation: float-btn 6s ease-in-out infinite;
        }
        .large-hero-btn:hover {
          transform: translateY(-4px); /* Hover lifts slightly independent of float */
          box-shadow: 0 35px 70px -15px rgba(249, 115, 22, 0.8);
          border-color: rgba(255,255,255,0.3);
          animation-play-state: paused; /* Pause float on hover for stability */
        }
        
        .arrow { font-size: 1.1em; transition: transform 0.2s; }
        .large-hero-btn:hover .arrow { transform: translateX(8px); }

        @keyframes float-btn {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .feature-checklist {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-top: 24px;
        }
        .check-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #e2e8f0;
          font-weight: 500;
        }
        .check {
          color: #f97316;
          font-weight: 800;
          font-size: 18px;
        }

        /* --- 3D Phone Visual (Simulated POS) --- */
        .hero-visual {
          flex: 1;
          display: flex;
          justify-content: center;
          perspective: 1500px;
          position: relative;
        }
        .phone-container {
          position: relative;
          width: 320px;
          height: 650px;
          transform-style: preserve-3d;
          animation: float 8s ease-in-out infinite;
        }
        .phone-3d {
          position: absolute; inset: 0;
          background: #0f172a; border-radius: 44px;
          border: 10px solid #1e293b;
          box-shadow: 
            0 50px 100px -20px rgba(0, 0, 0, 0.6),
            inset 0 0 0 2px rgba(255,255,255,0.1);
          overflow: hidden;
          transform-style: preserve-3d;
        }
        .phone-screen {
          background: #18181b; height: 100%; width: 100%;
          padding: 20px; display: flex; flex-direction: column; gap: 16px;
        }
        
        /* Simulated POS UI */
        .pos-header { display: flex; justify-content: space-between; align-items: center; padding-top: 10px; margin-bottom: 4px; }
        .pos-title { font-weight: 700; font-size: 18px; color: white; }
        .pos-actions { display: flex; gap: 12px; }
        .pos-btn-icon { width: 32px; height: 32px; background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        
        .pos-search {
          background: #27272a; padding: 12px 16px; border-radius: 12px;
          display: flex; align-items: center; gap: 10px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .search-icon { font-size: 14px; opacity: 0.5; }
        .search-placeholder { font-size: 13px; color: #a1a1aa; }
        
        .pos-cats { display: flex; gap: 8px; overflow-x: hidden; padding-bottom: 4px; }
        .pos-cat { padding: 6px 14px; border-radius: 20px; background: #27272a; color: #a1a1aa; font-size: 12px; font-weight: 500; white-space: nowrap; }
        .pos-cat.active { background: #f97316; color: white; }
        
        .pos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex: 1; overflow: hidden; }
        .pos-card {
          background: #27272a; border-radius: 16px; padding: 12px;
          display: flex; flex-direction: column; gap: 8px;
          border: 1px solid rgba(255,255,255,0.03);
        }
        .pos-img {
          height: 60px; background: #3f3f46; border-radius: 10px;
          display: flex; align-items: center; justify-content: center; font-size: 28px;
        }
        .burger { background: #fef3c7; } .pizza { background: #fee2e2; } 
        .coffee { background: #ecfeff; } .fries { background: #fff7ed; }
        
        .pos-info { display: flex; flex-direction: column; gap: 4px; }
        .pos-name { font-size: 12px; font-weight: 600; color: #e4e4e7; }
        .pos-price { font-size: 11px; color: #f97316; font-weight: 700; }
        
        .pos-cart-bar {
          background: #f97316; border-radius: 16px; padding: 16px;
          display: flex; justify-content: space-between; align-items: center;
          margin-top: auto; box-shadow: 0 10px 20px rgba(249, 115, 22, 0.2);
        }
        .cart-summary { display: flex; flex-direction: column; }
        .item-count { font-size: 10px; opacity: 0.9; font-weight: 500; }
        .cart-total { font-size: 14px; font-weight: 700; }
        .checkout-btn { font-size: 13px; font-weight: 600; }

        .phone-shine {
          position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          transform: skewX(-20deg); pointer-events: none;
        }

        /* Float Cards */
        .float-card {
          position: absolute;
          background: rgba(30, 41, 59, 0.9); backdrop-filter: blur(12px);
          padding: 14px 18px; border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.1);
          display: flex; align-items: center; gap: 14px;
          box-shadow: 0 20px 40px -4px rgba(0,0,0,0.5);
          transform: translateZ(40px);
        }
        .float-icon { font-size: 24px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 10px; }
        .float-card strong { display: block; font-size: 13px; margin-bottom: 2px; color: white; }
        .float-card p { margin: 0; font-size: 11px; color: #94a3b8; font-weight: 500; }
        .card-1 { top: 80px; left: -60px; animation: float-simple 6s ease-in-out infinite; }
        .card-2 { bottom: 100px; right: -60px; animation: float-simple 7s ease-in-out infinite reverse; }

        /* --- Features Section --- */
        .features {
          width: 100%; max-width: 1400px; margin: 0 auto;
          padding: 100px 32px; position: relative; z-index: 2;
        }
        .section-header { text-align: center; max-width: 700px; margin: 0 auto 80px; }
        .section-header h2 { font-size: 42px; font-weight: 800; margin-bottom: 16px; letter-spacing: -1px; }
        .section-header p { font-size: 18px; color: #94a3b8; line-height: 1.6; }
        
        .features-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px;
        }
        .feature-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          padding: 32px 24px; border-radius: 24px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative; overflow: hidden;
        }
        .feature-card:hover {
          transform: translateY(-8px);
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.1);
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5);
        }
        .icon-box {
          width: 56px; height: 56px; border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          font-size: 26px; margin-bottom: 24px;
        }
        .gradient-1 { background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); color: #fff; box-shadow: 0 10px 20px -5px rgba(249, 115, 22, 0.4); }
        .gradient-2 { background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%); color: #fff; box-shadow: 0 10px 20px -5px rgba(99, 102, 241, 0.4); }
        .gradient-3 { background: linear-gradient(135deg, #10b981 0%, #34d399 100%); color: #fff; box-shadow: 0 10px 20px -5px rgba(16, 185, 129, 0.4); }
        .gradient-4 { background: linear-gradient(135deg, #ec4899 0%, #f472b6 100%); color: #fff; box-shadow: 0 10px 20px -5px rgba(236, 72, 153, 0.4); }

        .feature-card h3 { font-size: 18px; margin: 0 0 12px 0; font-weight: 700; color: white; }
        .feature-card p { margin: 0; color: #94a3b8; line-height: 1.6; font-size: 15px; }

        /* Mobile Responsive */
        @media (max-width: 1100px) {
          .nav-content { padding: 0 20px; }
          .hero { 
            flex-direction: column; 
            padding: 40px 20px; 
            gap: 60px; 
            text-align: center;
            justify-content: flex-start;
            min-height: auto;
          }
          /* CRITICAL FIX: Stack inner content vertically */
          .hero-content {
             flex-direction: column;
             gap: 40px;
          }
          .hero-text { margin: 0 auto; width: 100%; max-width: 600px; }
          .hero-title { font-size: 48px; }
          .hero-sub { margin: 0 auto 32px; font-size: 16px; }
          .hero-header { margin-bottom: 32px; justify-content: center; display: flex; }
          .hero-badge { margin: 0 auto 24px; }
          
          .cta-group { justify-content: center; flex-direction: column; width: 100%; max-width: 400px; margin: 0 auto 40px; }
          .cta-btn { justify-content: center; width: 100%; box-sizing: border-box; }
          
          .feature-checklist { 
            grid-template-columns: repeat(2, 1fr); 
            text-align: left; 
            max-width: 400px; 
            margin: 30px auto 0; 
            justify-items: center;
          }
          
          /* Scale down phone for tablets/mobile */
          .phone-container { 
            width: 300px; 
            height: 600px; 
            transform: scale(0.9);
            margin: 0 auto;
          }
          
          .features { padding: 60px 20px; }
          .features-grid { grid-template-columns: repeat(2, 1fr); }
        }
        
        @media (max-width: 600px) {
          .hero-title { font-size: 38px; }
          .features-grid { grid-template-columns: 1fr; }
          .feature-checklist { grid-template-columns: 1fr; }
          .bottom-cta h2 { font-size: 28px; }
          
          /* Hero Button Responsive */
          .large-hero-btn { 
            padding: 20px 48px; 
            font-size: 20px; 
            width: 100%; 
            max-width: 300px;
            justify-content: center;
          }
        }
        
        /* Dedicated Phone Layout (< 480px) */
        /* Dedicated Phone Layout (< 480px) */
        @media (max-width: 480px) {
          .hero { padding: 40px 20px 60px; gap: 30px; }
          .hero-title { font-size: 40px; margin-bottom: 16px; }
          .hero-sub { font-size: 16px; margin-bottom: 32px; }
          .large-hero-btn { padding: 16px 32px; font-size: 18px; }
          
          /* Hide 3D Phone on Mobile for cleaner "Full View" */
          .hero-visual { display: none !important; }
          
          .feature-checklist { 
            grid-template-columns: 1fr; 
            gap: 12px; 
            margin-top: 0; 
            background: rgba(255,255,255,0.03);
            padding: 20px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.05);
          }
          .cta-group { margin-bottom: 32px; }
        }

        /* --- Bottom CTA --- */
        .bottom-cta {
          padding: 100px 32px;
          text-align: center;
          position: relative;
          z-index: 2;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 1) 100%);
        }
        .bottom-cta-content {
          max-width: 600px;
          margin: 0 auto;
          background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
          border: 1px solid rgba(255,255,255,0.05);
          padding: 60px 40px;
          border-radius: 32px;
          box-shadow: 0 40px 80px -20px rgba(0,0,0,0.5);
        }
        .bottom-cta h2 { font-size: 36px; font-weight: 800; margin-bottom: 16px; letter-spacing: -1px; }
        .bottom-cta p { font-size: 18px; color: #94a3b8; margin-bottom: 40px; }
        
        @keyframes float { 0%, 100% { transform: translateY(0) rotateX(5deg) rotateY(-5deg); } 50% { transform: translateY(-20px) rotateX(8deg) rotateY(0deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.12; transform: scale(1); } 50% { opacity: 0.2; transform: scale(1.1); } }
        @keyframes float-simple { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      `}</style>
    </div>
  )
}
