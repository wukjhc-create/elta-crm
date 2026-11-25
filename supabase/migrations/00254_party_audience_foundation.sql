-- =====================================================================================================================
-- 00254 — Parts-/relations-/publikumsfundament (2026-11-23). ADDITIV. Ingen backfill, ingen ændring af eksisterende rækker.
-- Runbook: docs/runbooks/COMMUNICATION_PARTY_AUDIENCE_MODEL.md
--
-- Princip: sagskobling ≠ portalsynlighed. Eksterne parter (kunde/partner/leverandør/underleverandør/producent) ser KUN
-- poster der eksplicit er offentliggjort til NETOP dem (external_publications: publikumstype + bestemt part). Et menneske
-- offentliggør; baggrunds-/AI-kode kan ikke (publish_external kræver en indlogget bruger, og et værn afviser alle andre
-- skrivere — også service_role).
--
-- Nyt:
--   parties                 kanonisk part (person/organisation) med valgfri 1:1-kobling til de eksisterende registre
--                           (customers, customer_contacts, suppliers, leads, profiles). Registrene forbliver kanoniske.
--   party_relationships     partens relationer til ELTA (flere pr. part): customer/lead/supplier/cooperation_partner/
--                           subcontractor/manufacturer/internal. AI må kun foreslå (status 'proposed').
--   case_participants       flere parter pr. sag med rolle. Giver INGEN portaladgang.
--   external_publications   eksplicitte, uforanderlige offentliggørelser (kun revoked_at kan sættes).
--   conversations           + source_party_id, communication_class, communication_class_source (intern henvendelse;
--                           klassifikation bestemmer ALDRIG synlighed).
-- Nøgler: parties.manage (admin/serviceleder), portal.publish (admin/serviceleder/salg).
-- anon: intet. Portalerne læser KUN via external_feed() (service_role, eksplicit projektion, præcis part + type).
-- =====================================================================================================================
BEGIN;

-- 0. Forudsætninger
DO $guard$
BEGIN
  IF to_regprocedure('public.user_has_permission(text)') IS NULL OR to_regprocedure('public.my_customer_scope_ids()') IS NULL
     OR to_regprocedure('public.my_case_scope_ids()') IS NULL OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.role()') IS NULL THEN
    RAISE EXCEPTION '00254: hjælpefunktioner mangler (00238/00240/auth)';
  END IF;
  IF to_regclass('public.conversations') IS NULL THEN
    RAISE EXCEPTION '00254: conversations mangler (00249)';
  END IF;
  IF to_regclass('public.parties') IS NOT NULL OR to_regclass('public.party_relationships') IS NOT NULL
     OR to_regclass('public.case_participants') IS NOT NULL OR to_regclass('public.external_publications') IS NOT NULL THEN
    RAISE EXCEPTION '00254: tabellerne findes allerede — kontrollér før kørsel';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversations'
             AND column_name IN ('source_party_id', 'communication_class', 'communication_class_source')) THEN
    RAISE EXCEPTION '00254: conversations har allerede partskolonnerne';
  END IF;
END
$guard$;

-- 1. Parter
CREATE TABLE public.parties (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                  text NOT NULL CHECK (kind IN ('person', 'organisation')),
  display_name          text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  organisation_party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  customer_id           uuid UNIQUE REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_contact_id   uuid UNIQUE REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  supplier_id           uuid UNIQUE REFERENCES public.suppliers(id) ON DELETE SET NULL,
  lead_id               uuid UNIQUE REFERENCES public.leads(id) ON DELETE SET NULL,
  profile_id            uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_emails       text[] NOT NULL DEFAULT '{}',
  verified_domains      text[] NOT NULL DEFAULT '{}',
  vat_number            text CHECK (vat_number IS NULL OR length(vat_number) <= 40),
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parties_org_not_self CHECK (organisation_party_id IS NULL OR organisation_party_id <> id),
  CONSTRAINT parties_org_only_for_person CHECK (kind = 'person' OR organisation_party_id IS NULL),
  CONSTRAINT parties_verified_lower CHECK (verified_emails = lower(verified_emails::text)::text[] AND verified_domains = lower(verified_domains::text)::text[])
);
CREATE INDEX parties_org_idx ON public.parties (organisation_party_id) WHERE organisation_party_id IS NOT NULL;

