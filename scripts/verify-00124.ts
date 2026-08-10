/**
 * Verificer at 00124-migrationen er kørt:
 *   - Policy "Anon can log portal activities" findes ikke laengere
 *   - anon har ikke laengere INSERT-grant paa offer_activities
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

const token = process.env.SUPABASE_ACCESS_TOKEN!
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ref = url.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]

async function query(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) {
    console.error('Query failed:', res.status, await res.text())
    return null
  }
  return await res.json()
}

async function main() {
  console.log('\n=== VERIFY 00124 ===\n')

  const policies = await query(`
    SELECT policyname FROM pg_policies
    WHERE tablename = 'offer_activities' AND policyname = 'Anon can log portal activities';
  `)
  if (policies && policies.length === 0) {
    console.log('1. Anon-INSERT policy: DROPPET ✅')
  } else {
    console.log('1. Anon-INSERT policy STADIG AKTIV ❌', policies)
  }

  const grants = await query(`
    SELECT grantee, privilege_type FROM information_schema.role_table_grants
    WHERE table_name = 'offer_activities' AND grantee = 'anon';
  `)
  if (grants && Array.isArray(grants)) {
    const insertGrant = grants.find((g: any) => g.privilege_type === 'INSERT')
    if (!insertGrant) {
      console.log('2. Anon INSERT grant: REVOKET ✅')
    } else {
      console.log('2. Anon INSERT grant STADIG AKTIV ❌', grants)
    }
    console.log('   Resterende anon-grants paa offer_activities:', grants.map((g: any) => g.privilege_type).join(', ') || '(ingen)')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
