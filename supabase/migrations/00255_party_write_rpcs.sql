-- =====================================================================================================================
-- 00255 — Parter fase B: kontrollerede skrive-RPC'er (2026-11-25). Runbook: docs/runbooks/PARTY_AUDIENCE_PHASE_B_PREFLIGHT.md
--
-- Beslutninger (Henrik 2026-11-25):
--   D-1  salg/bogholderi LÆSER hele partslisten (00254's SELECT-politik, uændret). INGEN rolle — heller ikke admin — skriver
--        direkte i parties/party_relationships/case_participants: INSERT/UPDATE-grants og -politikker fjernes; al skrivning
--        sker gennem RPC'erne herunder (SECURITY DEFINER, tjekker selv rettighed + synlighed, auditerer).
--   F-6  En bruger-INSERT … RETURNING på parties afvises af SELECT-politikken (STABLE-snapshot). RPC'erne returnerer id'et
--        som funktionsværdi → intet bruger-flow afhænger af at læse den nye række tilbage i samme udsagn.
--   cases.edit  må KUN oprette/koble den nødvendige part via sagsdeltager-flowet (add_case_participant_for_register) for en
--        kunde/kontakt der hører til den synlige sag. Fri oprettelse, redigering, relationer og andre registre kræver
--        parties.manage.
--   F-1  Uden for: ingen ændring af external_publications/external_feed/publish_external, portaler eller customer_documents.
--
-- Nyt: party_normalize_name/_emails/_domains/_vat (IMMUTABLE, interne), _party_ensure_register/_party_add_participant
-- (interne), create_party, update_party, ensure_register_party, set_party_relationship, end_party_relationship,
-- add_case_participant, add_case_participant_for_register, end_case_participant (authenticated). CVR: kun cifre + unik.
-- Ingen ændring af eksisterende rækker, triggere, wave-tabeller eller rettighedsnøgler.
-- =====================================================================================================================
BEGIN;

-- 0. Forudsætninger
DO $guard$
BEGIN
  IF to_regclass('public.parties') IS NULL OR to_regclass('public.case_participants') IS NULL
     OR to_regprocedure('public.party_visible_to_me(uuid)') IS NULL OR to_regprocedure('public.case_visible_to_me(uuid)') IS NULL THEN
    RAISE EXCEPTION '00255: 00254 mangler';
  END IF;
  IF to_regprocedure('public.create_party(text,text,uuid,text[],text[],text,text,text)') IS NOT NULL
     OR to_regclass('public.parties_vat_uniq') IS NOT NULL THEN
    RAISE EXCEPTION '00255: er allerede anvendt — kontrollér før kørsel';
  END IF;
  IF EXISTS (SELECT 1 FROM public.parties WHERE vat_number IS NOT NULL AND vat_number !~ '^[0-9]{8,14}$') THEN
    RAISE EXCEPTION '00255: parties.vat_number indeholder ikke-normaliserede værdier';
  END IF;
END
$guard$;

-- 1. Normalisering (deterministisk, uafhængig af databasens locale; spejlet i src/lib/parties/party-dedupe.ts)
CREATE FUNCTION public.party_normalize_name(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $f$
  SELECT nullif(btrim(regexp_replace(
    ' ' || btrim(regexp_replace(translate(lower(coalesce(p, '')), 'ÆØÅÄÖÜÉ', 'æøåäöüé'), '[^a-z0-9æøåäöüé]+', ' ', 'g')),
    '( (aps|ivs|as|a s|is|i s|ks|k s|ps|p s|amba|smba))+$', '')), '')
$f$;

-- Ugyldige værdier → NULL i arrayet (kalderen afviser så hele kaldet); tomme strenge ignoreres
CREATE FUNCTION public.party_normalize_emails(p text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $f$
  SELECT coalesce(array_agg(DISTINCT CASE WHEN e ~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' AND e NOT LIKE '%@elta-crm.local' THEN e END), '{}')
    FROM (SELECT lower(btrim(x)) e FROM unnest(coalesce(p, '{}'::text[])) x) s WHERE e <> ''
$f$;

CREATE FUNCTION public.party_normalize_domains(p text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $f$
  SELECT coalesce(array_agg(DISTINCT CASE WHEN d ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' AND d <> 'elta-crm.local' THEN d END), '{}')
    FROM (SELECT regexp_replace(regexp_replace(lower(btrim(x)), '^@', ''), '^www\.', '') d FROM unnest(coalesce(p, '{}'::text[])) x) s WHERE d <> ''
$f$;

-- CVR/moms: kun cifre (valgfrit DK-præfiks, mellemrum/bindestreg/punktum fjernes). '' → NULL; ugyldig → 'invalid'
CREATE FUNCTION public.party_normalize_vat(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $f$
  SELECT CASE WHEN v = '' THEN NULL WHEN v ~ '^[0-9]{8,14}$' THEN v ELSE 'invalid' END
    FROM (SELECT regexp_replace(regexp_replace(upper(btrim(coalesce(p, ''))), '[\s.-]+', '', 'g'), '^DK', '') v) s
$f$;

-- 2. CVR: normaliseret og hårdt unik (i dag 0 parter → ingen konflikt)
ALTER TABLE public.parties ADD CONSTRAINT parties_vat_digits CHECK (vat_number IS NULL OR vat_number ~ '^[0-9]{8,14}$');
CREATE UNIQUE INDEX parties_vat_uniq ON public.parties (vat_number) WHERE vat_number IS NOT NULL;

-- 3. Interne hjælpere (ingen EXECUTE til nogen app-rolle; kaldes kun fra RPC'erne herunder)

-- Idempotent register-part. Kalderen har ALLEREDE tjekket rettighed og registerrækkens synlighed.
CREATE FUNCTION public._party_ensure_register(p_register text, p_register_id uuid, p_uid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_col text;
  v_party uuid;
  v_name text;
  v_kind text := 'organisation';
  v_rel text;
  v_org uuid;
  v_email text;
  v_warn text[] := '{}';
BEGIN
  v_col := CASE p_register WHEN 'customer' THEN 'customer_id' WHEN 'customer_contact' THEN 'customer_contact_id'
                           WHEN 'supplier' THEN 'supplier_id' WHEN 'lead' THEN 'lead_id' WHEN 'profile' THEN 'profile_id' END;
  IF v_col IS NULL OR p_register_id IS NULL THEN
    RAISE EXCEPTION 'party: ukendt register' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Serialisér pr. registerrække (dobbeltklik/samtidige kald) — UNIQUE-kolonnen er bagstoppet
  PERFORM pg_advisory_xact_lock(hashtext('party:reg:' || p_register || ':' || p_register_id::text));
  EXECUTE format('SELECT id FROM public.parties WHERE %I = $1', v_col) INTO v_party USING p_register_id;
  IF v_party IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'existing', 'party_id', v_party, 'warnings', '[]'::jsonb);
  END IF;

  IF p_register = 'customer' THEN
    SELECT btrim(company_name), CASE WHEN lower(btrim(coalesce(contact_person, ''))) = lower(btrim(company_name)) THEN 'person' ELSE 'organisation' END,
           lower(btrim(email))
      INTO v_name, v_kind, v_email FROM public.customers WHERE id = p_register_id;
    v_rel := 'customer';
    -- Advarsel (ingen sammenlægning i fase B): en anden kunde med samme rigtige e-mail har allerede en part
    IF v_email IS NOT NULL AND v_email <> '' AND v_email NOT LIKE '%@elta-crm.local' AND EXISTS (
         SELECT 1 FROM public.customers c JOIN public.parties p ON p.customer_id = c.id
          WHERE c.id <> p_register_id AND lower(btrim(c.email)) = v_email) THEN
      v_warn := array_append(v_warn, 'same_email_other_customer_party');
    END IF;
  ELSIF p_register = 'customer_contact' THEN
    SELECT btrim(cc.name), p.id INTO v_name, v_org
      FROM public.customer_contacts cc LEFT JOIN public.parties p ON p.customer_id = cc.customer_id AND p.kind = 'organisation'
     WHERE cc.id = p_register_id;
    v_kind := 'person';
  ELSIF p_register = 'supplier' THEN
    SELECT btrim(name) INTO v_name FROM public.suppliers WHERE id = p_register_id;
    v_rel := 'supplier';
  ELSIF p_register = 'lead' THEN
    SELECT coalesce(nullif(btrim(company_name), ''), btrim(contact_person)),
           CASE WHEN nullif(btrim(company_name), '') IS NULL THEN 'person' ELSE 'organisation' END
      INTO v_name, v_kind FROM public.leads WHERE id = p_register_id;
    v_rel := 'lead';
  ELSE
    SELECT coalesce(nullif(btrim(full_name), ''), btrim(email)) INTO v_name FROM public.profiles WHERE id = p_register_id;
    v_kind := 'person';
    v_rel := 'internal';
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'party: registerrækken findes ikke' USING ERRCODE = 'no_data_found';
  END IF;

  v_party := gen_random_uuid();
  EXECUTE format('INSERT INTO public.parties (id, kind, display_name, organisation_party_id, %I, created_by) VALUES ($1, $2, $3, $4, $5, $6)', v_col)
    USING v_party, v_kind, left(v_name, 200), v_org, p_register_id, p_uid;
  IF v_rel IS NOT NULL THEN
    INSERT INTO public.party_relationships (party_id, relationship, status, source, created_by)
    VALUES (v_party, v_rel, 'active', 'register', p_uid);
  END IF;
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
  VALUES (p_uid, 'party', v_party, 'party_created', 'Part oprettet fra register',
          jsonb_build_object('register', p_register, 'register_id', p_register_id, 'kind', v_kind, 'warnings', to_jsonb(v_warn)));
  RETURN jsonb_build_object('status', 'created', 'party_id', v_party, 'warnings', to_jsonb(v_warn));
END $f$;

-- Idempotent deltager pr. (sag, part, rolle); en afsluttet deltager genåbnes. Kalderen har tjekket rettighed/synlighed.
CREATE FUNCTION public._party_add_participant(p_case_id uuid, p_party_id uuid, p_role text, p_note text, p_uid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_id uuid;
  v_ended timestamptz;
  v_status text;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('customer', 'end_customer', 'orderer', 'payer', 'site_contact', 'cooperation_partner',
                                      'supplier', 'subcontractor', 'manufacturer', 'internal') THEN
    RAISE EXCEPTION 'case_participant: ukendt rolle' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 500 THEN
    RAISE EXCEPTION 'case_participant: noten er for lang' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('party:cp:' || p_case_id::text || ':' || p_party_id::text || ':' || p_role));
  SELECT id, ended_at INTO v_id, v_ended FROM public.case_participants
   WHERE service_case_id = p_case_id AND party_id = p_party_id AND role = p_role;
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO public.case_participants (id, service_case_id, party_id, role, note, created_by)
    VALUES (v_id, p_case_id, p_party_id, p_role, nullif(btrim(p_note), ''), p_uid);
    v_status := 'created';
  ELSIF v_ended IS NOT NULL THEN
    UPDATE public.case_participants SET ended_at = NULL, note = coalesce(nullif(btrim(p_note), ''), note) WHERE id = v_id;
    v_status := 'reactivated';
  ELSE
    RETURN jsonb_build_object('status', 'existing', 'participant_id', v_id);
  END IF;
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
  VALUES (p_uid, 'case_participant', v_id, 'case_participant_added', 'Sagsdeltager tilføjet',
          jsonb_build_object('service_case_id', p_case_id, 'party_id', p_party_id, 'role', p_role, 'status', v_status));
  RETURN jsonb_build_object('status', v_status, 'participant_id', v_id);
END $f$;

-- Fælles indgangstjek: indlogget bruger (ikke service_role/anon)
CREATE FUNCTION public._party_require_user() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.role(), '') <> 'authenticated' THEN
    RAISE EXCEPTION 'parter: kræver en indlogget bruger' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN auth.uid();
END $f$;

-- Må brugeren se registerrækken? (samme regler som registrenes egne læsepolitikker for kunder/kontakter/leads)
CREATE FUNCTION public._party_register_visible(p_register text, p_register_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_customer uuid;
BEGIN
  IF p_register IS NULL OR p_register NOT IN ('customer', 'customer_contact', 'supplier', 'lead', 'profile') THEN
    RAISE EXCEPTION 'party: ukendt register' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_register = 'customer' THEN
    v_customer := p_register_id;
  ELSIF p_register = 'customer_contact' THEN
    SELECT customer_id INTO v_customer FROM public.customer_contacts WHERE id = p_register_id;
    IF v_customer IS NULL THEN RETURN false; END IF;
  ELSIF p_register = 'supplier' THEN
    RETURN EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_register_id);
  ELSIF p_register = 'lead' THEN
    RETURN coalesce(public.user_has_permission('leads.view'), false) AND EXISTS (SELECT 1 FROM public.leads WHERE id = p_register_id);
  ELSIF p_register = 'profile' THEN
    RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_register_id);
  ELSE
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer)
     AND coalesce(public.user_has_permission('customers.view.all') OR v_customer = ANY (public.my_customer_scope_ids()), false);
END $f$;

-- 4. RPC'er (authenticated)

-- Fri part (partner/producent/underleverandør/person uden register). Kun parties.manage. Dublet-værn: kandidater på CVR,
-- verificeret e-mail/domæne og normaliseret navn — blandt parter OG uregistrerede kunder/leverandører. Kandidater → intet
-- oprettes, medmindre p_confirm_new_reason (≥ 5 tegn) er angivet; samme CVR oprettes aldrig to gange.
CREATE FUNCTION public.create_party(p_kind text, p_display_name text, p_organisation_party_id uuid, p_verified_emails text[],
                                    p_verified_domains text[], p_vat_number text, p_relationship text, p_confirm_new_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := public._party_require_user();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_norm text := public.party_normalize_name(p_display_name);
  v_emails text[] := public.party_normalize_emails(p_verified_emails);
  v_domains text[] := public.party_normalize_domains(p_verified_domains);
  v_vat text := public.party_normalize_vat(p_vat_number);
  v_reason text := nullif(btrim(coalesce(p_confirm_new_reason, '')), '');
  v_cands jsonb;
  v_vat_hit boolean;
  v_id uuid;
BEGIN
  IF NOT coalesce(public.user_has_permission('parties.manage'), false) THEN
    RAISE EXCEPTION 'create_party: mangler parties.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('person', 'organisation') OR length(v_name) NOT BETWEEN 1 AND 200 OR v_norm IS NULL THEN
    RAISE EXCEPTION 'create_party: type eller navn er ugyldigt' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF array_position(v_emails, NULL) IS NOT NULL OR array_position(v_domains, NULL) IS NOT NULL OR v_vat = 'invalid'
     OR cardinality(v_emails) > 20 OR cardinality(v_domains) > 20 THEN
    RAISE EXCEPTION 'create_party: e-mail, domæne eller CVR er ugyldigt' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_relationship IS NOT NULL AND p_relationship NOT IN ('cooperation_partner', 'subcontractor', 'manufacturer', 'supplier', 'customer', 'lead') THEN
    RAISE EXCEPTION 'create_party: ukendt relation' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_organisation_party_id IS NOT NULL AND (p_kind <> 'person' OR NOT EXISTS (
       SELECT 1 FROM public.parties WHERE id = p_organisation_party_id AND kind = 'organisation')) THEN
    RAISE EXCEPTION 'create_party: organisationen findes ikke' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) < 5 THEN
    RAISE EXCEPTION 'create_party: begrundelsen er for kort' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Én oprettelse ad gangen (lav volumen) → to samtidige kald med samme nøgle kan aldrig begge oprette
  PERFORM pg_advisory_xact_lock(hashtext('party:create'));

  WITH c AS (
    -- Parter matches også på deres registerrækkes CVR/e-mail/navn (en register-part har typisk ingen verificerede felter)
    SELECT 'party'::text AS source, p.id, p.display_name, array_remove(ARRAY[
             CASE WHEN v_vat IS NOT NULL AND (p.vat_number = v_vat OR public.party_normalize_vat(s.vat_number) = v_vat) THEN 'vat' END,
             CASE WHEN p.verified_emails && v_emails OR lower(btrim(cu.email)) = ANY (v_emails) THEN 'email' END,
             CASE WHEN p.verified_domains && v_domains THEN 'domain' END,
             CASE WHEN v_norm IN (public.party_normalize_name(p.display_name), public.party_normalize_name(cu.company_name), public.party_normalize_name(s.name)) THEN 'name' END], NULL) AS hits
      FROM public.parties p
      LEFT JOIN public.customers cu ON cu.id = p.customer_id
      LEFT JOIN public.suppliers s ON s.id = p.supplier_id
     WHERE (v_vat IS NOT NULL AND (p.vat_number = v_vat OR public.party_normalize_vat(s.vat_number) = v_vat))
        OR p.verified_emails && v_emails OR lower(btrim(cu.email)) = ANY (v_emails) OR p.verified_domains && v_domains
        OR v_norm IN (public.party_normalize_name(p.display_name), public.party_normalize_name(cu.company_name), public.party_normalize_name(s.name))
    UNION ALL
    SELECT 'customer', cu.id, cu.company_name, array_remove(ARRAY[
             CASE WHEN lower(btrim(cu.email)) = ANY (v_emails) THEN 'email' END,
             CASE WHEN public.party_normalize_name(cu.company_name) = v_norm THEN 'name' END], NULL)
      FROM public.customers cu
     WHERE NOT EXISTS (SELECT 1 FROM public.parties p WHERE p.customer_id = cu.id)
       AND (lower(btrim(cu.email)) = ANY (v_emails) OR public.party_normalize_name(cu.company_name) = v_norm)
       AND coalesce(public.user_has_permission('customers.view.all') OR cu.id = ANY (public.my_customer_scope_ids()), false)
    UNION ALL
    SELECT 'supplier', s.id, s.name, array_remove(ARRAY[
             CASE WHEN v_vat IS NOT NULL AND public.party_normalize_vat(s.vat_number) = v_vat THEN 'vat' END,
             CASE WHEN public.party_normalize_name(s.name) = v_norm THEN 'name' END], NULL)
      FROM public.suppliers s
     WHERE NOT EXISTS (SELECT 1 FROM public.parties p WHERE p.supplier_id = s.id)
       AND ((v_vat IS NOT NULL AND public.party_normalize_vat(s.vat_number) = v_vat) OR public.party_normalize_name(s.name) = v_norm)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('source', source, 'id', id, 'display_name', display_name, 'match', to_jsonb(hits))
                            ORDER BY source, display_name), '[]'::jsonb)
    INTO v_cands
    FROM (SELECT * FROM c ORDER BY cardinality(hits) DESC, source, display_name LIMIT 20) c2;
  v_vat_hit := v_vat IS NOT NULL AND EXISTS (SELECT 1 FROM public.parties WHERE vat_number = v_vat);

  IF v_vat_hit THEN
    RETURN jsonb_build_object('status', 'duplicate_vat', 'candidates', v_cands);
  END IF;
  IF jsonb_array_length(v_cands) > 0 AND v_reason IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate_candidates', 'candidates', v_cands);
  END IF;

  v_id := gen_random_uuid();
  INSERT INTO public.parties (id, kind, display_name, organisation_party_id, verified_emails, verified_domains, vat_number, created_by)
  VALUES (v_id, p_kind, v_name, p_organisation_party_id, v_emails, v_domains, v_vat, v_uid);
  IF p_relationship IS NOT NULL THEN
    INSERT INTO public.party_relationships (party_id, relationship, status, source, confirmed_by, confirmed_at, created_by)
    VALUES (v_id, p_relationship, 'active', 'manual', v_uid, now(), v_uid);
  END IF;
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
  VALUES (v_uid, 'party', v_id, 'party_created', 'Part oprettet',
          jsonb_build_object('kind', p_kind, 'relationship', p_relationship, 'duplicate_override', v_reason IS NOT NULL,
                             'override_reason', left(v_reason, 500),
                             'candidate_ids', (SELECT coalesce(jsonb_agg(x->'id'), '[]'::jsonb) FROM jsonb_array_elements(v_cands) x)));
  RETURN jsonb_build_object('status', 'created', 'party_id', v_id);
END $f$;

-- Ret en part (navn, organisation, verificerede e-mails/domæner, CVR). Kun parties.manage. Registerkoblinger kan ikke ændres.
CREATE FUNCTION public.update_party(p_party_id uuid, p_display_name text, p_organisation_party_id uuid, p_verified_emails text[],
                                    p_verified_domains text[], p_vat_number text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := public._party_require_user();
  v_old public.parties%ROWTYPE;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_emails text[] := public.party_normalize_emails(p_verified_emails);
  v_domains text[] := public.party_normalize_domains(p_verified_domains);
  v_vat text := public.party_normalize_vat(p_vat_number);
BEGIN
  IF NOT coalesce(public.user_has_permission('parties.manage'), false) THEN
    RAISE EXCEPTION 'update_party: mangler parties.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_old FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_party: ikke fundet' USING ERRCODE = 'no_data_found';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 200 OR public.party_normalize_name(v_name) IS NULL
     OR array_position(v_emails, NULL) IS NOT NULL OR array_position(v_domains, NULL) IS NOT NULL OR v_vat = 'invalid'
     OR cardinality(v_emails) > 20 OR cardinality(v_domains) > 20 THEN
    RAISE EXCEPTION 'update_party: ugyldige værdier' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_organisation_party_id IS NOT NULL AND (v_old.kind <> 'person' OR p_organisation_party_id = p_party_id OR NOT EXISTS (
       SELECT 1 FROM public.parties WHERE id = p_organisation_party_id AND kind = 'organisation')) THEN
    RAISE EXCEPTION 'update_party: organisationen findes ikke' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_vat IS NOT NULL AND EXISTS (SELECT 1 FROM public.parties WHERE vat_number = v_vat AND id <> p_party_id) THEN
    RAISE EXCEPTION 'update_party: CVR findes allerede på en anden part' USING ERRCODE = 'unique_violation';
  END IF;
  UPDATE public.parties SET display_name = v_name, organisation_party_id = p_organisation_party_id, verified_emails = v_emails,
         verified_domains = v_domains, vat_number = v_vat, updated_at = now()
   WHERE id = p_party_id;
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, changes)
  VALUES (v_uid, 'party', p_party_id, 'party_updated', 'Part rettet',
          jsonb_build_object('display_name_changed', v_old.display_name IS DISTINCT FROM v_name,
                             'organisation_changed', v_old.organisation_party_id IS DISTINCT FROM p_organisation_party_id,
                             'emails_changed', v_old.verified_emails IS DISTINCT FROM v_emails,
                             'domains_changed', v_old.verified_domains IS DISTINCT FROM v_domains,
                             'vat_changed', v_old.vat_number IS DISTINCT FROM v_vat));
END $f$;

-- Part for en eksisterende registerrække (kunde/kontakt/leverandør/lead/medarbejder). Kun parties.manage + synlig række.
CREATE FUNCTION public.ensure_register_party(p_register text, p_register_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := public._party_require_user();
BEGIN
  IF NOT coalesce(public.user_has_permission('parties.manage'), false) THEN
    RAISE EXCEPTION 'ensure_register_party: mangler parties.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public._party_register_visible(p_register, p_register_id) THEN
    RAISE EXCEPTION 'ensure_register_party: registerrækken er ikke synlig' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._party_ensure_register(p_register, p_register_id, v_uid);
END $f$;

-- Manuel relation (et menneske bekræfter). Et åbent AI-forslag for samme relation aktiveres; en aktiv returneres uændret.
CREATE FUNCTION public.set_party_relationship(p_party_id uuid, p_relationship text, p_evidence text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := public._party_require_user();
  v_id uuid;
  v_status text;
  v_ev text[];
BEGIN
  IF NOT coalesce(public.user_has_permission('parties.manage'), false) THEN
    RAISE EXCEPTION 'set_party_relationship: mangler parties.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_relationship IS NULL OR p_relationship NOT IN ('customer', 'lead', 'supplier', 'cooperation_partner', 'subcontractor', 'manufacturer', 'internal') THEN
    RAISE EXCEPTION 'set_party_relationship: ukendt relation' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parties WHERE id = p_party_id) THEN
    RAISE EXCEPTION 'set_party_relationship: parten findes ikke' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT coalesce(array_agg(left(btrim(e), 200)) FILTER (WHERE btrim(e) <> ''), '{}') INTO v_ev FROM unnest(coalesce(p_evidence, '{}'::text[])) e;
  IF cardinality(v_ev) > 10 THEN
    RAISE EXCEPTION 'set_party_relationship: højst 10 begrundelser' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('party:rel:' || p_party_id::text || ':' || p_relationship));
  SELECT id, status INTO v_id, v_status FROM public.party_relationships
   WHERE party_id = p_party_id AND relationship = p_relationship AND status IN ('proposed', 'active');
  IF v_status = 'active' THEN
    RETURN jsonb_build_object('status', 'existing', 'relationship_id', v_id);
  ELSIF v_status = 'proposed' THEN
    UPDATE public.party_relationships SET status = 'active', confirmed_by = v_uid, confirmed_at = now(),
           evidence = CASE WHEN cardinality(v_ev) > 0 THEN v_ev ELSE evidence END
     WHERE id = v_id;
    v_status := 'confirmed';
  ELSE
    v_id := gen_random_uuid();
    INSERT INTO public.party_relationships (id, party_id, relationship, status, source, evidence, confirmed_by, confirmed_at, created_by)
    VALUES (v_id, p_party_id, p_relationship, 'active', 'manual', v_ev, v_uid, now(), v_uid);
    v_status := 'created';
  END IF;
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
  VALUES (v_uid, 'party_relationship', v_id, 'party_relationship_set', 'Relation registreret',
          jsonb_build_object('party_id', p_party_id, 'relationship', p_relationship, 'status', v_status));
  RETURN jsonb_build_object('status', v_status, 'relationship_id', v_id);
END $f$;

-- Afslut/afvis en relation. Register-relationer følger registret og kan ikke afsluttes manuelt.
CREATE FUNCTION public.end_party_relationship(p_relationship_id uuid, p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := public._party_require_user();
  v_rel public.party_relationships%ROWTYPE;
BEGIN
  IF NOT coalesce(public.user_has_permission('parties.manage'), false) THEN
    RAISE EXCEPTION 'end_party_relationship: mangler parties.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('ended', 'rejected') THEN
    RAISE EXCEPTION 'end_party_relationship: ukendt status' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO v_rel FROM public.party_relationships WHERE id = p_relationship_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'end_party_relationship: ikke fundet' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_rel.source = 'register' THEN
    RAISE EXCEPTION 'end_party_relationship: en register-relation følger registret' USING ERRCODE = 'check_violation';
  END IF;
  IF v_rel.status NOT IN ('proposed', 'active') THEN
    RETURN;
  END IF;
  UPDATE public.party_relationships SET status = p_status WHERE id = p_relationship_id;
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
  VALUES (v_uid, 'party_relationship', p_relationship_id, 'party_relationship_ended', 'Relation afsluttet',
          jsonb_build_object('party_id', v_rel.party_id, 'relationship', v_rel.relationship, 'from', v_rel.status, 'to', p_status));
END $f$;

-- Eksisterende, synlig part som deltager på en synlig sag. parties.manage ELLER cases.edit (kobling — ingen oprettelse).
CREATE FUNCTION public.add_case_participant(p_case_id uuid, p_party_id uuid, p_role text, p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := public._party_require_user();
BEGIN
  IF NOT coalesce(public.user_has_permission('parties.manage') OR public.user_has_permission('cases.edit'), false) THEN
    RAISE EXCEPTION 'add_case_participant: mangler cases.edit eller parties.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_cases WHERE id = p_case_id) OR NOT public.case_visible_to_me(p_case_id) THEN
    RAISE EXCEPTION 'add_case_participant: sagen er ikke synlig' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.party_visible_to_me(p_party_id) THEN
    RAISE EXCEPTION 'add_case_participant: parten er ikke synlig' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._party_add_participant(p_case_id, p_party_id, p_role, p_note, v_uid);
END $f$;

-- Sagsdeltager-flowet med register-part: opretter/kobler den nødvendige part og tilføjer deltageren i ét kald.
-- cases.edit uden parties.manage: KUN kunde/kontakt der hører til NETOP denne sag (sagens kunde-/partskolonner eller
-- kontaktpersonen på stedet) og som brugeren kan se. Alt andet kræver parties.manage.
CREATE FUNCTION public.add_case_participant_for_register(p_case_id uuid, p_register text, p_register_id uuid, p_role text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := public._party_require_user();
  v_manage boolean := coalesce(public.user_has_permission('parties.manage'), false);
  v_case public.service_cases%ROWTYPE;
  v_case_customers uuid[];
  v_contact_customer uuid;
  v_party jsonb;
  v_part jsonb;
BEGIN
  IF NOT (v_manage OR coalesce(public.user_has_permission('cases.edit'), false)) THEN
    RAISE EXCEPTION 'add_case_participant_for_register: mangler cases.edit eller parties.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_case FROM public.service_cases WHERE id = p_case_id;
  IF NOT FOUND OR NOT public.case_visible_to_me(p_case_id) THEN
    RAISE EXCEPTION 'add_case_participant_for_register: sagen er ikke synlig' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public._party_register_visible(p_register, p_register_id) THEN
    RAISE EXCEPTION 'add_case_participant_for_register: registerrækken er ikke synlig' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT v_manage THEN
    v_case_customers := array_remove(ARRAY[v_case.customer_id, v_case.end_customer_id, v_case.orderer_customer_id, v_case.payer_customer_id,
                                           v_case.purchased_from_customer_id, v_case.site_customer_id], NULL);
    IF p_register = 'customer' THEN
      IF NOT (p_register_id = ANY (v_case_customers)) THEN
        RAISE EXCEPTION 'add_case_participant_for_register: kunden hører ikke til sagen (kræver parties.manage)' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF p_register = 'customer_contact' THEN
      SELECT customer_id INTO v_contact_customer FROM public.customer_contacts WHERE id = p_register_id;
      IF NOT (p_register_id IS NOT DISTINCT FROM v_case.site_contact_id OR v_contact_customer = ANY (v_case_customers)) THEN
        RAISE EXCEPTION 'add_case_participant_for_register: kontakten hører ikke til sagen (kræver parties.manage)' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      RAISE EXCEPTION 'add_case_participant_for_register: kun kunde/kontakt uden parties.manage' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  v_party := public._party_ensure_register(p_register, p_register_id, v_uid);
  v_part := public._party_add_participant(p_case_id, (v_party->>'party_id')::uuid, p_role, p_note, v_uid);
  RETURN jsonb_build_object('status', v_part->>'status', 'participant_id', v_part->'participant_id', 'party_id', v_party->'party_id',
                            'party_status', v_party->>'status', 'warnings', v_party->'warnings');
END $f$;

CREATE FUNCTION public.end_case_participant(p_participant_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := public._party_require_user();
  v_cp public.case_participants%ROWTYPE;
BEGIN
  IF NOT coalesce(public.user_has_permission('parties.manage') OR public.user_has_permission('cases.edit'), false) THEN
    RAISE EXCEPTION 'end_case_participant: mangler cases.edit eller parties.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_cp FROM public.case_participants WHERE id = p_participant_id FOR UPDATE;
  IF NOT FOUND OR NOT public.case_visible_to_me(v_cp.service_case_id) THEN
    RAISE EXCEPTION 'end_case_participant: ikke fundet' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_cp.ended_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.case_participants SET ended_at = now() WHERE id = p_participant_id;
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
  VALUES (v_uid, 'case_participant', p_participant_id, 'case_participant_ended', 'Sagsdeltager afsluttet',
          jsonb_build_object('service_case_id', v_cp.service_case_id, 'party_id', v_cp.party_id, 'role', v_cp.role));
END $f$;

-- 5. Ingen direkte skrivning for nogen app-bruger (D-1/F-6). SELECT-politikkerne fra 00254 er uændrede.
DROP POLICY parties_insert ON public.parties;
DROP POLICY parties_update ON public.parties;
DROP POLICY party_relationships_insert ON public.party_relationships;
DROP POLICY party_relationships_update ON public.party_relationships;
DROP POLICY case_participants_insert ON public.case_participants;
DROP POLICY case_participants_update ON public.case_participants;
REVOKE INSERT, UPDATE, DELETE ON public.parties, public.party_relationships, public.case_participants FROM authenticated;
REVOKE UPDATE (role, note, ended_at) ON public.case_participants FROM authenticated;

-- 6. Funktions-ACL (prods default privileges giver nye funktioner EXECUTE til anon/authenticated/service_role)
REVOKE ALL ON FUNCTION public.party_normalize_name(text), public.party_normalize_emails(text[]), public.party_normalize_domains(text[]),
  public.party_normalize_vat(text), public._party_ensure_register(text, uuid, uuid), public._party_add_participant(uuid, uuid, text, text, uuid),
  public._party_require_user(), public._party_register_visible(text, uuid),
  public.create_party(text, text, uuid, text[], text[], text, text, text), public.update_party(uuid, text, uuid, text[], text[], text),
  public.ensure_register_party(text, uuid), public.set_party_relationship(uuid, text, text[]), public.end_party_relationship(uuid, text),
  public.add_case_participant(uuid, uuid, text, text), public.add_case_participant_for_register(uuid, text, uuid, text, text),
  public.end_case_participant(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.create_party(text, text, uuid, text[], text[], text, text, text), public.update_party(uuid, text, uuid, text[], text[], text),
  public.ensure_register_party(text, uuid), public.set_party_relationship(uuid, text, text[]), public.end_party_relationship(uuid, text),
  public.add_case_participant(uuid, uuid, text, text), public.add_case_participant_for_register(uuid, text, uuid, text, text),
  public.end_case_participant(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ROLLBACK (manuel; kun ved en egentlig beslutning — docs/runbooks/sql/00255_rollback.sql er samme tekst). Fjerner RPC'erne,
-- CVR-indekset/-tjekket og genskaber 00254's direkte skrivepolitikker og grants præcist. Parter/relationer/deltagere og
-- audit_logs-rækker oprettet via RPC'erne bliver liggende (interne, eksternt usynlige).
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.end_case_participant(uuid);
-- DROP FUNCTION IF EXISTS public.add_case_participant_for_register(uuid, text, uuid, text, text);
-- DROP FUNCTION IF EXISTS public.add_case_participant(uuid, uuid, text, text);
-- DROP FUNCTION IF EXISTS public.end_party_relationship(uuid, text);
-- DROP FUNCTION IF EXISTS public.set_party_relationship(uuid, text, text[]);
-- DROP FUNCTION IF EXISTS public.ensure_register_party(text, uuid);
-- DROP FUNCTION IF EXISTS public.update_party(uuid, text, uuid, text[], text[], text);
-- DROP FUNCTION IF EXISTS public.create_party(text, text, uuid, text[], text[], text, text, text);
-- DROP FUNCTION IF EXISTS public._party_register_visible(text, uuid);
-- DROP FUNCTION IF EXISTS public._party_require_user();
-- DROP FUNCTION IF EXISTS public._party_add_participant(uuid, uuid, text, text, uuid);
-- DROP FUNCTION IF EXISTS public._party_ensure_register(text, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.party_normalize_vat(text);
-- DROP FUNCTION IF EXISTS public.party_normalize_domains(text[]);
-- DROP FUNCTION IF EXISTS public.party_normalize_emails(text[]);
-- DROP FUNCTION IF EXISTS public.party_normalize_name(text);
-- DROP INDEX IF EXISTS public.parties_vat_uniq;
-- ALTER TABLE public.parties DROP CONSTRAINT IF EXISTS parties_vat_digits;
-- CREATE POLICY parties_insert ON public.parties FOR INSERT TO authenticated
--   WITH CHECK ((SELECT public.user_has_permission('parties.manage')) AND created_by = auth.uid()
--               AND (customer_id IS NULL OR (SELECT public.user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])));
-- CREATE POLICY parties_update ON public.parties FOR UPDATE TO authenticated
--   USING ((SELECT public.user_has_permission('parties.manage')))
--   WITH CHECK ((SELECT public.user_has_permission('parties.manage'))
--               AND (customer_id IS NULL OR (SELECT public.user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])));
-- CREATE POLICY party_relationships_insert ON public.party_relationships FOR INSERT TO authenticated
--   WITH CHECK ((SELECT public.user_has_permission('parties.manage')) AND created_by = auth.uid() AND source IN ('manual', 'register'));
-- CREATE POLICY party_relationships_update ON public.party_relationships FOR UPDATE TO authenticated
--   USING ((SELECT public.user_has_permission('parties.manage'))) WITH CHECK ((SELECT public.user_has_permission('parties.manage')));
-- CREATE POLICY case_participants_insert ON public.case_participants FOR INSERT TO authenticated
--   WITH CHECK (((SELECT public.user_has_permission('parties.manage')) OR (SELECT public.user_has_permission('cases.edit')))
--               AND created_by = auth.uid() AND public.case_visible_to_me(service_case_id) AND public.party_visible_to_me(party_id));
-- CREATE POLICY case_participants_update ON public.case_participants FOR UPDATE TO authenticated
--   USING (((SELECT public.user_has_permission('parties.manage')) OR (SELECT public.user_has_permission('cases.edit'))) AND public.case_visible_to_me(service_case_id))
--   WITH CHECK (((SELECT public.user_has_permission('parties.manage')) OR (SELECT public.user_has_permission('cases.edit'))) AND public.case_visible_to_me(service_case_id));
-- GRANT INSERT, UPDATE ON public.parties, public.party_relationships TO authenticated;
-- GRANT INSERT, UPDATE (role, note, ended_at) ON public.case_participants TO authenticated;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
