import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { MapPin, QrCode, Smartphone, Zap, Loader2 } from 'lucide-react';

const LandingPage = () => {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleFind = () => {
        setIsLoading(true);
        router.push('/app/auth');
    };

    return (
        <div className="landing-wrapper">
            {/* Navbar - Simple & Static */}
            <nav className="landing-nav">
                <div className="nav-inner">
                    <img src="/cafeqr-logo.svg" alt="CafeQR Logo" className="nav-logo" />
                    <span className="nav-brand">Cafe QR</span>
                </div>
            </nav>

            {/* Hero Section - Static & Faster */}
            <main className="hero-main">
                <div className="hero-container">
                    {/* Left Column: Text & CTA */}
                    <div className="hero-left">
                        <div className="hero-text-block">
                            <h1 className="hero-title">Savor the flavor.</h1>
                            <p className="hero-subtitle">Your local favorites, delivered.</p>
                        </div>

                        {/* Primary Action Button - No Animations */}
                        <div className="hero-cta-wrapper">
                            <button
                                onClick={handleFind}
                                disabled={isLoading}
                                className="hero-cta-btn"
                            >
                                {isLoading ? (
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Locating...</span>
                                    </div>
                                ) : (
                                    <span>Find Restaurants</span>
                                )}
                            </button>
                        </div>

                        {/* Popular Cities */}
                        <div className="hero-cities">
                            <p className="cities-label">POPULAR CITIES IN INDIA</p>
                            <div className="cities-list">
                                <span>Ahmedabad</span>
                                <span>Bangalore</span>
                                <span>Chennai</span>
                                <span>Delhi</span>
                                <span className="cities-more">More...</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Static Image (No Carousel/Floating) */}
                    <div className="hero-right">
                        <div className="hero-image-container">
                            <img
                                src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80"
                                alt="Essentials"
                                className="hero-image"
                                loading="eager"
                            />
                        </div>
                    </div>
                </div>
            </main>

            {/* How It Works Section - Static */}
            <section className="how-it-works">
                <div className="section-inner">
                    <div className="section-header">
                        <h2>How It Works</h2>
                        <p>Simple steps to get your favorite coffee delivered.</p>
                    </div>

                    <div className="steps-grid">
                        <div className="step-card">
                            <div className="step-icon">
                                <QrCode className="w-8 h-8 text-[#FF5200]" />
                            </div>
                            <h3>Scan QR</h3>
                            <p>Start by scanning the QR code at your cafe table or one of our flyers at home.</p>
                        </div>

                        <div className="step-card">
                            <div className="step-icon">
                                <Smartphone className="w-8 h-8 text-[#FF5200]" />
                            </div>
                            <h3>Order Online</h3>
                            <p>Browse the menu, customize your order, and select your favorite items in seconds.</p>
                        </div>

                        <div className="step-card">
                            <div className="step-icon">
                                <Zap className="w-8 h-8 text-[#FF5200]" />
                            </div>
                            <h3>Fast Delivery</h3>
                            <p>Sit back and relax. Your delicious coffee will be delivered to you in minutes.</p>
                        </div>
                    </div>
                </div>
            </section>

            <style jsx>{`
                .landing-wrapper {
                    min-height: 100vh;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    overflow-x: hidden;
                    background: #fff;
                    color: #1f2937;
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                    background-image: 
                        radial-gradient(at 0% 0%, rgba(255, 82, 0, 0.03) 0px, transparent 50%),
                        radial-gradient(at 100% 100%, rgba(255, 82, 0, 0.03) 0px, transparent 50%);
                }

                .landing-nav {
                    width: 100%;
                    border-bottom: 1px solid rgba(0,0,0,0.05);
                }
                .nav-inner {
                    max-width: 1280px;
                    margin: 0 auto;
                    padding: 0 32px;
                    height: 80px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .nav-logo {
                    height: 48px;
                    width: auto;
                    filter: drop-shadow(0 4px 12px rgba(255, 82, 0, 0.2));
                }
                .nav-brand {
                    font-size: 26px;
                    font-weight: 800;
                    color: #FF5200;
                    letter-spacing: -0.02em;
                }

                .hero-main {
                    flex: 1;
                    width: 100%;
                    padding: 60px 32px 100px;
                    display: flex;
                    align-items: center;
                }
                .hero-container {
                    max-width: 1280px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    gap: 64px;
                    align-items: center;
                }

                .hero-left {
                    display: flex;
                    flex-direction: column;
                    gap: 32px;
                    max-width: 600px;
                    width: 100%;
                }
                .hero-text-block {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                .hero-title {
                    font-size: 72px;
                    font-weight: 900;
                    color: #FF5200;
                    margin: 0;
                    line-height: 1.05;
                    letter-spacing: -0.04em;
                }
                .hero-subtitle {
                    font-size: 24px;
                    color: #475569;
                    font-weight: 500;
                    margin: 0;
                    line-height: 1.4;
                }
                .hero-cta-btn {
                    width: 100%;
                    background: #FF5200;
                    color: white;
                    font-weight: 800;
                    border-radius: 16px;
                    padding: 20px 40px;
                    font-size: 20px;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 10px 30px -10px rgba(255, 82, 0, 0.5);
                    transition: transform 0.1s, background 0.1s;
                }
                .hero-cta-btn:active {
                    transform: scale(0.98);
                }
                .hero-cta-btn:hover {
                    background: #e64a00;
                }
                .hero-cta-btn:disabled {
                    background: #cbd5e1;
                    box-shadow: none;
                    cursor: not-allowed;
                }

                .hero-cities {
                    padding-top: 24px;
                }
                .cities-label {
                    font-size: 11px;
                    color: #94a3b8;
                    font-weight: 700;
                    letter-spacing: 0.1em;
                    margin-bottom: 16px;
                    text-transform: uppercase;
                }
                .cities-list {
                    display: flex;
                    gap: 20px;
                    flex-wrap: wrap;
                    font-size: 14px;
                    color: #64748b;
                    font-weight: 600;
                }
                .cities-more {
                    color: #FF5200;
                }

                .hero-right {
                    display: none;
                }
                .hero-image-container {
                    width: 100%;
                    height: 520px;
                    border-radius: 32px;
                    overflow: hidden;
                    box-shadow: 0 20px 50px -20px rgba(0,0,0,0.15);
                    background: #f1f5f9;
                }
                .hero-image {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .how-it-works {
                    padding: 100px 32px;
                    background: #f8fafc;
                    border-top: 1px solid rgba(0,0,0,0.03);
                }
                .section-header {
                    text-align: center;
                    margin-bottom: 64px;
                }
                .section-header h2 {
                    font-size: 42px;
                    font-weight: 800;
                    color: #111827;
                    margin: 0 0 16px;
                    letter-spacing: -0.02em;
                }
                .section-header p {
                    font-size: 20px;
                    color: #64748b;
                }
                .steps-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 32px;
                    max-width: 1100px;
                    margin: 0 auto;
                }
                .step-card {
                    padding: 48px;
                    background: #fff;
                    border: 1px solid rgba(0,0,0,0.05);
                    border-radius: 24px;
                    box-shadow: 0 4px 20px -10px rgba(0,0,0,0.05);
                }
                .step-icon {
                    width: 64px;
                    height: 64px;
                    background: #fff7ed;
                    border-radius: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 32px;
                }
                .step-card h3 {
                    font-size: 24px;
                    font-weight: 800;
                    color: #111827;
                    margin-bottom: 16px;
                }
                .step-card p {
                    color: #64748b;
                    font-size: 16px;
                    line-height: 1.6;
                    font-weight: 500;
                }

                @media (min-width: 1024px) {
                    .hero-container {
                        flex-direction: row;
                        justify-content: space-between;
                        text-align: left;
                    }
                    .hero-left { flex: 1.2; }
                    .hero-right { display: flex; flex: 1; }
                    .steps-grid { grid-template-columns: repeat(3, 1fr); }
                }
            `}</style>
        </div>
    );
};

export default LandingPage;
