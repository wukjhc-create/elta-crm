/**
 * Sprint Ø9.4 — DB-smoke for ukonverterede leverandørfaktura-linjer pr. sag.
 *
 * Spejler data-laget i getServiceCaseUnconvertedSupplierLinesAction mod et
 * RIGTIGT Supabase-skema med ægte testdata. Permission-gaten testes statisk i
 * assert-oe9-4-security.ts (kræver auth-session).
 *
 * Scenarier:
 *   Sag A: invoice1(approved) 2 ukonv. + invoice2(received) 1 ukonv.
 *          + invoice3(approved) 1 konverteret-FK + 1 skip(converted_at)
 *          + invoice4(rejected) 1 ukonv. (skal EKSKLUDERES)
 *   Sag B: ingen fakturaer (tom-state)
 *   Sag C: 1 approved-faktura, alle linjer konverteret (tom-state)
 *
 * Kør:  npx tsx scripts/smoke-oe9-4-unconverted-lines.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

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
const ACTION = new Set(['approved', 'posted'])

let failures = 0, passes = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passes++; console.log(`  ✅ ${msg}`) }
  else { failures++; console.log(`  ❌ ${msg}`) }
}

// --- Spejling af action's data-lag (uden auth-gate) ---
async function compute(caseId: string, canViewAmounts: boolean) {
  const { data, error } = await supabase
    .from('incoming_invoices')
    .select(`id, status, invoice_number, invoice_date, due_date, currency, supplier_name_extracted,
      supplier:suppliers(name),
      lines:incoming_invoice_lines(total_price, converted_case_material_id, converted_case_other_cost_id, converted_at)`)
    .eq('matched_case_id', caseId)
    .order('invoice_date', { ascending: false, nullsFirst: false })
    .limit(50)
  if (error) throw new Error('query: ' + error.message)

  let totalLines = 0, totalAmount = 0, hasAction = false
  const invoices: any[] = []
  for (const inv of (data ?? []) as any[]) {
    if (DEAD.has(inv.status)) continue
    const lines = Array.isArray(inv.lines) ? inv.lines : []
    let uLines = 0, uAmount = 0
    for (const ln of lines) {
      const handled = !!ln.converted_case_material_id || !!ln.converted_case_other_cost_id || !!ln.converted_at
      if (!handled) { uLines++; uAmount += Number(ln.total_price ?? 0) }
    }
    if (uLines === 0) continue
    const actionRequired = ACTION.has(inv.status)
    if (actionRequired) hasAction = true
    totalLines += uLines; totalAmount += uAmount
    invoices.push({ id: inv.id, status: inv.status, unconverted_line_count: uLines, unconverted_amount: canViewAmounts ? uAmount : null, action_required: actionRequired })
  }
  invoices.sort((a, b) => (a.action_required !== b.action_required ? (a.action_required ? -1 : 1) : 0))
  return {
    unconverted_line_count: totalLines,
    unconverted_invoice_count: invoices.length,
    total_unconverted_amount: canViewAmounts ? totalAmount : null,
    has_action_required: hasAction,
    invoices,
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
    if (ids.length) {
      const { error } = await supabase.from(table).delete().in('id', ids)
      if (error) console.log(`  ⚠️  oprydning ${table}: ${error.message}`)
    }
  }
}

async function mkInvoice(caseId: string, status: string, n: string) {
  return insert('incoming_invoices', {
    source: 'manual', status, matched_case_id: caseId,
    supplier_name_extracted: `Smoke Lev ${n}`, invoice_number: `OE94-${n}`,
    invoice_date: '2026-06-01', due_date: '2026-06-15', currency: 'DKK',
  })
}
async function mkLine(invId: string, ln: number, price: number) {
  return insert('incoming_invoice_lines', { incoming_invoice_id: invId, line_number: ln, description: `linje ${ln}`, total_price: price })
}

async function main() {
  console.log('\n=== SMOKE Ø9.4: ukonverterede leverandørlinjer pr. sag ===\n')
  try {
    // ---- Sag A ----
    const caseA = await insert('service_cases', { title: 'Ø9.4 SMOKE A', status: 'in_progress' })
    const inv1 = await mkInvoice(caseA, 'approved', 'A1'); await mkLine(inv1, 1, 100); await mkLine(inv1, 2, 200)
    const inv2 = await mkInvoice(caseA, 'received', 'A2'); await mkLine(inv2, 1, 50)
    const inv3 = await mkInvoice(caseA, 'approved', 'A3')
    const l3a = await mkLine(inv3, 1, 999); const l3b = await mkLine(inv3, 2, 888)
    // konverteret via FK til et ægte case_material
    const mat = await insert('case_materials', { case_id: caseA, description: 'konv mat', quantity: 1, unit_cost: 999, source: 'supplier_invoice' })
    await setLine(l3a, { converted_case_material_id: mat, converted_at: '2026-06-02T10:00:00Z' })
    // eksplicit skip: converted_at sat uden FK
    await setLine(l3b, { converted_at: '2026-06-02T10:00:00Z' })
    const inv4 = await mkInvoice(caseA, 'rejected', 'A4'); await mkLine(inv4, 1, 777)

    console.log('Sag A (blanding):')
    const a = await compute(caseA, true)
    assert(a.unconverted_line_count === 3, `3 ukonverterede linjer (L1,L2,L3) (fik ${a.unconverted_line_count})`)
    assert(a.unconverted_invoice_count === 2, `2 fakturaer med ukonv. (inv1,inv2) (fik ${a.unconverted_invoice_count})`)
    assert(a.total_unconverted_amount === 350, `beløb = 350 (100+200+50) (fik ${a.total_unconverted_amount})`)
    assert(a.has_action_required === true, 'approved inv1 → has_action_required=true')
    const ai1 = a.invoices.find((i) => i.id === inv1)
    const ai2 = a.invoices.find((i) => i.id === inv2)
    assert(!!ai1 && ai1.action_required === true, 'inv1 (approved) action_required=true')
    assert(!!ai2 && ai2.action_required === false, 'inv2 (received) action_required=false')
    assert(!a.invoices.find((i) => i.id === inv3), 'inv3 (alle håndteret: FK+skip) ekskluderet fra liste')
    assert(!a.invoices.find((i) => i.id === inv4), 'inv4 (rejected) ekskluderet helt')
    assert(a.invoices[0].action_required === true, 'liste sorteret: handlingskrævende først')
    // cost separation
    const aNoCost = await compute(caseA, false)
    assert(aNoCost.total_unconverted_amount === null, 'uden kost-permission: total_unconverted_amount=null')
    assert(aNoCost.invoices.every((i) => i.unconverted_amount === null), 'uden kost-permission: pr.-faktura beløb=null')
    assert(aNoCost.unconverted_line_count === 3, 'uden kost-permission: linje-antal stadig synligt')

    // ---- Sag B: ingen fakturaer ----
    const caseB = await insert('service_cases', { title: 'Ø9.4 SMOKE B', status: 'new' })
    console.log('\nSag B (ingen fakturaer):')
    const b = await compute(caseB, true)
    assert(b.unconverted_line_count === 0 && b.unconverted_invoice_count === 0, 'tom-state: 0 linjer / 0 fakturaer')
    assert(b.has_action_required === false, 'tom-state: ingen handling krævet')

    // ---- Sag C: alle linjer konverteret ----
    const caseC = await insert('service_cases', { title: 'Ø9.4 SMOKE C', status: 'in_progress' })
    const invC = await mkInvoice(caseC, 'approved', 'C1'); const lc = await mkLine(invC, 1, 123)
    const matC = await insert('case_materials', { case_id: caseC, description: 'konv', quantity: 1, unit_cost: 123, source: 'supplier_invoice' })
    await setLine(lc, { converted_case_material_id: matC, converted_at: '2026-06-02T10:00:00Z' })
    console.log('\nSag C (alle konverteret):')
    const c = await compute(caseC, true)
    assert(c.unconverted_line_count === 0, 'tom-state: 0 ukonverterede (alle FK-konverteret)')
    assert(c.has_action_required === false, 'tom-state: ingen handling krævet')
  } catch (e) {
    failures++; console.log(`\n  ❌ UVENTET FEJL: ${(e as Error).message}`)
  } finally {
    console.log('\nRydder testdata op…'); await cleanup(); console.log('  ✅ oprydning færdig')
  }
  console.log(`\n=== RESULTAT: ${passes} bestået, ${failures} fejlet ===\n`)
  process.exit(failures > 0 ? 1 : 0)
}
main()
