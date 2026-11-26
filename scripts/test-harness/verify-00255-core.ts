/**
 * 00255 parter fase B — fælles tilstands-SQL + evaluering for prod-verify-00255 (read-only) og fixture-testen.
 *
 * To driftstilstande efter 00255:
 *   inert  — flag FRA / ingen brug: 0 parter, relationer, deltagere og party-audit.
 *   active — flag TIL (prod fra 2026-11-26): rækker er tilladt, men HVER række skal være gyldig: gyldige referencer,
 *            register-konsistens, ingen udokumenterede dubletter, fuldt audit-spor med kendt aktør, 0 offentliggørelser.
 * Strukturtjekkene (RPC-ACL, ingen direkte skrivning, D-1 SELECT-politikker, anon uden adgang) gælder i begge.
 * Kun antal/flag ud — aldrig navne, e-mails, CVR eller id'er.
 */

export const RPCS_00255 = ['create_party', 'update_party', 'ensure_register_party', 'set_party_relationship', 'end_party_relationship', 'add_case_participant', 'add_case_participant_for_register', 'end_case_participant']
const RPC_LIST = RPCS_00255.map((r) => `'${r}'`).join(',')
export const ALL_FNS_00255_SQL = `(proname LIKE 'party\\_normalize%' OR proname LIKE '\\_party\\_%' OR proname IN (${RPC_LIST}))`

const PARTNER_TYPES = `('quote','invoice','contract','besigtigelse')`
// Samme filtre som portal.ts / partner-portal.ts (og prod-party-00254-baseline)
const CUSTOMER_VISIBLE = `d.visible_in_portal AND d.source_email_id IS NULL AND (d.document_type IS NULL OR d.document_type <> 'internal')`
const PARTNER_VISIBLE = `${CUSTOMER_VISIBLE} AND d.document_type IN ${PARTNER_TYPES} AND EXISTS (SELECT 1 FROM public.service_cases s JOIN public.partner_access_tokens t ON t.partner_customer_id = s.payer_customer_id AND t.is_active AND (t.expires_at IS NULL OR t.expires_at > now()) WHERE s.id = d.service_case_id)`

const PARTY_AUDIT = `(a.action LIKE 'party%' OR a.action LIKE 'case_participant%')`
const REGISTER_NULL = `p.customer_id IS NULL AND p.customer_contact_id IS NULL AND p.supplier_id IS NULL AND p.lead_id IS NULL AND p.profile_id IS NULL`

