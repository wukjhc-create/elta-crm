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
  return <ReportsClient />
}
