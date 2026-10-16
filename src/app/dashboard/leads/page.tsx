import { Metadata } from 'next'
import { getLeads } from '@/lib/actions/leads'
import { getUser } from '@/lib/supabase/server'
import { LeadsPageClient } from '@/components/modules/leads/leads-page-client'
import type { LeadStatus, LeadSource } from '@/types/leads.types'

export const metadata: Metadata = {
  title: 'Leads',
  description: 'Håndter leads og konverter til kunder',
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    search?: string
    status?: LeadStatus
    source?: LeadSource
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    view?: 'table' | 'kanban'
    mine?: string
  }>
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const isKanban = params.view === 'kanban'
  const page = isKanban ? 1 : (params.page ? parseInt(params.page, 10) : 1)
  // W-18: pageSize fra URL'en begrænses (1–100); ugyldig → 25
  const reqSize = params.pageSize ? parseInt(params.pageSize, 10) : 25
  const pageSize = isKanban ? 500 : (Number.isFinite(reqSize) ? Math.min(100, Math.max(1, reqSize)) : 25)
  const search = params.search || undefined
  const status = params.status || undefined
  const source = params.source || undefined
  const sortBy = params.sortBy || undefined
  const sortOrder = params.sortOrder || undefined
  // "Kun mine": leads tildelt den indloggede bruger
  const mine = params.mine === '1'
  const assigned_to = mine ? (await getUser())?.id : undefined

  // S-4 (pilot-review 2026-10-15): tavlen henter ÅBNE leads for sig (før fyldte vundne/tabte de 500 pladser, så ældre
  // åbne leads forsvandt) + vundne/tabte fra de seneste 90 dage til de lukkede kolonner
  const OPEN: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation']
  const kanbanSplit = isKanban && !status
  const result = await getLeads({
    page,
    pageSize,
    search,
    status,
    statuses: kanbanSplit ? OPEN : undefined,
    source,
    sortBy,
    sortOrder,
    assigned_to,
  })
  if (kanbanSplit && result.success && result.data) {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const closed = await getLeads({ page: 1, pageSize: 200, search, statuses: ['won', 'lost'], updatedSince: since, source, assigned_to })
    if (closed.success && closed.data) result.data.data = [...result.data.data, ...closed.data.data]
  }

  if (!result.success || !result.data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-600">
          {result.error || 'Kunne ikke hente leads'}
        </div>
      </div>
    )
  }

  return (
    <LeadsPageClient
      leads={result.data.data}
      pagination={{
        currentPage: result.data.page,
        totalPages: result.data.totalPages,
        totalItems: result.data.total,
        pageSize: result.data.pageSize,
      }}
      filters={{ search, status, source, mine }}
      sort={{ sortBy, sortOrder }}
      initialView={isKanban ? 'kanban' : 'table'}
    />
  )
}
