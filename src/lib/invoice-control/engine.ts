/**
 * Fakturakontrol-motor (P3 #19) — REN, deterministisk: leverandoerfakturaens linjer mod forventet nettopris.
 * Ingen DB, ingen netvaerk, ingen godkendelse/bogfoering (det er separate, gatede trin).
 *
 * For hver linje: forventet enhedspris (fra grossistaftale/prisliste paa fakturadatoen, se Profit Engine #18)
 * sammenholdes med faktureret enhedspris. Afvigelser over tolerance markeres. Linjer der ikke KAN kontrolleres
 * (intet produktmatch/ingen forventet pris/ingen enhedspris) taelles aerligt som "ikke kontrolleret" — en faktura
 * uden kontrollerbare linjer faar status `not_controllable`, aldrig `ok`.
 */

export interface InvoiceLineInput {
  lineNumber: number
  description: string
  quantity: number | null
  unitPrice: number | null
  /** Forventet nettopris pr. enhed paa fakturadatoen (null = kan ikke bestemmes). */
  expectedUnitPrice: number | null
  /** Hvorfor forventet pris mangler (fx 'intet produktmatch'). */
  expectedMissingReason?: string
}

export interface ControlTolerance {
  /** Procentvis tolerance (fx 2 = 2 %). */
  pct: number
  /** Absolut tolerance pr. enhed i kr (afrunding). Afvigelse skal overstige BEGGE for at blive markeret. */
  absPerUnit: number
}

export const DEFAULT_TOLERANCE: ControlTolerance = { pct: 2, absPerUnit: 0.5 }

export type LineVerdict = 'ok' | 'overcharge' | 'undercharge' | 'not_controllable'
export interface LineControl {
  lineNumber: number
  description: string
  verdict: LineVerdict
  /** (faktureret - forventet) * antal; positiv = vi betaler for meget. */
  varianceAmount: number
  variancePct: number | null
  reason: string
}
export type InvoiceVerdict = 'ok' | 'deviation' | 'partially_controlled' | 'not_controllable'
export interface InvoiceControl {
  verdict: InvoiceVerdict
  lines: LineControl[]
  controlledLines: number
  totalLines: number
  /** Andel af linjer der kunne kontrolleres (0–100). Kerne-KPI for datakvaliteten. */
  coveragePct: number
  /** Samlet merbetaling paa markerede linjer (kun positive afvigelser). */
  overchargeAmount: number
}

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

export function controlLine(l: InvoiceLineInput, tol: ControlTolerance = DEFAULT_TOLERANCE): LineControl {
  const base = { lineNumber: l.lineNumber, description: l.description }
  if (l.unitPrice == null || l.quantity == null) return { ...base, verdict: 'not_controllable', varianceAmount: 0, variancePct: null, reason: 'mangler antal eller enhedspris på fakturaen' }
  if (l.expectedUnitPrice == null || !(l.expectedUnitPrice > 0)) {
    return { ...base, verdict: 'not_controllable', varianceAmount: 0, variancePct: null, reason: l.expectedMissingReason ?? 'ingen forventet pris' }
  }
  const diff = l.unitPrice - l.expectedUnitPrice
  const variancePct = r2((diff / l.expectedUnitPrice) * 100)
  const varianceAmount = r2(diff * l.quantity)
  const beyond = Math.abs(diff) > tol.absPerUnit && Math.abs(variancePct) > tol.pct
  if (!beyond) return { ...base, verdict: 'ok', varianceAmount, variancePct, reason: 'inden for tolerance' }
  return diff > 0
    ? { ...base, verdict: 'overcharge', varianceAmount, variancePct, reason: `faktureret ${l.unitPrice} mod aftalt ${l.expectedUnitPrice} (+${variancePct} %)` }
    : { ...base, verdict: 'undercharge', varianceAmount, variancePct, reason: `faktureret ${l.unitPrice} mod aftalt ${l.expectedUnitPrice} (${variancePct} %)` }
}

export function controlInvoice(lines: InvoiceLineInput[], tol: ControlTolerance = DEFAULT_TOLERANCE): InvoiceControl {
  const controls = [...lines].sort((a, b) => a.lineNumber - b.lineNumber).map((l) => controlLine(l, tol))
  const controlled = controls.filter((c) => c.verdict !== 'not_controllable')
  const deviating = controlled.filter((c) => c.verdict === 'overcharge' || c.verdict === 'undercharge')
  const coveragePct = lines.length ? r2((controlled.length / lines.length) * 100) : 0
  const verdict: InvoiceVerdict = controlled.length === 0 ? 'not_controllable'
    : deviating.length > 0 ? 'deviation'
      : controlled.length < lines.length ? 'partially_controlled' : 'ok'
  return {
    verdict, lines: controls, controlledLines: controlled.length, totalLines: lines.length, coveragePct,
    overchargeAmount: r2(controls.filter((c) => c.verdict === 'overcharge').reduce((s, c) => s + c.varianceAmount, 0)),
  }
}
