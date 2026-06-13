import { Metadata } from 'next'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { listInvoicesOverviewAction } from '@/lib/actions/invoices'
import { InvoicesOverviewClient } from './invoices-overview-client'

export const metadata: Metadata = {
  title: 'Fakturaoverblik',
  description: 'Udgående kundefakturaer på tværs af sager',
}

export const dynamic = 'force-dynamic'

export default async function InvoicesPage() {
  // Sprint Ø3.6 — cost-free fakturaoverblik. invoices.view.all = se alle
  // fakturaer på tværs af sager (ingen kost/margin — economy.cost_prices
  // er IKKE påkrævet). invoices.send styrer om rykker-knappen er aktiv.
  if (!(await pageHasPermission('invoices.view.all'))) {
    return <NoAccess permission="invoices.view.all" />
  }
  const canSend = await pageHasPermission('invoices.send')

  const res = await listInvoicesOverviewAction()
  if (!res.ok) {
    return (
      <div className="p-6">
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          Kunne ikke hente fakturaer: {res.message ?? 'ukendt fejl'}
        </div>
      </div>
    )
  }

  return <InvoicesOverviewClient rows={res.rows} canSend={canSend} />
}
