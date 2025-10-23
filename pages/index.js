//pages/index.js

import Link from 'next/link'
import Image from 'next/image'
// 1. IMPORT the singleton function
import { getSupabase } from '../services/supabase'

// 2. REMOVE the supabase prop from the component
export default function Home() {
  // Get the Supabase client instance from our singleton
  const supabase = getSupabase();

  // 2. REMOVE the useRequireAuth hook as it's not needed on a public page
  // const { checking } = useRequireAuth(supabase)
  // if (checking) return null; // This is no longer needed

  const handleGoogleLogin = async () => {
    // 3. USE the singleton instance directly
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // It's recommended to use a relative path for redirectTo,
        // as this works better across different environments (local, staging, prod).
        redirectTo: '/owner', 
      },
    })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f6f8fc 0%, #e9ecef 100%)',
        fontFamily: '"Inter", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: '20px'
        }}
      >
        {/* Logo and Brand */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <Image src="/cafeqr-logo.svg" alt="Cafe QR Logo" width={64} height={64} style={{ marginRight: 16, height: "auto" }} priority />
          <div>
            <h1 style={{ fontWeight: 800, fontSize: 48, margin: 0, color: '#2c3e50' }}>
              Cafe QR
            </h1>
          </div>
        </div>

        {/* Tagline */}
        <div style={{ textAlign: 'center', marginBottom: 50, maxWidth: 600 }}>
          <h2 style={{
            fontSize: 28, color: '#34495e', fontWeight: 600, marginBottom: 16,
          }}>
            Scan. Order. Pay.
          </h2>
          <p style={{ fontSize: 20, color: '#7f8c8d', lineHeight: 1.6, margin: 0 }}>
            Transform your restaurant with contactless dining.<br />
            <strong style={{ color: '#e67e22' }}>
              No app downloads. No hassle. Just results.
            </strong>
          </p>
        </div>

        {/* CTA Buttons */}
        <div
          style={{
            display: 'flex', gap: 20, marginBottom: 30,
            flexWrap: 'wrap', justifyContent: 'center'
          }}
        >
          <Link href="/signup" className="btn btn-primary btn-raise">
            🚀 Start Free Trial
          </Link>
          <Link href="/login" className="btn btn-secondary btn-raise">
            Login
          </Link>
        </div>

        {/* Google Login */}
        <button
          onClick={handleGoogleLogin}
          className="btn btn-outline-secondary"
          style={{ marginBottom: 30, display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <Image src="/google-logo.svg" alt="Google" width={20} height={20} style={{ height: 20 }} />
          Continue with Google
        </button>

        {/* Demo Link */}
        <Link
          href="/restaurants/demo?table=1"
          className="btn btn-outline-primary btn-raise"
          style={{ marginBottom: 40 }}
        >
          🎯 Try Live Demo
        </Link>

        {/* Benefits Section */}
        <section
          style={{
            background: '#fff', borderRadius: 20,
            boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
            padding: '40px 30px', maxWidth: 500, textAlign: 'center',
            border: '1px solid #ecf0f1'
          }}
        >
          <h2 style={{
            fontWeight: 800, fontSize: 28, color: '#2c3e50', marginBottom: 30
          }}>
            Why Choose Cafe QR?
          </h2>

          <div style={{ textAlign: 'left', color: '#34495e', fontSize: 16, lineHeight: 2 }}>
            <div style={{ marginBottom: 15, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 24, marginRight: 15 }}>🏪</span>
              <span><strong>Restaurants:</strong> Setup in 5 minutes, manage everything</span>
            </div>
            <div style={{ marginBottom: 15, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 24, marginRight: 15 }}>📱</span>
              <span><strong>Customers:</strong> Scan QR → Order → Pay instantly</span>
            </div>
            <div style={{ marginBottom: 15, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 24, marginRight: 15 }}>💳</span>
              <span><strong>Payments:</strong> Secure UPI, auto-confirmation</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 24, marginRight: 15 }}>⚡</span>
              <span><strong>Zero Downloads:</strong> Works on any smartphone</span>
            </div>
          </div>

          {/* Stats */}
          <div
            style={{
              marginTop: 30, padding: '20px', background: '#f8f9fa',
              borderRadius: 12, display: 'flex', justifyContent: 'space-around'
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#e67e22' }}>5min</div>
              <div style={{ fontSize: 12, color: '#7f8c8d' }}>Setup Time</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#27ae60' }}>100%</div>
              <div style={{ fontSize: 12, color: '#7f8c8d' }}>Contactless</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#3498db' }}>₹0</div>
              <div style={{ fontSize: 12, color: '#7f8c8d' }}>Setup Cost</div>
            </div>
          </div>
        </section>

        {/* Contact/Support Section */}
        <section
          style={{
            padding: '40px 20px', textAlign: 'center', marginTop: 40
          }}
        >
          <h3 style={{ color: '#2c3e50', marginBottom: 20, fontSize: 24 }}>
            Need Help Getting Started?
          </h3>
          <p style={{ color: '#7f8c8d', marginBottom: 30, fontSize: 16 }}>
            Our team is here to help you set up your restaurant in minutes.
          </p>

          <div
            style={{
              display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 30
            }}
          >
            {/* External protocols remain anchors */}
            <a href="mailto:pnriyas50@gmail.com" className="btn btn-outline-secondary btn-raise">
              📧 Email Support
            </a>
            <a href="tel:+917012120844" className="btn btn-outline-success btn-raise">
              📞 Call Us
            </a>
          </div>

          <div style={{ marginTop: 30 }}>
            <Link href="/faq" className="btn btn-outline-primary btn-raise">
              ❓ Frequently Asked Questions
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
