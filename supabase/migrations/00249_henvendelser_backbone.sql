-- =====================================================================================================================
-- 00249 Henvendelser — kommunikations-backbone (AI-receptionist fase 2). KANDIDAT: kun på branch/staging.
-- MÅ IKKE køres i produktion uden Henriks særskilte godkendelse (nr/formål/risiko/pre-post).
--
-- Mindste holdbare model (docs/runbooks/ELTA_AI_RECEPTIONIST_PHASE_2.md §4, final review §3–§5):
--   conversations         én henvendelse (vises i Henvendelser). Kunde/sag er KANDIDATER indtil et menneske bekræfter.
--   conversation_items    normaliserede kommunikationer; peger på den kanoniske kilde (source_table + source_id) —
--                         ingen kopi af mail-/SMS-/opkalds-tabellerne, ingen rå leverandør-payload.
--                         Transskription: kun reference + metadata (status, ref, purge_after) — intet lydindhold.
--   conversation_actions  foreslåede/udførte handlinger med politik-udfald og godkendelsestilstand (idempotent).
--   upload_requests       engangs-upload-link (kun SHA-256 af tokenet gemmes; udløb ≤ 14 dage; ÉN afsendelse).
--
-- Indtag (final review S1): henvendelser og items oprettes KUN via ÉN atomisk funktion `reception_ingest(jsonb)`.
--   - Kildens identitet (kanal, udbyder, tidspunkt, dedupe-nøgle, bekræftet kunde/sag) AFLEDES i databasen af selve
--     kilderækken (`reception_source_identity`) — aldrig af kalderen. En kilde kan kun gøres krav på én gang (unik nøgle +
--     advisory-lås); et tidligt indtag er derfor identisk med det legitime og kan ikke blokere det.
--   - authenticated: kræver conversations.manage + at brugeren selv må se kilden (samme regler som kildens RLS) + at
--     den resulterende henvendelse er synlig for brugeren. Direkte INSERT i conversations/conversation_items er fjernet.
--   - service_role = baggrundsaktøren `ai_receptionist` (nat/weekend-telefon, web-chat, portal, webhooks): kun forslag
--     (aldrig 'approved'/udført), ingen tildeling til personer, auditeret med actor=ai_receptionist, user_id=NULL.
--   - Et item-værn (BEFORE INSERT) håndhæver de samme regler for ALLE skrivere, også service_role.
--
-- Adgang (effektive rettigheder, mønster fra 00247):
--   SELECT  conversation_visible(): conversations.view OG kanal-ret (telefon: calls.view; mail/web: customers.emails.view
--           eller inbox.view) OG (bekræftet kunde i læse-scope ELLER ukoblet + conversations.view_unmatched)
--   UPDATE  conversations.manage + samme synlighed (WITH CHECK). Ingen INSERT (kun via reception_ingest). Ingen DELETE.
--   items/actions/upload_requests følger deres henvendelses synlighed. Items er uforanderlige; actions kun tilstand;
--   brugere kan kun selv indsætte handlinger med actor='user' (AI-handlinger kommer kun via reception_ingest).
--   upload_requests.token_hash kan ikke læses af authenticated (kolonne-grant). Offentlig upload går via serveren.
--   anon: intet.
-- Nøgler: conversations.view (admin/serviceleder/salg/bogholderi), conversations.view_unmatched (admin/serviceleder),
--         conversations.manage (admin/serviceleder/salg/bogholderi).
-- Ingen ændringer i eksisterende tabeller (kun læsning af incoming_emails/portal_messages/telephony_calls/
-- customer_documents/customers/service_cases og indsættelse i audit_logs fra reception_ingest).
-- =====================================================================================================================
BEGIN;

-- 0. Forudsætninger
DO $guard$
BEGIN
  IF to_regprocedure('public.user_has_permission(text)') IS NULL OR to_regprocedure('public.my_customer_scope_ids()') IS NULL
     OR to_regprocedure('public.my_case_scope_ids()') IS NULL THEN
    RAISE EXCEPTION '00249: hjælpefunktioner mangler (00238/00240)';
  END IF;
  IF to_regprocedure('auth.role()') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION '00249: auth.role()/auth.uid() mangler';
  END IF;
  IF (SELECT count(*) FROM public.permission_catalog WHERE permission = 'customers.view.all') <> 1 THEN
    RAISE EXCEPTION '00249: forudsat nøgle customers.view.all mangler';
  END IF;
  IF to_regclass('public.telephony_calls') IS NULL OR to_regclass('public.incoming_invoices') IS NULL THEN
    RAISE EXCEPTION '00249: kildetabeller mangler (00247 telephony_calls / incoming_invoices)';
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
  intake_actor         text NOT NULL DEFAULT 'user' CHECK (intake_actor IN ('user','ai_receptionist')),
  first_at             timestamptz NOT NULL,
  last_at              timestamptz NOT NULL,
  handled_at           timestamptz,
  handled_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  match_version        integer NOT NULL DEFAULT 0,
  created_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- En endelig kunde/sag kræver menneskelig bekræftelse (eller en kilde, hvor et menneske allerede har koblet den)
  CONSTRAINT conversations_customer_confirmed CHECK (customer_id IS NULL OR customer_match_state = 'confirmed'),
  CONSTRAINT conversations_case_confirmed CHECK (service_case_id IS NULL OR case_match_state = 'confirmed'),
  CONSTRAINT conversations_case_needs_customer CHECK (service_case_id IS NULL OR customer_id IS NOT NULL),
  CONSTRAINT conversations_handled CHECK ((status = 'handled') = (handled_at IS NOT NULL)),
  CONSTRAINT conversations_time_order CHECK (last_at >= first_at),
  -- baggrundsaktøren har ingen bruger bag sig
  CONSTRAINT conversations_actor_creator CHECK (intake_actor = 'user' OR created_by IS NULL)
);
CREATE INDEX conversations_status_last ON public.conversations (status, last_at DESC);
CREATE INDEX conversations_customer ON public.conversations (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX conversations_case ON public.conversations (service_case_id) WHERE service_case_id IS NOT NULL;
CREATE INDEX conversations_assigned ON public.conversations (assigned_profile_id) WHERE assigned_profile_id IS NOT NULL;
CREATE INDEX conversations_candidate ON public.conversations (customer_candidate_id) WHERE customer_candidate_id IS NOT NULL;
-- retention (fremtidig oprydning af afsluttede henvendelser efter alder)
CREATE INDEX conversations_created ON public.conversations (created_at);

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
-- én kilde-række kan kun gøres krav på én gang; én udbyder-hændelse ligeså
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
  -- final review: ÉN afsendelse pr. link (sættes atomisk ved reservationen; frigives kun hvis intet blev gemt)
  consumed_at      timestamptz,
  revoked_at       timestamptz,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT upload_requests_expiry CHECK (expires_at > created_at AND expires_at <= created_at + interval '14 days'),
  CONSTRAINT upload_requests_quota CHECK (files_uploaded <= max_files),
  CONSTRAINT upload_requests_consumed CHECK ((consumed_at IS NULL) = (files_uploaded = 0))
);
CREATE INDEX upload_requests_conversation ON public.upload_requests (conversation_id);
CREATE INDEX upload_requests_customer ON public.upload_requests (customer_id);

