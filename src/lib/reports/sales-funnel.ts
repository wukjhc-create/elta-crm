/**
 * N53: salgstragt pr. måned (ren logik, ingen I/O). Måned = dansk kalendermåned (Europe/Copenhagen).
 *   nye kunder → tilbud oprettet → sendt → accepteret (antal + værdi) → faktureret ekskl. moms
 * Forslag (is_proposal) tæller ikke som tilbud; kladde-/annullerede fakturaer og kreditnotaer tæller ikke som faktureret
 * (kreditnotaer trækkes fra).
 */
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export interface FunnelOffer { created_at: string; sent_at: string | null; accepted_at: string | null; final_amount: number | string | null; is_proposal?: boolean | null }
export interface FunnelInvoice { created_at: string; status: string | null; invoice_type: string | null; voided_at: string | null; total_amount: number | string | null }

export interface FunnelMonth {
  month: string // YYYY-MM
  new_customers: number
  offers_created: number
  offers_sent: number
  offers_accepted: number
  accepted_value: number
  invoiced_ex_vat: number
}

export interface SalesFunnel {
  months: FunnelMonth[]
  totals: Omit<FunnelMonth, 'month'> & { sent_rate: number | null; win_rate: number | null }
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const monthOf = (iso: string) => copenhagenParts(iso).date.slice(0, 7)

/** De seneste `count` måneder til og med `now`s måned (ældste først). */
export function lastMonths(now: Date, count: number): string[] {
  const cur = monthOf(now.toISOString())
  let [y, m] = cur.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  return out
}

export function computeSalesFunnel(input: {
  months: string[]
  customers: Array<{ created_at: string }>
  offers: FunnelOffer[]
  invoices: FunnelInvoice[]
}): SalesFunnel {
  const map = new Map<string, FunnelMonth>(input.months.map((m) => [m, {
    month: m, new_customers: 0, offers_created: 0, offers_sent: 0, offers_accepted: 0, accepted_value: 0, invoiced_ex_vat: 0,
  }]))
  const bump = (iso: string | null, f: (x: FunnelMonth) => void) => {
    if (!iso) return
    const x = map.get(monthOf(iso))
    if (x) f(x)
  }
  for (const c of input.customers) bump(c.created_at, (x) => { x.new_customers += 1 })
  for (const o of input.offers) {
    if (o.is_proposal) continue
    bump(o.created_at, (x) => { x.offers_created += 1 })
    bump(o.sent_at, (x) => { x.offers_sent += 1 })
    bump(o.accepted_at, (x) => { x.offers_accepted += 1; x.accepted_value += Number(o.final_amount ?? 0) || 0 })
  }
  for (const i of input.invoices) {
    if (i.voided_at || (i.status ?? 'draft') === 'draft') continue
    const amount = Math.abs(Number(i.total_amount ?? 0) || 0)
    bump(i.created_at, (x) => { x.invoiced_ex_vat += i.invoice_type === 'credit' ? -amount : amount })
  }
  const months = input.months.map((m) => {
    const x = map.get(m)!
    return { ...x, accepted_value: r2(x.accepted_value), invoiced_ex_vat: r2(x.invoiced_ex_vat) }
  })
  const sum = (k: keyof Omit<FunnelMonth, 'month'>) => r2(months.reduce((s, x) => s + (x[k] as number), 0))
  const created = sum('offers_created'), sent = sum('offers_sent'), accepted = sum('offers_accepted')
  return {
    months,
    totals: {
      new_customers: sum('new_customers'), offers_created: created, offers_sent: sent, offers_accepted: accepted,
      accepted_value: sum('accepted_value'), invoiced_ex_vat: sum('invoiced_ex_vat'),
      sent_rate: created > 0 ? r2((sent / created) * 100) : null,
      win_rate: sent > 0 ? r2((accepted / sent) * 100) : null,
    },
  }
}
