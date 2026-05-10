'use client'

/**
 * Sprint 8D-1: Sager-tab på kunde-detalje.
 *
 * Viser alle service_cases for kunden — sorteret efter status (åbne først,
 * lukkede sidst) og derefter created_at desc. Klik åbner /dashboard/orders/{id}.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Briefcase, ChevronRight, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import { getCustomerServiceCases } from '@/lib/actions/service-cases'
import {
  SERVICE_CASE_STATUS_LABELS,
  SERVICE_CASE_STATUS_COLORS,
  SERVICE_CASE_TYPE_LABELS,
  SERVICE_CASE_PRIORITY_LABELS,
  SERVICE_CASE_PRIORITY_COLORS,
  type ServiceCase,
  type ServiceCaseStatus,
  type ServiceCaseType,
  type ServiceCasePriority,
} from '@/types/service-cases.types'

const STATUS_RANK: Record<ServiceCaseStatus, number> = {
  new: 0,
  in_progress: 1,
  pending: 2,
  converted: 3,
  closed: 4,
}

function fmtAmount(n: number | null | undefined): string | null {
  if (n == null) return null
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
    maximumFractionDigits: 0,
  }).format(Number(n))
}

function fmtDate(s: string | null | undefined): string | null {
  if (!s) return null
  try {
    return format(new Date(s), 'd. MMM yyyy', { locale: da })
  } catch {
    return s.slice(0, 10)
  }
}

export function CustomerCasesTab({ customerId }: { customerId: string }) {
  const [cases, setCases] = useState<ServiceCase[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    getCustomerServiceCases(customerId)
      .then((data) => {
        if (cancelled) return
        // Sort: open first, closed last; within group: newest first
        const sorted = [...data].sort((a, b) => {
          const rankA = STATUS_RANK[a.status as ServiceCaseStatus] ?? 99
          const rankB = STATUS_RANK[b.status as ServiceCaseStatus] ?? 99
          if (rankA !== rankB) return rankA - rankB
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        setCases(sorted)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [customerId])

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (cases.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-12 text-center text-gray-500">
        <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Ingen sager endnu</p>
        <p className="text-sm mt-1">
          Sager oprettes via mailmodulet (&quot;Opret sag fra mail&quot;) eller direkte under{' '}
          <Link href="/dashboard/orders" className="text-blue-600 hover:underline">/dashboard/orders</Link>.
        </p>
      </div>
    )
  }

  const openCount = cases.filter((c) => c.status !== 'closed' && c.status !== 'converted').length

  return (
    <div className="bg-white rounded-lg border">
      <div className="p-4 border-b flex items-center gap-2">
        <Briefcase className="w-4 h-4 text-blue-600" />
        <h3 className="font-semibold text-sm">Sager</h3>
        <span className="text-xs text-gray-400 ml-1">
          ({cases.length} total{cases.length !== 1 ? 't' : ''}, {openCount} åbne{openCount !== 1 ? '' : ''})
        </span>
      </div>

      <div className="divide-y">
        {cases.map((sag) => {
          const statusLabel = SERVICE_CASE_STATUS_LABELS[sag.status as ServiceCaseStatus] || sag.status
          const statusCls = SERVICE_CASE_STATUS_COLORS[sag.status as ServiceCaseStatus] || 'bg-gray-100 text-gray-700'
          const typeLabel = sag.type ? SERVICE_CASE_TYPE_LABELS[sag.type as ServiceCaseType] : null
          const priorityLabel = SERVICE_CASE_PRIORITY_LABELS[sag.priority as ServiceCasePriority] || null
          const priorityCls = SERVICE_CASE_PRIORITY_COLORS[sag.priority as ServiceCasePriority] || 'bg-gray-100 text-gray-700'
          const displayTitle = sag.project_name || sag.title

          return (
            <Link
              key={sag.id}
              href={`/dashboard/orders/${sag.id}`}
              className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors group"
            >
              <div className="w-10 h-10 shrink-0 rounded-lg bg-blue-50 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-blue-600" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-xs font-semibold text-gray-500">
                    {sag.case_number}
                  </span>
                  {typeLabel && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {typeLabel}
                    </span>
                  )}
                  {priorityLabel && sag.priority !== 'medium' && (
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${priorityCls}`}>
                      {priorityLabel}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900 truncate">{displayTitle}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-500">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${statusCls}`}>
                    {statusLabel}
                  </span>
                  {(sag.start_date || sag.end_date) && (
                    <span>
                      {fmtDate(sag.start_date) || '?'}
                      {sag.end_date && ` → ${fmtDate(sag.end_date)}`}
                    </span>
                  )}
                  {sag.contract_sum != null && (
                    <span className="font-medium text-gray-700">
                      {fmtAmount(sag.contract_sum)}
                    </span>
                  )}
                  <span className="text-gray-400">
                    Oprettet {fmtDate(sag.created_at)}
                  </span>
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 shrink-0" />
            </Link>
          )
        })}
      </div>

      {/* Hint om hvor sager oprettes — ingen knap i denne commit */}
      <div className="border-t p-3 text-center bg-gray-50">
        <p className="text-xs text-gray-500 inline-flex items-center gap-1">
          <Plus className="w-3 h-3" />
          Ny sag oprettes via mailmodulet (&quot;Opret sag fra mail&quot;) eller{' '}
          <Link href="/dashboard/orders" className="text-blue-600 hover:underline">/dashboard/orders</Link>
        </p>
      </div>
    </div>
  )
}
