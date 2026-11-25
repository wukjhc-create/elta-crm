/**
 * 00254 parts-/publikumsfundament — PRODUCTION READ-ONLY før/efter-tjek (kun SELECT, kun antal/flag).
 *   npx tsx scripts/prod-verify-00254.ts pre    (før anvendelse: intet af 00254 findes, forudsætninger findes)
 *   npx tsx scripts/prod-verify-00254.ts post   (efter: struktur, nøgler, grants; 0 rækker; henvendelser uændrede)
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2]
if (mode !== 'pre' && mode !== 'post') { console.error('brug: pre | post'); process.exit(2) }

withProdReadOnly('prod-verify-00254', async (run) => {
  const [s] = await run(`SELECT json_build_object(
    'tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname IN ('parties','party_relationships','case_participants','external_publications')),
    'conv_cols', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name IN ('source_party_id','communication_class','communication_class_source')),
    'keys', (SELECT count(*) FROM permission_catalog WHERE permission IN ('parties.manage','portal.publish')),
    'pairs', (SELECT count(*) FROM role_permission_defaults WHERE permission IN ('parties.manage','portal.publish')),
    'prereq', (to_regprocedure('public.user_has_permission(text)') IS NOT NULL AND to_regprocedure('public.my_customer_scope_ids()') IS NOT NULL AND to_regprocedure('public.my_case_scope_ids()') IS NOT NULL AND to_regclass('public.conversations') IS NOT NULL),
    'fns', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('publish_external','revoke_external_publication','external_feed','party_can_be_audience','party_visible_to_me','case_visible_to_me','conversations_party_guard','party_relationships_guard','external_publications_guard')),
    'conversations', (SELECT count(*) FROM conversations),
    'catalog', (SELECT count(*) FROM permission_catalog)
  ) j`)
  const st = s.j as Record<string, number | boolean>
  console.log(`INFO  ${JSON.stringify(st)}`)
  const checks: Array<[string, boolean]> = []
  if (mode === 'pre') {
    checks.push(['forudsætninger (00238/00240/00249) findes', st.prereq === true])
    checks.push(['00254 ikke anvendt (0 tabeller, 0 kolonner, 0 nøgler, 0 funktioner)', st.tables === 0 && st.conv_cols === 0 && st.keys === 0 && st.fns === 0])
  } else {
    const [g] = await run(`SELECT json_build_object(
      'svc_publish', has_function_privilege('service_role', 'public.publish_external(text, uuid, uuid, text, text, text, uuid, text, uuid)', 'EXECUTE'),
      'auth_publish', has_function_privilege('authenticated', 'public.publish_external(text, uuid, uuid, text, text, text, uuid, text, uuid)', 'EXECUTE'),
      'anon_publish', has_function_privilege('anon', 'public.publish_external(text, uuid, uuid, text, text, text, uuid, text, uuid)', 'EXECUTE'),
      'auth_feed', has_function_privilege('authenticated', 'public.external_feed(text, uuid)', 'EXECUTE'),
      'anon_feed', has_function_privilege('anon', 'public.external_feed(text, uuid)', 'EXECUTE'),
      'svc_feed', has_function_privilege('service_role', 'public.external_feed(text, uuid)', 'EXECUTE'),
      'svc_other_fns', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('publish_external','revoke_external_publication','party_can_be_audience','party_visible_to_me','case_visible_to_me','conversations_party_guard','party_relationships_guard','external_publications_guard') AND has_function_privilege('service_role', oid, 'EXECUTE')),
      'anon_fns', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('publish_external','revoke_external_publication','external_feed','party_can_be_audience','party_visible_to_me','case_visible_to_me','conversations_party_guard','party_relationships_guard','external_publications_guard') AND has_function_privilege('anon', oid, 'EXECUTE')),
      'svc_pub_insert', has_table_privilege('service_role', 'public.external_publications', 'INSERT'),
      'auth_pub_insert', has_table_privilege('authenticated', 'public.external_publications', 'INSERT'),
      'anon_parties', has_table_privilege('anon', 'public.parties', 'SELECT'),
      'rls', (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.parties'::regclass, 'public.party_relationships'::regclass, 'public.case_participants'::regclass, 'public.external_publications'::regclass)),
      'rows', (SELECT (SELECT count(*) FROM parties) + (SELECT count(*) FROM party_relationships) + (SELECT count(*) FROM case_participants) + (SELECT count(*) FROM external_publications)),
      'conv_unclassified', (SELECT count(*) FROM conversations WHERE communication_class = 'unknown' AND communication_class_source = 'none')
    ) j`)
    const x = g.j as Record<string, number | boolean>
    console.log(`INFO  ${JSON.stringify(x)}`)
    checks.push(['struktur: 4 tabeller, 3 kolonner, 9 funktioner, 2 nøgler, 5 standardpar', st.tables === 4 && st.conv_cols === 3 && st.fns === 9 && st.keys === 2 && st.pairs === 5])
    checks.push(['publish_external: kun authenticated (ikke service_role/anon)', x.auth_publish === true && x.svc_publish === false && x.anon_publish === false])
    checks.push(['external_feed: kun service_role', x.svc_feed === true && x.auth_feed === false && x.anon_feed === false])
    checks.push(['funktions-ACL: service_role ingen af de 8 øvrige 00254-funktioner; anon ingen af de 9 (default privileges lukket)', x.svc_other_fns === 0 && x.anon_fns === 0])
    checks.push(['ingen direkte INSERT i external_publications (service_role/authenticated)', x.svc_pub_insert === false && x.auth_pub_insert === false])
    checks.push(['anon: ingen adgang til parties; RLS slået til', x.anon_parties === false && x.rls === true])
    checks.push(['ingen backfill: 0 rækker i de nye tabeller', x.rows === 0])
    checks.push(['alle eksisterende henvendelser står som unknown/none (ingen adfærdsændring)', x.conv_unclassified === st.conversations])
  }
  for (const [id, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}`)
  const failed = checks.filter(([, ok]) => !ok).length
  console.log(failed ? `❌ ${failed} af ${checks.length}` : `✅ ${checks.length} tjek — 00254 ${mode}`)
  process.exitCode = failed ? 1 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
