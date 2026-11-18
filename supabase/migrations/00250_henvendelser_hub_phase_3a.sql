-- =====================================================================================================================
-- 00250 Henvendelser — kommunikations-hub fase 3A. KANDIDAT: kun på branch/staging.
-- MÅ IKKE køres i produktion uden Henriks særskilte godkendelse (nr/formål/risiko/pre-post).
-- Bygger på 00249 (skal være anvendt). Ingen ændring af eksisterende kilde-tabeller (incoming_emails, portal_messages,
-- telephony_calls, customers, service_cases): de LÆSES kun. Ingen nye rettighedsnøgler (katalog uændret).
--
--   1. Tråde (docs/runbooks/ELTA_COMMUNICATION_HUB_PHASE_3A.md §3): kildens TRÅDNØGLE afledes i databasen af kilderækken
--      (mail: Graph conversationId · portal: KUN kunde + tilbud (uden tilbud ingen tråd) · web-chat: sessionen ·
--      opkald/webformular: ingen tråd). reception_ingest føjer en ny kilde til en ÅBEN henvendelse med samme trådnøgle
--      inden for kanalens vindue — aldrig på tværs af kanaler, aldrig blot fordi telefon/mail matcher, aldrig til en
--      afsluttet henvendelse, aldrig hvis kildens bekræftede kunde, bekræftede sag eller kunde-kandidat er en anden end
--      henvendelsens (final review §5).
--   6. Kilde → henvendelse-afstemning (final review §4): ændrer en medarbejder kunde/sag på mailen (kanonisk kilde),
--      afstemmes henvendelsen i samme transaktion (trigger på incoming_emails → reception_reconcile_source). Kildens
--      menneskelige kobling vinder over en automatisk kandidat; tråd-items der ikke længere hører til flyttes til deres egen
--      henvendelse; alt auditeres. Fejl her vælter ALDRIG koblingen (auditeret som conversation_reconcile_failed).
--   7. Web-chat misbrugsværn (final review §3): web_chat_rate_limits + web_chat_rate_check (kun service_role). Nøglen er
--      en HMAC af IP'en (ingen IP gemmes); burst pr. minut, rullende time pr. nøgle og globalt loft.
--   2. Status 'awaiting_elta' (venter på ELTA) ved siden af 'awaiting_customer'.
--   3. Vedhæftnings-REFERENCER (navn/type/størrelse — aldrig URL/indhold) afledt af kilden.
--   4. ELTAs egen web-chat (STAGING; flag RECEPTION_WEBCHAT_ENABLED, standard FRA): web_chat_sessions/web_chat_messages er
--      den kanoniske kilde. Skrives KUN af serveren (service_role); medarbejdere læser via henvendelsens synlighed.
--   5. Retention: kopieret tekst i henvendelser (uddrag, afsendernavn, emne/titel, AI-resumé, vedhæftningsnavne,
--      transskriptions-reference) kan ryddes efter politik af reception_retention(policy, apply) — standard DRY-RUN,
--      kun service_role, auditeret. Kanoniske kilder (mail/portal/opkald/chat) røres ALDRIG.
--      Kunde/sag slettet → markeret (customer_deleted_at/case_deleted_at); kilde slettet → item.source_missing_at.
-- =====================================================================================================================
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.reception_ingest(jsonb)') IS NULL OR to_regclass('public.conversations') IS NULL THEN
    RAISE EXCEPTION '00250: 00249 er ikke anvendt';
  END IF;
  IF to_regclass('public.web_chat_sessions') IS NOT NULL OR to_regclass('public.web_chat_messages') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'thread_key') THEN
    RAISE EXCEPTION '00250: allerede anvendt — kontrollér før kørsel';
  END IF;
END
$guard$;

-- 1. Henvendelser: tråd, venter-på-ELTA, retention-markører
ALTER TABLE public.conversations DROP CONSTRAINT conversations_status_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('new','open','awaiting_customer','awaiting_elta','handoff','handled','spam'));
ALTER TABLE public.conversations
  ADD COLUMN thread_key          text CHECK (char_length(thread_key) BETWEEN 3 AND 300),
  ADD COLUMN text_purged_at      timestamptz,
  ADD COLUMN customer_deleted_at timestamptz,
  ADD COLUMN case_deleted_at     timestamptz;
CREATE INDEX conversations_thread_open ON public.conversations (thread_key, last_at DESC)
  WHERE thread_key IS NOT NULL AND status NOT IN ('handled','spam');
CREATE INDEX conversations_handled_at ON public.conversations (handled_at) WHERE handled_at IS NOT NULL;

-- 2. Items: web-chat som kilde, vedhæftnings-referencer, retention-markører
ALTER TABLE public.conversation_items DROP CONSTRAINT conversation_items_source_table_check;
ALTER TABLE public.conversation_items ADD CONSTRAINT conversation_items_source_table_check
  CHECK (source_table IN ('incoming_emails','portal_messages','telephony_calls','sms_messages','customer_documents','web_chat_messages','simulator','manual'));
ALTER TABLE public.conversation_items
  ADD COLUMN attachment_refs  jsonb NOT NULL DEFAULT '[]'::jsonb
                              CHECK (jsonb_typeof(attachment_refs) = 'array' AND pg_column_size(attachment_refs) <= 4096),
  ADD COLUMN text_purged_at   timestamptz,
  ADD COLUMN source_missing_at timestamptz;

-- 3. Web-chat (kanonisk kilde for ELTAs egen chat). Kun serveren skriver. Besøgendes oplysninger er UBEKRÆFTEDE.
CREATE TABLE public.web_chat_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash          text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  visitor_name        text CHECK (char_length(visitor_name) <= 200),
  visitor_phone       text CHECK (char_length(visitor_phone) <= 40),
  visitor_email       text CHECK (char_length(visitor_email) <= 200),
  visitor_postal_code text CHECK (visitor_postal_code ~ '^[0-9]{4}$'),
  visitor_address     text CHECK (char_length(visitor_address) <= 300),
  topic               text NOT NULL DEFAULT 'general' CHECK (topic IN ('general','service','quote','existing_case','human')),
  message_count       integer NOT NULL DEFAULT 0 CHECK (message_count BETWEEN 0 AND 200),
  closed_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_chat_sessions_created ON public.web_chat_sessions (created_at);

CREATE TABLE public.web_chat_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES public.web_chat_sessions(id) ON DELETE CASCADE,
  direction         text NOT NULL CHECK (direction IN ('inbound','outbound')),
  author            text NOT NULL CHECK (author IN ('visitor','assistant')),
  body              text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  -- idempotens: samme klient-besked (fx gentaget tryk/netværks-retry) gemmes én gang
  client_message_id text CHECK (client_message_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_chat_messages_author_direction CHECK ((direction = 'inbound') = (author = 'visitor')),
  UNIQUE (session_id, client_message_id)
);
CREATE INDEX web_chat_messages_session ON public.web_chat_messages (session_id, created_at);

