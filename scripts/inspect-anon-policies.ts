/**
 * Lister alle anon-policies + grants paa tabeller relateret til portal-flow.
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
const token = process.env.SUPABASE_ACCESS_TOKEN!
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]

async function query(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) { console.error('Query failed:', res.status, await res.text()); return null }
  return await res.json()
}

const TABLES = [
  'customers', 'service_cases', 'offers', 'offer_line_items',
  'offer_signatures', 'portal_messages', 'profiles', 'company_settings',
  'customer_documents', 'fuldmagter', 'company_settings',
]

async function main() {
  console.log('\n=== ANON-POLICIES + GRANTS PR. PORTAL-RELEVANT TABEL ===\n')

  for (const t of TABLES) {
    const policies = await query(`
      SELECT policyname, cmd, roles::text, qual, with_check
      FROM pg_policies WHERE tablename = '${t}' AND 'anon' = ANY(roles)
      ORDER BY policyname;
    `)
    const grants = await query(`
      SELECT privilege_type FROM information_schema.role_table_grants
      WHERE table_name = '${t}' AND grantee = 'anon';
    `)

    const policyCount = policies ? policies.length : 0
    const grantTypes = (grants ?? []).map((g: any) => g.privilege_type).join(', ')

    console.log(`▸ ${t}`)
    console.log(`  Anon-policies (${policyCount}):`)
    for (const p of (policies ?? [])) {
      const usesPortalToken = String(p.qual ?? '').toLowerCase().includes('portal_access_tokens')
      const marker = usesPortalToken ? '  [via portal_access_tokens]' : ''
      console.log(`    - ${p.policyname} (cmd=${p.cmd})${marker}`)
      if (usesPortalToken) {
        console.log(`        qual: ${String(p.qual).substring(0, 200)}`)
      }
    }
    console.log(`  Anon-grants: ${grantTypes || '(ingen)'}`)
    console.log()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
