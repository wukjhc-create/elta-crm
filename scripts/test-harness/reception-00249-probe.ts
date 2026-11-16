/**
 * 00249 Henvendelser — staging-prøver (AI-receptionist fase 2).
 *   reception-00249-state   (read-only)     tabeller, politikker, grants, katalog, md5 af berørte tabeller
 *   reception-00249-probe   (ROLLBACK-ONLY) ÉN forespørgsel: migrationens krop → persona-/værn-tjek → rollback-blokken →
 *                                           bevis for at intet er tilbage → RAISE EXCEPTION (så ALT rulles tilbage)
 * Ingen personværdier ud — kun tjek-resultater, antal og md5.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const FILE = resolve(process.cwd(), 'supabase', 'migrations', '00249_henvendelser_backbone.sql')

export const STATE_00249_SQL = `SELECT json_build_object(
  'applied', to_regclass('public.conversations') IS NOT NULL,
  'tables', (SELECT json_agg(c.relname ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('conversations','conversation_items','conversation_actions','upload_requests')),
  'policies', (SELECT json_agg(tablename || ':' || policyname || ':' || cmd ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname='public' AND tablename IN ('conversations','conversation_items','conversation_actions','upload_requests')),
  'catalog', (SELECT count(*) FROM public.permission_catalog),
  'defaults', (SELECT count(*) FROM public.role_permission_defaults),
  'new_keys', (SELECT json_agg(permission ORDER BY permission) FROM public.permission_catalog WHERE permission LIKE 'conversations.%'),
  'anon_grants', (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name IN ('conversations','conversation_items','conversation_actions','upload_requests')),
  'token_hash_readable', (SELECT CASE WHEN to_regclass('public.upload_requests') IS NULL THEN NULL ELSE has_column_privilege('authenticated','public.upload_requests','token_hash','SELECT') END),
  'md5_core', (SELECT md5(string_agg(t || ':' || n, '|' ORDER BY t)) FROM (
     SELECT 'customers' t, count(*)::text n FROM public.customers UNION ALL SELECT 'service_cases', count(*)::text FROM public.service_cases
     UNION ALL SELECT 'customer_tasks', count(*)::text FROM public.customer_tasks UNION ALL SELECT 'customer_documents', count(*)::text FROM public.customer_documents
     UNION ALL SELECT 'incoming_emails', count(*)::text FROM public.incoming_emails) x)
) f`

/** Migrationens krop uden BEGIN/COMMIT (prøven kører i én implicit transaktion) */
export function migration00249Body(): string {
  const sql = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')
  const body = sql.slice(0, sql.indexOf('\n-- ROLLBACK'))
  return body.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
}

/** Den kommenterede ROLLBACK-blok (uden BEGIN/COMMIT), så prøven tester den tekst der faktisk køres */
export function rollback00249Sql(withTx = true): string {
  const sql = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')
  const tail = sql.slice(sql.indexOf('\n-- ROLLBACK'))
  const a = tail.indexOf('\n-- BEGIN;\n'), b = tail.indexOf('\n-- COMMIT;')
  if (a < 0 || b < a) throw new Error('00249: ROLLBACK-blokken mangler')
  const block = tail.slice(a + 1, b + '\n-- COMMIT;'.length).split('\n').map((l) => l.replace(/^-- ?/, '')).join('\n')
  return withTx ? block : block.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
}

export function migration00249Sql(): string {
  return readFileSync(FILE, 'utf8')
}

/**
 * Prøve-SQL. Personaer = aktive profiler pr. rolle UDEN rettigheds-overrides (så forventningen = rolle-standarden).
 * Hvert tjek kører som `authenticated` med JWT-claims for personaen i en undertransaktion; resultatet er 'ok', et antal
 * eller SQLSTATE. Til sidst køres rollback-blokken, og blokken slutter ALTID med RAISE EXCEPTION 'P249RESULT:…'.
 */
