/**
 * Sprint Ø2.9 — backfill af time_logs rate-snapshots.
 *
 * Mål: lukkede time_logs hvor cost_rate_snapshot/sale_rate_snapshot/
 * cost_amount/sale_amount mangler. Backfill sker ved at "røre" pay_rate_type
 * (sat til COALESCE(pay_rate_type,'normal')) på netop disse rækker, hvilket
 * får rate-engine-triggeren (00142) til at genberegne snapshots konsistent.
 *
 * - Rører ALDRIG rækker der allerede har snapshots (immutabilitet).
 * - Default pay_rate_type = 'normal'.
 * - Rapporterer antal. Brug --apply for at udføre; ellers dry-run.
 *
 *   npx tsx scripts/backfill-time-log-rates.ts            (dry-run)
 *   npx tsx scripts/backfill-time-log-rates.ts --apply    (apply)
 */
import { readFileSync } from 'fs'; import { resolve } from 'path'
function le(f: string) { try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; const k = m[1]; let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (!process.env[k]) process.env[k] = v } } catch {} }
le(resolve(__dirname, '..', '.env.local'))
const t = process.env.SUPABASE_ACCESS_TOKEN!; const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
async function m(sql: string) { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) }); const b = await r.text(); if (!r.ok) { console.error('FAIL', r.status, b); process.exit(1) } try { return JSON.parse(b) } catch { return [] } }

const TARGET = `end_time IS NOT NULL AND (cost_rate_snapshot IS NULL OR sale_rate_snapshot IS NULL OR cost_amount IS NULL OR sale_amount IS NULL)`

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`\n=== Ø2.9 time_logs backfill (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`)

  const counts = (await m(`SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE end_time IS NOT NULL)::int AS closed,
    COUNT(*) FILTER (WHERE ${TARGET})::int AS target,
    COUNT(*) FILTER (WHERE end_time IS NOT NULL AND employee_id IS NULL)::int AS no_employee
    FROM time_logs`))[0]
  console.log(`time_logs total           = ${counts.total}`)
  console.log(`lukkede                   = ${counts.closed}`)
  console.log(`backfill-mål (snap NULL)  = ${counts.target}`)
  console.log(`lukkede uden employee     = ${counts.no_employee} (kan ikke beregnes → forbliver NULL)`)

  if (counts.target === 0) {
    console.log('\nIngen rækker at backfille. ✅\n')
    return
  }
  if (!apply) {
    console.log('\nDry-run: kør med --apply for at udføre.\n')
    return
  }

  // Trigger-drevet genberegning, kun på mål-rækker med gyldig employee.
  const res = await m(`UPDATE time_logs SET pay_rate_type = COALESCE(pay_rate_type, 'normal')
    WHERE ${TARGET} AND employee_id IS NOT NULL RETURNING id`)
  console.log(`\n✅ Backfilled ${res.length} rækker.`)

  const left = (await m(`SELECT COUNT(*) FILTER (WHERE ${TARGET})::int AS target FROM time_logs`))[0]
  console.log(`Resterende mål efter backfill = ${left.target}\n`)
}
main().catch((e) => { console.error(e); process.exit(1) })
