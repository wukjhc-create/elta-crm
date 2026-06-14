'use client'

/**
 * Sprint Ø4.3 — Cost-free kunde-fakturaoverblik på kundekortet.
 *
 * Kontor/salg kan straks se om kunden skylder penge: nøgletal, fakturaliste
 * med status/forfald, seneste betalingsstatus og deep-links til det samlede
 * fakturaoverblik (Ø4.1). Selvhentende via getCustomerInvoiceOverviewAction.
 *
 * KUN salgs/faktura-data — ingen kost/margin/DB. Handlinger (send/betal/
 * kreditér) bor på faktura-detalje; her linkes kun.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle, AlertTriangle, BadgeCheck, Ban, Bell, Eye, FileDown, FileText,
  Loader2, Lock, Receipt, Send, Undo2,
} from 'lucide-react'
import {
  getCustomerInvoiceOverviewAction,
  type CustomerInvoiceOverviewResult,
  type CustomerInvoiceRow,
  type DashboardInvoiceEvent,
} from '@/lib/actions/invoices'
import { formatCurrency } from '@/lib/utils/format'

function kr(n: number, ccy: string | null = 'DKK'): string {
  return formatCurrency(n, ccy || 'DKK', 2)
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Intl.DateTimeFormat('da-DK', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(s.length === 10 ? s + 'T12:00:00' : s)
  )
}

const TYPE_PILL: Record<string, { label: string; cls: string }> = {
  deposit: { label: 'Forskud', cls: 'bg-blue-100 text-blue-800' },
  progress: { label: 'A conto', cls: 'bg-purple-100 text-purple-800' },
  final: { label: 'Slutfaktura', cls: 'bg-orange-100 text-orange-800' },
  credit: { label: 'Kreditnota', cls: 'bg-red-100 text-red-800' },
}

function statusBadge(r: CustomerInvoiceRow): { label: string; cls: string } {
  if (r.voided_at) return { label: 'Annulleret', cls: 'bg-gray-200 text-gray-700' }
  if (r.is_credit_note) return { label: 'Kreditnota', cls: 'bg-red-100 text-red-800' }
  if (r.status === 'paid') return { label: 'Betalt', cls: 'bg-emerald-100 text-emerald-800' }
  if (r.is_overdue) return { label: 'Forfalden', cls: 'bg-rose-100 text-rose-800' }
  if (r.payment_status === 'partial') return { label: 'Delvist betalt', cls: 'bg-yellow-100 text-yellow-800' }
  if (r.status === 'sent') return { label: 'Sendt', cls: 'bg-blue-100 text-blue-800' }
  return { label: 'Kladde', cls: 'bg-gray-100 text-gray-700' }
}

function eventVisual(e: DashboardInvoiceEvent) {
  if (e.is_paid) return { icon: <BadgeCheck className="w-3.5 h-3.5" />, cls: 'text-emerald-600' }
  if (e.is_reminder) return { icon: <Bell className="w-3.5 h-3.5" />, cls: 'text-amber-600' }
  if (e.is_sent) return { icon: <Send className="w-3.5 h-3.5" />, cls: 'text-blue-600' }
  if (e.is_credit) return { icon: <Undo2 className="w-3.5 h-3.5" />, cls: 'text-purple-600' }
  return { icon: <FileText className="w-3.5 h-3.5" />, cls: 'text-gray-500' }
}

export function CustomerInvoiceOverview({
  customerId,
  customerName,
}: {
  customerId: string
  customerName?: string | null
}) {
  const [res, setRes] = useState<CustomerInvoiceOverviewResult | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRes(await getCustomerInvoiceOverviewAction(customerId))
    } catch {
      setRes({ ok: false, permitted: true, message: 'Kunne ikke hente kundens fakturaer' })
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  const q = customerName ? `&q=${encodeURIComponent(customerName)}` : ''
  const qOnly = customerName ? `?q=${encodeURIComponent(customerName)}` : ''

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Henter kundens fakturaer…
      </div>
    )
  }
  if (!res) return null
  if (!res.permitted) {
    return (
      <div className="bg-white rounded-lg border p-6 flex items-center gap-2 text-sm text-gray-600">
        <Lock className="w-4 h-4 text-gray-400" />
        {res.message ?? 'Du har ikke adgang til fakturaoplysninger på kunden.'}
      </div>
    )
  }
  if (!res.ok || !res.summary) {
    return (
      <div className="bg-white rounded-lg border p-6 flex items-center gap-2 text-sm text-rose-600">
        <AlertCircle className="w-4 h-4" /> {res.message ?? 'Kunne ikke hente kundens fakturaer'}
      </div>
    )
  }

  const s = res.summary
  const invoices = res.invoices ?? []
  const events = res.recent_events ?? []

  return (
    <div className="space-y-4">
      {/* Nøgletal */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Udestående i alt" value={kr(s.outstanding_total)} tone="amber" icon={<Receipt className="w-4 h-4" />} />
        <SummaryCard
          label="Forfaldne"
          value={`${s.overdue_count} · ${kr(s.overdue_total)}`}
          tone="rose"
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <SummaryCard label="Kladder" value={String(s.draft_count)} tone="gray" icon={<FileText className="w-4 h-4" />} />
        <SummaryCard label="Betalt i alt" value={kr(s.paid_total)} tone="emerald" icon={<BadgeCheck className="w-4 h-4" />} />
      </div>

      {/* Seneste status + forfald-note */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        <span>Seneste faktura: <strong className="text-gray-800">{fmtDate(s.latest_invoice_at)}</strong></span>
        <span>Seneste betaling: <strong className="text-gray-800">{fmtDate(s.latest_payment_at)}</strong></span>
        {s.last_reminder_at && (
          <span className="text-amber-700">Seneste påmindelse: {fmtDate(s.last_reminder_at)}</span>
        )}
      </div>
      <div
        className={`rounded-lg ring-1 px-3 py-2 text-sm ${
          s.overdue_count > 0 ? 'ring-rose-200 bg-rose-50 text-rose-900' : 'ring-emerald-200 bg-emerald-50 text-emerald-900'
        }`}
      >
        {s.overdue_count > 0
          ? `Kunden har ${s.overdue_count} forfalden${s.overdue_count === 1 ? '' : 'e'} faktura${
              s.overdue_count === 1 ? '' : 'er'
            } — ${kr(s.overdue_total)} mangler opfølgning.`
          : 'Ingen forfaldne fakturaer på kunden.'}
      </div>

      {/* Deep-links til samlet fakturaoverblik */}
      <div className="flex flex-wrap gap-3 text-xs">
        <Link href={`/dashboard/invoices${qOnly}`} className="text-emerald-700 hover:underline">
          Se alle kundens fakturaer →
        </Link>
        <Link href={`/dashboard/invoices?filter=overdue${q}`} className="text-rose-700 hover:underline">
          Se forfaldne →
        </Link>
        <Link href={`/dashboard/invoices?filter=sent&outstanding=1${q}`} className="text-amber-700 hover:underline">
          Se udestående →
        </Link>
      </div>

      {/* Fakturaliste */}
      <div className="rounded-lg border overflow-hidden bg-white">
        <div className="px-3 py-2 bg-gray-50 border-b">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-gray-500" /> Kundens fakturaer
            {invoices.length > 0 && (
              <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{invoices.length}</span>
            )}
          </h3>
        </div>
        {invoices.length === 0 ? (
          <p className="px-3 py-6 text-sm text-gray-500">Kunden har endnu ingen fakturaer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-2 py-1.5">Faktura</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Sag</th>
                  <th className="px-2 py-1.5">Datoer</th>
                  <th className="px-2 py-1.5 text-right">Beløb inkl. moms</th>
                  <th className="px-2 py-1.5 text-right">Handlinger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((r) => {
                  const sb = statusBadge(r)
                  const pill = r.invoice_type ? TYPE_PILL[r.invoice_type] : undefined
                  return (
                    <tr key={r.id} className={`align-top ${r.is_overdue ? 'bg-rose-50/40' : ''}`}>
                      <td className="px-2 py-2">
                        <Link href={`/dashboard/invoices/${r.id}`} className="font-mono text-emerald-700 hover:underline">
                          {r.invoice_number ?? '—'}
                        </Link>
                        {pill && (
                          <span className={`block mt-0.5 w-fit px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${pill.cls}`}>
                            {pill.label}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${sb.cls}`}>
                          {r.voided_at && <Ban className="w-3 h-3" />}
                          {sb.label}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {r.case_number ? (
                          <Link href={`/dashboard/orders/${r.case_number}`} className="font-mono text-emerald-700 hover:underline">
                            {r.case_number}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-500 whitespace-nowrap">
                        <div>Oprettet {fmtDate(r.created_at)}</div>
                        {r.sent_at && <div>Sendt {fmtDate(r.sent_at)}</div>}
                        {r.paid_at && <div className="text-emerald-700">Betalt {fmtDate(r.paid_at)}</div>}
                        {!r.paid_at && r.due_date && (
                          <div className={r.is_overdue ? 'text-rose-700 font-medium' : ''}>
                            Forfald {fmtDate(r.due_date)}
                            {r.is_overdue && r.days_overdue != null ? ` (${r.days_overdue} dage over)` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">{kr(r.final_amount, r.currency)}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/dashboard/invoices/${r.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded ring-1 ring-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            title="Åbn faktura"
                          >
                            <FileText className="w-3.5 h-3.5" /> Åbn
                          </Link>
                          <a
                            href={`/api/invoices/${r.id}/pdf?view=1`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded ring-1 ring-gray-300 text-gray-700 hover:bg-gray-50"
                            title="Vis PDF"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                          <a
                            href={`/api/invoices/${r.id}/pdf`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded ring-1 ring-gray-300 text-gray-700 hover:bg-gray-50"
                            title="Download PDF"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Seneste events */}
      {events.length > 0 && (
        <div className="rounded-lg border overflow-hidden bg-white">
          <div className="px-3 py-2 bg-gray-50 border-b">
            <h3 className="text-sm font-semibold text-gray-800">Seneste faktura-hændelser</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {events.map((e) => {
              const v = eventVisual(e)
              return (
                <li key={e.id} className="px-3 py-2 flex items-center gap-2.5">
                  <span className={`shrink-0 ${v.cls}`}>{v.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-800 truncate">
                      {e.action_label}
                      {e.invoice_number ? <span className="text-gray-500"> · {e.invoice_number}</span> : null}
                    </div>
                    <div className="text-[11px] text-gray-400">{fmtDate(e.created_at)}</div>
                  </div>
                  {e.amount_incl_vat != null && (
                    <span className="text-xs font-medium tabular-nums text-gray-700 shrink-0">{kr(e.amount_incl_vat)}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Omkostningsfrit overblik — kun fakturabeløb inkl. moms. Send, markér betalt og kreditér
        sker på den enkelte fakturas side via "Åbn". Ingen kost, margin eller dækningsbidrag.
      </p>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string
  tone: 'gray' | 'rose' | 'emerald' | 'amber'
  icon: React.ReactNode
}) {
  const toneCls = {
    gray: 'ring-gray-200 text-gray-700',
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
