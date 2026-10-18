'use client'

/**
 * Efterkalkulation på sagens Økonomi-fane. Sammenfoldet som standard.
 * Tallene hentes først når sektionen åbnes, og ryddes når den lukkes.
 */

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Scale } from 'lucide-react'
import { getCaseAftercalc } from '@/lib/actions/case-aftercalc'
import { DATA_QUALITY_LABELS, type AftercalcLineStatus, type CaseAftercalcView, type VarianceAmount } from '@/lib/cases/aftercalc'
import { invoicedStateLabel } from '@/lib/cases/aftercalc-overview'
import { useCostReveal } from '@/components/shared/sensitive-amounts'
import { formatCurrency } from '@/lib/utils/format'

const STATUS: Record<AftercalcLineStatus, { label: string; cls: string }> = {
  as_offered: { label: 'Som tilbudt', cls: 'bg-emerald-100 text-emerald-800' },
  over: { label: 'Over budget', cls: 'bg-red-100 text-red-800' },
  under: { label: 'Under budget', cls: 'bg-blue-100 text-blue-800' },
  not_used: { label: 'Ikke brugt', cls: 'bg-gray-100 text-gray-700' },
  not_offered: { label: 'Ekstra / ikke tilbudt', cls: 'bg-amber-100 text-amber-800' },
  missing_cost: { label: 'Mangler kostdata', cls: 'bg-orange-100 text-orange-900' },
  unmatched: { label: 'Ikke matchet', cls: 'bg-slate-100 text-slate-700' },
}

