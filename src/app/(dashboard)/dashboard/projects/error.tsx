'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ProjectsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Projects error:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Kunne ikke indlæse projekter
        </h1>
        <p className="text-gray-600 mb-6">
          Der opstod en fejl ved indlæsning af projektdata. Prøv at genindlæse siden.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 mb-6 font-mono bg-gray-100 px-3 py-2 rounded-md">
            Fejlkode: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
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
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