-- 4. Kildens identitet (+ trådnøgle, bekræftet sag, vedhæftnings-referencer) — AFLEDT af kilderækken
CREATE OR REPLACE FUNCTION public.reception_source_identity(p_table text, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
DECLARE e record; m record; t record; w record; v_web boolean; v_case uuid; v_refs jsonb;
BEGIN
  IF p_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'source_id_missing'); END IF;
  IF p_table = 'incoming_emails' THEN
    SELECT i.id, i.subject, i.sender_email, i.received_at, i.customer_id, i.linked_by, i.link_status::text AS link_status,
           i.conversation_id AS graph_thread, i.service_case_id, i.attachment_urls
      INTO e FROM public.incoming_emails i WHERE i.id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'source_not_found'); END IF;
    IF e.link_status = 'ignored' THEN RETURN jsonb_build_object('ok', false, 'reason', 'source_ignored'); END IF;
    v_web := coalesce(e.sender_email, '') ~* '@formsubmit\.co$' AND coalesce(e.subject, '') ~* 'henvendelse';
    -- En sag på mailen er kun BEKRÆFTET, når mailen er koblet manuelt og sagen tilhører samme kunde
    v_case := CASE WHEN e.linked_by = 'manual' AND e.customer_id IS NOT NULL AND e.service_case_id IS NOT NULL
                    AND EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = e.service_case_id AND s.customer_id = e.customer_id)
                   THEN e.service_case_id END;
    SELECT coalesce(jsonb_agg(jsonb_build_object('name', left(coalesce(x->>'filename', 'vedhæftning'), 200),
             'mime', left(coalesce(x->>'contentType', ''), 100),
             'size', CASE WHEN jsonb_typeof(x->'size') = 'number' THEN (x->>'size')::bigint END)), '[]'::jsonb)
      INTO v_refs
      FROM (SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.attachment_urls) = 'array' THEN e.attachment_urls ELSE '[]'::jsonb END) x LIMIT 10) a;
    RETURN jsonb_build_object('ok', true, 'key', 'mail:incoming_emails:' || e.id::text,
      'channel', CASE WHEN v_web THEN 'web_chat' ELSE 'email' END, 'provider', CASE WHEN v_web THEN 'formsubmit' ELSE 'microsoft365' END,
      'event_id', NULL, 'occurred_at', e.received_at, 'direction', 'inbound',
      'confirmed_customer', CASE WHEN e.linked_by = 'manual' THEN e.customer_id END, 'confirmed_case', v_case,
      'candidate', CASE WHEN e.linked_by IS DISTINCT FROM 'manual' THEN e.customer_id END,
      -- webformularer har ingen tråd (hver formular er sin egen henvendelse)
      'thread_key', CASE WHEN NOT v_web AND nullif(btrim(e.graph_thread), '') IS NOT NULL THEN 'mail-thread:' || md5(e.graph_thread) END,
      'attachments', v_refs);
  ELSIF p_table = 'portal_messages' THEN
    SELECT pm.id, pm.customer_id, pm.sender_type, pm.created_at, pm.offer_id, pm.attachments INTO m FROM public.portal_messages pm WHERE pm.id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'source_not_found'); END IF;
    IF m.sender_type IS DISTINCT FROM 'customer' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_customer_message'); END IF;
    IF m.created_at IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_timestamp'); END IF;
    -- Eksplicit sag: præcis én (ikke-forslag) sag for kundens tilbud
    IF m.offer_id IS NOT NULL AND (SELECT count(*) FROM public.service_cases s WHERE s.source_offer_id = m.offer_id AND s.customer_id = m.customer_id AND NOT s.is_proposal) = 1 THEN
      SELECT s.id INTO v_case FROM public.service_cases s WHERE s.source_offer_id = m.offer_id AND s.customer_id = m.customer_id AND NOT s.is_proposal;
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('name', left(coalesce(x->>'name', 'vedhæftning'), 200), 'mime', left(coalesce(x->>'type', ''), 100),
             'size', CASE WHEN jsonb_typeof(x->'size') = 'number' THEN (x->>'size')::bigint END)), '[]'::jsonb)
      INTO v_refs
      FROM (SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m.attachments) = 'array' THEN m.attachments ELSE '[]'::jsonb END) x LIMIT 10) a;
    RETURN jsonb_build_object('ok', true, 'key', 'portal:portal_messages:' || m.id::text, 'channel', 'portal', 'provider', 'portal',
      'event_id', NULL, 'occurred_at', m.created_at, 'direction', 'inbound',
      'confirmed_customer', m.customer_id, 'confirmed_case', v_case, 'candidate', NULL,
      -- Final review: KUN en stærk nøgle (tilbuddet) giver en tråd. Uden tilbud er hver portalbesked sin egen henvendelse —
      -- samme kunde/samme dag er IKKE et fortsættelsessignal (solceller, ladeboks, faktura og fejl må ikke blandes)
      'thread_key', CASE WHEN m.offer_id IS NOT NULL THEN 'portal:' || m.customer_id::text || ':offer:' || m.offer_id::text END,
      'attachments', v_refs);
  ELSIF p_table = 'telephony_calls' THEN
    SELECT c.id, c.provider, c.provider_call_id, c.direction, c.started_at, c.customer_id, c.service_case_id, c.suggested_customer_id
      INTO t FROM public.telephony_calls c WHERE c.id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'source_not_found'); END IF;
    RETURN jsonb_build_object('ok', true, 'key', t.provider || ':telephony_calls:' || t.id::text, 'channel', 'phone', 'provider', t.provider,
      'event_id', t.provider_call_id, 'occurred_at', t.started_at, 'direction', CASE WHEN t.direction = 'outbound' THEN 'outbound' ELSE 'inbound' END,
      'confirmed_customer', t.customer_id, 'confirmed_case', CASE WHEN t.customer_id IS NOT NULL THEN t.service_case_id END,
      'candidate', CASE WHEN t.customer_id IS NULL THEN t.suggested_customer_id END,
      'thread_key', NULL, 'attachments', '[]'::jsonb);
  ELSIF p_table = 'web_chat_messages' THEN
    SELECT wm.id, wm.session_id, wm.direction, wm.created_at INTO w FROM public.web_chat_messages wm WHERE wm.id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'source_not_found'); END IF;
    -- Besøgende er aldrig en bekræftet kunde (oplysningerne er ubekræftede) — kun motorens kandidat
    RETURN jsonb_build_object('ok', true, 'key', 'webchat:web_chat_messages:' || w.id::text, 'channel', 'web_chat', 'provider', 'elta_webchat',
      'event_id', NULL, 'occurred_at', w.created_at, 'direction', w.direction,
      'confirmed_customer', NULL, 'confirmed_case', NULL, 'candidate', NULL,
      'thread_key', 'webchat:' || w.session_id::text, 'attachments', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'source_table_not_supported');
END $f$;

-- 5. Kilde-synlighed: web-chat indtages KUN af serveren (ingen medarbejder-indtag af chat-kilder)
CREATE OR REPLACE FUNCTION public.reception_source_visible(p_table text, p_id uuid) RETURNS boolean
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

-- 6. Værn på henvendelser (00249 + tråd/retention-markører kan ikke ændres af brugere; sletning markeres)
CREATE OR REPLACE FUNCTION public.conversations_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  is_user boolean := coalesce(auth.role(), '') <> 'service_role';
  v_customer_gone boolean := false;
  v_case_gone boolean := false;
  v_cand_gone boolean := false;
  v_src jsonb;
BEGIN
  IF TG_OP = 'INSERT' AND current_setting('reception.ingest', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'conversations: oprettes kun via reception_ingest' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.text_purged_at IS NOT NULL OR NEW.customer_deleted_at IS NOT NULL OR NEW.case_deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'conversations: retention-markører sættes ikke ved oprettelse' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key OR NEW.channel IS DISTINCT FROM OLD.channel
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.first_at IS DISTINCT FROM OLD.first_at
       OR NEW.intake_actor IS DISTINCT FROM OLD.intake_actor OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.thread_key IS DISTINCT FROM OLD.thread_key THEN
      RAISE EXCEPTION 'conversations: dedupe_key/channel/created_by/first_at/intake_actor/thread_key kan ikke ændres' USING ERRCODE = 'check_violation';
    END IF;
    -- Retention-markører: kun serveren (retention-funktionen) — en bruger kan hverken sætte eller fjerne dem
    IF is_user AND (NEW.text_purged_at IS DISTINCT FROM OLD.text_purged_at OR NEW.customer_deleted_at IS DISTINCT FROM OLD.customer_deleted_at
                    OR NEW.case_deleted_at IS DISTINCT FROM OLD.case_deleted_at) THEN
      RAISE EXCEPTION 'conversations: retention-markører styres af serveren' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.text_purged_at IS NOT NULL AND NEW.text_purged_at IS NULL THEN
      RAISE EXCEPTION 'conversations: ryddet tekst kan ikke genåbnes' USING ERRCODE = 'check_violation';
    END IF;
    v_customer_gone := OLD.customer_id IS NOT NULL AND NEW.customer_id IS NULL
                       AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = OLD.customer_id);
    v_case_gone := OLD.service_case_id IS NOT NULL AND NEW.service_case_id IS NULL
                   AND NOT EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = OLD.service_case_id);
    -- Kandidat-kunden slettet (FK SET NULL): henvendelsen er ikke længere matchet, og den slettede kundes kopierede tekst
    -- kan ryddes efter politikken (customer_deleted_at)
    v_cand_gone := OLD.customer_candidate_id IS NOT NULL AND NEW.customer_candidate_id IS NULL
                   AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = OLD.customer_candidate_id);
    IF v_cand_gone AND NOT v_customer_gone THEN
      NEW.customer_match_state := CASE WHEN NEW.customer_id IS NULL AND NEW.customer_match_state = 'unique_match' THEN 'insufficient_information' ELSE NEW.customer_match_state END;
      NEW.case_candidate_id := NULL;
      NEW.case_match_state := CASE WHEN NEW.service_case_id IS NULL THEN 'none' ELSE NEW.case_match_state END;
      NEW.customer_deleted_at := coalesce(OLD.customer_deleted_at, now());
    END IF;
    IF v_customer_gone THEN
      NEW.customer_match_state := 'insufficient_information';
      NEW.service_case_id := NULL;
      NEW.case_match_state := 'none';
      NEW.customer_deleted_at := coalesce(OLD.customer_deleted_at, now());
      IF OLD.service_case_id IS NOT NULL THEN NEW.case_deleted_at := coalesce(OLD.case_deleted_at, now()); END IF;
    ELSIF v_case_gone THEN
      NEW.case_match_state := 'none';
      NEW.case_deleted_at := coalesce(OLD.case_deleted_at, now());
    END IF;
    IF is_user AND NOT v_customer_gone AND NOT v_case_gone AND NOT v_cand_gone
       AND (NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.service_case_id IS DISTINCT FROM OLD.service_case_id
            OR NEW.customer_match_state IS DISTINCT FROM OLD.customer_match_state)
       AND NEW.match_version <> OLD.match_version + 1 THEN
      RAISE EXCEPTION 'conversations: match-ændring kræver match_version + 1' USING ERRCODE = 'check_violation';
    END IF;
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