-- 2. Relationer (flere pr. part; ikke eksklusive)
CREATE TABLE public.party_relationships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id      uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  relationship  text NOT NULL CHECK (relationship IN ('customer', 'lead', 'supplier', 'cooperation_partner', 'subcontractor', 'manufacturer', 'internal')),
  status        text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'active', 'ended', 'rejected')),
  source        text NOT NULL CHECK (source IN ('manual', 'register', 'ai_suggestion')),
  evidence      text[] NOT NULL DEFAULT '{}' CHECK (array_length(evidence, 1) IS NULL OR array_length(evidence, 1) <= 10),
  confirmed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at  timestamptz,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Aktiv relation kræver et menneske (eller en kanonisk registerrække); et AI-forslag bliver aldrig aktivt af sig selv
  CONSTRAINT party_rel_active_confirmed CHECK (status <> 'active' OR source = 'register' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
CREATE UNIQUE INDEX party_rel_open_uniq ON public.party_relationships (party_id, relationship) WHERE status IN ('proposed', 'active');

-- 3. Sagsdeltagere (flere parter pr. sag, med rolle). Deltagelse giver INGEN ekstern adgang.
CREATE TABLE public.case_participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id uuid NOT NULL REFERENCES public.service_cases(id) ON DELETE CASCADE,
  party_id        uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('customer', 'end_customer', 'orderer', 'payer', 'site_contact', 'cooperation_partner',
                                                'supplier', 'subcontractor', 'manufacturer', 'internal')),
  note            text CHECK (note IS NULL OR length(note) <= 500),
  ended_at        timestamptz,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_participants_uniq UNIQUE (service_case_id, party_id, role)
);
CREATE INDEX case_participants_party_idx ON public.case_participants (party_id);