const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))
const qty = (n: number | null) => (n == null ? '—' : n.toLocaleString('da-DK', { maximumFractionDigits: 2 }))
const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('da-DK', { maximumFractionDigits: 2 })} %`)

function moneyDev(amount: number | null, goodWhenPositive: boolean) {
  if (amount == null) return <span className="text-gray-400">Kan ikke beregnes</span>
  const bad = goodWhenPositive ? amount < 0 : amount > 0
  const sign = amount > 0 ? '+' : ''
  return <span className={bad ? 'text-red-700' : amount === 0 ? 'text-gray-700' : 'text-emerald-700'}>{sign}{kr(amount)}</span>
}

function DevCell({ value, kind }: { value: VarianceAmount; kind: 'cost' | 'gain' | 'hours' | 'pct' }) {
  if (kind === 'hours') {
    if (value.amount == null) return <span className="text-gray-400">Kan ikke beregnes</span>
    const bad = value.amount > 0
    const sign = value.amount > 0 ? '+' : ''
    return (
      <span className={bad ? 'text-red-700' : value.amount === 0 ? 'text-gray-700' : 'text-emerald-700'}>
        {sign}{qty(value.amount)} t{value.pct != null ? ` (${sign}${value.pct.toLocaleString('da-DK', { maximumFractionDigits: 1 })} %)` : ''}
      </span>
    )
  }
  if (kind === 'pct') {
    if (value.amount == null) return <span className="text-gray-400">Kan ikke beregnes</span>
    const bad = value.amount < 0
    const sign = value.amount > 0 ? '+' : ''
    return <span className={bad ? 'text-red-700' : value.amount === 0 ? 'text-gray-700' : 'text-emerald-700'}>{sign}{value.amount.toLocaleString('da-DK', { maximumFractionDigits: 2 })} pp</span>
  }
  return moneyDev(value.amount, kind === 'gain')
}

export function CaseAftercalcPanel({ caseId }: { caseId: string }) {
  const [open, toggle] = useCostReveal()
  const [data, setData] = useState<CaseAftercalcView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tryKey, setTryKey] = useState(0)

  useEffect(() => {
    if (!open) return
    let alive = true
    setError(null)
    getCaseAftercalc(caseId).then((res) => {
      if (!alive) return
      if (res.success && res.data) setData(res.data)
      else setError(res.error ?? 'Kunne ikke hente efterkalkulation')
    }).catch(() => {
      if (alive) setError('Kunne ikke hente efterkalkulation')
    })
    return () => { alive = false }
  }, [open, caseId, tryKey])

  useEffect(() => { if (!open) setData(null) }, [open])

  const rows: Array<{ label: string; quoted: string; actual: string; variance: VarianceAmount; kind: 'cost' | 'gain' | 'hours' | 'pct' }> = data
    ? [
        { label: 'Omsætning', quoted: kr(data.quoted.revenue), actual: kr(data.actual.revenue), variance: data.variance.revenue, kind: 'gain' },
        { label: 'Materialekost', quoted: kr(data.quoted.material_cost), actual: kr(data.actual.material_cost), variance: data.variance.material_cost, kind: 'cost' },
        { label: 'Timer', quoted: data.quoted.labour_hours == null ? '—' : `${qty(data.quoted.labour_hours)} t`, actual: data.actual.labour_hours == null ? '—' : `${qty(data.actual.labour_hours)} t`, variance: data.variance.labour_hours, kind: 'hours' },
        { label: 'Lønomkostning', quoted: kr(data.quoted.labour_cost), actual: kr(data.actual.labour_cost), variance: data.variance.labour_cost, kind: 'cost' },
        { label: 'Øvrige omkostninger', quoted: kr(data.quoted.other_cost), actual: kr(data.actual.other_cost), variance: data.variance.other_cost, kind: 'cost' },
        { label: 'Samlet kost', quoted: kr(data.quoted.total_cost), actual: kr(data.actual.total_cost), variance: data.variance.total_cost, kind: 'cost' },
        { label: 'DB', quoted: kr(data.quoted.contribution_margin), actual: kr(data.actual.contribution_margin), variance: data.variance.contribution_margin, kind: 'gain' },
        { label: 'DB %', quoted: pct(data.quoted.contribution_margin_pct), actual: pct(data.actual.contribution_margin_pct), variance: { amount: data.variance.contribution_margin_pct_points, pct: null }, kind: 'pct' },
      ]
    : []

  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-white p-4" data-testid="aftercalc-panel">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between text-left" data-testid="aftercalc-toggle" aria-expanded={open}>
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Scale className="w-4 h-4 text-gray-500" />
          Efterkalkulation
        </h3>
        {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
      </button>
      {!open && (
        <p className="mt-1 text-xs text-gray-500 break-words min-w-0" data-testid="aftercalc-closed-hint">Tilbudt mod faktisk. Kost og DB er skjult, indtil du åbner.</p>
      )}

      {open && (
        <div className="mt-3 space-y-4">
          {error && (
            <div className="text-sm text-red-700">
              <p>{error}. Det tælles ikke som 0 kr.</p>
              <button type="button" onClick={() => setTryKey((n) => n + 1)} className="mt-2 min-h-[44px] px-3 text-sm font-medium border rounded-lg">
                Prøv igen
              </button>
            </div>
          )}
          {!error && !data && (
            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Henter…</p>
          )}
          {data && (
            <>
              <p className="text-xs text-gray-500 break-words min-w-0" data-testid="case-aftercalc-intro">
                {data.offer
                  ? `Tilbud ${data.offer.offer_number ?? ''} mod sagens registrerede forbrug og udstedte fakturaer. Beløb er ekskl. moms.`
                  : 'Sagen har intet tilbud. Faktisk forbrug og fakturering vises alligevel.'}
                {' '}<span data-testid="case-invoiced-state">{invoicedStateLabel(data.invoiced_state)}</span>.
                {data.data_quality === 'warning' ? ' DB vises kun, hvor kostgrundlaget er komplet.' : ''}
              </p>

              <div className="md:hidden space-y-2" data-testid="aftercalc-summary-mobile">
                {rows.map((r) => (
                  <div key={r.label} className="rounded ring-1 ring-gray-200 p-3">
                    <p className="text-sm font-medium text-gray-900">{r.label}</p>
                    <p className="mt-1 text-xs text-gray-600 break-words min-w-0">Tilbudt {r.quoted}</p>
                    <p className="text-xs text-gray-700 break-words min-w-0">Faktisk {r.actual}</p>
                    <p className="text-xs text-gray-800 break-words min-w-0">Afvigelse <DevCell value={r.variance} kind={r.kind} /></p>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th className="px-2 py-1.5 text-left"> </th>
                      <th className="px-2 py-1.5 text-right">Tilbudt</th>
                      <th className="px-2 py-1.5 text-right">Faktisk</th>
                      <th className="px-2 py-1.5 text-right">Afvigelse</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r) => (
                      <tr key={r.label} data-testid="aftercalc-row">
                        <td className="px-2 py-1.5 text-gray-700">{r.label}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{r.quoted}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{r.actual}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0"><DevCell value={r.variance} kind={r.kind} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <Highlight title="Største merkost" rows={data.worst} empty="Ingen linje er dyrere end tilbudt." tone="text-red-700" />
                <Highlight title="Største besparelse" rows={data.best} empty="Ingen brugt linje er billigere end tilbudt." tone="text-emerald-700" />
                <Highlight title="Ikke brugte tilbudslinjer" rows={data.unused_offer_lines} empty="Alle tilbudslinjer er brugt eller mangler kost." tone="text-gray-700" />
                <Highlight title="Ekstra, ikke i tilbuddet" rows={data.extra_not_offered} empty="Intet registreret forbrug ligger uden for tilbuddet." tone="text-amber-800" />
              </div>

              {data.missing_cost_lines.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-orange-800 mb-1 break-words" data-testid="aftercalc-missing-cost-count">Mangler kostdata ({data.missing_cost_lines.length})</h4>
                  <ul className="text-sm text-gray-700 space-y-0.5">
                    {data.missing_cost_lines.map((r) => <li key={r.key} className="break-words">{r.description}</li>)}
                  </ul>
                </div>
              )}

              {data.warnings.length > 0 && (
                <ul className="space-y-1">
                  {data.warnings.map((w) => (
                    <li key={`${w.code}-${w.message}`} className={`text-xs rounded px-2 py-1 break-words min-w-0 ${w.severity === 'warning' ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-600'}`}>
                      <span className="font-medium">{DATA_QUALITY_LABELS[w.code]}.</span> {w.message}
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Linjer</h4>
                <p className="text-xs text-gray-500 mb-2 break-words min-w-0" data-testid="aftercalc-line-rule">
                  En linje kobles kun, når materialet peger på tilbudslinjen eller på samme leverandørvare. Ens tekst alene står som ikke matchet. Linjelisten slår ikke antal eller kost sammen, heller ikke når teksten er ens.
                </p>
                {data.lines.length === 0 ? (
                  <p className="text-sm text-gray-500 break-words min-w-0" data-testid="aftercalc-lines-empty">Ingen linjer eller forbrug endnu. Linjer kommer fra tilbuddet. Forbrug kommer fra timer, materialer og andre omkostninger.</p>
                ) : (
                  <>
                  <div className="md:hidden divide-y rounded ring-1 ring-gray-200" data-testid="aftercalc-lines-mobile">
                    {data.lines.map((r) => (
                      <div key={r.key} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-gray-900 break-words">{r.description}</p>
                            {r.unit && <p className="text-[11px] text-gray-500">{r.unit}</p>}
                          </div>
                          <span className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                        </div>
                        <p className="mt-2 text-xs text-gray-600 break-words min-w-0">Tilbudt antal {qty(r.offered_qty)} · faktisk antal {qty(r.actual_qty)}</p>
                        <p className="text-xs text-gray-700 break-words min-w-0">Tilbudt kost {kr(r.offered_cost)} · faktisk kost {kr(r.actual_cost)}</p>
                        <p className="text-xs break-words min-w-0">Afvigelse {r.cost_deviation == null ? 'Kan ikke beregnes' : moneyDev(r.cost_deviation, false)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-600">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Linje</th>
                          <th className="px-2 py-1.5 text-right">Tilbudt antal</th>
                          <th className="px-2 py-1.5 text-right">Faktisk antal</th>
                          <th className="px-2 py-1.5 text-right">Tilbudt kost</th>
                          <th className="px-2 py-1.5 text-right">Faktisk kost</th>
                          <th className="px-2 py-1.5 text-right">Afvigelse</th>
                          <th className="px-2 py-1.5 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.lines.map((r) => (
                          <tr key={r.key} data-testid="aftercalc-line" data-status={r.status}>
                            <td className="px-2 py-1.5">
                              <div className="text-gray-900 break-words">{r.description}</div>
                              {r.unit && <div className="text-[11px] text-gray-500">{r.unit}</div>}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{qty(r.offered_qty)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{qty(r.actual_qty)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{kr(r.offered_cost)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{kr(r.actual_cost)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums break-words min-w-0">{r.cost_deviation == null ? 'Kan ikke beregnes' : moneyDev(r.cost_deviation, false)}</td>
                            <td className="px-2 py-1.5 text-center">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Highlight({ title, rows, empty, tone }: { title: string; rows: { key: string; description: string; amount: number }[]; empty: string; tone: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500 break-words min-w-0" data-testid="aftercalc-highlight-empty">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-start justify-between gap-3">
              <span className="text-gray-800 break-words min-w-0">{r.description}</span>
              <span className={`tabular-nums break-words min-w-0 text-right ${tone}`} data-testid="aftercalc-highlight-amount">{kr(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
