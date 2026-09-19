/**
 * Read-only verifikation af 00156_agent_core.
 *
 * Kan koeres BAADE som pre-flight (foer migration: forventer 0 tabeller) og
 * som post-migration (forventer 5 tabeller, RLS, grants, seed). Scriptet
 * skriver INTET — kun SELECT mod information_schema/pg_catalog.
 *
 *   npx tsx scripts/verify-00156.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const raw = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) { let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v }
}
const accessToken = process.env.SUPABASE_ACCESS_TOKEN!
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
async function q(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) { console.error('ERR', res.status, (await res.text()).slice(0, 200)); return null }
  return res.json()
}
const TABLES = ['agent_runs', 'agent_tasks', 'agent_actions', 'agent_action_approvals', 'agent_configs']

;(async () => {
  console.log('=== 1. Tabeller til stede ===')
  const t = await q(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name = ANY(ARRAY['${TABLES.join("','")}']) ORDER BY table_name;`)
  const found = (t ?? []).map((r: { table_name: string }) => r.table_name)
  console.log('  fundet:', found.join(', ') || '(ingen)')
  const preflight = found.length === 0
  console.log(preflight ? '  => PRE-FLIGHT: ingen tabeller endnu (klar til migration)' : `  => ${found.length}/5 tabeller`)
  if (preflight) { console.log('\n(pre-flight ok — koer migrationen, og koer dette script igen for post-verifikation)'); return }

  console.log('\n=== 2. RLS enabled paa alle 5 ===')
  const rls = await q(`SELECT relname, relrowsecurity FROM pg_class
    WHERE oid = ANY(ARRAY['public.${TABLES.join("'::regclass,'public.")}'::regclass]) ORDER BY relname;`)
  for (const r of rls ?? []) console.log(`  ${r.relname}: RLS=${r.relrowsecurity}`)

  console.log('\n=== 3. Ingen anon-grants ===')
  const anon = await q(`SELECT table_name, privilege_type FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee='anon' AND table_name = ANY(ARRAY['${TABLES.join("','")}']);`)
  console.log('  anon-grants:', (anon ?? []).length === 0 ? 'INGEN (korrekt)' : JSON.stringify(anon))

  console.log('\n=== 4. authenticated-grants (kun SELECT + approval-INSERT + config-INSERT/UPDATE) ===')
  const authg = await q(`SELECT table_name, privilege_type FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee='authenticated' AND table_name = ANY(ARRAY['${TABLES.join("','")}'])
    ORDER BY table_name, privilege_type;`)
  for (const r of authg ?? []) console.log(`  ${r.table_name}: ${r.privilege_type}`)

  console.log('\n=== 5. Seed: 7 configs, alle disabled + suggest ===')
  const cfg = await q(`SELECT count(*)::int AS n,
    count(*) FILTER (WHERE enabled)::int AS enabled_n,
    count(*) FILTER (WHERE safety_mode='suggest')::int AS suggest_n FROM agent_configs;`)
  console.log('  ', JSON.stringify(cfg?.[0]))

  console.log('\n=== 6. Kritiske funktioner + triggers ===')
  const fn = await q(`SELECT proname FROM pg_proc WHERE proname IN
    ('is_admin','agent_action_effective_approvals','agent_action_is_executable',
     'agent_enforce_approval_before_execute','agent_approvals_immutable') ORDER BY proname;`)
  console.log('  funktioner:', (fn ?? []).map((r: { proname: string }) => r.proname).join(', '))
  const trg = await q(`SELECT tgname FROM pg_trigger WHERE tgname IN
    ('trg_agent_actions_enforce_approval','trg_agent_approvals_immutable') ORDER BY tgname;`)
  console.log('  triggers:', (trg ?? []).map((r: { tgname: string }) => r.tgname).join(', '))

  console.log('\n=== 7. Function privileges: ingen PUBLIC/anon EXECUTE paa helpers ===')
  const acl = await q(`SELECT p.proname, r.rolname AS grantee
    FROM pg_proc p, aclexplode(p.proacl) a JOIN pg_roles r ON r.oid = a.grantee
    WHERE p.proname IN ('agent_action_effective_approvals','agent_action_is_executable','is_admin')
    ORDER BY p.proname, r.rolname;`)
  for (const r of acl ?? []) console.log(`  ${r.proname} -> ${r.grantee}`)

  console.log('\n(post-verifikation faerdig — se ovenfor. Guard-tests: scripts/test-00156-guards.sql)')
})().catch((e) => { console.error(e); process.exit(1) })
