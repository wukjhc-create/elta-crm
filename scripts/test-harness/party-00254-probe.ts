/**
 * 00254 parts-/publikumsfundament — STAGING rollback-only SQL-prøve (2026-11-23).
 * Én transaktion: (valgfrit) 00254-kroppen → fixtures (kunde A, kunde B, partner Y, leverandør X, sag 1 + sag 2, kundebesked,
 * leverandørmail "Indkøbspris 31.800 kr., batteriet er restordre", partnerordre, internt notat, mail-vedhæftning, internt
 * dokument, delt dokument) → offentliggørelser som RIGTIG serviceleder (SET LOCAL ROLE authenticated + jwt-claims) →
 * isolationsmålinger pr. publikum/persona/rolle → RAISE (alt rulles tilbage). Intet bliver på staging.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const STATE_00254_SQL = `SELECT json_build_object(
  'applied', to_regclass('public.external_publications') IS NOT NULL,
  'conv_cols', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name IN ('source_party_id','communication_class','communication_class_source')),
  'keys', (SELECT count(*) FROM public.permission_catalog WHERE permission IN ('parties.manage','portal.publish')),
  'catalog', (SELECT count(*) FROM public.permission_catalog), 'pairs', (SELECT count(*) FROM public.role_permission_defaults),
  'customers', (SELECT count(*) FROM public.customers), 'cases', (SELECT count(*) FROM public.service_cases),
  'audit', (SELECT count(*) FROM public.audit_logs WHERE action LIKE 'external_publication%')) f`

export function migration00254Body(): string {
  const sql = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '00254_party_audience_foundation.sql'), 'utf8').replace(/\r\n/g, '\n')
  const a = sql.indexOf('\nBEGIN;\n'), b = sql.indexOf('\nCOMMIT;\n')
  if (a < 0 || b < a) throw new Error('00254: har ikke BEGIN; … COMMIT;')
  const body = sql.slice(a + '\nBEGIN;\n'.length, b)
  if (body.includes('$mig$')) throw new Error('00254: indeholder $mig$')
  return body
}

const asUser = (v: string) => `EXECUTE 'RESET ROLE'; EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ${v}, 'role', 'authenticated')::text, true);`
const asService = `EXECUTE 'RESET ROLE'; EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);`
const asAnon = `EXECUTE 'RESET ROLE'; EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);`
const asOwner = `EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', '', true);`
/** Kør et udsagn; gem "ok" eller SQLSTATE under nøglen */
const t = (key: string, stmt: string) => `BEGIN ${stmt}; res := jsonb_set(res, '{${key}}', '"ok"'); EXCEPTION WHEN OTHERS THEN res := jsonb_set(res, '{${key}}', to_jsonb(SQLSTATE)); END;`
/** Gem en værdi (jsonb-udtryk) — fejl gemmes som SQLSTATE */
const g = (key: string, expr: string) => `BEGIN res := jsonb_set(res, '{${key}}', coalesce((${expr}), 'null'::jsonb)); EXCEPTION WHEN OTHERS THEN res := jsonb_set(res, '{${key}}', to_jsonb(SQLSTATE)); END;`
const feed = (kind: string, party: string) => `(SELECT coalesce(jsonb_agg(f.id ORDER BY f.id), '[]') FROM public.external_feed('${kind}', ${party}) f)`
const pub = (kind: string, party: string, kase: string, ck: string, body: string, doc = 'NULL', from = 'NULL, NULL') =>
  `public.publish_external('${kind}', ${party}, ${kase}, '${ck}', 'Titel', ${body}, ${doc}, ${from})`

/**
 * rpcWrites: 00255 er anvendt → ingen bruger skriver direkte i partstabellerne; serviceleder opretter parter/relationer/
 * deltagere via RPC'erne (de samme isolationsmålinger gælder uændret bagefter).
 */