-- 5. Kildens identitet — AFLEDT af kilderækken (aldrig af kalderen). Bruges af reception_ingest, item-værnet og
--    conversations-værnet. Returnerer {ok, reason | key, channel, provider, event_id, occurred_at, direction,
--    confirmed_customer, confirmed_case, candidate}. Samme nøgler som lib/reception/adapters.ts (dedupeKeyFor).
CREATE FUNCTION public.reception_source_identity(p_table text, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
DECLARE e record; m record; t record; v_web boolean;
BEGIN
  IF p_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'source_id_missing'); END IF;
  IF p_table = 'incoming_emails' THEN
    SELECT i.id, i.subject, i.sender_email, i.received_at, i.customer_id, i.linked_by, i.link_status::text AS link_status
      INTO e FROM public.incoming_emails i WHERE i.id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'source_not_found'); END IF;
    IF e.link_status = 'ignored' THEN RETURN jsonb_build_object('ok', false, 'reason', 'source_ignored'); END IF;
    -- FormSubmit-webhenvendelse (afsenderen er ALDRIG kunden) — samme regel som adapters.isFormSubmit
    v_web := coalesce(e.sender_email, '') ~* '@formsubmit\.co$' AND coalesce(e.subject, '') ~* 'henvendelse';
    RETURN jsonb_build_object('ok', true, 'key', 'mail:incoming_emails:' || e.id::text,
      'channel', CASE WHEN v_web THEN 'web_chat' ELSE 'email' END, 'provider', CASE WHEN v_web THEN 'formsubmit' ELSE 'microsoft365' END,
      'event_id', NULL, 'occurred_at', e.received_at, 'direction', 'inbound',
      'confirmed_customer', CASE WHEN e.linked_by = 'manual' THEN e.customer_id END, 'confirmed_case', NULL,
      'candidate', CASE WHEN e.linked_by IS DISTINCT FROM 'manual' THEN e.customer_id END);
  ELSIF p_table = 'portal_messages' THEN
    SELECT pm.id, pm.customer_id, pm.sender_type, pm.created_at INTO m FROM public.portal_messages pm WHERE pm.id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'source_not_found'); END IF;
    IF m.sender_type IS DISTINCT FROM 'customer' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_customer_message'); END IF;
    IF m.created_at IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_timestamp'); END IF;
    RETURN jsonb_build_object('ok', true, 'key', 'portal:portal_messages:' || m.id::text, 'channel', 'portal', 'provider', 'portal',
      'event_id', NULL, 'occurred_at', m.created_at, 'direction', 'inbound',
      'confirmed_customer', m.customer_id, 'confirmed_case', NULL, 'candidate', NULL);
  ELSIF p_table = 'telephony_calls' THEN
    SELECT c.id, c.provider, c.provider_call_id, c.direction, c.started_at, c.customer_id, c.service_case_id, c.suggested_customer_id
      INTO t FROM public.telephony_calls c WHERE c.id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'source_not_found'); END IF;
    -- 00247: customer_id sættes KUN ved menneskelig bekræftelse → må bruges som bekræftet
    RETURN jsonb_build_object('ok', true, 'key', t.provider || ':telephony_calls:' || t.id::text, 'channel', 'phone', 'provider', t.provider,
      'event_id', t.provider_call_id, 'occurred_at', t.started_at, 'direction', CASE WHEN t.direction = 'outbound' THEN 'outbound' ELSE 'inbound' END,
      'confirmed_customer', t.customer_id, 'confirmed_case', CASE WHEN t.customer_id IS NOT NULL THEN t.service_case_id END,
      'candidate', CASE WHEN t.customer_id IS NULL THEN t.suggested_customer_id END);
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'source_table_not_supported');
END $f$;

