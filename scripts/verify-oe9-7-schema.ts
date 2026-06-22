/**
 * Sprint Ø9.7 — read-only skema-verifikation FØR migration 00151 (RPC).
 *
 * CLAUDE.md DB-regel: aldrig antag kolonnetyper. Bekræfter de faktiske typer/
 * formater for de kolonner RPC'en aggregerer på:
 *   - incoming_invoices.invoice_date / due_date  (DATE forventet → 'YYYY-MM-DD')
 *   - incoming_invoice_lines.total_price          (NUMERIC → number/string)
 *   - matched_case_id                              (findes + UUID)
 *   - service_cases.customer_id-embed              (fler-FK → !customer_id virker)
 *
 * Kør:  npx tsx scripts/verify-oe9-7-schema.ts
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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function describe(label: string, val: unknown) {
  const t = val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val
  console.log(`  ${label}: ${t}  =  ${JSON.stringify(val)}`)
}

async function main() {
  console.log('\n=== SKEMA-VERIFIKATION (read-only) for migration 00151 ===\n')

  console.log('incoming_invoices (1 række):')
  const { data: inv, error: e1 } = await supabase
    .from('incoming_invoices')
    .select('id, status, matched_case_id, invoice_number, invoice_date, due_date, currency, supplier_name_extracted, supplier_id')
    .not('matched_case_id', 'is', null)
    .limit(1)
  if (e1) console.log('  ❌ ' + e1.message)
  else if (!inv?.length) console.log('  ⚠️  ingen rækker med matched_case_id (kan stadig læse skema fra ubundne)')
  else { const r = inv[0] as Record<string, unknown>; for (const k of Object.keys(r)) describe(k, r[k]) }

  // fallback hvis ingen matched_case_id-rækker: hent vilkårlig
  if (!inv?.length) {
    const { data: anyInv } = await supabase.from('incoming_invoices').select('id, status, matched_case_id, invoice_date, due_date, currency').limit(1)
    if (anyInv?.length) { const r = anyInv[0] as Record<string, unknown>; console.log('  (vilkårlig række:)'); for (const k of Object.keys(r)) describe(k, r[k]) }
  }

  console.log('\nincoming_invoice_lines (1 række):')
  const { data: lines, error: e2 } = await supabase
    .from('incoming_invoice_lines')
    .select('id, incoming_invoice_id, total_price, converted_case_material_id, converted_case_other_cost_id, converted_at')
    .limit(1)
  if (e2) console.log('  ❌ ' + e2.message)
  else if (!lines?.length) console.log('  ⚠️  ingen linjer fundet')
  else { const r = lines[0] as Record<string, unknown>; for (const k of Object.keys(r)) describe(k, r[k]) }

  console.log('\nservice_cases + customer-embed (!customer_id):')
  const { data: sc, error: e3 } = await supabase
    .from('service_cases')
    .select('id, case_number, title, customer_id, customer:customers!customer_id(company_name)')
    .limit(1)
  if (e3) console.log('  ❌ EMBED FEJLER: ' + e3.message)
  else if (!sc?.length) console.log('  ⚠️  ingen service_cases')
  else { const r = sc[0] as Record<string, unknown>; for (const k of Object.keys(r)) describe(k, r[k]) }

  console.log('\nFK-indeks-tjek: findes idx på incoming_invoice_lines(incoming_invoice_id)? (afgøres i migration via IF NOT EXISTS)')
  console.log('\n=== FÆRDIG ===\n')
  process.exit(0)
}
main()
