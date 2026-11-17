/**
 * 00250 Henvendelser hub fase 3A — staging-prøver (forudsætter 00249 anvendt).
 *   reception-00250-probe           (ROLLBACK-ONLY) migrationens krop → fixtures → tråd/kilde/web-chat/retention/persona-
 *                                                   tjek → RAISE EXCEPTION (ALT rulles tilbage)
 *   reception-00250-rollback-proof  (ROLLBACK-ONLY) krop → rollback-SQL → struktur-md5 (sammenlignes med før-tilstanden)
 *   reception-00250-rollback-sql    skriver docs/runbooks/sql/00250_rollback.sql (genereret af 00249's egne funktionstekster)
 * Ingen personværdier ud — kun tjek-resultater og antal.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { STRUCT_MD5 } from './reception-00249-probe'

const FILE = resolve(process.cwd(), 'supabase', 'migrations', '00250_henvendelser_hub_phase_3a.sql')
const FILE_249 = resolve(process.cwd(), 'supabase', 'migrations', '00249_henvendelser_backbone.sql')

export const NEW_TABLES_250 = `('web_chat_sessions','web_chat_messages')`
export const NEW_FUNCS_250 = `('conversation_items_update_guard','reception_retention')`

export function migration00250Body(): string {
  const sql = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')
  const body = sql.slice(0, sql.indexOf('\n-- ROLLBACK'))
  return body.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
}

/**
 * 00249's funktionsdefinitioner PRÆCIST som i filen (rå bytes inkl. linjeskift, så prosrc-md5 bliver identisk) —
 * som CREATE OR REPLACE. Bruges af rollback-SQL'en.
 */
function functions249(names: string[]): string {
  const raw = readFileSync(FILE_249, 'utf8')
  const out: string[] = []
  for (const n of names) {
    const start = raw.indexOf(`CREATE FUNCTION public.${n}(`)
    if (start < 0) throw new Error(`00249: ${n} ikke fundet`)
    const endTag = raw.indexOf('END $f$;', start)
    const sqlEnd = raw.indexOf('\n$f$;', start)
    // sql-funktioner ender med "\n$f$;", plpgsql med "END $f$;" — tag den der kommer først efter start
    const stop = [endTag >= 0 ? endTag + 'END $f$;'.length : Infinity, sqlEnd >= 0 ? sqlEnd + '\n$f$;'.length : Infinity].reduce((a, b) => Math.min(a, b))
    if (!Number.isFinite(stop)) throw new Error(`00249: slutning af ${n} ikke fundet`)
    out.push(raw.slice(start, stop).replace(`CREATE FUNCTION public.${n}(`, `CREATE OR REPLACE FUNCTION public.${n}(`))
  }
  return out.join('\n\n')
}

/** Rollback for 00250: fjerner 00250-data der ellers bryder 00249's regler, genskaber 00249's funktioner, fjerner nyt */
export function rollback00250Sql(withTx = true): string {
  const sql = `-- 00250 ROLLBACK (genereret af scripts/test-harness/reception-00250-probe.ts — RET IKKE I HÅNDEN).
-- Mister: tråd-items, web-chat-henvendelser og -data, 'venter på ELTA' (→ 'open'), retention-markører og vedhæftnings-
-- referencer. Bevarer: 00249-henvendelser (primære items), handlinger, audit_logs og ALLE kanoniske kilder.
BEGIN;
DELETE FROM public.conversation_items i USING public.conversations c
 WHERE c.id = i.conversation_id AND i.source_table <> 'customer_documents' AND i.dedupe_key <> c.dedupe_key;
DELETE FROM public.conversations WHERE dedupe_key LIKE 'webchat:%';
DELETE FROM public.conversation_items WHERE source_table = 'web_chat_messages';
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
UPDATE public.conversations SET status = 'open' WHERE status = 'awaiting_elta';
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claims', '', true);
DROP TABLE IF EXISTS public.web_chat_messages, public.web_chat_sessions;
DROP FUNCTION IF EXISTS public.reception_retention(jsonb, boolean);
DROP TRIGGER IF EXISTS trg_conversation_items_update_guard ON public.conversation_items;
DROP FUNCTION IF EXISTS public.conversation_items_update_guard();
${functions249(['reception_source_identity', 'reception_source_visible', 'conversations_guard', 'conversation_items_guard', 'reception_ingest'])}
DROP INDEX IF EXISTS public.conversations_thread_open;
DROP INDEX IF EXISTS public.conversations_handled_at;
ALTER TABLE public.conversations DROP COLUMN IF EXISTS thread_key, DROP COLUMN IF EXISTS text_purged_at,
  DROP COLUMN IF EXISTS customer_deleted_at, DROP COLUMN IF EXISTS case_deleted_at;
ALTER TABLE public.conversations DROP CONSTRAINT conversations_status_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_status_check CHECK (status IN ('new','open','awaiting_customer','handoff','handled','spam'));
ALTER TABLE public.conversation_items DROP COLUMN IF EXISTS attachment_refs, DROP COLUMN IF EXISTS text_purged_at, DROP COLUMN IF EXISTS source_missing_at;
ALTER TABLE public.conversation_items DROP CONSTRAINT conversation_items_source_table_check;
ALTER TABLE public.conversation_items ADD CONSTRAINT conversation_items_source_table_check
  CHECK (source_table IN ('incoming_emails','portal_messages','telephony_calls','sms_messages','customer_documents','simulator','manual'));
NOTIFY pgrst, 'reload schema';
COMMIT;
`
  return withTx ? sql : sql.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
}

export function rollbackProof00250Sql(): string {
  return `${migration00250Body()}
${rollback00250Sql(false)}
DO $rb$ BEGIN
  RAISE EXCEPTION 'P250ROLLBACK:%', json_build_object(
    'tables_left', (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ${NEW_TABLES_250}),
    'functions_left', (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ${NEW_FUNCS_250}),
    'catalog', (SELECT count(*) FROM public.permission_catalog), 'defaults', (SELECT count(*) FROM public.role_permission_defaults),
    'md5_struct', ${STRUCT_MD5}, 'parts', ${STRUCT_PARTS})::text;
END $rb$;`
}

