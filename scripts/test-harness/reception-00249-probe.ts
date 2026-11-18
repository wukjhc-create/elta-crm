/**
 * 00249 Henvendelser — staging-prøver (AI-receptionist fase 2 + final review).
 *   reception-00249-state           (read-only)     tabeller, politikker, funktioner, grants, katalog, md5 af kernetabeller
 *   reception-00249-probe           (ROLLBACK-ONLY) ÉN forespørgsel: migrationens krop → fixtures → persona-/værn-/indtags-
 *                                                   tjek → RAISE EXCEPTION (så ALT rulles tilbage)
 *   reception-00249-rollback-proof  (ROLLBACK-ONLY) krop → filens ROLLBACK-blok → struktur-diff mod før-tilstanden
 * Ingen personværdier ud — kun tjek-resultater, antal og md5.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const FILE = resolve(process.cwd(), 'supabase', 'migrations', '00249_henvendelser_backbone.sql')

export const NEW_TABLES = `('conversations','conversation_items','conversation_actions','upload_requests')`
export const NEW_FUNCS = `('conversations_guard','conversation_items_guard','conversation_actions_guard','upload_requests_guard','conversation_visible','reception_source_identity','reception_source_visible','reception_ingest','conversation_actions_insert_guard')`

/** Struktur-fingeraftryk af HELE public-skemaet (tabeller/kolonner, constraints, indeks, triggere, funktioner, politikker, grants) */
export const STRUCT_MD5 = `md5(concat_ws('#',
    (SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), '|' ORDER BY table_name, column_name) FROM information_schema.columns WHERE table_schema = 'public'),
    (SELECT string_agg(conrelid::regclass::text || ':' || conname || ':' || pg_get_constraintdef(oid), '|' ORDER BY conrelid::regclass::text, conname) FROM pg_constraint WHERE connamespace = 'public'::regnamespace),
    (SELECT string_agg(indexname || ':' || indexdef, '|' ORDER BY indexname) FROM pg_indexes WHERE schemaname = 'public'),
    (SELECT string_agg(tgrelid::regclass::text || ':' || tgname || ':' || tgenabled::text, '|' ORDER BY tgrelid::regclass::text, tgname) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)),
    (SELECT string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.prosecdef || ':' || coalesce(p.proacl::text, ''), '|' ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace),
    (SELECT string_agg(tablename || ':' || policyname || ':' || cmd || ':' || roles::text || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname = 'public'),
    (SELECT string_agg(grantee || ':' || table_name || ':' || privilege_type, '|' ORDER BY grantee, table_name, privilege_type) FROM information_schema.role_table_grants WHERE table_schema = 'public'),
    (SELECT string_agg(grantee || ':' || table_name || ':' || column_name || ':' || privilege_type, '|' ORDER BY grantee, table_name, column_name, privilege_type) FROM information_schema.column_privileges WHERE table_schema = 'public')))`

export const STATE_00249_SQL = `SELECT json_build_object(
  'applied', to_regclass('public.conversations') IS NOT NULL,
  'tables', (SELECT json_agg(c.relname ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ${NEW_TABLES}),
  'functions', (SELECT json_agg(p.proname || ':' || p.prosecdef ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ${NEW_FUNCS}),
  'policies', (SELECT json_agg(tablename || ':' || policyname || ':' || cmd ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname='public' AND tablename IN ${NEW_TABLES}),
  'catalog', (SELECT count(*) FROM public.permission_catalog),
  'defaults', (SELECT count(*) FROM public.role_permission_defaults),
  'new_keys', (SELECT json_agg(permission ORDER BY permission) FROM public.permission_catalog WHERE permission LIKE 'conversations.%'),
  'anon_grants', (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND table_name IN ${NEW_TABLES}),
  'auth_insert_conv_items', (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='authenticated' AND table_schema='public' AND table_name IN ('conversations','conversation_items') AND privilege_type='INSERT'),
  'token_hash_readable', (SELECT CASE WHEN to_regclass('public.upload_requests') IS NULL THEN NULL ELSE has_column_privilege('authenticated','public.upload_requests','token_hash','SELECT') END),
  'ingest_exec', (SELECT CASE WHEN to_regprocedure('public.reception_ingest(jsonb)') IS NULL THEN NULL ELSE json_build_object(
      'anon', has_function_privilege('anon', 'public.reception_ingest(jsonb)', 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', 'public.reception_ingest(jsonb)', 'EXECUTE'),
      'service_role', has_function_privilege('service_role', 'public.reception_ingest(jsonb)', 'EXECUTE')) END),
  'md5_core', (SELECT md5(string_agg(t || ':' || n, '|' ORDER BY t)) FROM (
     SELECT 'customers' t, count(*)::text n FROM public.customers UNION ALL SELECT 'service_cases', count(*)::text FROM public.service_cases
     UNION ALL SELECT 'customer_tasks', count(*)::text FROM public.customer_tasks UNION ALL SELECT 'customer_documents', count(*)::text FROM public.customer_documents
     UNION ALL SELECT 'incoming_emails', count(*)::text FROM public.incoming_emails UNION ALL SELECT 'portal_messages', count(*)::text FROM public.portal_messages
     UNION ALL SELECT 'telephony_calls', count(*)::text FROM public.telephony_calls) x),
  'md5_struct', ${STRUCT_MD5}
) f`

/** Migrationens krop uden BEGIN/COMMIT (prøven kører i én implicit transaktion) */
export function migration00249Body(): string {
  const sql = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')
  const body = sql.slice(0, sql.indexOf('\n-- ROLLBACK'))
  return body.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
}

