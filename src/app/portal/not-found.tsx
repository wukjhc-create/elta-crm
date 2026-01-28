import { FileQuestion } from 'lucide-react'

export default function PortalNotFound() {
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
          Kontroller venligst dit link eller kontakt afsenderen.
        </p>
      </div>
    </div>
  )
}
