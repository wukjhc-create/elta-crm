import { Metadata } from 'next'
import { Suspense } from 'react'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { listAccountingSyncLogAction, type SyncLogStatusFilter } from '@/lib/actions/accounting'
import { SyncLogClient } from './sync-log-client'

export const metadata: Metadata = {
  title: 'Eksport-log (e-conomic)',
  description: 'Synklog og fejlhåndtering for regnskabseksport',
}

export const dynamic = 'force-dynamic'

export default async function EconomicSyncLogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; days?: string }>
}) {
  // settings.economic gater både visning og "Prøv igen" — samme model som
  // Ø6.0–6.2 (admin/bogholderi).
  if (!(await pageHasPermission('settings.economic'))) {
    return <NoAccess permission="settings.economic" />
  }
  const sp = await searchParams
  const status = (['all', 'success', 'failed', 'skipped'].includes(sp.status ?? '')
    ? sp.status
    : 'all') as SyncLogStatusFilter
  const days = sp.days === '7' ? 7 : sp.days === '30' ? 30 : null

  const res = await listAccountingSyncLogAction({ status, days })

  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Henter eksport-log…</div>}>
      <SyncLogClient initial={res} />
    </Suspense>
  )
}
