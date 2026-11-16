-- =====================================================================================================================
-- 00249 Henvendelser — kommunikations-backbone (AI-receptionist fase 2). KANDIDAT: kun på branch/staging.
-- MÅ IKKE køres i produktion uden Henriks særskilte godkendelse (nr/formål/risiko/pre-post).
--
-- Mindste holdbare model (docs/runbooks/ELTA_AI_RECEPTIONIST_PHASE_2.md §4):
--   conversations         én henvendelse (vises i Henvendelser). Kunde/sag er KANDIDATER indtil et menneske bekræfter.
--   conversation_items    normaliserede kommunikationer; peger på den kanoniske kilde (source_table + source_id) —
--                         ingen kopi af mail-/SMS-/opkalds-tabellerne, ingen rå leverandør-payload.
--                         Transskription: kun reference + metadata (status, ref, purge_after) — intet lydindhold.
--   conversation_actions  foreslåede/udførte handlinger med politik-udfald og godkendelsestilstand (idempotent).
--   upload_requests       engangs-upload-link (kun SHA-256 af tokenet gemmes; udløb ≤ 14 dage; filloft).
--
-- Adgang (effektive rettigheder, mønster fra 00247):
--   SELECT  conversation_visible(): conversations.view OG kanal-ret (telefon: calls.view; mail/web: customers.emails.view
--           eller inbox.view) OG (bekræftet kunde i læse-scope ELLER ukoblet + conversations.view_unmatched)
--   INSERT/UPDATE  conversations.manage + samme synlighed (WITH CHECK). Ingen DELETE.
--   items/actions/upload_requests følger deres henvendelses synlighed. Items er uforanderlige; actions kun tilstand.
--   upload_requests.token_hash kan ikke læses af authenticated (kolonne-grant). Offentlig upload går via serveren.
--   anon: intet.
-- Nøgler: conversations.view (admin/serviceleder/salg/bogholderi), conversations.view_unmatched (admin/serviceleder),
--         conversations.manage (admin/serviceleder/salg/bogholderi).
-- =====================================================================================================================
BEGIN;

-- 0. Forudsætninger
DO $guard$
BEGIN
  IF to_regprocedure('public.user_has_permission(text)') IS NULL OR to_regprocedure('public.my_customer_scope_ids()') IS NULL THEN
    RAISE EXCEPTION '00249: hjælpefunktioner mangler (00238/00240)';
  END IF;
  IF (SELECT count(*) FROM public.permission_catalog WHERE permission = 'customers.view.all') <> 1 THEN
    RAISE EXCEPTION '00249: forudsat nøgle customers.view.all mangler';
  END IF;
  IF to_regclass('public.conversations') IS NOT NULL OR to_regclass('public.conversation_items') IS NOT NULL
     OR to_regclass('public.conversation_actions') IS NOT NULL OR to_regclass('public.upload_requests') IS NOT NULL THEN
    RAISE EXCEPTION '00249: tabellerne findes allerede — kontrollér før kørsel';
  END IF;
END
$guard$;

