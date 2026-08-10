/**
 * Verificer 00132: portal-attachments storage lockdown.
 *
 * 1. Begge anon-policies droppet
 * 2. Anon-grants paa storage.objects væk
 * 3. Authenticated + service_role policies bevares
 * 4. Admin kan stadig uploade + signedUrl mod portal-attachments
 * 5. Cleanup af testfil bagefter
 */

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

const accessToken = process.env.SUPABASE_ACCESS_TOKEN!
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function mgmt(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) { console.error(res.status, await res.text()); return null }
  return await res.json()
}

async function main() {
  console.log('\n=== VERIFY 00132 — portal-attachments storage lockdown ===\n')

  // 1. Begge anon-policies droppet
  const dropped = await mgmt(`
    SELECT policyname FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage'
      AND policyname IN ('portal_customers_upload_attachments', 'portal_customers_read_attachments');
  `)
  console.log(`1. Begge anon storage-policies droppet: ${dropped && dropped.length === 0 ? '✅' : '❌ ' + JSON.stringify(dropped)}`)

  // 2. Anon-grants vaek
  const grants = await mgmt(`
    SELECT privilege_type FROM information_schema.role_table_grants
    WHERE table_schema = 'storage' AND table_name = 'objects' AND grantee = 'anon';
  `)
  console.log(`2. Anon-grants paa storage.objects: ${grants && grants.length === 0 ? '✅ (ingen)' : '❌ ' + JSON.stringify(grants)}`)

  // 3. Resterende policies — skal indeholde authenticated + service_role
  const allPolicies = await mgmt(`
    SELECT policyname, cmd, roles::text AS roles FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage'
    ORDER BY policyname;
  `)
  console.log('\n3. Resterende policies paa storage.objects:')
  for (const p of (allPolicies ?? [])) {
    console.log(`   - ${p.policyname} (cmd=${p.cmd}, roles=${p.roles})`)
  }

  // 4. Authenticated + service_role grants bevaret
  const otherGrants = await mgmt(`
    SELECT grantee, COUNT(*)::int AS n FROM information_schema.role_table_grants
    WHERE table_schema = 'storage' AND table_name = 'objects' AND grantee IN ('authenticated', 'service_role')
    GROUP BY grantee ORDER BY grantee;
  `)
  console.log('\n4. Authenticated + service_role grants:')
  for (const g of (otherGrants ?? [])) {
    console.log(`   - ${g.grantee}: ${g.n} privileges`)
  }

  // 5. Find en gyldig kunde-id til upload-simulation
  const { data: customer } = await admin
    .from('customers')
    .select('id, company_name')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!customer) {
    console.log('\n5. Ingen kunde fundet — skipper upload-smoke-test')
    return
  }

  // 6. Admin upload + signedUrl + cleanup mod portal-attachments
  const testContent = Buffer.from('beta.1 verify test ' + new Date().toISOString())
  const testPath = `${customer.id}/${Date.now()}-verify-00132.txt`

  console.log(`\n5. Smoke-test mod portal-attachments (kunde ${customer.company_name}, path=${testPath})`)

  const { error: uplErr } = await admin.storage
    .from('portal-attachments')
    .upload(testPath, testContent, { contentType: 'text/plain', upsert: false })
  if (uplErr) {
    console.log(`  ❌ Admin upload: ${uplErr.message}`)
    return
  }
  console.log('  ✅ Admin upload OK')

  // SignedUrl
  const { data: urlData, error: urlErr } = await admin.storage
    .from('portal-attachments')
    .createSignedUrl(testPath, 60)
  if (urlErr || !urlData?.signedUrl) {
    console.log(`  ❌ Admin createSignedUrl: ${urlErr?.message}`)
  } else {
    console.log(`  ✅ Admin createSignedUrl OK (${urlData.signedUrl.substring(0, 80)}...)`)
  }

  // Verifier at signedUrl returnerer testindhold via fetch (anon)
  if (urlData?.signedUrl) {
    const r = await fetch(urlData.signedUrl)
    const text = await r.text()
    const match = text.includes('beta.1 verify test')
    console.log(`  ${match ? '✅' : '❌'} Signed URL retur returnerer testindhold (status ${r.status})`)
  }

  // Cleanup
  const { error: rmErr } = await admin.storage
    .from('portal-attachments')
    .remove([testPath])
  console.log(`  ${rmErr ? '❌ Cleanup: ' + rmErr.message : '✅ Testfil slettet'}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