-- 7. Item-værn (ALLE skrivere): primært item (som 00249) ELLER et TRÅD-item, som kun reception_ingest kan tilføje til en
--    åben henvendelse med samme afledte trådnøgle. Vedhæftnings-referencer = kildens (afledt).
CREATE OR REPLACE FUNCTION public.conversation_items_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_bg boolean := coalesce(auth.role(), '') = 'service_role';
  v_src jsonb;
  c record;
  v_thread boolean;
BEGIN
  SELECT cv.id, cv.dedupe_key, cv.customer_id, cv.thread_key, cv.status INTO c FROM public.conversations cv WHERE cv.id = NEW.conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation_items: henvendelsen findes ikke' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF NEW.text_purged_at IS NOT NULL OR NEW.source_missing_at IS NOT NULL THEN
    RAISE EXCEPTION 'conversation_items: retention-markører sættes ikke ved oprettelse' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.source_table = 'customer_documents' THEN
    IF NOT v_bg THEN RAISE EXCEPTION 'conversation_items: upload-filer knyttes kun af serveren' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF NEW.channel <> 'upload_link' OR NEW.dedupe_key IS DISTINCT FROM 'upload:customer_documents:' || NEW.source_id::text
       OR c.customer_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.customer_documents d WHERE d.id = NEW.source_id AND d.customer_id = c.customer_id) THEN
      RAISE EXCEPTION 'conversation_items: dokumentet tilhører ikke henvendelsens kunde' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  v_thread := NEW.dedupe_key IS DISTINCT FROM c.dedupe_key;
  IF v_thread AND current_setting('reception.ingest', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'conversation_items: et kilde-item skal være henvendelsens primære item' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.source_table IN ('incoming_emails','portal_messages','telephony_calls','web_chat_messages') THEN
    v_src := public.reception_source_identity(NEW.source_table, NEW.source_id);
    IF NOT (v_src->>'ok')::boolean THEN
      RAISE EXCEPTION 'conversation_items: kilden afvist (%)', v_src->>'reason' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.dedupe_key <> v_src->>'key' OR NEW.channel <> v_src->>'channel' OR NEW.provider <> v_src->>'provider'
       OR NEW.direction <> v_src->>'direction' THEN
      RAISE EXCEPTION 'conversation_items: kanal/udbyder/nøgle passer ikke til kilden' USING ERRCODE = 'check_violation';
    END IF;
    IF v_thread THEN
      -- Tråd-item: samme afledte trådnøgle, åben henvendelse, og kildens bekræftede kunde (hvis nogen) = henvendelsens
      IF (v_src->>'thread_key') IS NULL OR c.thread_key IS DISTINCT FROM (v_src->>'thread_key') OR c.status IN ('handled','spam')
         OR ((v_src->>'confirmed_customer') IS NOT NULL AND c.customer_id IS DISTINCT FROM (v_src->>'confirmed_customer')::uuid) THEN
        RAISE EXCEPTION 'conversation_items: kilden hører ikke til henvendelsens åbne tråd' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF c.customer_id IS DISTINCT FROM (v_src->>'confirmed_customer')::uuid THEN
      RAISE EXCEPTION 'conversation_items: henvendelsens kunde passer ikke til kilden' USING ERRCODE = 'check_violation';
    END IF;
    NEW.occurred_at := (v_src->>'occurred_at')::timestamptz;
    NEW.provider_event_id := v_src->>'event_id';
    NEW.attachment_refs := coalesce(v_src->'attachments', '[]'::jsonb);
  ELSIF v_thread THEN
    RAISE EXCEPTION 'conversation_items: kun kilde-items kan føjes til en tråd' USING ERRCODE = 'check_violation';
  ELSIF NEW.source_table = 'simulator' THEN
    IF NEW.source_id IS NOT NULL OR NEW.dedupe_key !~ '^sim:[0-9a-f-]{36}$' OR NEW.provider <> 'simulator' OR c.customer_id IS NOT NULL THEN
      RAISE EXCEPTION 'conversation_items: ugyldigt simulator-item' USING ERRCODE = 'check_violation';
    END IF;
    NEW.attachment_refs := '[]'::jsonb;
  ELSIF NEW.source_table = 'manual' THEN
    IF NOT v_bg THEN RAISE EXCEPTION 'conversation_items: udbyder-hændelser indtages kun af serveren' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF NEW.source_id IS NOT NULL OR NEW.provider_event_id IS NULL OR NEW.dedupe_key IS DISTINCT FROM NEW.provider || ':event:' || NEW.provider_event_id
       OR c.customer_id IS NOT NULL THEN
      RAISE EXCEPTION 'conversation_items: ugyldig udbyder-hændelse' USING ERRCODE = 'check_violation';
    END IF;
    NEW.attachment_refs := '[]'::jsonb;
  ELSE
    RAISE EXCEPTION 'conversation_items: kilden % indtages ikke endnu', NEW.source_table USING ERRCODE = 'feature_not_supported';
  END IF;
  RETURN NEW;
END $f$;

-- Items er uforanderlige — UNDTAGEN retention (kun inde i reception_retention): kopieret tekst kan ryddes, markører sættes
CREATE FUNCTION public.conversation_items_update_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$
BEGIN
  IF current_setting('reception.retention', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'conversation_items: items er uforanderlige (kun retention kan rydde kopieret tekst)' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.channel IS DISTINCT FROM OLD.channel
     OR NEW.direction IS DISTINCT FROM OLD.direction OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
     OR NEW.source_table IS DISTINCT FROM OLD.source_table OR NEW.source_id IS DISTINCT FROM OLD.source_id OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
     OR NEW.attachment_document_ids IS DISTINCT FROM OLD.attachment_document_ids OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.transcript_purge_after IS DISTINCT FROM OLD.transcript_purge_after THEN
    RAISE EXCEPTION 'conversation_items: retention må kun rydde tekst' USING ERRCODE = 'check_violation';
  END IF;
  -- Kun mod "ryddet": tekst → NULL, referencer → [], transskription → purged, markører sættes (aldrig fjernes)
  IF (NEW.title IS NOT NULL AND NEW.title IS DISTINCT FROM OLD.title) OR (NEW.body_preview IS NOT NULL AND NEW.body_preview IS DISTINCT FROM OLD.body_preview)
     OR (NEW.sender_label IS NOT NULL AND NEW.sender_label IS DISTINCT FROM OLD.sender_label)
     OR (NEW.attachment_refs <> '[]'::jsonb AND NEW.attachment_refs IS DISTINCT FROM OLD.attachment_refs)
     OR (NEW.transcript_ref IS NOT NULL AND NEW.transcript_ref IS DISTINCT FROM OLD.transcript_ref)
     OR (NEW.transcript_status IS DISTINCT FROM OLD.transcript_status AND NEW.transcript_status <> 'purged')
     OR (OLD.text_purged_at IS NOT NULL AND NEW.text_purged_at IS DISTINCT FROM OLD.text_purged_at)
     OR (OLD.source_missing_at IS NOT NULL AND NEW.source_missing_at IS DISTINCT FROM OLD.source_missing_at) THEN
    RAISE EXCEPTION 'conversation_items: retention kan kun rydde, aldrig skrive tekst' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_conversation_items_update_guard BEFORE UPDATE ON public.conversation_items
  FOR EACH ROW EXECUTE FUNCTION public.conversation_items_update_guard();

-- 8. ATOMISK INDTAG (00249) + tråde. Nyt udfald 'appended' (kilden føjet til en åben henvendelse i samme tråd).
--    Tråd-vindue pr. kanal: mail 30 dage, portal 14 dage, web-chat 1 dag (efter henvendelsens seneste aktivitet).
--    Et tråd-item giver højst FORSLAG (aldrig 'approved'), kan hæve hastegrad og kræve handoff, og et svar fra kunden
--    flytter 'awaiting_customer' → 'open'. Udgående items (chat-assistentens svar) kræver en åben tråd og ændrer intet.
CREATE OR REPLACE FUNCTION public.reception_ingest(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_role text := coalesce(auth.role(), '');
  v_uid uuid := auth.uid();
  v_bg boolean;
  v_table text := p->>'source_table';
  v_sid uuid;
  v_src jsonb;
  v_key text; v_channel text; v_provider text; v_event text; v_occ timestamptz; v_dir text; v_thread text;
  v_confirmed uuid; v_case uuid; v_candidate uuid; v_case_cand uuid;
  v_state text; v_case_state text; v_status text; v_urgency text; v_team text; v_intent text; v_conf numeric;
  v_conv uuid; v_item uuid; v_existing record; v_th record;
  v_known text[] := ARRAY['find_customer','find_contact','find_case','create_customer_proposal','create_case_proposal',
                          'append_communication','create_task','create_callback','create_planning_request','request_documents','mark_handled'];
  v_auto_exec text[] := ARRAY['find_customer','find_contact','find_case','append_communication','create_task','create_callback','create_planning_request'];
  a jsonb; v_type text; v_out text; v_astate text; v_aid uuid; v_payload jsonb; v_reasons text[]; v_idem text;
  v_actions jsonb := '[]'::jsonb;
  v_dup boolean := false; v_append boolean := false; v_raised boolean := false; v_added integer := 0;
  v_window interval;
BEGIN
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

  IF v_table IN ('incoming_emails','portal_messages','telephony_calls','web_chat_messages') THEN
    IF NOT v_bg AND (v_sid IS NULL OR NOT public.reception_source_visible(v_table, v_sid)) THEN
      RAISE EXCEPTION 'reception_ingest: kilden findes ikke eller er skjult for dig' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Final review §4: samme lås som kilde-afstemningen (trigger på kilden) — kildens kobling læses EFTER låsen, så et
    -- samtidigt manuelt link enten ses her eller afstemmes bagefter (aldrig en blivende uenighed)
    PERFORM pg_advisory_xact_lock(hashtextextended('reception_src:' || v_table || ':' || coalesce(v_sid::text, ''), 250));
    v_src := public.reception_source_identity(v_table, v_sid);
    IF NOT (v_src->>'ok')::boolean THEN
      RAISE EXCEPTION 'reception_ingest: kilden afvist (%)', v_src->>'reason' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_key := v_src->>'key'; v_channel := v_src->>'channel'; v_provider := v_src->>'provider'; v_event := v_src->>'event_id';
    v_occ := (v_src->>'occurred_at')::timestamptz; v_dir := v_src->>'direction'; v_thread := v_src->>'thread_key';
    v_confirmed := (v_src->>'confirmed_customer')::uuid; v_case := (v_src->>'confirmed_case')::uuid; v_candidate := (v_src->>'candidate')::uuid;
  ELSIF v_table = 'simulator' THEN
    IF v_bg THEN RAISE EXCEPTION 'reception_ingest: simulatoren kræver en medarbejder' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF v_sid IS NOT NULL OR coalesce(p->>'dedupe_key', '') !~ '^sim:[0-9a-f-]{36}$' THEN
      RAISE EXCEPTION 'reception_ingest: ugyldig simulator-nøgle' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_key := p->>'dedupe_key'; v_channel := 'phone'; v_provider := 'simulator'; v_event := NULL; v_occ := now(); v_dir := 'inbound';
  ELSIF v_table = 'manual' THEN
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

  IF p->>'confirmed_customer_id' IS NOT NULL AND (p->>'confirmed_customer_id')::uuid IS DISTINCT FROM v_confirmed THEN
    RAISE EXCEPTION 'reception_ingest: kunden passer ikke til kilden' USING ERRCODE = 'check_violation';
  END IF;
  IF p->>'confirmed_case_id' IS NOT NULL AND (p->>'confirmed_case_id')::uuid IS DISTINCT FROM v_case THEN
    RAISE EXCEPTION 'reception_ingest: sagen passer ikke til kilden' USING ERRCODE = 'check_violation';
  END IF;

  IF v_confirmed IS NOT NULL THEN
    v_candidate := NULL; v_state := 'confirmed';
  ELSE
    IF v_candidate IS NULL AND p->>'customer_candidate_id' IS NOT NULL THEN
      v_candidate := (p->>'customer_candidate_id')::uuid;
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

  IF NOT v_bg AND NOT public.conversation_visible(v_channel, v_confirmed, v_candidate) THEN
    RAISE EXCEPTION 'reception_ingest: henvendelsen ville være skjult for dig' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_status := CASE WHEN p->>'status' = 'handoff' THEN 'handoff' ELSE 'new' END;
  v_urgency := CASE WHEN p->>'urgency' IN ('low','normal','high','emergency') THEN p->>'urgency' ELSE 'normal' END;

  PERFORM pg_advisory_xact_lock(hashtextextended('reception_ingest:' || v_key, 249));
  SELECT i.id, i.conversation_id, cv.channel, cv.customer_id, cv.customer_candidate_id, cv.service_case_id, cv.case_candidate_id, cv.urgency, cv.status, cv.handoff_reasons INTO v_existing
    FROM public.conversation_items i JOIN public.conversations cv ON cv.id = i.conversation_id
   WHERE i.dedupe_key = v_key OR (v_sid IS NOT NULL AND i.source_table = v_table AND i.source_id = v_sid)
   LIMIT 1;
  IF FOUND THEN
    IF NOT v_bg AND NOT public.conversation_visible(v_existing.channel, v_existing.customer_id, v_existing.customer_candidate_id) THEN
      RETURN jsonb_build_object('outcome', 'duplicate', 'conversation_id', NULL, 'item_id', NULL, 'actions', '[]'::jsonb);
    END IF;
    v_conv := v_existing.conversation_id; v_item := v_existing.id; v_dup := true;
    v_confirmed := v_existing.customer_id; v_candidate := v_existing.customer_candidate_id;
    v_case := v_existing.service_case_id; v_case_cand := v_existing.case_candidate_id;
  ELSIF v_thread IS NOT NULL THEN
    -- Tråd: én indtager pr. tråd ad gangen (to første beskeder i samme tråd → én henvendelse)
    PERFORM pg_advisory_xact_lock(hashtextextended('reception_thread:' || v_thread, 250));
    v_window := CASE v_channel WHEN 'email' THEN interval '30 days' WHEN 'portal' THEN interval '14 days' ELSE interval '1 day' END;
    SELECT cv.id, cv.channel, cv.customer_id, cv.customer_candidate_id, cv.service_case_id, cv.case_candidate_id, cv.urgency, cv.status INTO v_th
      FROM public.conversations cv
     WHERE cv.thread_key = v_thread AND cv.status NOT IN ('handled','spam') AND cv.channel = v_channel
       AND cv.last_at > now() - v_window
       -- bekræftet kunde-konflikt → ny henvendelse
       AND (v_confirmed IS NULL OR cv.customer_id IS NOT DISTINCT FROM v_confirmed)
       -- bekræftet sags-konflikt → ny henvendelse (en henvendelse uden sag kan få kildens bekræftede sag, se nedenfor)
       AND (v_case IS NULL OR cv.service_case_id IS NULL OR cv.service_case_id = v_case)
       -- kandidat-konflikt (fx en anden kunde svarer i tråden) → ny henvendelse
       AND (v_candidate IS NULL OR coalesce(cv.customer_id, cv.customer_candidate_id) IS NULL
            OR coalesce(cv.customer_id, cv.customer_candidate_id) = v_candidate)
     ORDER BY cv.last_at DESC LIMIT 1;
    IF FOUND THEN
      IF NOT v_bg AND NOT public.conversation_visible(v_th.channel, v_th.customer_id, v_th.customer_candidate_id) THEN
        RAISE EXCEPTION 'reception_ingest: kilden findes ikke eller er skjult for dig' USING ERRCODE = 'insufficient_privilege';
      END IF;
      v_append := true; v_conv := v_th.id;
      -- Kildens BEKRÆFTEDE sag (manuelt koblet, samme kunde — sikret af betingelserne ovenfor) gives til en henvendelse
      -- uden sag. En eksisterende sag overskrives aldrig (konflikt giver ny henvendelse ovenfor).
      IF v_case IS NOT NULL AND v_th.service_case_id IS NULL AND v_th.customer_id IS NOT NULL THEN
        UPDATE public.conversations SET service_case_id = v_case, case_candidate_id = NULL, case_match_state = 'confirmed',
          match_version = match_version + 1 WHERE id = v_conv;
        v_th.service_case_id := v_case;
      END IF;
      v_confirmed := v_th.customer_id; v_candidate := v_th.customer_candidate_id;
      v_case := v_th.service_case_id; v_case_cand := v_th.case_candidate_id;
    ELSIF v_dir = 'outbound' THEN
      RAISE EXCEPTION 'reception_ingest: udgående besked uden åben tråd' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  ELSIF v_dir = 'outbound' AND v_table = 'web_chat_messages' THEN
    RAISE EXCEPTION 'reception_ingest: udgående besked uden åben tråd' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM set_config('reception.ingest', 'on', true);

  IF v_dup OR v_append THEN
    -- Et senere indtag/tråd-item kan aldrig SÆNKE noget, men kan HÆVE hastegrad og kræve handoff (kun indgående)
    IF v_dir = 'inbound' THEN
      SELECT cv.urgency, cv.status INTO v_existing FROM public.conversations cv WHERE cv.id = v_conv;
      IF array_position(ARRAY['low','normal','high','emergency'], v_urgency) > array_position(ARRAY['low','normal','high','emergency'], v_existing.urgency)
         OR (v_status = 'handoff' AND v_existing.status NOT IN ('handoff','handled'))
         OR (v_append AND v_existing.status = 'awaiting_customer') THEN
        UPDATE public.conversations SET
          urgency = CASE WHEN array_position(ARRAY['low','normal','high','emergency'], v_urgency) > array_position(ARRAY['low','normal','high','emergency'], urgency) THEN v_urgency ELSE urgency END,
          status = CASE WHEN v_status = 'handoff' AND status NOT IN ('handoff','handled') THEN 'handoff'
                        WHEN v_append AND status = 'awaiting_customer' THEN 'open' ELSE status END,
          handoff_reasons = (SELECT coalesce(array_agg(DISTINCT x), '{}') FROM unnest(handoff_reasons || coalesce(ARRAY(SELECT y FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p->'handoff_reasons') = 'array' THEN p->'handoff_reasons' ELSE '[]'::jsonb END) y WHERE y ~ '^[a-z_]{1,40}$' LIMIT 20), '{}')) x)
        WHERE id = v_conv;
        v_raised := true;
      END IF;
    END IF;
  END IF;

  IF v_append THEN
    INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, provider_event_id, source_table, source_id, occurred_at,
      title, body_preview, sender_label, transcript_status, dedupe_key, created_by)
    VALUES (v_conv, v_channel, v_dir, v_provider, v_event, v_table, v_sid, v_occ,
      left(coalesce(nullif(btrim(p->>'item_title'), ''), nullif(btrim(p->>'title'), '')), 200), left(nullif(p->>'preview', ''), 500),
      left(nullif(p->>'sender_label', ''), 200),
      CASE WHEN p->>'transcript_status' IN ('not_applicable','pending','unavailable') THEN p->>'transcript_status' ELSE 'not_applicable' END,
      v_key, CASE WHEN v_bg THEN NULL ELSE v_uid END)
    RETURNING id INTO v_item;
    UPDATE public.conversations SET last_at = greatest(last_at, v_occ) WHERE id = v_conv;
  ELSIF NOT v_dup THEN
    v_team := CASE WHEN p->>'assigned_team' IN ('kontor','service','salg','bogholderi','montor') THEN p->>'assigned_team' END;
    v_intent := CASE WHEN coalesce(p->>'intent', '') ~ '^[a-z_]{1,40}$' THEN p->>'intent' END;
    v_conf := CASE WHEN jsonb_typeof(p->'ai_confidence') = 'number' THEN round(greatest(0, least(1, (p->>'ai_confidence')::numeric)), 2) END;

    INSERT INTO public.conversations (channel, status, title, ai_summary, intent, urgency, ai_confidence, customer_id, customer_candidate_id,
      customer_match_state, candidate_count, service_case_id, case_candidate_id, case_match_state, assigned_team, next_action, handoff_reasons,
      dedupe_key, thread_key, intake_actor, first_at, last_at, created_by)
    VALUES (v_channel, v_status, left(coalesce(nullif(btrim(p->>'title'), ''), 'Henvendelse'), 200), left(nullif(p->>'ai_summary', ''), 2000),
      v_intent, v_urgency, v_conf, v_confirmed, v_candidate, v_state,
      CASE WHEN v_confirmed IS NOT NULL OR v_candidate IS NOT NULL THEN 1
           WHEN jsonb_typeof(p->'candidate_count') = 'number' THEN greatest(0, least(1000, (p->>'candidate_count')::int)) ELSE 0 END,
      v_case, v_case_cand, v_case_state, v_team, left(nullif(p->>'next_action', ''), 300),
      coalesce(ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p->'handoff_reasons') = 'array' THEN p->'handoff_reasons' ELSE '[]'::jsonb END) x
                     WHERE x ~ '^[a-z_]{1,40}$' LIMIT 20), '{}'),
      v_key, v_thread, CASE WHEN v_bg THEN 'ai_receptionist' ELSE 'user' END, v_occ, v_occ, CASE WHEN v_bg THEN NULL ELSE v_uid END)
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

  -- AI-forslag (kun for indgående). Tråd-items og dubletter: kun forslag. Baggrundsaktøren: ALT er forslag.
  IF v_dir = 'inbound' THEN
  FOR a IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p->'actions') = 'array' THEN p->'actions' ELSE '[]'::jsonb END) LIMIT 30 LOOP
    v_type := a->>'action_type';
    v_idem := a->>'idempotency_key';
    CONTINUE WHEN coalesce(v_type, '') !~ '^[a-z_]{1,40}$' OR coalesce(char_length(v_idem), 0) NOT BETWEEN 3 AND 300;
    v_out := CASE WHEN a->>'policy_outcome' IN ('auto','proposal','handoff','forbidden') THEN a->>'policy_outcome' ELSE 'forbidden' END;
    IF NOT (v_type = ANY (v_known)) THEN v_out := 'forbidden'; END IF;
    v_astate := CASE WHEN v_out IN ('forbidden','handoff') THEN 'blocked'
                     WHEN v_out = 'auto' AND NOT v_bg AND NOT v_dup AND NOT v_append AND a->'execute' = 'true'::jsonb AND v_type = ANY (v_auto_exec) THEN 'approved'
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
  END IF;

  IF v_dup AND NOT v_raised AND v_added = 0 THEN
    PERFORM set_config('reception.ingest', 'off', true);
    RETURN jsonb_build_object('outcome', 'duplicate', 'conversation_id', v_conv, 'item_id', v_item, 'actions', v_actions, 'raised', false);
  END IF;
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
  VALUES (CASE WHEN v_bg THEN NULL ELSE v_uid END, 'conversation', v_conv,
    CASE WHEN v_dup THEN 'conversation_ingest_merged' WHEN v_append THEN 'conversation_item_appended' ELSE 'conversation_ingested' END,
    CASE WHEN v_dup THEN 'Henvendelse opdateret ved nyt indtag (' || v_channel || ')'
         WHEN v_append THEN 'Ny besked i henvendelsens tråd (' || v_channel || ')' ELSE 'Henvendelse indtaget (' || v_channel || ')' END,
    jsonb_build_object('actor', 'ai_receptionist', 'mode', CASE WHEN v_bg THEN 'background' ELSE 'on_behalf_of_user' END,
                       'on_behalf_of', CASE WHEN v_bg THEN NULL ELSE v_uid END, 'source_table', v_table, 'channel', v_channel,
                       'direction', v_dir, 'urgency', v_urgency, 'customer_match_state', v_state, 'actions', v_added, 'raised', v_raised,
                       'threaded', v_append));

  PERFORM set_config('reception.ingest', 'off', true);
  RETURN jsonb_build_object('outcome', CASE WHEN v_dup THEN 'duplicate' WHEN v_append THEN 'appended' ELSE 'created' END,
                            'conversation_id', v_conv, 'item_id', v_item, 'actions', v_actions, 'raised', v_raised);
