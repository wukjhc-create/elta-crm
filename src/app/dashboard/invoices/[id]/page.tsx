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
  const loaded = await getInvoiceDetailAction(id)
  if (loaded.error) {
    return (
      <main className="max-w-lg mx-auto p-6">
        <p className="text-sm text-red-700" data-testid="invoice-detail-load-error">
          {loaded.error} Det tælles ikke som at fakturaen ikke findes.
        </p>
      </main>
    )
  }
  if (!loaded.detail) notFound()
  return <InvoiceDetailClient initial={loaded.detail} />
}