-- 6. Må den INDLOGGEDE bruger se kilden? Samme regler som kildetabellernes SELECT-politikker:
--      incoming_emails  = 00246 incoming_emails_select
--      portal_messages  = "Employees can view portal messages" (authenticated USING true); kunden kræves desuden i scope
--                         via conversation_visible på den resulterende henvendelse
--      telephony_calls  = 00247 telephony_calls_select
--    Ændres en af de politikker, SKAL denne funktion følge med (prøven reception-00249-probe sammenligner dem pr. persona).
CREATE FUNCTION public.reception_source_visible(p_table text, p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT CASE p_table
    WHEN 'incoming_emails' THEN EXISTS (
      SELECT 1 FROM public.incoming_emails ie WHERE ie.id = p_id AND (
        public.user_has_permission('inbox.view')
        OR (ie.customer_id IS NOT NULL AND public.user_has_permission('customers.emails.view')
            AND (public.user_has_permission('customers.view.all') OR ie.customer_id = ANY (public.my_customer_scope_ids())))
        OR (ie.customer_id IS NULL AND public.user_has_permission('customers.emails.view')
            AND public.user_has_permission('customers.edit') AND public.user_has_permission('customers.view.all'))
        OR (ie.service_case_id IS NOT NULL
            AND (public.user_has_permission('cases.view.all') OR ie.service_case_id = ANY (public.my_case_scope_ids())))
        OR (public.user_has_permission('incoming_invoices.view')
            AND EXISTS (SELECT 1 FROM public.incoming_invoices ii WHERE ii.source_email_id = ie.id))))
    WHEN 'portal_messages' THEN EXISTS (SELECT 1 FROM public.portal_messages pm WHERE pm.id = p_id)
    WHEN 'telephony_calls' THEN EXISTS (
      SELECT 1 FROM public.telephony_calls tc WHERE tc.id = p_id AND (
        (tc.customer_id IS NULL AND public.user_has_permission('calls.view_unmatched'))
        OR (tc.customer_id IS NOT NULL AND public.user_has_permission('calls.view')
            AND (public.user_has_permission('customers.view.all') OR tc.customer_id = ANY (public.my_customer_scope_ids())))))
    ELSE false
  END
$f$;

-- 7. Værn på henvendelser: uforanderlige nøglefelter; sagen skal tilhøre kunden; kunde/sag kan ikke skifte væk fra en
--    kilde-afledt kobling; versionslås ved match-ændringer; FK-sletning af kunde/sag nulstiller matchet konsistent.
CREATE FUNCTION public.conversations_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  is_user boolean := coalesce(auth.role(), '') <> 'service_role';
  v_customer_gone boolean := false;
  v_case_gone boolean := false;
  v_src jsonb;
BEGIN
  -- Review F8: henvendelser oprettes KUN af reception_ingest (heller ikke af service_role-kode direkte)
  IF TG_OP = 'INSERT' AND current_setting('reception.ingest', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'conversations: oprettes kun via reception_ingest' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key OR NEW.channel IS DISTINCT FROM OLD.channel
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.first_at IS DISTINCT FROM OLD.first_at
       OR NEW.intake_actor IS DISTINCT FROM OLD.intake_actor OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'conversations: dedupe_key/channel/created_by/first_at/intake_actor kan ikke ændres' USING ERRCODE = 'check_violation';
    END IF;
    -- FK ON DELETE SET NULL: kunden/sagen findes ikke længere → matchet nulstilles i samme række (ikke et menneskeligt valg)
    v_customer_gone := OLD.customer_id IS NOT NULL AND NEW.customer_id IS NULL
                       AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = OLD.customer_id);
    v_case_gone := OLD.service_case_id IS NOT NULL AND NEW.service_case_id IS NULL
                   AND NOT EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = OLD.service_case_id);
    IF v_customer_gone THEN
      NEW.customer_match_state := 'insufficient_information';
      NEW.service_case_id := NULL;
      NEW.case_match_state := 'none';
    ELSIF v_case_gone THEN
      NEW.case_match_state := 'none';
    END IF;
    IF is_user AND NOT v_customer_gone AND NOT v_case_gone
       AND (NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.service_case_id IS DISTINCT FROM OLD.service_case_id
            OR NEW.customer_match_state IS DISTINCT FROM OLD.customer_match_state)
       AND NEW.match_version <> OLD.match_version + 1 THEN
      RAISE EXCEPTION 'conversations: match-ændring kræver match_version + 1' USING ERRCODE = 'check_violation';
    END IF;
    -- En kilde der allerede er koblet af et menneske (manuelt koblet mail, portal, bekræftet opkald) bestemmer kunden —
    -- den kan hverken skiftes eller fjernes (review F10), kun følge kilden
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id AND NOT v_customer_gone THEN
      SELECT public.reception_source_identity(i.source_table, i.source_id) INTO v_src
        FROM public.conversation_items i
       WHERE i.conversation_id = NEW.id AND i.dedupe_key = NEW.dedupe_key AND i.source_id IS NOT NULL;
      IF v_src IS NOT NULL AND (v_src->>'confirmed_customer') IS NOT NULL AND (v_src->>'confirmed_customer')::uuid IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'conversations: kilden er koblet til en anden kunde' USING ERRCODE = 'check_violation';
      END IF;
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
  -- Review F10: kontakten skal høre til kunden
  IF NEW.contact_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id)
     AND NOT EXISTS (SELECT 1 FROM public.customer_contacts cc WHERE cc.id = NEW.contact_id AND cc.customer_id = NEW.customer_id) THEN
    RAISE EXCEPTION 'conversations: kontakten tilhører ikke kunden' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.case_candidate_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.case_candidate_id IS DISTINCT FROM OLD.case_candidate_id)
     AND NOT EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = NEW.case_candidate_id
                     AND s.customer_id = coalesce(NEW.customer_id, NEW.customer_candidate_id)) THEN
    RAISE EXCEPTION 'conversations: sagskandidaten tilhører ikke kunden/kandidaten' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_conversations_guard BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.conversations_guard();

-- 8. Værn på items (ALLE skrivere, også service_role): et kilde-item er henvendelsens PRIMÆRE item, med den afledte nøgle,
--    kanal, udbyder, retning og tidspunkt, og henvendelsens bekræftede kunde = kildens. Upload-filer: kun serveren, kun
--    dokumenter der tilhører henvendelsens bekræftede kunde. 'manual' (udbyder-hændelse uden CRM-kilde): kun serveren.
CREATE FUNCTION public.conversation_items_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_bg boolean := coalesce(auth.role(), '') = 'service_role';
  v_src jsonb;
  c record;