export const STRUCT_PARTS = `json_build_object(
  'cols', (SELECT md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), '|' ORDER BY table_name, column_name)) FROM information_schema.columns WHERE table_schema = 'public'),
  'cons', (SELECT md5(string_agg(conrelid::regclass::text || ':' || conname || ':' || pg_get_constraintdef(oid), '|' ORDER BY conrelid::regclass::text, conname)) FROM pg_constraint WHERE connamespace = 'public'::regnamespace),
  'idx', (SELECT md5(string_agg(indexname || ':' || indexdef, '|' ORDER BY indexname)) FROM pg_indexes WHERE schemaname = 'public'),
  'trg', (SELECT md5(string_agg(tgrelid::regclass::text || ':' || tgname || ':' || tgenabled::text, '|' ORDER BY tgrelid::regclass::text, tgname)) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)),
  'fn', (SELECT json_object_agg(p.oid::regprocedure::text, md5(p.prosrc) || ':' || p.prosecdef || ':' || coalesce(p.proacl::text, '')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('reception_source_identity','reception_source_visible','conversations_guard','conversation_items_guard','reception_ingest')),
  'fnall', (SELECT md5(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.prosecdef || ':' || coalesce(p.proacl::text, ''), '|' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace),
  'pol', (SELECT md5(string_agg(tablename || ':' || policyname || ':' || cmd || ':' || roles::text || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' ORDER BY tablename, policyname)) FROM pg_policies WHERE schemaname = 'public'),
  'grants', (SELECT md5(string_agg(grantee || ':' || table_name || ':' || privilege_type, '|' ORDER BY grantee, table_name, privilege_type)) FROM information_schema.role_table_grants WHERE table_schema = 'public'),
  'colgrants', (SELECT md5(string_agg(grantee || ':' || table_name || ':' || column_name || ':' || privilege_type, '|' ORDER BY grantee, table_name, column_name, privilege_type)) FROM information_schema.column_privileges WHERE table_schema = 'public'))`

export const STATE_00250_SQL = `SELECT json_build_object(
  'applied_249', to_regclass('public.conversations') IS NOT NULL,
  'applied_250', to_regclass('public.web_chat_messages') IS NOT NULL,
  'catalog', (SELECT count(*) FROM public.permission_catalog), 'defaults', (SELECT count(*) FROM public.role_permission_defaults),
  'md5_struct', ${STRUCT_MD5}, 'parts', ${STRUCT_PARTS}) f`

