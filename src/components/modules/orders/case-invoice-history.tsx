'use client'

/**
 * Sprint Ø3.3 — Cost-free fakturahistorik på sagen.
 *
 * Selvhentende tidslinje over alt der er sket med sagens fakturaer:
 * oprettet (alm./rate/slut), slettet (+ kilderækker låst op) og krediteret.
 * Kilden er persistente audit_logs via getCaseInvoiceHistoryAction —
 * gated på invoices.view.own_cases. Viser ALDRIG kost/margin/intern pris,
 * kun salgsbeløb inkl. moms.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  FilePlus2, Trash2, Undo2, History, Loader2, AlertCircle, RefreshCw,
  Send, BadgeCheck, Bell,
} from 'lucide-react'
import {
  getCaseInvoiceHistoryAction,
  type CaseInvoiceHistoryEntry,
} from '@/lib/actions/invoices'
import { formatCurrency } from '@/lib/utils/format'

function fmtDateTime(s: string): string {
  return new Intl.DateTimeFormat('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(s))
}

function actionVisual(e: CaseInvoiceHistoryEntry): {
  icon: React.ReactNode
  ring: string
  bg: string
  text: string
} {
  if (e.is_paid) {
    return {
      icon: <BadgeCheck className="w-4 h-4" />,
      ring: 'ring-emerald-200',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
    }
  }
  if (e.is_reminder) {
    return {
      icon: <Bell className="w-4 h-4" />,
      ring: 'ring-amber-200',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
    }
  }
  if (e.is_sent) {
    return {
      icon: <Send className="w-4 h-4" />,
      ring: 'ring-blue-200',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
    }
  }
  if (e.is_credit) {
    return {
      icon: <Undo2 className="w-4 h-4" />,
      ring: 'ring-purple-200',
      bg: 'bg-purple-50',
      text: 'text-purple-700',
    }
  }
  if (e.is_unlock || e.action.endsWith('_deleted')) {
    return {
      icon: <Trash2 className="w-4 h-4" />,
      ring: 'ring-rose-200',
      bg: 'bg-rose-50',
      text: 'text-rose-700',
    }
  }
  return {
    icon: <FilePlus2 className="w-4 h-4" />,
    ring: 'ring-emerald-200',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
  }
}

export function CaseInvoiceHistory({ caseId }: { caseId: string }) {
  const [entries, setEntries] = useState<CaseInvoiceHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getCaseInvoiceHistoryAction(caseId)
      if (!res.ok) {
        setError(res.message ?? 'Kunne ikke hente fakturahistorik')
        setEntries([])
      } else {
        setEntries(res.entries)
      }
    } catch {
      setError('Kunne ikke hente fakturahistorik')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <History className="w-4 h-4 text-gray-500" />
          Fakturahistorik
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Opdater
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-3 py-6 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Henter historik…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 px-3 py-6 text-sm text-rose-600">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="px-3 py-6 text-sm text-gray-500">
          Der er endnu ingen fakturahistorik på sagen.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map((e) => {
            const v = actionVisual(e)
            return (
              <li key={e.id} className="flex items-start gap-3 px-3 py-2.5">
                <span
                  className={`mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full ring-1 ${v.ring} ${v.bg} ${v.text} shrink-0`}
                >
                  {v.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-medium ${v.text}`}>
                      {e.action_label}
                      {e.invoice_number ? (
                        <span className="text-gray-700"> · {e.invoice_number}</span>
                      ) : null}
                    </span>
                    {e.amount_incl_vat != null && (
                      <span className="text-sm font-semibold text-gray-800 tabular-nums shrink-0">
                        {formatCurrency(e.amount_incl_vat, 'DKK', 2)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                    <span>{fmtDateTime(e.created_at)}</span>
                    <span className="text-gray-300">·</span>
                    <span>{e.user_name}</span>
                    {e.line_count != null && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span>
                          {e.line_count} linje{e.line_count === 1 ? '' : 'r'}
                          {e.is_unlock ? ' låst op' : ''}
                        </span>
                      </>
                    )}
                  </div>
                  {e.action_description && (
                    <p className="mt-0.5 text-xs text-gray-400 leading-snug">
                      {e.action_description}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100">
        Omkostningsfri visning — kun salgsbeløb inkl. moms. Ingen kost eller margin vises.
      </p>
    </div>
  )
}
