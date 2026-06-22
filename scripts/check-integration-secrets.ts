/**
 * Read-only inspektion (per CLAUDE.md DB-regel): bekraeft `integrations`-
 * skema og klassificér hvert secret-felt UDEN at laekke vaerdier.
 *
 *   npx tsx scripts/check-integration-secrets.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

function loadEnv(file: string) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  } catch {
    /* ignore */
  }
}
loadEnv(resolve(__dirname, '..', '.env.local'))

const ENC_PREFIX = 'enc:v1:'
const SECRET_FIELDS = [
  'api_key',
  'api_secret',
  'oauth_client_secret',
  'oauth_access_token',
  'oauth_refresh_token',
] as const

function classify(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'null'
  if (typeof v === 'string' && v.startsWith(ENC_PREFIX)) return 'krypteret'
  return 'KLARTEKST'
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1) SELECT * ... LIMIT 1 — bekraeft tabel + kolonner findes.
  const probe = await supabase.from('integrations').select('*').limit(1)
  if (probe.error) {
    console.error('FAIL:', probe.error.message)
    process.exit(1)
  }
  const cols = probe.data?.[0] ? Object.keys(probe.data[0]) : []
  console.log('\n=== integrations skema-probe (LIMIT 1) ===')
  console.log('raekke fundet:', probe.data?.length ?? 0)
  if (cols.length) {
    for (const f of SECRET_FIELDS) {
      console.log(`  kolonne ${f}: ${cols.includes(f) ? 'FINDES' : 'MANGLER'}`)
    }
  } else {
    console.log('(ingen raekker — kan ikke vise kolonner, men tabellen findes)')
  }

  // 2) Klassificér secrets pr. raekke (ingen vaerdier udskrives).
  const { data, error } = await supabase
    .from('integrations')
    .select(['id', 'name', ...SECRET_FIELDS].join(','))
  if (error) {
    console.error('FAIL:', error.message)
    process.exit(1)
  }
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
  console.log(`\n=== ${rows.length} integration(er) ===`)
  let plaintextFields = 0
  for (const r of rows) {
    const parts = SECRET_FIELDS.map((f) => `${f}=${classify(r[f])}`)
    SECRET_FIELDS.forEach((f) => {
      if (classify(r[f]) === 'KLARTEKST') plaintextFields++
    })
    console.log(`  [${r.id}] ${r.name}`)
    console.log(`     ${parts.join('  ')}`)
  }
  console.log(`\nKlartekst-felter der vil blive krypteret af backfill: ${plaintextFields}\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
