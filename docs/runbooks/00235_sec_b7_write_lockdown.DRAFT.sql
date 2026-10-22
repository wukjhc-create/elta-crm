-- =====================================================================
-- FORSLAG 00235 — SEC-B7: direkte REST-skrivninger følger appens autoritetsmodel
--   customer_tasks · roof_drawings · work_orders (supplement til 00213)
--
-- STATUS: DRAFT — IKKE ANVENDT (hverken staging eller prod). Kræver Henriks godkendelse pr. miljø.
-- Forslag + baggrund: docs/runbooks/mp-00235-sec-b7-write-lockdown.md
-- Test: npx tsx scripts/test-harness/cli.ts sec-b7-rls-check   (før: [NY] 0/18 · efter: 18/18, [UÆNDRET] 12/12)
-- Forudsætninger (CODE → TEST → PUSH før migration):
--   P1 besigtigelse: lukning af andres besigtigelsesopgaver via admin-klient (saveBesigtigelsesnotat)
--   P2 auto-tasks: cron-hjælpere er ikke længere server-actions (lib/services/auto-tasks)
--   P3 scripts/rls/write-matrix.ts opdateres i SAMME commit som migrationen (check:rls-matrix)
-- Læsning (SELECT) ændres IKKE.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Hjælpefunktioner (SECURITY DEFINER: læser uden at afhænge af/rekursere i tabellernes egne policies;
-- afslører kun en boolean om kalderen selv / to id'er der hører sammen)
-- ---------------------------------------------------------------------

-- Montør har en ikke-annulleret arbejdsordre (tildelt egen aktive medarbejder) på en sag hos kunden
-- — samme regel som appens taskCreateRule (customer-tasks.ts)
CREATE OR REPLACE FUNCTION public.montor_has_customer_job(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.work_orders w
    JOIN public.service_cases sc ON sc.id = w.case_id
    JOIN public.employees e ON e.id = w.assigned_employee_id
    WHERE sc.customer_id = p_customer_id
      AND e.profile_id = auth.uid()
      AND e.active
      AND w.status <> 'cancelled'
  );
$$;
REVOKE ALL ON FUNCTION public.montor_has_customer_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.montor_has_customer_job(uuid) TO authenticated;

-- Sagen hører til kunden (kryds-sag-værn for tagtegninger) — uafhængigt af kalderens læseadgang til sagen
CREATE OR REPLACE FUNCTION public.case_belongs_to_customer(p_case_id uuid, p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.service_cases sc WHERE sc.id = p_case_id AND sc.customer_id = p_customer_id);
$$;
REVOKE ALL ON FUNCTION public.case_belongs_to_customer(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.case_belongs_to_customer(uuid, uuid) TO authenticated;

-- Er sagen lukket? (montør-værn på arbejdsordrer — appen afviser allerede; nu også i databasen)
CREATE OR REPLACE FUNCTION public.case_is_closed(p_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.service_cases sc WHERE sc.id = p_case_id AND sc.status = 'closed');
$$;
REVOKE ALL ON FUNCTION public.case_is_closed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.case_is_closed(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 1. customer_tasks
--    INSERT: kontorroller (tasks.create) frit, men created_by = én selv; montør kun til sig selv hos kunde med eget job
--    UPDATE/DELETE: admin/serviceleder/salg (customers.edit) alle; bogholderi/montør kun egne (tildelt/oprettet)
--    Trigger: created_by kan ikke ændres; montør kan kun omfordele til sig selv (appens selfOnly)
--    anon: UÆNDRET — tabel-grants hører til P-003 (anon-cron; revoke skifter cronens tomme læsning til fejl = cron-adfærd,
--    BLOCKED hos Henrik). RLS har ingen anon-politik, så anon kan hverken læse eller skrive i dag (testet: T13).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS customer_tasks_insert_role ON public.customer_tasks;
CREATE POLICY customer_tasks_insert_role ON public.customer_tasks FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid()
  AND (
    public.user_role() IN ('admin', 'serviceleder', 'salg', 'bogholderi')
    OR (public.user_role() = 'montør' AND assigned_to = auth.uid() AND public.montor_has_customer_job(customer_id))
  )
);

DROP POLICY IF EXISTS customer_tasks_update_role ON public.customer_tasks;
CREATE POLICY customer_tasks_update_role ON public.customer_tasks FOR UPDATE TO authenticated
  USING (
    public.user_role() IN ('admin', 'serviceleder', 'salg')
    OR (public.user_role() IN ('bogholderi', 'montør') AND (assigned_to = auth.uid() OR created_by = auth.uid()))
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'serviceleder', 'salg')
    OR (public.user_role() IN ('bogholderi', 'montør') AND (assigned_to = auth.uid() OR created_by = auth.uid()))
  );

DROP POLICY IF EXISTS customer_tasks_delete_role ON public.customer_tasks;
CREATE POLICY customer_tasks_delete_role ON public.customer_tasks FOR DELETE TO authenticated USING (
  public.user_role() IN ('admin', 'serviceleder', 'salg')
  OR (public.user_role() IN ('bogholderi', 'montør') AND (assigned_to = auth.uid() OR created_by = auth.uid()))
);

CREATE OR REPLACE FUNCTION public.customer_tasks_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- kun brugerens egne REST-skrivninger (service-role/cron/agenter og indlejrede triggere er uberørte)
  IF pg_trigger_depth() > 1 OR current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Opgavens opretter kan ikke ændres' USING ERRCODE = '42501';
  END IF;
  IF public.user_role() = 'montør' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Montører kan kun tildele opgaver til sig selv' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.customer_tasks_write_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_customer_tasks_write_guard ON public.customer_tasks;
CREATE TRIGGER trg_customer_tasks_write_guard
  BEFORE UPDATE ON public.customer_tasks
  FOR EACH ROW EXECUTE FUNCTION public.customer_tasks_write_guard();

-- ---------------------------------------------------------------------
-- 2. roof_drawings
--    Skrive-ret (som appens roofWriteDenied): admin/serviceleder/salg alle; bogholderi kun tegninger med sag;
--    montør kun på sager i eget scope (user_can_see_case = appens getCaseScope). Sag og kunde skal høre sammen.
--    INSERT: created_by = én selv. UPDATE: kun tegnefelterne (trigger) — kunde/sag/opretter/billede låst.
--    Lukket sag: appen forbyder det IKKE i dag → håndhæves ikke her (separat beslutning).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS roof_drawings_insert_role ON public.roof_drawings;
CREATE POLICY roof_drawings_insert_role ON public.roof_drawings FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid()
  AND (service_case_id IS NULL OR public.case_belongs_to_customer(service_case_id, customer_id))
  AND (
    public.user_role() IN ('admin', 'serviceleder', 'salg')
    OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
    OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))
  )
);

