-- =====================================================================================================================
-- 00247 — telefoni-persistens (Relatel): telephony_calls + telephony_events + telephony_employee_links
--
-- STAGING FØRST. PROD KRÆVER SÆRSKILT GODKENDELSE (Henrik). Design: docs/runbooks/telephony-events-proposal.md
-- (10 låste beslutninger, Henrik 2026-11-03). Relatel, webhook-registrering, opkald, SMS og Telegram forbliver slået fra;
-- migrationen tænder intet — webhooken gemmer først, når koden kalder telephony_ingest_event (separat, flag-styret).
--
-- Låste regler, håndhævet i DATABASEN (ikke kun i appen):
--   1  Ubekræftede opkald (customer_id IS NULL) ses kun med calls.view_unmatched (standard admin/serviceleder)
--   2  Bekræftede: calls.view (standard admin/serviceleder/salg) OG kunden i læse-scope (customers.view.all ELLER
--      my_customer_scope_ids()). Montør har ingen calls.view som standard; tildelt ser montøren kun eget/relateret scope
--   3  Ubekræftede slettes efter 90 dage (telephony_purge_unconfirmed(), kaldes af oprydnings-cron)
--   4–6 Ingen kunde vælges automatisk: et nyt opkald kan ikke oprettes med kunde/sag (trigger); customer_id/
--      service_case_id sættes kun via telephony_set_call_match (menneske, match_source='human', matched_by, ny version);
--      telephony_ingest_event har ingen kunde-/sagsparametre; tvetydigt match bærer aldrig et forslag (trigger)
--   7–8 Lagring skriver KUN i telefoni-tabellerne (ingen opgave/tilbageringning/påmindelse/Telegram/SMS/kundemail)
--   9  Telefonsvarer: kun metadata (flag, varighed, udbyder-id) — ingen lyd-, URL- eller transskriptionskolonne
--   10 Rettelse: optimistisk lås (match_version) + audit_logs i SAMME transaktion som ændringen; kunde og sag er
--      separate handlinger (confirm / link_case / reject)
-- Idempotens: UNIQUE (provider, provider_event_id) + UNIQUE (provider, provider_call_id) + ON CONFLICT i én funktion;
-- hændelser flettes monotont (tidligste start/svar, seneste slut) → samme slutrække uanset rækkefølge.
-- Hændelser er uforanderlige (UPDATE afvises af trigger); ingen rå payload — kun SHA-256.
-- authenticated: kun SELECT på telephony_calls (RLS). Hændelser/koblinger/funktioner: kun service_role. anon: intet.
-- Test (staging): npx tsx scripts/test-harness/cli.ts tel-00247-probe (rollback-only) · tel-00247-state (read-only)
-- =====================================================================================================================
BEGIN;

-- 0. Forudsætninger
DO $guard$
BEGIN
  IF to_regprocedure('public.user_has_permission(text)') IS NULL OR to_regprocedure('public.my_customer_scope_ids()') IS NULL THEN
    RAISE EXCEPTION '00247: hjælpefunktioner mangler (00238/00240)';
  END IF;
  IF (SELECT count(*) FROM public.permission_catalog WHERE permission IN ('customers.view.all')) <> 1 THEN
    RAISE EXCEPTION '00247: forudsat nøgle customers.view.all mangler i permission_catalog';
  END IF;
  IF to_regclass('public.telephony_calls') IS NOT NULL OR to_regclass('public.telephony_events') IS NOT NULL
     OR to_regclass('public.telephony_employee_links') IS NOT NULL THEN
    RAISE EXCEPTION '00247: telefoni-tabeller findes allerede — kontrollér før kørsel';
  END IF;
END
$guard$;

-- 1. Medarbejder-kobling (Relatel-medarbejder-id → profil). Kun service-role (styres via server-handling, users.edit).
--    Ét udbyder-id peger på én profil; en profil har højst én AKTIV kobling pr. udbyder (inaktive bevares som historik).
CREATE TABLE public.telephony_employee_links (
  provider             text NOT NULL CHECK (provider = 'relatel'),
  provider_employee_id text NOT NULL CHECK (char_length(provider_employee_id) BETWEEN 1 AND 64),
  profile_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_employee_id)
);
CREATE UNIQUE INDEX telephony_employee_links_active_profile ON public.telephony_employee_links (provider, profile_id) WHERE is_active;

