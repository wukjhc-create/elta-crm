/**
 * Udestående på en faktura (faktura-review B1, 2026-10-04).
 *
 * Før brugte betalingsstatus, rykkere og dashboards fakturaens fulde beløb (final_amount) og ignorerede både delvise
 * betalinger og udstedte kreditnotaer: faktura 12.500 + kreditnota 2.500 + betaling 10.000 → "sendt" for evigt og
 * rykker på 12.500. Nu: udestående = beløb − betalt − udstedte (sendt/betalt) kreditnotaer, aldrig under 0.
 * Kladde-kreditnotaer tæller IKKE (de er ikke sendt til kunden). Bevidst IKKE 'use server' (ren funktion + DB-hjælper).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Øre-tolerance: under 1 øre udestående regnes som betalt. */
export const OUTSTANDING_EPSILON = 0.005

export function computeOutstanding(finalAmount: number | string | null, amountPaid: number | string | null, creditedIncl: number): number {
  const v = round2(Number(finalAmount ?? 0) - Number(amountPaid ?? 0) - Math.abs(creditedIncl))
  return v > OUTSTANDING_EPSILON ? v : 0
}

/** Sum (inkl. moms, positiv) af UDSTEDTE kreditnotaer pr. original faktura. Kladder og annullerede tæller ikke. */
export async function finalizedCreditsByInvoice(supabase: SupabaseClient, invoiceIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const ids = Array.from(new Set(invoiceIds.filter(Boolean)))
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('invoices')
      .select('credit_of_invoice_id, final_amount')
      .eq('invoice_type', 'credit')
      .in('status', ['sent', 'paid'])
      .is('voided_at', null)
      .in('credit_of_invoice_id', ids.slice(i, i + 200))
    if (error) throw new Error(`finalizedCreditsByInvoice: ${error.message}`)
    for (const r of (data ?? []) as Array<{ credit_of_invoice_id: string; final_amount: number | string }>) {
      out.set(r.credit_of_invoice_id, round2((out.get(r.credit_of_invoice_id) ?? 0) + Math.abs(Number(r.final_amount))))
    }
  }
  return out
}
