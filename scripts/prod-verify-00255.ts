/**
 * 00255 parter fase B — PRODUCTION READ-ONLY før/efter-tjek (kun SELECT, kun antal/flag).
 *   npx tsx scripts/prod-verify-00255.ts pre    (før: 00254 findes, 00255 ikke anvendt, 0 rækker)
 *   npx tsx scripts/prod-verify-00255.ts post   (efter: RPC'er + ACL, ingen direkte skrivning, CVR-indeks, rækker/F-1 uændret)
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2]
if (mode !== 'pre' && mode !== 'post') { console.error('brug: pre | post'); process.exit(2) }

const RPCS = ['create_party', 'update_party', 'ensure_register_party', 'set_party_relationship', 'end_party_relationship', 'add_case_participant', 'add_case_participant_for_register', 'end_case_participant']
const ALL_FNS_SQL = `(proname LIKE 'party\\_normalize%' OR proname LIKE '\\_party\\_%' OR proname IN (${RPCS.map((r) => `'${r}'`).join(',')}))`

withProdReadOnly('prod-verify-00255', async (run) => {
  const [s] = await run(`SELECT json_build_object(
    'prereq', to_regclass('public.parties') IS NOT NULL AND to_regprocedure('public.party_visible_to_me(uuid)') IS NOT NULL AND to_regprocedure('public.case_visible_to_me(uuid)') IS NOT NULL,
    'fns', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND ${ALL_FNS_SQL}),
    'vat_idx', to_regclass('public.parties_vat_uniq') IS NOT NULL,
    'vat_chk', (SELECT count(*) FROM pg_constraint WHERE conname = 'parties_vat_digits'),
    'write_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('parties','party_relationships','case_participants') AND cmd <> 'SELECT'),
    'select_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('parties','party_relationships','case_participants') AND cmd = 'SELECT'),
    'auth_write', has_table_privilege('authenticated', 'public.parties', 'INSERT') OR has_table_privilege('authenticated', 'public.parties', 'UPDATE') OR has_table_privilege('authenticated', 'public.parties', 'DELETE')
       OR has_table_privilege('authenticated', 'public.party_relationships', 'INSERT') OR has_table_privilege('authenticated', 'public.party_relationships', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.case_participants', 'INSERT') OR has_any_column_privilege('authenticated', 'public.case_participants', 'UPDATE'),
    'auth_select', has_table_privilege('authenticated', 'public.parties', 'SELECT') AND has_table_privilege('authenticated', 'public.party_relationships', 'SELECT') AND has_table_privilege('authenticated', 'public.case_participants', 'SELECT'),
    'parties', (SELECT count(*) FROM parties), 'rels', (SELECT count(*) FROM party_relationships), 'participants', (SELECT count(*) FROM case_participants),
    'pubs', (SELECT count(*) FROM external_publications),
    'conversations', (SELECT count(*) FROM conversations), 'conv_unclassified', (SELECT count(*) FROM conversations WHERE communication_class = 'unknown' AND communication_class_source = 'none' AND source_party_id IS NULL),
    'party_audit', (SELECT count(*) FROM audit_logs WHERE action LIKE 'party%' OR action LIKE 'case_participant%')
  ) j`)
  const st = s.j as Record<string, number | boolean>
  console.log(`INFO  ${JSON.stringify(st)}`)
  const checks: Array<[string, boolean]> = []
  checks.push(['forudsætning: 00254 (parties, party_visible_to_me, case_visible_to_me) findes', st.prereq === true])
  checks.push(['ingen rækker i partstabellerne/offentliggørelser (flag FRA → ingen brug)', st.parties === 0 && st.rels === 0 && st.participants === 0 && st.pubs === 0 && st.party_audit === 0])
  checks.push(['alle henvendelser stadig unknown/none uden kilde-part', st.conv_unclassified === st.conversations])
  if (mode === 'pre') {
    checks.push(['00255 ikke anvendt (0 funktioner, intet CVR-indeks; 6 skrivepolitikker + direkte grants fra 00254)', st.fns === 0 && st.vat_idx === false && st.vat_chk === 0 && st.write_policies === 6 && st.auth_write === true])
  } else {
    const [g] = await run(`SELECT json_build_object(
      'auth', (SELECT coalesce(json_agg(proname ORDER BY proname), '[]') FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND ${ALL_FNS_SQL} AND has_function_privilege('authenticated', oid, 'EXECUTE')),
      'anon', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND ${ALL_FNS_SQL} AND has_function_privilege('anon', oid, 'EXECUTE')),
      'svc', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND ${ALL_FNS_SQL} AND has_function_privilege('service_role', oid, 'EXECUTE')),
      'definer', (SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=public']) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND (proname LIKE '\\_party\\_%' OR proname IN (${RPCS.map((r) => `'${r}'`).join(',')})))
    ) j`)
    const x = g.j as { auth: string[]; anon: number; svc: number; definer: boolean }
    console.log(`INFO  ${JSON.stringify(x)}`)
    checks.push(['struktur: 16 funktioner, CVR-indeks + cifre-tjek', st.fns === 16 && st.vat_idx === true && st.vat_chk === 1])
    checks.push(['ingen direkte skrivning: 0 skrivepolitikker, authenticated uden INSERT/UPDATE/DELETE; 3 SELECT-politikker (D-1) bevaret', st.write_policies === 0 && st.auth_write === false && st.auth_select === true && st.select_policies === 3])
    checks.push(['funktions-ACL: authenticated KUN de 8 RPC\'er; anon og service_role ingen (default privileges lukket)', JSON.stringify(x.auth) === JSON.stringify([...RPCS].sort()) && x.anon === 0 && x.svc === 0])
    checks.push(['RPC\'er/hjælpere er SECURITY DEFINER med search_path=public', x.definer === true])
  }
  for (const [id, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}`)
  const failed = checks.filter(([, ok]) => !ok).length
  console.log(failed ? `❌ ${failed} af ${checks.length}` : `✅ ${checks.length} tjek — 00255 ${mode}`)
  process.exitCode = failed ? 1 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