-- 2. Ét opkald = én række. Match, sag og medarbejder ligger her.
CREATE TABLE public.telephony_calls (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                   text NOT NULL CHECK (provider = 'relatel'),
  provider_call_id           text NOT NULL CHECK (char_length(provider_call_id) BETWEEN 1 AND 128),
  direction                  text CHECK (direction IN ('inbound', 'outbound')),
  -- normaliseret Relatel-format (landekode + nummer, kun cifre; lib/integrations/relatel/phone.ts toRelatelNumber)
  from_number_normalized     text CHECK (from_number_normalized ~ '^[0-9]{8,15}$'),
  to_number_normalized       text CHECK (to_number_normalized ~ '^[0-9]{8,15}$'),
  external_number_normalized text GENERATED ALWAYS AS (
                               CASE direction WHEN 'inbound' THEN from_number_normalized
                                              WHEN 'outbound' THEN to_number_normalized END) STORED,
  started_at                 timestamptz NOT NULL,
  answered_at                timestamptz,
  ended_at                   timestamptz,
  duration_seconds           integer CHECK (duration_seconds BETWEEN 0 AND 86400),
  -- telefonsvarer: KUN metadata (ingen lyd, URL eller transskription — kolonnerne findes bevidst ikke)
  has_voicemail              boolean NOT NULL DEFAULT false,
  voicemail_duration_seconds integer CHECK (voicemail_duration_seconds BETWEEN 0 AND 86400),
  provider_voicemail_id      text CHECK (char_length(provider_voicemail_id) BETWEEN 1 AND 128),
  status                     text GENERATED ALWAYS AS (
                               CASE WHEN has_voicemail THEN 'voicemail'
                                    WHEN ended_at IS NOT NULL AND answered_at IS NULL AND direction = 'inbound' THEN 'missed'
                                    WHEN ended_at IS NOT NULL THEN 'ended'
                                    WHEN answered_at IS NOT NULL THEN 'answered'
                                    ELSE 'ringing' END) STORED,
  -- ubesvaret indgående (inkl. telefonsvarer)
  missed                     boolean GENERATED ALWAYS AS (
                               coalesce(direction = 'inbound' AND answered_at IS NULL AND (ended_at IS NOT NULL OR has_voicemail), false)) STORED,
  provider_employee_id       text CHECK (char_length(provider_employee_id) BETWEEN 1 AND 64),
  employee_profile_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  match_status               text NOT NULL DEFAULT 'unmatched'
                               CHECK (match_status IN ('unmatched', 'suggested', 'ambiguous', 'confirmed', 'rejected')),
  suggested_customer_id      uuid REFERENCES public.customers(id) ON DELETE SET NULL,   -- KUN forslag, aldrig synlighed
  candidate_count            smallint NOT NULL DEFAULT 0 CHECK (candidate_count BETWEEN 0 AND 1000),
  customer_id                uuid REFERENCES public.customers(id) ON DELETE SET NULL,   -- KUN bekræftet af et menneske
  service_case_id            uuid REFERENCES public.service_cases(id) ON DELETE SET NULL,
  match_source               text CHECK (match_source IN ('human')),
  matched_by                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  matched_at                 timestamptz,
  match_version              integer NOT NULL DEFAULT 0 CHECK (match_version >= 0),     -- optimistisk lås for rettelser
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telephony_calls_provider_call_unique UNIQUE (provider, provider_call_id),
  CONSTRAINT telephony_calls_has_number CHECK (from_number_normalized IS NOT NULL OR to_number_normalized IS NOT NULL),
  CONSTRAINT telephony_calls_ambiguous_no_suggestion CHECK (match_status <> 'ambiguous' OR suggested_customer_id IS NULL)
);
-- NB: ingen CHECK "confirmed ⇔ customer_id": ON DELETE SET NULL på kunden ville så blokere sletning af kunden.
-- Triggeren nedenfor holder status/sag konsistente (FK-handlinger affyrer også BEFORE UPDATE-triggere).