export function probe00249Sql(): string {
  return `${migration00249Body()}

CREATE FUNCTION pg_temp.p249(q text, uid uuid, r text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r)::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  EXECUTE 'SET LOCAL ROLE ' || r;
  IF q ILIKE 'select count%' OR q ILIKE 'with %' THEN EXECUTE q INTO n; RESET ROLE; RETURN n::text; END IF;
  EXECUTE q;
  RESET ROLE;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN SQLSTATE;
END $f$;

DO $probe$
DECLARE
  res jsonb := '{}'::jsonb;
  u_admin uuid; u_sl uuid; u_salg uuid; u_bog uuid; u_mont uuid;
  v_cust uuid; v_other_case uuid; v_conv_un uuid := gen_random_uuid(); v_conv_c uuid := gen_random_uuid();
  v_act uuid := gen_random_uuid(); v_up uuid := gen_random_uuid(); s text;
  pick text := 'SELECT p.id FROM public.profiles p WHERE p.is_active AND p.role = %L AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1';
BEGIN
  EXECUTE format(pick, 'admin') INTO u_admin;
  EXECUTE format(pick, 'serviceleder') INTO u_sl;
  EXECUTE format(pick, 'salg') INTO u_salg;
  EXECUTE format(pick, 'bogholderi') INTO u_bog;
  EXECUTE format(pick, 'montør') INTO u_mont;
  res := res || jsonb_build_object('personas', jsonb_build_object('admin', u_admin IS NOT NULL, 'serviceleder', u_sl IS NOT NULL, 'salg', u_salg IS NOT NULL, 'bogholderi', u_bog IS NOT NULL, 'montor', u_mont IS NOT NULL));
  SELECT id INTO v_cust FROM public.customers ORDER BY created_at LIMIT 1;
  SELECT id INTO v_other_case FROM public.service_cases WHERE customer_id IS DISTINCT FROM v_cust LIMIT 1;

  -- katalog/defaults
  res := res || jsonb_build_object('catalog_new', (SELECT count(*) FROM public.permission_catalog WHERE permission LIKE 'conversations.%'),
                                   'defaults_new', (SELECT count(*) FROM public.role_permission_defaults WHERE permission LIKE 'conversations.%'));

  -- admin: opret ukoblet + bekræftet henvendelse, item, handling
  res := res || jsonb_build_object('admin_insert_unmatched', pg_temp.p249(format($q$INSERT INTO public.conversations (id, channel, title, dedupe_key, first_at, last_at, created_by) VALUES (%L,'phone','P249 ukoblet','p249:un',now(),now(),%L)$q$, v_conv_un, u_admin), u_admin, 'authenticated'));
  res := res || jsonb_build_object('admin_insert_confirmed', pg_temp.p249(format($q$INSERT INTO public.conversations (id, channel, title, dedupe_key, first_at, last_at, created_by, customer_id, customer_match_state) VALUES (%L,'email','P249 bekræftet','p249:c',now(),now(),%L,%L,'confirmed')$q$, v_conv_c, u_admin, v_cust), u_admin, 'authenticated'));
  res := res || jsonb_build_object('admin_insert_item', pg_temp.p249(format($q$INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, source_table, occurred_at, dedupe_key, created_by) VALUES (%L,'phone','inbound','simulator','simulator',now(),'p249:item',%L)$q$, v_conv_un, u_admin), u_admin, 'authenticated'));
  res := res || jsonb_build_object('item_dedupe_23505', pg_temp.p249(format($q$INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, source_table, occurred_at, dedupe_key, created_by) VALUES (%L,'phone','inbound','simulator','simulator',now(),'p249:item',%L)$q$, v_conv_un, u_admin), u_admin, 'authenticated'));
  res := res || jsonb_build_object('admin_insert_action', pg_temp.p249(format($q$INSERT INTO public.conversation_actions (id, conversation_id, action_type, policy_outcome, state, actor, idempotency_key, created_by) VALUES (%L,%L,'create_task','auto','approved','ai_receptionist','p249:a',%L)$q$, v_act, v_conv_un, u_admin), u_admin, 'authenticated'));
  res := res || jsonb_build_object('action_idem_23505', pg_temp.p249(format($q$INSERT INTO public.conversation_actions (conversation_id, action_type, policy_outcome, actor, idempotency_key, created_by) VALUES (%L,'create_task','auto','ai_receptionist','p249:a',%L)$q$, v_conv_un, u_admin), u_admin, 'authenticated'));

  -- værn
  res := res || jsonb_build_object('customer_without_confirm_23514', pg_temp.p249(format($q$INSERT INTO public.conversations (channel, title, dedupe_key, first_at, last_at, created_by, customer_id, customer_match_state) VALUES ('email','x','p249:x1',now(),now(),%L,%L,'unique_match')$q$, u_admin, v_cust), u_admin, 'authenticated'));
  res := res || jsonb_build_object('case_of_other_customer_23514', pg_temp.p249(format($q$UPDATE public.conversations SET service_case_id = %L, case_match_state = 'confirmed', match_version = match_version + 1 WHERE id = %L$q$, v_other_case, v_conv_c), u_admin, 'authenticated'));
  res := res || jsonb_build_object('match_without_version_23514', pg_temp.p249(format($q$UPDATE public.conversations SET customer_match_state = 'rejected' WHERE id = %L$q$, v_conv_un), u_admin, 'authenticated'));
  res := res || jsonb_build_object('handled_by_spoof_23514', pg_temp.p249(format($q$UPDATE public.conversations SET status = 'handled', handled_at = now(), handled_by = %L WHERE id = %L$q$, u_sl, v_conv_un), u_admin, 'authenticated'));
  res := res || jsonb_build_object('decided_by_spoof_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'rejected', decided_by = %L WHERE id = %L$q$, u_sl, v_act), u_admin, 'authenticated'));
  res := res || jsonb_build_object('approved_to_proposed_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'proposed' WHERE id = %L$q$, v_act), u_admin, 'authenticated'));
  res := res || jsonb_build_object('action_failed', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'failed', error_code = 'x' WHERE id = %L$q$, v_act), u_admin, 'authenticated'));
  res := res || jsonb_build_object('failed_to_executed_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'executed', executed_ref = 'fake' WHERE id = %L$q$, v_act), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_other_customer_conv_23514', pg_temp.p249(format($q$INSERT INTO public.upload_requests (conversation_id, customer_id, token_hash, expires_at) VALUES (%L,%L,%L, now() + interval '7 days')$q$, v_conv_un, v_cust, repeat('d', 64)), u_admin, 'authenticated'));
  res := res || jsonb_build_object('bogholderi_phone_unmatched', pg_temp.p249($q$SELECT count(*) FROM public.conversations WHERE channel = 'phone' AND dedupe_key LIKE 'p249:%'$q$, u_bog, 'authenticated'));
  res := res || jsonb_build_object('executed_without_ref_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'executed' WHERE id = %L$q$, v_act), u_admin, 'authenticated'));
  res := res || jsonb_build_object('payload_immutable_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET payload = '{"x":1}' WHERE id = %L$q$, v_act), u_admin, 'authenticated'));
  res := res || jsonb_build_object('forbidden_executed_23514', pg_temp.p249(format($q$INSERT INTO public.conversation_actions (conversation_id, action_type, policy_outcome, state, actor, idempotency_key, created_by, executed_ref) VALUES (%L,'alter_invoice','forbidden','executed','ai_receptionist','p249:f',%L,'x')$q$, v_conv_un, u_admin), u_admin, 'authenticated'));
  res := res || jsonb_build_object('dedupe_key_immutable_23514', pg_temp.p249(format($q$UPDATE public.conversations SET dedupe_key = 'p249:changed' WHERE id = %L$q$, v_conv_un), u_admin, 'authenticated'));
  res := res || jsonb_build_object('handled_needs_time_23514', pg_temp.p249(format($q$UPDATE public.conversations SET status = 'handled' WHERE id = %L$q$, v_conv_un), u_admin, 'authenticated'));
  res := res || jsonb_build_object('created_by_spoof_42501', pg_temp.p249(format($q$INSERT INTO public.conversations (channel, title, dedupe_key, first_at, last_at, created_by) VALUES ('phone','x','p249:x2',now(),now(),%L)$q$, u_sl), u_admin, 'authenticated'));

  -- synlighed pr. persona (forventning = rolle-standarder)
  res := res || jsonb_build_object('vis', jsonb_build_object(
    'admin', pg_temp.p249($q$SELECT count(*) FROM public.conversations WHERE dedupe_key LIKE 'p249:%'$q$, u_admin, 'authenticated'),
    'serviceleder', pg_temp.p249($q$SELECT count(*) FROM public.conversations WHERE dedupe_key LIKE 'p249:%'$q$, u_sl, 'authenticated'),
    'salg', pg_temp.p249($q$SELECT count(*) FROM public.conversations WHERE dedupe_key LIKE 'p249:%'$q$, u_salg, 'authenticated'),
    'bogholderi', pg_temp.p249($q$SELECT count(*) FROM public.conversations WHERE dedupe_key LIKE 'p249:%'$q$, u_bog, 'authenticated'),
    'montor', pg_temp.p249($q$SELECT count(*) FROM public.conversations WHERE dedupe_key LIKE 'p249:%'$q$, u_mont, 'authenticated'),
    'salg_items_unmatched', pg_temp.p249(format($q$SELECT count(*) FROM public.conversation_items WHERE conversation_id = %L$q$, v_conv_un), u_salg, 'authenticated'),
    'montor_actions', pg_temp.p249($q$SELECT count(*) FROM public.conversation_actions WHERE idempotency_key LIKE 'p249:%'$q$, u_mont, 'authenticated'),
    'anon', pg_temp.p249($q$SELECT count(*) FROM public.conversations$q$, NULL, 'anon')));
  res := res || jsonb_build_object('salg_insert_unmatched_42501', pg_temp.p249(format($q$INSERT INTO public.conversations (channel, title, dedupe_key, first_at, last_at, created_by) VALUES ('phone','x','p249:s1',now(),now(),%L)$q$, u_salg), u_salg, 'authenticated'));
  res := res || jsonb_build_object('montor_insert_42501', pg_temp.p249(format($q$INSERT INTO public.conversations (channel, title, dedupe_key, first_at, last_at, created_by, customer_id, customer_match_state) VALUES ('phone','x','p249:m1',now(),now(),%L,%L,'confirmed')$q$, u_mont, v_cust), u_mont, 'authenticated'));
  res := res || jsonb_build_object('salg_update_unmatched_0', pg_temp.p249(format($q$WITH u AS (UPDATE public.conversations SET next_action = 'x' WHERE id = %L RETURNING 1) SELECT count(*) FROM u$q$, v_conv_un), u_salg, 'authenticated'));
  res := res || jsonb_build_object('delete_no_grant_42501', pg_temp.p249(format($q$DELETE FROM public.conversations WHERE id = %L$q$, v_conv_un), u_admin, 'authenticated'));
  res := res || jsonb_build_object('anon_insert_42501', pg_temp.p249($q$INSERT INTO public.conversations (channel, title, dedupe_key, first_at, last_at) VALUES ('phone','x','p249:anon',now(),now())$q$, NULL, 'anon'));

  -- upload_requests: token_hash skjult, kun revoked_at kan ændres, genåbning afvist
  res := res || jsonb_build_object('upload_insert', pg_temp.p249(format($q$INSERT INTO public.upload_requests (conversation_id, customer_id, token_hash, expires_at) VALUES (%L,%L,%L, now() + interval '7 days')$q$, v_conv_c, v_cust, repeat('a', 64)), u_admin, 'authenticated'));
  SELECT id INTO v_up FROM public.upload_requests WHERE token_hash = repeat('a', 64);
  res := res || jsonb_build_object('upload_insert_with_id_42501', pg_temp.p249(format($q$INSERT INTO public.upload_requests (id, customer_id, token_hash, expires_at) VALUES (gen_random_uuid(),%L,%L, now() + interval '7 days')$q$, v_cust, repeat('c', 64)), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_read_token_42501', pg_temp.p249(format($q$SELECT count(token_hash) FROM public.upload_requests WHERE id = %L$q$, v_up), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_read_safe_cols', pg_temp.p249(format($q$SELECT count(id) FROM public.upload_requests WHERE id = %L$q$, v_up), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_quota_write_42501', pg_temp.p249(format($q$UPDATE public.upload_requests SET files_uploaded = 0 WHERE id = %L$q$, v_up), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_expiry_too_long_23514', pg_temp.p249(format($q$INSERT INTO public.upload_requests (customer_id, token_hash, expires_at) VALUES (%L,%L, now() + interval '30 days')$q$, v_cust, repeat('b', 64)), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_revoke', pg_temp.p249(format($q$UPDATE public.upload_requests SET revoked_at = now() WHERE id = %L$q$, v_up), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_reopen_23514', pg_temp.p249(format($q$UPDATE public.upload_requests SET revoked_at = NULL WHERE id = %L$q$, v_up), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_anon_42501', pg_temp.p249($q$SELECT count(*) FROM public.upload_requests$q$, NULL, 'anon'));

  -- Alt rulles tilbage (rollback-blokken bevises separat i rollbackProof00249Sql)
  RAISE EXCEPTION 'P249RESULT:%', res::text;
END $probe$;`
}