-- 1. Henvendelser
CREATE TABLE public.conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel              text NOT NULL CHECK (channel IN ('phone','email','sms','web_chat','portal','upload_link')),
  status               text NOT NULL DEFAULT 'new' CHECK (status IN ('new','open','awaiting_customer','handoff','handled','spam')),
  title                text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  ai_summary           text CHECK (char_length(ai_summary) <= 2000),
  intent               text CHECK (char_length(intent) <= 40),
  urgency              text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','emergency')),
  ai_confidence        numeric(3,2) CHECK (ai_confidence BETWEEN 0 AND 1),
  customer_id          uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  contact_id           uuid REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  customer_candidate_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_match_state text NOT NULL DEFAULT 'insufficient_information'
                       CHECK (customer_match_state IN ('unique_match','ambiguous','no_match','insufficient_information','read_error','confirmed','rejected')),
  candidate_count      integer NOT NULL DEFAULT 0 CHECK (candidate_count BETWEEN 0 AND 1000),
  service_case_id      uuid REFERENCES public.service_cases(id) ON DELETE SET NULL,
  case_candidate_id    uuid REFERENCES public.service_cases(id) ON DELETE SET NULL,
  case_match_state     text NOT NULL DEFAULT 'not_applicable'
                       CHECK (case_match_state IN ('none','exact','several_open','no_open_case','read_error','confirmed','not_applicable')),
  assigned_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_team        text CHECK (assigned_team IN ('kontor','service','salg','bogholderi','montor')),
  next_action          text CHECK (char_length(next_action) <= 300),
  handoff_reasons      text[] NOT NULL DEFAULT '{}',
  dedupe_key           text NOT NULL UNIQUE CHECK (char_length(dedupe_key) BETWEEN 3 AND 300),
  first_at             timestamptz NOT NULL,
  last_at              timestamptz NOT NULL,
  handled_at           timestamptz,
  handled_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  match_version        integer NOT NULL DEFAULT 0,
  created_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- En endelig kunde/sag kræver menneskelig bekræftelse; kandidater er kun forslag
  CONSTRAINT conversations_customer_confirmed CHECK (customer_id IS NULL OR customer_match_state = 'confirmed'),
  CONSTRAINT conversations_case_confirmed CHECK (service_case_id IS NULL OR case_match_state = 'confirmed'),
  CONSTRAINT conversations_case_needs_customer CHECK (service_case_id IS NULL OR customer_id IS NOT NULL),
  CONSTRAINT conversations_handled CHECK ((status = 'handled') = (handled_at IS NOT NULL)),
  CONSTRAINT conversations_time_order CHECK (last_at >= first_at)
);
CREATE INDEX conversations_status_last ON public.conversations (status, last_at DESC);
CREATE INDEX conversations_customer ON public.conversations (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX conversations_case ON public.conversations (service_case_id) WHERE service_case_id IS NOT NULL;
CREATE INDEX conversations_assigned ON public.conversations (assigned_profile_id) WHERE assigned_profile_id IS NOT NULL;

-- Værn: uforanderlige nøglefelter; sagen skal tilhøre kunden; updated_at
-- Review-fund (2026-11-16): H1 kunde slettet → sagen ryddes med (ellers fejler kunde-sletningen); H2 sags-tjekket kører
-- KUN når kunde/sag ændres (ellers kan en bruger med kunde- men ikke sags-scope ikke tildele/afslutte); L2 handled_by og
-- match_version håndhæves for brugere (service_role er undtaget — offentlig upload/serverindtag).
CREATE FUNCTION public.conversations_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$
DECLARE is_user boolean := coalesce(auth.role(), '') <> 'service_role' AND current_user <> 'service_role';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key OR NEW.channel IS DISTINCT FROM OLD.channel
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.first_at IS DISTINCT FROM OLD.first_at THEN
      RAISE EXCEPTION 'conversations: dedupe_key/channel/created_by/first_at kan ikke ændres' USING ERRCODE = 'check_violation';
    END IF;
    -- H1: kunden er slettet (FK ON DELETE SET NULL) → sag og match nulstilles i samme række
    IF OLD.customer_id IS NOT NULL AND NEW.customer_id IS NULL AND NEW.service_case_id IS NOT NULL THEN
      NEW.service_case_id := NULL;
      NEW.case_match_state := 'none';
    END IF;
    IF is_user AND (NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.service_case_id IS DISTINCT FROM OLD.service_case_id
                    OR NEW.customer_match_state IS DISTINCT FROM OLD.customer_match_state)
       AND NOT (OLD.customer_id IS NOT NULL AND NEW.customer_id IS NULL)   -- kunde-sletning (FK) er ikke et match-valg
       AND NEW.match_version <> OLD.match_version + 1 THEN
      RAISE EXCEPTION 'conversations: match-ændring kræver match_version + 1' USING ERRCODE = 'check_violation';
    END IF;
    IF is_user AND NEW.status = 'handled' AND OLD.status IS DISTINCT FROM 'handled' AND NEW.handled_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'conversations: handled_by skal være den indloggede bruger' USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
  END IF;
  IF NEW.service_case_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.service_case_id IS DISTINCT FROM OLD.service_case_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id)
     AND NOT EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = NEW.service_case_id AND s.customer_id = NEW.customer_id) THEN
    RAISE EXCEPTION 'conversations: sagen tilhører ikke kunden' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_conversations_guard BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.conversations_guard();

