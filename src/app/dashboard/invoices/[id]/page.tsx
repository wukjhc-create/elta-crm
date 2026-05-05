import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getInvoiceDetailAction } from '@/lib/actions/invoices'
import { InvoiceDetailClient } from './detail-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Faktura',
  description: 'Faktura detaljer og status',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params
  const detail = await getInvoiceDetailAction(id)
  if (!detail) notFound()
  return <InvoiceDetailClient initial={detail} />
}
