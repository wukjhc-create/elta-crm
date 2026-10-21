/**
 * N51/DB-15k: fakturerbart arbejde uden faktura pr. sag — ÉN definition for cockpittets "Klar til fakturering" og
 * sagslistens filter (?unbilled=1): billable + invoice_line_id IS NULL; timer kun afsluttede og godkendte (TT-10);
 * materialer og øvrige omkostninger. Salgsværdi (ingen kost). Pagineret (PostgREST max 1000 rækker).
 * FIN3-5: fastprissager tæller med kontraktens restbeløb (ikke linjernes salgspris).
 * Bevidst IKKE 'use server' — kalderen gater (invoices.create).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export async function unbilledWorkByCase(supabase: SupabaseClient): Promise<Map<string, { lines: number; sale: number }>> {
  const [tlRows, matRows, othRows] = await Promise.all([
    fetchAllRows((f, t) => supabase.from('time_logs').select('id, sale_amount, work_order:work_orders!inner(case_id)')
      .eq('billable', true).is('invoice_line_id', null).not('end_time', 'is', null).eq('approval_status', 'approved').order('id').range(f, t)),
    fetchAllRows((f, t) => supabase.from('case_materials').select('id, case_id, total_sales_price').eq('billable', true).is('invoice_line_id', null).order('id').range(f, t)),
    fetchAllRows((f, t) => supabase.from('case_other_costs').select('id, case_id, total_sales_price').eq('billable', true).is('invoice_line_id', null).order('id').range(f, t)),
  ])
  const agg = new Map<string, { lines: number; sale: number }>()
  const add = (caseId: string | null | undefined, sale: unknown) => {
    if (!caseId) return
    const cur = agg.get(caseId) ?? { lines: 0, sale: 0 }
    cur.lines += 1
    cur.sale += Number(sale ?? 0) || 0
    agg.set(caseId, cur)
  }
  for (const t of tlRows as Array<{ sale_amount: number | string | null; work_order: { case_id: string | null } | Array<{ case_id: string | null }> | null }>) {
    const wo = Array.isArray(t.work_order) ? t.work_order[0] : t.work_order
    add(wo?.case_id, t.sale_amount)
  }
  for (const m of matRows as Array<{ case_id: string; total_sales_price: number | string | null }>) add(m.case_id, m.total_sales_price)
  for (const o of othRows as Array<{ case_id: string; total_sales_price: number | string | null }>) add(o.case_id, o.total_sales_price)

  // FIN3-5 (finans-review 2 2026-10-20): på en FASTPRIS-sag faktureres linjerne ikke enkeltvis — slutfakturaen dækker
  // dem via kontraktlinjen. "Klar til fakturering" er dér kontraktens restbeløb (effektiv kontraktsum − netto faktureret
  // ekskl. moms), ikke linjernes salgspris. Ingen rest (≤ 0,50) → sagen er ikke klar til fakturering.
  const ids = Array.from(agg.keys())
  if (ids.length) {
    const { selectInChunks } = await import('@/lib/supabase/in-chunks')
    const { effectiveContractSum } = await import('@/lib/cases/expected-revenue')
    const { netInvoicedExVat } = await import('@/lib/invoices/net-invoiced')
    const cases = await selectInChunks<{ id: string; billing_model: string | null; contract_sum: number | string | null; revised_sum: number | string | null }>(
      ids, (chunk) => supabase.from('service_cases').select('id, billing_model, contract_sum, revised_sum').in('id', chunk))
    const fixed = cases.filter((c) => c.billing_model === 'fixed_price')
    if (fixed.length) {
      const invRows = await selectInChunks<{ case_id: string; total_amount: number | string | null; status: string | null; invoice_type: string | null; voided_at: string | null; currency: string | null }>(
        // FR-8 (review 2026-10-22): side for side pr. bid — 200 sager med rater/kreditnotaer kan overstige 1.000 fakturaer
        fixed.map((c) => c.id), async (chunk) => ({ error: null, data: await fetchAllRows((f, t) => supabase.from('invoices')
          .select('case_id, total_amount, status, invoice_type, voided_at, currency').in('case_id', chunk).order('id').range(f, t)) }))
      const byCase = new Map<string, typeof invRows>()
      for (const r of invRows) {
        if (r.currency && r.currency.toUpperCase() !== 'DKK') continue
        const arr = byCase.get(r.case_id)
        if (arr) arr.push(r)
        else byCase.set(r.case_id, [r])
      }
      for (const c of fixed) {
        const ref = effectiveContractSum({ contractSum: c.contract_sum, revisedSum: c.revised_sum, billingModel: c.billing_model })
        if (ref == null) continue
        const remainder = Math.round((ref - netInvoicedExVat(byCase.get(c.id) ?? [])) * 100) / 100
        const cur = agg.get(c.id)!
        if (remainder > 0.5) agg.set(c.id, { lines: cur.lines, sale: remainder })
        // R3-2 (finans-review 3): kontrakten er fuldt faktureret → de ubundne linjer er ekstraarbejde (efter
        // slutfakturaen) og bliver stående med deres salgspris — før forsvandt de, og omsætningen blev aldrig faktureret
        else if (cur.lines > 0 && cur.sale > 0.5) agg.set(c.id, cur)
        else agg.delete(c.id)
      }
    }
  }
  return agg
}