-- 4. Eksplicitte offentliggørelser (publikum = type + bestemt part)
CREATE TABLE public.external_publications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_kind      text NOT NULL CHECK (audience_kind IN ('customer', 'partner', 'supplier', 'subcontractor', 'manufacturer')),
  audience_party_id  uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  service_case_id    uuid REFERENCES public.service_cases(id) ON DELETE CASCADE,
  content_kind       text NOT NULL CHECK (content_kind IN ('message', 'status_update', 'document')),
  title              text CHECK (title IS NULL OR length(title) <= 200),
  body               text CHECK (body IS NULL OR length(body) <= 5000),
  document_id        uuid REFERENCES public.customer_documents(id) ON DELETE CASCADE,
  -- Intern proveniens (aldrig i feedet). Indholdet er ALTID den offentliggjorte tekst — originalen eksponeres aldrig.
  derived_from_table text CHECK (derived_from_table IS NULL OR derived_from_table IN ('conversations', 'conversation_items', 'incoming_emails', 'portal_messages', 'case_notes', 'customer_documents')),
  derived_from_id    uuid,
  published_by       uuid NOT NULL REFERENCES public.profiles(id),
  published_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  revoked_by         uuid REFERENCES public.profiles(id),
  CONSTRAINT ext_pub_document CHECK ((content_kind = 'document') = (document_id IS NOT NULL)),
  CONSTRAINT ext_pub_body CHECK (content_kind = 'document' OR (body IS NOT NULL AND length(btrim(body)) > 0)),
  CONSTRAINT ext_pub_revoked CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT ext_pub_provenance CHECK ((derived_from_table IS NULL) = (derived_from_id IS NULL))
);
CREATE INDEX ext_pub_audience_idx ON public.external_publications (audience_kind, audience_party_id, published_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX ext_pub_case_idx ON public.external_publications (service_case_id) WHERE service_case_id IS NOT NULL;

-- 5. Henvendelser: kilde-part + kommunikationsklasse (uafhængig af part; bestemmer ALDRIG synlighed)
ALTER TABLE public.conversations
  ADD COLUMN source_party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  ADD COLUMN communication_class text NOT NULL DEFAULT 'unknown' CHECK (communication_class IN (
    'customer_request', 'lead', 'partner_order', 'supplier_correspondence', 'purchase_material', 'supplier_invoice',
    'technical_support', 'subcontractor', 'internal', 'automated_system', 'newsletter', 'unknown')),
  ADD COLUMN communication_class_source text NOT NULL DEFAULT 'none' CHECK (communication_class_source IN ('none', 'ai', 'deterministic', 'manual'));

-- 6. Hjælpefunktioner
CREATE FUNCTION public.case_visible_to_me(p_case uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT coalesce(p_case IS NOT NULL AND (public.user_has_permission('cases.view.all') OR p_case = ANY (public.my_case_scope_ids())), false)
$f$;

CREATE FUNCTION public.party_visible_to_me(p_party uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM public.parties p WHERE p.id = p_party AND (
      public.user_has_permission('parties.manage')
      OR public.user_has_permission('customers.view.all')
      OR (p.customer_id IS NOT NULL AND p.customer_id = ANY (public.my_customer_scope_ids()))
      OR p.profile_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.case_participants cp WHERE cp.party_id = p.id AND public.case_visible_to_me(cp.service_case_id))))
$f$;

-- Klasse-præcedens: manual > deterministic > ai > none. Kun et menneske kan sætte 'manual'; kun serveren 'ai'/'deterministic'.
CREATE FUNCTION public.conversations_party_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  is_user boolean := coalesce(auth.role(), '') <> 'service_role' AND auth.uid() IS NOT NULL;
  rank_old int := CASE OLD.communication_class_source WHEN 'manual' THEN 3 WHEN 'deterministic' THEN 2 WHEN 'ai' THEN 1 ELSE 0 END;
  rank_new int := CASE NEW.communication_class_source WHEN 'manual' THEN 3 WHEN 'deterministic' THEN 2 WHEN 'ai' THEN 1 ELSE 0 END;
BEGIN
  IF NEW.communication_class IS NOT DISTINCT FROM OLD.communication_class
     AND NEW.communication_class_source IS NOT DISTINCT FROM OLD.communication_class_source
     AND NEW.source_party_id IS NOT DISTINCT FROM OLD.source_party_id THEN
    RETURN NEW;
  END IF;
  IF is_user THEN
    IF (NEW.communication_class IS DISTINCT FROM OLD.communication_class OR NEW.communication_class_source IS DISTINCT FROM OLD.communication_class_source)
       AND NEW.communication_class_source <> 'manual' THEN
      RAISE EXCEPTION 'conversations: en bruger kan kun sætte klassen manuelt (communication_class_source=manual)' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.source_party_id IS DISTINCT FROM OLD.source_party_id AND NEW.source_party_id IS NOT NULL
       AND NOT public.party_visible_to_me(NEW.source_party_id) THEN
      RAISE EXCEPTION 'conversations: parten er ikke synlig for brugeren' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    IF NEW.communication_class_source = 'manual' AND OLD.communication_class_source IS DISTINCT FROM 'manual' THEN
      RAISE EXCEPTION 'conversations: kun et menneske kan sætte en manuel klasse' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF rank_new < rank_old THEN
      RAISE EXCEPTION 'conversations: en svagere klassekilde kan ikke overskrive en stærkere (%→%)', OLD.communication_class_source, NEW.communication_class_source
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_conversations_party_guard BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.conversations_party_guard();

-- Relationer: et AI-forslag (service_role) kan kun være 'proposed'; ændring af status kræver et menneske, undtagen register
CREATE FUNCTION public.party_relationships_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  is_user boolean := coalesce(auth.role(), '') <> 'service_role' AND auth.uid() IS NOT NULL;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.party_id IS DISTINCT FROM OLD.party_id OR NEW.relationship IS DISTINCT FROM OLD.relationship
                           OR NEW.source IS DISTINCT FROM OLD.source OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'party_relationships: part/relation/kilde kan ikke ændres' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.source = 'ai_suggestion' AND TG_OP = 'INSERT' AND NEW.status <> 'proposed' THEN
    RAISE EXCEPTION 'party_relationships: et AI-forslag oprettes kun som proposed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'active' AND NEW.source <> 'register' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    IF NOT is_user OR NEW.confirmed_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'party_relationships: aktivering kræver den indloggede bruger som bekræfter' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF NEW.source = 'register' AND TG_OP = 'INSERT' AND NOT EXISTS (
       SELECT 1 FROM public.parties p WHERE p.id = NEW.party_id AND (
         (NEW.relationship = 'customer' AND p.customer_id IS NOT NULL) OR (NEW.relationship = 'supplier' AND p.supplier_id IS NOT NULL)
         OR (NEW.relationship = 'lead' AND p.lead_id IS NOT NULL) OR (NEW.relationship = 'internal' AND p.profile_id IS NOT NULL))) THEN
    RAISE EXCEPTION 'party_relationships: register-relation kræver en kobling til det kanoniske register' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_party_relationships_guard BEFORE INSERT OR UPDATE ON public.party_relationships
  FOR EACH ROW EXECUTE FUNCTION public.party_relationships_guard();

