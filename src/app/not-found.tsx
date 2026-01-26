import Link from 'next/link'
import { FileQuestion, Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
          <FileQuestion className="w-8 h-8 text-gray-400" />
        </div>

        <h1 className="text-6xl font-bold text-gray-900 mb-2">404</h1>

        <h2 className="text-xl font-semibold text-gray-700 mb-2">
          Siden blev ikke fundet
        </h2>

        <p className="text-gray-600 mb-8">
          Beklager, vi kunne ikke finde den side, du leder efter.
          Den kan være blevet flyttet eller slettet.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
          >
            <Home className="w-4 h-4" />
            Gå til dashboard
          </Link>

          <Link
            href="javascript:history.back()"
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Gå tilbage
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t">
          <p className="text-sm text-gray-500">
            Har du brug for hjælp?{' '}
            <Link href="/dashboard" className="text-primary hover:underline">
              Kontakt support
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