-- 2. Normaliserede kommunikationer (peger på kanonisk kilde)
CREATE TABLE public.conversation_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id       uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel               text NOT NULL CHECK (channel IN ('phone','email','sms','web_chat','portal','upload_link')),
  direction             text NOT NULL CHECK (direction IN ('inbound','outbound','internal')),
  provider              text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 40),
  provider_event_id     text CHECK (char_length(provider_event_id) <= 200),
  source_table          text NOT NULL CHECK (source_table IN ('incoming_emails','portal_messages','telephony_calls','sms_messages','customer_documents','simulator','manual')),
  source_id             uuid,
  occurred_at           timestamptz NOT NULL,
  title                 text CHECK (char_length(title) <= 200),
  body_preview          text CHECK (char_length(body_preview) <= 500),
  sender_label          text CHECK (char_length(sender_label) <= 200),
  attachment_document_ids uuid[] NOT NULL DEFAULT '{}',
  transcript_status     text NOT NULL DEFAULT 'not_applicable' CHECK (transcript_status IN ('not_applicable','pending','available','unavailable','purged')),
  transcript_ref        text CHECK (char_length(transcript_ref) <= 300),
  transcript_purge_after timestamptz,
  dedupe_key            text NOT NULL UNIQUE CHECK (char_length(dedupe_key) BETWEEN 3 AND 300),
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_items_source_ref CHECK (source_table IN ('simulator','manual') OR source_id IS NOT NULL),
  CONSTRAINT conversation_items_transcript_ref CHECK (transcript_status <> 'available' OR transcript_ref IS NOT NULL)
);
CREATE UNIQUE INDEX conversation_items_source ON public.conversation_items (source_table, source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX conversation_items_provider_event ON public.conversation_items (provider, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX conversation_items_conversation ON public.conversation_items (conversation_id, occurred_at);

-- 3. Foreslåede/udførte handlinger
CREATE TABLE public.conversation_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  action_type      text NOT NULL CHECK (char_length(action_type) BETWEEN 1 AND 40),
  policy_outcome   text NOT NULL CHECK (policy_outcome IN ('auto','proposal','handoff','forbidden')),
  state            text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','approved','executed','rejected','failed','blocked')),
  actor            text NOT NULL CHECK (actor IN ('ai_receptionist','user','system')),
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(payload) <= 8192),
  reasons          text[] NOT NULL DEFAULT '{}',
  idempotency_key  text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 3 AND 300),
  executed_ref     text CHECK (char_length(executed_ref) <= 100),
  error_code       text CHECK (char_length(error_code) <= 80),
  decided_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at       timestamptz,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, idempotency_key),
  -- forbudte handlinger kan aldrig udføres; udførte har en reference
  CONSTRAINT conversation_actions_forbidden_never_executed CHECK (policy_outcome <> 'forbidden' OR state IN ('blocked','rejected')),
  CONSTRAINT conversation_actions_executed_ref CHECK (state <> 'executed' OR executed_ref IS NOT NULL)
);
CREATE INDEX conversation_actions_conversation ON public.conversation_actions (conversation_id);

-- Review-fund M1: eksplicitte overgange; afsluttede rækker er HELT låst; decided_by kan kun være den indloggede bruger.
CREATE FUNCTION public.conversation_actions_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$
DECLARE is_user boolean := coalesce(auth.role(), '') <> 'service_role' AND current_user <> 'service_role';
BEGIN
  IF OLD.state IN ('executed','rejected','blocked','failed') THEN
    RAISE EXCEPTION 'conversation_actions: handlingen er afsluttet' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.action_type IS DISTINCT FROM OLD.action_type
     OR NEW.policy_outcome IS DISTINCT FROM OLD.policy_outcome OR NEW.actor IS DISTINCT FROM OLD.actor
     OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.reasons IS DISTINCT FROM OLD.reasons
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'conversation_actions: kun tilstand kan ændres' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ((OLD.state = 'proposed' AND NEW.state IN ('proposed','approved','rejected','executed','failed','blocked'))
       OR (OLD.state = 'approved' AND NEW.state IN ('approved','executed','failed'))) THEN
    RAISE EXCEPTION 'conversation_actions: ugyldig overgang % → %', OLD.state, NEW.state USING ERRCODE = 'check_violation';
  END IF;
  IF is_user AND NEW.decided_by IS DISTINCT FROM OLD.decided_by AND NEW.decided_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'conversation_actions: decided_by skal være den indloggede bruger' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_conversation_actions_guard BEFORE UPDATE ON public.conversation_actions
  FOR EACH ROW EXECUTE FUNCTION public.conversation_actions_guard();

