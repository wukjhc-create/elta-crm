/**
 * Åbent beløb pr. faktura = final_amount − amount_paid − sendte/betalte kreditnotaer mod fakturaen (højst 0).
 * Samme regel som fakturaoversigten (økonomi-review 2026-10-08 #8) og rykkerne — så cockpit, dashboard-API og
 * fakturaoversigt viser samme udestående (rapport-review 2026-10-09 #1).
 */
import { selectInChunks } from '@/lib/supabase/in-chunks'

type InvoiceForOpen = { id: string; final_amount: number | string | null; amount_paid?: number | string | null }

/** Kreditnota-beløb (absolut) pr. original faktura-id — kun sendte/betalte, ikke annullerede kreditnotaer. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function creditedByOriginal(supabase: any, invoiceIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const ids = Array.from(new Set(invoiceIds))
  if (!ids.length) return out
  const rows = await selectInChunks<{ credit_of_invoice_id: string; final_amount: number | string | null }>(ids, (chunk) =>
    supabase
      .from('invoices')
      .select('credit_of_invoice_id, final_amount')
      .eq('invoice_type', 'credit')
      .in('status', ['sent', 'paid'])
      .is('voided_at', null)
      .in('credit_of_invoice_id', chunk)
  )
  for (const r of rows) {
    out.set(r.credit_of_invoice_id, (out.get(r.credit_of_invoice_id) ?? 0) + Math.abs(Number(r.final_amount ?? 0)))
  }
  return out
}

export function openAmount(inv: InvoiceForOpen, credited: Map<string, number>): number {
  const v = Number(inv.final_amount ?? 0) - Number(inv.amount_paid ?? 0) - (credited.get(inv.id) ?? 0)
  return Math.max(0, Math.round(v * 100) / 100)
}