CREATE INDEX idx_telephony_calls_customer ON public.telephony_calls (customer_id, started_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_telephony_calls_unconfirmed ON public.telephony_calls (started_at DESC) WHERE customer_id IS NULL;
CREATE INDEX idx_telephony_calls_external ON public.telephony_calls (external_number_normalized, started_at DESC);
CREATE INDEX idx_telephony_calls_case ON public.telephony_calls (service_case_id) WHERE service_case_id IS NOT NULL;
CREATE INDEX idx_telephony_calls_employee ON public.telephony_calls (employee_profile_id, started_at DESC) WHERE employee_profile_id IS NOT NULL;
CREATE INDEX idx_telephony_calls_suggested ON public.telephony_calls (suggested_customer_id) WHERE suggested_customer_id IS NOT NULL;

-- 3. Rå livscyklus (revision/fejlsøgning). Ingen payload gemmes — kun hash. Uforanderlig (kun DELETE via kaskade/oprydning).
CREATE TABLE public.telephony_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id           uuid NOT NULL REFERENCES public.telephony_calls(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider = 'relatel'),
  provider_event_id text NOT NULL CHECK (char_length(provider_event_id) BETWEEN 1 AND 160),
  event_type        text NOT NULL CHECK (event_type IN ('call.started', 'call.answered', 'call.missed', 'call.ended', 'voicemail.created')),
  schema_kind       text NOT NULL CHECK (schema_kind IN ('canonical', 'unverified_call')),
  occurred_at       timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  payload_sha256    text CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT telephony_events_provider_event_unique UNIQUE (provider, provider_event_id)
);
CREATE INDEX idx_telephony_events_call ON public.telephony_events (call_id, occurred_at);

CREATE FUNCTION public.telephony_events_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'telephony_events: hændelser er uforanderlige' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER telephony_events_immutable BEFORE UPDATE ON public.telephony_events
  FOR EACH ROW EXECUTE FUNCTION public.telephony_events_immutable();

-- 4. Konsistens og match-værn (affyres også af FK-handlinger, fx når en kunde/sag slettes)
CREATE FUNCTION public.telephony_calls_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- regel 4–6: et opkald oprettes aldrig med kunde, sag eller menneskelig bekræftelse
    IF NEW.customer_id IS NOT NULL OR NEW.service_case_id IS NOT NULL OR NEW.match_status = 'confirmed'
       OR NEW.match_source IS NOT NULL OR NEW.matched_by IS NOT NULL OR NEW.match_version <> 0 THEN
      RAISE EXCEPTION 'telephony_calls: et nyt opkald kan ikke være koblet til kunde/sag' USING ERRCODE = '23514';
    END IF;
  ELSE
    -- kunde/sag sat eller ændret til en værdi kræver en menneskelig bekræftelse med ny version (telephony_set_call_match).
    -- At MISTE koblingen (NULL, fx ved sletning af kunden) er altid tilladt.
    IF ((NEW.customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM OLD.customer_id)
        OR (NEW.service_case_id IS NOT NULL AND NEW.service_case_id IS DISTINCT FROM OLD.service_case_id))
       AND (NEW.match_source IS DISTINCT FROM 'human' OR NEW.matched_by IS NULL OR NEW.match_version <> OLD.match_version + 1) THEN
      RAISE EXCEPTION 'telephony_calls: kunde/sag kan kun sættes ved menneskelig bekræftelse' USING ERRCODE = '42501';
    END IF;
    IF NEW.match_version < OLD.match_version THEN
      RAISE EXCEPTION 'telephony_calls: match_version kan ikke gå baglæns' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.customer_id IS NULL THEN
    NEW.service_case_id := NULL;
    IF NEW.match_status = 'confirmed' THEN NEW.match_status := 'unmatched'; END IF;
  ELSE
    NEW.match_status := 'confirmed';
    -- direkte opslag (ikke case_belongs_to_customer(): den har kun EXECUTE for authenticated, og skrivere her er
    -- service_role/FK-handlinger)
    IF NEW.service_case_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.service_cases sc WHERE sc.id = NEW.service_case_id AND sc.customer_id = NEW.customer_id) THEN
        RAISE EXCEPTION 'telephony_calls: sagen hører ikke til kunden' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  -- forslag uden kunde (fx slettet foreslået kunde) er ikke længere et forslag; tvetydig bærer aldrig et forslag
  IF NEW.match_status = 'suggested' AND NEW.suggested_customer_id IS NULL THEN NEW.match_status := 'unmatched'; END IF;
  IF NEW.match_status = 'ambiguous' THEN NEW.suggested_customer_id := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER telephony_calls_guard BEFORE INSERT OR UPDATE ON public.telephony_calls
  FOR EACH ROW EXECUTE FUNCTION public.telephony_calls_guard();

