import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getCompanySettings } from '@/lib/actions/settings'
import { CompanySettingsClient } from './company-settings-client'

export const metadata: Metadata = {
  title: 'Virksomhed',
  description: 'Virksomhedsoplysninger og standardindstillinger',
}

export const dynamic = 'force-dynamic'

export default async function CompanySettingsPage() {
  const result = await getCompanySettings()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Virksomhed</h1>
          <p className="text-gray-600 mt-1">Virksomhedsoplysninger og standardindstillinger</p>
        </div>
      </div>

      {result.success && result.data ? (
        <CompanySettingsClient settings={result.data} />
      ) : (
        <div className="bg-white rounded-lg border p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Kunne ikke hente indstillinger</h2>
          <p className="text-gray-500">
            {result.error || 'Der opstod en fejl ved hentning af virksomhedsindstillinger.'}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Sørg for at database-migrationen er kørt.
          </p>
        </div>
      )}
    </div>
  )
}