-- Offentliggørelser: ALLE skrivere (også service_role) — oprettes kun af en indlogget bruger via publish_external;
-- uforanderlige bortset fra tilbagetrækning (én gang). Ingen DELETE-grant til nogen app-rolle (kun FK-kaskade når sag/
-- part/dokument slettes — værnet blokerer derfor ikke DELETE, så sletning af en sag ikke brydes).
CREATE FUNCTION public.external_publications_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('elta.publish', true) IS DISTINCT FROM 'on' OR auth.uid() IS NULL OR NEW.published_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'external_publications: oprettes kun af en indlogget bruger via publish_external' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'revoked_at' - 'revoked_by') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at' - 'revoked_by')
     OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'external_publications: uforanderlig (kun én tilbagetrækning)' USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() IS NULL OR NEW.revoked_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'external_publications: tilbagetrækning kræver den indloggede bruger' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_external_publications_guard BEFORE INSERT OR UPDATE ON public.external_publications
  FOR EACH ROW EXECUTE FUNCTION public.external_publications_guard();

-- Må parten være dette publikum? (bestemt af register-kobling eller aktiv, menneskeligt bekræftet relation — aldrig af klassifikation)
CREATE FUNCTION public.party_can_be_audience(p_party uuid, p_kind text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM public.parties p WHERE p.id = p_party AND (
      (p_kind = 'customer' AND p.customer_id IS NOT NULL)
      OR (p_kind = 'supplier' AND (p.supplier_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.party_relationships r WHERE r.party_id = p.id AND r.relationship = 'supplier' AND r.status = 'active')))
      OR (p_kind = 'partner' AND EXISTS (SELECT 1 FROM public.party_relationships r WHERE r.party_id = p.id AND r.relationship = 'cooperation_partner' AND r.status = 'active'))
      OR (p_kind = 'subcontractor' AND EXISTS (SELECT 1 FROM public.party_relationships r WHERE r.party_id = p.id AND r.relationship = 'subcontractor' AND r.status = 'active'))
      OR (p_kind = 'manufacturer' AND EXISTS (SELECT 1 FROM public.party_relationships r WHERE r.party_id = p.id AND r.relationship = 'manufacturer' AND r.status = 'active'))))
$f$;