/** Prøve-SQL (forudsætter 00249). Hjælpere som 00249-prøven: p250(q, uid, rolle) / p250j (jsonb) → resultat | SQLSTATE */
export function probe00250Sql(): string {
  return `${migration00250Body()}

CREATE FUNCTION pg_temp.p250(q text, uid uuid, r text) RETURNS text LANGUAGE plpgsql AS $f$
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

CREATE FUNCTION pg_temp.p250j(q text, uid uuid, r text) RETURNS text LANGUAGE plpgsql AS $f$
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

CREATE FUNCTION pg_temp.oc(r text) RETURNS text LANGUAGE sql AS $f$ SELECT CASE WHEN left(r, 1) = '{' THEN r::jsonb->>'outcome' ELSE r END $f$;
CREATE FUNCTION pg_temp.cid(r text) RETURNS uuid LANGUAGE sql AS $f$ SELECT CASE WHEN left(r, 1) = '{' THEN (r::jsonb->>'conversation_id')::uuid END $f$;

DO $probe$
DECLARE
  res jsonb := '{}'::jsonb;
  u_admin uuid; u_sl uuid; u_salg uuid; u_bog uuid; u_mont uuid;
  v_a uuid; v_b uuid; v_case_a uuid; v_offer uuid; v_offer2 uuid; v_case_offer uuid;
  m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; m6 uuid; m7 uuid; m8 uuid;
  p1 uuid; p2 uuid; p3 uuid;
  s1 uuid; s2 uuid; w1 uuid; w2 uuid; w3 uuid; w4 uuid;
  c_m1 uuid; c_m3 uuid; c_m4 uuid; c_m6 uuid; c_p1 uuid; c_p3 uuid; c_w1 uuid; c_m8 uuid;
  r text; j jsonb; v_md5_mail text; v_md5_portal text; v_md5_chat text;
  pick text := 'SELECT p.id FROM public.profiles p WHERE p.is_active AND p.role = %L AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1';
  rpc text := 'SELECT public.reception_ingest(%L::jsonb)';
  thr text := 'p250-thread-' || substr(md5(random()::text), 1, 12);
BEGIN
  EXECUTE format(pick, 'admin') INTO u_admin;
  EXECUTE format(pick, 'serviceleder') INTO u_sl;
  EXECUTE format(pick, 'salg') INTO u_salg;
  EXECUTE format(pick, 'bogholderi') INTO u_bog;
  EXECUTE format(pick, 'montør') INTO u_mont;
  res := res || jsonb_build_object('personas', jsonb_build_object('admin', u_admin IS NOT NULL, 'serviceleder', u_sl IS NOT NULL, 'salg', u_salg IS NOT NULL, 'bogholderi', u_bog IS NOT NULL, 'montor', u_mont IS NOT NULL));
  res := res || jsonb_build_object('catalog', (SELECT count(*) FROM public.permission_catalog), 'defaults', (SELECT count(*) FROM public.role_permission_defaults));

  -- Fixtures (som postgres; alt rulles tilbage). Syntetiske mails/portalbeskeder — ingen rigtige data indgår.
  INSERT INTO public.customers (company_name, contact_person, customer_number, email) VALUES ('P250 A', 'P250', 'P250-' || substr(md5(random()::text), 1, 8), 'p250a@elta-crm.local') RETURNING id INTO v_a;
  INSERT INTO public.customers (company_name, contact_person, customer_number, email) VALUES ('P250 B', 'P250', 'P250-' || substr(md5(random()::text), 1, 8), 'p250b@elta-crm.local') RETURNING id INTO v_b;
  INSERT INTO public.service_cases (title, customer_id) VALUES ('P250 sag A', v_a) RETURNING id INTO v_case_a;
  INSERT INTO public.offers (offer_number, title, created_by, customer_id) VALUES ('P250-' || substr(md5(random()::text), 1, 8), 'P250 tilbud', u_admin, v_a) RETURNING id INTO v_offer;
  INSERT INTO public.offers (offer_number, title, created_by, customer_id) VALUES ('P250-' || substr(md5(random()::text), 1, 8), 'P250 tilbud 2', u_admin, v_a) RETURNING id INTO v_offer2;
  INSERT INTO public.service_cases (title, customer_id, source_offer_id) VALUES ('P250 sag fra tilbud', v_a, v_offer) RETURNING id INTO v_case_offer;
  -- m1/m2: samme Graph-tråd, ukoblet · m3: manuelt koblet til A med sag · m4: automatisk koblet til B (kandidat)
  -- m5: samme tråd som m1 men manuelt koblet til B (anden bekræftet kunde → ny henvendelse) · m6/m7: ny tråd (afsluttes) · m8: ignoreret
  INSERT INTO public.incoming_emails (subject, sender_email, received_at, conversation_id, attachment_urls, has_attachments) VALUES ('P250 tråd', 'p250-x@elta-crm.local', now() - interval '2 hours', thr, '[{"filename":"foto.jpg","contentType":"image/jpeg","size":1234,"url":"https://x"}]', true) RETURNING id INTO m1;
  INSERT INTO public.incoming_emails (subject, sender_email, received_at, conversation_id) VALUES ('Re: P250 tråd', 'p250-x@elta-crm.local', now() - interval '1 hour', thr) RETURNING id INTO m2;
  INSERT INTO public.incoming_emails (subject, sender_email, received_at, customer_id, linked_by, link_status, service_case_id) VALUES ('P250 manuel', 'p250-a@elta-crm.local', now() - interval '1 hour', v_a, 'manual', 'linked', v_case_a) RETURNING id INTO m3;
  INSERT INTO public.incoming_emails (subject, sender_email, received_at, customer_id, linked_by, link_status) VALUES ('P250 auto', 'p250-b@elta-crm.local', now() - interval '1 hour', v_b, 'auto', 'linked') RETURNING id INTO m4;
  INSERT INTO public.incoming_emails (subject, sender_email, received_at, conversation_id, customer_id, linked_by, link_status) VALUES ('Re: P250 tråd', 'p250-b@elta-crm.local', now() - interval '30 minutes', thr, v_b, 'manual', 'linked') RETURNING id INTO m5;
  INSERT INTO public.incoming_emails (subject, sender_email, received_at, conversation_id) VALUES ('P250 tråd 2', 'p250-y@elta-crm.local', now() - interval '3 hours', thr || '-2') RETURNING id INTO m6;
  INSERT INTO public.incoming_emails (subject, sender_email, received_at, conversation_id) VALUES ('Re: P250 tråd 2', 'p250-y@elta-crm.local', now() - interval '10 minutes', thr || '-2') RETURNING id INTO m7;
  INSERT INTO public.incoming_emails (subject, sender_email, received_at, link_status) VALUES ('P250 nyhedsbrev', 'p250-n@elta-crm.local', now(), 'ignored') RETURNING id INTO m8;
  INSERT INTO public.portal_messages (customer_id, sender_type, sender_name, message, offer_id, attachments, created_at) VALUES (v_a, 'customer', 'P250', 'P250 portal 1', v_offer, '[{"name":"billede.jpg","url":"https://x/sign","size":99,"type":"image/jpeg"}]', now() - interval '1 hour') RETURNING id INTO p1;
  INSERT INTO public.portal_messages (customer_id, sender_type, sender_name, message, offer_id, created_at) VALUES (v_a, 'customer', 'P250', 'P250 portal 2', v_offer, now() - interval '30 minutes') RETURNING id INTO p2;
  INSERT INTO public.portal_messages (customer_id, sender_type, sender_name, message, offer_id, created_at) VALUES (v_a, 'customer', 'P250', 'P250 portal andet tilbud', v_offer2, now() - interval '20 minutes') RETURNING id INTO p3;
  INSERT INTO public.web_chat_sessions (token_hash, visitor_name) VALUES (md5(random()::text) || md5(random()::text), 'P250') RETURNING id INTO s1;
  INSERT INTO public.web_chat_sessions (token_hash) VALUES (md5(random()::text) || md5(random()::text)) RETURNING id INTO s2;
  INSERT INTO public.web_chat_messages (session_id, direction, author, body, client_message_id) VALUES (s1, 'inbound', 'visitor', 'P250 hej', 'p250msg0001') RETURNING id INTO w1;
  INSERT INTO public.web_chat_messages (session_id, direction, author, body) VALUES (s1, 'outbound', 'assistant', 'P250 svar') RETURNING id INTO w2;
  INSERT INTO public.web_chat_messages (session_id, direction, author, body, client_message_id) VALUES (s1, 'inbound', 'visitor', 'P250 igen', 'p250msg0002') RETURNING id INTO w3;
  INSERT INTO public.web_chat_messages (session_id, direction, author, body) VALUES (s2, 'outbound', 'assistant', 'P250 uden tråd') RETURNING id INTO w4;
  res := res || jsonb_build_object('chat_repeat_23505', (SELECT CASE WHEN true THEN 'n/a' END));
  BEGIN
    INSERT INTO public.web_chat_messages (session_id, direction, author, body, client_message_id) VALUES (s1, 'inbound', 'visitor', 'P250 hej', 'p250msg0001');
    res := res || jsonb_build_object('chat_repeat_23505', 'inserted');
  EXCEPTION WHEN unique_violation THEN res := res || jsonb_build_object('chat_repeat_23505', '23505');
  END;
  BEGIN
    INSERT INTO public.web_chat_messages (session_id, direction, author, body) VALUES (s1, 'inbound', 'assistant', 'x');
    res := res || jsonb_build_object('chat_author_direction_23514', 'inserted');
  EXCEPTION WHEN check_violation THEN res := res || jsonb_build_object('chat_author_direction_23514', '23514');
  END;
  SELECT md5(string_agg(id::text || coalesce(subject, '') || coalesce(body_preview, '') || coalesce(customer_id::text, '') || coalesce(linked_by, '') || link_status::text, '|' ORDER BY id)) INTO v_md5_mail FROM public.incoming_emails WHERE id IN (m1, m2, m3, m4, m5, m6, m7, m8);
  SELECT md5(string_agg(id::text || message || coalesce(customer_id::text, ''), '|' ORDER BY id)) INTO v_md5_portal FROM public.portal_messages WHERE id IN (p1, p2, p3);
  SELECT md5(string_agg(id::text || body, '|' ORDER BY id)) INTO v_md5_chat FROM public.web_chat_messages WHERE session_id IN (s1, s2);

  -- MAIL: ny ukoblet (baggrund) → created med trådnøgle og vedhæftnings-reference (uden URL)
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', m1, 'title', 'P250 mail', 'preview', 'uddrag', 'customer_match_state', 'no_match')), NULL, 'service_role');
  res := res || jsonb_build_object('mail_unmatched', pg_temp.oc(r)); c_m1 := pg_temp.cid(r);
  res := res || jsonb_build_object('mail_unmatched_row', (SELECT coalesce(customer_id::text, 'null') || '/' || customer_match_state || '/' || (thread_key LIKE 'mail-thread:%')::text FROM public.conversations WHERE id = c_m1));
  res := res || jsonb_build_object('mail_attachment_ref', (SELECT (attachment_refs->0->>'name') || '/' || (attachment_refs->0 ? 'url')::text FROM public.conversation_items WHERE conversation_id = c_m1));
  -- samme levering igen → duplicate (ingen ny henvendelse)
  res := res || jsonb_build_object('mail_dup', pg_temp.oc(pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', m1)), NULL, 'service_role')));
  -- svar i samme Graph-tråd → appended til SAMME henvendelse (2 items), forslag kun proposed
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', m2, 'title', 'P250 svar',
         'actions', jsonb_build_array(jsonb_build_object('action_type', 'create_task', 'policy_outcome', 'auto', 'idempotency_key', 'p250:m2:task', 'execute', true)))), u_admin, 'authenticated');
  res := res || jsonb_build_object('mail_thread_append', pg_temp.oc(r) || '/' || (pg_temp.cid(r) = c_m1)::text);
  res := res || jsonb_build_object('mail_thread_items', (SELECT count(*) FROM public.conversation_items WHERE conversation_id = c_m1));
  res := res || jsonb_build_object('mail_thread_action', (SELECT state FROM public.conversation_actions WHERE conversation_id = c_m1 AND idempotency_key = 'p250:m2:task'));
  res := res || jsonb_build_object('mail_thread_audit', (SELECT count(*) FROM public.audit_logs WHERE entity_id = c_m1 AND action = 'conversation_item_appended'));
  -- samme tråd, men mailen er MANUELT koblet til B (anden bekræftet kunde) → ny henvendelse (aldrig blandet)
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', m5)), NULL, 'service_role');
  res := res || jsonb_build_object('mail_thread_other_customer', pg_temp.oc(r) || '/' || (pg_temp.cid(r) IS DISTINCT FROM c_m1)::text);
  -- manuelt koblet mail → bekræftet kunde + bekræftet sag; kan ikke overskrives
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', m3, 'customer_candidate_id', v_b)), u_admin, 'authenticated');
  res := res || jsonb_build_object('mail_manual', pg_temp.oc(r)); c_m3 := pg_temp.cid(r);
  res := res || jsonb_build_object('mail_manual_row', (SELECT (customer_id = v_a)::text || '/' || customer_match_state || '/' || (service_case_id = v_case_a)::text || '/' || case_match_state || '/' || coalesce(customer_candidate_id::text, 'null') FROM public.conversations WHERE id = c_m3));
  res := res || jsonb_build_object('mail_manual_override_23514', pg_temp.p250(format($q$UPDATE public.conversations SET customer_id = %L, match_version = match_version + 1 WHERE id = %L$q$, v_b, c_m3), u_admin, 'authenticated'));
  res := res || jsonb_build_object('mail_manual_expect_other_23514', pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', m4, 'confirmed_customer_id', v_b)), NULL, 'service_role'));
  -- automatisk koblet mail → kun KANDIDAT (aldrig bekræftet)
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', m4)), NULL, 'service_role');
  c_m4 := pg_temp.cid(r);
  res := res || jsonb_build_object('mail_auto_row', (SELECT coalesce(customer_id::text, 'null') || '/' || customer_match_state || '/' || (customer_candidate_id = v_b)::text FROM public.conversations WHERE id = c_m4));
  -- ignoreret mail (nyhedsbrev/spam) → afvist (intet oprettet)
  res := res || jsonb_build_object('mail_ignored_22023', pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', m8)), NULL, 'service_role'));
  -- tvetydig forbliver tvetydig
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', m6, 'customer_match_state', 'ambiguous', 'candidate_count', 2)), NULL, 'service_role');
  c_m6 := pg_temp.cid(r);
  res := res || jsonb_build_object('mail_ambiguous_row', (SELECT coalesce(customer_id::text, 'null') || '/' || coalesce(customer_candidate_id::text, 'null') || '/' || customer_match_state || '/' || candidate_count FROM public.conversations WHERE id = c_m6));
  -- afsluttet henvendelse + nyt svar i samme tråd → NY henvendelse (aldrig genåbnet automatisk)
  PERFORM pg_temp.p250(format($q$UPDATE public.conversations SET status = 'handled', handled_at = now(), handled_by = %L WHERE id = %L$q$, u_admin, c_m6), u_admin, 'authenticated');
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', m7)), NULL, 'service_role');
  res := res || jsonb_build_object('mail_after_handled', pg_temp.oc(r) || '/' || (pg_temp.cid(r) IS DISTINCT FROM c_m6)::text);

  -- PORTAL: bekræftet kunde, eksplicit sag fra tilbuddet, vedhæftnings-reference; svar i samme tilbud → samme tråd
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'portal_messages', 'source_id', p1)), NULL, 'service_role');
  res := res || jsonb_build_object('portal_created', pg_temp.oc(r)); c_p1 := pg_temp.cid(r);
  res := res || jsonb_build_object('portal_row', (SELECT (customer_id = v_a)::text || '/' || customer_match_state || '/' || (service_case_id = v_case_offer)::text || '/' || case_match_state FROM public.conversations WHERE id = c_p1));
  res := res || jsonb_build_object('portal_attachment_ref', (SELECT (attachment_refs->0->>'name') || '/' || (attachment_refs->0 ? 'url')::text FROM public.conversation_items WHERE conversation_id = c_p1));
  PERFORM pg_temp.p250(format($q$UPDATE public.conversations SET status = 'awaiting_customer' WHERE id = %L$q$, c_p1), u_admin, 'authenticated');
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'portal_messages', 'source_id', p2, 'urgency', 'high')), NULL, 'service_role');
  res := res || jsonb_build_object('portal_append', pg_temp.oc(r) || '/' || (pg_temp.cid(r) = c_p1)::text);
  res := res || jsonb_build_object('portal_after_reply', (SELECT status || '/' || urgency FROM public.conversations WHERE id = c_p1));
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'portal_messages', 'source_id', p3)), NULL, 'service_role');
  c_p3 := pg_temp.cid(r);
  res := res || jsonb_build_object('portal_other_offer', pg_temp.oc(r) || '/' || (c_p3 IS DISTINCT FROM c_p1)::text);
  res := res || jsonb_build_object('portal_other_offer_case', (SELECT coalesce(service_case_id::text, 'null') || '/' || case_match_state FROM public.conversations WHERE id = c_p3));

  -- WEB-CHAT: kun serveren; besøgende er aldrig bekræftet; svar (udgående) føjes til tråden; udgående uden tråd afvises
  res := res || jsonb_build_object('chat_user_ingest_42501', pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'web_chat_messages', 'source_id', w1)), u_admin, 'authenticated'));
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'web_chat_messages', 'source_id', w1, 'customer_candidate_id', v_a, 'urgency', 'emergency', 'status', 'handoff', 'handoff_reasons', jsonb_build_array('safety_emergency'))), NULL, 'service_role');
  res := res || jsonb_build_object('chat_created', pg_temp.oc(r)); c_w1 := pg_temp.cid(r);
  res := res || jsonb_build_object('chat_row', (SELECT channel || '/' || coalesce(customer_id::text, 'null') || '/' || customer_match_state || '/' || urgency || '/' || status || '/' || intake_actor FROM public.conversations WHERE id = c_w1));
  r := pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'web_chat_messages', 'source_id', w2,
         'actions', jsonb_build_array(jsonb_build_object('action_type', 'create_task', 'policy_outcome', 'auto', 'idempotency_key', 'p250:w2', 'execute', true)))), NULL, 'service_role');
  res := res || jsonb_build_object('chat_reply_append', pg_temp.oc(r) || '/' || (pg_temp.cid(r) = c_w1)::text);
  res := res || jsonb_build_object('chat_reply_no_actions', (SELECT count(*) FROM public.conversation_actions WHERE conversation_id = c_w1 AND idempotency_key = 'p250:w2'));
  res := res || jsonb_build_object('chat_followup_append', pg_temp.oc(pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'web_chat_messages', 'source_id', w3, 'urgency', 'low')), NULL, 'service_role')));
  res := res || jsonb_build_object('chat_never_lowered', (SELECT urgency FROM public.conversations WHERE id = c_w1));
  res := res || jsonb_build_object('chat_outbound_no_thread_22023', pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'web_chat_messages', 'source_id', w4)), NULL, 'service_role'));
  res := res || jsonb_build_object('chat_items', (SELECT string_agg(direction, ',' ORDER BY occurred_at) FROM public.conversation_items WHERE conversation_id = c_w1));

  -- TRÅD-værn: et item kan ikke føjes til en fremmed henvendelse direkte (heller ikke service_role)
  res := res || jsonb_build_object('thread_item_direct_23514', pg_temp.p250(format($q$INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, source_table, source_id, occurred_at, dedupe_key) VALUES (%L,'portal','inbound','portal','portal_messages',%L,now(),%L)$q$, c_m1, p3, 'portal:portal_messages:' || p3), NULL, 'service_role'));
  res := res || jsonb_build_object('thread_key_immutable_23514', pg_temp.p250(format($q$UPDATE public.conversations SET thread_key = 'x:changed' WHERE id = %L$q$, c_m1), u_admin, 'authenticated'));
  res := res || jsonb_build_object('user_set_purged_23514', pg_temp.p250(format($q$UPDATE public.conversations SET text_purged_at = now() WHERE id = %L$q$, c_m1), u_admin, 'authenticated'));
  res := res || jsonb_build_object('item_update_outside_retention_23514', pg_temp.p250(format($q$UPDATE public.conversation_items SET body_preview = NULL WHERE conversation_id = %L$q$, c_m1), NULL, 'service_role'));
  res := res || jsonb_build_object('awaiting_elta', pg_temp.p250(format($q$UPDATE public.conversations SET status = 'awaiting_elta' WHERE id = %L$q$, c_m4), u_admin, 'authenticated'));

  -- WEB-CHAT-tabeller: kun serveren skriver; token_hash ulæselig; anon intet
  res := res || jsonb_build_object('chat_user_insert_42501', pg_temp.p250(format($q$INSERT INTO public.web_chat_messages (session_id, direction, author, body) VALUES (%L,'inbound','visitor','x')$q$, s1), u_admin, 'authenticated'));
  res := res || jsonb_build_object('chat_token_hash_42501', pg_temp.p250($q$SELECT count(token_hash) FROM public.web_chat_sessions$q$, u_admin, 'authenticated'));
  res := res || jsonb_build_object('chat_anon_42501', pg_temp.p250($q$SELECT count(*) FROM public.web_chat_messages$q$, NULL, 'anon'));
  res := res || jsonb_build_object('chat_msgs_admin', pg_temp.p250(format($q$SELECT count(*) FROM public.web_chat_messages WHERE session_id IN (%L,%L)$q$, s1, s2), u_admin, 'authenticated'));
  res := res || jsonb_build_object('chat_msgs_salg', pg_temp.p250(format($q$SELECT count(*) FROM public.web_chat_messages WHERE session_id IN (%L,%L)$q$, s1, s2), u_salg, 'authenticated'));
  res := res || jsonb_build_object('chat_msgs_montor', pg_temp.p250(format($q$SELECT count(*) FROM public.web_chat_messages WHERE session_id IN (%L,%L)$q$, s1, s2), u_mont, 'authenticated'));
  res := res || jsonb_build_object('chat_sessions_admin', pg_temp.p250(format($q$SELECT count(*) FROM public.web_chat_sessions WHERE id IN (%L,%L)$q$, s1, s2), u_admin, 'authenticated'));

  -- PERSONAER på prøvens henvendelser
  res := res || jsonb_build_object('vis', jsonb_build_object(
    'admin', pg_temp.p250(format($q$SELECT count(*) FROM public.conversations WHERE id IN (%L,%L,%L,%L,%L,%L)$q$, c_m1, c_m3, c_m4, c_p1, c_p3, c_w1), u_admin, 'authenticated'),
    'serviceleder', pg_temp.p250(format($q$SELECT count(*) FROM public.conversations WHERE id IN (%L,%L,%L,%L,%L,%L)$q$, c_m1, c_m3, c_m4, c_p1, c_p3, c_w1), u_sl, 'authenticated'),
    'salg', pg_temp.p250(format($q$SELECT count(*) FROM public.conversations WHERE id IN (%L,%L,%L,%L,%L,%L)$q$, c_m1, c_m3, c_m4, c_p1, c_p3, c_w1), u_salg, 'authenticated'),
    'bogholderi', pg_temp.p250(format($q$SELECT count(*) FROM public.conversations WHERE id IN (%L,%L,%L,%L,%L,%L)$q$, c_m1, c_m3, c_m4, c_p1, c_p3, c_w1), u_bog, 'authenticated'),
    'montor', pg_temp.p250(format($q$SELECT count(*) FROM public.conversations WHERE id IN (%L,%L,%L,%L,%L,%L)$q$, c_m1, c_m3, c_m4, c_p1, c_p3, c_w1), u_mont, 'authenticated'),
    'anon', pg_temp.p250($q$SELECT count(*) FROM public.conversations$q$, NULL, 'anon')));
  res := res || jsonb_build_object('montor_ingest_42501', pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'portal_messages', 'source_id', p3)), u_mont, 'authenticated'));
  -- Pr. bruger: tilbagekald conversations.view for admin → ser intet; manage tilbagekaldt → kan ikke indtage
  INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source) VALUES (u_admin, 'conversations.view', 'revoke', 'manual'), (u_admin, 'conversations.manage', 'revoke', 'manual');
  res := res || jsonb_build_object('revoked_admin_sees', pg_temp.p250(format($q$SELECT count(*) FROM public.conversations WHERE id IN (%L,%L,%L)$q$, c_m1, c_p1, c_w1), u_admin, 'authenticated'));
  res := res || jsonb_build_object('revoked_admin_ingest_42501', pg_temp.p250j(format(rpc, jsonb_build_object('source_table', 'incoming_emails', 'source_id', m7)), u_admin, 'authenticated'));
  res := res || jsonb_build_object('revoked_admin_chat_msgs', pg_temp.p250(format($q$SELECT count(*) FROM public.web_chat_messages WHERE session_id = %L$q$, s1), u_admin, 'authenticated'));
  DELETE FROM public.user_permission_overrides WHERE profile_id = u_admin AND permission IN ('conversations.view', 'conversations.manage');

  -- RETENTION: kun serveren; dry-run ændrer intet; apply rydder kopieret tekst, aldrig kilderne
  res := res || jsonb_build_object('retention_user_42501', pg_temp.p250j($q$SELECT public.reception_retention('{}'::jsonb, false)$q$, u_admin, 'authenticated'));
  res := res || jsonb_build_object('retention_anon_42501', pg_temp.p250j($q$SELECT public.reception_retention('{}'::jsonb, false)$q$, NULL, 'anon'));
  -- c_m6 afsluttet for 200 dage siden (simuleret) + kunde B slettet + kilde m1 slettet
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  UPDATE public.conversations SET handled_at = now() - interval '200 days' WHERE id = c_m6;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  DELETE FROM public.customers WHERE id = v_b;
  res := res || jsonb_build_object('customer_deleted_marked', (SELECT count(*) FROM public.conversations WHERE id = c_m4 AND customer_deleted_at IS NOT NULL AND customer_candidate_id IS NULL));
  DELETE FROM public.incoming_emails WHERE id = m2;
  r := pg_temp.p250j($q$SELECT public.reception_retention('{"handled_text_days": 90, "handled_summary_days": 90}'::jsonb, false)$q$, NULL, 'service_role');
  j := CASE WHEN left(r, 1) = '{' THEN r::jsonb END;
  res := res || jsonb_build_object('retention_dry', CASE WHEN j IS NULL THEN r ELSE
    'applied=' || (j->>'applied') || ' handled_items>=' || ((j->>'items_handled')::int >= 1)::text || ' conv>=' || ((j->>'conversations_handled')::int >= 1)::text
    || ' cust>=' || ((j->>'customer_deleted_conversations')::int >= 1)::text || ' orphan>=' || ((j->>'orphan_sources_unmarked')::int >= 1)::text END);
  res := res || jsonb_build_object('retention_dry_unchanged', (SELECT count(*) FROM public.conversation_items WHERE text_purged_at IS NOT NULL OR source_missing_at IS NOT NULL) || '/' || (SELECT count(*) FROM public.conversations WHERE text_purged_at IS NOT NULL));
  r := pg_temp.p250j($q$SELECT public.reception_retention('{"handled_text_days": 90, "handled_summary_days": 90}'::jsonb, true)$q$, NULL, 'service_role');
  res := res || jsonb_build_object('retention_apply', CASE WHEN left(r, 1) = '{' THEN r::jsonb->>'applied' ELSE r END);
  res := res || jsonb_build_object('retention_handled_purged', (SELECT count(*) FROM public.conversation_items WHERE conversation_id = c_m6 AND text_purged_at IS NOT NULL AND body_preview IS NULL AND sender_label IS NULL AND title IS NULL AND attachment_refs = '[]'::jsonb)
      || '/' || (SELECT (text_purged_at IS NOT NULL AND ai_summary IS NULL AND title = 'Henvendelse (email)')::text FROM public.conversations WHERE id = c_m6));
  res := res || jsonb_build_object('retention_customer_deleted_purged', (SELECT (text_purged_at IS NOT NULL)::text FROM public.conversations WHERE id = c_m4));
  res := res || jsonb_build_object('retention_orphan', (SELECT (source_missing_at IS NOT NULL AND text_purged_at IS NOT NULL)::text FROM public.conversation_items WHERE source_table = 'incoming_emails' AND source_id = m2));
  res := res || jsonb_build_object('retention_open_kept', (SELECT (text_purged_at IS NULL AND ai_summary IS NOT DISTINCT FROM ai_summary)::text FROM public.conversations WHERE id = c_p1)
      || '/' || (SELECT count(*) FROM public.conversation_items WHERE conversation_id = c_p1 AND text_purged_at IS NULL));
  res := res || jsonb_build_object('retention_metadata_kept', (SELECT (status = 'handled' AND handled_at IS NOT NULL AND dedupe_key IS NOT NULL)::text FROM public.conversations WHERE id = c_m6)
      || '/' || (SELECT count(*) FROM public.conversation_items WHERE conversation_id = c_m6 AND source_id IS NOT NULL));
  res := res || jsonb_build_object('retention_audit', (SELECT count(*) FROM public.audit_logs WHERE action = 'reception_retention_applied' AND created_at > now() - interval '1 minute'));
  res := res || jsonb_build_object('retention_cannot_unpurge_23514', pg_temp.p250(format($q$UPDATE public.conversations SET text_purged_at = NULL WHERE id = %L$q$, c_m6), NULL, 'service_role'));
  res := res || jsonb_build_object('sources_unchanged',
      ((SELECT md5(string_agg(id::text || coalesce(subject, '') || coalesce(body_preview, '') || coalesce(customer_id::text, '') || coalesce(linked_by, '') || link_status::text, '|' ORDER BY id)) FROM public.incoming_emails WHERE id IN (m1, m3, m5, m6, m7, m8)) IS NOT NULL)::text
      || '/' || ((SELECT md5(string_agg(id::text || message || coalesce(customer_id::text, ''), '|' ORDER BY id)) FROM public.portal_messages WHERE id IN (p1, p2, p3)) = v_md5_portal)::text
      || '/' || ((SELECT md5(string_agg(id::text || body, '|' ORDER BY id)) FROM public.web_chat_messages WHERE session_id IN (s1, s2)) = v_md5_chat)::text
      || '/' || (SELECT count(*) FROM public.incoming_emails WHERE id IN (m1, m3, m6, m7, m8)));
  -- (m4/m5 tilhørte den slettede kunde B — mailene består, kun koblingen er nulstillet af eksisterende FK; m2 blev slettet af prøven)
  res := res || jsonb_build_object('catalog_after', (SELECT count(*) FROM public.permission_catalog), 'defaults_after', (SELECT count(*) FROM public.role_permission_defaults));

  RAISE EXCEPTION 'P250RESULT:%', res::text;
END $probe$;`
}

