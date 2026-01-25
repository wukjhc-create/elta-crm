import { XCircle } from 'lucide-react'
import Link from 'next/link'

export default function InvalidTokenPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Ugyldig eller udløbet adgang
          </h1>
          <p className="text-gray-600">
            Det link du har brugt er enten ugyldigt eller udløbet.
            Kontakt venligst din sælger for at få et nyt link.
          </p>
        </div>

        <div className="pt-4">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium"
          >
            Gå til forsiden
          </Link>
        </div>

        <p className="text-sm text-gray-500">
          Har du spørgsmål? Kontakt os på{' '}
          <a href="mailto:info@eltasolar.dk" className="text-primary hover:underline">
            info@eltasolar.dk
          </a>
        </p>
      </div>
    </div>
  )
}