-- 4. Engangs-upload-link
CREATE TABLE public.upload_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  customer_id      uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  service_case_id  uuid REFERENCES public.service_cases(id) ON DELETE CASCADE,
  token_hash       text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  purpose          text NOT NULL DEFAULT 'photos' CHECK (purpose IN ('photos','documents')),
  expires_at       timestamptz NOT NULL,
  max_files        integer NOT NULL DEFAULT 10 CHECK (max_files BETWEEN 1 AND 20),
  files_uploaded   integer NOT NULL DEFAULT 0 CHECK (files_uploaded >= 0),
  revoked_at       timestamptz,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT upload_requests_expiry CHECK (expires_at > created_at AND expires_at <= created_at + interval '14 days'),
  CONSTRAINT upload_requests_quota CHECK (files_uploaded <= max_files)
);
CREATE INDEX upload_requests_conversation ON public.upload_requests (conversation_id);

-- Review-fund H3: et link bundet til en henvendelse skal have henvendelsens (bekræftede) kunde; sags-tjek kun ved oprettelse/ændring.
CREATE FUNCTION public.upload_requests_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.service_case_id IS DISTINCT FROM OLD.service_case_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
    IF NEW.service_case_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.service_cases s WHERE s.id = NEW.service_case_id AND s.customer_id = NEW.customer_id) THEN
      RAISE EXCEPTION 'upload_requests: sagen tilhører ikke kunden' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.conversation_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.conversations c WHERE c.id = NEW.conversation_id AND c.customer_id = NEW.customer_id) THEN
      RAISE EXCEPTION 'upload_requests: henvendelsens bekræftede kunde er en anden' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'upload_requests: et tilbagekaldt link kan ikke genåbnes' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_upload_requests_guard BEFORE INSERT OR UPDATE ON public.upload_requests
  FOR EACH ROW EXECUTE FUNCTION public.upload_requests_guard();

REVOKE ALL ON FUNCTION public.conversations_guard(), public.conversation_actions_guard(), public.upload_requests_guard() FROM PUBLIC, anon, authenticated;

-- 5. Rettigheder (= src/lib/auth/permissions.ts)
INSERT INTO public.permission_catalog (permission) VALUES
  ('conversations.view'), ('conversations.view_unmatched'), ('conversations.manage') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_defaults (role, permission) VALUES
  ('admin', 'conversations.view'), ('serviceleder', 'conversations.view'), ('salg', 'conversations.view'), ('bogholderi', 'conversations.view'),
  ('admin', 'conversations.view_unmatched'), ('serviceleder', 'conversations.view_unmatched'),
  ('admin', 'conversations.manage'), ('serviceleder', 'conversations.manage'), ('salg', 'conversations.manage'), ('bogholderi', 'conversations.manage')
ON CONFLICT DO NOTHING;

-- 6. RLS
-- Synlighed (review-fund M2): en henvendelse ses kun hvis brugeren også må se KANALENS indhold:
--   telefon → calls.view (som 00247) · mail/webhenvendelse → customers.emails.view eller inbox.view (som 00246)
--   ukoblet → conversations.view_unmatched · koblet → kunden i læse-scope (customers.view.all / my_customer_scope_ids)
CREATE FUNCTION public.conversation_visible(p_channel text, p_customer_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT public.user_has_permission('conversations.view')
    AND (p_channel <> 'phone' OR public.user_has_permission('calls.view'))
    AND (p_channel NOT IN ('email','web_chat') OR public.user_has_permission('customers.emails.view') OR public.user_has_permission('inbox.view'))
    AND (
      (p_customer_id IS NULL AND public.user_has_permission('conversations.view_unmatched'))
      OR (p_customer_id IS NOT NULL AND (public.user_has_permission('customers.view.all') OR p_customer_id = ANY (public.my_customer_scope_ids())))
    )
$f$;
REVOKE ALL ON FUNCTION public.conversation_visible(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conversation_visible(text, uuid) TO authenticated;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select ON public.conversations FOR SELECT TO authenticated
  USING (public.conversation_visible(channel, customer_id));
CREATE POLICY conversations_insert ON public.conversations FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('conversations.manage')) AND created_by = auth.uid()
              AND public.conversation_visible(channel, customer_id));
