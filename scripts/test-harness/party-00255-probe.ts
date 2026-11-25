/**
 * 00255 parter fase B (kontrollerede skrive-RPC'er) — STAGING rollback-only SQL-prøve (2026-11-25).
 * Én transaktion: (valgfrit) 00255-kroppen → fixtures → hver rolle som RIGTIG profil (SET LOCAL ROLE authenticated +
 * jwt-claims) → målinger → RAISE (alt rulles tilbage). Intet bliver på staging.
 *
 * Beviser: ingen rolle (heller ikke admin) skriver direkte; RPC-matrix pr. rolle; cases.edit kun via sagsdeltager-flowet for
 * sagens egne kunder/kontakter; F-6 (id som funktionsværdi, ingen RETURNING-afhængighed); dublet-værn (CVR/e-mail/domæne/
 * navn, uregistrerede kunder/leverandører, idempotente register-parter); D-1-læsning; montør kun egne sager; funktions-ACL;
 * F-1 urørt (ingen offentliggørelser, portalflag uændret); SQL↔TS-normaliseringsparitet.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NAME_PARITY_SAMPLES, normalizePartyName, normalizePartyVat } from '../../src/lib/parties/party-dedupe'

export const STATE_00255_SQL = `SELECT json_build_object(
  'applied', to_regprocedure('public.create_party(text,text,uuid,text[],text[],text,text,text)') IS NOT NULL,
  'vat_idx', to_regclass('public.parties_vat_uniq') IS NOT NULL,
  'write_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('parties','party_relationships','case_participants') AND cmd IN ('INSERT','UPDATE')),
  'auth_ins', has_table_privilege('authenticated', 'public.parties', 'INSERT') OR has_table_privilege('authenticated', 'public.party_relationships', 'INSERT') OR has_table_privilege('authenticated', 'public.case_participants', 'INSERT'),
  'parties', (SELECT count(*) FROM public.parties), 'rels', (SELECT count(*) FROM public.party_relationships),
  'participants', (SELECT count(*) FROM public.case_participants), 'pubs', (SELECT count(*) FROM public.external_publications),
  'portal_docs', (SELECT count(*) FROM public.customer_documents WHERE visible_in_portal),
  'customers', (SELECT count(*) FROM public.customers), 'cases', (SELECT count(*) FROM public.service_cases),
  'audit', (SELECT count(*) FROM public.audit_logs WHERE action LIKE 'party%' OR action LIKE 'case_participant%')) f`

/** Fingeraftryk af det 00255 rører: public-funktioner (definition + ACL), partstabellernes politikker, tabel-/kolonne-grants,
 *  indeks og constraints på parties. Bruges af rollback-beviset (staging og prod, rollback-only). */
export const STRUCT_00255_SQL = `SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (
  SELECT 'P:' || p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, '') x FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
  UNION ALL SELECT 'R:' || tablename || ':' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('parties','party_relationships','case_participants','external_publications')
  UNION ALL SELECT 'G:' || c.relname || ':' || coalesce(c.relacl::text, '') FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('parties','party_relationships','case_participants','external_publications')
  UNION ALL SELECT 'C:' || attrelid::regclass::text || ':' || attname || ':' || coalesce(attacl::text, '') FROM pg_attribute WHERE attrelid IN ('public.parties'::regclass, 'public.case_participants'::regclass, 'public.party_relationships'::regclass) AND attnum > 0 AND attacl IS NOT NULL
  UNION ALL SELECT 'I:' || indexrelid::regclass::text FROM pg_index WHERE indrelid = 'public.parties'::regclass
  UNION ALL SELECT 'K:' || conname || ':' || pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.parties'::regclass) s`

export function migration00255Body(): string {
  const sql = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '00255_party_write_rpcs.sql'), 'utf8').replace(/\r\n/g, '\n')
  const a = sql.indexOf('\nBEGIN;\n'), b = sql.indexOf('\nCOMMIT;\n')
  if (a < 0 || b < a) throw new Error('00255: har ikke BEGIN; … COMMIT;')
  const body = sql.slice(a + '\nBEGIN;\n'.length, b)
  if (body.includes('$mig$')) throw new Error('00255: indeholder $mig$')
  return body
}

/** Rollback-sektionen (kommenteret i migrationen) som udsagn — samme tekst som docs/runbooks/sql/00255_rollback.sql */
export function rollback00255Statements(): string {
  const src = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '00255_party_write_rpcs.sql'), 'utf8').replace(/\r\n/g, '\n')
  const at = src.indexOf('-- ROLLBACK (manuel')
  const sec = src.slice(src.indexOf('\n-- BEGIN;', at))
  return sec.split('\n').filter((l) => l.startsWith('-- ') && !/^-- (BEGIN|COMMIT|NOTIFY)/.test(l)).map((l) => l.slice(3)).join('\n')
}

const asUser = (v: string) => `EXECUTE 'RESET ROLE'; EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ${v}, 'role', 'authenticated')::text, true);`
const asService = `EXECUTE 'RESET ROLE'; EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);`
const asAnon = `EXECUTE 'RESET ROLE'; EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);`
const asOwner = `EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', '', true);`
const t = (key: string, stmt: string) => `BEGIN ${stmt}; res := jsonb_set(res, '{${key}}', '"ok"'); EXCEPTION WHEN OTHERS THEN res := jsonb_set(res, '{${key}}', to_jsonb(SQLSTATE)); END;`
const g = (key: string, expr: string) => `BEGIN res := jsonb_set(res, '{${key}}', coalesce((${expr}), 'null'::jsonb)); EXCEPTION WHEN OTHERS THEN res := jsonb_set(res, '{${key}}', to_jsonb(SQLSTATE)); END;`
/** jsonb-RPC → gem svaret (eller SQLSTATE) */
const j = (key: string, call: string) => `BEGIN res := jsonb_set(res, '{${key}}', to_jsonb(${call})); EXCEPTION WHEN OTHERS THEN res := jsonb_set(res, '{${key}}', to_jsonb(SQLSTATE)); END;`
const q = (s: string) => `'${s.replace(/'/g, "''")}'`

