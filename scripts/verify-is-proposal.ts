/**
 * Read-only verifikation af 00123-migration.
 * Tjekker om kolonnen is_proposal findes paa service_cases og offers
 * ved at SELECTe den. Hvis kolonnen mangler, faar vi en specifik fejl.
 *
 * Koer: npx tsx scripts/verify-is-proposal.ts
 */

import { createClient } from '@supabase/supabase-js'
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing env')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

async function check(table: string) {
  const { data, error } = await supabase
    .from(table)
    .select('id, is_proposal')
    .limit(1)
  if (error) {
    if (error.message.includes('is_proposal') || error.code === '42703') {
      console.log(`❌ ${table}.is_proposal: MANGLER (${error.message})`)
      return false
    }
    console.log(`?  ${table}: query fejlede med uventet fejl: ${error.message}`)
    return false
  }
  console.log(`✅ ${table}.is_proposal: FINDES (sample row id=${data?.[0]?.id ?? '(tom)'}, is_proposal=${data?.[0]?.is_proposal ?? 'n/a'})`)
  return true
}

async function main() {
  console.log('\n=== VERIFY 00123 — is_proposal kolonne ===\n')
  const a = await check('service_cases')
  const b = await check('offers')
  console.log()
  if (a && b) {
    console.log('Migration 00123 er KOERT. Klar til commit 3b.')
  } else {
    console.log('Migration 00123 er IKKE koert. Kør den via:')
    console.log('  - Supabase SQL Editor: indhold af supabase/migrations/00123_is_proposal_flag.sql')
    console.log('  - eller POST /api/admin/setup-db med CRON_SECRET')
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
