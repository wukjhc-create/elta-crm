/**
 * Sprint Ø9.7 — paritets-harness: JS-orakel vs DB-RPC get_purchase_operations_page.
 *
 * Beviser at den nye SQL-funktion (migration 00151) producerer NØJAGTIG samme
 * resultat som den nuværende in-memory aggregering for HELE matricen af
 * reason-filtre, sorteringer, pagination, søgning, leverandørfilter og
 * kost-on/off — så vi trygt kan swappe scanPurchaseOps ud.
 *
 * Orakel = NY spec (Ø9.7-beslutninger): søge-blob inkluderer invoice_number, og
 * truncated er altid false. (Den gamle adfærd dækkes fortsat af
 * smoke-oe9-6-purchase-ops-page.ts som regression.)
 *
 * Scoping: både orakel og RPC begrænses til fixturens case_ids (orakel via
 * .in('matched_case_id', ids); RPC via p_case_ids) → deterministisk mod prod.
 *
 * Kør:  npx tsx scripts/smoke-oe9-7-purchase-ops-rpc-parity.ts
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

// --- token-helpers (skal matche server-action V2 + SQL) ---
function escapeLike(t: string): string { return t.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_') }
function tokenize(search: string | undefined): { raw: string[]; escaped: string[] } {
  const s = (search ?? '').toString().trim().slice(0, 120).toLowerCase()
  const raw = s ? s.split(/\s+/).filter(Boolean) : []
  return { raw, escaped: raw.map(escapeLike) }
}

// =====================================================================
// JS-ORAKEL (ny spec) — bygger rows + summary + supplier_options, scoped.
// =====================================================================
type Row = {
  case_id: string; case_number: string | null; case_title: string | null; customer_label: string | null
  unconverted_line_count: number; unconverted_amount: number | null
  overdue_count: number; due_soon_count: number; received_awaiting_count: number
  latest_invoice_date: string | null; latest_due_date: string | null; earliest_due_date: string | null
  action_reasons: string[]; supplier_names: string[]; invoice_numbers: string[]
}
type Summary = {
  total_cases_with_action: number; total_unconverted_lines: number; total_unconverted_amount: number | null
  overdue_invoice_count: number; due_soon_invoice_count: number
  approved_with_unconverted_count: number; received_awaiting_unconverted_count: number
}

async function oracle(caseIds: string[], canViewAmounts: boolean): Promise<{ rows: Row[]; summary: Summary; supplierOptions: string[] }> {
  const { data, error } = await supabase
    .from('incoming_invoices')
    .select(`id, status, matched_case_id, invoice_number, invoice_date, due_date, currency, supplier_name_extracted,
      supplier:suppliers(name),
      lines:incoming_invoice_lines(total_price, converted_case_material_id, converted_case_other_cost_id, converted_at)`)
    .in('matched_case_id', caseIds)
    .in('status', ['approved', 'posted', 'received', 'awaiting_approval'])
  if (error) throw new Error('query: ' + error.message)

  const cases = new Map<string, any>()
  let totalUnconvLines = 0, totalUnconvAmount = 0, overdueInv = 0, dueSoonInv = 0, approvedUnconv = 0, recvAwaitUnconv = 0
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
    if (!acc) { acc = { case_id: inv.matched_case_id, unconverted_line_count: 0, unconverted_amount: 0, overdue_count: 0, due_soon_count: 0, received_awaiting_count: 0, approved_unconverted: false, posted_unconverted: false, latest_invoice_date: null, latest_due_date: null, earliest_due_date: null, suppliers: new Set<string>(), invoices: new Set<string>() }; cases.set(inv.matched_case_id, acc) }
    const supObj = Array.isArray(inv.supplier) ? inv.supplier[0] : inv.supplier
    const sName = supObj?.name ?? inv.supplier_name_extracted ?? null
    if (sName) acc.suppliers.add(sName)
    if (inv.invoice_number) acc.invoices.add(inv.invoice_number)
    if (uL > 0) {
      acc.unconverted_line_count += uL; acc.unconverted_amount += uA
      totalUnconvLines += uL; totalUnconvAmount += uA
      if (inv.status === 'approved') { acc.approved_unconverted = true; approvedUnconv++ }
      else if (inv.status === 'posted') { acc.posted_unconverted = true; approvedUnconv++ }
      else { acc.received_awaiting_count += 1; recvAwaitUnconv++ }
    }
    if (isOverdue) { acc.overdue_count++; overdueInv++ }
    if (isDueSoon) { acc.due_soon_count++; dueSoonInv++ }
    if ((inv.invoice_date ?? '') > (acc.latest_invoice_date ?? '')) acc.latest_invoice_date = inv.invoice_date
    if ((inv.due_date ?? '') > (acc.latest_due_date ?? '')) acc.latest_due_date = inv.due_date
    if (isPayment && inv.due_date) { if (acc.earliest_due_date == null || inv.due_date < acc.earliest_due_date) acc.earliest_due_date = inv.due_date }
  }
  // meta
  const meta = new Map<string, any>()
  const { data: cd } = await supabase.from('service_cases').select('id, case_number, title, customer:customers!customer_id(company_name)').in('id', caseIds)
  for (const c of (cd ?? []) as any[]) { const cu = Array.isArray(c.customer) ? c.customer[0] : c.customer; meta.set(c.id, { case_number: c.case_number, case_title: c.title, customer_label: cu?.company_name ?? null }) }

  const supplierSet = new Set<string>()
  const rows: Row[] = Array.from(cases.values()).map((c) => {
    const reasons: string[] = []
    if (c.approved_unconverted) reasons.push('approved_unconverted')
    if (c.posted_unconverted) reasons.push('posted_unconverted')
    if (c.overdue_count > 0) reasons.push('overdue')
    if (c.due_soon_count > 0) reasons.push('due_soon')
    const suppliers = Array.from(c.suppliers) as string[]
    suppliers.forEach((s) => supplierSet.add(s))
    const m = meta.get(c.case_id) ?? {}
    return {
      case_id: c.case_id, case_number: m.case_number ?? null, case_title: m.case_title ?? null, customer_label: m.customer_label ?? null,
      unconverted_line_count: c.unconverted_line_count, unconverted_amount: canViewAmounts ? r2(c.unconverted_amount) : null,
      overdue_count: c.overdue_count, due_soon_count: c.due_soon_count, received_awaiting_count: c.received_awaiting_count,
      latest_invoice_date: c.latest_invoice_date, latest_due_date: c.latest_due_date, earliest_due_date: c.earliest_due_date,
      action_reasons: reasons, supplier_names: suppliers, invoice_numbers: Array.from(c.invoices) as string[],
    }
  })
  const summary: Summary = {
    total_cases_with_action: rows.filter((r) => r.action_reasons.length > 0).length,
    total_unconverted_lines: totalUnconvLines,
    total_unconverted_amount: canViewAmounts ? r2(totalUnconvAmount) : null,
    overdue_invoice_count: overdueInv, due_soon_invoice_count: dueSoonInv,
    approved_with_unconverted_count: approvedUnconv, received_awaiting_unconverted_count: recvAwaitUnconv,
  }
  const supplierOptions = Array.from(supplierSet).sort((a, b) => a.localeCompare(b, 'da')).slice(0, 100)
  return { rows, summary, supplierOptions }
}

function matchesReason(r: Row, reason: string) {
  switch (reason) {
    case 'all': return true
    case 'action_required': return r.action_reasons.length > 0
    case 'approved_unconverted': return r.action_reasons.includes('approved_unconverted')
    case 'posted_unconverted': return r.action_reasons.includes('posted_unconverted')
    case 'overdue': return r.overdue_count > 0
    case 'due_soon': return r.due_soon_count > 0
    case 'received_awaiting_unconverted': return r.received_awaiting_count > 0
    default: return true
  }
}
function oracleFSP(rows: Row[], p: { reason?: string; search?: string; supplier?: string; sort?: string; page?: number; pageSize?: number; canViewAmounts?: boolean }) {
  const reason = p.reason ?? 'all', sort = p.sort ?? 'priority', pageSize = p.pageSize ?? 25
  let page = Math.max(1, p.page ?? 1)
  const tokens = tokenize(p.search).raw
  let f = rows.filter((r) => matchesReason(r, reason))
  if (p.supplier) { const sf = p.supplier.toLowerCase(); f = f.filter((r) => r.supplier_names.some((s) => s.toLowerCase() === sf)) }
  if (tokens.length) f = f.filter((r) => {
    // NY spec: blob inkluderer invoice_numbers
    const blob = [r.case_number, r.case_title, r.customer_label, ...r.supplier_names, ...r.invoice_numbers].filter(Boolean).join(' ').toLowerCase()
    return tokens.every((t) => blob.includes(t))
  })
  const sev = (r: Row) => (r.action_reasons.includes('approved_unconverted') || r.action_reasons.includes('posted_unconverted') ? 1 : 0)
  const cid = (a: Row, b: Row) => a.case_id.localeCompare(b.case_id) // deterministisk tie-break (matcher SQL)
  if (sort === 'amount') f.sort((a, b) => { const d = (b.unconverted_amount ?? b.unconverted_line_count) - (a.unconverted_amount ?? a.unconverted_line_count); return d !== 0 ? d : cid(a, b) })
  else if (sort === 'newest_invoice') f.sort((a, b) => { const d = (b.latest_invoice_date ?? '').localeCompare(a.latest_invoice_date ?? ''); return d !== 0 ? d : cid(a, b) })
  else if (sort === 'due_date') f.sort((a, b) => { const ad = a.earliest_due_date, bd = b.earliest_due_date; let d = 0; if (ad && bd) d = ad.localeCompare(bd); else if (ad) d = -1; else if (bd) d = 1; return d !== 0 ? d : cid(a, b) })
  else f.sort((a, b) => { if (sev(a) !== sev(b)) return sev(b) - sev(a); if ((b.overdue_count > 0 ? 1 : 0) !== (a.overdue_count > 0 ? 1 : 0)) return (b.overdue_count > 0 ? 1 : 0) - (a.overdue_count > 0 ? 1 : 0); if ((b.due_soon_count > 0 ? 1 : 0) !== (a.due_soon_count > 0 ? 1 : 0)) return (b.due_soon_count > 0 ? 1 : 0) - (a.due_soon_count > 0 ? 1 : 0); const av = a.unconverted_amount ?? a.unconverted_line_count, bv = b.unconverted_amount ?? b.unconverted_line_count; if (bv !== av) return bv - av; return cid(a, b) })
  const total_count = f.length, total_pages = Math.max(1, Math.ceil(total_count / pageSize))
  if (page > total_pages) page = total_pages
  const start = (page - 1) * pageSize
  return { items: f.slice(start, start + pageSize), total_count, total_pages, page }
}

// =====================================================================
// RPC-kald
// =====================================================================
async function rpc(caseIds: string[], p: { reason?: string; search?: string; supplier?: string; sort?: string; page?: number; pageSize?: number; canViewAmounts?: boolean }) {
  const pageSize = p.pageSize ?? 25
  const page = Math.max(1, p.page ?? 1)
  const { data, error } = await supabase.rpc('get_purchase_operations_page', {
    p_today: todayIso,
    p_can_view_amounts: !!p.canViewAmounts,
    p_reason: p.reason ?? 'all',
    p_supplier: p.supplier ?? null,
    p_search_tokens: p.search ? tokenize(p.search).escaped : null,
    p_sort: p.sort ?? 'priority',
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
    p_case_ids: caseIds,
  })
  if (error) throw new Error('rpc: ' + error.message)
  return data as any
}

// kanonisk projektion til sammenligning (rækkefølge bevaret for items)
function projItems(items: any[]): string {
  return JSON.stringify(items.map((r) => ({
    case_id: r.case_id, lc: r.unconverted_line_count, amt: r.unconverted_amount ?? null,
    od: r.overdue_count, ds: r.due_soon_count, ra: r.received_awaiting_count,
    ar: [...(r.action_reasons ?? [])], lid: r.latest_invoice_date ?? null, edd: r.earliest_due_date ?? null,
    sn: [...(r.supplier_names ?? [])].sort(),
  })))
}
function projSummary(s: any): string {
  return JSON.stringify({
    a: s.total_cases_with_action, b: s.total_unconverted_lines, c: s.total_unconverted_amount ?? null,
    d: s.overdue_invoice_count, e: s.due_soon_invoice_count, f: s.approved_with_unconverted_count, g: s.received_awaiting_unconverted_count,
  })
}

async function compareCase(ids: string[], label: string, p: any) {
  const { rows } = await oracle(ids, !!p.canViewAmounts)
  const exp = oracleFSP(rows, p)
  const got = await rpc(ids, p)
  const okItems = projItems(exp.items) === projItems(got.items ?? [])
  const okTotal = exp.total_count === (got.total_count ?? -1)
  assert(okItems && okTotal, `${label} — items+total (exp total=${exp.total_count}, rpc total=${got.total_count})`)
  if (!okItems) { console.log('     exp:', projItems(exp.items)); console.log('     got:', projItems(got.items ?? [])) }
}

// --- fixture-helpers (som smoke-oe9-6) ---
const created: { table: string; id: string }[] = []
async function insert(table: string, row: Record<string, unknown>): Promise<string> { const { data, error } = await supabase.from(table).insert(row).select('id').single(); if (error) throw new Error(`insert ${table}: ${error.message}`); created.push({ table, id: data.id }); return data.id as string }
async function setLine(id: string, patch: Record<string, unknown>) { const { error } = await supabase.from('incoming_invoice_lines').update(patch).eq('id', id); if (error) throw new Error('update line: ' + error.message) }
async function cleanup() { for (const t of ['incoming_invoice_lines', 'case_materials', 'incoming_invoices', 'service_cases']) { const ids = created.filter((c) => c.table === t).map((c) => c.id); if (ids.length) { const { error } = await supabase.from(t).delete().in('id', ids); if (error) console.log(`  ⚠️  oprydning ${t}: ${error.message}`) } } }
async function mkInv(caseId: string, status: string, n: string, due: string | null, supplier = 'Smoke Lev', invDate = '2026-06-01') { return insert('incoming_invoices', { source: 'manual', status, matched_case_id: caseId, supplier_name_extracted: supplier, invoice_number: n, invoice_date: invDate, due_date: due, currency: 'DKK' }) }
async function mkLine(invId: string, ln: number, price: number) { return insert('incoming_invoice_lines', { incoming_invoice_id: invId, line_number: ln, description: `linje ${ln}`, total_price: price }) }
async function convLine(caseId: string, lineId: string) { const mat = await insert('case_materials', { case_id: caseId, description: 'konv', quantity: 1, unit_cost: 1, source: 'supplier_invoice' }); await setLine(lineId, { converted_case_material_id: mat, converted_at: '2026-06-02T10:00:00Z' }) }

async function main() {
  console.log('\n=== PARITET Ø9.7: JS-orakel vs RPC get_purchase_operations_page ===\n')
  const ids: string[] = []
  try {
    // RPC findes?
    const probe = await supabase.rpc('get_purchase_operations_page', { p_today: todayIso, p_case_ids: ['00000000-0000-0000-0000-000000000000'] })
    if (probe.error) { console.log(`  ❌ RPC mangler/fejler: ${probe.error.message}\n  → kør migration 00151 først.`); process.exit(1) }

    // --- fixture: 12 kandidat-sager (som smoke-oe9-6) + ekstra invoice-nr-søgecase ---
    for (let i = 0; i < 4; i++) {
      const title = i === 0 ? 'ZZUNIKSØG titel' : `Ø9.7 approved ${i}`
      const c = await insert('service_cases', { title, status: 'in_progress' }); ids.push(c)
      const amt = i === 0 ? 5000 : 100 + i
      const supplier = i === 1 ? 'ZZUNIKLEVERANDØR' : 'Smoke Lev'
      const inv = await mkInv(c, 'approved', `OE97-AU${i}`, isoPlus(60), supplier); await mkLine(inv, 1, amt)
      if (i === 0) { const inv2 = await mkInv(c, 'rejected', `OE97-RJ${i}`, isoPlus(60)); await mkLine(inv2, 1, 999) }
    }
    for (let i = 0; i < 2; i++) { const c = await insert('service_cases', { title: `Ø9.7 posted ${i}`, status: 'in_progress' }); ids.push(c); const inv = await mkInv(c, 'posted', `OE97-PU${i}`, isoPlus(60)); await mkLine(inv, 1, 50) }
    for (let i = 0; i < 2; i++) { const c = await insert('service_cases', { title: `Ø9.7 overdue ${i}`, status: 'in_progress' }); ids.push(c); const inv = await mkInv(c, 'approved', `OE97-OD${i}`, isoPlus(-5)); const l = await mkLine(inv, 1, 200); await convLine(c, l) }
    for (let i = 0; i < 2; i++) { const c = await insert('service_cases', { title: `Ø9.7 duesoon ${i}`, status: 'in_progress' }); ids.push(c); const inv = await mkInv(c, 'approved', `OE97-DS${i}`, isoPlus(3)); const l = await mkLine(inv, 1, 300); await convLine(c, l) }
    for (let i = 0; i < 2; i++) { const c = await insert('service_cases', { title: `Ø9.7 received ${i}`, status: 'in_progress' }); ids.push(c); const inv = await mkInv(c, 'received', `OE97-RC${i}`, null); await mkLine(inv, 1, 60) }
    // ekstra sag med unikt fakturanr til invoice-nr-søgetest
    const cInv = await insert('service_cases', { title: 'Ø9.7 fakturanr-case', status: 'in_progress' }); ids.push(cInv)
    const invUnik = await mkInv(cInv, 'approved', 'ZZUNIKFAKTURANR', isoPlus(60)); await mkLine(invUnik, 1, 77)

    // --- paritets-matrix ---
    const reasons = ['all', 'action_required', 'approved_unconverted', 'posted_unconverted', 'overdue', 'due_soon', 'received_awaiting_unconverted']
    const sorts = ['priority', 'amount', 'due_date', 'newest_invoice']

    console.log('Reason × sort (pageSize=100, kost=on):')
    for (const reason of reasons) for (const sort of sorts) await compareCase(ids, `reason=${reason} sort=${sort}`, { reason, sort, pageSize: 100, canViewAmounts: true })

    console.log('\nPagination (reason=all, pageSize=5, sort=priority):')
    for (const page of [1, 2, 3, 99]) await compareCase(ids, `page=${page}`, { reason: 'all', sort: 'priority', pageSize: 5, page, canViewAmounts: true })

    console.log('\nSøgning + leverandørfilter (kost=on):')
    await compareCase(ids, 'search=ZZUNIKSØG', { reason: 'all', search: 'ZZUNIKSØG', pageSize: 100, canViewAmounts: true })
    await compareCase(ids, 'search=ZZUNIKLEVERANDØR', { reason: 'all', search: 'ZZUNIKLEVERANDØR', pageSize: 100, canViewAmounts: true })
    await compareCase(ids, 'supplier=ZZUNIKLEVERANDØR', { reason: 'all', supplier: 'ZZUNIKLEVERANDØR', pageSize: 100, canViewAmounts: true })

    console.log('\nKost=off (beløb null + amount-fallback til linjeantal):')
    for (const sort of sorts) await compareCase(ids, `kost=off sort=${sort}`, { reason: 'action_required', sort, pageSize: 100, canViewAmounts: false })

    console.log('\nGlobal summary + supplier_options (invariant ift. filter/side):')
    {
      const { summary, supplierOptions } = await oracle(ids, true)
      const got = await rpc(ids, { reason: 'overdue', sort: 'amount', pageSize: 5, page: 1, canViewAmounts: true })
      assert(projSummary(summary) === projSummary(got.summary), `summary matcher (exp=${projSummary(summary)})`)
      const gotSup = ((got.supplier_options ?? []) as string[]).slice().sort((a, b) => a.localeCompare(b, 'da')).slice(0, 100)
      assert(JSON.stringify(supplierOptions) === JSON.stringify(gotSup), 'supplier_options matcher (efter TS-sort+cap)')
      // kost=off → summary-beløb null
      const gotNoCost = await rpc(ids, { reason: 'all', pageSize: 5, canViewAmounts: false })
      assert(gotNoCost.summary.total_unconverted_amount === null, 'kost=off: summary.total_unconverted_amount = null')
      assert((gotNoCost.items ?? []).every((r: any) => r.unconverted_amount === null), 'kost=off: alle item-beløb = null')
      assert(got.truncated === false, 'truncated altid false (cap fjernet)')
    }

    console.log('\nNy adfærd: søgning på fakturanr (Ø9.7-delta vs gammel):')
    {
      const got = await rpc(ids, { reason: 'all', search: 'ZZUNIKFAKTURANR', pageSize: 100, canViewAmounts: true })
      assert((got.items ?? []).length === 1 && got.items[0].case_id === cInv, 'søgning på unikt fakturanr → præcis 1 sag')
    }
  } catch (e) {
    failures++; console.log(`\n  ❌ UVENTET FEJL: ${(e as Error).message}`)
  } finally {
    console.log('\nRydder testdata op…'); await cleanup(); console.log('  ✅ oprydning færdig')
  }
  console.log(`\n=== RESULTAT: ${passes} bestået, ${failures} fejlet ===\n`)
  process.exit(failures > 0 ? 1 : 0)
}
main()
