'use client'

/**
 * Sprint Ø4.0 — Cost-free fakturaøkonomi på driftsdashboardet.
 *
 * Giver kontoret ét dagligt overblik over "få pengene hjem": udestående,
 * forfaldne, kladder, betalt denne måned + seneste faktura-events.
 * Selvhentende via getInvoiceDashboardAction. Bygger ikke dobbelt
 * handlings-UI — linker til fakturaoverblik/faktura/sag.
 *
 * KUN salgs/faktura-data — ingen kost/margin/DB.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle, AlertTriangle, BadgeCheck, Bell, FileText, Loader2, Receipt,
  Send, Undo2, Wallet, ArrowRight, RefreshCw,
} from 'lucide-react'
import {
  getInvoiceDashboardAction,
  type InvoiceDashboard,
  type DashboardInvoiceEvent,
} from '@/lib/actions/invoices'
import { formatCurrency } from '@/lib/utils/format'

function kr(n: number, ccy: string | null = 'DKK'): string {
  return formatCurrency(n, ccy || 'DKK', 0)
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Intl.DateTimeFormat('da-DK', { day: '2-digit', month: 'short' }).format(
    new Date(s.length === 10 ? s + 'T12:00:00' : s)
  )
}
function fmtDateTime(s: string): string {
  return new Intl.DateTimeFormat('da-DK', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(s))
}

function eventVisual(e: DashboardInvoiceEvent) {
  if (e.is_paid) return { icon: <BadgeCheck className="w-3.5 h-3.5" />, cls: 'text-emerald-600' }
  if (e.is_reminder) return { icon: <Bell className="w-3.5 h-3.5" />, cls: 'text-amber-600' }
  if (e.is_sent) return { icon: <Send className="w-3.5 h-3.5" />, cls: 'text-blue-600' }
  if (e.is_credit) return { icon: <Undo2 className="w-3.5 h-3.5" />, cls: 'text-purple-600' }
  return { icon: <FileText className="w-3.5 h-3.5" />, cls: 'text-gray-500' }
}

/** Prioriteret "Dagens fokus"-sætning. */
function focusText(d: InvoiceDashboard): string {
  const parts: string[] = []
  if (d.overdue_count > 0) {
    parts.push(
      `Start med ${d.overdue_count} forfalden${d.overdue_count === 1 ? '' : 'e'} faktura${
        d.overdue_count === 1 ? '' : 'er'
      } (${kr(d.overdue_total)} mangler opfølgning)`
    )
  }
  if (d.draft_count > 0) {
    parts.push(
      `${d.draft_count} kladde${d.draft_count === 1 ? '' : 'r'} klar til gennemgang`
    )
  }
  if (parts.length === 0 && d.sent_unpaid_total > 0) {
    parts.push(`${kr(d.sent_unpaid_total)} er sendt og afventer betaling`)
  }
  if (parts.length === 0) return 'Ingenting kræver opfølgning lige nu — alt er enten betalt eller endnu ikke sendt.'
  return parts.join('. ') + '.'
}

