import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, QrCode, Smartphone, Zap, ArrowRight, Loader2 } from 'lucide-react';

const LandingPage = () => {
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(false);
    const [activeImgIndex, setActiveImgIndex] = useState(0);
    const [activeTextIndex, setActiveTextIndex] = useState(0);

    const heroPhrases = [
        "Savor the flavor.",
        "Shop the essentials."
    ];

    useEffect(() => {
        const textTimer = setInterval(() => {
            setActiveTextIndex((prev) => (prev + 1) % heroPhrases.length);
        }, 4000);
        return () => clearInterval(textTimer);
    }, []);

    const heroImages = [
        "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=800&q=80"
    ];

    useEffect(() => {
        const timer = setInterval(() => {
            setActiveImgIndex((prev) => (prev + 1) % heroImages.length);
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    const handleFind = () => {
        setIsLoading(true);
        router.push('/app/auth');
    };

    return (
        <div className="landing-wrapper">
            {/* Navbar - Logo top-left with text */}
            <motion.nav
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
                className="landing-nav"
            >
                <div className="nav-inner">
                    <img src="/cafeqr-logo.svg" alt="CafeQR Logo" className="nav-logo" />
                    <motion.span
                        className="nav-brand"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1 }}
                    >
                        Cafe QR
                    </motion.span>
                </div>
            </motion.nav>

            {/* Hero Section - Two Column Layout */}
            <motion.main
                className="hero-main"
                animate={{ opacity: isLoading ? 0 : 1 }}
                transition={{ duration: 0.5 }}
            >
                <div className="hero-container">
                    {/* Left Column: Text & CTA */}
                    <div className="hero-left">
                        <div className="hero-text-block">
                            <AnimatePresence mode="wait">
                                <motion.h1
                                    key={activeTextIndex}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.5 }}
                                    className="hero-title"
                                >
                                    {heroPhrases[activeTextIndex]}
                                </motion.h1>
                            </AnimatePresence>
                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                className="hero-subtitle"
                            >
                                Your local favorites, delivered.
                            </motion.p>
                        </div>

                        {/* Primary Action Button */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className="hero-cta-wrapper"
                        >
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                animate={isLoading ? { scale: 0.98 } : {}}
                                onClick={!isLoading ? handleFind : undefined}
                                className="hero-cta-btn"
                            >
                                <span className={`transition-opacity duration-200 ${isLoading ? 'opacity-30' : 'opacity-100'}`}>
                                    Find Restaurants
                                </span>
                                {isLoading && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                                    </div>
                                )}
                            </motion.button>
                        </motion.div>

                        {/* Popular Cities */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.8, delay: 0.8 }}
                            className="hero-cities"
                        >
                            <p className="cities-label">POPULAR CITIES IN INDIA</p>
                            <div className="cities-list">
                                <span>Ahmedabad</span>
                                <span>Bangalore</span>
                                <span>Chennai</span>
                                <span>Delhi</span>
                                <span className="cities-more">More...</span>
                            </div>
                        </motion.div>
                    </div>

                    {/* Right Column: Image Carousel */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                        className="hero-right"
                    >
                        <motion.div
                            animate={{ y: [0, -15, 0] }}
                            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                            className="hero-image-container"
                        >
                            <AnimatePresence mode="popLayout">
                                <motion.div
                                    key={activeImgIndex}
                                    initial={{ opacity: 0, scale: 1.15 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{
                                        opacity: { duration: 1.2, ease: "easeInOut" },
                                        scale: { duration: 7, ease: "linear" }
                                    }}
                                    className="hero-image-inner"
                                >
                                    <img
                                        src={heroImages[activeImgIndex]}
                                        alt="Essentials"
                                        className="hero-image"
                                    />
                                </motion.div>
                            </AnimatePresence>
                            <div className="hero-image-sheen"></div>
                        </motion.div>
                    </motion.div>
                </div>
            </motion.main>

            {/* How It Works Section */}
            <section className="how-it-works">
                <div className="section-inner">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                        className="section-header"
                    >
                        <h2>How It Works</h2>
                        <p>Simple steps to get your favorite coffee delivered.</p>
                    </motion.div>

                    <div className="steps-grid">
                        <motion.div whileHover={{ y: -10 }} className="step-card">
                            <div className="step-icon">
                                <QrCode className="w-8 h-8 text-brand-orange" />
                            </div>
                            <h3>Scan QR</h3>
                            <p>Start by scanning the QR code at your cafe table or one of our flyers at home.</p>
                        </motion.div>

                        <motion.div whileHover={{ y: -10 }} className="step-card step-card-glass">
                            <div className="step-icon step-icon-white">
                                <Smartphone className="w-8 h-8 text-brand-orange" />
                            </div>
                            <h3>Order Online</h3>
                            <p>Browse the menu, customize your order, and select your favorite items in seconds.</p>
                        </motion.div>

                        <motion.div whileHover={{ y: -10 }} className="step-card step-card-glass">
                            <div className="step-icon step-icon-white">
                                <Zap className="w-8 h-8 text-brand-orange" />
                            </div>
                            <h3>Fast Delivery</h3>
                            <p>Sit back and relax. Your delicious coffee will be delivered to you in minutes.</p>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Scoped Styles */}
            <style jsx>{`
                /* ===== ROOT WRAPPER - FULL WIDTH ===== */
                .landing-wrapper {
                    min-height: 100vh;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    overflow-x: hidden;
                    background: #fff;
                    color: #1f2937;
                    font-family: system-ui, -apple-system, sans-serif;
                }

                /* ===== NAVBAR ===== */
                .landing-nav {
                    position: relative;
                    z-index: 50;
                    background: transparent;
                    width: 100%;
                }
                .nav-inner {
                    max-width: 1280px;
                    margin: 0 auto;
                    padding: 0 24px;
                    height: 80px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .nav-logo {
                    height: 56px;
                    width: auto;
                    object-fit: contain;
                }
                .nav-brand {
                    font-size: 24px;
                    font-weight: 800;
                    background: linear-gradient(to right, #FF5200, #374151);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                /* ===== HERO MAIN ===== */
                .hero-main {
                    flex: 1;
                    width: 100%;
                    padding: 0 24px 80px;
                    position: relative;
                    z-index: 10;
                }
                .hero-container {
                    max-width: 1280px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    gap: 48px;
                    align-items: center;
                    min-height: 70vh;
                }

                /* ===== HERO LEFT (Text Column) ===== */
                .hero-left {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    justify-content: center;
                    text-align: left;
                    gap: 16px;
                    max-width: 600px;
                    width: 100%;
                }
                .hero-text-block {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .hero-title {
                    font-size: 48px;
                    font-weight: 800;
                    color: #FF5200;
                    letter-spacing: -0.02em;
                    line-height: 1.1;
                    margin: 0;
                }
                .hero-subtitle {
                    font-size: 20px;
                    color: #475569;
                    font-weight: 500;
                    margin: 0;
                }
                .hero-cta-wrapper {
                    width: 100%;
                    max-width: 320px;
                }
                .hero-cta-btn {
                    width: 100%;
                    background: #FF5200;
                    color: white;
                    font-weight: 700;
                    border-radius: 9999px;
                    padding: 20px 48px;
                    font-size: 18px;
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 20px 40px -10px rgba(255, 82, 0, 0.4);
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .hero-cta-btn:hover {
                    background: #e64a00;
                    box-shadow: 0 25px 50px -10px rgba(255, 82, 0, 0.5);
                }
                .hero-cities {
                    padding-top: 16px;
                }
                .cities-label {
                    font-size: 12px;
                    color: #9ca3af;
                    font-weight: 600;
                    letter-spacing: 0.05em;
                    margin-bottom: 12px;
                }
                .cities-list {
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                    font-size: 14px;
                    color: #9ca3af;
                    font-weight: 600;
                }
                .cities-more {
                    color: #FF5200;
                    cursor: pointer;
                }

                /* ===== HERO RIGHT (Image Column) ===== */
                .hero-right {
                    display: none; /* Hidden on mobile */
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    max-width: 500px;
                }
                .hero-image-container {
                    width: 100%;
                    max-width: 500px;
                    height: 500px;
                    border-radius: 40px;
                    overflow: hidden;
                    position: relative;
                    box-shadow: 0 20px 60px -15px rgba(255, 82, 0, 0.3);
                    background: #fff;
                }
                .hero-image-inner {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    border-radius: 40px;
                }
                .hero-image {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    border-radius: 40px;
                }
                .hero-image-sheen {
                    position: absolute;
                    inset: 0;
                    border-radius: 40px;
                    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05);
                    pointer-events: none;
                }

                /* ===== HOW IT WORKS ===== */
                .how-it-works {
                    padding: 120px 24px;
                    position: relative;
                    z-index: 10;
                    background: #f8fafc;
                }
                .section-inner {
                    max-width: 1280px;
                    margin: 0 auto;
                }
                .section-header {
                    text-align: center;
                    margin-bottom: 80px;
                }
                .section-header h2 {
                    font-size: 36px;
                    font-weight: 800;
                    color: #111827;
                    margin: 0 0 16px;
                }
                .section-header p {
                    font-size: 18px;
                    color: #6b7280;
                    font-weight: 500;
                    margin: 0;
                    max-width: 500px;
                    margin: 0 auto;
                }
                .steps-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 24px;
                    max-width: 1000px;
                    margin: 0 auto;
                }
                .step-card {
                    padding: 32px;
                    background: #fff;
                    border: 1px solid #f3f4f6;
                    border-radius: 16px;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
                    transition: all 0.3s ease;
                    cursor: default;
                }
                .step-card-glass {
                    background: rgba(255,255,255,0.8);
                    backdrop-filter: blur(12px);
                }
                .step-icon {
                    width: 64px;
                    height: 64px;
                    background: #f9fafb;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 24px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                }
                .step-icon-white {
                    background: #fff;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                }
                .step-card h3 {
                    font-size: 24px;
                    font-weight: 700;
                    color: #FF5200;
                    margin: 0 0 12px;
                }
                .step-card p {
                    font-size: 16px;
                    color: #6b7280;
                    line-height: 1.6;
                    margin: 0;
                }

                /* ===== RESPONSIVE: TABLET+ (768px) ===== */
                @media (min-width: 768px) {
                    .hero-container {
                        flex-direction: row;
                        justify-content: space-between;
                        gap: 64px;
                    }
                    .hero-left {
                        flex: 1;
                    }
                    .hero-right {
                        display: flex;
                        flex: 1;
                    }
                    .hero-title {
                        font-size: 56px;
                    }
                    .hero-subtitle {
                        font-size: 24px;
                    }
                    .steps-grid {
                        grid-template-columns: repeat(3, 1fr);
                    }
                }

                /* ===== RESPONSIVE: DESKTOP (1024px) ===== */
                @media (min-width: 1024px) {
                    .hero-title {
                        font-size: 64px;
                    }
                }
            `}</style>
        </div>
    );
};

export default LandingPage;