-- 5. Idempotent modtagelse (én transaktion pr. hændelse). Kun service_role. Ingen kunde-/sagsparametre (regel 6).
--    outcome: created (ny hændelse flettet ind) · duplicate (samme hændelse igen — intet ændret) ·
--             conflict (samme hændelses-id med andet opkald eller anden payload-hash — intet ændret)
CREATE FUNCTION public.telephony_ingest_event(
  p_provider text, p_provider_event_id text, p_provider_call_id text, p_event_type text, p_schema_kind text,
  p_occurred_at timestamptz, p_direction text, p_from text, p_to text, p_duration integer, p_answered boolean,
  p_has_voicemail boolean, p_voicemail_duration integer, p_provider_voicemail_id text, p_provider_employee_id text,
  p_payload_sha256 text
) RETURNS TABLE (outcome text, call_id uuid)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_created uuid;
  v_event uuid;
  c public.telephony_calls%ROWTYPE;
  e record;
  v_is_end boolean := p_event_type IN ('call.ended', 'call.missed');
  v_emp text;
  v_profile uuid;
BEGIN
  IF p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'telephony_ingest_event: occurred_at mangler' USING ERRCODE = '23502';
  END IF;

  -- a) opkaldet. Samtidige første-hændelser for samme opkald serialiseres af det unikke indeks (den anden venter og
  --    får DO NOTHING), og rækkelåsen nedenfor serialiserer fletningen.
  INSERT INTO public.telephony_calls AS t (provider, provider_call_id, direction, from_number_normalized, to_number_normalized, started_at)
  VALUES (p_provider, p_provider_call_id, p_direction, p_from, p_to, p_occurred_at)
  ON CONFLICT ON CONSTRAINT telephony_calls_provider_call_unique DO NOTHING
  RETURNING t.id INTO v_created;
  SELECT * INTO c FROM public.telephony_calls x
   WHERE x.provider = p_provider AND x.provider_call_id = p_provider_call_id FOR UPDATE;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'telephony_ingest_event: opkaldet blev ikke fundet efter indsættelse — prøv igen' USING ERRCODE = '40001';
  END IF;

  -- b) hændelsen. Samme (provider, provider_event_id) to gange → kun én række (DB-håndhævet).
  INSERT INTO public.telephony_events AS t (call_id, provider, provider_event_id, event_type, schema_kind, occurred_at, payload_sha256)
  VALUES (c.id, p_provider, p_provider_event_id, p_event_type, p_schema_kind, p_occurred_at, p_payload_sha256)
  ON CONFLICT ON CONSTRAINT telephony_events_provider_event_unique DO NOTHING
  RETURNING t.id INTO v_event;
  IF v_event IS NULL THEN
    SELECT x.call_id, x.payload_sha256 INTO e FROM public.telephony_events x
     WHERE x.provider = p_provider AND x.provider_event_id = p_provider_event_id;
    -- en gentaget hændelse må aldrig efterlade et nyt opkald
    IF v_created IS NOT NULL THEN DELETE FROM public.telephony_calls x WHERE x.id = v_created; END IF;
    IF e.call_id IS DISTINCT FROM c.id
       OR (e.payload_sha256 IS NOT NULL AND p_payload_sha256 IS NOT NULL AND e.payload_sha256 <> p_payload_sha256) THEN
      RETURN QUERY SELECT 'conflict'::text, e.call_id;
    ELSE
      RETURN QUERY SELECT 'duplicate'::text, e.call_id;
    END IF;
    RETURN;
  END IF;

  -- c) monoton fletning: tidligste start/svar, seneste slut; varighed fra den seneste slut-hændelse.
  --    Medarbejder: den der svarede vinder; ellers første kendte.
  v_emp := c.provider_employee_id;
  IF p_provider_employee_id IS NOT NULL AND (v_emp IS NULL OR p_event_type = 'call.answered') THEN
    v_emp := p_provider_employee_id;
  END IF;
  IF v_emp IS NOT DISTINCT FROM c.provider_employee_id AND c.employee_profile_id IS NOT NULL THEN
    v_profile := c.employee_profile_id;
  ELSE
    -- kun aktiv kobling til en aktiv profil; ukendt id → ingen profil (aldrig gæt på navn)
    SELECT l.profile_id INTO v_profile FROM public.telephony_employee_links l
      JOIN public.profiles pr ON pr.id = l.profile_id AND pr.is_active IS NOT FALSE
     WHERE l.provider = p_provider AND l.provider_employee_id = v_emp AND l.is_active;
  END IF;

  UPDATE public.telephony_calls x SET
    direction                  = coalesce(x.direction, p_direction),
    from_number_normalized     = coalesce(x.from_number_normalized, p_from),
    to_number_normalized       = coalesce(x.to_number_normalized, p_to),
    started_at                 = least(x.started_at, p_occurred_at),
    answered_at                = CASE WHEN p_event_type = 'call.answered' OR p_answered IS TRUE
                                      THEN least(coalesce(x.answered_at, p_occurred_at), p_occurred_at) ELSE x.answered_at END,
    ended_at                   = CASE WHEN v_is_end THEN greatest(coalesce(x.ended_at, p_occurred_at), p_occurred_at) ELSE x.ended_at END,
    duration_seconds           = CASE WHEN v_is_end AND (x.ended_at IS NULL OR p_occurred_at >= x.ended_at)
                                      THEN coalesce(p_duration, x.duration_seconds)
                                      ELSE coalesce(x.duration_seconds, p_duration) END,
    has_voicemail              = x.has_voicemail OR coalesce(p_has_voicemail, false) OR p_event_type = 'voicemail.created',
    voicemail_duration_seconds = greatest(x.voicemail_duration_seconds, p_voicemail_duration),
    provider_voicemail_id      = coalesce(x.provider_voicemail_id, p_provider_voicemail_id),
    provider_employee_id       = v_emp,
    employee_profile_id        = v_profile,
    updated_at                 = now()
  WHERE x.id = c.id;
  RETURN QUERY SELECT 'created'::text, c.id;
