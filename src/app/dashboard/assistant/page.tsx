import type { Metadata } from 'next'
import Link from 'next/link'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { AssistantClient } from './assistant-client'

export const metadata: Metadata = { title: 'Assistent' }
export const dynamic = 'force-dynamic'

export default async function AssistantPage() {
  if (!(await pageHasPermission('customers.view'))) return <NoAccess permission="customers.view" />
  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Assistent</h1>
        <p className="mt-1 text-sm text-gray-600">
          Samme spørgsmål kan senere stilles fra en anden kanal. Her læser assistenten CRM og svarer. Den ringer, sender og godkender ikke.
        </p>
      </div>
      <p className="text-sm"><Link href="/dashboard/cti/queue" className="text-blue-700 hover:underline">Åbne tilbageringninger</Link></p>
      <AssistantClient />
    </div>
  )
}