END $f$;

-- 9. RETENTION (kun service_role; standard DRY-RUN). Rydder KUN kopieret tekst i henvendelser — aldrig kanoniske kilder.
--    Politik (jsonb, alle valgfrie; klemt til sikre grænser):
--      handled_text_days      afsluttede henvendelser: items' uddrag/afsender/emne/vedhæftningsnavne      (standard 90, 7..3650)
--      handled_summary_days   afsluttede henvendelser: AI-resumé + titel (titel → "Henvendelse (Mail)")    (standard 180, 7..3650)
--      customer_deleted_days  kunden slettet: al kopieret tekst                                           (standard 0, 0..365)
--      orphan_source_days     kilden slettet: itemets kopierede tekst                                     (standard 0, 0..365)
--      transcripts            transskriptions-referencer efter transcript_purge_after                     (altid)
--    Åbne henvendelser ryddes aldrig (undtagen slettet kunde/kilde). Metadata (kilde-reference, status, tider, audit,
--    kunde/sag) bliver. Svar: antal pr. kategori (ingen indhold). apply=true auditeres i audit_logs.
CREATE FUNCTION public.reception_retention(p_policy jsonb DEFAULT '{}'::jsonb, p_apply boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_text int := greatest(7, least(3650, coalesce((p_policy->>'handled_text_days')::int, 90)));
  v_sum int := greatest(7, least(3650, coalesce((p_policy->>'handled_summary_days')::int, 180)));
  v_cust int := greatest(0, least(365, coalesce((p_policy->>'customer_deleted_days')::int, 0)));
  v_orph int := greatest(0, least(365, coalesce((p_policy->>'orphan_source_days')::int, 0)));
  n_orphan_mark int; n_items_handled int; n_conv_handled int; n_cust_conv int; n_cust_items int; n_orphan_items int; n_transcripts int;
  n_open int; n_case_deleted int; n_conflicts int;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'reception_retention: kun serveren' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Kilder der ikke findes længere (afledt, ikke gættet)
  SELECT count(*) INTO n_orphan_mark FROM public.conversation_items i
   WHERE i.source_missing_at IS NULL AND i.source_id IS NOT NULL AND (
     (i.source_table = 'incoming_emails' AND NOT EXISTS (SELECT 1 FROM public.incoming_emails x WHERE x.id = i.source_id))
     OR (i.source_table = 'portal_messages' AND NOT EXISTS (SELECT 1 FROM public.portal_messages x WHERE x.id = i.source_id))
     OR (i.source_table = 'telephony_calls' AND NOT EXISTS (SELECT 1 FROM public.telephony_calls x WHERE x.id = i.source_id))
     OR (i.source_table = 'web_chat_messages' AND NOT EXISTS (SELECT 1 FROM public.web_chat_messages x WHERE x.id = i.source_id))
     OR (i.source_table = 'customer_documents' AND NOT EXISTS (SELECT 1 FROM public.customer_documents x WHERE x.id = i.source_id)));
  SELECT count(*) INTO n_items_handled FROM public.conversation_items i JOIN public.conversations c ON c.id = i.conversation_id
   WHERE c.status = 'handled' AND c.handled_at < now() - make_interval(days => v_text) AND i.text_purged_at IS NULL;
  SELECT count(*) INTO n_conv_handled FROM public.conversations c
   WHERE c.status = 'handled' AND c.handled_at < now() - make_interval(days => v_sum) AND c.text_purged_at IS NULL;
  SELECT count(*) INTO n_cust_conv FROM public.conversations c
   WHERE c.customer_deleted_at IS NOT NULL AND c.customer_deleted_at <= now() - make_interval(days => v_cust) AND c.text_purged_at IS NULL;
  SELECT count(*) INTO n_cust_items FROM public.conversation_items i JOIN public.conversations c ON c.id = i.conversation_id
   WHERE c.customer_deleted_at IS NOT NULL AND c.customer_deleted_at <= now() - make_interval(days => v_cust) AND i.text_purged_at IS NULL;
  SELECT count(*) INTO n_orphan_items FROM public.conversation_items i
   WHERE i.source_missing_at IS NOT NULL AND i.source_missing_at <= now() - make_interval(days => v_orph) AND i.text_purged_at IS NULL;
  SELECT count(*) INTO n_transcripts FROM public.conversation_items i
   WHERE i.transcript_purge_after IS NOT NULL AND i.transcript_purge_after < now() AND i.transcript_status <> 'purged';
  SELECT count(*) INTO n_open FROM public.conversations c WHERE c.status NOT IN ('handled','spam');
  SELECT count(*) INTO n_case_deleted FROM public.conversations c WHERE c.case_deleted_at IS NOT NULL;
  -- Overvågning (final review §4): items hvis kilde er manuelt koblet til en ANDEN kunde end henvendelsens (skal være 0;
  -- afstemningen retter det i kildens transaktion — > 0 betyder en fejlet afstemning, se audit conversation_reconcile_failed)
  SELECT count(*) INTO n_conflicts FROM public.conversation_items i JOIN public.conversations c ON c.id = i.conversation_id
    JOIN public.incoming_emails e ON i.source_table = 'incoming_emails' AND e.id = i.source_id
   WHERE e.linked_by = 'manual' AND e.customer_id IS NOT NULL AND e.link_status::text <> 'ignored' AND c.customer_id IS DISTINCT FROM e.customer_id;

  IF p_apply THEN
    PERFORM set_config('reception.retention', 'on', true);
    UPDATE public.conversation_items i SET source_missing_at = now()
     WHERE i.source_missing_at IS NULL AND i.source_id IS NOT NULL AND (
       (i.source_table = 'incoming_emails' AND NOT EXISTS (SELECT 1 FROM public.incoming_emails x WHERE x.id = i.source_id))
       OR (i.source_table = 'portal_messages' AND NOT EXISTS (SELECT 1 FROM public.portal_messages x WHERE x.id = i.source_id))
       OR (i.source_table = 'telephony_calls' AND NOT EXISTS (SELECT 1 FROM public.telephony_calls x WHERE x.id = i.source_id))
       OR (i.source_table = 'web_chat_messages' AND NOT EXISTS (SELECT 1 FROM public.web_chat_messages x WHERE x.id = i.source_id))
       OR (i.source_table = 'customer_documents' AND NOT EXISTS (SELECT 1 FROM public.customer_documents x WHERE x.id = i.source_id)));
    -- items: afsluttet efter politik, kunde slettet, eller kilde slettet
    UPDATE public.conversation_items i SET title = NULL, body_preview = NULL, sender_label = NULL, attachment_refs = '[]'::jsonb, text_purged_at = now()
     WHERE i.text_purged_at IS NULL AND (
       EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = i.conversation_id AND c.status = 'handled' AND c.handled_at < now() - make_interval(days => v_text))
       OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = i.conversation_id AND c.customer_deleted_at IS NOT NULL AND c.customer_deleted_at <= now() - make_interval(days => v_cust))
       OR (i.source_missing_at IS NOT NULL AND i.source_missing_at <= now() - make_interval(days => v_orph)));
    UPDATE public.conversation_items i SET transcript_ref = NULL, transcript_status = 'purged'
     WHERE i.transcript_purge_after IS NOT NULL AND i.transcript_purge_after < now() AND i.transcript_status <> 'purged';
    UPDATE public.conversations c SET ai_summary = NULL, text_purged_at = now(),
      title = 'Henvendelse (' || CASE c.channel WHEN 'email' THEN 'Mail' WHEN 'portal' THEN 'Portal' WHEN 'web_chat' THEN 'Web-chat'
                                   WHEN 'phone' THEN 'Telefon' WHEN 'sms' THEN 'SMS' WHEN 'upload_link' THEN 'Upload' ELSE 'Andet' END || ')'
     WHERE c.text_purged_at IS NULL AND (
       (c.status = 'handled' AND c.handled_at < now() - make_interval(days => v_sum))
       OR (c.customer_deleted_at IS NOT NULL AND c.customer_deleted_at <= now() - make_interval(days => v_cust)));
    PERFORM set_config('reception.retention', 'off', true);
    INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
    VALUES (NULL, 'reception_retention', NULL, 'reception_retention_applied', 'Henvendelser: kopieret tekst ryddet efter politik',
      jsonb_build_object('handled_text_days', v_text, 'handled_summary_days', v_sum, 'customer_deleted_days', v_cust, 'orphan_source_days', v_orph,
        'items_handled', n_items_handled, 'conversations_handled', n_conv_handled, 'customer_deleted_conversations', n_cust_conv,
        'orphan_marked', n_orphan_mark, 'orphan_items', n_orphan_items, 'transcripts', n_transcripts));
  END IF;
  RETURN jsonb_build_object('applied', p_apply,
    'policy', jsonb_build_object('handled_text_days', v_text, 'handled_summary_days', v_sum, 'customer_deleted_days', v_cust, 'orphan_source_days', v_orph),
    'items_handled', n_items_handled, 'conversations_handled', n_conv_handled,
    'customer_deleted_conversations', n_cust_conv, 'customer_deleted_items', n_cust_items,
    'orphan_sources_unmarked', n_orphan_mark, 'orphan_items', n_orphan_items, 'transcripts', n_transcripts,
    'open_never_purged', n_open, 'case_deleted_marked', n_case_deleted, 'source_link_conflicts', n_conflicts);