-- Offentliggør (eksplicit menneskelig handling). Ingen service_role-grant: baggrunds-/AI-kode kan ikke kalde den.
CREATE FUNCTION public.publish_external(
  p_audience_kind text, p_audience_party_id uuid, p_service_case_id uuid, p_content_kind text,
  p_title text, p_body text, p_document_id uuid, p_derived_from_table text, p_derived_from_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_case public.service_cases%ROWTYPE;
  v_party public.parties%ROWTYPE;
  v_doc public.customer_documents%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR coalesce(auth.role(), '') <> 'authenticated' THEN
    RAISE EXCEPTION 'publish_external: kræver en indlogget bruger' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT coalesce(public.user_has_permission('portal.publish'), false) THEN
    RAISE EXCEPTION 'publish_external: mangler portal.publish' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_party FROM public.parties WHERE id = p_audience_party_id;
  IF NOT FOUND OR NOT public.party_can_be_audience(p_audience_party_id, p_audience_kind) THEN
    RAISE EXCEPTION 'publish_external: parten kan ikke være publikum %', p_audience_kind USING ERRCODE = 'check_violation';
  END IF;
  IF p_service_case_id IS NOT NULL THEN
    SELECT * INTO v_case FROM public.service_cases WHERE id = p_service_case_id;
    IF NOT FOUND OR NOT public.case_visible_to_me(p_service_case_id) THEN
      RAISE EXCEPTION 'publish_external: sagen er ikke synlig for brugeren' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Publikum skal høre til sagen: kundepublikum = sagens (slut)kunde; øvrige = aktiv deltager med matchende rolle
    -- NB: coalesce(…, false) overalt — en NULL-sammenligning må aldrig blive til "ikke afvist"
    IF NOT coalesce(
      (p_audience_kind = 'customer' AND v_party.customer_id IS NOT NULL
        AND (v_party.customer_id = v_case.customer_id OR v_party.customer_id IS NOT DISTINCT FROM v_case.end_customer_id))
      OR EXISTS (SELECT 1 FROM public.case_participants cp
                  WHERE cp.service_case_id = p_service_case_id AND cp.party_id = p_audience_party_id AND cp.ended_at IS NULL
                    AND ((p_audience_kind = 'customer' AND cp.role IN ('customer', 'end_customer', 'orderer', 'payer'))
                         OR (p_audience_kind = 'partner' AND cp.role = 'cooperation_partner')
                         OR (p_audience_kind IN ('supplier', 'subcontractor', 'manufacturer') AND cp.role = p_audience_kind))), false) THEN
      RAISE EXCEPTION 'publish_external: parten deltager ikke i sagen som %', p_audience_kind USING ERRCODE = 'check_violation';
    END IF;
  ELSIF p_audience_kind = 'customer' AND NOT coalesce(public.user_has_permission('customers.view.all') OR v_party.customer_id = ANY (public.my_customer_scope_ids()), false) THEN
    RAISE EXCEPTION 'publish_external: kunden er ikke synlig for brugeren' USING ERRCODE = 'insufficient_privilege';
  ELSIF p_audience_kind <> 'customer' AND NOT coalesce(public.user_has_permission('parties.manage'), false) THEN
    RAISE EXCEPTION 'publish_external: offentliggørelse uden sag til ikke-kunde kræver parties.manage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_content_kind = 'document' THEN
    SELECT * INTO v_doc FROM public.customer_documents WHERE id = p_document_id;
    -- Mail-vedhæftninger og interne dokumenter offentliggøres aldrig; dokumentet skal høre til sagen/kunden
    IF NOT FOUND OR v_doc.source_email_id IS NOT NULL OR coalesce(v_doc.document_type, '') = 'internal'
       OR NOT coalesce((p_service_case_id IS NOT NULL AND v_doc.service_case_id = p_service_case_id)
               OR (p_service_case_id IS NULL AND p_audience_kind = 'customer' AND v_doc.customer_id = v_party.customer_id), false) THEN
      RAISE EXCEPTION 'publish_external: dokumentet kan ikke offentliggøres her' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- Proveniens: en intern mail/notat bliver ALDRIG eksponeret; kun den nye, menneskeskrevne tekst vises
  PERFORM set_config('elta.publish', 'on', true);
  INSERT INTO public.external_publications (audience_kind, audience_party_id, service_case_id, content_kind, title, body, document_id,
                                            derived_from_table, derived_from_id, published_by)
  VALUES (p_audience_kind, p_audience_party_id, p_service_case_id, p_content_kind, nullif(btrim(p_title), ''),
          CASE WHEN p_content_kind = 'document' THEN nullif(btrim(p_body), '') ELSE btrim(p_body) END,
          CASE WHEN p_content_kind = 'document' THEN p_document_id END, p_derived_from_table, p_derived_from_id, v_uid)
  RETURNING id INTO v_id;
  PERFORM set_config('elta.publish', 'off', true);
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
  VALUES (v_uid, 'external_publication', v_id, 'external_publication_published', 'Offentliggjort til ' || p_audience_kind,
          jsonb_build_object('audience_kind', p_audience_kind, 'audience_party_id', p_audience_party_id, 'service_case_id', p_service_case_id,
                             'content_kind', p_content_kind, 'derived_from_table', p_derived_from_table));
  RETURN v_id;
END $f$;

CREATE FUNCTION public.revoke_external_publication(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_pub public.external_publications%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR coalesce(auth.role(), '') <> 'authenticated' OR NOT coalesce(public.user_has_permission('portal.publish'), false) THEN
    RAISE EXCEPTION 'revoke_external_publication: kræver indlogget bruger med portal.publish' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_pub FROM public.external_publications WHERE id = p_id;
  IF NOT FOUND OR (v_pub.service_case_id IS NOT NULL AND NOT public.case_visible_to_me(v_pub.service_case_id))
     OR (v_pub.service_case_id IS NULL AND NOT public.party_visible_to_me(v_pub.audience_party_id)) THEN
    RAISE EXCEPTION 'revoke_external_publication: ikke fundet' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_pub.revoked_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.external_publications SET revoked_at = now(), revoked_by = v_uid WHERE id = p_id;
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
  VALUES (v_uid, 'external_publication', p_id, 'external_publication_revoked', 'Offentliggørelse trukket tilbage',
          jsonb_build_object('audience_kind', v_pub.audience_kind, 'audience_party_id', v_pub.audience_party_id));
END $f$;

-- Eneste eksterne læsevej: præcis publikumstype + præcis part, ikke tilbagetrukket, eksplicit projektion (ingen proveniens,
-- ingen udgiver). Dokumenter tjekkes igen ved læsning (mail-vedhæftning/internt → aldrig). Kun service_role (portal-serveren
-- har allerede løst tokenet til parten).
CREATE FUNCTION public.external_feed(p_audience_kind text, p_party_id uuid)
RETURNS TABLE (id uuid, service_case_id uuid, case_number text, content_kind text, title text, body text, document_id uuid,
               document_title text, document_file_name text, document_mime_type text, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT e.id, e.service_case_id, s.case_number, e.content_kind, e.title, e.body, e.document_id,
         d.title, d.file_name, d.mime_type, e.published_at
    FROM public.external_publications e
    LEFT JOIN public.service_cases s ON s.id = e.service_case_id
    LEFT JOIN public.customer_documents d ON d.id = e.document_id
   WHERE e.audience_kind = p_audience_kind AND e.audience_party_id = p_party_id AND e.revoked_at IS NULL
     AND p_party_id IS NOT NULL AND public.party_can_be_audience(p_party_id, p_audience_kind)
     AND (e.content_kind <> 'document' OR (d.id IS NOT NULL AND d.source_email_id IS NULL AND coalesce(d.document_type, '') <> 'internal'))
   ORDER BY e.published_at DESC
   LIMIT 500
$f$;

-- 7. Rettigheder (= src/lib/auth/permissions.ts)
INSERT INTO public.permission_catalog (permission) VALUES ('parties.manage'), ('portal.publish') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_defaults (role, permission) VALUES
  ('admin', 'parties.manage'), ('serviceleder', 'parties.manage'),
  ('admin', 'portal.publish'), ('serviceleder', 'portal.publish'), ('salg', 'portal.publish')
ON CONFLICT DO NOTHING;

-- 8. RLS
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY parties_select ON public.parties FOR SELECT TO authenticated USING (public.party_visible_to_me(id));
CREATE POLICY parties_insert ON public.parties FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('parties.manage')) AND created_by = auth.uid()
              AND (customer_id IS NULL OR (SELECT public.user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])));
