-- 00250 ROLLBACK (genereret af scripts/test-harness/reception-00250-probe.ts — RET IKKE I HÅNDEN).
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
DROP TRIGGER IF EXISTS trg_incoming_emails_reception_reconcile ON public.incoming_emails;
DROP FUNCTION IF EXISTS public.incoming_emails_reception_reconcile();
DROP FUNCTION IF EXISTS public.reception_reconcile_source(text, uuid);
DROP FUNCTION IF EXISTS public.reception_detach_item(uuid);
DROP FUNCTION IF EXISTS public.web_chat_rate_check(text, text, integer, integer, integer);
DROP TABLE IF EXISTS public.web_chat_messages, public.web_chat_sessions, public.web_chat_rate_limits;
DROP FUNCTION IF EXISTS public.reception_retention(jsonb, boolean);
DROP TRIGGER IF EXISTS trg_conversation_items_update_guard ON public.conversation_items;
DROP FUNCTION IF EXISTS public.conversation_items_update_guard();
CREATE OR REPLACE FUNCTION public.reception_source_identity(p_table text, p_id uuid) RETURNS jsonb
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

CREATE OR REPLACE FUNCTION public.conversations_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
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

CREATE OR REPLACE FUNCTION public.conversation_items_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
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

CREATE OR REPLACE FUNCTION public.reception_ingest(p jsonb) RETURNS jsonb
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