END $f$;

-- 9b. KILDE → HENVENDELSE-AFSTEMNING (final review §4). Kun intern (trigger-markør) eller service_role.
--     Flytter et TRÅD-item (aldrig det primære) til sin egen henvendelse, når kildens menneskelige kobling ikke længere
--     passer til henvendelsen: ind i en åben henvendelse i samme tråd for kildens kunde, ellers en ny henvendelse.
CREATE FUNCTION public.reception_detach_item(p_item uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  i record; c record; v_src jsonb; v_conf uuid; v_case uuid; v_thread text; v_target uuid; v_window interval;
  v_uid uuid := auth.uid(); v_new boolean := false;
BEGIN
  IF current_setting('reception.reconcile', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'reception_detach_item: kun afstemningen' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO i FROM public.conversation_items WHERE id = p_item;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.conversations WHERE id = i.conversation_id;
  IF i.dedupe_key = c.dedupe_key THEN
    RAISE EXCEPTION 'reception_detach_item: det primære item flyttes ikke' USING ERRCODE = 'check_violation';
  END IF;
  v_src := public.reception_source_identity(i.source_table, i.source_id);
  IF NOT coalesce((v_src->>'ok')::boolean, false) OR (v_src->>'confirmed_customer') IS NULL THEN RETURN NULL; END IF;
  v_conf := (v_src->>'confirmed_customer')::uuid; v_case := (v_src->>'confirmed_case')::uuid; v_thread := v_src->>'thread_key';
  v_window := CASE i.channel WHEN 'email' THEN interval '30 days' WHEN 'portal' THEN interval '14 days' ELSE interval '1 day' END;
  DELETE FROM public.conversation_items WHERE id = i.id;
  PERFORM set_config('reception.ingest', 'on', true);
  IF v_thread IS NOT NULL THEN
    SELECT cv.id INTO v_target FROM public.conversations cv
     WHERE cv.thread_key = v_thread AND cv.channel = i.channel AND cv.id <> c.id AND cv.status NOT IN ('handled','spam')
       AND cv.last_at > now() - v_window AND cv.customer_id = v_conf
       AND (v_case IS NULL OR cv.service_case_id IS NULL OR cv.service_case_id = v_case)
     ORDER BY cv.last_at DESC LIMIT 1;
  END IF;
  IF v_target IS NULL THEN
    INSERT INTO public.conversations (channel, status, title, urgency, customer_id, customer_match_state, candidate_count, service_case_id,
      case_match_state, handoff_reasons, dedupe_key, thread_key, intake_actor, first_at, last_at, created_by)
    VALUES (i.channel, 'new', left(coalesce(nullif(btrim(i.title), ''), 'Henvendelse'), 200), c.urgency, v_conf, 'confirmed', 1, v_case,
      CASE WHEN v_case IS NOT NULL THEN 'confirmed' ELSE 'not_applicable' END, ARRAY['source_relinked'],
      i.dedupe_key, v_thread, CASE WHEN v_uid IS NULL THEN 'ai_receptionist' ELSE 'user' END, i.occurred_at, i.occurred_at, v_uid)
    RETURNING id INTO v_target;
    v_new := true;
  ELSE
    UPDATE public.conversations SET last_at = greatest(last_at, i.occurred_at),
      status = CASE WHEN status = 'awaiting_customer' AND i.direction = 'inbound' THEN 'open' ELSE status END
     WHERE id = v_target;
  END IF;
  INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, provider_event_id, source_table, source_id, occurred_at,
    title, body_preview, sender_label, transcript_status, dedupe_key, created_by)
  VALUES (v_target, i.channel, i.direction, i.provider, i.provider_event_id, i.source_table, i.source_id, i.occurred_at,
    i.title, i.body_preview, i.sender_label, i.transcript_status, i.dedupe_key, i.created_by);
  PERFORM set_config('reception.ingest', 'off', true);
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
  VALUES (v_uid, 'conversation', c.id, 'conversation_item_detached', 'Besked flyttet til egen henvendelse (kilden koblet til anden kunde/sag)',
          jsonb_build_object('source_table', i.source_table, 'source_id', i.source_id, 'to_conversation', v_target, 'new_conversation', v_new)),
         (v_uid, 'conversation', v_target, CASE WHEN v_new THEN 'conversation_created_by_relink' ELSE 'conversation_item_appended' END,
          'Besked flyttet hertil efter manuel kobling af kilden',
          jsonb_build_object('source_table', i.source_table, 'source_id', i.source_id, 'from_conversation', c.id, 'customer', v_conf, 'case', v_case));
  RETURN v_target;
END $f$;

CREATE FUNCTION public.reception_reconcile_source(p_table text, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  i record; c record; x record; v_src jsonb; v_s2 jsonb; v_conf uuid; v_case uuid; v_cand uuid; v_newcase uuid;
  v_uid uuid := auth.uid(); v_outer text := current_setting('reception.reconcile', true); v_detached int := 0; v_out text := 'unchanged';
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND v_outer IS DISTINCT FROM 'on' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'reception_reconcile_source: kun serveren' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_table NOT IN ('incoming_emails','portal_messages','telephony_calls','web_chat_messages') OR p_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'unsupported');
  END IF;
  -- Samme lås som reception_ingest: et samtidigt indtag af samme kilde afsluttes først (eller venter på os)
  PERFORM pg_advisory_xact_lock(hashtextextended('reception_src:' || p_table || ':' || p_id::text, 250));
  SELECT ci.id, ci.conversation_id, ci.dedupe_key INTO i FROM public.conversation_items ci WHERE ci.source_table = p_table AND ci.source_id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_ingested'); END IF;
  v_src := public.reception_source_identity(p_table, p_id);
  IF NOT coalesce((v_src->>'ok')::boolean, false) THEN RETURN jsonb_build_object('outcome', 'source_rejected', 'reason', v_src->>'reason'); END IF;
  SELECT * INTO c FROM public.conversations WHERE id = i.conversation_id FOR UPDATE;
  v_conf := (v_src->>'confirmed_customer')::uuid; v_case := (v_src->>'confirmed_case')::uuid; v_cand := (v_src->>'candidate')::uuid;
  PERFORM set_config('reception.reconcile', 'on', true);

  IF i.dedupe_key = c.dedupe_key THEN
    IF v_conf IS NULL THEN
      -- Ingen menneskelig kobling på kilden: kun en UBEKRÆFTET henvendelse følger kildens (automatiske) kandidat
      IF c.customer_id IS NULL AND v_cand IS NOT NULL AND c.customer_candidate_id IS DISTINCT FROM v_cand THEN
        UPDATE public.conversations SET customer_candidate_id = v_cand, customer_match_state = 'unique_match', candidate_count = 1,
          case_candidate_id = CASE WHEN EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = c.case_candidate_id AND s.customer_id = v_cand) THEN c.case_candidate_id END,
          match_version = match_version + 1
         WHERE id = c.id;
        v_out := 'candidate_refreshed';
      END IF;
    ELSIF c.customer_id IS DISTINCT FROM v_conf OR (v_case IS NOT NULL AND c.service_case_id IS DISTINCT FROM v_case) THEN
      -- Kildens menneskelige kobling vinder; en sag gættes aldrig (kildens bekræftede sag, ellers den nuværende hvis den
      -- tilhører samme kunde, ellers ingen)
      v_newcase := coalesce(v_case, CASE WHEN c.customer_id = v_conf THEN c.service_case_id END);
      UPDATE public.conversations SET customer_id = v_conf, customer_candidate_id = NULL, customer_match_state = 'confirmed', candidate_count = 1,
        contact_id = CASE WHEN c.customer_id = v_conf THEN contact_id END,
        service_case_id = v_newcase,
        case_candidate_id = CASE WHEN v_newcase IS NULL AND EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = c.case_candidate_id AND s.customer_id = v_conf) THEN c.case_candidate_id END,
        case_match_state = CASE WHEN v_newcase IS NOT NULL THEN 'confirmed' WHEN c.customer_id = v_conf THEN c.case_match_state ELSE 'not_applicable' END,
        match_version = match_version + 1
       WHERE id = c.id;
      v_out := 'relinked';
    END IF;
    -- Tråd-items hvis kilde er manuelt koblet til en anden kunde (eller anden sag) end henvendelsens, kan ikke blive
    IF v_conf IS NOT NULL THEN
      FOR x IN SELECT ci.id, ci.source_table, ci.source_id FROM public.conversation_items ci
                WHERE ci.conversation_id = c.id AND ci.id <> i.id AND ci.source_id IS NOT NULL
                  AND ci.source_table IN ('incoming_emails','portal_messages','telephony_calls','web_chat_messages') LOOP
        v_s2 := public.reception_source_identity(x.source_table, x.source_id);
        IF coalesce((v_s2->>'ok')::boolean, false) AND (v_s2->>'confirmed_customer') IS NOT NULL
           AND ((v_s2->>'confirmed_customer')::uuid <> v_conf
                OR ((v_s2->>'confirmed_case') IS NOT NULL AND v_newcase IS NOT NULL AND (v_s2->>'confirmed_case')::uuid <> v_newcase)) THEN
          PERFORM public.reception_detach_item(x.id); v_detached := v_detached + 1;
        END IF;
      END LOOP;
    END IF;
  ELSIF v_conf IS NOT NULL THEN
    IF c.customer_id IS DISTINCT FROM v_conf OR (v_case IS NOT NULL AND c.service_case_id IS NOT NULL AND c.service_case_id <> v_case) THEN
      PERFORM public.reception_detach_item(i.id); v_detached := 1; v_out := 'detached';
    ELSIF v_case IS NOT NULL AND c.service_case_id IS NULL THEN
      UPDATE public.conversations SET service_case_id = v_case, case_candidate_id = NULL, case_match_state = 'confirmed', match_version = match_version + 1
       WHERE id = c.id;
      v_out := 'case_confirmed';
    END IF;
  END IF;

  IF v_out <> 'unchanged' OR v_detached > 0 THEN
    INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
    VALUES (v_uid, 'conversation', c.id, 'conversation_source_reconciled', 'Henvendelsen afstemt med kildens kobling (menneskelig beslutning på kilden)',
      jsonb_build_object('source_table', p_table, 'source_id', p_id, 'outcome', v_out, 'detached', v_detached,
        'previous_customer', c.customer_id, 'previous_candidate', c.customer_candidate_id, 'previous_case', c.service_case_id,
        'customer', v_conf, 'case', coalesce(v_newcase, v_case)));
  END IF;
  PERFORM set_config('reception.reconcile', coalesce(v_outer, 'off'), true);
  RETURN jsonb_build_object('outcome', v_out, 'conversation_id', c.id, 'detached', v_detached);
