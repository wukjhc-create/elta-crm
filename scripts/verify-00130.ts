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
  console.log('\n=== VERIFY 00130 — portal_messages anon UPDATE lockdown ===\n')

  // 1. Policy droppet
  const targetPolicy = 'Anon can update portal message read status'
  const policies = await mgmt(`
    SELECT policyname FROM pg_policies
    WHERE tablename = 'portal_messages' AND policyname = '${targetPolicy}';
  `)
  if (policies && policies.length === 0) {
    console.log('1. Anon UPDATE-policy: DROPPET ✅')
  } else {
    console.log('1. Policy stadig aktiv ❌', policies)
  }

  // 2. Alle anon-grants vaek
  const grants = await mgmt(`
    SELECT privilege_type FROM information_schema.role_table_grants
    WHERE table_name = 'portal_messages' AND grantee = 'anon';
  `)
  if (grants && grants.length === 0) {
    console.log('2. Alle anon-grants: REVOKET ✅')
  } else {
    console.log('2. Anon-grants stadig aktive ❌', grants)
  }

  // 3. Resterende policies paa portal_messages
  const allPolicies = await mgmt(`
    SELECT policyname, cmd, roles::text FROM pg_policies
    WHERE tablename = 'portal_messages' ORDER BY policyname;
  `)
  console.log('\n3. Resterende policies paa portal_messages:')
  for (const p of (allPolicies ?? [])) {
    console.log(`   - ${p.policyname} (cmd=${p.cmd}, roles=${p.roles})`)
  }

  // 4. Admin smoke-test: SELECT portal_messages
  const { data: msgs, error: selErr } = await admin
    .from('portal_messages')
    .select('id, customer_id, sender_type, read_at')
    .limit(5)
  if (selErr) {
    console.log(`\n4. Admin SELECT portal_messages: ❌ ${selErr.message}`)
  } else {
    console.log(`\n4. Admin SELECT portal_messages: ✅ ${msgs?.length ?? 0} rows hentet`)
  }

  // 5. Find en employee-besked til at simulere markPortalMessagesAsRead-update
  const { data: target } = await admin
    .from('portal_messages')
    .select('id, customer_id, read_at, sender_type')
    .eq('sender_type', 'employee')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!target) {
    console.log('\n5. Ingen employee-besked til simulation — skipper UPDATE-test')
    return
  }

  const originalReadAt = target.read_at
  const newReadAt = new Date().toISOString()

  // 5a. Simuler den nye admin-baserede UPDATE med customer_id-scope
  const { error: updErr } = await admin
    .from('portal_messages')
    .update({ read_at: newReadAt })
    .in('id', [target.id])
    .eq('sender_type', 'employee')
    .eq('customer_id', target.customer_id)
  if (updErr) {
    console.log(`5. Admin UPDATE simulation: ❌ ${updErr.message}`)
  } else {
    console.log(`5. Admin UPDATE simulation: ✅ markeret som laest`)
  }

  // 5b. Roll tilbage til original tilstand
  const { error: revErr } = await admin
    .from('portal_messages')
    .update({ read_at: originalReadAt })
    .eq('id', target.id)
  if (revErr) {
    console.log(`6. Rollback til original read_at: ❌ ${revErr.message}`)
  } else {
    console.log(`6. Rollback til original read_at: ✅`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
