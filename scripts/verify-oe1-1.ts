/**
 * Verificer Sprint Ø1.1 (commit 1+2) mod prod-DB via Management API.
 *
 * Checks:
 *   00136 — kolonner cost_rate_snapshot / sale_rate_snapshot / sale_amount
 *           findes, er NUMERIC, nullable; eksisterende time_log er NULL i dem.
 *   00137 — funktion time_logs_set_cost_amount + trigger trg_time_logs_cost_amount
 *           findes; funktionsdefinitionen nævner alle tre snapshot-felter.
 *   Tællinger — time_logs total, lukkede (end_time NOT NULL).
 *
 * Read-only. Idempotent. Bruges både pre- og post-deploy.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

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

const accessToken = process.env.SUPABASE_ACCESS_TOKEN!
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]

async function mgmt(sql: string): Promise<any[] | null> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) { console.error('MGMT FAIL', res.status, await res.text()); return null }
  return await res.json()
}

let pass = 0, fail = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`)
  ok ? pass++ : fail++
}

async function main() {
  console.log('\n=== VERIFY Sprint Ø1.1 (00136 + 00137) ===\n')

  // --- 00136: kolonner ---
  console.log('00136 — kolonner på time_logs:')
  const cols = await mgmt(`
    SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='time_logs'
      AND column_name IN ('cost_rate_snapshot','sale_rate_snapshot','sale_amount')
    ORDER BY column_name;
  `)
  const byName = Object.fromEntries((cols ?? []).map(c => [c.column_name, c]))
  for (const name of ['cost_rate_snapshot', 'sale_rate_snapshot', 'sale_amount']) {
    const c = byName[name]
    check(`${name} findes`, !!c, c ? `${c.data_type}(${c.numeric_precision},${c.numeric_scale})` : 'MANGLER')
    if (c) check(`${name} nullable`, c.is_nullable === 'YES', `is_nullable=${c.is_nullable}`)
  }

  // Eksisterende time_logs: NULL i alle tre nye felter
  const nullRows = await mgmt(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE cost_rate_snapshot IS NULL
                              AND sale_rate_snapshot IS NULL
                              AND sale_amount IS NULL)::int AS all_null
    FROM time_logs;
  `)
  const nr = nullRows?.[0]
  check('eksisterende time_logs NULL i nye snapshot-felter',
    !!nr && nr.total === nr.all_null,
    nr ? `total=${nr.total}, all_null=${nr.all_null}` : 'query fail')

  // --- 00137: funktion + trigger ---
  console.log('\n00137 — funktion + trigger:')
  const fn = await mgmt(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='time_logs_set_cost_amount' AND n.nspname='public';
  `)
  const def: string = fn?.[0]?.def ?? ''
  check('funktion time_logs_set_cost_amount findes', !!def)
  check('funktion indeholder cost_rate_snapshot', def.includes('cost_rate_snapshot'))
  check('funktion indeholder sale_rate_snapshot', def.includes('sale_rate_snapshot'))
  check('funktion indeholder sale_amount', def.includes('sale_amount'))

  const trg = await mgmt(`
    SELECT t.tgname, p.proname AS funcname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE c.relname='time_logs' AND t.tgname='trg_time_logs_cost_amount' AND NOT t.tgisinternal;
  `)
  const tr = trg?.[0]
  check('trigger trg_time_logs_cost_amount findes', !!tr,
    tr ? `-> ${tr.funcname}()` : 'MANGLER')

  // --- Tællinger ---
  console.log('\nTællinger:')
  const counts = await mgmt(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE end_time IS NOT NULL)::int AS closed
    FROM time_logs;
  `)
  const cc = counts?.[0]
  console.log(`  time_logs total = ${cc?.total}`)
  console.log(`  lukkede (end_time NOT NULL) = ${cc?.closed}`)

  console.log(`\n=== RESULTAT: ${pass} ✅ / ${fail} ❌ ===\n`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
