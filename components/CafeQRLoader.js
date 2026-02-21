export default function CafeQRLoader({ message = "Loading...", fullScreen = true }) {
    return (
        <div
            className={
                fullScreen
                    ? "min-h-screen flex flex-col items-center justify-center bg-white"
                    : "flex flex-col items-center justify-center p-8 bg-white"
            }
            style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                minHeight: fullScreen ? "100vh" : "auto", background: "#fff",
                fontFamily: "system-ui, -apple-system, sans-serif"
            }}
        >
            <div
                className="flex flex-col items-center"
                style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
            >
                <img
                    src="/cafeqr-logo.svg"
                    alt="CafeQR"
                    style={{
                        width: 80,
                        height: 80,
                        marginBottom: 24,
                        objectFit: "contain",
                    }}
                />

                <div
                    style={{
                        width: 40,
                        height: 40,
                        border: "3px solid #f3f4f6",
                        borderTop: "3px solid #f97316",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite"
                    }}
                />

                <p style={{ marginTop: 16, color: "#6b7280", fontWeight: 600, fontSize: 14 }}>
                    {message}
                </p>
            </div>

            <style jsx>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
