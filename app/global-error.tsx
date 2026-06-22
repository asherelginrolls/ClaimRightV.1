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
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#F4FAFE' }}>
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
              border: '1px solid #E3EEF7',
              borderRadius: '16px',
              background: '#FFFFFF',
              padding: '40px 32px',
              boxShadow: '0 8px 24px -12px rgba(14,42,69,0.18)',
            }}
          >
            <p style={{ fontSize: '22px', fontWeight: 600, color: '#0E2C45', margin: '0 0 12px' }}>
              Something went wrong
            </p>
            <p style={{ fontSize: '14px', color: '#3D5B72', lineHeight: 1.6, margin: '0 0 28px' }}>
              An unexpected error has occurred. Please refresh the page or try again.
            </p>
            <button
              onClick={reset}
              style={{
                width: '100%',
                background: '#2C7BC0',
                color: 'white',
                border: 'none',
                borderRadius: '999px',
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: '12px',
              }}
            >
              Try again
            </button>
            <p style={{ fontSize: '11px', color: '#9CB4C8', margin: 0 }}>
              Persistent issue?{' '}
              <a href="mailto:support@ashray.in" style={{ color: '#1F5E97' }}>
                support@ashray.in
              </a>
            </p>
          </div>
        </div>
      </body>
    </html>
  )
}