const DIRECT_WRITES: Array<[string, string]> = [
  ['ins_party', `INSERT INTO public.parties (id, kind, display_name, created_by) VALUES (gen_random_uuid(), 'person', 'Direkte', auth.uid())`],
  ['upd_party', `UPDATE public.parties SET display_name = 'X' WHERE id = p_a`],
  ['del_party', `DELETE FROM public.parties WHERE id = p_a`],
  ['ins_rel', `INSERT INTO public.party_relationships (party_id, relationship, status, source, confirmed_by, confirmed_at, created_by) VALUES (p_a, 'subcontractor', 'active', 'manual', auth.uid(), now(), auth.uid())`],
  ['upd_rel', `UPDATE public.party_relationships SET status = 'ended' WHERE party_id = p_a`],
  ['ins_cp', `INSERT INTO public.case_participants (service_case_id, party_id, role, created_by) VALUES (case1, p_a, 'payer', auth.uid())`],
  ['upd_cp', `UPDATE public.case_participants SET ended_at = now() WHERE service_case_id = case1`],
]

export function probe00255Sql(runBody: boolean): string {
  const parity = NAME_PARITY_SAMPLES.map((s) => `public.party_normalize_name(${q(s)})`).join(', ')
  return `DO $probe$
DECLARE
  res jsonb := '{}'::jsonb;
  stamp text := substr(md5(random()::text), 1, 8);
  vat1 text := (10000000 + floor(random() * 89999999))::bigint::text;
  vat2 text := (10000000 + floor(random() * 89999999))::bigint::text;
  u_admin uuid; u_sl uuid; u_salg uuid; u_bog uuid; u_mont uuid;
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid(); c_d1 uuid := gen_random_uuid(); c_d2 uuid := gen_random_uuid();
  c_m uuid := gen_random_uuid(); cc_a uuid := gen_random_uuid(); s_x uuid := gen_random_uuid(); s_y uuid := gen_random_uuid();
  vat3 text := (10000000 + floor(random() * 89999999))::bigint::text;
  case1 uuid := gen_random_uuid(); case_m uuid := gen_random_uuid();
  p_a uuid; p_x uuid; p_m uuid; p_free uuid; p_free2 uuid; p_tmp uuid;
  r jsonb; ai_rel uuid; cp1 uuid; n int;
  pubs0 bigint := (SELECT count(*) FROM public.external_publications);
  docs0 bigint := (SELECT count(*) FROM public.customer_documents WHERE visible_in_portal);
  audit0 bigint := (SELECT count(*) FROM public.audit_logs WHERE action LIKE 'party%' OR action LIKE 'case_participant%');
BEGIN
  ${runBody ? `EXECUTE $mig$${migration00255Body()}$mig$;` : '-- 00255 er allerede anvendt på staging'}
  res := jsonb_set(res, '{body_ran}', to_jsonb(${runBody}));

  SELECT p.id INTO u_admin FROM public.profiles p WHERE p.role = 'admin' AND p.is_active AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO u_sl FROM public.profiles p WHERE p.role = 'serviceleder' AND p.is_active AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO u_salg FROM public.profiles p WHERE p.role = 'salg' AND p.is_active AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO u_bog FROM public.profiles p WHERE p.role = 'bogholderi' AND p.is_active AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO u_mont FROM public.profiles p WHERE p.role = 'montør' AND p.is_active AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1;
  res := jsonb_set(res, '{personas}', to_jsonb(u_admin IS NOT NULL AND u_sl IS NOT NULL AND u_salg IS NOT NULL AND u_bog IS NOT NULL AND u_mont IS NOT NULL));

  -- Paritet SQL ↔ TS
  res := jsonb_set(res, '{parity_names}', to_jsonb(ARRAY[${parity}]));
  res := jsonb_set(res, '{parity_vat}', to_jsonb(ARRAY[public.party_normalize_vat('DK 12 34 56 78'), public.party_normalize_vat(''), public.party_normalize_vat('12-34'), public.party_normalize_vat('dk12345678')]));
  res := jsonb_set(res, '{parity_emails}', to_jsonb(public.party_normalize_emails(ARRAY[' Info@Firma.DK ', 'info@firma.dk', '', 'x@elta-crm.local', 'ikke-en-mail'])));
  res := jsonb_set(res, '{parity_domains}', to_jsonb(public.party_normalize_domains(ARRAY['@Firma.dk', 'www.firma.dk', 'ugyldig'])));

  -- Fixtures (ejer; rulles tilbage)
  INSERT INTO public.customers (id, customer_number, company_name, contact_person, email, created_by) VALUES
    (c_a, 'P255A-' || stamp, '[PROBE] Kunde A ' || stamp, 'Anders', 'p255-a-' || stamp || '@harness.test', u_sl),
    (c_b, 'P255B-' || stamp, '[PROBE] Kunde B ' || stamp, 'Bente', 'p255-b-' || stamp || '@harness.test', u_sl),
    (c_d1, 'P255D1-' || stamp, '[PROBE] Dublet 1 ' || stamp, 'Dorte', 'p255-dup-' || stamp || '@harness.test', u_sl),
    (c_d2, 'P255D2-' || stamp, '[PROBE] Dublet 2 ' || stamp, 'Dorte', 'P255-DUP-' || stamp || '@harness.test', u_sl),
    (c_m, 'P255M-' || stamp, '[PROBE] Montørkunde ' || stamp, 'Mads', 'p255-m-' || stamp || '@harness.test', u_sl);
  INSERT INTO public.customer_contacts (id, customer_id, name) VALUES (cc_a, c_a, '[PROBE] Kontakt A');
  INSERT INTO public.suppliers (id, name, is_active, vat_number) VALUES (s_x, '[PROBE] Leverandør X ' || stamp, true, 'DK' || vat2), (s_y, '[PROBE] Leverandør Y ' || stamp, true, vat3);
  INSERT INTO public.service_cases (id, title, customer_id, site_contact_id, created_by) VALUES (case1, '[PROBE] Sag 1', c_a, cc_a, u_sl);
  INSERT INTO public.service_cases (id, title, customer_id, created_by, assigned_to) VALUES (case_m, '[PROBE] Montørsag', c_m, u_sl, u_mont);

  -- A. Anon / service_role / interne hjælpere
  ${asAnon}
  ${t('anon_create', `PERFORM public.create_party('person', 'Anon', NULL, NULL, NULL, NULL, NULL, NULL)`)}
  ${t('anon_ensure', `PERFORM public.ensure_register_party('customer', c_a)`)}
  ${asService}
  ${t('svc_create', `PERFORM public.create_party('person', 'AI', NULL, NULL, NULL, NULL, NULL, NULL)`)}
  ${t('svc_add_cp', `PERFORM public.add_case_participant(case1, NULL, 'customer', NULL)`)}

  -- B. Admin: register-part (F-6: id som funktionsværdi; læses bagefter i et nyt udsagn via SELECT-politikken)
  ${asUser('u_admin')}
  ${j('adm_ensure_a1', `public.ensure_register_party('customer', c_a)`)}
  ${j('adm_ensure_a2', `public.ensure_register_party('customer', c_a)`)}
  p_a := (res->'adm_ensure_a1'->>'party_id')::uuid;
  ${g('adm_reads_new_party', `(SELECT to_jsonb(count(*)) FROM public.parties WHERE id = p_a)`)}
  ${g('adm_reads_register_rel', `(SELECT to_jsonb(count(*)) FROM public.party_relationships WHERE party_id = p_a AND relationship = 'customer' AND source = 'register' AND status = 'active')`)}
  ${j('adm_ensure_x', `public.ensure_register_party('supplier', s_x)`)}
  p_x := (res->'adm_ensure_x'->>'party_id')::uuid;
  ${j('adm_ensure_d1', `public.ensure_register_party('customer', c_d1)`)}
  ${j('adm_ensure_d2', `public.ensure_register_party('customer', c_d2)`)}
  ${j('adm_ensure_contact', `public.ensure_register_party('customer_contact', cc_a)`)}
  ${g('contact_org', `(SELECT to_jsonb(organisation_party_id = p_a) FROM public.parties WHERE customer_contact_id = cc_a)`)}
  ${j('adm_ensure_profile', `public.ensure_register_party('profile', u_mont)`)}
  ${t('adm_ensure_unknown_register', `PERFORM public.ensure_register_party('invoice', c_a)`)}
  ${t('adm_ensure_missing_row', `PERFORM public.ensure_register_party('customer', gen_random_uuid())`)}

  -- C. Direkte skrivning afvist for ALLE roller (også admin)
  ${['u_admin', 'u_sl', 'u_salg', 'u_bog', 'u_mont'].map((u) => `${asUser(u)}
  ${DIRECT_WRITES.map(([k, s]) => t(`direct_${u}_${k}`, s)).join('\n  ')}
  ${t(`direct_${u}_ins_returning`, `INSERT INTO public.parties (kind, display_name, created_by) VALUES ('person', 'R', auth.uid()) RETURNING id INTO p_tmp`)}`).join('\n  ')}

  -- D. Fri part + dublet-værn (admin)
  ${asUser('u_admin')}
  ${j('free_create', `public.create_party('organisation', 'Probe Partner ' || stamp || ' ApS', NULL, ARRAY['Kontakt@Probe-' || stamp || '.test'], ARRAY['www.probe-' || stamp || '.test'], 'DK ' || vat1, 'cooperation_partner', NULL)`)}
  p_free := (res->'free_create'->>'party_id')::uuid;
  ${g('free_row', `(SELECT jsonb_build_object('vat', vat_number, 'emails', verified_emails, 'domains', verified_domains, 'rel', (SELECT status || '/' || source FROM public.party_relationships WHERE party_id = p_free AND relationship = 'cooperation_partner')) FROM public.parties WHERE id = p_free)`)}
  ${j('dup_name', `public.create_party('organisation', 'PROBE partner ' || stamp || ' A/S', NULL, NULL, NULL, NULL, NULL, NULL)`)}
  ${j('dup_domain', `public.create_party('organisation', 'Helt andet navn ' || stamp, NULL, NULL, ARRAY['probe-' || stamp || '.test'], NULL, NULL, NULL)`)}
  ${j('dup_email', `public.create_party('person', 'Person ' || stamp, NULL, ARRAY['kontakt@probe-' || stamp || '.test'], NULL, NULL, NULL, NULL)`)}
  ${j('dup_vat_with_reason', `public.create_party('organisation', 'Tredje navn ' || stamp, NULL, NULL, NULL, vat1, NULL, 'Bevidst ny part med samme CVR')`)}
  ${j('dup_unreg_customer', `public.create_party('organisation', '[PROBE] Kunde B ' || stamp, NULL, NULL, NULL, NULL, NULL, NULL)`)}
  ${j('dup_unreg_customer_email', `public.create_party('person', 'Ukendt ' || stamp, NULL, ARRAY['p255-b-' || stamp || '@harness.test'], NULL, NULL, NULL, NULL)`)}
  ${j('dup_register_supplier_vat', `public.create_party('organisation', 'Ny leverandør ' || stamp, NULL, NULL, NULL, vat2, NULL, NULL)`)}
  ${j('dup_register_customer_email', `public.create_party('person', 'Ny kontakt ' || stamp, NULL, ARRAY['p255-a-' || stamp || '@harness.test'], NULL, NULL, NULL, NULL)`)}
  ${j('dup_unreg_supplier_vat', `public.create_party('organisation', 'Tredje leverandør ' || stamp, NULL, NULL, NULL, vat3, NULL, NULL)`)}
  ${t('dup_reason_too_short', `PERFORM public.create_party('organisation', 'Probe Partner ' || stamp, NULL, NULL, NULL, NULL, NULL, 'kort')`)}
  ${j('dup_override', `public.create_party('organisation', 'Probe Partner ' || stamp || ' IVS', NULL, NULL, NULL, NULL, NULL, 'Anden virksomhed med samme navn (bekræftet pr. telefon)')`)}
  p_free2 := (res->'dup_override'->>'party_id')::uuid;
  ${g('dup_override_audit', `(SELECT to_jsonb(metadata->>'duplicate_override') FROM public.audit_logs WHERE entity_id = p_free2 AND action = 'party_created')`)}
  ${t('invalid_email', `PERFORM public.create_party('person', 'Ugyldig ' || stamp, NULL, ARRAY['ikke-en-mail'], NULL, NULL, NULL, NULL)`)}
  ${t('invalid_vat', `PERFORM public.create_party('organisation', 'Ugyldig ' || stamp, NULL, NULL, NULL, '12-34', NULL, NULL)`)}
  ${t('invalid_kind', `PERFORM public.create_party('robot', 'Ugyldig ' || stamp, NULL, NULL, NULL, NULL, NULL, NULL)`)}
  ${t('update_vat_conflict', `PERFORM public.update_party(p_free2, 'Probe Partner ' || stamp || ' IVS', NULL, NULL, NULL, vat1)`)}
  ${t('update_ok', `PERFORM public.update_party(p_free2, 'Probe Partner Nord ' || stamp, NULL, NULL, ARRAY['nord-' || stamp || '.test'], NULL)`)}
  ${g('update_row', `(SELECT to_jsonb(display_name = 'Probe Partner Nord ' || stamp AND verified_domains = ARRAY['nord-' || stamp || '.test']) FROM public.parties WHERE id = p_free2)`)}
  ${g('direct_vat_index', `(SELECT to_jsonb(count(*)) FROM public.parties WHERE vat_number = vat1)`)}

  -- E. Relationer (admin): AI-forslag bekræftes af et menneske; register-relation kan ikke afsluttes manuelt
  ${asService}
  INSERT INTO public.party_relationships (party_id, relationship, status, source) VALUES (p_x, 'manufacturer', 'proposed', 'ai_suggestion') RETURNING id INTO ai_rel;
  ${asUser('u_admin')}
  ${j('rel_confirm_ai', `public.set_party_relationship(p_x, 'manufacturer', ARRAY['Bekræftet af indkøb'])`)}
  ${g('rel_confirmed_row', `(SELECT to_jsonb(status || '/' || (confirmed_by = u_admin)::text) FROM public.party_relationships WHERE id = ai_rel)`)}
  ${j('rel_again', `public.set_party_relationship(p_x, 'manufacturer', NULL)`)}
  ${t('rel_end_register', `PERFORM public.end_party_relationship((SELECT id FROM public.party_relationships WHERE party_id = p_a AND source = 'register'), 'ended')`)}
  ${t('rel_end_manual', `PERFORM public.end_party_relationship(ai_rel, 'ended')`)}
  ${t('rel_unknown', `PERFORM public.set_party_relationship(p_x, 'ven', NULL)`)}

  -- F. Sagsdeltagere (serviceleder): idempotent, afslut, genåbn
  ${asUser('u_sl')}
  ${j('cp_add', `public.add_case_participant(case1, p_free, 'cooperation_partner', 'Montagepartner')`)}
  cp1 := (res->'cp_add'->>'participant_id')::uuid;
  ${j('cp_add_again', `public.add_case_participant(case1, p_free, 'cooperation_partner', NULL)`)}
  ${t('cp_end', `PERFORM public.end_case_participant(cp1)`)}
  ${j('cp_reactivate', `public.add_case_participant(case1, p_free, 'cooperation_partner', NULL)`)}
  ${t('cp_bad_role', `PERFORM public.add_case_participant(case1, p_free, 'ven', NULL)`)}
  ${j('sl_for_register_supplier', `public.add_case_participant_for_register(case1, 'supplier', s_x, 'supplier', NULL)`)}
  ${j('sl_create', `public.create_party('person', 'SL Person ' || stamp, NULL, NULL, NULL, NULL, NULL, NULL)`)}

  -- G. D-1: salg/bogholderi læser alt, skriver intet (RPC)
  ${['u_salg', 'u_bog'].map((u) => `${asUser(u)}
  ${g(`${u}_sees`, `(SELECT to_jsonb(count(*)) FROM public.parties WHERE id IN (p_a, p_x, p_free, p_free2))`)}
  ${t(`${u}_create`, `PERFORM public.create_party('person', 'Ikke tilladt ' || stamp, NULL, NULL, NULL, NULL, NULL, NULL)`)}
  ${t(`${u}_update`, `PERFORM public.update_party(p_free, 'Ændret', NULL, NULL, NULL, NULL)`)}
  ${t(`${u}_ensure`, `PERFORM public.ensure_register_party('customer', c_b)`)}
  ${t(`${u}_rel`, `PERFORM public.set_party_relationship(p_free, 'subcontractor', NULL)`)}
  ${t(`${u}_rel_end`, `PERFORM public.end_party_relationship((SELECT id FROM public.party_relationships WHERE party_id = p_free AND relationship = 'cooperation_partner'), 'ended')`)}
  ${t(`${u}_add_cp`, `PERFORM public.add_case_participant(case1, p_x, 'supplier', NULL)`)}
  ${t(`${u}_add_cp_reg`, `PERFORM public.add_case_participant_for_register(case1, 'customer', c_a, 'payer', NULL)`)}
  ${t(`${u}_end_cp`, `PERFORM public.end_case_participant(cp1)`)}`).join('\n  ')}
  ${asUser('u_bog')}
  ${g('bog_sees_participants', `(SELECT to_jsonb(count(*)) FROM public.case_participants WHERE service_case_id = case1)`)}

  -- H. cases.edit uden parties.manage (bogholderi + override): KUN via sagsdeltager-flowet for sagens egne kunder/kontakter
  ${asOwner}
  INSERT INTO public.user_permission_overrides (profile_id, permission, effect, reason) VALUES (u_bog, 'cases.edit', 'grant', '[PROBE] 00255');
  ${asUser('u_bog')}
  ${j('ce_reg_case_customer', `public.add_case_participant_for_register(case1, 'customer', c_a, 'payer', NULL)`)}
  ${j('ce_reg_case_contact', `public.add_case_participant_for_register(case1, 'customer_contact', cc_a, 'site_contact', NULL)`)}
  ${t('ce_reg_other_customer', `PERFORM public.add_case_participant_for_register(case1, 'customer', c_b, 'end_customer', NULL)`)}
  ${t('ce_reg_supplier', `PERFORM public.add_case_participant_for_register(case1, 'supplier', s_x, 'supplier', NULL)`)}
  ${t('ce_reg_profile', `PERFORM public.add_case_participant_for_register(case1, 'profile', u_mont, 'internal', NULL)`)}
  ${j('ce_link_existing', `public.add_case_participant(case1, p_x, 'manufacturer', NULL)`)}
  ${t('ce_create', `PERFORM public.create_party('person', 'Fri ' || stamp, NULL, NULL, NULL, NULL, NULL, NULL)`)}
  ${t('ce_ensure', `PERFORM public.ensure_register_party('customer', c_b)`)}
  ${t('ce_update', `PERFORM public.update_party(p_free, 'Ændret', NULL, NULL, NULL, NULL)`)}
  ${t('ce_rel', `PERFORM public.set_party_relationship(p_free, 'subcontractor', NULL)`)}
  ${g('ce_c_b_party', `(SELECT to_jsonb(count(*)) FROM public.parties WHERE customer_id = c_b)`)}
  ${asOwner}
  DELETE FROM public.user_permission_overrides WHERE profile_id = u_bog AND permission = 'cases.edit';

  -- I. Montør: kun parter på egne/tildelte sager; ingen skrivning
  ${asUser('u_admin')}
  ${j('adm_cp_mont', `public.add_case_participant_for_register(case_m, 'customer', c_m, 'customer', NULL)`)}
  p_m := (res->'adm_cp_mont'->>'party_id')::uuid;
  ${asUser('u_mont')}
  ${g('mont_case_in_scope', `(SELECT to_jsonb(case_m = ANY (public.my_case_scope_ids())))`)}
  ${g('mont_sees_own_party', `(SELECT to_jsonb(count(*)) FROM public.parties WHERE id = p_m)`)}
  ${g('mont_sees_own_participants', `(SELECT to_jsonb(count(*)) FROM public.case_participants WHERE service_case_id = case_m)`)}
  ${g('mont_sees_other', `(SELECT to_jsonb(count(*)) FROM public.parties WHERE id IN (p_a, p_x, p_free, p_free2))`)}
  ${g('mont_sees_case1_participants', `(SELECT to_jsonb(count(*)) FROM public.case_participants WHERE service_case_id = case1)`)}
  ${t('mont_create', `PERFORM public.create_party('person', 'Montør ' || stamp, NULL, NULL, NULL, NULL, NULL, NULL)`)}
  ${t('mont_add_cp', `PERFORM public.add_case_participant(case_m, p_m, 'site_contact', NULL)`)}
  ${t('mont_internal_helper', `PERFORM public._party_ensure_register('customer', c_b, u_mont)`)}
  ${asUser('u_sl')}
  ${t('sl_internal_helper', `PERFORM public._party_add_participant(case1, p_a, 'payer', NULL, u_sl)`)}

  -- J. ACL + F-1
  ${asOwner}
  res := jsonb_set(res, '{acl}', (SELECT jsonb_build_object(
    'anon', (SELECT coalesce(jsonb_agg(proname ORDER BY proname), '[]') FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND (proname LIKE 'party\\_normalize%' OR proname LIKE '\\_party\\_%' OR proname IN ('create_party','update_party','ensure_register_party','set_party_relationship','end_party_relationship','add_case_participant','add_case_participant_for_register','end_case_participant')) AND has_function_privilege('anon', oid, 'EXECUTE')),
    'svc', (SELECT coalesce(jsonb_agg(proname ORDER BY proname), '[]') FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND (proname LIKE 'party\\_normalize%' OR proname LIKE '\\_party\\_%' OR proname IN ('create_party','update_party','ensure_register_party','set_party_relationship','end_party_relationship','add_case_participant','add_case_participant_for_register','end_case_participant')) AND has_function_privilege('service_role', oid, 'EXECUTE')),
    'auth', (SELECT coalesce(jsonb_agg(proname ORDER BY proname), '[]') FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND (proname LIKE 'party\\_normalize%' OR proname LIKE '\\_party\\_%' OR proname IN ('create_party','update_party','ensure_register_party','set_party_relationship','end_party_relationship','add_case_participant','add_case_participant_for_register','end_case_participant')) AND has_function_privilege('authenticated', oid, 'EXECUTE')),
    'definer', (SELECT bool_and(prosecdef) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('create_party','update_party','ensure_register_party','set_party_relationship','end_party_relationship','add_case_participant','add_case_participant_for_register','end_case_participant')),
    'search_path', (SELECT bool_and(proconfig @> ARRAY['search_path=public']) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND (proname LIKE '\\_party\\_%' OR proname IN ('create_party','update_party','ensure_register_party','set_party_relationship','end_party_relationship','add_case_participant','add_case_participant_for_register','end_case_participant'))),
    'tbl_auth_write', has_table_privilege('authenticated', 'public.parties', 'INSERT') OR has_table_privilege('authenticated', 'public.parties', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.party_relationships', 'INSERT') OR has_table_privilege('authenticated', 'public.party_relationships', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.case_participants', 'INSERT') OR has_any_column_privilege('authenticated', 'public.case_participants', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.parties', 'DELETE'),
    'tbl_auth_select', has_table_privilege('authenticated', 'public.parties', 'SELECT') AND has_table_privilege('authenticated', 'public.case_participants', 'SELECT'),
    'write_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('parties','party_relationships','case_participants') AND cmd <> 'SELECT'),
    'select_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('parties','party_relationships','case_participants') AND cmd = 'SELECT'))));
  res := jsonb_set(res, '{f1}', jsonb_build_object('pubs_delta', (SELECT count(*) FROM public.external_publications) - pubs0,
    'portal_docs_delta', (SELECT count(*) FROM public.customer_documents WHERE visible_in_portal) - docs0));
  res := jsonb_set(res, '{audit_delta}', to_jsonb((SELECT count(*) FROM public.audit_logs WHERE action LIKE 'party%' OR action LIKE 'case_participant%') - audit0));
  res := jsonb_set(res, '{audit_actors}', (SELECT coalesce(jsonb_agg(DISTINCT action), '[]') FROM public.audit_logs WHERE (action LIKE 'party%' OR action LIKE 'case_participant%') AND created_at >= now() - interval '1 hour' AND user_id IN (u_admin, u_sl, u_bog)));
  RAISE EXCEPTION 'P255RESULT%P255END', res::text;
END
$probe$;`
}