DROP POLICY IF EXISTS roof_drawings_update_role ON public.roof_drawings;
CREATE POLICY roof_drawings_update_role ON public.roof_drawings FOR UPDATE TO authenticated
  USING (
    public.user_role() IN ('admin', 'serviceleder', 'salg')
    OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
    OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))
  )
  WITH CHECK (
    (service_case_id IS NULL OR public.case_belongs_to_customer(service_case_id, customer_id))
    AND (
      public.user_role() IN ('admin', 'serviceleder', 'salg')
      OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
      OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))
    )
  );

DROP POLICY IF EXISTS roof_drawings_delete_role ON public.roof_drawings;
CREATE POLICY roof_drawings_delete_role ON public.roof_drawings FOR DELETE TO authenticated USING (
  public.user_role() IN ('admin', 'serviceleder', 'salg')
  OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
  OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))
);

CREATE OR REPLACE FUNCTION public.roof_drawings_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  -- appen (saveRoofDrawing) ændrer kun disse felter; alt andet (kunde, sag, opretter, billede) er låst for brugere
  IF (to_jsonb(NEW) - ARRAY['panel_count', 'drawing_data', 'title', 'panel_product_code', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['panel_count', 'drawing_data', 'title', 'panel_product_code', 'updated_at']) THEN
    RAISE EXCEPTION 'Kun tegningens indhold kan ændres' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.roof_drawings_update_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_roof_drawings_update_guard ON public.roof_drawings;
CREATE TRIGGER trg_roof_drawings_update_guard
  BEFORE UPDATE ON public.roof_drawings
  FOR EACH ROW EXECUTE FUNCTION public.roof_drawings_update_guard();

-- ---------------------------------------------------------------------
-- 3. work_orders — 00213 (kun status/completed_at for montør) suppleres:
--    completed_at sættes af databasen (ingen tilbagedatering) og ryddes ikke af montør; lukket sag = ingen ændring
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.work_orders_montor_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Indlejrede opdateringer fra andre triggere (fx low_profit efter snapshot) er ikke brugerens egne skrivninger
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF current_user <> 'authenticated' OR public.user_role() IS DISTINCT FROM 'montør' THEN
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('planned', 'in_progress') THEN
    RAISE EXCEPTION 'Arbejdsordren er afsluttet eller annulleret og kan ikke ændres' USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['status', 'completed_at', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'completed_at', 'updated_at']) THEN
    RAISE EXCEPTION 'Montør må kun ændre status på egne arbejdsordrer' USING ERRCODE = '42501';
  END IF;

  -- 00235: ingen ændring på en lukket sag (appen afviser allerede — nu også ved direkte REST)
  IF public.case_is_closed(OLD.case_id) THEN
    RAISE EXCEPTION 'Sagen er lukket — arbejdsordren kan ikke ændres' USING ERRCODE = '42501';
  END IF;

  -- 00235: afslutningstidspunktet sættes af databasen (ingen tilbagedatering); ellers uændret
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    NEW.completed_at := now();
  ELSE
    NEW.completed_at := OLD.completed_at;
  END IF;

  RETURN NEW;
