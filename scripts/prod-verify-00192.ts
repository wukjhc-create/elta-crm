/**
 * PRODUCTION read-only: før/efter-tjek for migration 00192 (kost-/løndata-lockdown).
 *   npx tsx scripts/prod-verify-00192.ts pre|post
 * Kun metadata (privilegier, policies) + antal rækker — ingen data.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'
const COST: Array<[string, string[]]> = [
  ['offer_line_items', ['cost_price', 'supplier_cost_price_at_creation', 'supplier_margin_applied', 'margin_percentage']],
  ['supplier_products', ['cost_price', 'margin_percentage']],
  ['time_logs', ['cost_amount', 'cost_rate_snapshot']],
]
const PUBLIC_SAMPLE: Array<[string, string]> = [['offer_line_items', 'unit_price'], ['supplier_products', 'list_price'], ['time_logs', 'hours']]
const PROFILE_ALLOWED = ['full_name', 'phone', 'department', 'updated_at']
const PROFILE_BLOCKED = ['email', 'role', 'is_active', 'avatar_url', 'avatar_storage_path']

withProdReadOnly('prod-verify-00192', async (run) => {
  const checks: Array<[string, boolean, string]> = []
  const q = async (sql: string) => (await run(`SELECT json_build_object('v', (${sql})) r`))[0].r.v
  for (const [t, cols] of COST) {
    for (const c of cols) {
      const can = await q(`has_column_privilege('authenticated', 'public.${t}', '${c}', 'SELECT')`)
      checks.push([`authenticated kan ${mode === 'pre' ? '' : 'IKKE '}læse ${t}.${c}`, mode === 'pre' ? can === true : can === false, String(can)])
      const anon = await q(`has_column_privilege('anon', 'public.${t}', '${c}', 'SELECT')`)
      if (mode === 'post') checks.push([`anon kan ikke læse ${t}.${c}`, anon === false, String(anon)])
    }
  }
  for (const [t, c] of PUBLIC_SAMPLE) {
    const can = await q(`has_column_privilege('authenticated', 'public.${t}', '${c}', 'SELECT')`)
    checks.push([`authenticated kan læse ${t}.${c} (ikke-kost)`, can === true, String(can)])
    const ins = await q(`has_table_privilege('authenticated', 'public.${t}', 'INSERT')`)
    checks.push([`authenticated kan fortsat INSERT i ${t}`, ins === true, String(ins)])
  }
  const pol = await q(`(SELECT json_agg(policyname ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'work_order_profit' AND cmd = 'SELECT')`)
  checks.push([`work_order_profit SELECT-policy = ${mode === 'pre' ? 'select_authenticated' : 'select_cost_roles'}`,
    mode === 'pre' ? JSON.stringify(pol).includes('work_order_profit_select_authenticated') : JSON.stringify(pol) === '["work_order_profit_select_cost_roles"]', JSON.stringify(pol)])
  const ex = await q(`has_function_privilege('authenticated', 'public.calculate_work_order_profit(uuid)', 'EXECUTE')`)
  checks.push([`authenticated ${mode === 'pre' ? 'kan' : 'kan IKKE'} kalde calculate_work_order_profit`, mode === 'pre' ? ex === true : ex === false, String(ex)])
  for (const c of PROFILE_ALLOWED) {
    const can = await q(`has_column_privilege('authenticated', 'public.profiles', '${c}', 'UPDATE')`)
    checks.push([`profiles.${c} kan opdateres af bruger`, can === true, String(can)])
  }
  for (const c of PROFILE_BLOCKED) {
    const can = await q(`has_column_privilege('authenticated', 'public.profiles', '${c}', 'UPDATE')`)
    checks.push([`profiles.${c} ${mode === 'pre' ? 'kan' : 'kan IKKE'} opdateres af bruger`, mode === 'pre' ? can === true : can === false, String(can)])
  }
  const rows = await q(`json_build_object('offer_line_items', (SELECT count(*) FROM offer_line_items), 'supplier_products', (SELECT count(*) FROM supplier_products), 'time_logs', (SELECT count(*) FROM time_logs), 'work_order_profit', (SELECT count(*) FROM work_order_profit), 'profiles', (SELECT count(*) FROM profiles))`)
  for (const [k, v, note] of checks) console.log(`${v ? 'OK  ' : 'AFV '} ${k}${note ? `  (${note})` : ''}`)
  console.log(`rækker (uændret før/efter): ${JSON.stringify(rows)}`)
  const bad = checks.filter(([, v]) => !v).length
  console.log(bad ? `❌ ${bad} afvigelse(r) (${mode})` : `✅ ${checks.length} tjek som forventet (${mode})`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
