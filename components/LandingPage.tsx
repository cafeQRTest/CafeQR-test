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
        "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80", // aesthetic cafe
        "https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&w=800&q=80", // fresh organic vegetables
        "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=800&q=80", // modern pharmacy
        "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=800&q=80"  // latte art
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
        <div className="min-h-screen font-sans flex flex-col overflow-hidden text-gray-900 bg-white">


            {/* Sticky Navbar */}
            {/* Navbar - Transparent & Relative */}
            <motion.nav
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
                className="relative top-0 left-0 right-0 z-50 bg-transparent"
            >
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center gap-4">
                    <img src="/cafeqr-logo.svg" alt="CafeQR Logo" className="h-14 w-auto object-contain" />
                    <motion.span
                        className="text-2xl font-extrabold bg-gradient-to-r from-brand-orange to-gray-800 bg-clip-text text-transparent"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1 }}
                    >
                        Cafe QR
                    </motion.span>
                </div>
            </motion.nav>

            {/* Main Content Area */}
            {/* Main Content Area - Split Layout */}
            <motion.main
                className="flex-grow w-full max-w-7xl mx-auto px-6 pb-20 z-10 relative"
                animate={{ opacity: isLoading ? 0 : 1 }}
                transition={{ duration: 0.5 }}
            >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center h-full">

                    {/* Left Column: Text & Search */}
                    <div className="flex flex-col items-start justify-center text-left gap-4 max-w-xl relative">
                        <div className="flex flex-col gap-4 relative z-10">
                            <div className="h-auto relative">
                                <AnimatePresence mode="wait">
                                    <motion.h1
                                        key={activeTextIndex}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        transition={{ duration: 0.5 }}
                                        className="text-5xl md:text-5xl font-extrabold text-brand-orange tracking-tight leading-tight py-2 whitespace-nowrap"
                                    >
                                        {heroPhrases[activeTextIndex]}
                                    </motion.h1>
                                </AnimatePresence>
                            </div>
                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                className="text-xl md:text-2xl text-slate-700 font-medium py-2 leading-tight"
                            >
                                Your local favorites, delivered.
                            </motion.p>
                        </div>

                        {/* Primary Action Button */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className="w-full max-w-md"
                        >
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                animate={isLoading ? { scale: 0.98 } : {}}
                                onClick={!isLoading ? handleFind : undefined}
                                className="bg-brand-orange text-white font-bold rounded-full px-12 py-5 text-lg shadow-xl shadow-orange-200/50 hover:shadow-[0_10px_30px_-10px_rgba(255,82,0,0.5)] hover:bg-orange-600 transition-all flex items-center justify-center relative overflow-hidden"
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

                        {/* Helper Text (Popular Cities) - Staggered */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.8, delay: 0.8 }}
                            className="pt-4"
                        >
                            <p className="text-gray-400 font-medium text-sm tracking-wide mb-3">
                                POPULAR CITIES IN INDIA
                            </p>
                            <div className="flex gap-4 text-gray-400 text-sm font-semibold flex-wrap">
                                <span>Ahmedabad</span>
                                <span>Bangalore</span>
                                <span>Chennai</span>
                                <span>Delhi</span>
                                <span className="text-brand-orange cursor-pointer">More...</span>
                            </div>
                        </motion.div>
                    </div>

                    {/* Right Column: Hero Image Carousel */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                        className="relative hidden lg:flex items-center justify-center w-full"
                    >
                        <motion.div
                            animate={{ y: [0, -15, 0] }}
                            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                            className="relative w-full max-w-[500px] h-[500px] rounded-[40px] overflow-hidden shadow-[0_20px_60px_-15px_rgba(255,82,0,0.3)] bg-white"
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
                                    className="absolute inset-0 w-full h-full rounded-[40px]"
                                >
                                    <img
                                        src={heroImages[activeImgIndex]}
                                        alt="Essentials"
                                        className="w-full h-full object-cover rounded-[40px]"
                                    />
                                </motion.div>
                            </AnimatePresence>

                            {/* Subtle Inner Border/Sheen */}
                            <div className="absolute inset-0 rounded-[40px] ring-1 ring-black/5 pointer-events-none"></div>
                        </motion.div>
                    </motion.div>

                </div>
            </motion.main>

            {/* How It Works Section - Deep Glassmorphism */}
            <section className="py-48 relative z-10">
                <div className="max-w-7xl mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                        className="text-center mb-20"
                    >
                        <h2 className="text-4xl font-extrabold text-gray-900 mb-4">How It Works</h2>
                        <p className="text-gray-500 max-w-lg mx-auto text-lg font-medium">
                            Simple steps to get your favorite coffee delivered.
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                        {/* Step 1 */}
                        <motion.div
                            whileHover={{ y: -10 }}
                            className="p-8 bg-white border border-gray-100 shadow-xl rounded-2xl transition-all duration-300 group cursor-default"
                        >
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-6 shadow-sm">
                                <QrCode className="w-8 h-8 text-brand-orange" />
                            </div>
                            <h3 className="text-2xl font-bold text-brand-orange mb-3">Scan QR</h3>
                            <p className="text-gray-600 leading-relaxed font-medium">
                                Start by scanning the QR code at your cafe table or one of our flyers at home.
                            </p>
                        </motion.div>

                        {/* Step 2 */}
                        <motion.div
                            whileHover={{ y: -10 }}
                            className="p-8 bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl rounded-2xl transition-all duration-300 group cursor-default"
                        >
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-lg">
                                <Smartphone className="w-8 h-8 text-brand-orange" />
                            </div>
                            <h3 className="text-2xl font-bold text-brand-orange mb-3 drop-shadow-sm">Order Online</h3>
                            <p className="text-gray-100 leading-relaxed font-medium">
                                Browse the menu, customize your order, and select your favorite items in seconds.
                            </p>
                        </motion.div>

                        {/* Step 3 */}
                        <motion.div
                            whileHover={{ y: -10 }}
                            className="p-8 bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl rounded-2xl transition-all duration-300 group cursor-default"
                        >
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-lg">
                                <Zap className="w-8 h-8 text-brand-orange" />
                            </div>
                            <h3 className="text-2xl font-bold text-brand-orange mb-3 drop-shadow-sm">Fast Delivery</h3>
                            <p className="text-gray-100 leading-relaxed font-medium">
                                Sit back and relax. Your delicious coffee will be delivered to you in minutes.
                            </p>
                        </motion.div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default LandingPage;
