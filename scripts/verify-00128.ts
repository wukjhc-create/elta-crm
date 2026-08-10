import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

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
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function mgmt(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) { console.error(res.status, await res.text()); return null }
  return await res.json()
}

async function main() {
  console.log('\n=== VERIFY 00128 ===\n')

  for (const t of ['company_settings', 'profiles']) {
    const policies = await mgmt(`SELECT policyname FROM pg_policies WHERE tablename = '${t}' AND 'anon' = ANY(roles);`)
    const grants = await mgmt(`SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name = '${t}' AND grantee = 'anon';`)
    const colGrants = await mgmt(`SELECT column_name, privilege_type FROM information_schema.role_column_grants WHERE table_name = '${t}' AND grantee = 'anon';`)

    const pCount = policies ? policies.length : 0
    const gTypes = (grants ?? []).map((g: any) => g.privilege_type).join(', ')
    const cgList = (colGrants ?? []).map((c: any) => `${c.column_name}:${c.privilege_type}`).join(', ')

    console.log(`▸ ${t}`)
    console.log(`  Anon-policies: ${pCount === 0 ? '✅ (ingen)' : `❌ ${policies?.map((p: any) => p.policyname).join(', ')}`}`)
    console.log(`  Anon-tabel-grants: ${gTypes ? `❌ ${gTypes}` : '✅ (ingen)'}`)
    console.log(`  Anon-kolonne-grants: ${cgList ? `❌ ${cgList}` : '✅ (ingen)'}`)
    console.log()
  }

  // Smoke-test: kan admin-client stadig SELECT'e company_settings?
  const { data: cs, error: csErr } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
  if (csErr) {
    console.log(`Smoke-test company_settings via admin: ❌ ${csErr.message}`)
  } else {
    console.log(`Smoke-test company_settings via admin: ✅ row id=${cs?.id ?? '(tom)'}, currency=${cs?.default_currency ?? 'n/a'}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