CREATE POLICY parties_update ON public.parties FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('parties.manage')))
  WITH CHECK ((SELECT public.user_has_permission('parties.manage'))
              AND (customer_id IS NULL OR (SELECT public.user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])));

CREATE POLICY party_relationships_select ON public.party_relationships FOR SELECT TO authenticated USING (public.party_visible_to_me(party_id));
CREATE POLICY party_relationships_insert ON public.party_relationships FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('parties.manage')) AND created_by = auth.uid() AND source IN ('manual', 'register'));
CREATE POLICY party_relationships_update ON public.party_relationships FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('parties.manage'))) WITH CHECK ((SELECT public.user_has_permission('parties.manage')));

CREATE POLICY case_participants_select ON public.case_participants FOR SELECT TO authenticated USING (public.case_visible_to_me(service_case_id));
CREATE POLICY case_participants_insert ON public.case_participants FOR INSERT TO authenticated
  WITH CHECK (((SELECT public.user_has_permission('parties.manage')) OR (SELECT public.user_has_permission('cases.edit')))
              AND created_by = auth.uid() AND public.case_visible_to_me(service_case_id) AND public.party_visible_to_me(party_id));
CREATE POLICY case_participants_update ON public.case_participants FOR UPDATE TO authenticated
  USING (((SELECT public.user_has_permission('parties.manage')) OR (SELECT public.user_has_permission('cases.edit'))) AND public.case_visible_to_me(service_case_id))
  WITH CHECK (((SELECT public.user_has_permission('parties.manage')) OR (SELECT public.user_has_permission('cases.edit'))) AND public.case_visible_to_me(service_case_id));