BEGIN
  SELECT cv.id, cv.dedupe_key, cv.customer_id INTO c FROM public.conversations cv WHERE cv.id = NEW.conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation_items: henvendelsen findes ikke' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF NEW.source_table = 'customer_documents' THEN
    IF NOT v_bg THEN RAISE EXCEPTION 'conversation_items: upload-filer knyttes kun af serveren' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF NEW.channel <> 'upload_link' OR NEW.dedupe_key IS DISTINCT FROM 'upload:customer_documents:' || NEW.source_id::text
       OR c.customer_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.customer_documents d WHERE d.id = NEW.source_id AND d.customer_id = c.customer_id) THEN
      RAISE EXCEPTION 'conversation_items: dokumentet tilhører ikke henvendelsens kunde' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.dedupe_key IS DISTINCT FROM c.dedupe_key THEN
    RAISE EXCEPTION 'conversation_items: et kilde-item skal være henvendelsens primære item' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.source_table IN ('incoming_emails','portal_messages','telephony_calls') THEN
    v_src := public.reception_source_identity(NEW.source_table, NEW.source_id);
    IF NOT (v_src->>'ok')::boolean THEN
      RAISE EXCEPTION 'conversation_items: kilden afvist (%)', v_src->>'reason' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.dedupe_key <> v_src->>'key' OR NEW.channel <> v_src->>'channel' OR NEW.provider <> v_src->>'provider'
       OR NEW.direction <> v_src->>'direction' THEN
      RAISE EXCEPTION 'conversation_items: kanal/udbyder/nøgle passer ikke til kilden' USING ERRCODE = 'check_violation';
    END IF;
    IF c.customer_id IS DISTINCT FROM (v_src->>'confirmed_customer')::uuid THEN
      RAISE EXCEPTION 'conversation_items: henvendelsens kunde passer ikke til kilden' USING ERRCODE = 'check_violation';
    END IF;
    NEW.occurred_at := (v_src->>'occurred_at')::timestamptz;
    NEW.provider_event_id := v_src->>'event_id';
  ELSIF NEW.source_table = 'simulator' THEN
    IF NEW.source_id IS NOT NULL OR NEW.dedupe_key !~ '^sim:[0-9a-f-]{36}$' OR NEW.provider <> 'simulator' OR c.customer_id IS NOT NULL THEN
      RAISE EXCEPTION 'conversation_items: ugyldigt simulator-item' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.source_table = 'manual' THEN
    IF NOT v_bg THEN RAISE EXCEPTION 'conversation_items: udbyder-hændelser indtages kun af serveren' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF NEW.source_id IS NOT NULL OR NEW.provider_event_id IS NULL OR NEW.dedupe_key IS DISTINCT FROM NEW.provider || ':event:' || NEW.provider_event_id
       OR c.customer_id IS NOT NULL THEN
      RAISE EXCEPTION 'conversation_items: ugyldig udbyder-hændelse' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'conversation_items: kilden % indtages ikke endnu', NEW.source_table USING ERRCODE = 'feature_not_supported';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_conversation_items_guard BEFORE INSERT ON public.conversation_items
  FOR EACH ROW EXECUTE FUNCTION public.conversation_items_guard();

-- Review-fund M1: eksplicitte overgange; afsluttede rækker er HELT låst; decided_by kan kun være den indloggede bruger.
CREATE FUNCTION public.conversation_actions_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$
DECLARE is_user boolean := coalesce(auth.role(), '') <> 'service_role';
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
  -- Review F3: en bruger der ændrer tilstanden SKAL stå som beslutter (ingen anonym godkendelse/udførelse)
  IF is_user AND NEW.state IS DISTINCT FROM OLD.state AND (NEW.decided_by IS DISTINCT FROM auth.uid() OR NEW.decided_at IS NULL) THEN
    RAISE EXCEPTION 'conversation_actions: tilstandsændring kræver decided_by = dig og decided_at' USING ERRCODE = 'check_violation';
  END IF;
  -- baggrundsaktøren kan ikke godkende/udføre (kun mennesker afgør forslag)
  IF NOT is_user AND NEW.state IS DISTINCT FROM OLD.state AND NEW.state IN ('approved','executed') AND OLD.actor = 'ai_receptionist'
     AND NEW.decided_by IS NULL THEN
    RAISE EXCEPTION 'conversation_actions: AI-forslag kan kun godkendes af et menneske' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_conversation_actions_guard BEFORE UPDATE ON public.conversation_actions
  FOR EACH ROW EXECUTE FUNCTION public.conversation_actions_guard();

