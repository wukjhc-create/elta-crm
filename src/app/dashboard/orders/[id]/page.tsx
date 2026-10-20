import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServiceCase } from '@/lib/actions/service-cases'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { OrderDetailClient } from './order-detail-client'

export const metadata: Metadata = {
  title: 'Sag / Ordre',
  description: 'Detalje for en sag/ordre',
}

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isKnownCaseMiss(error: string): boolean {
  return error === 'Serviceopgave ikke fundet'
    || error === 'Sagen er ikke tildelt dig'
    || error.startsWith('Manglende tilladelse')
}

function OrderDetailLoadError({ message }: { message: string }) {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <p className="text-sm text-red-700" data-testid="order-detail-load-error">
        {message}. Det tælles ikke som at sagen ikke findes.
      </p>
    </div>
  )
}

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
      const { data: row, error } = await supabase
        .from('service_cases')
        .select('id')
        .eq('case_number', id)
        .maybeSingle()
      if (error) {
        return <OrderDetailLoadError message="Kunne ikke slå sagsnummeret op" />
      }
      if (row) resolvedId = row.id as string
      else notFound()
    } catch {
      return <OrderDetailLoadError message="Kunne ikke slå sagsnummeret op" />
    }
  }

  const result = await getServiceCase(resolvedId)
  if (!result.success || !result.data) {
    if (!result.success && result.error && !isKnownCaseMiss(result.error)) {
      return <OrderDetailLoadError message={result.error} />
    }
    notFound()
  }
  const sag = result.data

  // Resolve formand name + assignee email if formand_id is set.
  let formand: { id: string; name: string } | null = null
  let creator: { id: string; full_name: string | null } | null = null
  let plannedCount = 0
  try {
    const { supabase } = await getAuthenticatedClient()

    // Q-12 (review 2026-10-16): de tre opslag kører samtidig (før efter hinanden)
    const [countRes, empRes, profRes] = await Promise.all([
      // Planlagte work_orders count for header badge
      supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('case_id', sag.id)
        .in('status', ['planned', 'in_progress']),
      sag.formand_id
        ? supabase.from('employees').select('id, name, first_name, last_name').eq('id', sag.formand_id).maybeSingle()
        : Promise.resolve({ data: null }),
      sag.created_by
        ? supabase.from('profiles').select('id, full_name').eq('id', sag.created_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    plannedCount = countRes.count ?? 0

    if (sag.formand_id) {
      const emp = empRes.data as { id: string; name: string | null; first_name: string | null; last_name: string | null } | null
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
      const prof = profRes.data as { id: string; full_name: string | null } | null
      if (prof) {
        creator = { id: prof.id as string, full_name: (prof.full_name as string | null) ?? null }
      }
    }
  } catch {
    /* enrichment is best-effort */
  }

  const canSeeCost = await pageHasPermission('economy.cost_prices')
  // D50 — kost pr. timeregistrering afslører medarbejderens kostsats: kun løn-adgang (ellers aggregeret)
  const canSeeLaborCostDetail = await pageHasPermission('employees.payroll.view')
  // Sprint Ø3.1 — kost-fri faktureringsstatus + fakturakladde-adgang (bred).
  const canSeeBilling = await pageHasPermission('invoices.view.own_cases')
  // Sprint Ø3.4 — må brugeren faktisk oprette faktura? Styrer UX-disabled-state
  // i Fakturakladde-fanen (serveren håndhæver alligevel via actions).
  const canCreateInvoice = await pageHasPermission('invoices.create')
  // Sprint Ø7.2 — må brugeren tilføje noter? (serveren håndhæver alligevel).
  const canManageAllNotes = await pageHasPermission('cases.edit')
  // PM2-6 (Henrik 2026-10-19): den tekniske besigtigelse (notat/rapport) kun med service.edit — salg booker via kundekortet
  const canInspect = await pageHasPermission('service.edit')
  const canAddNote = canManageAllNotes || (await pageHasPermission('cases.edit.own'))
  const materialPerms = {
    seePrices: await pageHasPermission('materials.view.cost_prices'),
    add: await pageHasPermission('materials.add_to_case'),
    edit: await pageHasPermission('materials.edit'),
    del: await pageHasPermission('materials.delete'),
    // SC-14 (sags-review 2026-10-17): øvrige omkostninger har egne rettigheder (rediger/slet kun admin/serviceleder)
    otherEdit: await pageHasPermission('other_costs.edit'),
    otherDel: await pageHasPermission('other_costs.delete'),
  }

  return (
    <OrderDetailClient
      sag={sag}
      formand={formand}
      creator={creator}
      plannedWorkOrderCount={plannedCount}
      canSeeCost={canSeeCost}
      canSeeLaborCostDetail={canSeeLaborCostDetail}
      canSeeBilling={canSeeBilling}
      canCreateInvoice={canCreateInvoice}
      canAddNote={canAddNote}
      canManageAllNotes={canManageAllNotes}
      canEditCase={canManageAllNotes}
      canInspect={canInspect}
      materialPerms={materialPerms}
      tabAccess={{
        workOrders: (await pageHasPermission('work_orders.view.all')) || (await pageHasPermission('work_orders.view.assigned')),
        materials: await pageHasPermission('materials.view'),
        otherCosts: await pageHasPermission('other_costs.view'),
        allInvoices: await pageHasPermission('invoices.view.all'),
        // PR4-1 (pilot-review 4): aktivitetsloggen kræver cases.view.all (getServiceCaseActivity)
        caseActivity: await pageHasPermission('cases.view.all'),
      }}
    />
  )
}
