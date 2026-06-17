'use client'

/**
 * Sprint Ø9.2 — Read-only konverterings-preview på leverandørfaktura-detaljen.
 *
 * Viser HVAD der vil blive oprettet på sagen ved godkendelse-med-konvertering
 * (intern indkøbsøkonomi), uden at ændre noget. Server-valideret via
 * getIncomingInvoiceConversionPreviewAction (gated incoming_invoices.view).
 * Håndterer "ingen linjer", "kun totalbeløb", "kræver sag-match". Ingen
 * AI/parsing, ingen e-conomic-push, ingen kundevendt visning.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, PackagePlus, AlertTriangle, Info } from 'lucide-react'
import { getIncomingInvoiceConversionPreviewAction, type ConversionPreview } from '@/lib/actions/incoming-invoices'

const DISP_LABEL = { material: 'Materiale', other_cost: 'Udlæg' } as const

export function ConversionPreviewPanel({ invoiceId }: { invoiceId: string }) {
  const [data, setData] = useState<ConversionPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getIncomingInvoiceConversionPreviewAction(invoiceId)
      .then((r) => { if (!alive) return; if (r.ok) setData(r); else setError(r.message || 'Kunne ikke hente preview') })
      .catch(() => { if (alive) setError('Kunne ikke hente preview') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [invoiceId])

  const kr = (n: number | null) =>
    n == null ? '—' : new Intl.NumberFormat('da-DK', { style: 'currency', currency: data?.currency || 'DKK', maximumFractionDigits: 2 }).format(n)

  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-800 mb-2">
        <PackagePlus className="w-4 h-4 text-blue-600" /> Konverterings-preview
        <span className="text-[10px] font-medium rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-1.5 py-0.5">Intern indkøb</span>
      </h3>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Henter…</div>
      ) : error || !data ? (
        <p className="text-sm text-gray-400 py-2">{error || 'Ingen data'}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div><span className="text-gray-500">Leverandør:</span> {data.supplier_name ?? '—'}</div>
            <div><span className="text-gray-500">Faktura:</span> {data.invoice_number ?? '—'}</div>
            <div><span className="text-gray-500">Sag:</span>{' '}
              {data.case ? (
                <Link href={`/dashboard/orders/${data.case.case_number}`} className="text-emerald-700 hover:underline font-mono">{data.case.case_number}</Link>
              ) : <span className="text-amber-700">ikke matchet</span>}
            </div>
            <div><span className="text-gray-500">Beløb (inkl. moms):</span> {kr(data.amount_incl_vat)}</div>
          </div>

          {data.requires_case_match && (
            <div className="rounded-md ring-1 ring-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Match fakturaen til en sag før godkendelse/konvertering.
            </div>
          )}

          {!data.has_lines ? (
            <div className="rounded-md ring-1 ring-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
              {data.total_only
                ? 'Ingen fakturalinjer — kun et totalbeløb. Der oprettes ikke automatisk en materialepost; opret den manuelt på sagen, hvis ønsket.'
                : 'Ingen linjer at konvertere.'}
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500">
                {data.convertible_count} linje(r) klar · {data.already_converted_count} allerede konverteret
              </div>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-2 py-1">Beskrivelse</th>
                      <th className="px-2 py-1 text-right">Antal</th>
                      <th className="px-2 py-1 text-right">Kostpris</th>
                      <th className="px-2 py-1">Opretter som</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr key={l.line_id} className={`border-t ${l.already_converted ? 'opacity-50' : ''}`}>
                        <td className="px-2 py-1 max-w-[260px] truncate" title={l.description}>{l.description}</td>
                        <td className="px-2 py-1 text-right">{l.quantity} {l.unit}</td>
                        <td className="px-2 py-1 text-right">{kr(l.unit_cost)}</td>
                        <td className="px-2 py-1">
                          {l.already_converted
                            ? <span className="text-gray-400">allerede konverteret</span>
                            : <span className="text-gray-700">{DISP_LABEL[l.suggested]}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-400">
                Forslag — den endelige fordeling (materiale/udlæg/spring over) vælges i godkend-dialogen. Kun kostpris fra leverandør; salgspris sættes på sagen.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
