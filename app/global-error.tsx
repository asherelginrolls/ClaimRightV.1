'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/global-error]', error.message)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#f5f0e8' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              maxWidth: '400px',
              width: '100%',
              textAlign: 'center',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              background: '#fef2f2',
              padding: '40px 32px',
            }}
          >
            <p style={{ fontSize: '22px', fontWeight: '600', color: '#991b1b', margin: '0 0 12px' }}>
              Something went wrong
            </p>
            <p style={{ fontSize: '14px', color: '#b91c1c', lineHeight: '1.6', margin: '0 0 28px' }}>
              An unexpected error has occurred. Please refresh the page or try again.
            </p>
            <button
              onClick={reset}
              style={{
                width: '100%',
                background: '#991b1b',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '12px',
              }}
            >
              Try again
            </button>
            <p style={{ fontSize: '11px', color: '#ef4444', margin: 0 }}>
              Persistent issue?{' '}
              <a href="mailto:support@claimright.in" style={{ color: '#b91c1c' }}>
                support@claimright.in
              </a>
            </p>
          </div>
        </div>
      </body>
    </html>
  )
}