-- Review F7/F8: AI-handlinger indsættes KUN af reception_ingest; en brugers egen handling med en tilstand ud over
-- 'proposed' skal have brugeren som beslutter
CREATE FUNCTION public.conversation_actions_insert_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$
BEGIN
  IF NEW.actor = 'ai_receptionist' AND current_setting('reception.ingest', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'conversation_actions: AI-handlinger oprettes kun via reception_ingest' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.actor = 'user' AND coalesce(auth.role(), '') <> 'service_role' AND NEW.state <> 'proposed'
     AND (NEW.decided_by IS DISTINCT FROM auth.uid() OR NEW.decided_at IS NULL) THEN
    RAISE EXCEPTION 'conversation_actions: egen handling kræver decided_by = dig og decided_at' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_conversation_actions_insert_guard BEFORE INSERT ON public.conversation_actions
  FOR EACH ROW EXECUTE FUNCTION public.conversation_actions_insert_guard();

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
  IF TG_OP = 'UPDATE' AND (NEW.token_hash IS DISTINCT FROM OLD.token_hash OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
                           OR NEW.max_files IS DISTINCT FROM OLD.max_files OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'upload_requests: token/udløb/loft kan ikke ændres' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_upload_requests_guard BEFORE INSERT OR UPDATE ON public.upload_requests
  FOR EACH ROW EXECUTE FUNCTION public.upload_requests_guard();

-- 9. Rettigheder (= src/lib/auth/permissions.ts)
INSERT INTO public.permission_catalog (permission) VALUES
  ('conversations.view'), ('conversations.view_unmatched'), ('conversations.manage') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_defaults (role, permission) VALUES
  ('admin', 'conversations.view'), ('serviceleder', 'conversations.view'), ('salg', 'conversations.view'), ('bogholderi', 'conversations.view'),
  ('admin', 'conversations.view_unmatched'), ('serviceleder', 'conversations.view_unmatched'),
  ('admin', 'conversations.manage'), ('serviceleder', 'conversations.manage'), ('salg', 'conversations.manage'), ('bogholderi', 'conversations.manage')
ON CONFLICT DO NOTHING;

-- 10. Synlighed (review-fund M2): en henvendelse ses kun hvis brugeren også må se KANALENS indhold:
--   telefon → calls.view (som 00247) · mail/webhenvendelse → customers.emails.view eller inbox.view (som 00246)
--   ukoblet → conversations.view_unmatched · koblet → kunden i læse-scope (customers.view.all / my_customer_scope_ids)
-- Uafhængig review F2: en UKOBLET henvendelse kræver desuden kildens egne ukoblede nøgler (telefon: calls.view_unmatched
-- som 00247; mail/web: inbox.view eller emails.view+customers.edit+customers.view.all som 00246), og en kandidat skal
-- være i brugerens læse-scope (ellers kunne indhold om en kunde uden for scope læses via en ukoblet henvendelse).
CREATE FUNCTION public.conversation_visible(p_channel text, p_customer_id uuid, p_candidate_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT public.user_has_permission('conversations.view')
    AND (p_channel <> 'phone' OR public.user_has_permission('calls.view'))
    AND (p_channel NOT IN ('email','web_chat') OR public.user_has_permission('customers.emails.view') OR public.user_has_permission('inbox.view'))
    AND (
      (p_customer_id IS NULL AND public.user_has_permission('conversations.view_unmatched')
        AND (p_channel <> 'phone' OR public.user_has_permission('calls.view_unmatched'))
        AND (p_channel NOT IN ('email','web_chat') OR public.user_has_permission('inbox.view')
             OR (public.user_has_permission('customers.emails.view') AND public.user_has_permission('customers.edit') AND public.user_has_permission('customers.view.all')))
        AND (p_candidate_id IS NULL OR public.user_has_permission('customers.view.all') OR p_candidate_id = ANY (public.my_customer_scope_ids())))
      OR (p_customer_id IS NOT NULL AND (public.user_has_permission('customers.view.all') OR p_customer_id = ANY (public.my_customer_scope_ids())))
    )
$f$;

-- 11. ATOMISK INDTAG. Én transaktion: lås på nøglen → dublet-tjek → henvendelse → primært item → AI-forslag → audit.
--   p = { source_table, source_id?, dedupe_key? (kun simulator), provider?/provider_event_id?/channel?/occurred_at? (kun
--         'manual' for serveren), confirmed_customer_id?/confirmed_case_id? (kalderens forventning — afvises hvis den
--         ikke er kildens), customer_candidate_id?, customer_match_state?, candidate_count?, case_candidate_id?,
--         case_match_state?, title?, ai_summary?, intent?, urgency?, ai_confidence?, status?, assigned_team?,
--         next_action?, handoff_reasons?, item_title?, preview?, sender_label?, transcript_status?,
--         actions?: [{action_type, policy_outcome, reasons?, payload?, idempotency_key, execute?}] }
--   Svar: {outcome: created|duplicate, conversation_id (kun hvis synlig for kalderen), item_id, actions:[{id,type,state,idempotency_key}]}
CREATE FUNCTION public.reception_ingest(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_role text := coalesce(auth.role(), '');
  v_uid uuid := auth.uid();
  v_bg boolean;
  v_table text := p->>'source_table';
  v_sid uuid;
  v_src jsonb;
  v_key text; v_channel text; v_provider text; v_event text; v_occ timestamptz; v_dir text;
  v_confirmed uuid; v_case uuid; v_candidate uuid; v_case_cand uuid;
  v_state text; v_case_state text; v_status text; v_urgency text; v_team text; v_intent text; v_conf numeric;
  v_conv uuid; v_item uuid; v_existing record;
  v_known text[] := ARRAY['find_customer','find_contact','find_case','create_customer_proposal','create_case_proposal',
                          'append_communication','create_task','create_callback','create_planning_request','request_documents','mark_handled'];
  v_auto_exec text[] := ARRAY['find_customer','find_contact','find_case','append_communication','create_task','create_callback','create_planning_request'];
  a jsonb; v_type text; v_out text; v_astate text; v_aid uuid; v_payload jsonb; v_reasons text[]; v_idem text;
  v_actions jsonb := '[]'::jsonb;
  v_dup boolean := false; v_raised boolean := false; v_added integer := 0;
BEGIN
  -- Aktør: indlogget medarbejder (on-behalf-of) eller baggrundsaktøren ai_receptionist (service_role). Intet andet.
  IF v_role = 'service_role' THEN
    v_bg := true;
  ELSIF v_role = 'authenticated' AND v_uid IS NOT NULL THEN
    v_bg := false;
    IF NOT public.user_has_permission('conversations.manage') THEN
      RAISE EXCEPTION 'reception_ingest: conversations.manage kræves' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    RAISE EXCEPTION 'reception_ingest: ingen gyldig aktør' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'reception_ingest: ugyldigt input' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p ? 'source_id' AND p->>'source_id' IS NOT NULL THEN v_sid := (p->>'source_id')::uuid; END IF;

  -- Kildens identitet AFLEDES — kalderens bud på kanal/udbyder/tid/nøgle/kunde bruges aldrig
  IF v_table IN ('incoming_emails','portal_messages','telephony_calls') THEN
    -- Review F5: synlighed FØRST og én neutral fejl (findes ikke = skjult) — intet eksistens-orakel
    IF NOT v_bg AND (v_sid IS NULL OR NOT public.reception_source_visible(v_table, v_sid)) THEN
      RAISE EXCEPTION 'reception_ingest: kilden findes ikke eller er skjult for dig' USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_src := public.reception_source_identity(v_table, v_sid);
    IF NOT (v_src->>'ok')::boolean THEN
      RAISE EXCEPTION 'reception_ingest: kilden afvist (%)', v_src->>'reason' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_key := v_src->>'key'; v_channel := v_src->>'channel'; v_provider := v_src->>'provider'; v_event := v_src->>'event_id';
    v_occ := (v_src->>'occurred_at')::timestamptz; v_dir := v_src->>'direction';
    v_confirmed := (v_src->>'confirmed_customer')::uuid; v_case := (v_src->>'confirmed_case')::uuid; v_candidate := (v_src->>'candidate')::uuid;
  ELSIF v_table = 'simulator' THEN
    IF v_bg THEN RAISE EXCEPTION 'reception_ingest: simulatoren kræver en medarbejder' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF v_sid IS NOT NULL OR coalesce(p->>'dedupe_key', '') !~ '^sim:[0-9a-f-]{36}$' THEN
      RAISE EXCEPTION 'reception_ingest: ugyldig simulator-nøgle' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_key := p->>'dedupe_key'; v_channel := 'phone'; v_provider := 'simulator'; v_event := NULL; v_occ := now(); v_dir := 'inbound';
  ELSIF v_table = 'manual' THEN
    -- udbyder-hændelse uden CRM-kilde (web-chat, stemme-bro): kun serveren; aldrig en bekræftet kunde
    IF NOT v_bg THEN RAISE EXCEPTION 'reception_ingest: udbyder-hændelser indtages kun af serveren' USING ERRCODE = 'insufficient_privilege'; END IF;
    v_provider := p->>'provider'; v_event := p->>'provider_event_id'; v_channel := p->>'channel';
    IF v_sid IS NOT NULL OR v_provider IS NULL OR v_provider NOT IN ('web_chat','voice_bridge')
       OR coalesce(v_event, '') !~ '^[A-Za-z0-9._:-]{6,200}$' OR coalesce(v_channel, '') NOT IN ('web_chat','phone') THEN
      RAISE EXCEPTION 'reception_ingest: ugyldig udbyder-hændelse' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_key := v_provider || ':event:' || v_event; v_dir := 'inbound';
    v_occ := least(now(), coalesce((p->>'occurred_at')::timestamptz, now()));
  ELSE
    RAISE EXCEPTION 'reception_ingest: kilden % indtages ikke endnu', coalesce(v_table, '(ingen)') USING ERRCODE = 'feature_not_supported';
  END IF;

  -- Kalderens forventning om bekræftet kunde/sag SKAL være kildens (ellers afvises indtaget — intet gemmes)
  IF p->>'confirmed_customer_id' IS NOT NULL AND (p->>'confirmed_customer_id')::uuid IS DISTINCT FROM v_confirmed THEN
    RAISE EXCEPTION 'reception_ingest: kunden passer ikke til kilden' USING ERRCODE = 'check_violation';
  END IF;
  IF p->>'confirmed_case_id' IS NOT NULL AND (p->>'confirmed_case_id')::uuid IS DISTINCT FROM v_case THEN
    RAISE EXCEPTION 'reception_ingest: sagen passer ikke til kilden' USING ERRCODE = 'check_violation';
  END IF;

  -- Kandidat: kildens egen (automatisk kobling) har forrang; ellers motorens deterministiske match. Aldrig ved bekræftet.
  IF v_confirmed IS NOT NULL THEN
    v_candidate := NULL; v_state := 'confirmed';
  ELSE
    IF v_candidate IS NULL AND p->>'customer_candidate_id' IS NOT NULL THEN
      v_candidate := (p->>'customer_candidate_id')::uuid;
      -- Review F1/F5: en medarbejders kandidat skal findes OG være i medarbejderens læse-scope — ellers ignoreres den
      IF NOT v_bg AND NOT (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = v_candidate)
                           AND (public.user_has_permission('customers.view.all') OR v_candidate = ANY (public.my_customer_scope_ids()))) THEN
        v_candidate := NULL;
      END IF;
      IF v_bg AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = v_candidate) THEN v_candidate := NULL; END IF;
    END IF;
    v_state := CASE WHEN v_candidate IS NOT NULL THEN 'unique_match'
                    WHEN p->>'customer_match_state' IN ('ambiguous','no_match','insufficient_information','read_error') THEN p->>'customer_match_state'
                    ELSE 'insufficient_information' END;
  END IF;
  IF v_case IS NOT NULL THEN
    v_case_state := 'confirmed';
  ELSE
    v_case_cand := CASE WHEN coalesce(v_confirmed, v_candidate) IS NOT NULL AND p->>'case_candidate_id' IS NOT NULL THEN (p->>'case_candidate_id')::uuid END;
    IF p->>'case_candidate_id' IS NOT NULL AND v_case_cand IS NULL THEN
      RAISE EXCEPTION 'reception_ingest: sagskandidat uden kunde' USING ERRCODE = 'check_violation';
    END IF;
    v_case_state := CASE WHEN p->>'case_match_state' IN ('none','exact','several_open','no_open_case','read_error','not_applicable') THEN p->>'case_match_state' ELSE 'not_applicable' END;
  END IF;

  -- Den resulterende henvendelse skal være synlig for en indlogget kalder (ellers kunne den oprette noget, den ikke må se)
  IF NOT v_bg AND NOT public.conversation_visible(v_channel, v_confirmed, v_candidate) THEN
    RAISE EXCEPTION 'reception_ingest: henvendelsen ville være skjult for dig' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_status := CASE WHEN p->>'status' = 'handoff' THEN 'handoff' ELSE 'new' END;
  v_urgency := CASE WHEN p->>'urgency' IN ('low','normal','high','emergency') THEN p->>'urgency' ELSE 'normal' END;

  -- Samtidighed: én indtager pr. nøgle ad gangen (to samtidige kald → ét created, ét duplicate)
  PERFORM pg_advisory_xact_lock(hashtextextended('reception_ingest:' || v_key, 249));
  SELECT i.id, i.conversation_id, cv.channel, cv.customer_id, cv.customer_candidate_id, cv.service_case_id, cv.case_candidate_id, cv.urgency, cv.status, cv.handoff_reasons INTO v_existing
    FROM public.conversation_items i JOIN public.conversations cv ON cv.id = i.conversation_id
   WHERE i.dedupe_key = v_key OR (v_sid IS NOT NULL AND i.source_table = v_table AND i.source_id = v_sid)
   LIMIT 1;
  IF FOUND THEN
    -- Review F1: et senere indtag kan aldrig SÆNKE noget, men kan HÆVE hastegrad, kræve handoff og tilføje AI-forslag
    -- (kun som forslag). Så kan et tidligt indtag (fx med lav hastegrad) ikke skjule en nødsituation.
    IF NOT v_bg AND NOT public.conversation_visible(v_existing.channel, v_existing.customer_id, v_existing.customer_candidate_id) THEN
      -- Review F6: en skjult eksisterende henvendelse røres ikke, og hverken henvendelse- eller item-id udleveres
      RETURN jsonb_build_object('outcome', 'duplicate', 'conversation_id', NULL, 'item_id', NULL, 'actions', '[]'::jsonb);
    END IF;
    v_conv := v_existing.conversation_id; v_item := v_existing.id; v_dup := true;
    -- forslag på en eksisterende henvendelse bruger DENS kunde/sag (ikke kalderens)
    v_confirmed := v_existing.customer_id; v_candidate := v_existing.customer_candidate_id;
    v_case := v_existing.service_case_id; v_case_cand := v_existing.case_candidate_id;
    PERFORM set_config('reception.ingest', 'on', true);
    IF array_position(ARRAY['low','normal','high','emergency'], v_urgency) > array_position(ARRAY['low','normal','high','emergency'], v_existing.urgency)
       OR (v_status = 'handoff' AND v_existing.status NOT IN ('handoff','handled')) THEN
      UPDATE public.conversations SET
        urgency = CASE WHEN array_position(ARRAY['low','normal','high','emergency'], v_urgency) > array_position(ARRAY['low','normal','high','emergency'], urgency) THEN v_urgency ELSE urgency END,
        status = CASE WHEN v_status = 'handoff' AND status NOT IN ('handoff','handled') THEN 'handoff' ELSE status END,
        handoff_reasons = (SELECT coalesce(array_agg(DISTINCT x), '{}') FROM unnest(handoff_reasons || coalesce(ARRAY(SELECT y FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p->'handoff_reasons') = 'array' THEN p->'handoff_reasons' ELSE '[]'::jsonb END) y WHERE y ~ '^[a-z_]{1,40}$' LIMIT 20), '{}')) x)
      WHERE id = v_conv;
      v_raised := true;
    END IF;
  ELSE
    v_dup := false;
    PERFORM set_config('reception.ingest', 'on', true);
  END IF;

  IF NOT v_dup THEN
  v_team := CASE WHEN p->>'assigned_team' IN ('kontor','service','salg','bogholderi','montor') THEN p->>'assigned_team' END;
  v_intent := CASE WHEN coalesce(p->>'intent', '') ~ '^[a-z_]{1,40}$' THEN p->>'intent' END;
  v_conf := CASE WHEN jsonb_typeof(p->'ai_confidence') = 'number' THEN round(greatest(0, least(1, (p->>'ai_confidence')::numeric)), 2) END;

  INSERT INTO public.conversations (channel, status, title, ai_summary, intent, urgency, ai_confidence, customer_id, customer_candidate_id,
    customer_match_state, candidate_count, service_case_id, case_candidate_id, case_match_state, assigned_team, next_action, handoff_reasons,
    dedupe_key, intake_actor, first_at, last_at, created_by)
  VALUES (v_channel, v_status, left(coalesce(nullif(btrim(p->>'title'), ''), 'Henvendelse'), 200), left(nullif(p->>'ai_summary', ''), 2000),
    v_intent, v_urgency, v_conf, v_confirmed, v_candidate, v_state,
    CASE WHEN v_confirmed IS NOT NULL OR v_candidate IS NOT NULL THEN 1
         WHEN jsonb_typeof(p->'candidate_count') = 'number' THEN greatest(0, least(1000, (p->>'candidate_count')::int)) ELSE 0 END,
    v_case, v_case_cand, v_case_state, v_team, left(nullif(p->>'next_action', ''), 300),
    coalesce(ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p->'handoff_reasons') = 'array' THEN p->'handoff_reasons' ELSE '[]'::jsonb END) x
                   WHERE x ~ '^[a-z_]{1,40}$' LIMIT 20), '{}'),
    v_key, CASE WHEN v_bg THEN 'ai_receptionist' ELSE 'user' END, v_occ, v_occ, CASE WHEN v_bg THEN NULL ELSE v_uid END)
  RETURNING id INTO v_conv;

  INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, provider_event_id, source_table, source_id, occurred_at,
    title, body_preview, sender_label, transcript_status, dedupe_key, created_by)
  VALUES (v_conv, v_channel, v_dir, v_provider, v_event, v_table, v_sid, v_occ,
    left(coalesce(nullif(btrim(p->>'item_title'), ''), nullif(btrim(p->>'title'), '')), 200), left(nullif(p->>'preview', ''), 500),
    left(nullif(p->>'sender_label', ''), 200),
    CASE WHEN p->>'transcript_status' IN ('not_applicable','pending','unavailable') THEN p->>'transcript_status' ELSE 'not_applicable' END,
    v_key, CASE WHEN v_bg THEN NULL ELSE v_uid END)
  RETURNING id INTO v_item;
  END IF;

  -- AI-forslag. Ukendte typer → forbidden/blocked. Kun en medarbejder kan få 'approved' (auto + execute), og kun for
  -- typer AI-aktøren må udføre. Baggrundsaktøren: ALT er forslag. Kunde/sag i payload = de afledte/validerede værdier.
  FOR a IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p->'actions') = 'array' THEN p->'actions' ELSE '[]'::jsonb END) LIMIT 30 LOOP
    v_type := a->>'action_type';
    v_idem := a->>'idempotency_key';
    CONTINUE WHEN coalesce(v_type, '') !~ '^[a-z_]{1,40}$' OR coalesce(char_length(v_idem), 0) NOT BETWEEN 3 AND 300;
    v_out := CASE WHEN a->>'policy_outcome' IN ('auto','proposal','handoff','forbidden') THEN a->>'policy_outcome' ELSE 'forbidden' END;
    IF NOT (v_type = ANY (v_known)) THEN v_out := 'forbidden'; END IF;
    v_astate := CASE WHEN v_out IN ('forbidden','handoff') THEN 'blocked'
                     WHEN v_out = 'auto' AND NOT v_bg AND NOT v_dup AND a->'execute' = 'true'::jsonb AND v_type = ANY (v_auto_exec) THEN 'approved'
                     ELSE 'proposed' END;
    v_payload := (CASE WHEN jsonb_typeof(a->'payload') = 'object' THEN a->'payload' ELSE '{}'::jsonb END) - 'customerCandidateId' - 'caseCandidateId';
    v_payload := v_payload || jsonb_strip_nulls(jsonb_build_object('customerCandidateId', coalesce(v_confirmed, v_candidate), 'caseCandidateId', coalesce(v_case, v_case_cand)));
    v_reasons := coalesce(ARRAY(SELECT left(x, 200) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(a->'reasons') = 'array' THEN a->'reasons' ELSE '[]'::jsonb END) x LIMIT 20), '{}');
    IF v_bg THEN v_reasons := v_reasons || 'baggrundsaktør: kun forslag'::text; END IF;
    v_aid := NULL;
    INSERT INTO public.conversation_actions (conversation_id, action_type, policy_outcome, state, actor, payload, reasons, idempotency_key, created_by)
    VALUES (v_conv, v_type, v_out, v_astate, 'ai_receptionist', v_payload, v_reasons, v_idem, CASE WHEN v_bg THEN NULL ELSE v_uid END)
    ON CONFLICT (conversation_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_aid;
    IF v_aid IS NOT NULL THEN v_added := v_added + 1; END IF;
    v_actions := v_actions || jsonb_build_array(jsonb_build_object('id', v_aid, 'type', v_type, 'state', CASE WHEN v_aid IS NULL THEN 'duplicate' ELSE v_astate END, 'idempotency_key', v_idem));
  END LOOP;

  IF v_dup AND NOT v_raised AND v_added = 0 THEN
    PERFORM set_config('reception.ingest', 'off', true);
    RETURN jsonb_build_object('outcome', 'duplicate', 'conversation_id', v_conv, 'item_id', v_item, 'actions', v_actions, 'raised', false);
  END IF;
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
  VALUES (CASE WHEN v_bg THEN NULL ELSE v_uid END, 'conversation', v_conv, CASE WHEN v_dup THEN 'conversation_ingest_merged' ELSE 'conversation_ingested' END,
    CASE WHEN v_dup THEN 'Henvendelse opdateret ved nyt indtag (' || v_channel || ')' ELSE 'Henvendelse indtaget (' || v_channel || ')' END,
    jsonb_build_object('actor', 'ai_receptionist', 'mode', CASE WHEN v_bg THEN 'background' ELSE 'on_behalf_of_user' END,
                       'on_behalf_of', CASE WHEN v_bg THEN NULL ELSE v_uid END, 'source_table', v_table, 'channel', v_channel,
                       'urgency', v_urgency, 'customer_match_state', v_state, 'actions', v_added, 'raised', v_raised));

  PERFORM set_config('reception.ingest', 'off', true);
  RETURN jsonb_build_object('outcome', CASE WHEN v_dup THEN 'duplicate' ELSE 'created' END, 'conversation_id', v_conv, 'item_id', v_item,
                            'actions', v_actions, 'raised', v_raised);
END $f$;

-- Funktions-ACL (Supabase-standardrettigheder giver ellers EXECUTE til anon/authenticated)
REVOKE ALL ON FUNCTION public.conversations_guard(), public.conversation_items_guard(), public.conversation_actions_guard(),
  public.conversation_actions_insert_guard(), public.upload_requests_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reception_source_identity(text, uuid), public.reception_source_visible(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conversation_visible(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conversation_visible(text, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.reception_ingest(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reception_ingest(jsonb) TO authenticated, service_role;

-- 12. RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select ON public.conversations FOR SELECT TO authenticated
  USING (public.conversation_visible(channel, customer_id, customer_candidate_id));
CREATE POLICY conversations_update ON public.conversations FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('conversations.manage')) AND public.conversation_visible(channel, customer_id, customer_candidate_id))
  WITH CHECK (public.conversation_visible(channel, customer_id, customer_candidate_id));

-- Børn: synlighed = henvendelsens synlighed (EXISTS kører under conversations' RLS)
CREATE POLICY conversation_items_select ON public.conversation_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id));

CREATE POLICY conversation_actions_select ON public.conversation_actions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id));
-- Brugere registrerer kun EGNE handlinger (actor='user'); AI-handlinger kommer kun via reception_ingest
CREATE POLICY conversation_actions_insert ON public.conversation_actions FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('conversations.manage')) AND created_by = auth.uid() AND actor = 'user'
              AND (decided_by IS NULL OR decided_by = auth.uid())
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
  WITH CHECK ((SELECT public.user_has_permission('conversations.manage')) AND created_by = auth.uid() AND files_uploaded = 0
              AND revoked_at IS NULL AND consumed_at IS NULL
              AND ((SELECT public.user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[]))
              AND (conversation_id IS NULL OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id)));
