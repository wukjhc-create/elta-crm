import { Metadata } from 'next'
import { Suspense } from 'react'
import { ProposalsClient } from './proposals-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Forslag fra mails',
  description: 'AI-genererede sag- og tilbudsforslag fra indkomne mails',
}

export default function ProposalsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Forslag fra mails</h1>
            <p className="text-gray-500">Indlæser forslag...</p>
          </div>
        </div>
      }
    >
      <ProposalsClient />
    </Suspense>
  )
}