/** Den kommenterede ROLLBACK-blok, så prøven tester den tekst der faktisk køres */
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
 * Prøve-SQL. Personaer = aktive profiler pr. rolle UDEN rettigheds-overrides (forventning = rolle-standarden).
 * p249(q, uid, role): kører q som rollen med JWT-claims → 'ok' | antal (for SELECT count …) | SQLSTATE
 * p249j(q, uid, role): kører q (returnerer jsonb) → jsonb-tekst | SQLSTATE
 */
export function probe00249Sql(): string {
  return `${migration00249Body()}

CREATE FUNCTION pg_temp.p249(q text, uid uuid, r text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r)::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', r, true);
  EXECUTE 'SET LOCAL ROLE ' || r;
  IF q ILIKE 'select count%' OR q ILIKE 'with %' THEN EXECUTE q INTO n; RESET ROLE; RETURN n::text; END IF;
  EXECUTE q;
  RESET ROLE;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN SQLSTATE;
END $f$;

CREATE FUNCTION pg_temp.p249j(q text, uid uuid, r text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r)::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', r, true);
  EXECUTE 'SET LOCAL ROLE ' || r;
  EXECUTE q INTO v;
  RESET ROLE;
  RETURN v::text;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN SQLSTATE;
END $f$;

-- kilde-synlighed: reception_source_visible (som postgres med personaens claims) skal = kildens RLS (som authenticated)
CREATE FUNCTION pg_temp.p249eq(tbl text, uid uuid) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n_fn bigint; n_rls bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE format('SELECT count(*) FILTER (WHERE public.reception_source_visible(%L, id)) FROM public.%I', tbl, tbl) INTO n_fn;
  SET LOCAL ROLE authenticated;
  EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO n_rls;
  RESET ROLE;
  RETURN CASE WHEN n_fn = n_rls THEN 'eq' ELSE 'diff:' || n_fn || '/' || n_rls END;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN SQLSTATE;
END $f$;

DO $probe$
DECLARE
  res jsonb := '{}'::jsonb;
  u_admin uuid; u_sl uuid; u_salg uuid; u_bog uuid; u_mont uuid;
  v_cust uuid; v_cust2 uuid; v_case uuid; v_case2 uuid; v_mail uuid; v_mail2 uuid; v_portal uuid; v_portal_cust uuid; v_call uuid;
  v_doc_other uuid; v_doc_portal uuid;
  v_sim uuid; v_sim_key text := 'sim:' || gen_random_uuid(); v_conv_mail uuid; v_conv_portal uuid; v_conv_bg uuid;
  v_act_task uuid; v_act_prop uuid; v_up uuid; v_ids uuid[]; r text; j jsonb; s text;
  pick text := 'SELECT p.id FROM public.profiles p WHERE p.is_active AND p.role = %L AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1';
  rpc text := 'SELECT public.reception_ingest(%L::jsonb)';
BEGIN
  EXECUTE format(pick, 'admin') INTO u_admin;
  EXECUTE format(pick, 'serviceleder') INTO u_sl;
  EXECUTE format(pick, 'salg') INTO u_salg;
  EXECUTE format(pick, 'bogholderi') INTO u_bog;
  EXECUTE format(pick, 'montør') INTO u_mont;
  res := res || jsonb_build_object('personas', jsonb_build_object('admin', u_admin IS NOT NULL, 'serviceleder', u_sl IS NOT NULL, 'salg', u_salg IS NOT NULL, 'bogholderi', u_bog IS NOT NULL, 'montor', u_mont IS NOT NULL));

  -- Fixtures (som postgres; alt rulles tilbage)
  INSERT INTO public.customers (company_name, contact_person, customer_number, email) VALUES ('P249 A', 'P249', 'P249-' || substr(md5(random()::text), 1, 8), 'p249a@elta-crm.local') RETURNING id INTO v_cust;
  INSERT INTO public.customers (company_name, contact_person, customer_number, email) VALUES ('P249 B', 'P249', 'P249-' || substr(md5(random()::text), 1, 8), 'p249b@elta-crm.local') RETURNING id INTO v_cust2;
  INSERT INTO public.service_cases (title, customer_id) VALUES ('P249 sag A', v_cust) RETURNING id INTO v_case;
  INSERT INTO public.service_cases (title, customer_id) VALUES ('P249 sag B', v_cust2) RETURNING id INTO v_case2;
  SELECT id INTO v_mail FROM public.incoming_emails WHERE customer_id IS NULL AND link_status::text <> 'ignored' ORDER BY received_at DESC LIMIT 1;
  SELECT id INTO v_mail2 FROM public.incoming_emails WHERE customer_id IS NULL AND link_status::text <> 'ignored' AND id <> v_mail ORDER BY received_at DESC LIMIT 1;
  SELECT id, customer_id INTO v_portal, v_portal_cust FROM public.portal_messages WHERE sender_type = 'customer' AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT 1;
  BEGIN
    INSERT INTO public.telephony_calls (provider, provider_call_id, started_at, direction, to_number_normalized) VALUES ('relatel', 'p249-call-' || substr(md5(random()::text), 1, 10), now(), 'inbound', '4500000000') RETURNING id INTO v_call;
  EXCEPTION WHEN OTHERS THEN v_call := NULL; END;
  INSERT INTO public.customer_documents (customer_id, title, document_type, file_url, file_name, mime_type) VALUES (v_cust2, 'P249', 'other', '', 'p249.pdf', 'application/pdf') RETURNING id INTO v_doc_other;
  INSERT INTO public.customer_documents (customer_id, title, document_type, file_url, file_name, mime_type) VALUES (v_portal_cust, 'P249', 'other', '', 'p249.pdf', 'application/pdf') RETURNING id INTO v_doc_portal;
  res := res || jsonb_build_object('fixtures', jsonb_build_object('mail', v_mail IS NOT NULL, 'mail2', v_mail2 IS NOT NULL, 'portal', v_portal IS NOT NULL, 'call', v_call IS NOT NULL));

  res := res || jsonb_build_object('catalog_new', (SELECT count(*) FROM public.permission_catalog WHERE permission LIKE 'conversations.%'),
                                   'defaults_new', (SELECT count(*) FROM public.role_permission_defaults WHERE permission LIKE 'conversations.%'));

  -- S1: direkte skrivning af henvendelser/items er lukket for brugere
  res := res || jsonb_build_object('direct_conv_insert_42501', pg_temp.p249($q$INSERT INTO public.conversations (channel, title, dedupe_key, first_at, last_at) VALUES ('phone','x','p249:x',now(),now())$q$, u_admin, 'authenticated'));
  res := res || jsonb_build_object('svc_direct_conv_insert_42501', pg_temp.p249($q$INSERT INTO public.conversations (channel, title, dedupe_key, first_at, last_at, created_by, intake_actor) VALUES ('phone','x','p249:svc',now(),now(),NULL,'ai_receptionist')$q$, NULL, 'service_role'));
  res := res || jsonb_build_object('anon_rpc_42501', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'simulator', 'dedupe_key', 'sim:' || gen_random_uuid())), NULL, 'anon'));
  res := res || jsonb_build_object('montor_rpc_42501', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'simulator', 'dedupe_key', 'sim:' || gen_random_uuid())), u_mont, 'authenticated'));

  -- Simulator (medarbejder): created → duplicate; handlinger: auto+execute → approved, ukendt → forbidden/blocked, forslag → proposed
  r := pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'simulator', 'dedupe_key', v_sim_key, 'title', 'P249 sim', 'urgency', 'high',
        'actions', jsonb_build_array(
          jsonb_build_object('action_type', 'create_task', 'policy_outcome', 'auto', 'idempotency_key', v_sim_key || ':create_task', 'execute', true),
          jsonb_build_object('action_type', 'alter_invoice', 'policy_outcome', 'auto', 'idempotency_key', v_sim_key || ':alter_invoice', 'execute', true),
          jsonb_build_object('action_type', 'create_customer_proposal', 'policy_outcome', 'proposal', 'idempotency_key', v_sim_key || ':ccp')))), u_admin, 'authenticated');
  j := CASE WHEN left(r, 1) = '{' THEN r::jsonb ELSE NULL END;
  res := res || jsonb_build_object('sim_outcome', coalesce(j->>'outcome', r));
  v_sim := (j->>'conversation_id')::uuid;
  res := res || jsonb_build_object('sim_action_states', (SELECT jsonb_object_agg(action_type, policy_outcome || '/' || state || '/' || actor) FROM public.conversation_actions WHERE conversation_id = v_sim));
  SELECT id INTO v_act_task FROM public.conversation_actions WHERE conversation_id = v_sim AND action_type = 'create_task';
  SELECT id INTO v_act_prop FROM public.conversation_actions WHERE conversation_id = v_sim AND action_type = 'create_customer_proposal';
  res := res || jsonb_build_object('sim_dup', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'simulator', 'dedupe_key', v_sim_key)), u_admin, 'authenticated')::jsonb->>'outcome');
  res := res || jsonb_build_object('sim_audit', (SELECT count(*) FROM public.audit_logs WHERE entity_id = v_sim AND action = 'conversation_ingested' AND user_id = u_admin AND metadata->>'mode' = 'on_behalf_of_user'));
  res := res || jsonb_build_object('case_cand_wrong_customer_23514', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'simulator', 'dedupe_key', 'sim:' || gen_random_uuid(), 'customer_candidate_id', v_cust, 'case_candidate_id', v_case2)), u_admin, 'authenticated'));
  res := res || jsonb_build_object('case_cand_without_customer_23514', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'simulator', 'dedupe_key', 'sim:' || gen_random_uuid(), 'case_candidate_id', v_case)), u_admin, 'authenticated'));
  res := res || jsonb_build_object('sim_bad_key_22023', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'simulator', 'dedupe_key', 'mail:incoming_emails:' || v_mail)), u_admin, 'authenticated'));

  -- Kilde: ukoblet mail. Identitet afledes; en anden bruger får duplicate; forkert forventet kunde afvises
  r := pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', v_mail, 'title', 'forfalsket titel')), u_admin, 'authenticated');
  j := CASE WHEN left(r, 1) = '{' THEN r::jsonb ELSE NULL END;
  res := res || jsonb_build_object('mail_outcome', coalesce(j->>'outcome', r));
  v_conv_mail := (j->>'conversation_id')::uuid;
  res := res || jsonb_build_object('mail_item_derived', (SELECT count(*) FROM public.conversation_items i JOIN public.incoming_emails e ON e.id = i.source_id
      WHERE i.conversation_id = v_conv_mail AND i.dedupe_key = 'mail:incoming_emails:' || e.id AND i.occurred_at = e.received_at AND i.channel IN ('email','web_chat')));
  res := res || jsonb_build_object('mail_dup_admin', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', v_mail)), u_admin, 'authenticated')::jsonb->>'outcome');
  res := res || jsonb_build_object('mail_dup_serviceleder', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', v_mail)), u_sl, 'authenticated')::jsonb->>'outcome');
  -- Review F1: et senere indtag (baggrund, nød) HÆVER hastegraden og tilføjer forslag på den eksisterende henvendelse
  r := pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', v_mail, 'urgency', 'emergency', 'status', 'handoff', 'handoff_reasons', jsonb_build_array('safety_emergency'),
        'actions', jsonb_build_array(jsonb_build_object('action_type', 'create_callback', 'policy_outcome', 'auto', 'idempotency_key', 'p249merge:cb', 'execute', true)))), NULL, 'service_role');
  res := res || jsonb_build_object('merge_outcome', CASE WHEN left(r, 1) = '{' THEN (r::jsonb->>'outcome') || '/' || (r::jsonb->>'raised') ELSE r END);
  res := res || jsonb_build_object('merge_row', (SELECT urgency || '/' || status || '/' || (handoff_reasons @> ARRAY['safety_emergency'])::text FROM public.conversations WHERE id = v_conv_mail));
  res := res || jsonb_build_object('merge_action', (SELECT state || '/' || actor FROM public.conversation_actions WHERE conversation_id = v_conv_mail AND idempotency_key = 'p249merge:cb'));
  res := res || jsonb_build_object('merge_lower_noop', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', v_mail, 'urgency', 'low')), u_admin, 'authenticated')::jsonb->>'raised');
  res := res || jsonb_build_object('merge_still_emergency', (SELECT urgency FROM public.conversations WHERE id = v_conv_mail));
  res := res || jsonb_build_object('mail_salg_unmatched_42501', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', v_mail2)), u_salg, 'authenticated'));
  res := res || jsonb_build_object('mail_wrong_customer_23514', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', v_mail2, 'confirmed_customer_id', v_cust)), u_admin, 'authenticated'));
  res := res || jsonb_build_object('mail_unknown_id_42501', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', gen_random_uuid())), u_admin, 'authenticated'));
  res := res || jsonb_build_object('sms_source_0A000', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'sms_messages', 'source_id', gen_random_uuid())), u_admin, 'authenticated'));
  res := res || jsonb_build_object('docs_source_0A000', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'customer_documents', 'source_id', v_doc_other)), u_admin, 'authenticated'));

  -- Kilde: portalbesked → bekræftet kunde = portalens; kan ikke skiftes til en anden kunde
  r := pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'portal_messages', 'source_id', v_portal)), u_admin, 'authenticated');
  j := CASE WHEN left(r, 1) = '{' THEN r::jsonb ELSE NULL END;
  res := res || jsonb_build_object('portal_outcome', coalesce(j->>'outcome', r));
  v_conv_portal := (j->>'conversation_id')::uuid;
  res := res || jsonb_build_object('portal_confirmed_customer', (SELECT count(*) FROM public.conversations WHERE id = v_conv_portal AND customer_id = v_portal_cust AND customer_match_state = 'confirmed'));
  res := res || jsonb_build_object('portal_switch_customer_23514', pg_temp.p249(format($q$UPDATE public.conversations SET customer_id = %L, match_version = match_version + 1 WHERE id = %L$q$, v_cust, v_conv_portal), u_admin, 'authenticated'));
  res := res || jsonb_build_object('portal_detach_customer_23514', pg_temp.p249(format($q$UPDATE public.conversations SET customer_id = NULL, customer_match_state = 'rejected', match_version = match_version + 1 WHERE id = %L$q$, v_conv_portal), u_admin, 'authenticated'));
  res := res || jsonb_build_object('contact_of_other_customer_23514', pg_temp.p249(format($q$UPDATE public.conversations SET contact_id = (SELECT id FROM public.customer_contacts WHERE customer_id IS DISTINCT FROM %L LIMIT 1) WHERE id = %L$q$, v_portal_cust, v_conv_portal), u_admin, 'authenticated'));
  res := res || jsonb_build_object('case_of_other_customer_23514', pg_temp.p249(format($q$UPDATE public.conversations SET service_case_id = %L, case_match_state = 'confirmed', match_version = match_version + 1 WHERE id = %L$q$, v_case2, v_conv_portal), u_admin, 'authenticated'));

  -- Kilde: opkald (00247-række uden kunde) → telefon-henvendelse
  IF v_call IS NOT NULL THEN
    res := res || jsonb_build_object('call_outcome', coalesce(pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'telephony_calls', 'source_id', v_call)), u_admin, 'authenticated')::jsonb->>'outcome', 'err'));
  END IF;

  -- Baggrundsaktøren (service_role): kun forslag, ingen bruger, intake_actor = ai_receptionist, auditeret
  r := pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'manual', 'provider', 'web_chat', 'provider_event_id', 'p249-chat-0001', 'channel', 'web_chat',
        'urgency', 'emergency', 'status', 'handoff',
        'actions', jsonb_build_array(jsonb_build_object('action_type', 'create_task', 'policy_outcome', 'auto', 'idempotency_key', 'p249bg:create_task', 'execute', true),
                                     jsonb_build_object('action_type', 'create_callback', 'policy_outcome', 'auto', 'idempotency_key', 'p249bg:cb')))), NULL, 'service_role');
  j := CASE WHEN left(r, 1) = '{' THEN r::jsonb ELSE NULL END;
  res := res || jsonb_build_object('bg_outcome', coalesce(j->>'outcome', r));
  v_conv_bg := (j->>'conversation_id')::uuid;
  res := res || jsonb_build_object('bg_row', (SELECT intake_actor || '/' || coalesce(created_by::text, 'null') || '/' || urgency || '/' || status FROM public.conversations WHERE id = v_conv_bg));
  res := res || jsonb_build_object('bg_action_states', (SELECT string_agg(DISTINCT state, ',') FROM public.conversation_actions WHERE conversation_id = v_conv_bg));
  res := res || jsonb_build_object('bg_audit', (SELECT count(*) FROM public.audit_logs WHERE entity_id = v_conv_bg AND user_id IS NULL AND metadata->>'actor' = 'ai_receptionist' AND metadata->>'mode' = 'background'));
  res := res || jsonb_build_object('bg_dup', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'manual', 'provider', 'web_chat', 'provider_event_id', 'p249-chat-0001', 'channel', 'web_chat')), NULL, 'service_role')::jsonb->>'outcome');
  res := res || jsonb_build_object('user_manual_42501', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'manual', 'provider', 'web_chat', 'provider_event_id', 'p249-chat-0002', 'channel', 'web_chat')), u_admin, 'authenticated'));
  res := res || jsonb_build_object('bg_simulator_42501', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'simulator', 'dedupe_key', 'sim:' || gen_random_uuid())), NULL, 'service_role'));
  res := res || jsonb_build_object('bg_bad_provider_22023', pg_temp.p249j(format(rpc, jsonb_build_object('source_table', 'manual', 'provider', 'relatel', 'provider_event_id', 'p249-chat-0003', 'channel', 'phone')), NULL, 'service_role'));
  res := res || jsonb_build_object('bg_approve_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'approved' WHERE conversation_id = %L AND action_type = 'create_task'$q$, v_conv_bg), NULL, 'service_role'));

  -- Item-værn for ALLE skrivere (også service_role): ingen squatting, ingen fremmede dokumenter
  res := res || jsonb_build_object('direct_item_insert_42501', pg_temp.p249(format($q$INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, source_table, source_id, occurred_at, dedupe_key) VALUES (%L,'email','inbound','microsoft365','incoming_emails',%L,now(),%L)$q$, v_sim, v_mail2, 'mail:incoming_emails:' || v_mail2), u_admin, 'authenticated'));
  res := res || jsonb_build_object('svc_item_squat_23514', pg_temp.p249(format($q$INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, source_table, source_id, occurred_at, dedupe_key) VALUES (%L,'email','inbound','microsoft365','incoming_emails',%L,now(),%L)$q$, v_sim, v_mail2, 'mail:incoming_emails:' || v_mail2), NULL, 'service_role'));
  res := res || jsonb_build_object('svc_item_doc_other_customer_23514', pg_temp.p249(format($q$INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, source_table, source_id, occurred_at, dedupe_key) VALUES (%L,'upload_link','inbound','upload_link','customer_documents',%L,now(),%L)$q$, v_conv_portal, v_doc_other, 'upload:customer_documents:' || v_doc_other), NULL, 'service_role'));
  res := res || jsonb_build_object('svc_item_doc_ok', pg_temp.p249(format($q$INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, source_table, source_id, occurred_at, dedupe_key) VALUES (%L,'upload_link','inbound','upload_link','customer_documents',%L,now(),%L)$q$, v_conv_portal, v_doc_portal, 'upload:customer_documents:' || v_doc_portal), NULL, 'service_role'));
  res := res || jsonb_build_object('user_item_doc_42501', pg_temp.p249(format($q$INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, source_table, source_id, occurred_at, dedupe_key) VALUES (%L,'upload_link','inbound','upload_link','customer_documents',%L,now(),%L)$q$, v_conv_portal, v_doc_portal, 'upload:customer_documents:x'), u_admin, 'authenticated'));

  -- Handlinger: brugere kan kun registrere egne (actor='user'); AI-handlinger kun via reception_ingest
  res := res || jsonb_build_object('user_insert_ai_action_42501', pg_temp.p249(format($q$INSERT INTO public.conversation_actions (conversation_id, action_type, policy_outcome, state, actor, idempotency_key, created_by) VALUES (%L,'create_task','auto','approved','ai_receptionist','p249:fake',%L)$q$, v_sim, u_admin), u_admin, 'authenticated'));
  res := res || jsonb_build_object('svc_insert_ai_action_42501', pg_temp.p249(format($q$INSERT INTO public.conversation_actions (conversation_id, action_type, policy_outcome, state, actor, idempotency_key, executed_ref) VALUES (%L,'create_task','auto','executed','ai_receptionist','p249:svcfake','x')$q$, v_sim), NULL, 'service_role'));
  res := res || jsonb_build_object('user_action_without_decider_23514', pg_temp.p249(format($q$INSERT INTO public.conversation_actions (conversation_id, action_type, policy_outcome, state, actor, idempotency_key, created_by, executed_ref) VALUES (%L,'create_task','auto','executed','user','p249:nodec',%L,'x')$q$, v_sim, u_admin), u_admin, 'authenticated'));
  res := res || jsonb_build_object('user_insert_user_action', pg_temp.p249(format($q$INSERT INTO public.conversation_actions (conversation_id, action_type, policy_outcome, state, actor, idempotency_key, created_by, executed_ref, decided_by, decided_at) VALUES (%L,'create_task','auto','executed','user','p249:user',%L,'task:created',%L,now())$q$, v_sim, u_admin, u_admin), u_admin, 'authenticated'));
  res := res || jsonb_build_object('forbidden_executed_23514', pg_temp.p249(format($q$INSERT INTO public.conversation_actions (conversation_id, action_type, policy_outcome, state, actor, idempotency_key, created_by, executed_ref) VALUES (%L,'alter_invoice','forbidden','executed','user','p249:f',%L,'x')$q$, v_sim, u_admin), u_admin, 'authenticated'));

  -- Eksisterende værn (henvendelse/handling)
  res := res || jsonb_build_object('match_without_version_23514', pg_temp.p249(format($q$UPDATE public.conversations SET customer_match_state = 'rejected' WHERE id = %L$q$, v_sim), u_admin, 'authenticated'));
  res := res || jsonb_build_object('handled_by_spoof_23514', pg_temp.p249(format($q$UPDATE public.conversations SET status = 'handled', handled_at = now(), handled_by = %L WHERE id = %L$q$, u_sl, v_sim), u_admin, 'authenticated'));
  res := res || jsonb_build_object('decided_by_spoof_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'rejected', decided_by = %L WHERE id = %L$q$, u_sl, v_act_prop), u_admin, 'authenticated'));
  res := res || jsonb_build_object('approved_to_proposed_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'proposed' WHERE id = %L$q$, v_act_task), u_admin, 'authenticated'));
  res := res || jsonb_build_object('executed_without_ref_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'executed' WHERE id = %L$q$, v_act_task), u_admin, 'authenticated'));
  res := res || jsonb_build_object('payload_immutable_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET payload = '{"x":1}' WHERE id = %L$q$, v_act_task), u_admin, 'authenticated'));
  res := res || jsonb_build_object('execute_without_decider_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'executed', executed_ref = 'x' WHERE id = %L$q$, v_act_task), u_admin, 'authenticated'));
  res := res || jsonb_build_object('action_failed', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'failed', error_code = 'x', decided_by = %L, decided_at = now() WHERE id = %L$q$, u_admin, v_act_task), u_admin, 'authenticated'));
  res := res || jsonb_build_object('failed_to_executed_23514', pg_temp.p249(format($q$UPDATE public.conversation_actions SET state = 'executed', executed_ref = 'fake', decided_by = %L, decided_at = now() WHERE id = %L$q$, u_admin, v_act_task), u_admin, 'authenticated'));
  res := res || jsonb_build_object('dedupe_key_immutable_23514', pg_temp.p249(format($q$UPDATE public.conversations SET dedupe_key = 'p249:changed' WHERE id = %L$q$, v_sim), u_admin, 'authenticated'));
  res := res || jsonb_build_object('intake_actor_immutable_23514', pg_temp.p249(format($q$UPDATE public.conversations SET intake_actor = 'ai_receptionist' WHERE id = %L$q$, v_sim), u_admin, 'authenticated'));
  res := res || jsonb_build_object('handled_needs_time_23514', pg_temp.p249(format($q$UPDATE public.conversations SET status = 'handled' WHERE id = %L$q$, v_sim), u_admin, 'authenticated'));
  res := res || jsonb_build_object('delete_no_grant_42501', pg_temp.p249(format($q$DELETE FROM public.conversations WHERE id = %L$q$, v_sim), u_admin, 'authenticated'));

  -- Bekræft kunde + sag på simulator-henvendelsen (menneskeligt valg med versionslås)
  res := res || jsonb_build_object('confirm_customer', pg_temp.p249(format($q$UPDATE public.conversations SET customer_id = %L, customer_match_state = 'confirmed', match_version = match_version + 1 WHERE id = %L$q$, v_cust, v_sim), u_admin, 'authenticated'));
  res := res || jsonb_build_object('confirm_case', pg_temp.p249(format($q$UPDATE public.conversations SET service_case_id = %L, case_match_state = 'confirmed', match_version = match_version + 1 WHERE id = %L$q$, v_case, v_sim), u_admin, 'authenticated'));

  -- Upload-links: token_hash skjult, kun revoked_at kan ændres af brugere, ÉN afsendelse (consumed_at), genåbning afvist
  res := res || jsonb_build_object('upload_other_customer_conv_23514', pg_temp.p249(format($q$INSERT INTO public.upload_requests (conversation_id, customer_id, token_hash, expires_at) VALUES (%L,%L,%L, now() + interval '7 days')$q$, v_sim, v_cust2, repeat('d', 64)), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_insert', pg_temp.p249(format($q$INSERT INTO public.upload_requests (conversation_id, customer_id, service_case_id, token_hash, expires_at) VALUES (%L,%L,%L,%L, now() + interval '7 days')$q$, v_sim, v_cust, v_case, repeat('a', 64)), u_admin, 'authenticated'));
  SELECT id INTO v_up FROM public.upload_requests WHERE token_hash = repeat('a', 64);
  res := res || jsonb_build_object('upload_insert_with_id_42501', pg_temp.p249(format($q$INSERT INTO public.upload_requests (id, customer_id, token_hash, expires_at) VALUES (gen_random_uuid(),%L,%L, now() + interval '7 days')$q$, v_cust, repeat('c', 64)), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_read_token_42501', pg_temp.p249(format($q$SELECT count(token_hash) FROM public.upload_requests WHERE id = %L$q$, v_up), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_read_safe_cols', pg_temp.p249(format($q$SELECT count(consumed_at IS NULL) FROM public.upload_requests WHERE id = %L$q$, v_up), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_quota_write_42501', pg_temp.p249(format($q$UPDATE public.upload_requests SET files_uploaded = 0 WHERE id = %L$q$, v_up), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_consume_write_42501', pg_temp.p249(format($q$UPDATE public.upload_requests SET consumed_at = now() WHERE id = %L$q$, v_up), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_expiry_too_long_23514', pg_temp.p249(format($q$INSERT INTO public.upload_requests (customer_id, token_hash, expires_at) VALUES (%L,%L, now() + interval '30 days')$q$, v_cust, repeat('b', 64)), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_consume_first', pg_temp.p249(format($q$WITH u AS (UPDATE public.upload_requests SET consumed_at = now(), files_uploaded = 2 WHERE id = %L AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING 1) SELECT count(*) FROM u$q$, v_up), NULL, 'service_role'));
  res := res || jsonb_build_object('upload_consume_replay_0', pg_temp.p249(format($q$WITH u AS (UPDATE public.upload_requests SET consumed_at = now(), files_uploaded = 3 WHERE id = %L AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING 1) SELECT count(*) FROM u$q$, v_up), NULL, 'service_role'));
  res := res || jsonb_build_object('upload_consumed_without_files_23514', pg_temp.p249(format($q$UPDATE public.upload_requests SET files_uploaded = 0 WHERE id = %L$q$, v_up), NULL, 'service_role'));
  res := res || jsonb_build_object('upload_token_change_23514', pg_temp.p249(format($q$UPDATE public.upload_requests SET token_hash = repeat('e', 64) WHERE id = %L$q$, v_up), NULL, 'service_role'));
  res := res || jsonb_build_object('upload_revoke', pg_temp.p249(format($q$UPDATE public.upload_requests SET revoked_at = now() WHERE id = %L$q$, v_up), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_reopen_23514', pg_temp.p249(format($q$UPDATE public.upload_requests SET revoked_at = NULL WHERE id = %L$q$, v_up), u_admin, 'authenticated'));
  res := res || jsonb_build_object('upload_anon_42501', pg_temp.p249($q$SELECT count(*) FROM public.upload_requests$q$, NULL, 'anon'));

  -- Synlighed pr. persona (forventning = rolle-standarder) på prøvens henvendelser
  v_ids := ARRAY[v_sim, v_conv_mail, v_conv_portal, v_conv_bg];
  s := format($q$SELECT count(*) FROM public.conversations WHERE id = ANY (%L::uuid[])$q$, v_ids);
  res := res || jsonb_build_object('vis', jsonb_build_object(
    'admin', pg_temp.p249(s, u_admin, 'authenticated'), 'serviceleder', pg_temp.p249(s, u_sl, 'authenticated'),
    'salg', pg_temp.p249(s, u_salg, 'authenticated'), 'bogholderi', pg_temp.p249(s, u_bog, 'authenticated'),
    'montor', pg_temp.p249(s, u_mont, 'authenticated'), 'anon', pg_temp.p249(s, NULL, 'anon'),
    'bogholderi_phone', pg_temp.p249(format($q$SELECT count(*) FROM public.conversations WHERE channel = 'phone' AND id = ANY (%L::uuid[])$q$, v_ids), u_bog, 'authenticated'),
    'salg_items_unmatched', pg_temp.p249(format($q$SELECT count(*) FROM public.conversation_items WHERE conversation_id = %L$q$, v_conv_mail), u_salg, 'authenticated'),
    'montor_actions', pg_temp.p249(format($q$SELECT count(*) FROM public.conversation_actions WHERE conversation_id = ANY (%L::uuid[])$q$, v_ids), u_mont, 'authenticated')));
  res := res || jsonb_build_object('salg_update_unmatched_0', pg_temp.p249(format($q$WITH u AS (UPDATE public.conversations SET next_action = 'x' WHERE id = %L RETURNING 1) SELECT count(*) FROM u$q$, v_conv_mail), u_salg, 'authenticated'));

  -- Kilde-synlighed = kildens RLS (pr. persona)
  res := res || jsonb_build_object('source_eq', jsonb_build_object(
    'mail_admin', pg_temp.p249eq('incoming_emails', u_admin), 'mail_sl', pg_temp.p249eq('incoming_emails', u_sl), 'mail_salg', pg_temp.p249eq('incoming_emails', u_salg),
    'mail_bog', pg_temp.p249eq('incoming_emails', u_bog), 'mail_mont', pg_temp.p249eq('incoming_emails', u_mont),
    'call_admin', pg_temp.p249eq('telephony_calls', u_admin), 'call_sl', pg_temp.p249eq('telephony_calls', u_sl), 'call_salg', pg_temp.p249eq('telephony_calls', u_salg),
    'call_bog', pg_temp.p249eq('telephony_calls', u_bog), 'call_mont', pg_temp.p249eq('telephony_calls', u_mont),
    'portal_admin', pg_temp.p249eq('portal_messages', u_admin), 'portal_salg', pg_temp.p249eq('portal_messages', u_salg)));

  -- Sletning: sag slettes → case_match none; kunde slettes → customer_id NULL, match nulstillet (ingen CHECK-fejl)
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  BEGIN
    DELETE FROM public.service_cases WHERE id = v_case;
    res := res || jsonb_build_object('case_deleted_state', (SELECT coalesce(service_case_id::text, 'null') || '/' || case_match_state FROM public.conversations WHERE id = v_sim));
  EXCEPTION WHEN OTHERS THEN
    res := res || jsonb_build_object('case_deleted_state', 'delete_failed:' || SQLSTATE);
  END;
  BEGIN
    DELETE FROM public.customers WHERE id = v_cust;
    res := res || jsonb_build_object('customer_deleted_state', (SELECT coalesce(customer_id::text, 'null') || '/' || customer_match_state || '/' || coalesce(service_case_id::text, 'null') FROM public.conversations WHERE id = v_sim),
                                     'customer_deleted_links', (SELECT count(*) FROM public.upload_requests WHERE customer_id = v_cust));
  EXCEPTION WHEN OTHERS THEN
    res := res || jsonb_build_object('customer_deleted_state', 'delete_failed:' || SQLSTATE);
  END;

  -- Alt rulles tilbage (rollback-blokken bevises separat i rollbackProof00249Sql)
  RAISE EXCEPTION 'P249RESULT:%', res::text;
END $probe$;`
}

