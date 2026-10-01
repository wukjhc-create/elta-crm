/**
 * Ufakturerede poster på en sag — ren optælling (samme regler som
 * fakturakladden: kun afsluttede, fakturerbare, ikke-låste rækker).
 * Bruges af faktureringsstatus og af lukke-værnet (sag lukkes ikke stille
 * med ufaktureret arbejde).
 */

export interface UnbilledRowsInput {
  timeLogs: Array<{ end_time: string | null; sale_amount: number | string | null; billable: boolean | null; invoice_line_id: string | null }>
  materials: Array<{ total_sales_price: number | string | null; billable: boolean | null; invoice_line_id: string | null }>
  otherCosts: Array<{ total_sales_price: number | string | null; billable: boolean | null; invoice_line_id: string | null }>
}

export interface UnbilledSummary {
  timeLogs: number
  materials: number
  otherCosts: number
  count: number
  saleTotal: number
  billedLines: number
  openTimer: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function summarizeUnbilled(input: UnbilledRowsInput): UnbilledSummary {
  let timeLogs = 0, materials = 0, otherCosts = 0, sale = 0, billed = 0, openTimer = false
  for (const r of input.timeLogs) {
    if (r.end_time === null) { openTimer = true; continue }
    if (r.invoice_line_id) billed += 1
    else if (r.billable !== false) { timeLogs += 1; sale += Number(r.sale_amount ?? 0) }
  }
  for (const r of input.materials) {
    if (r.invoice_line_id) billed += 1
    else if (r.billable !== false) { materials += 1; sale += Number(r.total_sales_price ?? 0) }
  }
  for (const r of input.otherCosts) {
    if (r.invoice_line_id) billed += 1
    else if (r.billable !== false) { otherCosts += 1; sale += Number(r.total_sales_price ?? 0) }
  }
  return { timeLogs, materials, otherCosts, count: timeLogs + materials + otherCosts, saleTotal: r2(sale), billedLines: billed, openTimer }
}

/** Dansk besked til lukke-værnet, eller null når intet er ufaktureret/kørende. */
export function unbilledCloseMessage(s: UnbilledSummary): string | null {
  if (s.count === 0 && !s.openTimer) return null
  const parts: string[] = []
  if (s.timeLogs) parts.push(`${s.timeLogs} timerække${s.timeLogs === 1 ? '' : 'r'}`)
  if (s.materials) parts.push(`${s.materials} materiale${s.materials === 1 ? '' : 'r'}`)
  if (s.otherCosts) parts.push(`${s.otherCosts} øvrig${s.otherCosts === 1 ? '' : 'e'} omkostning${s.otherCosts === 1 ? '' : 'er'}`)
  const amount = s.saleTotal.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const what = parts.length
    ? `${parts.join(', ').replace(/, ([^,]*)$/, ' og $1')} for i alt ${amount} kr ekskl. moms er ikke faktureret på sagen.`
    : ''
  const timer = s.openTimer ? 'Der kører en timer på sagen.' : ''
  return [what.charAt(0).toUpperCase() + what.slice(1), timer].filter(Boolean).join(' ')
}