END $$;

-- 6. Menneskelige handlinger (regel 4, 10). Kun service_role — server-handlingen har forinden tjekket calls.match og at
--    brugeren kan se opkaldet, kunden og sagen med sin egen klient (RLS, effektive rettigheder).
--    Kunde og sag er SEPARATE handlinger:
--      confirm   kunde (ingen sag; en ændret kunde fjerner en tidligere sag)  → confirmed | corrected | unchanged
--      link_case sag (eller NULL = fjern) på den ALLEREDE bekræftede kunde p_customer_id; sagen skal høre til kunden
--                (trigger)                                                     → case_linked | case_unlinked | unchanged
--      reject    fjern forkert match/forslag (kunde, sag og forslag NULL; foreslås ikke igen) → rejected | unchanged
--    Optimistisk lås: p_expected_version skal være opkaldets aktuelle match_version, ellers 'stale' og intet ændres
--    (også når den bekræftede kunde ikke længere er p_customer_id ved link_case).
--    Ændring og audit_logs-række skrives i samme transaktion (kun id'er — ingen numre). not_found hvis opkaldet mangler.
CREATE FUNCTION public.telephony_set_call_match(
  p_call_id uuid, p_expected_version integer, p_action text, p_customer_id uuid, p_service_case_id uuid, p_actor uuid
) RETURNS TABLE (outcome text, match_version integer)
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  c public.telephony_calls%ROWTYPE;
  v_outcome text;
  v_new_customer uuid;
  v_new_case uuid;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('confirm', 'link_case', 'reject') THEN
    RAISE EXCEPTION 'telephony_set_call_match: ukendt handling' USING ERRCODE = '22023';
  END IF;
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_actor AND pr.is_active IS NOT FALSE) THEN
    RAISE EXCEPTION 'telephony_set_call_match: ukendt eller inaktiv bruger' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'confirm' AND (p_customer_id IS NULL OR p_service_case_id IS NOT NULL) THEN
    RAISE EXCEPTION 'telephony_set_call_match: bekræftelse kræver en kunde og tager ingen sag (sag kobles separat)' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'link_case' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'telephony_set_call_match: sag kræver den bekræftede kunde' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'reject' AND (p_customer_id IS NOT NULL OR p_service_case_id IS NOT NULL) THEN
    RAISE EXCEPTION 'telephony_set_call_match: afvisning tager ingen kunde/sag' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO c FROM public.telephony_calls x WHERE x.id = p_call_id FOR UPDATE;
  IF c.id IS NULL THEN RETURN QUERY SELECT 'not_found'::text, NULL::integer; RETURN; END IF;
  IF c.match_version <> p_expected_version THEN RETURN QUERY SELECT 'stale'::text, c.match_version; RETURN; END IF;

  IF p_action = 'confirm' THEN
    IF c.customer_id IS NOT DISTINCT FROM p_customer_id THEN RETURN QUERY SELECT 'unchanged'::text, c.match_version; RETURN; END IF;
    v_outcome := CASE WHEN c.customer_id IS NULL THEN 'confirmed' ELSE 'corrected' END;
    v_new_customer := p_customer_id; v_new_case := NULL;
    UPDATE public.telephony_calls x SET customer_id = p_customer_id, service_case_id = NULL,
      match_source = 'human', matched_by = p_actor, matched_at = now(), match_version = c.match_version + 1, updated_at = now()
    WHERE x.id = c.id;
  ELSIF p_action = 'link_case' THEN
    IF c.customer_id IS DISTINCT FROM p_customer_id THEN RETURN QUERY SELECT 'stale'::text, c.match_version; RETURN; END IF;
    IF c.service_case_id IS NOT DISTINCT FROM p_service_case_id THEN RETURN QUERY SELECT 'unchanged'::text, c.match_version; RETURN; END IF;
    v_outcome := CASE WHEN p_service_case_id IS NULL THEN 'case_unlinked' ELSE 'case_linked' END;
    v_new_customer := c.customer_id; v_new_case := p_service_case_id;
    UPDATE public.telephony_calls x SET service_case_id = p_service_case_id,
      match_source = 'human', matched_by = p_actor, matched_at = now(), match_version = c.match_version + 1, updated_at = now()
    WHERE x.id = c.id;
  ELSE
    IF c.match_status = 'rejected' AND c.customer_id IS NULL THEN RETURN QUERY SELECT 'unchanged'::text, c.match_version; RETURN; END IF;
    v_outcome := 'rejected';
    v_new_customer := NULL; v_new_case := NULL;
    UPDATE public.telephony_calls x SET customer_id = NULL, service_case_id = NULL, suggested_customer_id = NULL,
      match_status = 'rejected', match_source = 'human', matched_by = p_actor, matched_at = now(),
      match_version = c.match_version + 1, updated_at = now()
    WHERE x.id = c.id;
  END IF;

  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, action_description, changes, metadata)
  VALUES (p_actor, 'telephony_call', c.id,
    CASE WHEN v_outcome LIKE 'case_%' THEN 'call_' || v_outcome ELSE 'call_match_' || v_outcome END,
    CASE v_outcome WHEN 'confirmed' THEN 'Opkald koblet til kunde' WHEN 'corrected' THEN 'Opkaldets kunde rettet'
                   WHEN 'case_linked' THEN 'Opkald koblet til sag' WHEN 'case_unlinked' THEN 'Opkaldets sag fjernet'
                   ELSE 'Opkaldets kunde/forslag afvist' END,
    jsonb_build_object(
      'customer_id', jsonb_build_object('old', c.customer_id, 'new', v_new_customer),
      'service_case_id', jsonb_build_object('old', c.service_case_id, 'new', v_new_case),
      'match_status', jsonb_build_object('old', c.match_status, 'new', CASE WHEN v_new_customer IS NOT NULL THEN 'confirmed' ELSE 'rejected' END)),
    jsonb_build_object('match_version', c.match_version + 1, 'source', 'telephony_set_call_match'));
  RETURN QUERY SELECT v_outcome, c.match_version + 1;
