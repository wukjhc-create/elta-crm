import { Metadata } from 'next'
import { Suspense } from 'react'
import { MailClient } from './mail-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mail',
  description: 'Indgående emails fra CRM-postkassen med automatisk kundekobling',
}

export default function MailPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Mail</h1>
              <p className="text-gray-500">Indgående emails med auto-linking</p>
            </div>
          </div>
          <div className="bg-white border rounded-lg p-12 text-center text-gray-500">
            Indlæser emails...
          </div>
        </div>
      }
    >
      <MailClient />
    </Suspense>
  )
}