-- Internt overblik over hvad der er offentliggjort (kun personale med publish-ret + synlig sag/part)
CREATE POLICY external_publications_select ON public.external_publications FOR SELECT TO authenticated
  USING ((SELECT public.user_has_permission('portal.publish'))
         AND (CASE WHEN service_case_id IS NOT NULL THEN public.case_visible_to_me(service_case_id) ELSE public.party_visible_to_me(audience_party_id) END));

REVOKE ALL ON public.parties, public.party_relationships, public.case_participants, public.external_publications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.parties, public.party_relationships TO authenticated;
GRANT SELECT, INSERT, UPDATE (role, note, ended_at) ON public.case_participants TO authenticated;
GRANT SELECT ON public.external_publications TO authenticated;
GRANT ALL ON public.parties, public.party_relationships, public.case_participants TO service_role;
-- service_role: kun læsning + tilbagetrækningskolonner (værnet afviser alligevel alle skrivninger uden indlogget bruger)
REVOKE ALL ON public.external_publications FROM service_role;
GRANT SELECT ON public.external_publications TO service_role;

-- Supabases default privileges giver ALLE nye funktioner EXECUTE til anon, authenticated OG service_role — derfor lukkes
-- alle fire eksplicit (prod-præflight 2026-11-25: uden service_role i listen beholdt baggrunds-/AI-nøglen EXECUTE på
-- publish_external/revoke_external_publication; funktionerne afviste den kun via auth.role()-tjekket). Kun det nødvendige
-- gives tilbage herunder.
REVOKE ALL ON FUNCTION public.case_visible_to_me(uuid), public.party_visible_to_me(uuid), public.party_can_be_audience(uuid, text),
  public.conversations_party_guard(), public.party_relationships_guard(), public.external_publications_guard(),
  public.publish_external(text, uuid, uuid, text, text, text, uuid, text, uuid), public.revoke_external_publication(uuid),
  public.external_feed(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.case_visible_to_me(uuid), public.party_visible_to_me(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_external(text, uuid, uuid, text, text, text, uuid, text, uuid), public.revoke_external_publication(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_feed(text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ROLLBACK (manuel; fjerner kun det nye — parter, relationer, deltagere og offentliggørelser går tabt; audit_logs-rækker
-- (external_publication_*) bliver). Eksisterende tabeller: kun conversations' tre nye kolonner fjernes.
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_conversations_party_guard ON public.conversations;
-- ALTER TABLE public.conversations DROP COLUMN IF EXISTS source_party_id, DROP COLUMN IF EXISTS communication_class,
--   DROP COLUMN IF EXISTS communication_class_source;
-- DROP TABLE IF EXISTS public.external_publications;
-- DROP TABLE IF EXISTS public.case_participants;
-- DROP TABLE IF EXISTS public.party_relationships;
-- DROP TABLE IF EXISTS public.parties;
-- DROP FUNCTION IF EXISTS public.external_feed(text, uuid);
-- DROP FUNCTION IF EXISTS public.revoke_external_publication(uuid);
-- DROP FUNCTION IF EXISTS public.publish_external(text, uuid, uuid, text, text, text, uuid, text, uuid);
-- DROP FUNCTION IF EXISTS public.party_can_be_audience(uuid, text);
-- DROP FUNCTION IF EXISTS public.external_publications_guard();
-- DROP FUNCTION IF EXISTS public.party_relationships_guard();
-- DROP FUNCTION IF EXISTS public.conversations_party_guard();
-- DROP FUNCTION IF EXISTS public.party_visible_to_me(uuid);
-- DROP FUNCTION IF EXISTS public.case_visible_to_me(uuid);
-- DELETE FROM public.user_permission_overrides WHERE permission IN ('parties.manage', 'portal.publish');
-- DELETE FROM public.role_permission_defaults WHERE permission IN ('parties.manage', 'portal.publish');
-- DELETE FROM public.permission_catalog WHERE permission IN ('parties.manage', 'portal.publish');
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
