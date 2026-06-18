/**
 * Sprint Ø9.5 — DB-smoke for porteføljevidt indkøbs-drift-dashboard.
 *
 * Spejler data-laget i getPurchaseOperationsDashboardAction mod et RIGTIGT
 * Supabase-skema med ægte testdata. Genbruger den isomorfe Ø9.1-forfaldshelper.
 * Permission-gaten testes statisk i assert-oe9-5-security.ts.
 *
 * NB: mirror'en scoper queryet til testsagernes id'er (.in matched_case_id) så
 * asserts er deterministiske mod evt. prod-data — samme regler/aggregering.
 *
 * Scenarier:
 *   A: approved, 2 ukonv. linjer (+ rejected faktura m. 1 ukonv. → ekskluderes)
 *   B: posted, 1 ukonv. linje
 *   C: received, 1 ukonv. linje (separat — IKKE drift, ikke i action-liste)
 *   D: approved, overdue, alle linjer konverteret (actionable pga. forfald)
 *   E: approved, due_soon, alle linjer konverteret (actionable pga. forfald)
 *   F: approved, ok, alle linjer konverteret (IKKE actionable)
 *
 * Kør:  npx tsx scripts/smoke-oe9-5-purchase-ops.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { incomingDueBadge } from '../src/lib/invoices/incoming-invoice-due'

function loadEnv(file: string) {
  try {
    const raw = readFileSync(file, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const k = m[1]; let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnv(resolve(__dirname, '..', '.env.local'))

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const DEAD = new Set(['rejected', 'cancelled'])
const PAYMENT = new Set(['approved', 'posted'])

let failures = 0, passes = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passes++; console.log(`  ✅ ${msg}`) }
  else { failures++; console.log(`  ❌ ${msg}`) }
}

const r2 = (n: number) => Math.round(n * 100) / 100
function isoPlus(days: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10)
}
const todayIso = new Date().toISOString().slice(0, 10)

// --- Spejling af action's data-lag, scoped til testsager ---
async function compute(caseIds: string[], canViewAmounts: boolean) {
  const { data, error } = await supabase
    .from('incoming_invoices')
    .select(`id, status, matched_case_id, invoice_date, due_date, currency,
      lines:incoming_invoice_lines(total_price, converted_case_material_id, converted_case_other_cost_id, converted_at)`)
    .in('matched_case_id', caseIds)
    .in('status', ['approved', 'posted', 'received', 'awaiting_approval'])
    .order('invoice_date', { ascending: false, nullsFirst: false })
    .limit(2000)
  if (error) throw new Error('query: ' + error.message)

  const cases = new Map<string, any>()
  let totalLines = 0, totalAmount = 0, overdueInv = 0, dueSoonInv = 0, approvedUnconv = 0, recvAwaitUnconv = 0
  for (const inv of (data ?? []) as any[]) {
    if (!inv.matched_case_id || DEAD.has(inv.status)) continue
    const lines = Array.isArray(inv.lines) ? inv.lines : []
    let uLines = 0, uAmount = 0
    for (const ln of lines) {
      const handled = !!ln.converted_case_material_id || !!ln.converted_case_other_cost_id || !!ln.converted_at
      if (!handled) { uLines++; uAmount += Number(ln.total_price ?? 0) }
    }
    const isPayment = PAYMENT.has(inv.status)
    const badge = isPayment ? incomingDueBadge(inv.due_date, todayIso) : 'ok'
    const isOverdue = badge === 'overdue', isDueSoon = badge === 'due_soon'
    if (uLines === 0 && !isOverdue && !isDueSoon) continue

    let acc = cases.get(inv.matched_case_id)
    if (!acc) { acc = { case_id: inv.matched_case_id, unconverted_line_count: 0, unconverted_amount: 0, overdue_count: 0, due_soon_count: 0, approved_unconverted: false, posted_unconverted: false }; cases.set(inv.matched_case_id, acc) }
    if (uLines > 0) {
      acc.unconverted_line_count += uLines; acc.unconverted_amount += uAmount
      totalLines += uLines; totalAmount += uAmount
      if (inv.status === 'approved') { acc.approved_unconverted = true; approvedUnconv++ }
      else if (inv.status === 'posted') { acc.posted_unconverted = true; approvedUnconv++ }
      else recvAwaitUnconv++
    }
    if (isOverdue) { acc.overdue_count++; overdueInv++ }
    if (isDueSoon) { acc.due_soon_count++; dueSoonInv++ }
  }
  const actionable = Array.from(cases.values()).filter((c) => c.approved_unconverted || c.posted_unconverted || c.overdue_count > 0 || c.due_soon_count > 0)
  const severity = (r: any) => (r.approved_unconverted || r.posted_unconverted ? 1 : 0)
  actionable.sort((a, b) => {
    if (severity(a) !== severity(b)) return severity(b) - severity(a)
    if ((b.overdue_count > 0 ? 1 : 0) !== (a.overdue_count > 0 ? 1 : 0)) return (b.overdue_count > 0 ? 1 : 0) - (a.overdue_count > 0 ? 1 : 0)
    if ((b.due_soon_count > 0 ? 1 : 0) !== (a.due_soon_count > 0 ? 1 : 0)) return (b.due_soon_count > 0 ? 1 : 0) - (a.due_soon_count > 0 ? 1 : 0)
    const av = canViewAmounts ? a.unconverted_amount : a.unconverted_line_count
    const bv = canViewAmounts ? b.unconverted_amount : b.unconverted_line_count
    return bv - av
  })
  return {
    total_cases_with_action: actionable.length,
    total_unconverted_lines: totalLines,
    total_unconverted_amount: canViewAmounts ? r2(totalAmount) : null,
    overdue_invoice_count: overdueInv,
    due_soon_invoice_count: dueSoonInv,
    approved_with_unconverted_count: approvedUnconv,
    received_awaiting_unconverted_count: recvAwaitUnconv,
    actionable,
  }
}

const created: { table: string; id: string }[] = []
async function insert(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.from(table).insert(row).select('id').single()
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  created.push({ table, id: data.id }); return data.id as string
}
async function setLine(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('incoming_invoice_lines').update(patch).eq('id', id)
  if (error) throw new Error('update line: ' + error.message)
}
async function cleanup() {
  for (const table of ['incoming_invoice_lines', 'case_materials', 'incoming_invoices', 'service_cases']) {
    const ids = created.filter((c) => c.table === table).map((c) => c.id)
    if (ids.length) { const { error } = await supabase.from(table).delete().in('id', ids); if (error) console.log(`  ⚠️  oprydning ${table}: ${error.message}`) }
  }
}
async function mkInv(caseId: string, status: string, n: string, due: string | null) {
  return insert('incoming_invoices', { source: 'manual', status, matched_case_id: caseId, supplier_name_extracted: `Lev ${n}`, invoice_number: `OE95-${n}`, invoice_date: '2026-06-01', due_date: due, currency: 'DKK' })
}
async function mkLine(invId: string, ln: number, price: number) {
  return insert('incoming_invoice_lines', { incoming_invoice_id: invId, line_number: ln, description: `linje ${ln}`, total_price: price })
}
async function convertLine(caseId: string, lineId: string) {
  const mat = await insert('case_materials', { case_id: caseId, description: 'konv', quantity: 1, unit_cost: 1, source: 'supplier_invoice' })
  await setLine(lineId, { converted_case_material_id: mat, converted_at: '2026-06-02T10:00:00Z' })
}

async function main() {
  console.log('\n=== SMOKE Ø9.5: porteføljevidt indkøbsdrift ===\n')
  let A = '', B = '', C = '', D = '', E = '', F = ''
  try {
    A = await insert('service_cases', { title: 'Ø9.5 SMOKE A', status: 'in_progress' })
    B = await insert('service_cases', { title: 'Ø9.5 SMOKE B', status: 'in_progress' })
    C = await insert('service_cases', { title: 'Ø9.5 SMOKE C', status: 'in_progress' })
    D = await insert('service_cases', { title: 'Ø9.5 SMOKE D', status: 'in_progress' })
    E = await insert('service_cases', { title: 'Ø9.5 SMOKE E', status: 'in_progress' })
    F = await insert('service_cases', { title: 'Ø9.5 SMOKE F', status: 'in_progress' })

    // A: approved m. 2 ukonv. (100,200) + rejected m. 1 ukonv. (777, ekskluderes)
    const a1 = await mkInv(A, 'approved', 'A1', isoPlus(60)); await mkLine(a1, 1, 100); await mkLine(a1, 2, 200)
    const a2 = await mkInv(A, 'rejected', 'A2', isoPlus(60)); await mkLine(a2, 1, 777)
    // B: posted m. 1 ukonv. (50)
    const b1 = await mkInv(B, 'posted', 'B1', isoPlus(60)); await mkLine(b1, 1, 50)
    // C: received m. 1 ukonv. (60)
    const c1 = await mkInv(C, 'received', 'C1', null); await mkLine(c1, 1, 60)
    // D: approved overdue, alle konverteret
    const d1 = await mkInv(D, 'approved', 'D1', isoPlus(-5)); const dl = await mkLine(d1, 1, 999); await convertLine(D, dl)
    // E: approved due_soon, alle konverteret
    const e1 = await mkInv(E, 'approved', 'E1', isoPlus(3)); const el = await mkLine(e1, 1, 888); await convertLine(E, el)
    // F: approved ok, alle konverteret
    const f1 = await mkInv(F, 'approved', 'F1', isoPlus(60)); const fl = await mkLine(f1, 1, 123); await convertLine(F, fl)

    const ids = [A, B, C, D, E, F]
    console.log('Med kost-permission:')
    const r = await compute(ids, true)
    assert(r.total_cases_with_action === 4, `4 sager med handling (A,B,D,E) (fik ${r.total_cases_with_action})`)
    assert(r.total_unconverted_lines === 4, `4 ukonverterede linjer i alt (A2+B1+C1) (fik ${r.total_unconverted_lines})`)
    assert(r.total_unconverted_amount === 410, `beløb = 410 (100+200+50+60) (fik ${r.total_unconverted_amount})`)
    assert(r.overdue_invoice_count === 1, `1 forfalden faktura (D) (fik ${r.overdue_invoice_count})`)
    assert(r.due_soon_invoice_count === 1, `1 snart-forfalden (E) (fik ${r.due_soon_invoice_count})`)
    assert(r.approved_with_unconverted_count === 2, `2 approved/posted m. ukonv. (A,B) (fik ${r.approved_with_unconverted_count})`)
    assert(r.received_awaiting_unconverted_count === 1, `1 received m. ukonv. — separat (C) (fik ${r.received_awaiting_unconverted_count})`)
    assert(!r.actionable.find((c: any) => c.case_id === C), 'Sag C (received) IKKE i action-liste')
    assert(!r.actionable.find((c: any) => c.case_id === F), 'Sag F (alt konverteret, ok) IKKE i action-liste')
    const aRow = r.actionable.find((c: any) => c.case_id === A)
    assert(!!aRow && aRow.unconverted_line_count === 2 && aRow.unconverted_amount === 300, 'Sag A: rejected-linje ekskluderet (2 linjer / 300)')
    // sortering: drift først (A før D/E), overdue (D) før due_soon (E)
    const order = r.actionable.map((c: any) => c.case_id)
    assert(order.indexOf(A) < order.indexOf(D), 'sortering: drift (A) før forfald-only (D)')
    assert(order.indexOf(B) < order.indexOf(D), 'sortering: drift (B) før forfald-only (D)')
    assert(order.indexOf(D) < order.indexOf(E), 'sortering: overdue (D) før due_soon (E)')
    assert(order[0] === A, 'sortering: A først (drift + størst beløb)')

    console.log('\nUden kost-permission (cost-separation):')
    const r2res = await compute(ids, false)
    assert(r2res.total_unconverted_amount === null, 'total_unconverted_amount = null')
    assert(r2res.total_cases_with_action === 4, 'antal sager stadig synligt (4)')
    assert(r2res.overdue_invoice_count === 1, 'forfald-counts stadig synlige')
  } catch (e) {
    failures++; console.log(`\n  ❌ UVENTET FEJL: ${(e as Error).message}`)
  } finally {
    console.log('\nRydder testdata op…'); await cleanup(); console.log('  ✅ oprydning færdig')
  }
  console.log(`\n=== RESULTAT: ${passes} bestået, ${failures} fejlet ===\n`)
  process.exit(failures > 0 ? 1 : 0)
}
main()
