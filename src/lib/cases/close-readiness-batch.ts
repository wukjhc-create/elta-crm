/**
 * R-10 (pilot-review 2026-10-15): "klar til lukning" for MANGE sager på én gang — dashboardet kaldte
 * getCaseCloseReadinessAction pr. kandidat (≈5 forespørgsler × op til 25 sager ved hver forsideindlæsning).
 * Samme regler som enkelt-sagen (lib/cases/case-progress caseCloseReadiness + lib/invoices/unbilled), men 5 samlede
 * forespørgsler (pagineret, .in() i bidder). Bevidst IKKE 'use server' — kaldes fra gatede server actions; brugerens
 * egen klient (RLS-scope).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { caseCloseReadiness, type CloseReadiness } from '@/lib/cases/case-progress'
import { summarizeUnbilled } from '@/lib/invoices/unbilled'

const CHUNK = 200
const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, i * CHUNK + CHUNK))

export async function batchCaseCloseReadiness(supabase: SupabaseClient, caseIds: string[]): Promise<Map<string, CloseReadiness>> {
  const out = new Map<string, CloseReadiness>()
  if (caseIds.length === 0) return out

  const statusRows: Array<{ id: string; status: string }> = []
  const woRows: Array<{ id: string; case_id: string; status: string }> = []
  const matRows: Array<{ case_id: string; total_sales_price: number | null; billable: boolean | null; invoice_line_id: string | null }> = []
  const othRows: Array<{ case_id: string; total_sales_price: number | null; billable: boolean | null; invoice_line_id: string | null }> = []
  for (const c of chunks(caseIds)) {
    const [st, wo, mat, oth] = await Promise.all([
      supabase.from('service_cases').select('id, status').in('id', c),
      fetchAllRows<{ id: string; case_id: string; status: string }>((f, t) => supabase.from('work_orders').select('id, case_id, status').in('case_id', c).order('id').range(f, t)),
      fetchAllRows<{ id: string; case_id: string; total_sales_price: number | null; billable: boolean | null; invoice_line_id: string | null }>((f, t) => supabase.from('case_materials').select('id, case_id, total_sales_price, billable, invoice_line_id').in('case_id', c).order('id').range(f, t)),
      fetchAllRows<{ id: string; case_id: string; total_sales_price: number | null; billable: boolean | null; invoice_line_id: string | null }>((f, t) => supabase.from('case_other_costs').select('id, case_id, total_sales_price, billable, invoice_line_id').in('case_id', c).order('id').range(f, t)),
    ])
    statusRows.push(...((st.data ?? []) as Array<{ id: string; status: string }>))
    woRows.push(...wo)
    matRows.push(...mat)
    othRows.push(...oth)
  }

  const woCase = new Map(woRows.map((w) => [w.id, w.case_id]))
  type TL = { work_order_id: string; end_time: string | null; hours: number | null; sale_amount: number | null; sale_rate_snapshot: number | null; billable: boolean | null; invoice_line_id: string | null }
  const tlRows: TL[] = []
  for (const c of chunks(woRows.map((w) => w.id))) {
    // afviste timer blokerer ikke lukning (som enkelt-sagen)
    tlRows.push(...await fetchAllRows<TL & { id: string }>((f, t) => supabase.from('time_logs')
      .select('id, work_order_id, end_time, hours, sale_amount, sale_rate_snapshot, billable, invoice_line_id, employee:employees(hourly_rate)')
      .in('work_order_id', c).neq('approval_status', 'rejected').order('id').range(f, t)))
  }

  const by = <T extends { case_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>()
    for (const r of rows) m.set(r.case_id, [...(m.get(r.case_id) ?? []), r])
    return m
  }
  const wosBy = by(woRows)
  const matBy = by(matRows)
  const othBy = by(othRows)
  const tlBy = new Map<string, TL[]>()
  for (const t of tlRows) {
    const cid = woCase.get(t.work_order_id)
    if (cid) tlBy.set(cid, [...(tlBy.get(cid) ?? []), t])
  }
  for (const s of statusRows) {
    out.set(s.id, caseCloseReadiness({
      caseStatus: s.status,
      workOrderStatuses: (wosBy.get(s.id) ?? []).map((w) => String(w.status ?? '')),
      unbilled: summarizeUnbilled({
        timeLogs: (tlBy.get(s.id) ?? []) as never[],
        materials: (matBy.get(s.id) ?? []) as never[],
        otherCosts: (othBy.get(s.id) ?? []) as never[],
      }),
    }))
  }
  return out
}
