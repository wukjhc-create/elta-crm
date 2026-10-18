'use client'

/**
 * Fakturakontrol: faktureret enhedspris mod forventet kostpris i leverandørkataloget pr. linje.
 * Kun information — ingen handling (godkendelse/afvisning sker som hidtil).
 */
import { useEffect, useState } from 'react'
import { getInvoiceControl } from '@/lib/actions/invoice-control'
import { chargeLabel, chargeLabelText } from '@/lib/invoice-control/charge-label'
import { headerLineSummary } from '@/lib/invoice-control/header-totals'
import { countInvoiceReviewLines } from '@/lib/invoice-control/review-counts'
import type { InvoiceControlResult } from '@/lib/invoice-control/invoice-control-loader'

const kr = (n: number) => `${n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`

const VERDICT: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Priser stemmer', cls: 'bg-green-50 text-green-800 border-green-200' },
  deviation: { label: 'Prisafvigelse', cls: 'bg-red-50 text-red-800 border-red-200' },
  partially_controlled: { label: 'Delvist kontrolleret', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  not_controllable: { label: 'Kan ikke kontrolleres', cls: 'bg-gray-50 text-gray-700 border-gray-200' },
}
const LINE: Record<string, string> = { ok: 'OK', overcharge: 'Overpris', undercharge: 'Underpris', not_controllable: '—' }
const METHOD: Record<string, string> = { stored: 'linket vare', sku: 'varenr.', ean: 'EAN', description_sku: 'varenr. i tekst' }

function ChargeMark({ description }: { description: string }) {
  const text = chargeLabelText(chargeLabel(description))
  if (!text) return null
  return <span className="ml-1 inline-block text-[10px] uppercase tracking-wide bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{text}</span>
}

