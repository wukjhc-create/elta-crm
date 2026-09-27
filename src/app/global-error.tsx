'use client'

import { useEffect } from 'react'

/**
 * P1 #8 — sidste fejl-boundary: fanger fejl i selve root-layoutet (fx provider- eller session-fejl),
 * som app/error.tsx ikke kan fange. Erstatter hele dokumentet, derfor egne <html>/<body> og inline-styles
 * (globals.css er ikke garanteret indlæst her).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="da">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f9fafb', color: '#111827' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Systemet kunne ikke indlæses</h1>
            <p style={{ color: '#4b5563', margin: '0 0 20px', lineHeight: 1.5 }}>
              Der opstod en uventet fejl. Prøv igen — hjælper det ikke, så log ud og ind igen eller kontakt Henrik.
            </p>
            {error.digest && (
              <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#9ca3af', margin: '0 0 20px' }}>Fejlkode: {error.digest}</p>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={reset}
                style={{ padding: '8px 16px', borderRadius: 6, border: 0, background: '#111827', color: '#fff', cursor: 'pointer', fontSize: 14 }}
              >
                Prøv igen
              </button>
              <a href="/login" style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', color: '#111827', textDecoration: 'none', fontSize: 14 }}>
                Log ind igen
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