CREATE POLICY conversations_update ON public.conversations FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('conversations.manage')) AND public.conversation_visible(channel, customer_id))
  WITH CHECK (public.conversation_visible(channel, customer_id));

-- Børn: synlighed = henvendelsens synlighed (EXISTS kører under conversations' RLS)
CREATE POLICY conversation_items_select ON public.conversation_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id));
CREATE POLICY conversation_items_insert ON public.conversation_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('conversations.manage')) AND created_by = auth.uid()
              AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id));

CREATE POLICY conversation_actions_select ON public.conversation_actions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id));
CREATE POLICY conversation_actions_insert ON public.conversation_actions FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('conversations.manage')) AND created_by = auth.uid()
              AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id));
CREATE POLICY conversation_actions_update ON public.conversation_actions FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('conversations.manage')) AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id))
  WITH CHECK ((SELECT public.user_has_permission('conversations.manage')) AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id));

-- upload_requests (review-fund L3): kunden i scope OG (ingen henvendelse ELLER henvendelsen er synlig)
CREATE POLICY upload_requests_select ON public.upload_requests FOR SELECT TO authenticated
  USING ((SELECT public.user_has_permission('conversations.view'))
         AND ((SELECT public.user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[]))
         AND (conversation_id IS NULL OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id)));
CREATE POLICY upload_requests_insert ON public.upload_requests FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('conversations.manage')) AND created_by = auth.uid() AND files_uploaded = 0 AND revoked_at IS NULL
              AND ((SELECT public.user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[]))
              AND (conversation_id IS NULL OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id)));
CREATE POLICY upload_requests_revoke ON public.upload_requests FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('conversations.manage'))
         AND ((SELECT public.user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[]))
         AND (conversation_id IS NULL OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id)))
  WITH CHECK ((SELECT public.user_has_permission('conversations.manage')));

REVOKE ALL ON public.conversations, public.conversation_items, public.conversation_actions, public.upload_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT, INSERT ON public.conversation_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversation_actions TO authenticated;
-- upload_requests: token_hash kan indsættes men ALDRIG læses af authenticated; kun revoked_at kan ændres
GRANT SELECT (id, conversation_id, customer_id, service_case_id, purpose, expires_at, max_files, files_uploaded, revoked_at, created_by, created_at)
  ON public.upload_requests TO authenticated;
GRANT INSERT (conversation_id, customer_id, service_case_id, token_hash, purpose, expires_at, max_files) ON public.upload_requests TO authenticated;
GRANT UPDATE (revoked_at) ON public.upload_requests TO authenticated;
GRANT ALL ON public.conversations, public.conversation_items, public.conversation_actions, public.upload_requests TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ROLLBACK (manuel; fjerner kun det nye — henvendelser/upload-links går tabt). EFTERLADER bevidst: audit_logs-rækker
-- (conversation_*/upload_link_*) og kundedokumenter + storage-filer modtaget via upload-links (de mister kun koblingen
-- til henvendelsen; dokumenterne hører til kunden/sagen):
-- BEGIN;
-- DROP TABLE IF EXISTS public.upload_requests;
-- DROP TABLE IF EXISTS public.conversation_actions;
-- DROP TABLE IF EXISTS public.conversation_items;
-- DROP TABLE IF EXISTS public.conversations;
-- DROP FUNCTION IF EXISTS public.conversation_visible(text, uuid);
-- DROP FUNCTION IF EXISTS public.upload_requests_guard();
-- DROP FUNCTION IF EXISTS public.conversation_actions_guard();
-- DROP FUNCTION IF EXISTS public.conversations_guard();
-- DELETE FROM public.user_permission_overrides WHERE permission IN ('conversations.view', 'conversations.view_unmatched', 'conversations.manage');
-- DELETE FROM public.role_permission_defaults WHERE permission IN ('conversations.view', 'conversations.view_unmatched', 'conversations.manage');
-- DELETE FROM public.permission_catalog WHERE permission IN ('conversations.view', 'conversations.view_unmatched', 'conversations.manage');
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
