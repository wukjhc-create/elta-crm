/**
 * Sprint Ø9.6 — DB-smoke for indkøbsdrift-side: filtre + server-side pagination.
 *
 * Spejler data-laget + filter/sort/pagination i getPurchaseOperationsPageAction
 * mod et RIGTIGT Supabase-skema med ægte testdata. Scoped til testsagernes id'er
 * (deterministisk mod prod-data). Permission-gaten testes statisk i
 * assert-oe9-6-security.ts.
 *
 * 12 kandidat-sager: 4 approved_unconverted, 2 posted_unconverted, 2 overdue,
 * 2 due_soon, 2 received_awaiting (+ rejected-faktura der skal ekskluderes).
 *
 * Kør:  npx tsx scripts/smoke-oe9-6-purchase-ops-page.ts
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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const DEAD = new Set(['rejected', 'cancelled'])
const PAYMENT = new Set(['approved', 'posted'])
let failures = 0, passes = 0
function assert(cond: boolean, msg: string) { if (cond) { passes++; console.log(`  ✅ ${msg}`) } else { failures++; console.log(`  ❌ ${msg}`) } }
const r2 = (n: number) => Math.round(n * 100) / 100
function isoPlus(days: number): string { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const todayIso = new Date().toISOString().slice(0, 10)

type Row = {
  case_id: string; case_number: string | null; case_title: string | null; customer_label: string | null
  unconverted_line_count: number; unconverted_amount: number | null
  overdue_count: number; due_soon_count: number; received_awaiting_count: number
  latest_invoice_date: string | null; earliest_due_date: string | null
  action_reasons: string[]; supplier_names: string[]
}

// --- spejling af scan + row-build, scoped ---
async function buildRows(caseIds: string[], canViewAmounts: boolean): Promise<Row[]> {
  const { data, error } = await supabase
    .from('incoming_invoices')
    .select(`id, status, matched_case_id, invoice_number, invoice_date, due_date, currency, supplier_name_extracted,
      supplier:suppliers(name),
      lines:incoming_invoice_lines(total_price, converted_case_material_id, converted_case_other_cost_id, converted_at)`)
    .in('matched_case_id', caseIds)
    .in('status', ['approved', 'posted', 'received', 'awaiting_approval'])
    .limit(3000)
  if (error) throw new Error('query: ' + error.message)

  const cases = new Map<string, any>()
  for (const inv of (data ?? []) as any[]) {
    if (!inv.matched_case_id || DEAD.has(inv.status)) continue
    const lines = Array.isArray(inv.lines) ? inv.lines : []
    let uL = 0, uA = 0
    for (const ln of lines) { const handled = !!ln.converted_case_material_id || !!ln.converted_case_other_cost_id || !!ln.converted_at; if (!handled) { uL++; uA += Number(ln.total_price ?? 0) } }
    const isPayment = PAYMENT.has(inv.status)
    const badge = isPayment ? incomingDueBadge(inv.due_date, todayIso) : 'ok'
    const isOverdue = badge === 'overdue', isDueSoon = badge === 'due_soon'
    if (uL === 0 && !isOverdue && !isDueSoon) continue
    let acc = cases.get(inv.matched_case_id)
    if (!acc) { acc = { case_id: inv.matched_case_id, unconverted_line_count: 0, unconverted_amount: 0, overdue_count: 0, due_soon_count: 0, received_awaiting_count: 0, approved_unconverted: false, posted_unconverted: false, latest_invoice_date: null, earliest_due_date: null, suppliers: new Set<string>() }; cases.set(inv.matched_case_id, acc) }
    const supObj = Array.isArray(inv.supplier) ? inv.supplier[0] : inv.supplier
    const sName = supObj?.name ?? inv.supplier_name_extracted ?? null
    if (sName) acc.suppliers.add(sName)
    if (uL > 0) {
      acc.unconverted_line_count += uL; acc.unconverted_amount += uA
      if (inv.status === 'approved') acc.approved_unconverted = true
      else if (inv.status === 'posted') acc.posted_unconverted = true
      else acc.received_awaiting_count += 1
    }
    if (isOverdue) acc.overdue_count++
    if (isDueSoon) acc.due_soon_count++
    if ((inv.invoice_date ?? '') > (acc.latest_invoice_date ?? '')) acc.latest_invoice_date = inv.invoice_date
    if (isPayment && inv.due_date) { if (acc.earliest_due_date == null || inv.due_date < acc.earliest_due_date) acc.earliest_due_date = inv.due_date }
  }
  // meta
  const meta = new Map<string, any>()
  const { data: cd } = await supabase.from('service_cases').select('id, case_number, title, customer:customers!customer_id(company_name)').in('id', caseIds)
  for (const c of (cd ?? []) as any[]) { const cu = Array.isArray(c.customer) ? c.customer[0] : c.customer; meta.set(c.id, { case_number: c.case_number, case_title: c.title, customer_label: cu?.company_name ?? null }) }

  return Array.from(cases.values()).map((c) => {
    const reasons: string[] = []
    if (c.approved_unconverted) reasons.push('approved_unconverted')
    if (c.posted_unconverted) reasons.push('posted_unconverted')
    if (c.overdue_count > 0) reasons.push('overdue')
    if (c.due_soon_count > 0) reasons.push('due_soon')
    const m = meta.get(c.case_id) ?? {}
    return {
      case_id: c.case_id, case_number: m.case_number ?? null, case_title: m.case_title ?? null, customer_label: m.customer_label ?? null,
      unconverted_line_count: c.unconverted_line_count, unconverted_amount: canViewAmounts ? r2(c.unconverted_amount) : null,
      overdue_count: c.overdue_count, due_soon_count: c.due_soon_count, received_awaiting_count: c.received_awaiting_count,
      latest_invoice_date: c.latest_invoice_date, earliest_due_date: c.earliest_due_date,
      action_reasons: reasons, supplier_names: Array.from(c.suppliers) as string[],
    }
  })
}

function isActionable(r: Row) { return r.action_reasons.length > 0 }
function matchesReason(r: Row, reason: string) {
  switch (reason) {
    case 'all': return true
    case 'action_required': return isActionable(r)
    case 'approved_unconverted': return r.action_reasons.includes('approved_unconverted')
    case 'posted_unconverted': return r.action_reasons.includes('posted_unconverted')
    case 'overdue': return r.overdue_count > 0
    case 'due_soon': return r.due_soon_count > 0
    case 'received_awaiting_unconverted': return r.received_awaiting_count > 0
    default: return true
  }
}
function filterSortPaginate(rows: Row[], p: { reason?: string; search?: string; supplier?: string; sort?: string; page?: number; pageSize?: number; canViewAmounts?: boolean }) {
  const reason = p.reason ?? 'all', sort = p.sort ?? 'priority', pageSize = p.pageSize ?? 25
  let page = Math.max(1, p.page ?? 1)
  const tokens = (p.search ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  let f = rows.filter((r) => matchesReason(r, reason))
  if (p.supplier) { const sf = p.supplier.toLowerCase(); f = f.filter((r) => r.supplier_names.some((s) => s.toLowerCase() === sf)) }
  if (tokens.length) f = f.filter((r) => { const blob = [r.case_number, r.case_title, r.customer_label, ...r.supplier_names].filter(Boolean).join(' ').toLowerCase(); return tokens.every((t) => blob.includes(t)) })
  const sev = (r: Row) => (r.action_reasons.includes('approved_unconverted') || r.action_reasons.includes('posted_unconverted') ? 1 : 0)
  if (sort === 'amount') f.sort((a, b) => (b.unconverted_amount ?? b.unconverted_line_count) - (a.unconverted_amount ?? a.unconverted_line_count))
  else if (sort === 'newest_invoice') f.sort((a, b) => (b.latest_invoice_date ?? '').localeCompare(a.latest_invoice_date ?? ''))
  else if (sort === 'due_date') f.sort((a, b) => { const ad = a.earliest_due_date, bd = b.earliest_due_date; if (ad && bd) return ad.localeCompare(bd); if (ad) return -1; if (bd) return 1; return 0 })
  else f.sort((a, b) => { if (sev(a) !== sev(b)) return sev(b) - sev(a); if ((b.overdue_count > 0 ? 1 : 0) !== (a.overdue_count > 0 ? 1 : 0)) return (b.overdue_count > 0 ? 1 : 0) - (a.overdue_count > 0 ? 1 : 0); if ((b.due_soon_count > 0 ? 1 : 0) !== (a.due_soon_count > 0 ? 1 : 0)) return (b.due_soon_count > 0 ? 1 : 0) - (a.due_soon_count > 0 ? 1 : 0); const av = a.unconverted_amount ?? a.unconverted_line_count, bv = b.unconverted_amount ?? b.unconverted_line_count; return bv - av })
  const total_count = f.length, total_pages = Math.max(1, Math.ceil(total_count / pageSize))
  if (page > total_pages) page = total_pages
  const start = (page - 1) * pageSize
  return { items: f.slice(start, start + pageSize), total_count, total_pages, page }
}

const created: { table: string; id: string }[] = []
async function insert(table: string, row: Record<string, unknown>): Promise<string> { const { data, error } = await supabase.from(table).insert(row).select('id').single(); if (error) throw new Error(`insert ${table}: ${error.message}`); created.push({ table, id: data.id }); return data.id as string }
async function setLine(id: string, patch: Record<string, unknown>) { const { error } = await supabase.from('incoming_invoice_lines').update(patch).eq('id', id); if (error) throw new Error('update line: ' + error.message) }
async function cleanup() { for (const t of ['incoming_invoice_lines', 'case_materials', 'incoming_invoices', 'service_cases']) { const ids = created.filter((c) => c.table === t).map((c) => c.id); if (ids.length) { const { error } = await supabase.from(t).delete().in('id', ids); if (error) console.log(`  ⚠️  oprydning ${t}: ${error.message}`) } } }
async function mkInv(caseId: string, status: string, n: string, due: string | null, supplier = 'Smoke Lev') { return insert('incoming_invoices', { source: 'manual', status, matched_case_id: caseId, supplier_name_extracted: supplier, invoice_number: `OE96-${n}`, invoice_date: '2026-06-01', due_date: due, currency: 'DKK' }) }
async function mkLine(invId: string, ln: number, price: number) { return insert('incoming_invoice_lines', { incoming_invoice_id: invId, line_number: ln, description: `linje ${ln}`, total_price: price }) }
async function convLine(caseId: string, lineId: string) { const mat = await insert('case_materials', { case_id: caseId, description: 'konv', quantity: 1, unit_cost: 1, source: 'supplier_invoice' }); await setLine(lineId, { converted_case_material_id: mat, converted_at: '2026-06-02T10:00:00Z' }) }

async function main() {
  console.log('\n=== SMOKE Ø9.6: indkøbsdrift filtre + pagination ===\n')
  const ids: string[] = []
  try {
    // 4 approved_unconverted (én med stort beløb + unik titel/leverandør til søgning)
    for (let i = 0; i < 4; i++) {
      const title = i === 0 ? 'ZZUNIKSØG titel' : `Ø9.6 approved ${i}`
      const c = await insert('service_cases', { title, status: 'in_progress' }); ids.push(c)
      const amt = i === 0 ? 5000 : 100 + i
      const supplier = i === 1 ? 'ZZUNIKLEVERANDØR' : 'Smoke Lev'
      const inv = await mkInv(c, 'approved', `AU${i}`, isoPlus(60), supplier); await mkLine(inv, 1, amt)
      if (i === 0) { const inv2 = await mkInv(c, 'rejected', `RJ${i}`, isoPlus(60)); await mkLine(inv2, 1, 999) } // rejected → ekskluderes
    }
    // 2 posted_unconverted
    for (let i = 0; i < 2; i++) { const c = await insert('service_cases', { title: `Ø9.6 posted ${i}`, status: 'in_progress' }); ids.push(c); const inv = await mkInv(c, 'posted', `PU${i}`, isoPlus(60)); await mkLine(inv, 1, 50) }
    // 2 overdue (approved, alt konverteret)
    for (let i = 0; i < 2; i++) { const c = await insert('service_cases', { title: `Ø9.6 overdue ${i}`, status: 'in_progress' }); ids.push(c); const inv = await mkInv(c, 'approved', `OD${i}`, isoPlus(-5)); const l = await mkLine(inv, 1, 200); await convLine(c, l) }
    // 2 due_soon (approved, alt konverteret)
    for (let i = 0; i < 2; i++) { const c = await insert('service_cases', { title: `Ø9.6 duesoon ${i}`, status: 'in_progress' }); ids.push(c); const inv = await mkInv(c, 'approved', `DS${i}`, isoPlus(3)); const l = await mkLine(inv, 1, 300); await convLine(c, l) }
    // 2 received_awaiting
    for (let i = 0; i < 2; i++) { const c = await insert('service_cases', { title: `Ø9.6 received ${i}`, status: 'in_progress' }); ids.push(c); const inv = await mkInv(c, 'received', `RC${i}`, null); await mkLine(inv, 1, 60) }

    const rows = await buildRows(ids, true)
    console.log('Filtre (med kost):')
    assert(rows.length === 12, `12 kandidat-sager i alt (fik ${rows.length})`)
    // action_required = alle actionable (drift ELLER forfald) = 10 (4 approved + 2 posted + 2 overdue + 2 due_soon); de 2 received-only er ikke actionable.
    assert(filterSortPaginate(rows, { reason: 'action_required', pageSize: 100 }).total_count === 10, 'action_required = 10 (drift + forfald)')
    assert(filterSortPaginate(rows, { reason: 'approved_unconverted', pageSize: 100 }).total_count === 4, 'approved_unconverted = 4')
    assert(filterSortPaginate(rows, { reason: 'posted_unconverted', pageSize: 100 }).total_count === 2, 'posted_unconverted = 2')
    assert(filterSortPaginate(rows, { reason: 'overdue', pageSize: 100 }).total_count === 2, 'overdue = 2')
    assert(filterSortPaginate(rows, { reason: 'due_soon', pageSize: 100 }).total_count === 2, 'due_soon = 2')
    assert(filterSortPaginate(rows, { reason: 'received_awaiting_unconverted', pageSize: 100 }).total_count === 2, 'received_awaiting = 2')
    assert(filterSortPaginate(rows, { reason: 'all', pageSize: 100 }).total_count === 12, 'all = 12')

    console.log('\nPagination (reason=all, pageSize=5):')
    const p1 = filterSortPaginate(rows, { reason: 'all', pageSize: 5, page: 1 })
    const p2 = filterSortPaginate(rows, { reason: 'all', pageSize: 5, page: 2 })
    const p3 = filterSortPaginate(rows, { reason: 'all', pageSize: 5, page: 3 })
    assert(p1.total_pages === 3 && p1.total_count === 12, 'total_pages=3, total_count=12')
    assert(p1.items.length === 5, 'side 1: 5 elementer')
    assert(p2.items.length === 5, 'side 2: 5 elementer')
    assert(p3.items.length === 2, 'side 3: 2 elementer')
    const overlap = p1.items.filter((a) => p2.items.some((b) => b.case_id === a.case_id)).length
    assert(overlap === 0, 'ingen overlap mellem side 1 og 2')
    const clamped = filterSortPaginate(rows, { reason: 'all', pageSize: 5, page: 99 })
    assert(clamped.page === 3, 'page clamps til total_pages (99 → 3)')

    console.log('\nSøgning + leverandørfilter:')
    assert(filterSortPaginate(rows, { reason: 'all', search: 'ZZUNIKSØG', pageSize: 100 }).total_count === 1, 'søgning på unik titel → 1')
    const supRes = filterSortPaginate(rows, { reason: 'all', supplier: 'ZZUNIKLEVERANDØR', pageSize: 100 })
    assert(supRes.total_count === 1, 'leverandørfilter → 1 sag')
    assert(filterSortPaginate(rows, { reason: 'all', search: 'ZZUNIKLEVERANDØR', pageSize: 100 }).total_count === 1, 'søgning på leverandørnavn → 1')

    console.log('\nSortering:')
    const byAmount = filterSortPaginate(rows, { reason: 'approved_unconverted', sort: 'amount', pageSize: 100 })
    assert(byAmount.items[0].unconverted_amount === 5000, 'sort=amount: største beløb (5000) først')
    const byPrio = filterSortPaginate(rows, { reason: 'all', sort: 'priority', pageSize: 100 })
    assert(byPrio.items[0].action_reasons.some((r) => r === 'approved_unconverted' || r === 'posted_unconverted'), 'sort=priority: drift først')
    const byDue = filterSortPaginate(rows, { reason: 'all', sort: 'due_date', pageSize: 100 }).items.filter((r) => r.earliest_due_date)
    assert(byDue.length >= 2 && byDue[0].earliest_due_date! <= byDue[1].earliest_due_date!, 'sort=due_date: tidligste forfald først')

    console.log('\nrejected-eksklusion + cost-separation:')
    const big = rows.find((r) => r.case_title === 'ZZUNIKSØG titel')
    assert(!!big && big.unconverted_line_count === 1 && big.unconverted_amount === 5000, 'rejected-linje (999) ekskluderet (1 linje / 5000)')
    const rowsNoCost = await buildRows(ids, false)
    assert(rowsNoCost.every((r) => r.unconverted_amount === null), 'uden kost: alle beløb = null')
    assert(filterSortPaginate(rowsNoCost, { reason: 'action_required', pageSize: 100 }).total_count === 10, 'uden kost: counts/filtre stadig korrekte (10)')
  } catch (e) {
    failures++; console.log(`\n  ❌ UVENTET FEJL: ${(e as Error).message}`)
  } finally {
    console.log('\nRydder testdata op…'); await cleanup(); console.log('  ✅ oprydning færdig')
  }
  console.log(`\n=== RESULTAT: ${passes} bestået, ${failures} fejlet ===\n`)
  process.exit(failures > 0 ? 1 : 0)
}
main()
