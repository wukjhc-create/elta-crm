/**
 * Sprint Ø1.2 — READ-ONLY verify for 00138 backfill. Pre + post.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv(file: string) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const k = m[1]; let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnv(resolve(__dirname, '..', '.env.local'))

const token = process.env.SUPABASE_ACCESS_TOKEN!
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
const TARGET = '5c9d467a-2648-404f-8117-36fde57ef469'

async function mgmt(sql: string): Promise<any[] | null> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) { console.error('FAIL', res.status, await res.text()); return null }
  return res.json()
}

async function main() {
  const label = process.argv[2] || 'CHECK'
  console.log(`\n=== Ø1.2 verify [${label}] ===\n`)

  const counts = await mgmt(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE end_time IS NOT NULL)::int AS closed,
      COUNT(*) FILTER (WHERE end_time IS NOT NULL
        AND (cost_rate_snapshot IS NULL OR sale_rate_snapshot IS NULL OR sale_amount IS NULL))::int AS closed_snapshot_null
    FROM time_logs;`)
  const c = counts?.[0]
  console.log(`time_logs total           = ${c?.total}`)
  console.log(`lukkede                   = ${c?.closed}`)
  console.log(`lukkede m. snapshot-NULL  = ${c?.closed_snapshot_null}`)

  const row = await mgmt(`
    SELECT cost_rate_snapshot, sale_rate_snapshot, sale_amount, cost_amount
    FROM time_logs WHERE id = '${TARGET}';`)
  const r = row?.[0]
  console.log(`\nTarget row ${TARGET}:`)
  console.log(`  cost_rate_snapshot = ${r?.cost_rate_snapshot}`)
  console.log(`  sale_rate_snapshot = ${r?.sale_rate_snapshot}`)
  console.log(`  sale_amount        = ${r?.sale_amount}`)
  console.log(`  cost_amount        = ${r?.cost_amount}`)
  console.log('')
}
main().catch((e) => { console.error(e); process.exit(1) })