export function InvoiceEconomySection() {
  const [data, setData] = useState<InvoiceDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getInvoiceDashboardAction()
      if (!res.ok || !res.data) {
        setError(res.message ?? 'Kunne ikke hente fakturaøkonomi')
        setData(null)
      } else {
        setData(res.data)
      }
    } catch {
      setError('Kunne ikke hente fakturaøkonomi')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="bg-white p-6 rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Wallet className="w-5 h-5 text-emerald-600" />
          Fakturaøkonomi
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Opdater
          </button>
          <Link href="/dashboard/invoices" className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
            Åbn fakturaoverblik <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Henter fakturaøkonomi…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 py-8 text-sm text-rose-600">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      ) : !data ? null : (
        <div className="space-y-4">
          {/* Dagens fokus */}
          <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
            <span><strong>Dagens fokus:</strong> {focusText(data)}</span>
          </div>

          {/* Nøgletal */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <EconCard label="Udestående i alt" value={kr(data.outstanding_total)} tone="amber" icon={<Receipt className="w-4 h-4" />} />
            <EconCard
              label="Forfaldne"
              value={`${data.overdue_count} · ${kr(data.overdue_total)}`}
              tone="rose"
              icon={<AlertTriangle className="w-4 h-4" />}
            />
            <EconCard label="Fakturakladder" value={String(data.draft_count)} tone="gray" icon={<FileText className="w-4 h-4" />} />
            <EconCard label="Betalt denne måned" value={kr(data.paid_this_month)} tone="emerald" icon={<BadgeCheck className="w-4 h-4" />} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 -mt-1">
            <EconCard label="Sendt — ikke betalt" value={kr(data.sent_unpaid_total)} tone="blue" icon={<Send className="w-4 h-4" />} />
            <EconCard label="Påmindelser (30 dage)" value={String(data.reminders_30d)} tone="amber" icon={<Bell className="w-4 h-4" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Forfaldne */}
            <div className="rounded-lg ring-1 ring-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-500" /> Forfaldne fakturaer
                </h3>
                {data.overdue_count > 0 && (
                  <Link href="/dashboard/invoices" className="text-[11px] text-gray-500 hover:text-gray-700">
                    Se alle →
                  </Link>
                )}
              </div>
              {data.overdue_top.length === 0 ? (
                <p className="px-3 py-5 text-sm text-gray-500">Der er ingen forfaldne fakturaer lige nu.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.overdue_top.map((r) => (
                    <li key={r.id} className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-gray-50">
                      <div className="min-w-0">
                        <Link href={`/dashboard/invoices/${r.id}`} className="font-mono text-sm text-emerald-700 hover:underline">
                          {r.invoice_number ?? '—'}
                        </Link>
                        <div className="text-[11px] text-gray-500 truncate">
                          {r.customer_name ?? '—'}
                          {r.case_number && (
                            <>
                              {' · '}
                              <Link href={`/dashboard/orders/${r.case_number}`} className="hover:underline">
                                {r.case_number}
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium tabular-nums">{kr(r.final_amount, r.currency)}</div>
                        <div className="text-[11px] text-rose-700">
                          {r.days_overdue} dage over · forfald {fmtDate(r.due_date)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Seneste events */}
            <div className="rounded-lg ring-1 ring-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-gray-500" /> Seneste faktura-hændelser
                </h3>
              </div>
              {data.recent_events.length === 0 ? (
                <p className="px-3 py-5 text-sm text-gray-500">Ingen faktura-hændelser endnu.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.recent_events.map((e) => {
                    const v = eventVisual(e)
                    return (
                      <li key={e.id} className="px-3 py-2 flex items-center gap-2.5">
                        <span className={`shrink-0 ${v.cls}`}>{v.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-gray-800 truncate">
                            {e.action_label}
                            {e.invoice_number ? <span className="text-gray-500"> · {e.invoice_number}</span> : null}
                          </div>
                          <div className="text-[11px] text-gray-400">{fmtDateTime(e.created_at)}</div>
                        </div>
                        {e.amount_incl_vat != null && (
                          <span className="text-xs font-medium tabular-nums text-gray-700 shrink-0">
                            {kr(e.amount_incl_vat)}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          <p className="text-[11px] text-gray-400">
            Omkostningsfrit overblik — kun fakturabeløb inkl. moms. Ingen kost, margin eller dækningsbidrag.
            Handlinger (send, markér betalt, kreditér, påmind) sker på fakturaoverblik eller den enkelte faktura.
          </p>
        </div>
      )}
    </div>
  )
}

function EconCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string
  tone: 'gray' | 'blue' | 'rose' | 'emerald' | 'amber'
  icon: React.ReactNode
}) {
  const toneCls = {
    gray: 'ring-gray-200 text-gray-700',
    blue: 'ring-blue-200 text-blue-700',
    rose: 'ring-rose-200 text-rose-700',
    emerald: 'ring-emerald-200 text-emerald-700',
    amber: 'ring-amber-200 text-amber-700',
  }[tone]
  return (
    <div className={`rounded-lg ring-1 bg-white px-3 py-2.5 ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums text-gray-900">{value}</div>
    </div>
  )
}
