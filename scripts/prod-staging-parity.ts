/**
 * Skema-paritet STAGING ↔ PRODUCTION — READ ONLY på begge sider (prod: withProdReadOnly; staging: Management-API, kun
 * SELECT). Samme forespørgsler, samme normalisering (CR fjernes fra funktionskroppe) → kun reelle forskelle.
 *   npx tsx scripts/prod-staging-parity.ts [--json fil]
 * Sammenligner: tabeller (+RLS), kolonner (type/null/default), funktioner (krop/secdef/config/ACL/volatilitet), politikker
 * (public + storage), tabel-/kolonne-grants, indeks, constraints, triggere, views, enums, extensions, storage-buckets,
 * rettighedskatalog og rollestandarder. Ingen rækkeindhold ud — kun skemanøgler og hashes.
 */
import { writeFileSync } from 'fs'
import { withProdReadOnly } from './prod-readonly'
import { loadHarnessSecrets, assertRuntimeConfig, assertBootstrapConfig } from './test-harness/env-guard'

const Q: Record<string, string> = {
  tables: `SELECT c.relname AS k, c.relkind::text || '|rls=' || c.relrowsecurity::text || '|force=' || c.relforcerowsecurity::text AS h
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m') ORDER BY 1`,
  columns: `SELECT c.table_name || '.' || c.column_name AS k, c.data_type || '|' || c.udt_name || '|' || c.is_nullable || '|' ||
    coalesce(c.column_default, '') || '|' || coalesce(c.generation_expression, '') AS h
    FROM information_schema.columns c WHERE c.table_schema = 'public' ORDER BY 1`,
  functions: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS k,
    md5(replace(p.prosrc, chr(13), '')) || '|secdef=' || p.prosecdef::text || '|cfg=' || coalesce(array_to_string(p.proconfig, ','), '') ||
    '|vol=' || p.provolatile::text || '|ret=' || pg_get_function_result(p.oid) || '|acl=' || coalesce(array_to_string(p.proacl, ','), '') AS h
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') ORDER BY 1`,
  policies: `SELECT schemaname || '.' || tablename || '.' || policyname AS k, cmd || '|' || permissive || '|' || roles::text || '|' ||
    md5(coalesce(qual, '')) || '|' || md5(coalesce(with_check, '')) AS h
    FROM pg_policies WHERE schemaname IN ('public', 'storage') ORDER BY 1`,
  table_grants: `SELECT table_name || '.' || grantee AS k, string_agg(privilege_type, ',' ORDER BY privilege_type) AS h
    FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','service_role','PUBLIC')
    GROUP BY 1 ORDER BY 1`,
  column_acl: `SELECT c.relname || '.' || a.attname AS k, array_to_string(a.attacl, ',') AS h
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.relnamespace = 'public'::regnamespace AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL ORDER BY 1`,
  indexes: `SELECT tablename || '.' || indexname AS k, md5(indexdef) AS h FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`,
  constraints: `SELECT r.relname || '.' || con.conname AS k, md5(pg_get_constraintdef(con.oid)) AS h
    FROM pg_constraint con JOIN pg_class r ON r.oid = con.conrelid WHERE r.relnamespace = 'public'::regnamespace ORDER BY 1`,
  triggers: `SELECT c.relname || '.' || t.tgname AS k, md5(pg_get_triggerdef(t.oid)) || '|' || t.tgenabled::text AS h
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal ORDER BY 1`,
  views: `SELECT viewname AS k, md5(definition) AS h FROM pg_views WHERE schemaname = 'public' ORDER BY 1`,
  enums: `SELECT t.typname AS k, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS h
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typnamespace = 'public'::regnamespace GROUP BY 1 ORDER BY 1`,
  extensions: `SELECT extname AS k, extversion AS h FROM pg_extension ORDER BY 1`,
  buckets: `SELECT id AS k, public::text || '|' || coalesce(file_size_limit::text, '') || '|' || coalesce(array_to_string(allowed_mime_types, ','), '') AS h
    FROM storage.buckets ORDER BY 1`,
  permission_catalog: `SELECT permission AS k, '' AS h FROM public.permission_catalog ORDER BY 1`,
  role_permission_defaults: `SELECT role::text || '.' || permission AS k, '' AS h FROM public.role_permission_defaults ORDER BY 1`,
  migrations_table: `SELECT coalesce(to_regclass('supabase_migrations.schema_migrations')::text, '') AS k, '' AS h`,
}

type Snap = Record<string, Map<string, string>>

async function staging(): Promise<Snap> {
  const runtime = assertRuntimeConfig()
  const boot = assertBootstrapConfig(loadHarnessSecrets())
  const ref = runtime.url.match(/https?:\/\/([^.]+)\.supabase\.co/)![1]
  const out: Snap = {}
  for (const [sec, sql] of Object.entries(Q)) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${boot.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    })
    if (!r.ok) throw new Error(`staging ${sec}: ${r.status}`)
    out[sec] = new Map(((await r.json()) as Array<{ k: string; h: string }>).map((x) => [x.k, x.h]))
  }
  return out
}

const jsonIdx = process.argv.indexOf('--json')
withProdReadOnly('prod-staging-parity', async (run) => {
  const prod: Snap = {}
  for (const [sec, sql] of Object.entries(Q)) prod[sec] = new Map((await run(sql)).map((x) => [x.k as string, String(x.h)]))
  const stag = await staging()
  const report: Record<string, { stagingOnly: string[]; prodOnly: string[]; differ: Array<{ k: string; prod: string; staging: string }> }> = {}
  for (const sec of Object.keys(Q)) {
    const P = prod[sec], S = stag[sec]
    report[sec] = {
      stagingOnly: [...S.keys()].filter((k) => !P.has(k)),
      prodOnly: [...P.keys()].filter((k) => !S.has(k)),
      differ: [...P.keys()].filter((k) => S.has(k) && S.get(k) !== P.get(k)).map((k) => ({ k, prod: P.get(k)!, staging: S.get(k)! })),
    }
    const r = report[sec]
    console.log(`== ${sec}: prod ${P.size} · staging ${S.size} · kun staging ${r.stagingOnly.length} · kun prod ${r.prodOnly.length} · forskellige ${r.differ.length}`)
    for (const k of r.stagingOnly) console.log(`   KUN STAGING  ${k}`)
    for (const k of r.prodOnly) console.log(`   KUN PROD     ${k}`)
    for (const d of r.differ) console.log(`   FORSKEL      ${d.k}\n       prod:    ${d.prod}\n       staging: ${d.staging}`)
  }
  if (jsonIdx > 0) writeFileSync(String(process.argv[jsonIdx + 1]), JSON.stringify(report, null, 2))
})
