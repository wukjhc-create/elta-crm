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
  console.log('\n=== VERIFY 00129 — customer_documents anon lockdown ===\n')

  // 1. Drop'ede policies skal vaere vaek
  const targets = ['Portal users can view their documents', 'anon_select_customer_documents']
  const policies = await mgmt(`
    SELECT policyname FROM pg_policies
    WHERE tablename = 'customer_documents' AND policyname = ANY(ARRAY['${targets.join("','")}']);
  `)
  if (policies && policies.length === 0) {
    console.log('1. Begge anon SELECT-policies: DROPPET ✅')
  } else {
    console.log('1. Policies stadig aktive ❌', policies)
  }

  // 2. Alle anon-grants skal vaere vaek
  const grants = await mgmt(`
    SELECT privilege_type FROM information_schema.role_table_grants
    WHERE table_name = 'customer_documents' AND grantee = 'anon';
  `)
  if (grants && grants.length === 0) {
    console.log('2. Alle anon-grants: REVOKET ✅')
  } else {
    console.log('2. Anon-grants stadig aktive ❌', grants)
  }

  // 3. Resterende policies paa customer_documents (skal vaere authenticated + service_role)
  const allPolicies = await mgmt(`
    SELECT policyname, cmd, roles::text FROM pg_policies
    WHERE tablename = 'customer_documents' ORDER BY policyname;
  `)
  console.log('\n3. Resterende policies paa customer_documents:')
  for (const p of (allPolicies ?? [])) {
    console.log(`   - ${p.policyname} (cmd=${p.cmd}, roles=${p.roles})`)
  }

  // 4. Admin smoke-test: kan stadig SELECT'e fra customer_documents
  const { data: docs, error: docsErr } = await admin
    .from('customer_documents')
    .select('id, customer_id, title, document_type')
    .limit(3)
  if (docsErr) {
    console.log(`\n4. Admin SELECT customer_documents: ❌ ${docsErr.message}`)
  } else {
    console.log(`\n4. Admin SELECT customer_documents: ✅ ${docs?.length ?? 0} rows hentet`)
  }

  // 5. Admin smoke-test: company_settings (regression-tjek fra cron)
  const { data: cs, error: csErr } = await admin
    .from('company_settings')
    .select('reminder_enabled, reminder_interval_days, reminder_max_count')
    .limit(1)
    .maybeSingle()
  if (csErr) {
    console.log(`5. Admin SELECT company_settings: ❌ ${csErr.message}`)
  } else {
    console.log(`5. Admin SELECT company_settings: ✅ reminder_enabled=${cs?.reminder_enabled}, interval=${cs?.reminder_interval_days}, max=${cs?.reminder_max_count}`)
  }

  // 6. Cron-simulation: hent fuldmagt-dokumenter (samme query som offer-reminders L194)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 3)
  const { data: fuldmagter, error: fErr } = await admin
    .from('customer_documents')
    .select('id, customer_id, title, description, created_at')
    .eq('document_type', 'contract')
    .lt('created_at', cutoffDate.toISOString())
    .limit(5)
  if (fErr) {
    console.log(`6. Cron-query (fuldmagt-reminders) via admin: ❌ ${fErr.message}`)
  } else {
    console.log(`6. Cron-query (fuldmagt-reminders) via admin: ✅ ${fuldmagter?.length ?? 0} fuldmagt-kandidater`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
