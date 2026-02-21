import React, { useEffect } from 'react';
import { useRouter } from 'next/router';

const LandingPage = () => {
    const router = useRouter();

    useEffect(() => {
        router.prefetch('/app/auth');
    }, [router]);

    const handleFind = () => {
        router.push('/app/auth');
    };

    return (
        <div className="min-h-screen w-full flex flex-col bg-white font-sans text-gray-900">
            {/* Clean, static navbar */}
            <nav className="w-full border-b border-gray-100 flex items-center px-6 py-4 bg-white">
                <div className="flex items-center gap-3">
                    <img src="/cafeqr-logo.svg" alt="CafeQR Logo" className="h-10 w-auto" />
                    <span className="text-2xl font-extrabold text-[#FF5200] tracking-tighter">Cafe QR</span>
                </div>
            </nav>

            {/* Centered Hero Section */}
            <main className="flex-1 flex flex-col items-center justify-center px-4 w-full">
                <div className="flex flex-col items-center justify-center text-center max-w-xl gap-8">
                    <div className="flex flex-col items-center gap-4">
                        <h1 className="text-5xl md:text-7xl font-black text-[#FF5200] m-0 tracking-tight">
                            Savor the flavor.
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-600 font-medium m-0">
                            Your local favorites, delivered.
                        </p>
                    </div>

                    <button
                        onClick={handleFind}
                        className="bg-[#FF5200] text-white font-bold rounded-xl py-4 px-10 text-xl flex items-center justify-center w-full sm:w-auto"
                    >
                        Find Restaurants
                    </button>
                </div>
            </main>
        </div>
    );
};

export default LandingPage;