END $f$;

-- Trigger på den kanoniske mail: ændring af kunde/sag/koblingstype afstemmes i SAMME transaktion. Ingen henvendelse → no-op.
-- Fejl vælter aldrig koblingen i indbakken (subtransaktion; auditeret uden personværdier).
CREATE FUNCTION public.incoming_emails_reception_reconcile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  -- Ikke indtaget OG intet indtag i gang (låsen er fri → vi holder den til transaktionens slutning, så et senere indtag
  -- læser den nye kobling) → intet at afstemme. Er låsen optaget af et igangværende indtag, venter afstemningen på det.
  IF NOT EXISTS (SELECT 1 FROM public.conversation_items WHERE source_table = 'incoming_emails' AND source_id = NEW.id)
     AND pg_try_advisory_xact_lock(hashtextextended('reception_src:incoming_emails:' || NEW.id::text, 250)) THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM set_config('reception.reconcile', 'on', true);
    PERFORM public.reception_reconcile_source('incoming_emails', NEW.id);
    PERFORM set_config('reception.reconcile', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, metadata)
    VALUES (auth.uid(), 'incoming_email', NEW.id, 'conversation_reconcile_failed', 'Henvendelsen kunne ikke afstemmes med mailens kobling',
            jsonb_build_object('sqlstate', SQLSTATE));
  END;
  RETURN NULL;
