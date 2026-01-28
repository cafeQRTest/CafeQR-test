// pages/_error.js
import { useRouter } from 'next/router'

function Error({ statusCode }) {
    const router = useRouter()

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            background: '#f8fafc'
        }}>
            <div style={{
                textAlign: 'center',
                maxWidth: '400px'
            }}>
                <h1 style={{
                    fontSize: '72px',
                    fontWeight: '700',
                    color: '#f97316',
                    margin: '0 0 16px'
                }}>
                    {statusCode || 'Error'}
                </h1>
                <p style={{
                    fontSize: '18px',
                    color: '#6b7280',
                    margin: '0 0 24px'
                }}>
                    {statusCode === 404
                        ? 'This page could not be found.'
                        : 'An unexpected error occurred.'}
                </p>
                <button
                    onClick={() => router.push('/')}
                    style={{
                        background: '#f97316',
                        color: '#fff',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '8px',
                        fontSize: '16px',
                        fontWeight: '600',
                        cursor: 'pointer'
                    }}
                >
                    Go Home
                </button>
            </div>
        </div>
    )
}

Error.getInitialProps = ({ res, err }) => {
    const statusCode = res ? res.statusCode : err ? err.statusCode : 404
    return { statusCode }
}

export default Error
