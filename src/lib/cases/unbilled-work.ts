/**
 * N51/DB-15k: fakturerbart arbejde uden faktura pr. sag — ÉN definition for cockpittets "Klar til fakturering" og
 * sagslistens filter (?unbilled=1): billable + invoice_line_id IS NULL; timer kun afsluttede og godkendte (TT-10);
 * materialer og øvrige omkostninger. Salgsværdi (ingen kost). Pagineret (PostgREST max 1000 rækker).
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
  return agg
}
