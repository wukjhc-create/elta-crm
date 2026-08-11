/**
 * Lister alle policies + grants paa tabeller givet via argument.
 * Eks: npx tsx scripts/list-table-policies.ts customer_documents company_settings
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
  if (!res.ok) { console.error(res.status, await res.text()); return null }
  return await res.json()
}

async function main() {
  const tables = process.argv.slice(2)
  if (tables.length === 0) {
    console.error('Usage: npx tsx scripts/list-table-policies.ts <table>...')
    process.exit(1)
  }

  for (const t of tables) {
    const policies = await query(`
      SELECT policyname, cmd, roles::text AS roles, qual, with_check
      FROM pg_policies WHERE tablename = '${t}'
      ORDER BY policyname;
    `)
    const grants = await query(`
      SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_name = '${t}' ORDER BY grantee, privilege_type;
    `)

    console.log(`\n=== ${t} ===`)
    console.log('Policies:')
    for (const p of (policies ?? [])) {
      const qual = p.qual ? String(p.qual).substring(0, 150).replace(/\s+/g, ' ') : '(true)'
      console.log(`  - ${p.policyname} | cmd=${p.cmd} | roles=${p.roles} | qual=${qual}`)
    }
    console.log('Grants:')
    const byRole = new Map<string, string[]>()
    for (const g of (grants ?? [])) {
      if (!byRole.has(g.grantee)) byRole.set(g.grantee, [])
      byRole.get(g.grantee)!.push(g.privilege_type)
    }
    for (const [role, privs] of byRole) {
      console.log(`  - ${role}: ${privs.join(', ')}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