END;
$$;
-- (trigger trg_work_orders_montor_update_guard fra 00213 bruger allerede funktionen — ingen ny trigger)

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- ROLLBACK (gendanner præcis tilstanden før 00235 — kun ved en reel regression)
-- =====================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_customer_tasks_write_guard ON public.customer_tasks;
-- DROP FUNCTION IF EXISTS public.customer_tasks_write_guard();
-- DROP TRIGGER IF EXISTS trg_roof_drawings_update_guard ON public.roof_drawings;
-- DROP FUNCTION IF EXISTS public.roof_drawings_update_guard();
-- DROP POLICY IF EXISTS customer_tasks_insert_role ON public.customer_tasks;
-- CREATE POLICY customer_tasks_insert_role ON public.customer_tasks FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
-- DROP POLICY IF EXISTS customer_tasks_update_role ON public.customer_tasks;
-- CREATE POLICY customer_tasks_update_role ON public.customer_tasks FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
-- DROP POLICY IF EXISTS customer_tasks_delete_role ON public.customer_tasks;
-- CREATE POLICY customer_tasks_delete_role ON public.customer_tasks FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
-- DROP POLICY IF EXISTS roof_drawings_insert_role ON public.roof_drawings;
-- CREATE POLICY roof_drawings_insert_role ON public.roof_drawings FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
-- DROP POLICY IF EXISTS roof_drawings_update_role ON public.roof_drawings;
-- CREATE POLICY roof_drawings_update_role ON public.roof_drawings FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
-- DROP POLICY IF EXISTS roof_drawings_delete_role ON public.roof_drawings;
-- CREATE POLICY roof_drawings_delete_role ON public.roof_drawings FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
-- -- work_orders: genskab 00213-funktionen (uden lukket-sag-tjek og completed_at-styring)
-- CREATE OR REPLACE FUNCTION public.work_orders_montor_update_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$
-- BEGIN
--   IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
--   IF current_user <> 'authenticated' OR public.user_role() IS DISTINCT FROM 'montør' THEN RETURN NEW; END IF;
--   IF OLD.status NOT IN ('planned', 'in_progress') THEN RAISE EXCEPTION 'Arbejdsordren er afsluttet eller annulleret og kan ikke ændres' USING ERRCODE = '42501'; END IF;
--   IF (to_jsonb(NEW) - ARRAY['status', 'completed_at', 'updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'completed_at', 'updated_at']) THEN
--     RAISE EXCEPTION 'Montør må kun ændre status på egne arbejdsordrer' USING ERRCODE = '42501'; END IF;
--   RETURN NEW;
-- END; $f$;
-- DROP FUNCTION IF EXISTS public.montor_has_customer_job(uuid);
-- DROP FUNCTION IF EXISTS public.case_belongs_to_customer(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.case_is_closed(uuid);
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