END $f$;
CREATE TRIGGER trg_incoming_emails_reception_reconcile AFTER UPDATE OF customer_id, service_case_id, linked_by ON public.incoming_emails
  FOR EACH ROW WHEN (OLD.customer_id IS DISTINCT FROM NEW.customer_id OR OLD.service_case_id IS DISTINCT FROM NEW.service_case_id
                     OR OLD.linked_by IS DISTINCT FROM NEW.linked_by)
  EXECUTE FUNCTION public.incoming_emails_reception_reconcile();

-- 9c. WEB-CHAT MISBRUGSVÆRN (final review §3). Holdbart (fælles på tværs af serverless-instanser), kun service_role.
--     key_hash = HMAC-SHA256(serverhemmelighed, IP) i hex — IP'en gemmes ALDRIG; 'global' = samlet loft pr. scope.
--     Spande pr. minut; rullende time = summen af de sidste 60 minutter. Rækker ældre end 2 timer slettes løbende.
CREATE TABLE public.web_chat_rate_limits (
  key_hash text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$' OR key_hash = 'global'),
  scope    text NOT NULL CHECK (scope IN ('start','message')),
  bucket   timestamptz NOT NULL,
  hits     integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY (key_hash, scope, bucket)
);
CREATE INDEX web_chat_rate_limits_bucket ON public.web_chat_rate_limits (bucket);
ALTER TABLE public.web_chat_rate_limits ENABLE ROW LEVEL SECURITY;
-- Ingen API-rolle (heller ikke service_role) rører tabellen direkte — kun web_chat_rate_check (SECURITY DEFINER)
REVOKE ALL ON public.web_chat_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.web_chat_rate_check(p_key text, p_scope text, p_burst integer, p_hour integer, p_global_hour integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_min timestamptz := date_trunc('minute', now());
  v_burst int; v_hour int; v_glob int;
  b int := greatest(1, least(100, coalesce(p_burst, 1)));
  h int := greatest(1, least(1000, coalesce(p_hour, 1)));
  g int := greatest(1, least(100000, coalesce(p_global_hour, 1)));
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'web_chat_rate_check: kun serveren' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(p_key, '') !~ '^[0-9a-f]{64}$' OR coalesce(p_scope, '') NOT IN ('start','message') THEN
    RAISE EXCEPTION 'web_chat_rate_check: ugyldig nøgle/scope' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Hvert forsøg tæller (også afviste) — at hamre forlænger blokeringen
  INSERT INTO public.web_chat_rate_limits AS r (key_hash, scope, bucket, hits) VALUES (p_key, p_scope, v_min, 1)
    ON CONFLICT (key_hash, scope, bucket) DO UPDATE SET hits = least(r.hits + 1, 1000000) RETURNING hits INTO v_burst;
  INSERT INTO public.web_chat_rate_limits AS r (key_hash, scope, bucket, hits) VALUES ('global', p_scope, v_min, 1)
    ON CONFLICT (key_hash, scope, bucket) DO UPDATE SET hits = least(r.hits + 1, 1000000);
  SELECT coalesce(sum(hits), 0) INTO v_hour FROM public.web_chat_rate_limits WHERE key_hash = p_key AND scope = p_scope AND bucket > now() - interval '60 minutes';
  SELECT coalesce(sum(hits), 0) INTO v_glob FROM public.web_chat_rate_limits WHERE key_hash = 'global' AND scope = p_scope AND bucket > now() - interval '60 minutes';
  DELETE FROM public.web_chat_rate_limits WHERE ctid = ANY (ARRAY(SELECT ctid FROM public.web_chat_rate_limits WHERE bucket < now() - interval '2 hours' LIMIT 200));
  RETURN jsonb_build_object('allowed', v_burst <= b AND v_hour <= h AND v_glob <= g,
    'reason', CASE WHEN v_burst > b THEN 'burst' WHEN v_hour > h THEN 'hour' WHEN v_glob > g THEN 'global' END);
END $f$;

-- 10. Funktions-ACL
-- udflytning kaldes KUN af reception_reconcile_source (definer) — ingen API-rolle, heller ikke service_role
REVOKE ALL ON FUNCTION public.reception_detach_item(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reception_reconcile_source(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reception_reconcile_source(text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.incoming_emails_reception_reconcile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.web_chat_rate_check(text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_chat_rate_check(text, text, integer, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.conversation_items_update_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reception_retention(jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reception_retention(jsonb, boolean) TO service_role;
-- CREATE OR REPLACE bevarer ACL'en fra 00249 på de genskabte funktioner (reception_ingest: authenticated + service_role;
-- værn og kilde-funktioner: ingen EXECUTE for PUBLIC/anon/authenticated). Prøven bekræfter ACL'en efter anvendelse.

-- 11. RLS for web-chat: medarbejdere læser KUN beskeder, der er indtaget i en henvendelse de selv kan se.
ALTER TABLE public.web_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY web_chat_messages_select ON public.web_chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversation_items i WHERE i.source_table = 'web_chat_messages' AND i.source_id = web_chat_messages.id));
CREATE POLICY web_chat_sessions_select ON public.web_chat_sessions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.web_chat_messages m WHERE m.session_id = web_chat_sessions.id));
REVOKE ALL ON public.web_chat_sessions, public.web_chat_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.web_chat_messages TO authenticated;
GRANT SELECT (id, visitor_name, visitor_phone, visitor_email, visitor_postal_code, visitor_address, topic, message_count, closed_at, created_at, last_at)
  ON public.web_chat_sessions TO authenticated;
GRANT ALL ON public.web_chat_sessions, public.web_chat_messages TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ROLLBACK: docs/runbooks/sql/00250_rollback.sql (genskaber 00249-funktionerne præcist; fjerner kolonner/tabeller/værn).
-- Henvendelsers tråd-items og web-chat-data går tabt (kun 00250-data); kanoniske kilder og 00249-data bevares.