CREATE POLICY upload_requests_revoke ON public.upload_requests FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('conversations.manage'))
         AND ((SELECT public.user_has_permission('customers.view.all')) OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[]))
         AND (conversation_id IS NULL OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id)))
  WITH CHECK ((SELECT public.user_has_permission('conversations.manage')));

REVOKE ALL ON public.conversations, public.conversation_items, public.conversation_actions, public.upload_requests FROM PUBLIC, anon, authenticated;
-- Ingen INSERT på henvendelser/items for authenticated: kun reception_ingest (atomisk, kilde-afledt)
GRANT SELECT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT ON public.conversation_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversation_actions TO authenticated;
-- upload_requests: token_hash kan indsættes men ALDRIG læses af authenticated; kun revoked_at kan ændres
GRANT SELECT (id, conversation_id, customer_id, service_case_id, purpose, expires_at, max_files, files_uploaded, consumed_at, revoked_at, created_by, created_at)
  ON public.upload_requests TO authenticated;
GRANT INSERT (conversation_id, customer_id, service_case_id, token_hash, purpose, expires_at, max_files) ON public.upload_requests TO authenticated;
GRANT UPDATE (revoked_at) ON public.upload_requests TO authenticated;
GRANT ALL ON public.conversations, public.conversation_items, public.conversation_actions, public.upload_requests TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ROLLBACK (manuel; fjerner kun det nye — henvendelser/upload-links går tabt). EFTERLADER bevidst: audit_logs-rækker
-- (conversation_*/upload_link_*) og kundedokumenter + storage-filer modtaget via upload-links (de mister kun koblingen
-- til henvendelsen; dokumenterne hører til kunden/sagen). Ingen eksisterende tabel er ændret af 00249:
-- BEGIN;
-- DROP TABLE IF EXISTS public.upload_requests;
-- DROP TABLE IF EXISTS public.conversation_actions;
-- DROP TABLE IF EXISTS public.conversation_items;
-- DROP TABLE IF EXISTS public.conversations;
-- DROP FUNCTION IF EXISTS public.reception_ingest(jsonb);
-- DROP FUNCTION IF EXISTS public.conversation_visible(text, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.conversation_visible(text, uuid);
-- DROP FUNCTION IF EXISTS public.reception_source_visible(text, uuid);
-- DROP FUNCTION IF EXISTS public.reception_source_identity(text, uuid);
-- DROP FUNCTION IF EXISTS public.upload_requests_guard();
-- DROP FUNCTION IF EXISTS public.conversation_actions_insert_guard();
-- DROP FUNCTION IF EXISTS public.conversation_actions_guard();
-- DROP FUNCTION IF EXISTS public.conversation_items_guard();
-- DROP FUNCTION IF EXISTS public.conversations_guard();
-- DELETE FROM public.user_permission_overrides WHERE permission IN ('conversations.view', 'conversations.view_unmatched', 'conversations.manage');
-- DELETE FROM public.role_permission_defaults WHERE permission IN ('conversations.view', 'conversations.view_unmatched', 'conversations.manage');
-- DELETE FROM public.permission_catalog WHERE permission IN ('conversations.view', 'conversations.view_unmatched', 'conversations.manage');
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
