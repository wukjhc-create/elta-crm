import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServiceCase } from '@/lib/actions/service-cases'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { OrderDetailClient } from './order-detail-client'

export const metadata: Metadata = {
  title: 'Sag / Ordre',
  description: 'Detalje for en sag/ordre',
}

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Accept either UUID or case_number in the URL — operators will type
  // case_number (SVC-01000) far more often than the UUID.
  let resolvedId = id
  if (!UUID_RE.test(id)) {
    try {
      const { supabase } = await getAuthenticatedClient()
      const { data: row } = await supabase
        .from('service_cases')
        .select('id')
        .eq('case_number', id)
        .maybeSingle()
      if (row) resolvedId = row.id as string
      else notFound()
    } catch {
      notFound()
    }
  }

  const result = await getServiceCase(resolvedId)
  if (!result.success || !result.data) {
    notFound()
  }
  const sag = result.data

  // Resolve formand name + assignee email if formand_id is set.
  let formand: { id: string; name: string } | null = null
  let creator: { id: string; full_name: string | null } | null = null
  let plannedCount = 0
  try {
    const { supabase } = await getAuthenticatedClient()

    // Planlagte work_orders count for header badge
    const { count } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('case_id', sag.id)
      .in('status', ['planned', 'in_progress'])
    plannedCount = count ?? 0

    if (sag.formand_id) {
      const { data: emp } = await supabase
        .from('employees')
        .select('id, name, first_name, last_name')
        .eq('id', sag.formand_id)
        .maybeSingle()
      if (emp) {
        formand = {
          id: emp.id as string,
          name:
            (emp.name as string | null) ||
            [emp.first_name, emp.last_name].filter(Boolean).join(' ') ||
            '—',
        }
      }
    }
    if (sag.created_by) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', sag.created_by)
        .maybeSingle()
      if (prof) {
        creator = { id: prof.id as string, full_name: (prof.full_name as string | null) ?? null }
      }
    }
  } catch {
    /* enrichment is best-effort */
  }

  return (
    <OrderDetailClient
      sag={sag}
      formand={formand}
      creator={creator}
      plannedWorkOrderCount={plannedCount}
    />
  )
}