/** Selvstændig rollback-bevis-SQL: krop → rollback-blok → tilstand (kørt i én transaktion der rulles tilbage med RAISE) */
export function rollbackProof00249Sql(): string {
  return `${migration00249Body()}
${rollback00249Sql(false)}
DO $rb$ BEGIN
  RAISE EXCEPTION 'P249ROLLBACK:%', json_build_object(
    'tables_left', (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('conversations','conversation_items','conversation_actions','upload_requests')),
    'functions_left', (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('conversations_guard','conversation_actions_guard','upload_requests_guard','conversation_visible')),
    'catalog_left', (SELECT count(*) FROM public.permission_catalog WHERE permission LIKE 'conversations.%'),
    'defaults_left', (SELECT count(*) FROM public.role_permission_defaults WHERE permission LIKE 'conversations.%'))::text;
END $rb$;`
}

export interface P249Check { id: string; ok: boolean; note: string }

export function evaluateProbe(res: Record<string, unknown>): P249Check[] {
  const out: P249Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const p = res.personas as Record<string, boolean>
  add('personaer uden overrides fundet (admin/serviceleder/salg/bogholderi/montør)', !!p && Object.values(p).every(Boolean), JSON.stringify(p))
  add('katalog: 3 nye nøgler', res.catalog_new === 3)
  add('rolle-standarder: 10 nye', res.defaults_new === 10)
  add('bogholderi ser ingen telefon-henvendelser (ingen calls.view)', res.bogholderi_phone_unmatched === '0', String(res.bogholderi_phone_unmatched))
  for (const k of ['admin_insert_unmatched', 'admin_insert_confirmed', 'admin_insert_item', 'admin_insert_action', 'action_failed', 'upload_insert', 'upload_revoke'] as const) add(`admin: ${k}`, res[k] === 'ok', String(res[k]))
  for (const [k, v] of Object.entries(res)) {
    const m = /_(\d{5}|0)$/.exec(k)
    if (m) add(`værn/rettighed: ${k}`, String(v) === m[1], String(v))
  }
  add('upload: sikre kolonner læsbare', res.upload_read_safe_cols === '1', String(res.upload_read_safe_cols))
  const vis = res.vis as Record<string, string>
  add('synlighed admin = 2 (ukoblet + bekræftet)', vis?.admin === '2', vis?.admin)
  add('synlighed serviceleder = 2', vis?.serviceleder === '2', vis?.serviceleder)
  add('synlighed salg = kun bekræftet i scope (≤1, aldrig ukoblet)', vis?.salg === '1' || vis?.salg === '0', vis?.salg)
  add('salg ser ikke items på ukoblet henvendelse', vis?.salg_items_unmatched === '0', vis?.salg_items_unmatched)
  add('bogholderi: ingen ukoblede (≤1)', vis?.bogholderi === '1' || vis?.bogholderi === '0', vis?.bogholderi)
  add('montør: 0 (ingen conversations.view)', vis?.montor === '0', vis?.montor)
  add('montør: 0 handlinger', vis?.montor_actions === '0', vis?.montor_actions)
  add('anon: 42501', vis?.anon === '42501', vis?.anon)
  return out
}