export function InvoiceControlPanel({ invoiceId, lineCount }: { invoiceId: string; lineCount: number }) {
  const [res, setRes] = useState<InvoiceControlResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tryKey, setTryKey] = useState(0)

  useEffect(() => {
    setRes(null)
    setError(null)
  }, [invoiceId])

  useEffect(() => {
    let alive = true
    setError(null)
    getInvoiceControl(invoiceId).then((r) => {
      if (!alive) return
      if (r.success && r.data) setRes(r.data)
      else setError(r.error ?? 'Ukendt fejl')
    }).catch(() => {
      if (alive) setError('Kunne ikke kontrollere priser')
    })
    return () => { alive = false }
  }, [invoiceId, lineCount, tryKey])

  if (lineCount === 0) return null
  const v = res ? VERDICT[res.control.verdict] : null
  const header = res ? headerLineSummary(res.header) : null
  const review = res ? countInvoiceReviewLines(res.control.lines) : null
  const headerCls = header?.tone === 'bad' ? 'text-red-700' : header?.tone === 'warn' ? 'text-amber-800' : 'text-gray-600'

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4" data-testid="invoice-control-panel">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold break-words min-w-0">Fakturakontrol</h3>
        {v && <span className={`text-xs px-2 py-1 rounded border break-words min-w-0 ${v.cls}`} data-testid="invoice-control-verdict">{v.label}</span>}
      </div>
      {error && (
        <div className="text-xs text-red-600">
          <p className="break-words min-w-0" data-testid="invoice-control-load-error">{error}. Det tælles ikke som at priserne stemmer.</p>
          <button type="button" onClick={() => setTryKey((n) => n + 1)} className="mt-2 min-h-[44px] px-3 text-sm font-medium border rounded-lg text-gray-800">
            Prøv igen
          </button>
        </div>
      )}
      {!res && !error && <p className="text-xs text-gray-400 break-words min-w-0" data-testid="invoice-control-loading">Kontrollerer priser…</p>}
      {res && (
        <>
          {header && <p className={`text-xs mb-3 break-words min-w-0 ${headerCls}`} data-testid="invoice-control-header">{header.text}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-3 min-w-0">
            <div className="min-w-0">
              <div className="text-gray-500">Kontrollerede linjer</div>
              <div className="font-medium break-words">{res.control.controlledLines} / {res.control.totalLines} ({res.control.coveragePct} %)</div>
            </div>
            <div className="min-w-0">
              <div className="text-gray-500">Overpris i alt</div>
              <div className={`font-medium break-words ${res.control.controlledLines > 0 && res.control.overchargeAmount > 0 ? 'text-red-700' : ''}`} data-testid="invoice-control-overcharge">
                {res.control.controlledLines > 0 ? kr(res.control.overchargeAmount) : '—'}
              </div>
              {res.control.controlledLines === 0 && (
                <p className="text-[10px] text-gray-500 break-words">Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.</p>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-gray-500">Leverandør</div>
              <div className="font-medium break-words">{res.hasSupplier ? 'Kendt' : 'Ukendt — kan ikke matche katalog'}</div>
            </div>
          </div>
          {review && (
            <p className="text-xs break-words min-w-0 mb-3" data-testid="invoice-control-review-counts">
              <span className={review.overcharge > 0 ? 'text-red-700 font-medium' : ''}>{review.overcharge} overpris</span>
              {', '}
              <span className={review.undercharge > 0 ? 'text-amber-800 font-medium' : ''}>{review.undercharge} underpris</span>
              {', '}
              <span>{review.freight} fragt, {review.fee} gebyr.</span>
            </p>
          )}
          <div className="md:hidden divide-y rounded ring-1 ring-gray-200" data-testid="invoice-control-lines-mobile">
            {res.control.lines.map((l) => {
              const m = res.matches.find((x) => x.lineNumber === l.lineNumber)
              const bad = l.verdict === 'overcharge'
              return (
                <div key={l.lineNumber} className={`p-3 ${bad ? 'bg-red-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-gray-900 break-words min-w-0"><span className="text-gray-400">{l.lineNumber}.</span> {l.description}<ChargeMark description={l.description} /></p>
                    <span className={`shrink-0 max-w-[45%] break-words min-w-0 ${bad ? 'text-red-700 font-medium' : l.verdict === 'ok' ? 'text-green-700' : 'text-gray-600'}`} data-testid="invoice-control-mobile-verdict">{LINE[l.verdict] ?? l.verdict}</span>
                  </div>
                  <p className="mt-1 text-gray-600 break-all">{m?.method ? `${METHOD[m.method] ?? m.method}${m.productSku ? ` · ${m.productSku}` : ''}` : (l.reason ?? 'ingen')}</p>
                  <p className="break-words min-w-0" data-testid="invoice-control-mobile-expected">Forventet {m?.expectedUnitPrice != null ? kr(m.expectedUnitPrice) : '—'}</p>
                  <p className="break-words min-w-0" data-testid="invoice-control-mobile-deviation">Afvigelse {l.varianceAmount != null && l.verdict !== 'not_controllable' ? `${kr(l.varianceAmount)}${l.variancePct != null ? ` (${l.variancePct} %)` : ''}` : '—'}</p>
                </div>
              )
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-gray-500"><th className="py-1">#</th><th>Beskrivelse</th><th className="break-words min-w-0" data-testid="invoice-control-col-match">Match</th><th className="text-right break-words min-w-0" data-testid="invoice-control-col-expected">Forventet</th><th className="text-right break-words min-w-0" data-testid="invoice-control-col-deviation">Afvigelse</th><th className="pl-4">Status</th></tr></thead>
              <tbody>
                {res.control.lines.map((l) => {
                  const m = res.matches.find((x) => x.lineNumber === l.lineNumber)
                  const bad = l.verdict === 'overcharge'
                  return (
                    <tr key={l.lineNumber} className={`border-t ${bad ? 'bg-red-50' : ''}`}>
                      <td className="py-1 break-words min-w-0" data-testid="invoice-control-desktop-line-number">{l.lineNumber}</td>
                      <td className="break-words min-w-0" data-testid="invoice-control-desktop-description">{l.description}<ChargeMark description={l.description} /></td>
                      <td className="break-words min-w-0" data-testid="invoice-control-desktop-match">{m?.method ? `${METHOD[m.method] ?? m.method}${m.productSku ? ` · ${m.productSku}` : ''}` : <span className="text-gray-400">{l.reason ?? 'ingen'}</span>}</td>
                      <td className="text-right break-words min-w-0" data-testid="invoice-control-desktop-expected">{m?.expectedUnitPrice != null ? kr(m.expectedUnitPrice) : '—'}</td>
                      <td className="text-right break-words min-w-0" data-testid="invoice-control-desktop-deviation">{l.varianceAmount != null && l.verdict !== 'not_controllable' ? `${kr(l.varianceAmount)}${l.variancePct != null ? ` (${l.variancePct} %)` : ''}` : '—'}</td>
                      <td className={`pl-4 break-words min-w-0 ${bad ? 'text-red-700 font-medium' : l.verdict === 'ok' ? 'text-green-700' : ''}`} data-testid="invoice-control-desktop-verdict">{LINE[l.verdict] ?? l.verdict}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2 break-words min-w-0" data-testid="invoice-control-tolerance">Sammenlignet med kostpris i leverandørkataloget (tolerance 2 % / 0,50 kr pr. enhed).</p>
          {res.control.lines.some((l) => chargeLabel(l.description)) && (
            <p className="text-xs text-gray-500 mt-1" data-testid="invoice-control-charges">Fragt og gebyr er markeret i teksten. Overprisen er uændret.</p>
          )}
        </>
      )}
    </div>
  )
}
