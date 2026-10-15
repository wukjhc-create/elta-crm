'use client'

import { useEffect, useState } from 'react'
import {
  getServiceCaseActivity,
  type ServiceCaseActivityEntry,
} from '@/lib/actions/service-cases'
import { copenhagenDateTimeLabel } from '@/lib/utils/copenhagen-time'

const fmtDateTime = (s: string) => {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return copenhagenDateTimeLabel(s)
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Oprettet',
  update: 'Opdateret',
  delete: 'Slettet',
  status_change: 'Status ændret',
  view: 'Vist',
}

export function OrderActivityTab({ caseId }: { caseId: string }) {
  const [entries, setEntries] = useState<ServiceCaseActivityEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(null)
    async function load() {
      try {
        const res = await getServiceCaseActivity(caseId)
        if (cancelled) return
        if (!res.success) {
          setError(res.error || 'Kunne ikke hente aktivitet')
          setEntries([])
          return
        }
        setEntries(res.data ?? [])
      } catch {
        if (cancelled) return
        setError('Kunne ikke hente aktivitet')
        setEntries([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [caseId, reloadKey])

  if (entries === null) {
    return (
      <div className="text-sm text-gray-500 py-6 text-center">Henter aktivitet…</div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-6">
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          {error}. Det tælles ikke som ingen aktivitet.
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="mt-3 min-h-[44px] px-4 py-2 text-sm font-medium border rounded-lg hover:bg-gray-50"
        >
          Prøv igen
        </button>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <h3 className="text-base font-medium text-gray-700">Ingen aktivitet endnu</h3>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
          Når sagen ændrer status, opdateres eller får andre handlinger, dukker
          de op her.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <div
          key={e.id}
          className="bg-gray-50 rounded ring-1 ring-gray-200 p-3 flex flex-wrap items-start gap-x-3 gap-y-1"
        >
          <div className="text-xs text-gray-500 font-mono shrink-0">
            {fmtDateTime(e.created_at)}
          </div>
          <div className="flex-1 min-w-[12rem]">
            <div className="text-sm font-medium text-gray-900 break-words">
              {ACTION_LABELS[e.action] ?? e.action}
              {e.user_name && (
                <span className="text-gray-500 font-normal"> · {e.user_name}</span>
              )}
            </div>
            {e.action_description && (
              <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-words">
                {e.action_description}
              </div>
            )}
            {e.changes && Object.keys(e.changes).length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                  Vis ændringer
                </summary>
                <pre className="mt-1 text-[11px] bg-white border rounded p-2 overflow-x-auto">
                  {JSON.stringify(e.changes, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
