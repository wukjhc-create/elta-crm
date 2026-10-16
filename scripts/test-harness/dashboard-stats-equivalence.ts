/**
 * PF-2 (performance-review 2026-10-16) på staging: forsidens tilbudstal med den nye forespørgsel (HEAD-count pr. status +
 * beløb kun for sendt/set/accepteret) giver PRÆCIS de samme tal som den gamle (alle tilbud hentet og talt i JS).
 *   E1  antal pr. status ens
 *   E2  i alt ens
 *   E3  afventende værdi (sendt+set) og accepteret værdi ekskl. moms ens
 *   E4  accept-procent ens
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface EqCheck { id: string; ok: boolean; note: string }

export async function runDashboardStatsEquivalence(c: { admin: SupabaseClient }): Promise<EqCheck[]> {
  const { fetchAllRows } = await import('../../src/lib/supabase/fetch-all')
  const admin = c.admin
  const out: EqCheck[] = []
  type Row = { status: string; final_amount: number | null; tax_amount: number | null }
  const exVat = (o: Row) => (Number(o.final_amount) || 0) - (Number(o.tax_amount) || 0)
  const r2 = (n: number) => Math.round(n * 100) / 100

  // gammel metode
  const all = await fetchAllRows<Row>((f, t) => admin.from('offers').select('id, status, final_amount, tax_amount').eq('is_proposal', false).order('id').range(f, t))
  const oldBy: Record<string, number> = {}
  for (const o of all) oldBy[o.status] = (oldBy[o.status] ?? 0) + 1
  const oldPending = r2(all.filter((o) => o.status === 'sent' || o.status === 'viewed').reduce((s, o) => s + exVat(o), 0))
  const oldAccepted = r2(all.filter((o) => o.status === 'accepted').reduce((s, o) => s + exVat(o), 0))
  const oldDecided = (oldBy.accepted ?? 0) + (oldBy.rejected ?? 0)
  const oldRate = oldDecided > 0 ? Math.round(((oldBy.accepted ?? 0) / oldDecided) * 100) : 0

  // ny metode
  const STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired']
  const head = async (st?: string) => {
    let q = admin.from('offers').select('id', { count: 'exact', head: true }).eq('is_proposal', false)
    if (st) q = q.eq('status', st)
    const { count, error } = await q
    if (error) throw new Error(error.message)
    return count ?? 0
  }
  const counts = await Promise.all(STATUSES.map((st) => head(st)))
  const total = await head()
  const rows = await fetchAllRows<Row>((f, t) => admin.from('offers').select('id, status, final_amount, tax_amount').eq('is_proposal', false).in('status', ['sent', 'viewed', 'accepted']).order('id').range(f, t))
  const newBy = Object.fromEntries(STATUSES.map((st, i) => [st, counts[i]])) as Record<string, number>
  const newPending = r2(rows.filter((o) => o.status === 'sent' || o.status === 'viewed').reduce((s, o) => s + exVat(o), 0))
  const newAccepted = r2(rows.filter((o) => o.status === 'accepted').reduce((s, o) => s + exVat(o), 0))
  const newDecided = (newBy.accepted ?? 0) + (newBy.rejected ?? 0)
  const newRate = newDecided > 0 ? Math.round(((newBy.accepted ?? 0) / newDecided) * 100) : 0

  const sameCounts = STATUSES.every((st) => (oldBy[st] ?? 0) === (newBy[st] ?? 0))
  out.push({ id: 'E1 antal pr. status ens', ok: sameCounts, note: STATUSES.map((st) => `${st}=${oldBy[st] ?? 0}/${newBy[st] ?? 0}`).join(' ') })
  out.push({ id: 'E2 i alt ens', ok: all.length === total, note: `${all.length}/${total}` })
  out.push({ id: 'E3 afventende + accepteret værdi ens', ok: oldPending === newPending && oldAccepted === newAccepted, note: `afventende ${oldPending}/${newPending} · accepteret ${oldAccepted}/${newAccepted}` })
  out.push({ id: 'E4 accept-procent ens', ok: oldRate === newRate, note: `${oldRate}/${newRate}` })
  const unknown = Object.keys(oldBy).filter((st) => !STATUSES.includes(st))
  if (unknown.length) out.push({ id: 'E5 ingen ukendte statusser', ok: false, note: unknown.join(',') })
  return out
}

export function formatDashboardStatsEquivalence(checks: EqCheck[]): string {
  const passed = checks.filter((c) => c.ok).length
  return `${checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.id} — ${c.note}`).join('\n')}\n\n${passed}/${checks.length} ${passed === checks.length ? '✅' : '❌'}`
}
