/**
 * Sprint Ø9.3 — DB-smoke for intern indkøb-vs-budget pr. sag.
 *
 * Verificerer at getServiceCasePurchaseSummary()'s data-lag (queries + filtre +
 * aggregering) er korrekt mod et RIGTIGT Supabase-skema, med ægte testdata:
 *
 *   Sag A:  1 konverteret materiale (lev.faktura) + 1 konverteret udlæg
 *           + 1 MANUELT materiale (skal EKSKLUDERES) + budget-reference
 *   Sag B:  ingen konverteringer (tom-state)
 *
 * Asserts: totaler, split-counts, supplier_breakdown, manuel-eksklusion,
 * budget-reference, tom-state. Rydder ALT testdata op til sidst.
 *
 * Permission-gaten (economy.cost_prices) testes statisk i
 * assert-oe9-3-security.ts — den kræver en auth-session og kan ikke køres her.
 *
 * Kør:  npx tsx scripts/smoke-oe9-3-purchase-economy.ts
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

const SUPPLIER_INVOICE_SOURCE = 'supplier_invoice'
const PURCHASE_UNKNOWN_SUPPLIER = 'Ukendt leverandør'

let failures = 0
let passes = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passes++; console.log(`  ✅ ${msg}`) }
  else { failures++; console.log(`  ❌ ${msg}`) }
}

// --- Spejling af getServiceCasePurchaseSummary's data-lag (uden auth-gate) ---
async function computePurchaseSummary(caseId: string) {
  const [matRes, othRes, sagRes] = await Promise.all([
    supabase.from('case_materials')
      .select('total_cost, supplier_name_snapshot, source_incoming_invoice_line_id')
      .eq('case_id', caseId).eq('source', SUPPLIER_INVOICE_SOURCE),
    supabase.from('case_other_costs')
      .select('total_cost, supplier_name, source_incoming_invoice_line_id')
      .eq('case_id', caseId).eq('source', SUPPLIER_INVOICE_SOURCE),
    supabase.from('service_cases').select('contract_sum, revised_sum, budget').eq('id', caseId).maybeSingle(),
  ])
  if (matRes.error) throw new Error('case_materials query: ' + matRes.error.message)
  if (othRes.error) throw new Error('case_other_costs query: ' + othRes.error.message)
  if (sagRes.error) throw new Error('service_cases query: ' + sagRes.error.message)

  const matRows = matRes.data ?? []
  const othRows = othRes.data ?? []
  const matTotal = matRows.reduce((s: number, r: any) => s + Number(r.total_cost ?? 0), 0)
  const othTotal = othRows.reduce((s: number, r: any) => s + Number(r.total_cost ?? 0), 0)

  const map = new Map<string, { supplier_name: string; material_cost: number; other_cost: number; total_cost: number; line_count: number }>()
  const bucket = (name: string | null) => {
    const key = (name ?? '').trim() || PURCHASE_UNKNOWN_SUPPLIER
    let b = map.get(key)
    if (!b) { b = { supplier_name: key, material_cost: 0, other_cost: 0, total_cost: 0, line_count: 0 }; map.set(key, b) }
    return b
  }
  for (const r of matRows as any[]) { const b = bucket(r.supplier_name_snapshot); const v = Number(r.total_cost ?? 0); b.material_cost += v; b.total_cost += v; b.line_count++ }
  for (const r of othRows as any[]) { const b = bucket(r.supplier_name); const v = Number(r.total_cost ?? 0); b.other_cost += v; b.total_cost += v; b.line_count++ }

  const sag = sagRes.data as any
  let budgetRef: number | null = null
  let budgetKind: string | null = null
  if (sag?.budget != null) { budgetRef = Number(sag.budget); budgetKind = 'budget' }
  else if (sag?.revised_sum != null) { budgetRef = Number(sag.revised_sum); budgetKind = 'contract' }
  else if (sag?.contract_sum != null) { budgetRef = Number(sag.contract_sum); budgetKind = 'contract' }

  return {
    supplier_material_cost_total: matTotal,
    supplier_other_cost_total: othTotal,
    supplier_purchase_total: matTotal + othTotal,
    converted_line_count: matRows.length + othRows.length,
    converted_material_count: matRows.length,
    converted_other_cost_count: othRows.length,
    supplier_breakdown: Array.from(map.values()).sort((a, b) => b.total_cost - a.total_cost),
    budget_reference: budgetRef,
    budget_reference_kind: budgetKind,
  }
}

const created: { table: string; id: string }[] = []
async function cleanup() {
  // FK-sikker rækkefølge: børn før forældre.
  const order = ['case_materials', 'case_other_costs', 'incoming_invoice_lines', 'incoming_invoices', 'service_cases']
  for (const table of order) {
    const ids = created.filter((c) => c.table === table).map((c) => c.id)
    if (!ids.length) continue
    const { error } = await supabase.from(table).delete().in('id', ids)
    if (error) console.log(`  ⚠️  oprydning ${table}: ${error.message}`)
  }
}

async function insert(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.from(table).insert(row).select('id').single()
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  created.push({ table, id: data.id })
  return data.id as string
}

async function main() {
  console.log('\n=== SMOKE Ø9.3: intern indkøb-vs-budget pr. sag ===\n')
  try {
    // ---- Sag A: med konverteringer + budget ----
    const caseA = await insert('service_cases', { title: 'Ø9.3 SMOKE A', status: 'in_progress', budget: 10000 })
    const inv = await insert('incoming_invoices', {
      source: 'manual', status: 'approved', matched_case_id: caseA,
      supplier_name_extracted: 'Smoke Grossist A', invoice_number: 'OE93-SMOKE-1',
      invoice_date: '2026-06-01', amount_incl_vat: 312.5, currency: 'DKK',
    })
    const line1 = await insert('incoming_invoice_lines', { incoming_invoice_id: inv, line_number: 1, description: 'Kabel', quantity: 2, unit_price: 100, total_price: 200 })
    const line2 = await insert('incoming_invoice_lines', { incoming_invoice_id: inv, line_number: 2, description: 'Fragt', quantity: 1, unit_price: 50, total_price: 50 })

    // Konverteret materiale (200) — leverandør A
    await insert('case_materials', {
      case_id: caseA, description: 'Kabel 3x1.5', quantity: 2, unit_cost: 100,
      source: SUPPLIER_INVOICE_SOURCE, source_incoming_invoice_line_id: line1,
      supplier_name_snapshot: 'Smoke Grossist A',
    })
    // Konverteret udlæg (50) — leverandør B
    await insert('case_other_costs', {
      case_id: caseA, category: 'fragt', description: 'Fragt', quantity: 1, unit_cost: 50,
      source: SUPPLIER_INVOICE_SOURCE, source_incoming_invoice_line_id: line2,
      supplier_name: 'Smoke Fragtmand B',
    })
    // MANUELT materiale (999) — skal EKSKLUDERES af source-filteret
    await insert('case_materials', {
      case_id: caseA, description: 'Manuel post', quantity: 1, unit_cost: 999, source: 'manual',
    })

    // ---- Sag B: ingen konverteringer ----
    const caseB = await insert('service_cases', { title: 'Ø9.3 SMOKE B', status: 'new' })

    // ---- Assertions: Sag A ----
    console.log('Sag A (med konverteringer):')
    const a = await computePurchaseSummary(caseA)
    assert(a.supplier_material_cost_total === 200, `materiale-total = 200 (fik ${a.supplier_material_cost_total})`)
    assert(a.supplier_other_cost_total === 50, `udlæg-total = 50 (fik ${a.supplier_other_cost_total})`)
    assert(a.supplier_purchase_total === 250, `indkøb i alt = 250 (fik ${a.supplier_purchase_total})`)
    assert(a.converted_material_count === 1, `materiale-antal = 1 (manuel ekskluderet) (fik ${a.converted_material_count})`)
    assert(a.converted_other_cost_count === 1, `udlæg-antal = 1 (fik ${a.converted_other_cost_count})`)
    assert(a.converted_line_count === 2, `linje-antal i alt = 2 (fik ${a.converted_line_count})`)
    assert(a.supplier_purchase_total !== 1249, 'manuelt materiale (999) er IKKE talt med')
    assert(a.supplier_breakdown.length === 2, `breakdown har 2 leverandører (fik ${a.supplier_breakdown.length})`)
    const supA = a.supplier_breakdown.find((b) => b.supplier_name === 'Smoke Grossist A')
    const supB = a.supplier_breakdown.find((b) => b.supplier_name === 'Smoke Fragtmand B')
    assert(!!supA && supA.material_cost === 200 && supA.other_cost === 0, 'breakdown: Grossist A = 200 materiale / 0 udlæg')
    assert(!!supB && supB.other_cost === 50 && supB.material_cost === 0, 'breakdown: Fragtmand B = 50 udlæg / 0 materiale')
    assert(a.supplier_breakdown[0].total_cost >= a.supplier_breakdown[1].total_cost, 'breakdown sorteret faldende på total')
    assert(a.budget_reference === 10000 && a.budget_reference_kind === 'budget', `budget-reference = 10000 / budget (fik ${a.budget_reference}/${a.budget_reference_kind})`)

    // ---- Assertions: Sag B (tom) ----
    console.log('\nSag B (tom-state):')
    const b = await computePurchaseSummary(caseB)
    assert(b.supplier_purchase_total === 0, `indkøb i alt = 0 (fik ${b.supplier_purchase_total})`)
    assert(b.converted_line_count === 0, `linje-antal = 0 (fik ${b.converted_line_count})`)
    assert(b.supplier_breakdown.length === 0, `breakdown tom (fik ${b.supplier_breakdown.length})`)
    assert(b.budget_reference === null, 'ingen budget-reference')
  } catch (e) {
    failures++
    console.log(`\n  ❌ UVENTET FEJL: ${(e as Error).message}`)
  } finally {
    console.log('\nRydder testdata op…')
    await cleanup()
    console.log('  ✅ oprydning færdig')
  }

  console.log(`\n=== RESULTAT: ${passes} bestået, ${failures} fejlet ===\n`)
  process.exit(failures > 0 ? 1 : 0)
}

main()
