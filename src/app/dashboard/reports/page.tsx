import type { Metadata } from 'next'
import ReportsClient from './reports-client'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Rapporter | ELTA Drift',
  description: 'Omsætning, projekt-rentabilitet og team-produktivitet',
}

export default async function ReportsPage() {
  // Sprint Ø2.13 — rapporter afslører intern rentabilitet/DB/margin → kræver
  // economy.view (admin/serviceleder/bogholderi).
  if (!(await pageHasPermission('economy.view'))) {
    return <NoAccess permission="economy.view" />
  }
  // RX-10 (rapport-review 2026-10-18): kun eksportknapper brugeren har ret til (bogholderi fik fem, hvoraf tre altid fejlede)
  const [customers, leads, offers, projects, calculations] = await Promise.all([
    pageHasPermission('reports.export'), pageHasPermission('leads.view'), pageHasPermission('offers.view'),
    pageHasPermission('economy.cost_prices'), pageHasPermission('tools.calculations'),
  ])
  return <ReportsClient exports={{ customers, leads, offers, projects, calculations }} />
}