/** Rollback-bevis: krop → rollback-blok → antal tilbage + struktur-md5 (sammenlignes med før-tilstanden af kalderen) */
export function rollbackProof00249Sql(): string {
  return `${migration00249Body()}
${rollback00249Sql(false)}
DO $rb$ BEGIN
  RAISE EXCEPTION 'P249ROLLBACK:%', json_build_object(
    'tables_left', (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ${NEW_TABLES}),
    'functions_left', (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ${NEW_FUNCS}),
    'catalog_left', (SELECT count(*) FROM public.permission_catalog WHERE permission LIKE 'conversations.%'),
    'defaults_left', (SELECT count(*) FROM public.role_permission_defaults WHERE permission LIKE 'conversations.%'),
    'md5_struct', ${STRUCT_MD5})::text;
END $rb$;`
}

export interface P249Check { id: string; ok: boolean; note: string }

export function evaluateProbe(res: Record<string, unknown>): P249Check[] {
  const out: P249Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const p = res.personas as Record<string, boolean>
  add('personaer uden overrides fundet (admin/serviceleder/salg/bogholderi/montør)', !!p && Object.values(p).every(Boolean), JSON.stringify(p))
  const f = res.fixtures as Record<string, boolean>
  add('fixtures: mail ×2, portalbesked, opkald', !!f && f.mail && f.mail2 && f.portal && f.call, JSON.stringify(f))
  add('katalog: 3 nye nøgler', res.catalog_new === 3)
  add('rolle-standarder: 10 nye', res.defaults_new === 10)
  for (const [k, v] of Object.entries(res)) {
    const m = /_([0-9][0-9A-Z]{4}|0)$/.exec(k)
    if (m) add(`værn/rettighed: ${k}`, String(v) === m[1], String(v))
  }
  add('simulator: created', res.sim_outcome === 'created', String(res.sim_outcome))
  const st = (res.sim_action_states ?? {}) as Record<string, string>
  add('simulator-handlinger: auto+execute → approved (AI-aktør)', st.create_task === 'auto/approved/ai_receptionist', st.create_task)
  add('simulator-handlinger: ukendt (alter_invoice) → forbidden/blocked', st.alter_invoice === 'forbidden/blocked/ai_receptionist', st.alter_invoice)
  add('simulator-handlinger: forslag → proposed', st.create_customer_proposal === 'proposal/proposed/ai_receptionist', st.create_customer_proposal)
  add('simulator: samme nøgle igen → duplicate', res.sim_dup === 'duplicate', String(res.sim_dup))
  add('simulator: audit i samme transaktion (on_behalf_of_user)', res.sim_audit === 1, String(res.sim_audit))
  add('mail: created', res.mail_outcome === 'created', String(res.mail_outcome))
  add('mail: item afledt af kilden (nøgle/tid/kanal)', res.mail_item_derived === 1, String(res.mail_item_derived))
  add('mail: samme kilde igen (admin) → duplicate', res.mail_dup_admin === 'duplicate', String(res.mail_dup_admin))
  add('mail: samme kilde (serviceleder) → duplicate (intet squat muligt)', res.mail_dup_serviceleder === 'duplicate', String(res.mail_dup_serviceleder))
  add('portal: created', res.portal_outcome === 'created', String(res.portal_outcome))
  add('portal: bekræftet kunde = portalbeskedens kunde', res.portal_confirmed_customer === 1, String(res.portal_confirmed_customer))
  add('opkald: created', res.call_outcome === 'created', String(res.call_outcome))
  add('review F1: senere nød-indtag på samme kilde → duplicate men hævet', res.merge_outcome === 'duplicate/true', String(res.merge_outcome))
  add('review F1: hastegrad emergency + handoff + årsag tilføjet', res.merge_row === 'emergency/handoff/true', String(res.merge_row))
  add('review F1: nyt forslag tilføjet som proposed (aldrig udført)', res.merge_action === 'proposed/ai_receptionist', String(res.merge_action))
  add('review F1: et senere indtag kan aldrig sænke hastegraden', res.merge_lower_noop === 'false' && res.merge_still_emergency === 'emergency', `${res.merge_lower_noop}/${res.merge_still_emergency}`)
  add('baggrund: created', res.bg_outcome === 'created', String(res.bg_outcome))
  add('baggrund: intake_actor=ai_receptionist, ingen bruger, hastegrad/status sat', res.bg_row === 'ai_receptionist/null/emergency/handoff', String(res.bg_row))
  add('baggrund: ALLE handlinger kun forslag (selv auto+execute)', res.bg_action_states === 'proposed', String(res.bg_action_states))
  add('baggrund: auditeret (user_id NULL, actor ai_receptionist, mode background)', res.bg_audit === 1, String(res.bg_audit))
  add('baggrund: samme hændelse igen → duplicate', res.bg_dup === 'duplicate', String(res.bg_dup))
  add('service_role: upload-fil af henvendelsens egen kunde kan knyttes', res.svc_item_doc_ok === 'ok', String(res.svc_item_doc_ok))
  add('bruger: egen handling (actor=user) kan registreres', res.user_insert_user_action === 'ok', String(res.user_insert_user_action))
  for (const k of ['action_failed', 'confirm_customer', 'confirm_case', 'upload_insert', 'upload_revoke'] as const) add(`admin: ${k}`, res[k] === 'ok', String(res[k]))
  add('upload: sikre kolonner (inkl. consumed_at) læsbare', res.upload_read_safe_cols === '1', String(res.upload_read_safe_cols))
  add('upload: første afsendelse reserverer linket', res.upload_consume_first === '1', String(res.upload_consume_first))
  const vis = res.vis as Record<string, string>
  add('synlighed admin = 4 (sim, mail, portal, baggrund)', vis?.admin === '4', vis?.admin)
  add('synlighed serviceleder = 4', vis?.serviceleder === '4', vis?.serviceleder)
  add('synlighed salg = kun bekræftede i scope (aldrig ukoblede)', ['0', '1', '2'].includes(vis?.salg), vis?.salg)
  add('salg ser ikke items på ukoblet mail-henvendelse', vis?.salg_items_unmatched === '0', vis?.salg_items_unmatched)
  add('bogholderi ser ingen telefon-henvendelser (ingen calls.view)', vis?.bogholderi_phone === '0', vis?.bogholderi_phone)
  add('montør: 0 henvendelser og 0 handlinger', vis?.montor === '0' && vis?.montor_actions === '0', `${vis?.montor}/${vis?.montor_actions}`)
  add('anon: 42501', vis?.anon === '42501', vis?.anon)
  const eq = (res.source_eq ?? {}) as Record<string, string>
  for (const [k, v] of Object.entries(eq)) add(`kilde-synlighed = kildens RLS: ${k}`, v === 'eq', v)
  add('sletning af sag → sag nulstillet (none)', res.case_deleted_state === 'null/none', String(res.case_deleted_state))
  add('sletning af kunde → kunde/sag nulstillet uden fejl', res.customer_deleted_state === 'null/insufficient_information/null', String(res.customer_deleted_state))
  add('sletning af kunde → kundens upload-links slettet', res.customer_deleted_links === 0, String(res.customer_deleted_links))
  return out
}