/** Ét SELECT → { j: State }. Ingen parametre, ingen persondata. */
export const STATE_00255_SQL = `SELECT json_build_object(
  'prereq', to_regclass('public.parties') IS NOT NULL AND to_regprocedure('public.party_visible_to_me(uuid)') IS NOT NULL AND to_regprocedure('public.case_visible_to_me(uuid)') IS NOT NULL,
  'fns', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND ${ALL_FNS_00255_SQL}),
  'vat_idx', to_regclass('public.parties_vat_uniq') IS NOT NULL,
  'vat_chk', (SELECT count(*) FROM pg_constraint WHERE conname = 'parties_vat_digits'),
  'write_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('parties','party_relationships','case_participants') AND cmd <> 'SELECT'),
  'select_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('parties','party_relationships','case_participants') AND cmd = 'SELECT'),
  'select_policies_non_auth', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('parties','party_relationships','case_participants','external_publications') AND cmd = 'SELECT' AND roles::text <> '{authenticated}'),
  'auth_write', has_table_privilege('authenticated', 'public.parties', 'INSERT') OR has_table_privilege('authenticated', 'public.parties', 'UPDATE') OR has_table_privilege('authenticated', 'public.parties', 'DELETE')
     OR has_table_privilege('authenticated', 'public.party_relationships', 'INSERT') OR has_table_privilege('authenticated', 'public.party_relationships', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.case_participants', 'INSERT') OR has_any_column_privilege('authenticated', 'public.case_participants', 'UPDATE'),
  'auth_select', has_table_privilege('authenticated', 'public.parties', 'SELECT') AND has_table_privilege('authenticated', 'public.party_relationships', 'SELECT') AND has_table_privilege('authenticated', 'public.case_participants', 'SELECT'),
  'anon_any', has_table_privilege('anon', 'public.parties', 'SELECT') OR has_table_privilege('anon', 'public.party_relationships', 'SELECT') OR has_table_privilege('anon', 'public.case_participants', 'SELECT') OR has_table_privilege('anon', 'public.external_publications', 'SELECT')
     OR has_table_privilege('anon', 'public.parties', 'INSERT') OR has_table_privilege('anon', 'public.case_participants', 'INSERT'),
  'rls_off', (SELECT count(*) FROM pg_class WHERE oid IN ('public.parties'::regclass, 'public.party_relationships'::regclass, 'public.case_participants'::regclass, 'public.external_publications'::regclass) AND NOT relrowsecurity),
  'parties', (SELECT count(*) FROM public.parties), 'rels', (SELECT count(*) FROM public.party_relationships), 'participants', (SELECT count(*) FROM public.case_participants),
  'rels_active', (SELECT count(*) FROM public.party_relationships WHERE status = 'active'),
  'participants_active', (SELECT count(*) FROM public.case_participants WHERE ended_at IS NULL),
  'pubs', (SELECT count(*) FROM public.external_publications),
  'pub_audit', (SELECT count(*) FROM public.audit_logs a WHERE a.action LIKE 'external\\_publication%'),
  'conversations', (SELECT count(*) FROM public.conversations),
  'conv_unclassified', (SELECT count(*) FROM public.conversations WHERE communication_class = 'unknown' AND communication_class_source = 'none' AND source_party_id IS NULL),
  'party_audit', (SELECT count(*) FROM public.audit_logs a WHERE ${PARTY_AUDIT}),
  'audit_by_action', (SELECT coalesce(json_object_agg(action, n), '{}') FROM (SELECT a.action, count(*) n FROM public.audit_logs a WHERE ${PARTY_AUDIT} GROUP BY 1) x),
  'audit_actor_roles', (SELECT coalesce(json_object_agg(r, n), '{}') FROM (SELECT coalesce(pr.role::text, '(ukendt)') r, count(*) n FROM public.audit_logs a LEFT JOIN public.profiles pr ON pr.id = a.user_id WHERE ${PARTY_AUDIT} GROUP BY 1) x),
  'integrity', json_build_object(
    -- manglende referencer (fremmednøgler burde forhindre det, tjekkes alligevel)
    'orphan_rel_party', (SELECT count(*) FROM public.party_relationships r LEFT JOIN public.parties p ON p.id = r.party_id WHERE p.id IS NULL),
    'orphan_cp_party', (SELECT count(*) FROM public.case_participants c LEFT JOIN public.parties p ON p.id = c.party_id WHERE p.id IS NULL),
    'orphan_cp_case', (SELECT count(*) FROM public.case_participants c LEFT JOIN public.service_cases s ON s.id = c.service_case_id WHERE s.id IS NULL),
    'orphan_org_party', (SELECT count(*) FROM public.parties p LEFT JOIN public.parties o ON o.id = p.organisation_party_id WHERE p.organisation_party_id IS NOT NULL AND (o.id IS NULL OR o.kind <> 'organisation')),
    'orphan_party_creator', (SELECT count(*) FROM public.parties p LEFT JOIN public.profiles pr ON pr.id = p.created_by WHERE pr.id IS NULL),
    'orphan_audit_entity', (SELECT count(*) FROM public.audit_logs a WHERE ${PARTY_AUDIT} AND (
        (a.entity_type = 'party' AND NOT EXISTS (SELECT 1 FROM public.parties p WHERE p.id = a.entity_id))
     OR (a.entity_type = 'party_relationship' AND NOT EXISTS (SELECT 1 FROM public.party_relationships r WHERE r.id = a.entity_id))
     OR (a.entity_type = 'case_participant' AND NOT EXISTS (SELECT 1 FROM public.case_participants c WHERE c.id = a.entity_id)))),
    -- register-parter: registerkolonnen er sat (ellers er registerrækken slettet → ON DELETE SET NULL)
    'register_rel_mismatch', (SELECT count(*) FROM public.party_relationships r JOIN public.parties p ON p.id = r.party_id WHERE r.source = 'register' AND NOT (
        (r.relationship = 'customer' AND p.customer_id IS NOT NULL) OR (r.relationship = 'supplier' AND p.supplier_id IS NOT NULL)
     OR (r.relationship = 'lead' AND p.lead_id IS NOT NULL) OR (r.relationship = 'internal' AND p.profile_id IS NOT NULL))),
    'register_party_without_register', (SELECT count(*) FROM public.parties p WHERE ${REGISTER_NULL} AND EXISTS (SELECT 1 FROM public.audit_logs a WHERE a.entity_type = 'party' AND a.entity_id = p.id AND a.action = 'party_created' AND a.metadata ? 'register')),
    -- gyldige relationer
    'rel_invalid', (SELECT count(*) FROM public.party_relationships r WHERE r.status NOT IN ('proposed','active','ended','rejected') OR r.source NOT IN ('manual','register','ai_suggestion')
        OR (r.status = 'active' AND r.source <> 'register' AND (r.confirmed_by IS NULL OR r.confirmed_at IS NULL)) OR r.source = 'ai_suggestion'),
    'rel_open_dup', (SELECT count(*) FROM (SELECT party_id, relationship FROM public.party_relationships WHERE status IN ('proposed','active') GROUP BY 1,2 HAVING count(*) > 1) x),
    -- gyldige sagsdeltagere
    'cp_invalid', (SELECT count(*) FROM public.case_participants c WHERE c.role NOT IN ('customer','end_customer','orderer','payer','site_contact','cooperation_partner','supplier','subcontractor','manufacturer','internal')
        OR (c.ended_at IS NOT NULL AND c.ended_at < c.created_at) OR (c.note IS NOT NULL AND length(c.note) > 500)),
    'cp_dup', (SELECT count(*) FROM (SELECT service_case_id, party_id, role FROM public.case_participants GROUP BY 1,2,3 HAVING count(*) > 1) x),
    'cp_creator_missing', (SELECT count(*) FROM public.case_participants c LEFT JOIN public.profiles pr ON pr.id = c.created_by WHERE pr.id IS NULL),
    -- dubletter
    'vat_dup', (SELECT count(*) FROM (SELECT vat_number FROM public.parties WHERE vat_number IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x),
    'vat_invalid', (SELECT count(*) FROM public.parties WHERE vat_number IS NOT NULL AND vat_number !~ '^[0-9]{8,14}$'),
    'name_dup_groups', (SELECT count(*) FROM (SELECT public.party_normalize_name(display_name) FROM public.parties GROUP BY 1 HAVING count(*) > 1) x),
    -- manuel part med samme normaliserede navn som en ÆLDRE part, uden bevidst tilsidesættelse (duplicate_override) i audit
    'name_dup_undocumented', (SELECT count(*) FROM public.parties p WHERE ${REGISTER_NULL}
        AND EXISTS (SELECT 1 FROM public.parties o WHERE o.id <> p.id AND o.created_at <= p.created_at AND public.party_normalize_name(o.display_name) = public.party_normalize_name(p.display_name))
        AND NOT EXISTS (SELECT 1 FROM public.audit_logs a WHERE a.entity_type = 'party' AND a.entity_id = p.id AND a.action = 'party_created' AND (a.metadata->>'duplicate_override')::boolean IS TRUE)),
    -- audit-spor: hver række har sin oprettelses-audit, afsluttede deltagere har afslut-audit, aktør kendt
    'party_no_audit', (SELECT count(*) FROM public.parties p WHERE NOT EXISTS (SELECT 1 FROM public.audit_logs a WHERE a.entity_type = 'party' AND a.entity_id = p.id AND a.action = 'party_created')),
    'rel_no_audit', (SELECT count(*) FROM public.party_relationships r WHERE NOT EXISTS (SELECT 1 FROM public.audit_logs a WHERE a.entity_type = 'party_relationship' AND a.entity_id = r.id AND a.action = 'party_relationship_set')
        AND NOT EXISTS (SELECT 1 FROM public.audit_logs a WHERE a.entity_type = 'party' AND a.entity_id = r.party_id AND a.action = 'party_created'
                         AND (r.source = 'register' AND a.metadata ? 'register' OR a.metadata->>'relationship' = r.relationship))),
    'rel_ended_no_audit', (SELECT count(*) FROM public.party_relationships r WHERE r.status IN ('ended','rejected') AND NOT EXISTS (SELECT 1 FROM public.audit_logs a WHERE a.entity_type = 'party_relationship' AND a.entity_id = r.id AND a.action = 'party_relationship_ended')),
    'cp_no_audit', (SELECT count(*) FROM public.case_participants c WHERE NOT EXISTS (SELECT 1 FROM public.audit_logs a WHERE a.entity_type = 'case_participant' AND a.entity_id = c.id AND a.action = 'case_participant_added')),
    'cp_ended_no_audit', (SELECT count(*) FROM public.case_participants c WHERE c.ended_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.audit_logs a WHERE a.entity_type = 'case_participant' AND a.entity_id = c.id AND a.action = 'case_participant_ended')),
    'audit_no_actor', (SELECT count(*) FROM public.audit_logs a LEFT JOIN public.profiles pr ON pr.id = a.user_id WHERE ${PARTY_AUDIT} AND pr.id IS NULL),
    'audit_actor_mismatch', (SELECT count(*) FROM public.parties p JOIN public.audit_logs a ON a.entity_type = 'party' AND a.entity_id = p.id AND a.action = 'party_created' WHERE a.user_id IS DISTINCT FROM p.created_by)
  ),
  'portal', json_build_object(
    'customer_portal_docs', (SELECT count(*) FROM public.customer_documents d WHERE ${CUSTOMER_VISIBLE}),
    'customer_portal_docs_mail_attachment', (SELECT count(*) FROM public.customer_documents d WHERE d.visible_in_portal AND d.source_email_id IS NOT NULL),
    'partner_portal_docs', (SELECT count(*) FROM public.customer_documents d WHERE ${PARTNER_VISIBLE}),
    'f1_shared_flag_cross_exposure', (SELECT count(*) FROM public.customer_documents d JOIN public.service_cases s ON s.id = d.service_case_id WHERE ${PARTNER_VISIBLE} AND s.payer_customer_id IS DISTINCT FROM d.customer_id),
    'portal_tasks_customer_visible', (SELECT count(*) FROM public.customer_tasks WHERE customer_visible))
) j`

