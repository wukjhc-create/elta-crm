import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { IncomingInvoiceDetailClient } from './detail-client'
import { getIncomingInvoiceDetailAction } from '@/lib/actions/incoming-invoices'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { getEconomicSettings, isEconomicReady } from '@/lib/services/economic-client'

export const metadata: Metadata = {
  title: 'Indgående faktura',
  description: 'Detalje + godkendelse for leverandørfaktura',
}

export const dynamic = 'force-dynamic'

export default async function IncomingInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getIncomingInvoiceDetailAction(id)
  if (!detail) notFound()
  // Sprint Ø9.0 — manuel e-conomic-bogføring (kun approve-rolle + integration
  // klar). economicReady styrer disabled/"ikke opsat"-state i UI; ingen secrets.
  const canPost = await pageHasPermission('incoming_invoices.approve')
  let economicReady = false
  try {
    economicReady = isEconomicReady(await getEconomicSettings())
  } catch {
    economicReady = false
  }
  return <IncomingInvoiceDetailClient initial={detail} canPost={canPost} economicReady={economicReady} />
}
