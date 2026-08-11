/**
 * Read-only audit af Supabase storage:
 *  - buckets + public-flag
 *  - storage.objects policies pr. bucket
 *  - storage.buckets policies
 *  - role-grants paa storage-tabeller
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

async function query(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) { console.error(res.status, await res.text()); return null }
  return await res.json()
}

async function main() {
  console.log('\n=== STORAGE AUDIT ===\n')

  // ---- 1. Buckets ----
  const buckets = await query(`
    SELECT id, name, public, created_at, file_size_limit, allowed_mime_types
    FROM storage.buckets ORDER BY name;
  `)
  console.log('▸ Buckets:')
  for (const b of (buckets ?? [])) {
    console.log(`  - ${b.name} (public=${b.public}, file_size_limit=${b.file_size_limit}, mimes=${b.allowed_mime_types ?? 'all'})`)
  }

  // ---- 2. Policies paa storage.objects pr. bucket ----
  const policies = await query(`
    SELECT policyname, cmd, roles::text AS roles, qual
    FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage'
    ORDER BY policyname;
  `)
  console.log(`\n▸ Policies paa storage.objects (${policies?.length ?? 0}):`)
  for (const p of (policies ?? [])) {
    const qualSnippet = p.qual ? String(p.qual).replace(/\s+/g, ' ').substring(0, 180) : '(true)'
    console.log(`  - ${p.policyname} | cmd=${p.cmd} | roles=${p.roles}`)
    console.log(`      qual: ${qualSnippet}`)
  }

  // ---- 3. Policies paa storage.buckets ----
  const bucketPolicies = await query(`
    SELECT policyname, cmd, roles::text AS roles, qual
    FROM pg_policies WHERE tablename = 'buckets' AND schemaname = 'storage'
    ORDER BY policyname;
  `)
  console.log(`\n▸ Policies paa storage.buckets (${bucketPolicies?.length ?? 0}):`)
  for (const p of (bucketPolicies ?? [])) {
    const qualSnippet = p.qual ? String(p.qual).replace(/\s+/g, ' ').substring(0, 180) : '(true)'
    console.log(`  - ${p.policyname} | cmd=${p.cmd} | roles=${p.roles}`)
    console.log(`      qual: ${qualSnippet}`)
  }

  // ---- 4. Role-grants paa storage-tabeller ----
  const objGrants = await query(`
    SELECT grantee, privilege_type FROM information_schema.role_table_grants
    WHERE table_schema = 'storage' AND table_name = 'objects' AND grantee IN ('anon', 'authenticated', 'service_role')
    ORDER BY grantee, privilege_type;
  `)
  console.log('\n▸ Grants paa storage.objects:')
  const byRole = new Map<string, string[]>()
  for (const g of (objGrants ?? [])) {
    if (!byRole.has(g.grantee)) byRole.set(g.grantee, [])
    byRole.get(g.grantee)!.push(g.privilege_type)
  }
  for (const [role, privs] of byRole) {
    console.log(`  - ${role}: ${privs.join(', ')}`)
  }

  // ---- 5. Tael objekter pr. bucket ----
  const counts = await query(`
    SELECT bucket_id, COUNT(*)::int AS object_count
    FROM storage.objects GROUP BY bucket_id ORDER BY object_count DESC;
  `)
  console.log('\n▸ Objekt-count pr. bucket:')
  for (const c of (counts ?? [])) {
    console.log(`  - ${c.bucket_id}: ${c.object_count}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
