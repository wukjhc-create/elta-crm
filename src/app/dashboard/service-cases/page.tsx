import { redirect } from 'next/navigation'

/**
 * N9d: "Service" og "Sager / Ordrer" var to lister over samme tabel (service_cases) med forskellige rettigheder og
 * funktioner. Alt fra Service-modulet findes nu på ordresiderne (aflevering, stedinfo, prioritet, tællere, agent) —
 * gamle links/bogmærker sendes videre med deres filtre.
 */
export const dynamic = 'force-dynamic'

export default async function ServiceCasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const keep = new URLSearchParams()
  for (const k of ['search', 'status', 'priority', 'page']) {
    const v = params[k]
    if (typeof v === 'string' && v) keep.set(k, v)
  }
  const qs = keep.toString()
  redirect(`/dashboard/orders${qs ? `?${qs}` : ''}`)
}
