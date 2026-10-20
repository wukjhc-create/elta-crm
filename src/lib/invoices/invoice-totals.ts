/**
 * B-2 (pilot-review 2026-10-15, godkendt af Henrik 2026-10-16): nøgletal for kundefakturaer beregnet over HELE
 * datasættet (aldrig over en pagineret/afkortet liste). Én regel for fakturaoverblik og dashboard:
 *   - åbent beløb = final − indbetalt − sendte/betalte, ikke-annullerede kreditnotaer mod fakturaen (≥ 0)
 *   - kladder tælles (ikke annullerede); kreditnotaer og annullerede fakturaer indgår ikke i udestående
 *   - beløb summeres KUN i DKK; fakturaer i anden valuta tælles separat (other_currency_count)
 *   - "betalt denne måned" i dansk kalendermåned
 * Ren funktion (ingen DB) — kalderen henter rækkerne pagineret (fetchAllRows).
 */
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export interface InvoiceTotalsRow {
  id: string
  invoice_type: string | null
  status: string
  final_amount: number | string | null
  amount_paid?: number | string | null
  credit_of_invoice_id?: string | null
  currency?: string | null
  paid_at?: string | null
  due_date?: string | null
  voided_at?: string | null
}

export interface InvoiceTotals {
  draftCount: number
  sentUnpaid: number
  outstanding: number
  overdueCount: number
  overdueSum: number
  paidThisMonth: number
  /** sendte/forfaldne/betalte fakturaer i anden valuta end DKK — ikke med i beløbene */
  otherCurrencyCount: number
  /** forfaldne (åbent beløb > 0) med antal dage over forfald — til top-lister */
  overdue: Array<{ id: string; days: number; open: number }>
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Dansk kalenderdage fra forfaldsdato (YYYY-MM-DD) til nu; > 0 = forfalden */
function daysOverdue(dueIso: string, nowMs: number): number {
  const today = copenhagenParts(new Date(nowMs)).date
  const a = Date.UTC(Number(dueIso.slice(0, 4)), Number(dueIso.slice(5, 7)) - 1, Number(dueIso.slice(8, 10)))
  const b = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)))
  return Math.round((b - a) / 86_400_000)
}

/** FC-5: én registreret indbetaling (invoice_payments) */
export interface InvoicePaymentRow { invoice_id: string; amount: number | string | null; recorded_at: string }

/**
 * @param payments FC-5 (finans-review 2026-10-20): indbetalinger (mindst denne måneds). Når de gives, er "betalt denne
 *   måned" = summen af faktiske indbetalinger registreret i den danske kalendermåned (delbetalinger med; en betaling
 *   28/9 tæller i september, ikke i fakturaens paid_at-måned). Fakturaer markeret betalt uden betalingsrække (ældre,
 *   amount_paid = 0) tæller med beløbet efter kreditnotaer i paid_at-måneden.
 */
export function computeInvoiceTotals(rows: InvoiceTotalsRow[], nowMs: number, payments?: InvoicePaymentRow[]): InvoiceTotals {
  const ym = copenhagenParts(new Date(nowMs)).date.slice(0, 7)
  const credited = new Map<string, number>()
  for (const r of rows) {
    if (r.invoice_type === 'credit' && r.credit_of_invoice_id && !r.voided_at && (r.status === 'sent' || r.status === 'paid')) {
      credited.set(r.credit_of_invoice_id, (credited.get(r.credit_of_invoice_id) ?? 0) + Math.abs(Number(r.final_amount ?? 0)))
    }
  }
  const open = (r: InvoiceTotalsRow) =>
    Math.max(0, r2(Number(r.final_amount ?? 0) - Number(r.amount_paid ?? 0) - (credited.get(r.id) ?? 0)))

  const t: InvoiceTotals = { draftCount: 0, sentUnpaid: 0, outstanding: 0, overdueCount: 0, overdueSum: 0, paidThisMonth: 0, otherCurrencyCount: 0, overdue: [] }
  for (const r of rows) {
    if (r.status === 'draft' && !r.voided_at) { t.draftCount += 1; continue }
    const isCredit = r.invoice_type === 'credit'
    if (isCredit || r.voided_at) continue
    const dkk = !r.currency || r.currency.toUpperCase() === 'DKK'
    if (r.status === 'sent') {
      if (!dkk) { t.otherCurrencyCount += 1; continue }
      const o = open(r)
      t.sentUnpaid += o
      t.outstanding += o
      // FIN-11 (finance-review 2026-10-17): øre-rest fra afrunding på opdelte kreditnotaer (fx 0,01 kr) er ikke forfalden —
      // samme grænse (0,50 kr) som rykkerne
      if (r.due_date && o >= 0.5) {
        const d = daysOverdue(String(r.due_date).slice(0, 10), nowMs)
        if (d > 0) { t.overdueCount += 1; t.overdueSum += o; t.overdue.push({ id: r.id, days: d, open: o }) }
      }
    } else if (r.status === 'paid' && r.paid_at && copenhagenParts(String(r.paid_at)).date.slice(0, 7) === ym) {
      if (!dkk) { t.otherCurrencyCount += 1; continue }
      // FC-5: med betalingsrækker tælles indbetalingerne nedenfor; kun uden registreret indbetaling bruges fakturabeløbet
      if (payments && Number(r.amount_paid ?? 0) > 0) continue
      // FIN-6 (finance-review 2026-10-17): faktisk indbetalt (før final_amount — en krediteret del talte med som betalt);
      // uden registreret indbetaling (ældre manuelt markerede) = beløb efter kreditnotaer
      const paid = Number(r.amount_paid ?? 0)
      t.paidThisMonth += paid > 0 ? paid : Math.max(0, r2(Number(r.final_amount ?? 0) - (credited.get(r.id) ?? 0)))
    }
  }
  if (payments) {
    const byId = new Map(rows.map((r) => [r.id, r]))
    for (const p of payments) {
      if (!p.recorded_at || copenhagenParts(String(p.recorded_at)).date.slice(0, 7) !== ym) continue
      const inv = byId.get(p.invoice_id)
      if (!inv || inv.invoice_type === 'credit' || inv.voided_at) continue
      if (inv.currency && inv.currency.toUpperCase() !== 'DKK') continue
      t.paidThisMonth += Number(p.amount ?? 0)
    }
  }
  t.sentUnpaid = r2(t.sentUnpaid)
  t.outstanding = r2(t.outstanding)
  t.overdueSum = r2(t.overdueSum)
  t.paidThisMonth = r2(t.paidThisMonth)
  t.overdue.sort((a, b) => b.days - a.days)
  return t
}
