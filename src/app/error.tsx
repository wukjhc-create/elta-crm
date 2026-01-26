'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to monitoring service
    console.error('Application error:', error)
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
          Beklager, der opstod en uventet fejl. Vores team er blevet underrettet.
        </p>

        {error.digest && (
          <p className="text-xs text-gray-400 mb-6 font-mono">
            Fejlkode: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Prøv igen
          </button>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50 font-medium"
          >
            <Home className="w-4 h-4" />
            Gå til dashboard
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t">
          <p className="text-sm text-gray-500">
            Hvis problemet fortsætter, kontakt venligst support.
          </p>
        </div>
      </div>
    </div>
  )
}
