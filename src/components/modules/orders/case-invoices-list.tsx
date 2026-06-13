'use client'

/**
 * Sprint Ø3.5 — Cost-free liste over ALLE fakturaer på sagen.
 *
 * Viser kladder, sendte, betalte og kreditnotaer med status, beløb, dato
 * og modtager. KUN salgs/faktura-data — ingen kost/margin/DB.
 * Selvhentende via listCaseInvoicesAction (gated invoices.view.own_cases).
 *
 * Handlinger (send / markér betalt / kreditér / slet) bor på
 * faktura-detaljesiden — derfor linker "Åbn" dertil i stedet for at
 * duplikere et handlings-UI her. PDF åbnes direkte via API-ruten.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle, Ban, Eye, FileDown, FileText, Loader2, RefreshCw, Receipt,
} from 'lucide-react'
import {
  listCaseInvoicesAction,
  type CaseInvoiceListItem,
} from '@/lib/actions/invoices'
import { formatCurrency } from '@/lib/utils/format'

function kr(n: number, currency: string | null): string {
  return formatCurrency(n, currency || 'DKK', 2)
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Intl.DateTimeFormat('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(s.length === 10 ? s + 'T12:00:00' : s))
}

const TYPE_PILL: Record<string, { label: string; cls: string }> = {
  deposit: { label: 'Forskud', cls: 'bg-blue-100 text-blue-800' },
  progress: { label: 'A conto', cls: 'bg-purple-100 text-purple-800' },
  final: { label: 'Slutfaktura', cls: 'bg-orange-100 text-orange-800' },
  credit: { label: 'Kreditnota', cls: 'bg-red-100 text-red-800' },
}

/** Menneskelig status — kombinerer livscyklus + annulleret + betaling. */
function statusBadge(it: CaseInvoiceListItem): { label: string; cls: string } {
  if (it.voided_at) return { label: 'Annulleret', cls: 'bg-gray-200 text-gray-700' }
  if (it.status === 'paid') return { label: 'Betalt', cls: 'bg-emerald-100 text-emerald-800' }
  if (it.payment_status === 'partial')
    return { label: 'Delvist betalt', cls: 'bg-yellow-100 text-yellow-800' }
  if (it.status === 'sent') return { label: 'Sendt', cls: 'bg-blue-100 text-blue-800' }
  return { label: 'Kladde', cls: 'bg-gray-100 text-gray-700' }
}

export function CaseInvoicesList({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<CaseInvoiceListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listCaseInvoicesAction(caseId)
      if (!res.ok) {
        setError(res.message ?? 'Kunne ikke hente fakturaer')
        setItems([])
      } else {
        setItems(res.items)
      }
    } catch {
      setError('Kunne ikke hente fakturaer')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-gray-500" />
          Fakturaer på sagen
          {items.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
              {items.length}
            </span>
          )}
        </h3>
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
          Henter fakturaer…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 px-3 py-6 text-sm text-rose-600">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="px-3 py-6 text-sm text-gray-500">
          Der er endnu ingen fakturaer på sagen. Opret en faktura via fanerne ovenfor.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-2 py-1.5">Faktura</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Modtager</th>
                <th className="px-2 py-1.5">Datoer</th>
                <th className="px-2 py-1.5 text-right">Beløb inkl. moms</th>
                <th className="px-2 py-1.5 text-right">Handlinger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it) => {
                const sb = statusBadge(it)
                const pill = it.invoice_type ? TYPE_PILL[it.invoice_type] : undefined
                return (
                  <tr key={it.id} className="align-top">
                    <td className="px-2 py-2">
                      <div className="font-mono text-gray-900">{it.invoice_number ?? '—'}</div>
                      {pill && (
                        <span
                          className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${pill.cls}`}
                        >
                          {pill.label}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${sb.cls}`}
                      >
                        {it.voided_at && <Ban className="w-3 h-3" />}
                        {sb.label}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-gray-700">{it.customer_name ?? '—'}</td>
                    <td className="px-2 py-2 text-gray-500 whitespace-nowrap">
                      <div>Oprettet {fmtDate(it.created_at)}</div>
                      {it.sent_at && <div>Sendt {fmtDate(it.sent_at)}</div>}
                      {it.paid_at && <div className="text-emerald-700">Betalt {fmtDate(it.paid_at)}</div>}
                      {!it.paid_at && it.due_date && <div>Forfald {fmtDate(it.due_date)}</div>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium text-gray-900">
                      {kr(it.final_amount, it.currency)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/dashboard/invoices/${it.id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded ring-1 ring-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          title="Åbn faktura (send, markér betalt, kreditér, slet)"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Åbn
                        </Link>
                        <a
                          href={`/api/invoices/${it.id}/pdf?view=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded ring-1 ring-gray-300 text-gray-700 hover:bg-gray-50"
                          title="Åbn PDF i ny fane"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          PDF
                        </a>
                        <a
                          href={`/api/invoices/${it.id}/pdf`}
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

      <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100">
        Omkostningsfri visning — kun fakturabeløb inkl. moms. Send, markér betalt,
        kreditér og slet sker på den enkelte fakturas side via "Åbn".
      </p>
    </div>
  )
}