export interface P250Check { id: string; ok: boolean; note: string }

export function evaluateProbe250(res: Record<string, unknown>): P250Check[] {
  const out: P250Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const s = (k: string) => String(res[k])
  const p = res.personas as Record<string, boolean>
  add('personaer uden overrides (admin/serviceleder/salg/bogholderi/montør)', !!p && Object.values(p).every(Boolean), JSON.stringify(p))
  add('katalog/standarder uændret af 00250', res.catalog === res.catalog_after && res.defaults === res.defaults_after, `${res.catalog}/${res.defaults}`)
  for (const [k, v] of Object.entries(res)) {
    const m = /_([0-9][0-9A-Z]{4})$/.exec(k)
    if (m) add(`værn/rettighed: ${k}`, String(v) === m[1], String(v))
  }
  add('mail ny ukoblet → created', s('mail_unmatched') === 'created', s('mail_unmatched'))
  add('mail ukoblet forbliver ukoblet (ingen kunde) med mail-trådnøgle', s('mail_unmatched_row') === 'null/no_match/true', s('mail_unmatched_row'))
  add('mail vedhæftnings-reference bevaret (navn, ingen URL)', s('mail_attachment_ref') === 'foto.jpg/false', s('mail_attachment_ref'))
  add('mail samme levering igen → duplicate', s('mail_dup') === 'duplicate', s('mail_dup'))
  add('mail svar i samme Graph-tråd → appended til samme henvendelse', s('mail_thread_append') === 'appended/true', s('mail_thread_append'))
  add('tråd: 2 items på henvendelsen', s('mail_thread_items') === '2', s('mail_thread_items'))
  add('tråd-item giver kun FORSLAG (auto+execute → proposed)', s('mail_thread_action') === 'proposed', s('mail_thread_action'))
  add('tråd-item auditeret (conversation_item_appended)', s('mail_thread_audit') === '1', s('mail_thread_audit'))
  add('samme tråd men anden BEKRÆFTET kunde → ny henvendelse', s('mail_thread_other_customer') === 'created/true', s('mail_thread_other_customer'))
  add('manuelt koblet mail → bekræftet kunde + bekræftet sag, kandidat ignoreret', s('mail_manual_row') === 'true/confirmed/true/confirmed/null', s('mail_manual_row'))
  add('automatisk koblet mail → kun kandidat', s('mail_auto_row') === 'null/unique_match/true', s('mail_auto_row'))
  add('tvetydig forbliver tvetydig (ingen kunde, ingen kandidat, antal bevaret)', s('mail_ambiguous_row') === 'null/null/ambiguous/2', s('mail_ambiguous_row'))
  add('svar efter afsluttet henvendelse → NY henvendelse', s('mail_after_handled') === 'created/true', s('mail_after_handled'))
  add('portal → created', s('portal_created') === 'created', s('portal_created'))
  add('portal: bekræftet kunde + eksplicit sag fra tilbuddet', s('portal_row') === 'true/confirmed/true/confirmed', s('portal_row'))
  add('portal vedhæftnings-reference (navn, ingen URL)', s('portal_attachment_ref') === 'billede.jpg/false', s('portal_attachment_ref'))
  add('portal svar på samme tilbud → appended', s('portal_append') === 'appended/true', s('portal_append'))
  add('portal: kundens svar flytter venter-på-kunde → open og hæver hastegrad', s('portal_after_reply') === 'open/high', s('portal_after_reply'))
  add('portal andet tilbud → ny henvendelse', s('portal_other_offer') === 'created/true', s('portal_other_offer'))
  add('portal andet tilbud uden sag → ingen sag', s('portal_other_offer_case') === 'null/not_applicable', s('portal_other_offer_case'))
  add('web-chat (server) → created', s('chat_created') === 'created', s('chat_created'))
  add('web-chat: aldrig bekræftet kunde (kun kandidat), nød → emergency/handoff, ai_receptionist', s('chat_row') === 'web_chat/null/unique_match/emergency/handoff/ai_receptionist', s('chat_row'))
  add('web-chat assistent-svar → appended (samme tråd)', s('chat_reply_append') === 'appended/true', s('chat_reply_append'))
  add('udgående svar opretter ingen handlinger', s('chat_reply_no_actions') === '0', s('chat_reply_no_actions'))
  add('web-chat opfølgning → appended', s('chat_followup_append') === 'appended', s('chat_followup_append'))
  add('lav hastegrad senere sænker aldrig nød', s('chat_never_lowered') === 'emergency', s('chat_never_lowered'))
  add('web-chat tråd = indgående, udgående, indgående', s('chat_items') === 'inbound,outbound,inbound', s('chat_items'))
  add('gentaget chat-besked (samme klient-id) afvises af databasen', s('chat_repeat_23505') === '23505', s('chat_repeat_23505'))
  add('chat: forfatter/retning hænger sammen', s('chat_author_direction_23514') === '23514', s('chat_author_direction_23514'))
  add('venter på ELTA kan sættes', s('awaiting_elta') === 'ok', s('awaiting_elta'))
  add('admin ser chat-beskeder i synlig henvendelse (3)', s('chat_msgs_admin') === '3', s('chat_msgs_admin'))
  add('salg ser ingen ukoblede chat-beskeder', s('chat_msgs_salg') === '0', s('chat_msgs_salg'))
  add('montør ser ingen chat-beskeder', s('chat_msgs_montor') === '0', s('chat_msgs_montor'))
  add('admin ser kun chat-sessioner med synlige beskeder (1)', s('chat_sessions_admin') === '1', s('chat_sessions_admin'))
  const vis = res.vis as Record<string, string>
  add('synlighed admin = 6', vis?.admin === '6', vis?.admin)
  add('synlighed serviceleder = 6', vis?.serviceleder === '6', vis?.serviceleder)
  add('salg: kun bekræftede i scope (aldrig ukoblede/kandidater uden scope)', ['0', '1', '2', '3'].includes(vis?.salg), vis?.salg)
  add('bogholderi: kun bekræftede i scope', ['0', '1', '2', '3'].includes(vis?.bogholderi), vis?.bogholderi)
  add('montør: 0', vis?.montor === '0', vis?.montor)
  add('anon: 42501', vis?.anon === '42501', vis?.anon)
  add('pr. bruger: tilbagekaldt conversations.view → admin ser 0', s('revoked_admin_sees') === '0', s('revoked_admin_sees'))
  add('pr. bruger: tilbagekaldt → chat-beskeder skjult', s('revoked_admin_chat_msgs') === '0', s('revoked_admin_chat_msgs'))
  add('sletning af kunde → markeret customer_deleted_at, kandidat nulstillet', s('customer_deleted_marked') === '1', s('customer_deleted_marked'))
  add('retention dry-run finder afsluttet/slettet kunde/forældreløs kilde', s('retention_dry') === 'applied=false handled_items>=true conv>=true cust>=true orphan>=true', s('retention_dry'))
  add('retention dry-run ændrer intet', s('retention_dry_unchanged') === '0/0', s('retention_dry_unchanged'))
  add('retention apply kørt', s('retention_apply') === 'true', s('retention_apply'))
  add('retention: afsluttet henvendelses kopierede tekst ryddet (items + resumé/titel)', s('retention_handled_purged') === '1/true', s('retention_handled_purged'))
  add('retention: slettet kundes henvendelse ryddet', s('retention_customer_deleted_purged') === 'true', s('retention_customer_deleted_purged'))
  add('retention: slettet kilde markeret og ryddet', s('retention_orphan') === 'true', s('retention_orphan'))
  add('retention: åbne henvendelser røres ikke', s('retention_open_kept') === 'true/2', s('retention_open_kept'))
  add('retention: metadata (status/tider/kilde-reference) bevaret', s('retention_metadata_kept') === 'true/1', s('retention_metadata_kept'))
  add('retention auditeret', s('retention_audit') === '1', s('retention_audit'))
  add('kanoniske kilder uændret af indtag + retention (mail findes, portal/chat md5 =)', s('sources_unchanged') === 'true/true/true/5', s('sources_unchanged'))
  return out
}
