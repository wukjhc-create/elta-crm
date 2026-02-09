import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getProfile } from '@/lib/actions/settings'
import { ProfileSettingsClient } from './profile-settings-client'

export const metadata: Metadata = {
  title: 'Profil',
  description: 'Dine personlige oplysninger',
}

export const dynamic = 'force-dynamic'

export default async function ProfileSettingsPage() {
  const result = await getProfile()

  if (!result.success || !result.data) {
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
            <h1 className="text-3xl font-bold text-gray-900">Profil</h1>
            <p className="text-gray-600 mt-1">Dine personlige oplysninger</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-12 text-center">
          <p className="text-red-500">{result.error || 'Kunne ikke hente profil'}</p>
        </div>
      </div>
    )
  }

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
          <h1 className="text-3xl font-bold text-gray-900">Profil</h1>
          <p className="text-gray-600 mt-1">Dine personlige oplysninger</p>
        </div>
      </div>

      <ProfileSettingsClient profile={result.data} />
    </div>
  )
}
