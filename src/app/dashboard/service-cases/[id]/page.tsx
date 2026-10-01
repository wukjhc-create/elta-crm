import { redirect } from 'next/navigation'

/** N9d: Service-detaljen er samlet på ordresiden (samme sag; aflevering ligger under fanen "Aflevering"). */
export const dynamic = 'force-dynamic'

export default async function ServiceCaseDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/dashboard/orders/${encodeURIComponent(id)}`)
}