END $$;

-- 7. Retention (regel 3, låst 90 dage): ubekræftede opkald (customer_id IS NULL — ukendt, forslag, tvetydig, afvist)
--    slettes 90 dage efter seneste aktivitet; hændelser følger med (kaskade). Bekræftede følger kunden.
CREATE FUNCTION public.telephony_purge_unconfirmed() RETURNS integer
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.telephony_calls x
   WHERE x.customer_id IS NULL AND coalesce(x.ended_at, x.started_at) < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Funktions-ACL: Supabase giver nye funktioner EXECUTE til anon/authenticated via default privileges → fjern alt
REVOKE ALL ON FUNCTION public.telephony_ingest_event(text, text, text, text, text, timestamptz, text, text, text, integer, boolean, boolean, integer, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telephony_ingest_event(text, text, text, text, text, timestamptz, text, text, text, integer, boolean, boolean, integer, text, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.telephony_set_call_match(uuid, integer, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telephony_set_call_match(uuid, integer, text, uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.telephony_purge_unconfirmed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telephony_purge_unconfirmed() TO service_role;
REVOKE ALL ON FUNCTION public.telephony_calls_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telephony_events_immutable() FROM PUBLIC, anon, authenticated;

-- 8. Rettigheder (= src/lib/auth/permissions.ts)
INSERT INTO public.permission_catalog (permission) VALUES
  ('calls.view'), ('calls.view_unmatched'), ('calls.match') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_defaults (role, permission) VALUES
  ('admin', 'calls.view'), ('serviceleder', 'calls.view'), ('salg', 'calls.view'),
  ('admin', 'calls.view_unmatched'), ('serviceleder', 'calls.view_unmatched'),
  ('admin', 'calls.match'), ('serviceleder', 'calls.match'), ('salg', 'calls.match')
ON CONFLICT DO NOTHING;

-- 9. RLS: kun læsning for authenticated, kun på opkald. Hændelser og koblinger: kun service_role (ingen politikker).
ALTER TABLE public.telephony_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_employee_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY telephony_calls_select ON public.telephony_calls
  FOR SELECT TO authenticated
  USING (
    (customer_id IS NULL AND (SELECT public.user_has_permission('calls.view_unmatched')))
    OR (
      customer_id IS NOT NULL
      AND (SELECT public.user_has_permission('calls.view'))
      AND (
        (SELECT public.user_has_permission('customers.view.all'))
        OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])
      )
    )
  );

REVOKE ALL ON public.telephony_calls, public.telephony_events, public.telephony_employee_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.telephony_calls TO authenticated;
GRANT ALL ON public.telephony_calls, public.telephony_events, public.telephony_employee_links TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ROLLBACK (manuel; fjerner kun det nye — ingen eksisterende data berøres; telefoni-rækker går tabt):
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.telephony_ingest_event(text, text, text, text, text, timestamptz, text, text, text, integer, boolean, boolean, integer, text, text, text);
-- DROP FUNCTION IF EXISTS public.telephony_set_call_match(uuid, integer, text, uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.telephony_purge_unconfirmed();
-- DROP TABLE IF EXISTS public.telephony_events;           -- trigger følger med
-- DROP TABLE IF EXISTS public.telephony_calls;            -- trigger følger med
-- DROP FUNCTION IF EXISTS public.telephony_events_immutable();
-- DROP FUNCTION IF EXISTS public.telephony_calls_guard();
-- DROP TABLE IF EXISTS public.telephony_employee_links;
-- DELETE FROM public.user_permission_overrides WHERE permission IN ('calls.view', 'calls.view_unmatched', 'calls.match');
-- DELETE FROM public.role_permission_defaults WHERE permission IN ('calls.view', 'calls.view_unmatched', 'calls.match');
-- DELETE FROM public.permission_catalog WHERE permission IN ('calls.view', 'calls.view_unmatched', 'calls.match');
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
-- (audit_logs-rækker med entity_type 'telephony_call' bevares som historik.)
