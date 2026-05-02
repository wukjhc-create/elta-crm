import { Metadata } from 'next'
import { IncomingInvoicesListClient } from './list-client'
import {
  getApprovalQueueCountsAction,
  listIncomingInvoicesAction,
} from '@/lib/actions/incoming-invoices'

export const metadata: Metadata = {
  title: 'Indgående fakturaer',
  description: 'Godkend leverandørfakturaer og match til arbejdsordrer',
}

export const dynamic = 'force-dynamic'

export default async function IncomingInvoicesPage() {
  const [rows, counts] = await Promise.all([
    listIncomingInvoicesAction({ status: 'needs_review' }),
    getApprovalQueueCountsAction(),
  ])
  return <IncomingInvoicesListClient initialRows={rows} initialCounts={counts} />
}
