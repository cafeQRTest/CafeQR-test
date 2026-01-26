/** @type {import('tailwindcss').Config} */
module.exports = {
    // Isolate Tailwind to Delivery App only:
    content: [
        "./pages/app/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}"
    ],
    // Essential settings to protect existing POS styles:
    corePlugins: {
        preflight: false,     // Disable global reset
        container: false,     // Disable .container class to avoid conflict with theme.css
    },
    theme: {
        extend: {
            colors: {
                brand: {
                    orange: '#FF5200', // Swiggy style '#FF5200'
                    white: '#FFFFFF',
                },
            },
            boxShadow: {
                'brand-soft': '0 4px 12px rgba(255, 82, 0, 0.12)', // Soft orange-tinted shadow configuration
            }
        },
    },
    plugins: [],
}
