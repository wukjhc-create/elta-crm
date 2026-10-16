'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FloatingMenu } from '@/components/shared/floating-menu'
import { setServiceCaseStatus } from '@/lib/actions/service-cases'
import {
  SERVICE_CASE_STATUSES,
  SERVICE_CASE_STATUS_LABELS,
  SERVICE_CASE_STATUS_COLORS,
  type ServiceCaseStatus,
} from '@/types/service-cases.types'
import { isUnbilledCloseError, confirmCloseDespiteUnbilled } from '@/lib/cases/close-guard'
import { humanizeErrorText } from '@/lib/auth/permission-text'

export function InlineStatusChanger({
  caseId,
  current,
}: {
  caseId: string
  current: ServiceCaseStatus
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const change = async (next: ServiceCaseStatus) => {
    setOpen(false)
    if (next === current) return
    setError(null)
    setIsWorking(true)
    let res = await setServiceCaseStatus(caseId, next, null)
    if (!res.success && isUnbilledCloseError(res.error)) {
      if (!confirmCloseDespiteUnbilled(res.error)) { setIsWorking(false); return }
      res = await setServiceCaseStatus(caseId, next, null, { acknowledgeUnbilled: true })
    }
    setIsWorking(false)
    if (!res.success) {
      setError(humanizeErrorText(res.error) || 'Kunne ikke ændre status')
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={(e) => { setAnchor(e.currentTarget); setOpen((v) => !v) }}
        disabled={isWorking}
        title="Skift status"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition disabled:opacity-50 ${SERVICE_CASE_STATUS_COLORS[current]}`}
      >
        {isWorking ? 'Gemmer…' : SERVICE_CASE_STATUS_LABELS[current]}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        // M-8: portal + fixed position (klippes ikke af sagslistens overflow / skærmkanten)
        <FloatingMenu anchor={anchor} onClose={() => setOpen(false)} align="left" className="min-w-[12rem]" testId="case-status-menu">
          <ul role="listbox" className="py-1">
            {SERVICE_CASE_STATUSES.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => change(s)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${
                    s === current ? 'font-semibold' : ''
                  }`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full ${dotColor(s)}`} />
                  {SERVICE_CASE_STATUS_LABELS[s]}
                  {s === current && (
                    <span className="ml-auto text-[10px] text-gray-400 uppercase">nuværende</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </FloatingMenu>
      )}

      {error && (
        <span className="text-xs text-red-700 ml-2" title={error}>
          ⚠ {error}
        </span>
      )}
    </div>
  )
}

function dotColor(s: ServiceCaseStatus): string {
  switch (s) {
    case 'new': return 'bg-blue-500'
    case 'in_progress': return 'bg-yellow-500'
    case 'pending': return 'bg-orange-500'
    case 'closed': return 'bg-green-500'
    case 'converted': return 'bg-purple-500'
  }
}
