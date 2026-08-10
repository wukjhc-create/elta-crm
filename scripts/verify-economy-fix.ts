/**
 * Verificer at driftsfix til service-case-economy returnerer korrekte
 * faktureret-tal. Bruger sagen der ER fakturaer paa.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const raw = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) { let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v }
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const fmtKr = (n: any) => n == null ? '—' : new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2 }).format(Number(n)) + ' kr'

;(async () => {
  const caseId = 'b6557b85-5256-4722-aa4f-0a8709b2473a'

  // Gammel query (work_order_id)
  const { data: wos } = await s.from('work_orders').select('id').eq('case_id', caseId)
  const woIds = (wos ?? []).map((w: any) => w.id)
  const oldQuery = woIds.length === 0
    ? { data: [] }
    : await s.from('invoices').select('total_amount, amount_paid').in('work_order_id', woIds)

  // Ny query (case_id)
  const newQuery = await s.from('invoices').select('total_amount, amount_paid, status, invoice_number').eq('case_id', caseId)

  console.log('Test-sag:', caseId)
  console.log('\nGammel query (work_order_id):')
  console.log(`  Returnerede ${oldQuery.data?.length ?? 0} invoices`)
  const oldTotal = (oldQuery.data ?? []).reduce((s: number, i: any) => s + Number(i.total_amount ?? 0), 0)
  console.log(`  Faktureret total: ${fmtKr(oldTotal)} (FORKERT — viser 0 fordi work_order_id er null)`)

  console.log('\nNy query (case_id):')
  console.log(`  Returnerede ${newQuery.data?.length ?? 0} invoices`)
  for (const i of newQuery.data ?? []) {
    console.log(`    - ${i.invoice_number} status=${i.status} total=${fmtKr(i.total_amount)} paid=${fmtKr(i.amount_paid)}`)
  }
  const newTotal = (newQuery.data ?? []).reduce((s: number, i: any) => s + Number(i.total_amount ?? 0), 0)
  const newPaid = (newQuery.data ?? []).reduce((s: number, i: any) => s + Number(i.amount_paid ?? 0), 0)
  console.log(`  Faktureret total: ${fmtKr(newTotal)} (KORREKT)`)
  console.log(`  Heraf betalt:     ${fmtKr(newPaid)}`)

  // Tjek at intet andet sag mister data — find andre sager med work_order_id-invoices (burde være tom)
  console.log('\nKonsistens-tjek: invoices i prod med work_order_id IS NOT NULL:')
  const { count } = await s.from('invoices').select('id', { count: 'exact', head: true }).not('work_order_id', 'is', null)
  console.log(`  ${count ?? 0} invoices (hvis > 0: nogle gamle sager kan miste faktura-link efter fix)`)
})()
