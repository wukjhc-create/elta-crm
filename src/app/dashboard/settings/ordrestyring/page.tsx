import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { OrdrestyringSettingsClient } from './ordrestyring-settings-client'

export const metadata: Metadata = {
  title: 'Ordrestyring',
  description: 'Forbindelsesstatus og konfiguration for Ordrestyring',
}

export const dynamic = 'force-dynamic'

export default function OrdrestyringSettingsPage() {
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
          <h1 className="text-3xl font-bold text-gray-900">Ordrestyring</h1>
          <p className="text-gray-600 mt-1">Forbindelsesstatus og diagnostik</p>
        </div>
      </div>

      <OrdrestyringSettingsClient />
    </div>
  )
}
