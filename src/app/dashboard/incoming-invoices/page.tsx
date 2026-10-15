import { Metadata } from 'next'
import { IncomingInvoicesListClient } from './list-client'
import {
  getApprovalQueueCountsAction,
  listIncomingInvoicesAction,
  type IncomingInvoiceListItem,
} from '@/lib/actions/incoming-invoices'

export const metadata: Metadata = {
  title: 'Indgående fakturaer',
  description: 'Godkend leverandørfakturaer og match til arbejdsordrer',
}

export const dynamic = 'force-dynamic'

const EMPTY_COUNTS = {
  missing_file: 0,
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

  let rows: IncomingInvoiceListItem[] = []
  let listError: string | null = null
  let counts: Awaited<ReturnType<typeof getApprovalQueueCountsAction>> = EMPTY_COUNTS
  let countsError: string | null = null

  try {
    const result = await listIncomingInvoicesAction({ status: 'needs_review' })
    if (result.error) listError = result.error
    else rows = result.rows
  } catch (err) {
    console.error('INCOMING INVOICES list fetch failed:', err)
    listError = 'Kunne ikke hente fakturaer'
  }

  try {
    counts = await getApprovalQueueCountsAction()
  } catch (err) {
    console.error('INCOMING INVOICES counts fetch failed:', err)
    countsError = 'Kunne ikke tælle fakturaer'
  }

  console.log('INCOMING INVOICES PAGE RENDER OK rows=' + rows.length)
  return (
    <IncomingInvoicesListClient
      initialRows={rows}
      initialCounts={counts}
      initialListError={listError}
      initialCountsError={countsError}
    />
  )
}