export const ACL_00255_SQL = `SELECT json_build_object(
  'auth', (SELECT coalesce(json_agg(proname ORDER BY proname), '[]') FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND ${ALL_FNS_00255_SQL} AND has_function_privilege('authenticated', oid, 'EXECUTE')),
  'anon', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND ${ALL_FNS_00255_SQL} AND has_function_privilege('anon', oid, 'EXECUTE')),
  'svc', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND ${ALL_FNS_00255_SQL} AND has_function_privilege('service_role', oid, 'EXECUTE')),
  'definer', (SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=public']) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND (proname LIKE '\\_party\\_%' OR proname IN (${RPC_LIST})))
) j`

export type Integrity = Record<string, number>
export interface State00255 {
  prereq: boolean; fns: number; vat_idx: boolean; vat_chk: number; write_policies: number; select_policies: number; select_policies_non_auth: number
  auth_write: boolean; auth_select: boolean; anon_any: boolean; rls_off: number
  parties: number; rels: number; participants: number; rels_active: number; participants_active: number
  pubs: number; pub_audit: number; conversations: number; conv_unclassified: number; party_audit: number
  audit_by_action: Record<string, number>; audit_actor_roles: Record<string, number>
  integrity: Integrity; portal: Record<string, number>
}
export interface Acl00255 { auth: string[]; anon: number; svc: number; definer: boolean }
export type Mode00255 = 'inert' | 'active'
export interface Check { id: string; ok: boolean; note?: string }

