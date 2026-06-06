import { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { MailClient } from './mail-client'
import { getProposalsCount } from '@/lib/actions/proposals'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mail',
  description: 'Indgående emails fra fælles postkasse med automatisk kundekobling',
}

export default async function MailPage() {
  const proposalsCount = await getProposalsCount().catch(() => 0)

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
      {proposalsCount > 0 && (
        <div className="mb-4">
          <Link
            href="/dashboard/mail/proposals"
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors text-sm"
          >
            <span className="font-medium text-amber-900">Forslag fra mails</span>
            <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-xs font-bold">
              {proposalsCount}
            </span>
            <span className="text-amber-700">venter på godkendelse</span>
          </Link>
        </div>
      )}
      <MailClient />
    </Suspense>
  )
}
