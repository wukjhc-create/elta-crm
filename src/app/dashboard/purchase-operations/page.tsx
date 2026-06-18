import { Metadata } from 'next'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { PurchaseOperationsClient } from './purchase-operations-client'

export const metadata: Metadata = {
  title: 'Indkøbsdrift',
  description: 'Porteføljevidt overblik over leverandørfakturaer der kræver handling',
}

export const dynamic = 'force-dynamic'

export default async function PurchaseOperationsPage() {
  // Sprint Ø9.5 — gated bag incoming_invoices.view (defense-in-depth ud over
  // server action-gaten). Intern indkøbsøkonomi, ikke kundevendt.
  const canView = await pageHasPermission('incoming_invoices.view')
  if (!canView) return <NoAccess permission="incoming_invoices.view" />

  return <PurchaseOperationsClient />
}