export function probe00254Sql(runBody: boolean, rpcWrites = false): string {
  return `DO $probe$
DECLARE
  res jsonb := '{}'::jsonb;
  stamp text := substr(md5(random()::text), 1, 8);
  u_sl uuid; u_salg uuid; u_mont uuid;
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid(); c_y uuid := gen_random_uuid(); s_x uuid := gen_random_uuid();
  case1 uuid := gen_random_uuid(); case2 uuid := gen_random_uuid();
  p_a uuid; p_b uuid; p_y uuid; p_x uuid;
  doc_shared uuid := gen_random_uuid(); doc_mail uuid := gen_random_uuid(); doc_internal uuid := gen_random_uuid();
  em_sup uuid := gen_random_uuid(); em_partner uuid := gen_random_uuid(); pm_cust uuid := gen_random_uuid(); note_int uuid := gen_random_uuid();
  pub_cust uuid; pub_doc uuid; pub_msg uuid; pub_partner uuid; pub_sup uuid; pub_ids uuid[];
  conv uuid := gen_random_uuid();
  ai_rel uuid;
BEGIN
  ${runBody ? `EXECUTE $mig$${migration00254Body()}$mig$;` : '-- 00254 er allerede anvendt på staging'}
  res := jsonb_set(res, '{body_ran}', to_jsonb(${runBody}));

  -- Personaer: rigtige, aktive profiler uden overrides
  SELECT p.id INTO u_sl FROM public.profiles p WHERE p.role = 'serviceleder' AND p.is_active AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO u_salg FROM public.profiles p WHERE p.role = 'salg' AND p.is_active AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO u_mont FROM public.profiles p WHERE p.role = 'montør' AND p.is_active AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1;
  res := jsonb_set(res, '{personas}', to_jsonb(u_sl IS NOT NULL AND u_salg IS NOT NULL AND u_mont IS NOT NULL));

  -- Fixtures (som ejer; alt rulles tilbage)
  INSERT INTO public.customers (id, customer_number, company_name, contact_person, email, created_by) VALUES
    (c_a, 'P254A-' || stamp, '[PROBE] Kunde A', 'Anders', 'p254-a-' || stamp || '@harness.test', u_sl),
    (c_b, 'P254B-' || stamp, '[PROBE] Kunde B', 'Bente', 'p254-b-' || stamp || '@harness.test', u_sl),
    (c_y, 'P254Y-' || stamp, '[PROBE] Partner Y', 'Yrsa', 'p254-y-' || stamp || '@harness.test', u_sl);
  INSERT INTO public.suppliers (id, name, is_active) VALUES (s_x, '[PROBE] Leverandør X ' || stamp, true);
  INSERT INTO public.service_cases (id, title, customer_id, created_by) VALUES (case1, '[PROBE] Sag 1', c_a, u_sl), (case2, '[PROBE] Sag 2', c_b, u_sl);
  INSERT INTO public.customer_documents (id, customer_id, service_case_id, title, file_url, file_name, visible_in_portal) VALUES
    (doc_shared, c_a, case1, '[PROBE] Delt tegning', 'probe://x', 'tegning.pdf', true);
  INSERT INTO public.customer_documents (id, customer_id, service_case_id, title, file_url, file_name, visible_in_portal, document_type) VALUES
    (doc_internal, c_a, case1, '[PROBE] Intern kalkule', 'probe://y', 'kalk.pdf', false, 'other');
  INSERT INTO public.incoming_emails (id, graph_message_id, subject, sender_email, body_text, customer_id, service_case_id, received_at) VALUES
    (em_sup, 'p254-sup-' || stamp, '[PROBE] Ordrebekræftelse', 'ordre@leverandoer-x.test', 'Indkøbspris 31.800 kr., batteriet er restordre', c_a, case1, now()),
    (em_partner, 'p254-par-' || stamp, '[PROBE] Partnerordre', 'ordre@partner-y.test', 'Partner-intern: vores avance 12 %', c_a, case1, now());
  INSERT INTO public.customer_documents (id, customer_id, service_case_id, title, file_url, file_name, visible_in_portal, source_email_id) VALUES
    (doc_mail, c_a, case1, '[PROBE] Ordrebekræftelse.pdf', 'probe://z', 'ob.pdf', true, em_sup);
  INSERT INTO public.portal_messages (id, customer_id, sender_type, message) VALUES (pm_cust, c_a, 'customer', '[PROBE] Hvornår kommer I?');
  INSERT INTO public.case_notes (id, case_id, content, created_by) VALUES (note_int, case1, '[PROBE] Internt: kunden er svær — giv ikke rabat', u_sl);

  -- Serviceleder (parties.manage + portal.publish) opretter parter, relationer, deltagere
  ${asUser('u_sl')}
  ${rpcWrites
    ? t('sl_parties', `PERFORM public.ensure_register_party('customer', c_a); PERFORM public.ensure_register_party('customer', c_b);
     PERFORM public.ensure_register_party('customer', c_y); PERFORM public.ensure_register_party('supplier', s_x)`)
    : t('sl_parties', `INSERT INTO public.parties (kind, display_name, customer_id, created_by) VALUES ('person', 'A', c_a, u_sl), ('person', 'B', c_b, u_sl), ('organisation', 'Y', c_y, u_sl);
     INSERT INTO public.parties (kind, display_name, supplier_id, created_by) VALUES ('organisation', 'X', s_x, u_sl)`)}
  ${asOwner}
  SELECT id INTO p_a FROM public.parties WHERE customer_id = c_a; SELECT id INTO p_b FROM public.parties WHERE customer_id = c_b;
  SELECT id INTO p_y FROM public.parties WHERE customer_id = c_y; SELECT id INTO p_x FROM public.parties WHERE supplier_id = s_x;
  ${asUser('u_sl')}
  ${rpcWrites
    ? t('sl_rel', `PERFORM public.set_party_relationship(p_y, 'cooperation_partner', '{}'::text[])`)
    : t('sl_rel', `INSERT INTO public.party_relationships (party_id, relationship, status, source, created_by) VALUES (p_a, 'customer', 'active', 'register', u_sl), (p_x, 'supplier', 'active', 'register', u_sl);
     INSERT INTO public.party_relationships (party_id, relationship, status, source, confirmed_by, confirmed_at, created_by) VALUES (p_y, 'cooperation_partner', 'active', 'manual', u_sl, now(), u_sl)`)}
  ${t('sl_rel_register_without_link', `INSERT INTO public.party_relationships (party_id, relationship, status, source, created_by) VALUES (p_y, 'supplier', 'active', 'register', u_sl)`)}
  ${t('sl_rel_active_other_confirmer', `INSERT INTO public.party_relationships (party_id, relationship, status, source, confirmed_by, confirmed_at, created_by) VALUES (p_b, 'subcontractor', 'active', 'manual', u_salg, now(), u_sl)`)}
  ${rpcWrites
    ? t('sl_participants', `PERFORM public.add_case_participant(case1, p_a, 'customer', NULL); PERFORM public.add_case_participant(case1, p_y, 'cooperation_partner', NULL);
     PERFORM public.add_case_participant(case1, p_x, 'supplier', NULL)`)
    : t('sl_participants', `INSERT INTO public.case_participants (service_case_id, party_id, role, created_by) VALUES (case1, p_a, 'customer', u_sl), (case1, p_y, 'cooperation_partner', u_sl), (case1, p_x, 'supplier', u_sl)`)}
  -- Offentliggørelser (eksplicitte, menneskeskrevne)
  BEGIN pub_cust := ${pub('customer', 'p_a', 'case1', 'status_update', `'Montage planlagt uge 49'`)}; EXCEPTION WHEN OTHERS THEN res := jsonb_set(res, '{pub_cust_err}', to_jsonb(SQLSTATE || ' ' || SQLERRM)); END;
  BEGIN pub_doc := ${pub('customer', 'p_a', 'case1', 'document', 'NULL', 'doc_shared')}; EXCEPTION WHEN OTHERS THEN res := jsonb_set(res, '{pub_doc_err}', to_jsonb(SQLSTATE || ' ' || SQLERRM)); END;
  BEGIN pub_msg := ${pub('customer', 'p_a', 'case1', 'message', `'Tak for din besked — vi kommer tirsdag'`, 'NULL', `'portal_messages', pm_cust`)}; EXCEPTION WHEN OTHERS THEN res := jsonb_set(res, '{pub_msg_err}', to_jsonb(SQLSTATE || ' ' || SQLERRM)); END;
  BEGIN pub_partner := ${pub('partner', 'p_y', 'case1', 'status_update', `'Partner-status: materialer bestilt'`)}; EXCEPTION WHEN OTHERS THEN res := jsonb_set(res, '{pub_partner_err}', to_jsonb(SQLSTATE || ' ' || SQLERRM)); END;
  BEGIN pub_sup := ${pub('supplier', 'p_x', 'case1', 'message', `'Bekræft venligst leveringsdato'`, 'NULL', `'incoming_emails', em_sup`)}; EXCEPTION WHEN OTHERS THEN res := jsonb_set(res, '{pub_sup_err}', to_jsonb(SQLSTATE || ' ' || SQLERRM)); END;
  -- Negative (serviceleder)
  ${t('neg_customer_b_on_case1', `PERFORM ${pub('customer', 'p_b', 'case1', 'message', `'x'`)}`)}
  ${t('neg_mail_attachment_doc', `PERFORM ${pub('customer', 'p_a', 'case1', 'document', 'NULL', 'doc_mail')}`)}
  ${t('neg_partner_kind_to_supplier', `PERFORM ${pub('partner', 'p_x', 'case1', 'message', `'x'`)}`)}
  ${t('neg_customer_kind_to_partner', `PERFORM ${pub('customer', 'p_y', 'case1', 'message', `'x'`)}`)}
  ${t('neg_supplier_on_case2', `PERFORM ${pub('supplier', 'p_x', 'case2', 'message', `'x'`)}`)}
  ${t('neg_empty_body', `PERFORM ${pub('customer', 'p_a', 'case1', 'message', `'   '`)}`)}
  ${t('neg_direct_insert', `INSERT INTO public.external_publications (audience_kind, audience_party_id, content_kind, body, published_by) VALUES ('customer', p_a, 'message', 'x', u_sl)`)}
  ${t('neg_edit_body', `UPDATE public.external_publications SET body = 'ændret' WHERE id = pub_cust`)}
  ${t('neg_delete', `DELETE FROM public.external_publications WHERE id = pub_cust`)}
  ${g('sl_sees_pubs', `(SELECT to_jsonb(count(*)) FROM public.external_publications WHERE service_case_id = case1)`)}
  ${g('sl_sees_participants', `(SELECT to_jsonb(count(*)) FROM public.case_participants WHERE service_case_id = case1)`)}
  ${asOwner}
  pub_ids := ARRAY[pub_cust, pub_doc, pub_msg, pub_partner, pub_sup];
  res := jsonb_set(res, '{pubs_created}', to_jsonb((SELECT count(*) FROM unnest(pub_ids) x WHERE x IS NOT NULL)));
  res := jsonb_set(res, '{audit_rows}', to_jsonb((SELECT count(*) FROM public.audit_logs WHERE action = 'external_publication_published' AND entity_id = ANY (pub_ids))));

  -- Salg uden sagen i scope / montør uden portal.publish
  ${asUser('u_salg')}
  ${t('salg_publish_case1', `PERFORM ${pub('customer', 'p_a', 'case1', 'message', `'x'`)}`)}
  ${g('salg_sees_pubs', `(SELECT to_jsonb(count(*)) FROM public.external_publications WHERE id = ANY (pub_ids))`)}
  ${g('salg_sees_participants', `(SELECT to_jsonb(count(*)) FROM public.case_participants WHERE service_case_id = case1)`)}
  ${t('salg_revoke', `PERFORM public.revoke_external_publication(pub_cust)`)}
  ${t('salg_insert_party', `INSERT INTO public.parties (kind, display_name, created_by) VALUES ('person', 'Z', u_salg)`)}
  ${asUser('u_mont')}
  ${t('mont_publish', `PERFORM ${pub('customer', 'p_a', 'case1', 'message', `'x'`)}`)}
  ${g('mont_sees_pubs', `(SELECT to_jsonb(count(*)) FROM public.external_publications WHERE id = ANY (pub_ids))`)}
  ${g('mont_sees_parties', `(SELECT to_jsonb(count(*)) FROM public.parties WHERE id IN (p_a, p_b, p_x, p_y))`)}

  -- Baggrund/AI (service_role): kan ikke offentliggøre, ikke aktivere relationer
  ${asService}
  ${t('svc_publish', `PERFORM ${pub('customer', 'p_a', 'case1', 'message', `'AI-svar'`)}`)}
  ${t('svc_direct_insert', `INSERT INTO public.external_publications (audience_kind, audience_party_id, content_kind, body, published_by) VALUES ('customer', p_a, 'message', 'AI', u_sl)`)}
  ${t('svc_revoke_update', `UPDATE public.external_publications SET revoked_at = now(), revoked_by = u_sl WHERE id = pub_cust`)}
  ${t('svc_ai_rel_active', `INSERT INTO public.party_relationships (party_id, relationship, status, source) VALUES (p_x, 'manufacturer', 'active', 'ai_suggestion')`)}
  ${t('svc_ai_rel_proposed', `INSERT INTO public.party_relationships (party_id, relationship, status, source) VALUES (p_x, 'manufacturer', 'proposed', 'ai_suggestion') RETURNING id INTO ai_rel`)}
  ${t('svc_ai_rel_activate', `UPDATE public.party_relationships SET status = 'active', confirmed_by = u_sl, confirmed_at = now() WHERE id = ai_rel`)}
  -- Feeds (portal-serveren efter token → part)
  ${g('feed_customer_a', feed('customer', 'p_a'))}
  ${g('feed_partner_y', feed('partner', 'p_y'))}
  ${g('feed_supplier_x', feed('supplier', 'p_x'))}
  ${g('feed_customer_b', feed('customer', 'p_b'))}
  ${g('feed_customer_as_y', feed('customer', 'p_y'))}
  ${g('feed_partner_as_x', feed('partner', 'p_x'))}
  ${g('feed_partner_as_a', feed('partner', 'p_a'))}
  ${g('feed_supplier_as_a', feed('supplier', 'p_a'))}
  ${g('feed_null_party', feed('customer', 'NULL'))}
  ${g('feed_columns', `(SELECT to_jsonb(array_agg(attname ORDER BY attnum)) FROM (SELECT unnest(proargnames) attname, generate_series(1, array_length(proargnames, 1)) attnum FROM pg_proc WHERE proname = 'external_feed') z WHERE attname NOT LIKE 'p\\_%')`)}
  ${g('feed_leak_text', `(SELECT to_jsonb(count(*)) FROM (SELECT * FROM public.external_feed('customer', p_a) UNION ALL SELECT * FROM public.external_feed('partner', p_y) UNION ALL SELECT * FROM public.external_feed('supplier', p_x)) f
       WHERE f.body ILIKE '%31.800%' OR f.body ILIKE '%restordre%' OR f.body ILIKE '%avance%' OR f.body ILIKE '%rabat%' OR f.title ILIKE '%Ordrebekræftelse%' OR f.document_title ILIKE '%Intern%')`)}
  ${asAnon}
  ${t('anon_parties', `PERFORM count(*) FROM public.parties`)}
  ${t('anon_pubs', `PERFORM count(*) FROM public.external_publications`)}
  ${t('anon_feed', `PERFORM count(*) FROM public.external_feed('customer', p_a)`)}
  ${asUser('u_sl')}
  ${t('auth_feed', `PERFORM count(*) FROM public.external_feed('customer', p_a)`)}
  -- Tilbagetrækning (serviceleder) → forsvinder fra feedet; anden tilbagetrækning er no-op
  ${t('sl_revoke_partner', `PERFORM public.revoke_external_publication(pub_partner)`)}
  ${t('sl_revoke_again', `PERFORM public.revoke_external_publication(pub_partner)`)}
  ${asService}
  ${g('feed_partner_y_after_revoke', feed('partner', 'p_y'))}
  -- Ny partner-offentliggørelse → relationen afsluttes → partneren er ikke længere publikum (feed tomt)
  ${asUser('u_sl')}
  ${t('sl_pub_partner2', `PERFORM ${pub('partner', 'p_y', 'case1', 'status_update', `'Partner-status 2'`)}`)}
  ${asService}
  ${g('feed_partner_y_before_end', `(SELECT to_jsonb(count(*)) FROM public.external_feed('partner', p_y))`)}
  ${asUser('u_sl')}
  ${rpcWrites
    ? t('sl_end_partner_rel', `PERFORM public.end_party_relationship((SELECT id FROM public.party_relationships WHERE party_id = p_y AND relationship = 'cooperation_partner' AND status = 'active'), 'ended')`)
    : t('sl_end_partner_rel', `UPDATE public.party_relationships SET status = 'ended' WHERE party_id = p_y AND relationship = 'cooperation_partner'`)}
  ${asService}
  ${g('feed_partner_y_after_end', `(SELECT to_jsonb(count(*)) FROM public.external_feed('partner', p_y))`)}

  -- Eksisterende kundeportal-veje (uændret kode) for kunde A: kun delte, ikke-interne, ikke-mail-dokumenter; kun egne beskeder
  ${asOwner}
  res := jsonb_set(res, '{legacy_portal_docs_a}', (SELECT coalesce(jsonb_agg(d.id ORDER BY d.id), '[]') FROM public.customer_documents d WHERE d.customer_id = c_a
      AND d.source_email_id IS NULL AND d.visible_in_portal AND (d.document_type IS NULL OR d.document_type <> 'internal')));
  res := jsonb_set(res, '{legacy_portal_msgs_a}', (SELECT coalesce(jsonb_agg(m.id), '[]') FROM public.portal_messages m WHERE m.customer_id = c_a));

  -- Kommunikationsklasse-værn (henvendelse indsat som reception_ingest ville)
  PERFORM set_config('reception.ingest', 'on', true);
  INSERT INTO public.conversations (id, channel, title, dedupe_key, first_at, last_at, intake_actor) VALUES (conv, 'email', '[PROBE] 254', 'p254:' || stamp, now(), now(), 'ai_receptionist');
  PERFORM set_config('reception.ingest', 'off', true);
  res := jsonb_set(res, '{conv_defaults}', (SELECT to_jsonb(communication_class || '/' || communication_class_source) FROM public.conversations WHERE id = conv));
  ${asService}
  ${t('cls_svc_deterministic', `UPDATE public.conversations SET communication_class = 'supplier_correspondence', communication_class_source = 'deterministic', source_party_id = p_x WHERE id = conv`)}
  ${t('cls_svc_ai_over_det', `UPDATE public.conversations SET communication_class = 'customer_request', communication_class_source = 'ai' WHERE id = conv`)}
  ${t('cls_svc_manual', `UPDATE public.conversations SET communication_class = 'customer_request', communication_class_source = 'manual' WHERE id = conv`)}
  ${asUser('u_sl')}
  ${t('cls_user_non_manual', `UPDATE public.conversations SET communication_class = 'purchase_material', communication_class_source = 'deterministic' WHERE id = conv`)}
  ${t('cls_user_manual', `UPDATE public.conversations SET communication_class = 'purchase_material', communication_class_source = 'manual' WHERE id = conv`)}
  ${asService}
  ${t('cls_svc_det_over_manual', `UPDATE public.conversations SET communication_class = 'supplier_correspondence', communication_class_source = 'deterministic' WHERE id = conv`)}
  ${asOwner}
  res := jsonb_set(res, '{conv_final}', (SELECT to_jsonb(communication_class || '/' || communication_class_source) FROM public.conversations WHERE id = conv));
  res := jsonb_set(res, '{ids}', jsonb_build_object('pub_cust', pub_cust, 'pub_doc', pub_doc, 'pub_msg', pub_msg, 'pub_partner', pub_partner, 'pub_sup', pub_sup));
  RAISE EXCEPTION 'P254RESULT%P254END', res::text;
END
$probe$;`
}

