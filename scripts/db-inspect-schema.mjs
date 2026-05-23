/**
 * Sprint 10B — Read-only schema-inspection.
 *
 * Bruger Supabase Management API (samme pattern som inspect-7e-schema.mjs)
 * til at koere SELECT mod information_schema / pg_catalog / pg_policies /
 * pg_indexes paa production.
 *
 * INGEN ALTER / CREATE / UPDATE / DELETE / DROP / INSERT.
 * INGEN secrets printes — kun query-resultater.
 */

import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]
const token = env.SUPABASE_ACCESS_TOKEN

if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN missing in .env.local')
  process.exit(1)
}

async function q(sql) {
  // Sikkerheds-guard: bloker alt der ikke er pure read-only.
  const norm = sql.toLowerCase().replace(/\s+/g, ' ')
  const banned = ['alter ', 'create ', 'update ', 'delete ', 'drop ', 'insert ', 'truncate ', 'grant ', 'revoke ', 'reindex ']
  for (const b of banned) {
    if (norm.includes(b)) {
      throw new Error(`Blocked non-readonly statement detected: ${b.trim()}`)
    }
  }

  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  return { status: r.status, text: await r.text() }
}

function section(title) {
  console.log(`\n\n========================================`)
  console.log(`== ${title}`)
  console.log(`========================================`)
}

// =====================================================
// Query 1: service_cases parti-roller + site-felter
// =====================================================
section('Query 1: service_cases parti + site columns')
console.log(
  (await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'service_cases' AND column_name IN ('customer_id','orderer_customer_id','end_customer_id','payer_customer_id','purchased_from_customer_id','purchase_source','billing_mode','site_customer_id','site_contact_id') ORDER BY column_name;`)).text
)

// =====================================================
// Query 2: customer_contacts full schema
// =====================================================
section('Query 2: customer_contacts columns (full schema)')
console.log(
  (await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_contacts' ORDER BY ordinal_position;`)).text
)

// =====================================================
// Query 3: customer_documents full schema
// =====================================================
section('Query 3: customer_documents columns (full schema)')
console.log(
  (await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_documents' ORDER BY ordinal_position;`)).text
)

// =====================================================
// Query 4: Foreign keys
// =====================================================
section('Query 4: Foreign keys on the three tables')
console.log(
  (await q(`SELECT tc.table_name, tc.constraint_name, kcu.column_name AS local_column, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column, rc.delete_rule FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name IN ('service_cases','customer_contacts','customer_documents') ORDER BY tc.table_name, tc.constraint_name;`)).text
)

// =====================================================
// Query 5: Indexes
// =====================================================
section('Query 5: Indexes on the three tables')
console.log(
  (await q(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('service_cases','customer_contacts','customer_documents') ORDER BY tablename, indexname;`)).text
)

// =====================================================
// Query 6: CHECK constraints
// =====================================================
section('Query 6: CHECK constraints')
console.log(
  (await q(`SELECT tc.table_name, tc.constraint_name, cc.check_clause FROM information_schema.table_constraints tc JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name AND tc.constraint_schema = cc.constraint_schema WHERE tc.table_schema = 'public' AND tc.table_name IN ('service_cases','customer_contacts','customer_documents') AND tc.constraint_type = 'CHECK' ORDER BY tc.table_name, tc.constraint_name;`)).text
)

// =====================================================
// Query 7: RLS policies
// =====================================================
section('Query 7: Row-Level Security policies')
console.log(
  (await q(`SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('service_cases','customer_contacts','customer_documents') ORDER BY tablename, cmd, policyname;`)).text
)

// =====================================================
// Query 8: Data snapshot (only if site fields exist — fail-soft)
// =====================================================
section('Query 8: Data snapshot — fill rate for new fields')
console.log(
  (await q(`SELECT 'service_cases' AS table_name, (SELECT COUNT(*) FROM service_cases) AS total_rows, (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='service_cases' AND column_name='site_customer_id') AS has_site_customer_col, (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='service_cases' AND column_name='site_contact_id') AS has_site_contact_col, (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='service_cases' AND column_name='orderer_customer_id') AS has_orderer_col, (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_contacts' AND column_name='role') AS contacts_has_role_col, (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_documents' AND column_name='service_case_id') AS docs_has_service_case_col;`)).text
)
