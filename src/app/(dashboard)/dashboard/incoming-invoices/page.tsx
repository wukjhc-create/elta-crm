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

const EMPTY_COUNTS = {
  awaiting_approval: 0,
  needs_review: 0,
  approved: 0,
  rejected: 0,
  posted: 0,
}

export default async function IncomingInvoicesPage() {
  // 404 investigation: log render + isolate data-fetch failures so a
  // throwing action never escapes the page to the not-found boundary.
  console.log('INCOMING INVOICES PAGE RENDER START:', new Date().toISOString())

  let rows: Awaited<ReturnType<typeof listIncomingInvoicesAction>> = []
  let counts: Awaited<ReturnType<typeof getApprovalQueueCountsAction>> = EMPTY_COUNTS

  try {
    rows = await listIncomingInvoicesAction({ status: 'needs_review' })
  } catch (err) {
    console.error('INCOMING INVOICES list fetch failed:', err)
  }

  try {
    counts = await getApprovalQueueCountsAction()
  } catch (err) {
    console.error('INCOMING INVOICES counts fetch failed:', err)
  }

  console.log('INCOMING INVOICES PAGE RENDER OK rows=' + rows.length)
  return <IncomingInvoicesListClient initialRows={rows} initialCounts={counts} />
}
