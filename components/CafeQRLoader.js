import { motion, AnimatePresence } from "framer-motion";

export default function CafeQRLoader({ message = "Loading...", fullScreen = true }) {
    return (
        <div
            className={
                fullScreen
                    ? "min-h-screen flex flex-col items-center justify-center bg-white"
                    : "flex flex-col items-center justify-center p-8 bg-white"
            }
            style={{
                // Fallback styles if Tailwind is not fully effective in all contexts
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                minHeight: fullScreen ? "100vh" : "auto", background: "#fff"
            }}
        >
            <AnimatePresence>
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col items-center"
                    style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
                >
                    <motion.img
                        src="/cafeqr-logo.svg"
                        alt="CafeQR"
                        className="w-24 h-24 mb-6 object-contain"
                        style={{ width: 96, height: 96, marginBottom: 24, objectFit: "contain" }}
                        animate={{
                            y: [0, -10, 0],
                            rotate: [0, 5, -5, 0]
                        }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                    />
                    <motion.div
                        className="h-2 w-24 bg-gray-100 rounded-full overflow-hidden"
                        style={{ height: 8, width: 96, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}
                    >
                        <motion.div
                            className="h-full bg-brand-orange"
                            style={{ height: "100%", background: "#f97316" }} // Brand orange
                            initial={{ x: "-100%" }}
                            animate={{ x: "100%" }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        />
                    </motion.div>
                    <p className="mt-4 text-gray-500 font-medium text-sm" style={{ marginTop: 16, color: "#6b7280", fontWeight: 500, fontSize: 14 }}>
                        {message}
                    </p>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