const KNOWN_AUDIT = new Set(['party_created', 'party_updated', 'party_relationship_set', 'party_relationship_ended', 'case_participant_added', 'case_participant_ended'])

/** Tilstand ud fra data: inert = ingen partsdata overhovedet. */
export function detectMode(st: State00255): Mode00255 {
  return st.parties === 0 && st.rels === 0 && st.participants === 0 && st.party_audit === 0 ? 'inert' : 'active'
}

/** 'post'-tjek (00255 anvendt). `mode` = den forventede/detekterede driftstilstand. */
export function evaluatePost00255(st: State00255, acl: Acl00255, mode: Mode00255): Check[] {
  const c: Check[] = []
  const zero = (keys: string[]) => keys.filter((k) => (st.integrity[k] ?? -1) !== 0)
  const integ = (id: string, keys: string[]) => { const bad = zero(keys); c.push({ id, ok: bad.length === 0, note: bad.map((k) => `${k}=${st.integrity[k]}`).join(' ') }) }

  // Struktur, RLS og RPC-rettigheder (begge tilstande)
  c.push({ id: 'forudsætning: 00254 (parties, party_visible_to_me, case_visible_to_me) findes', ok: st.prereq === true })
  c.push({ id: 'struktur: 16 funktioner, CVR-indeks + cifre-tjek', ok: st.fns === 16 && st.vat_idx === true && st.vat_chk === 1, note: `fns=${st.fns}` })
  c.push({ id: 'RLS slået til på parties/party_relationships/case_participants/external_publications', ok: st.rls_off === 0, note: `rls_off=${st.rls_off}` })
  c.push({ id: 'ingen direkte skrivning: 0 skrivepolitikker, authenticated uden INSERT/UPDATE/DELETE; 3 SELECT-politikker (D-1) kun for authenticated', ok: st.write_policies === 0 && st.auth_write === false && st.auth_select === true && st.select_policies === 3 && st.select_policies_non_auth === 0 })
  c.push({ id: 'anon har ingen adgang til partstabellerne eller offentliggørelser', ok: st.anon_any === false })
  c.push({ id: 'funktions-ACL: authenticated KUN de 8 RPC\'er; anon og service_role ingen', ok: JSON.stringify(acl.auth) === JSON.stringify([...RPCS_00255].sort()) && acl.anon === 0 && acl.svc === 0, note: `auth=${acl.auth.length} anon=${acl.anon} svc=${acl.svc}` })
  c.push({ id: 'RPC\'er/hjælpere er SECURITY DEFINER med search_path=public', ok: acl.definer === true })

  // Offentliggørelser + portal (F-1 er hård blokering → 0 offentliggørelser i begge tilstande)
  c.push({ id: 'offentliggørelser: 0 rækker og 0 publicerings-audit (F-1 hård blokering)', ok: st.pubs === 0 && st.pub_audit === 0, note: `pubs=${st.pubs} audit=${st.pub_audit}` })
  c.push({ id: 'portaleksponering: ingen mail-vedhæftninger i kundeportal, ingen F-1-krydseksponering', ok: st.portal.customer_portal_docs_mail_attachment === 0 && st.portal.f1_shared_flag_cross_exposure === 0,
    note: `kunde=${st.portal.customer_portal_docs} partner=${st.portal.partner_portal_docs} opgaver=${st.portal.portal_tasks_customer_visible}` })
  c.push({ id: 'alle henvendelser stadig unknown/none uden kilde-part (ingen fase C)', ok: st.conv_unclassified === st.conversations })

  if (mode === 'inert') {
    c.push({ id: 'inert: ingen rækker i partstabellerne og ingen party-audit (flag FRA → ingen brug)', ok: st.parties === 0 && st.rels === 0 && st.participants === 0 && st.party_audit === 0 })
    return c
  }
  // Aktiv drift: rækker er tilladt — hver række skal være gyldig
  c.push({ id: 'aktiv: der er partsdata (ellers er tilstanden inert, ikke aktiv)', ok: st.parties > 0 || st.party_audit > 0, note: `parter=${st.parties} relationer=${st.rels} deltagere=${st.participants} audit=${st.party_audit}` })
  integ('manglende referencer: relation/deltager/organisation/opretter/audit-entitet peger på eksisterende rækker', ['orphan_rel_party', 'orphan_cp_party', 'orphan_cp_case', 'orphan_org_party', 'orphan_party_creator', 'orphan_audit_entity'])
  integ('register-konsistens: register-relationer har registerkoblingen; register-parter har stadig deres registerrække', ['register_rel_mismatch', 'register_party_without_register'])
  integ('gyldige relationer: gyldig status/kilde, aktiv manuel er bekræftet, ingen AI-forslag (fase C), højst én åben pr. part+type', ['rel_invalid', 'rel_open_dup'])
  integ('gyldige sagsdeltagere: gyldig rolle/note/afslutning, unik pr. sag+part+rolle, kendt opretter', ['cp_invalid', 'cp_dup', 'cp_creator_missing'])
  integ('dubletter: unikt og gyldigt CVR; navne-dubletter kun med dokumenteret bevidst tilsidesættelse', ['vat_dup', 'vat_invalid', 'name_dup_undocumented'])
  integ('audit-spor: hver part/relation/deltager har oprettelses-audit; afsluttede har afslut-audit', ['party_no_audit', 'rel_no_audit', 'rel_ended_no_audit', 'cp_no_audit', 'cp_ended_no_audit'])
  integ('audit-aktør: kendt profil på alle party-audit-rækker og = partens opretter', ['audit_no_actor', 'audit_actor_mismatch'])
  const unknown = Object.keys(st.audit_by_action).filter((a) => !KNOWN_AUDIT.has(a))
  c.push({ id: 'audit-handlinger: kun kendte 00255-handlingstyper', ok: unknown.length === 0, note: unknown.join(',') })
  return c
}