export interface Check { id: string; ok: boolean; note: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function evaluateProbe254(r: any): Check[] {
  const out: Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note: ok ? '' : note })
  const ids = r.ids ?? {}
  const set = (a: unknown) => JSON.stringify(([...(Array.isArray(a) ? a : [])] as string[]).sort())
  const exp = (...k: string[]) => JSON.stringify(k.map((x) => ids[x]).sort())
  const rej = (k: string) => typeof r[k] === 'string' && r[k] !== 'ok'
  add('personaer fundet (serviceleder/salg/montør uden overrides)', r.personas === true)
  add('serviceleder opretter parter / relationer / sagsdeltagere', r.sl_parties === 'ok' && r.sl_rel === 'ok' && r.sl_participants === 'ok', `${r.sl_parties}/${r.sl_rel}/${r.sl_participants}`)
  add('register-relation uden registerkobling afvises', rej('sl_rel_register_without_link'), r.sl_rel_register_without_link)
  add('aktiv relation med en anden bekræfter afvises', rej('sl_rel_active_other_confirmer'), r.sl_rel_active_other_confirmer)
  add('5 offentliggørelser oprettet af et menneske (+ audit pr. stk.)', r.pubs_created === 5 && r.audit_rows === 5,
    `pubs=${r.pubs_created} audit=${r.audit_rows} ${['pub_cust_err', 'pub_doc_err', 'pub_msg_err', 'pub_partner_err', 'pub_sup_err'].map((k) => r[k] ?? '').join(' ')}`)
  for (const k of ['neg_customer_b_on_case1', 'neg_mail_attachment_doc', 'neg_partner_kind_to_supplier', 'neg_customer_kind_to_partner',
    'neg_supplier_on_case2', 'neg_empty_body', 'neg_direct_insert', 'neg_edit_body', 'neg_delete']) add(`afvist: ${k}`, rej(k), r[k])
  add('serviceleder ser sagens 5 offentliggørelser og 3 deltagere (internt)', r.sl_sees_pubs === 5 && r.sl_sees_participants === 3, `${r.sl_sees_pubs}/${r.sl_sees_participants}`)
  add('salg uden sagen i scope: kan ikke offentliggøre/trække tilbage, ser 0 offentliggørelser/deltagere', rej('salg_publish_case1') && rej('salg_revoke') && r.salg_sees_pubs === 0 && r.salg_sees_participants === 0,
    `${r.salg_publish_case1}/${r.salg_revoke}/${r.salg_sees_pubs}/${r.salg_sees_participants}`)
  add('salg uden parties.manage kan ikke oprette parter', rej('salg_insert_party'), r.salg_insert_party)
  add('montør: ingen offentliggørelse, ser 0 offentliggørelser og 0 parter', rej('mont_publish') && r.mont_sees_pubs === 0 && r.mont_sees_parties === 0, `${r.mont_publish}/${r.mont_sees_pubs}/${r.mont_sees_parties}`)
  add('baggrund/AI (service_role) kan ikke offentliggøre (rpc/direkte/tilbagetræk)', rej('svc_publish') && rej('svc_direct_insert') && rej('svc_revoke_update'), `${r.svc_publish}/${r.svc_direct_insert}/${r.svc_revoke_update}`)
  add('AI-relationsforslag kun som proposed; kan ikke aktiveres af serveren', rej('svc_ai_rel_active') && r.svc_ai_rel_proposed === 'ok' && rej('svc_ai_rel_activate'), `${r.svc_ai_rel_active}/${r.svc_ai_rel_proposed}/${r.svc_ai_rel_activate}`)
  add('Kunde A ser KUN kunde-offentliggørelser til A (status, dokument, besked)', set(r.feed_customer_a) === exp('pub_cust', 'pub_doc', 'pub_msg'), JSON.stringify(r.feed_customer_a))
  add('Partner Y ser KUN partner-offentliggørelsen til Y', set(r.feed_partner_y) === exp('pub_partner'), JSON.stringify(r.feed_partner_y))
  add('Leverandør X ser KUN leverandør-offentliggørelsen til X', set(r.feed_supplier_x) === exp('pub_sup'), JSON.stringify(r.feed_supplier_x))
  add('Kunde B ser intet fra sag 1', set(r.feed_customer_b) === '[]', JSON.stringify(r.feed_customer_b))
  add('publikumstype adskiller: Y som kunde / X som partner / A som partner / A som leverandør / ingen part → tomt',
    ['feed_customer_as_y', 'feed_partner_as_x', 'feed_partner_as_a', 'feed_supplier_as_a', 'feed_null_party'].every((k) => set(r[k]) === '[]'),
    ['feed_customer_as_y', 'feed_partner_as_x', 'feed_partner_as_a', 'feed_supplier_as_a', 'feed_null_party'].map((k) => `${k}=${JSON.stringify(r[k])}`).join(' '))
  add('feedet indeholder aldrig leverandørpris/restordre/partneravance/intern rabat/mail-vedhæftning/internt dokument', r.feed_leak_text === 0, String(r.feed_leak_text))
  add('feed-projektion uden proveniens/udgiver', Array.isArray(r.feed_columns) && !r.feed_columns.some((c: string) => /derived|published_by|revoked/.test(c)), JSON.stringify(r.feed_columns))
  add('anon: ingen adgang til parter/offentliggørelser/feed', rej('anon_parties') && rej('anon_pubs') && rej('anon_feed'), `${r.anon_parties}/${r.anon_pubs}/${r.anon_feed}`)
  add('authenticated kan ikke kalde external_feed (kun portal-serveren)', rej('auth_feed'), r.auth_feed)
  add('tilbagetrækning: forsvinder fra partnerens feed; gentagelse er no-op', r.sl_revoke_partner === 'ok' && r.sl_revoke_again === 'ok' && set(r.feed_partner_y_after_revoke) === '[]',
    `${r.sl_revoke_partner}/${r.sl_revoke_again}/${JSON.stringify(r.feed_partner_y_after_revoke)}`)
  add('afsluttet partnerrelation: partneren er ikke længere publikum (feed tomt)', r.sl_pub_partner2 === 'ok' && r.feed_partner_y_before_end === 1 && r.sl_end_partner_rel === 'ok' && r.feed_partner_y_after_end === 0,
    `${r.sl_pub_partner2}/${r.feed_partner_y_before_end}/${r.sl_end_partner_rel}/${r.feed_partner_y_after_end}`)
  add('eksisterende kundeportal-dokumentvej for A: kun det delte dokument (mail-vedhæftning/internt ude)', Array.isArray(r.legacy_portal_docs_a) && r.legacy_portal_docs_a.length === 1, JSON.stringify(r.legacy_portal_docs_a))
  add('eksisterende portalbeskeder for A: kun A\'s egen besked (leverandør-/partnermail er aldrig portalbesked)', Array.isArray(r.legacy_portal_msgs_a) && r.legacy_portal_msgs_a.length === 1, JSON.stringify(r.legacy_portal_msgs_a))
  add('henvendelse standard unknown/none', r.conv_defaults === 'unknown/none', r.conv_defaults)
  add('klasse: server deterministisk ok; AI over deterministisk afvist; server kan ikke sætte manual', r.cls_svc_deterministic === 'ok' && rej('cls_svc_ai_over_det') && rej('cls_svc_manual'),
    `${r.cls_svc_deterministic}/${r.cls_svc_ai_over_det}/${r.cls_svc_manual}`)
  add('klasse: bruger kun manual; server kan ikke overskrive manual', rej('cls_user_non_manual') && r.cls_user_manual === 'ok' && rej('cls_svc_det_over_manual') && r.conv_final === 'purchase_material/manual',
    `${r.cls_user_non_manual}/${r.cls_user_manual}/${r.cls_svc_det_over_manual}/${r.conv_final}`)
  return out
}
