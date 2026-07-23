import { Metadata } from 'next'
import { Suspense } from 'react'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { PurchaseOperationsClient } from './purchase-operations-client'

export const metadata: Metadata = {
  title: 'Indkøbsdrift',
  description: 'Porteføljevidt overblik over leverandørfakturaer der kræver handling',
}

export const dynamic = 'force-dynamic'

export default async function PurchaseOperationsPage() {
  // Sprint Ø9.5/Ø9.6 — gated bag incoming_invoices.view (defense-in-depth ud
  // over server action-gaten). Intern indkøbsøkonomi, ikke kundevendt.
  const canView = await pageHasPermission('incoming_invoices.view')
  if (!canView) return <NoAccess permission="incoming_invoices.view" />

  // Sprint Ø9.7 — inline konvertér+godkend kræver BEGGE rettigheder (samme dual-
  // gate som Ø9.2-flowet). Side-gate er defense-in-depth ud over server action.
  const canConvert =
    (await pageHasPermission('incoming_invoices.approve')) &&
    (await pageHasPermission('materials.add_to_case'))

  // Suspense: klienten bruger useSearchParams (URL-drevne filtre).
  return (
    <Suspense fallback={null}>
      <PurchaseOperationsClient canConvert={canConvert} />
    </Suspense>
  )
}
