'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function PortalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Portal error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Der opstod en fejl
        </h1>

        <p className="text-gray-600 mb-6">
          Beklager, der opstod en fejl. Prøv venligst at genindlæse siden.
        </p>

        {error.digest && (
          <p className="text-xs text-gray-400 mb-6 font-mono">
            Fejlkode: {error.digest}
          </p>
        )}

        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Prøv igen
        </button>
      </div>
    </div>
  )
}
