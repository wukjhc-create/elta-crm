/**
 * Generic migration runner via Supabase Management API.
 * Argument: migration filename (uden sti). Filen skal ligge i
 * supabase/migrations/.
 *
 * Eks: npx tsx scripts/run-migration.ts 00124_portal_anon_lockdown_alpha2_offer_activities.sql
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv(file: string) {
  try {
    const raw = readFileSync(file, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const k = m[1]
      let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnv(resolve(__dirname, '..', '.env.local'))

const token = process.env.SUPABASE_ACCESS_TOKEN
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const refMatch = url?.match(/https?:\/\/([^.]+)\.supabase\.co/)
const ref = refMatch?.[1]

if (!token || !ref) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL')
  process.exit(1)
}

const filename = process.argv[2]
if (!filename) {
  console.error('Usage: npx tsx scripts/run-migration.ts <filename>')
  process.exit(1)
}

const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', filename)
const sql = readFileSync(sqlPath, 'utf8')

async function main() {
  console.log(`\nRunning ${filename} against project ref: ${ref}\n`)
  console.log('SQL (first 400 chars):')
  console.log(sql.substring(0, 400) + (sql.length > 400 ? '...\n' : '\n'))

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  const text = await res.text()
  console.log('Response status:', res.status)
  console.log('Response body:', text)

  if (!res.ok) {
    console.error('\n❌ Migration FAILED')
    process.exit(1)
  }

  console.log('\n✅ Migration applied')
}

main().catch((e) => { console.error(e); process.exit(1) })