export interface Check { id: string; ok: boolean; note: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function evaluateProbe255(r: any): Check[] {
  const out: Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note: ok ? '' : note })
  const denied = (k: string) => r[k] === '42501'
  const st = (k: string) => (r[k] && typeof r[k] === 'object' ? r[k].status : r[k])
  const roles = ['u_admin', 'u_sl', 'u_salg', 'u_bog', 'u_mont']

  add('personaer fundet (admin/serviceleder/salg/bogholderi/montør uden overrides)', r.personas === true)
  const tsNames = NAME_PARITY_SAMPLES.map((s) => normalizePartyName(s))
  add('normalisering: SQL = TS (navne)', JSON.stringify(r.parity_names) === JSON.stringify(tsNames), `${JSON.stringify(r.parity_names)} ≠ ${JSON.stringify(tsNames)}`)
  add('normalisering: CVR (DK-præfiks/mellemrum → cifre; tom → NULL; ugyldig → invalid) = TS',
    JSON.stringify(r.parity_vat) === JSON.stringify(['DK 12 34 56 78', '', '12-34', 'dk12345678'].map((v) => normalizePartyVat(v))), JSON.stringify(r.parity_vat))
  add('normalisering: e-mails (små bogstaver, unikke, .local og ugyldige → NULL)', JSON.stringify(r.parity_emails) === JSON.stringify(['info@firma.dk', null]), JSON.stringify(r.parity_emails))
  add('normalisering: domæner (@/www. fjernet; ugyldig → NULL)', JSON.stringify(r.parity_domains) === JSON.stringify(['firma.dk', null]), JSON.stringify(r.parity_domains))

  add('anon kan ikke kalde RPC\'erne', denied('anon_create') && denied('anon_ensure'), `${r.anon_create}/${r.anon_ensure}`)
  add('service_role (baggrund/AI) kan ikke kalde RPC\'erne', denied('svc_create') && denied('svc_add_cp'), `${r.svc_create}/${r.svc_add_cp}`)

  add('F-6: ensure_register_party returnerer id som funktionsværdi; rækken læses i nyt udsagn via SELECT-politikken',
    st('adm_ensure_a1') === 'created' && typeof r.adm_ensure_a1?.party_id === 'string' && r.adm_reads_new_party === 1, `${JSON.stringify(r.adm_ensure_a1)} reads=${r.adm_reads_new_party}`)
  add('register-part idempotent (samme id 2. gang) + register-relation aktiv',
    st('adm_ensure_a2') === 'existing' && r.adm_ensure_a2?.party_id === r.adm_ensure_a1?.party_id && r.adm_reads_register_rel === 1, JSON.stringify(r.adm_ensure_a2))
  add('dublet-kunder: 2. kunde med samme e-mail får advarsel (ingen sammenlægning)',
    st('adm_ensure_d2') === 'created' && JSON.stringify(r.adm_ensure_d2?.warnings) === '["same_email_other_customer_party"]' && JSON.stringify(r.adm_ensure_d1?.warnings) === '[]', JSON.stringify(r.adm_ensure_d2))
  add('kontakt-part kobles til kundens organisation-part', st('adm_ensure_contact') === 'created' && r.contact_org === true, `${JSON.stringify(r.adm_ensure_contact)} org=${r.contact_org}`)
  add('leverandør-/medarbejder-part', st('adm_ensure_x') === 'created' && st('adm_ensure_profile') === 'created')
  add('ukendt register / manglende række afvises', r.adm_ensure_unknown_register === '22023' && r.adm_ensure_missing_row === '42501', `${r.adm_ensure_unknown_register}/${r.adm_ensure_missing_row}`)

  for (const u of roles) {
    const ks = ['ins_party', 'upd_party', 'del_party', 'ins_rel', 'upd_rel', 'ins_cp', 'upd_cp', 'ins_returning'].map((k) => `direct_${u}_${k}`)
    add(`direkte skrivning afvist (42501) for ${u.slice(2)}: INSERT/UPDATE/DELETE + INSERT…RETURNING`, ks.every(denied), ks.map((k) => `${k.split('_').slice(2).join('_')}=${r[k]}`).join(' '))
  }

  add('fri part oprettet med normaliseret CVR/e-mail/domæne + aktiv manuel relation',
    st('free_create') === 'created' && r.free_row?.rel === 'active/manual' && /^\d{8}$/.test(r.free_row?.vat ?? '') && r.free_row?.domains?.[0]?.startsWith('probe-') && r.free_row?.emails?.[0]?.startsWith('kontakt@'), JSON.stringify(r.free_row))
  const candHas = (k: string, source: string, match: string) => st(k) === 'duplicate_candidates' && (r[k].candidates ?? []).some((c: { source: string; match: string[] }) => c.source === source && c.match.includes(match))
  add('dublet: navn (selskabsform/store bogstaver ignoreret) → kandidat, intet oprettet', candHas('dup_name', 'party', 'name'), JSON.stringify(r.dup_name))
  add('dublet: verificeret domæne → kandidat', candHas('dup_domain', 'party', 'domain'), JSON.stringify(r.dup_domain))
  add('dublet: verificeret e-mail → kandidat', candHas('dup_email', 'party', 'email'), JSON.stringify(r.dup_email))
  add('dublet: samme CVR → duplicate_vat, oprettes ALDRIG (heller ikke med begrundelse)', st('dup_vat_with_reason') === 'duplicate_vat' && r.direct_vat_index === 1, `${JSON.stringify(r.dup_vat_with_reason)} n=${r.direct_vat_index}`)
  add('dublet: uregistreret kunde (navn/e-mail) og leverandør (CVR) foreslås', candHas('dup_unreg_customer', 'customer', 'name') && candHas('dup_unreg_customer_email', 'customer', 'email') && candHas('dup_unreg_supplier_vat', 'supplier', 'vat'),
    `${JSON.stringify(r.dup_unreg_customer)} ${JSON.stringify(r.dup_unreg_customer_email)} ${JSON.stringify(r.dup_unreg_supplier_vat)}`)
  add('dublet: register-part matches på registrets CVR (leverandør) og e-mail (kunde)', candHas('dup_register_supplier_vat', 'party', 'vat') && candHas('dup_register_customer_email', 'party', 'email'),
    `${JSON.stringify(r.dup_register_supplier_vat)} ${JSON.stringify(r.dup_register_customer_email)}`)
  add('dublet: for kort begrundelse afvises; gyldig begrundelse opretter + auditeres som override',
    r.dup_reason_too_short === '22023' && st('dup_override') === 'created' && r.dup_override_audit === 'true', `${r.dup_reason_too_short}/${JSON.stringify(r.dup_override)}/${r.dup_override_audit}`)
  add('ugyldig e-mail/CVR/type afvises (22023)', ['invalid_email', 'invalid_vat', 'invalid_kind'].every((k) => r[k] === '22023'), `${r.invalid_email}/${r.invalid_vat}/${r.invalid_kind}`)
  add('update_party: CVR-konflikt afvist (23505); gyldig rettelse ok', r.update_vat_conflict === '23505' && r.update_ok === 'ok' && r.update_row === true, `${r.update_vat_conflict}/${r.update_ok}/${r.update_row}`)

  add('relation: AI-forslag bekræftes af mennesket (confirmed_by = bruger); gentagelse = existing',
    st('rel_confirm_ai') === 'confirmed' && r.rel_confirmed_row === 'active/true' && st('rel_again') === 'existing', `${JSON.stringify(r.rel_confirm_ai)}/${r.rel_confirmed_row}/${JSON.stringify(r.rel_again)}`)
  add('relation: register-relation kan ikke afsluttes manuelt (23514); manuel kan; ukendt relation afvist',
    r.rel_end_register === '23514' && r.rel_end_manual === 'ok' && r.rel_unknown === '22023', `${r.rel_end_register}/${r.rel_end_manual}/${r.rel_unknown}`)

  add('deltager: oprettet → existing → afsluttet → genåbnet; ukendt rolle afvist',
    st('cp_add') === 'created' && st('cp_add_again') === 'existing' && r.cp_end === 'ok' && st('cp_reactivate') === 'reactivated' && r.cp_bad_role === '22023',
    `${st('cp_add')}/${st('cp_add_again')}/${r.cp_end}/${st('cp_reactivate')}/${r.cp_bad_role}`)
  add('serviceleder (parties.manage): leverandør via sagsflowet + fri oprettelse', st('sl_for_register_supplier') === 'created' && st('sl_create') === 'created', `${JSON.stringify(r.sl_for_register_supplier)}/${JSON.stringify(r.sl_create)}`)

  for (const u of ['u_salg', 'u_bog']) {
    const ks = ['create', 'update', 'ensure', 'rel', 'rel_end', 'add_cp', 'add_cp_reg', 'end_cp'].map((k) => `${u}_${k}`)
    add(`D-1 ${u.slice(2)}: ser alle 4 parter, alle 8 skrive-RPC'er afvist (42501)`, r[`${u}_sees`] === 4 && ks.every(denied), `sees=${r[`${u}_sees`]} ${ks.map((k) => `${k}=${r[k]}`).join(' ')}`)
  }
  add('bogholderi (cases.view.all) ser sagens deltagere', typeof r.bog_sees_participants === 'number' && r.bog_sees_participants >= 2, String(r.bog_sees_participants))

  add('cases.edit uden parties.manage: sagens kunde + kontakt på stedet via sagsflowet (opretter/kobler part)',
    st('ce_reg_case_customer') === 'created' && st('ce_reg_case_contact') === 'created' && r.ce_reg_case_customer?.party_status === 'existing',
    `${JSON.stringify(r.ce_reg_case_customer)} ${JSON.stringify(r.ce_reg_case_contact)}`)
  add('cases.edit uden parties.manage: anden kunde/leverandør/medarbejder afvist; ingen part oprettet for den fremmede kunde',
    denied('ce_reg_other_customer') && denied('ce_reg_supplier') && denied('ce_reg_profile') && r.ce_c_b_party === 0,
    `${r.ce_reg_other_customer}/${r.ce_reg_supplier}/${r.ce_reg_profile}/c_b=${r.ce_c_b_party}`)
  add('cases.edit uden parties.manage: kan koble eksisterende synlig part til synlig sag', st('ce_link_existing') === 'created', JSON.stringify(r.ce_link_existing))
  add('cases.edit uden parties.manage: ingen fri oprettelse/register-oprettelse/redigering/relationer (42501)',
    ['ce_create', 'ce_ensure', 'ce_update', 'ce_rel'].every(denied), `${r.ce_create}/${r.ce_ensure}/${r.ce_update}/${r.ce_rel}`)

  add('montør: sagen er i eget scope; ser partens + deltagerne på egen sag', r.mont_case_in_scope === true && r.mont_sees_own_party === 1 && r.mont_sees_own_participants === 1,
    `${r.mont_case_in_scope}/${r.mont_sees_own_party}/${r.mont_sees_own_participants}`)
  add('montør: ser ingen andre parter/deltagere (intet partsregister)', r.mont_sees_other === 0 && r.mont_sees_case1_participants === 0, `${r.mont_sees_other}/${r.mont_sees_case1_participants}`)
  add('montør: kan ikke oprette/tilføje', denied('mont_create') && denied('mont_add_cp'), `${r.mont_create}/${r.mont_add_cp}`)
  add('interne hjælpere kan ikke kaldes af brugere', denied('mont_internal_helper') && denied('sl_internal_helper'), `${r.mont_internal_helper}/${r.sl_internal_helper}`)

  const acl = r.acl ?? {}
  add('ACL: anon og service_role har ingen EXECUTE på 00255-funktioner', JSON.stringify(acl.anon) === '[]' && JSON.stringify(acl.svc) === '[]', `${JSON.stringify(acl.anon)} ${JSON.stringify(acl.svc)}`)
  add('ACL: authenticated har KUN de 8 RPC\'er (ingen interne hjælpere/normalisering)', JSON.stringify(acl.auth) === JSON.stringify(['add_case_participant', 'add_case_participant_for_register', 'create_party', 'end_case_participant', 'end_party_relationship', 'ensure_register_party', 'set_party_relationship', 'update_party']), JSON.stringify(acl.auth))
  add('RPC\'erne er SECURITY DEFINER med search_path=public', acl.definer === true && acl.search_path === true, `${acl.definer}/${acl.search_path}`)
  add('tabel-grants: authenticated kun SELECT (ingen INSERT/UPDATE/DELETE); 0 skrivepolitikker, 3 SELECT-politikker',
    acl.tbl_auth_write === false && acl.tbl_auth_select === true && acl.write_policies === 0 && acl.select_policies === 3, JSON.stringify(acl))
  add('F-1: ingen offentliggørelser oprettet, portaldokument-flag uændret', r.f1?.pubs_delta === 0 && r.f1?.portal_docs_delta === 0, JSON.stringify(r.f1))
  add('audit: hver RPC-skrivning auditeret (party_created/updated, relation, deltager)', typeof r.audit_delta === 'number' && r.audit_delta >= 15
    && ['party_created', 'party_updated', 'party_relationship_set', 'party_relationship_ended', 'case_participant_added', 'case_participant_ended'].every((a) => (r.audit_actors ?? []).includes(a)),
    `${r.audit_delta} ${JSON.stringify(r.audit_actors)}`)
  return out
}
