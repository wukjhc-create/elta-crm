import { Metadata } from 'next'
import { getEmployeeEconomyAction } from '@/lib/actions/employee-economy'
import { EmployeeEconomyClient } from '@/components/modules/economy/employee-economy-client'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'

export const metadata: Metadata = {
  title: 'Medarbejderøkonomi',
  description: 'Read-only oversigt over medarbejderøkonomi baseret på time_log-snapshots',
}

export const dynamic = 'force-dynamic'

/**
 * Sprint Ø1.3 commit 3 — read-only medarbejderøkonomi-side.
 *
 * Server-henter via getEmployeeEconomyAction (default: ingen datofilter) og
 * overlader rendering til den presentational klient-komponent. Ingen
 * skrivning, ingen charts/eksport endnu.
 */
export default async function EmployeeEconomyPage() {
  // Sprint Ø2.11 — viser intern løn-kost/DB → kræver economy.cost_prices.
  if (!(await pageHasPermission('economy.cost_prices'))) {
    return <NoAccess permission="economy.cost_prices" />
  }
  const result = await getEmployeeEconomyAction({})
  return <EmployeeEconomyClient result={result} />
}
