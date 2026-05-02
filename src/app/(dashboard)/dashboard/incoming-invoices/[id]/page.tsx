import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { IncomingInvoiceDetailClient } from './detail-client'
import { getIncomingInvoiceDetailAction } from '@/lib/actions/incoming-invoices'

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
  return <IncomingInvoiceDetailClient initial={detail} />
}
