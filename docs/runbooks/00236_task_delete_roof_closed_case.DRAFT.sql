-- =====================================================================
-- FORSLAG 00236 — produktbeslutninger (Henrik 2026-10-24): opgave-sletning + tagtegninger på lukket sag
--
-- STATUS: DRAFT — IKKE ANVENDT (hverken staging eller prod). Kræver særskilt godkendelse pr. miljø.
-- Forslag: docs/runbooks/mp-00236-task-delete-roof-closed-case.md
-- Forudsætning (CODE → TEST → PUSH før migration): appen håndhæver allerede de samme regler
--   (taskDeleteDenied + lib/tasks/task-delete-rule.ts; roofWriteDenied afviser lukket sag).
-- Bygger på 00235 (customer_tasks/roof_drawings ejes af dedikerede migrationer — generatoren er låst, supersededBy).
-- Kun DELETE på customer_tasks og INSERT/UPDATE/DELETE på roof_drawings ændres. SELECT, grants og data: uændret.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. customer_tasks DELETE
--    admin/serviceleder: tilladte opgaver (som før)
--    salg/bogholderi: kun egne oprettede, aldrig system-/auto-opgaver
--    montør: oprettet af OG tildelt én selv, koblet til sag i eget scope, aldrig system-/auto-opgaver
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS customer_tasks_delete_role ON public.customer_tasks;
CREATE POLICY customer_tasks_delete_role ON public.customer_tasks FOR DELETE TO authenticated USING (
  public.user_role() IN ('admin', 'serviceleder')
  OR (
    public.user_role() IN ('salg', 'bogholderi')
    AND created_by = auth.uid()
    AND NOT coalesce(auto_generated, false)
  )
  OR (
    public.user_role() = 'montør'
    AND created_by = auth.uid()
    AND assigned_to = auth.uid()
    AND NOT coalesce(auto_generated, false)
    AND service_case_id IS NOT NULL
    AND public.user_can_see_case(service_case_id)
  )
);

-- ---------------------------------------------------------------------
-- 2. roof_drawings — lukket sag: ingen opret/ret/slet for nogen rolle (admin/serviceleder genåbner sagen først).
--    Tegninger uden sag er uberørte. Ellers som 00235.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS roof_drawings_insert_role ON public.roof_drawings;
CREATE POLICY roof_drawings_insert_role ON public.roof_drawings FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid()
  AND (service_case_id IS NULL OR (public.case_belongs_to_customer(service_case_id, customer_id) AND NOT public.case_is_closed(service_case_id)))
  AND (
    public.user_role() IN ('admin', 'serviceleder', 'salg')
    OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
    OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))
  )
);

DROP POLICY IF EXISTS roof_drawings_update_role ON public.roof_drawings;
CREATE POLICY roof_drawings_update_role ON public.roof_drawings FOR UPDATE TO authenticated
  USING (
    (service_case_id IS NULL OR NOT public.case_is_closed(service_case_id))
    AND (
      public.user_role() IN ('admin', 'serviceleder', 'salg')
      OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
      OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))
    )
  )
  WITH CHECK (
    (service_case_id IS NULL OR (public.case_belongs_to_customer(service_case_id, customer_id) AND NOT public.case_is_closed(service_case_id)))
    AND (
      public.user_role() IN ('admin', 'serviceleder', 'salg')
      OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
      OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))
    )
  );

DROP POLICY IF EXISTS roof_drawings_delete_role ON public.roof_drawings;
CREATE POLICY roof_drawings_delete_role ON public.roof_drawings FOR DELETE TO authenticated USING (
  (service_case_id IS NULL OR NOT public.case_is_closed(service_case_id))
  AND (
    public.user_role() IN ('admin', 'serviceleder', 'salg')
    OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
    OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))
  )
);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- ROLLBACK (gendanner 00235-definitionerne af de fire policies)
-- =====================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS customer_tasks_delete_role ON public.customer_tasks;
-- CREATE POLICY customer_tasks_delete_role ON public.customer_tasks FOR DELETE TO authenticated USING (
--   public.user_role() IN ('admin', 'serviceleder', 'salg')
--   OR (public.user_role() IN ('bogholderi', 'montør') AND (assigned_to = auth.uid() OR created_by = auth.uid())));
-- DROP POLICY IF EXISTS roof_drawings_insert_role ON public.roof_drawings;
-- CREATE POLICY roof_drawings_insert_role ON public.roof_drawings FOR INSERT TO authenticated WITH CHECK (
--   created_by = auth.uid() AND (service_case_id IS NULL OR public.case_belongs_to_customer(service_case_id, customer_id))
--   AND (public.user_role() IN ('admin', 'serviceleder', 'salg') OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
--     OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))));
-- DROP POLICY IF EXISTS roof_drawings_update_role ON public.roof_drawings;
-- CREATE POLICY roof_drawings_update_role ON public.roof_drawings FOR UPDATE TO authenticated
--   USING (public.user_role() IN ('admin', 'serviceleder', 'salg') OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
--     OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id)))
--   WITH CHECK ((service_case_id IS NULL OR public.case_belongs_to_customer(service_case_id, customer_id))
--     AND (public.user_role() IN ('admin', 'serviceleder', 'salg') OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
--       OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))));
-- DROP POLICY IF EXISTS roof_drawings_delete_role ON public.roof_drawings;
-- CREATE POLICY roof_drawings_delete_role ON public.roof_drawings FOR DELETE TO authenticated USING (
--   public.user_role() IN ('admin', 'serviceleder', 'salg') OR (public.user_role() = 'bogholderi' AND service_case_id IS NOT NULL)
--   OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id)));
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
