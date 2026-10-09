-- 00211 — Rækkebetingelser på skrivning: montør-materialer/-omkostninger og salg-opdatering af sager (sags-review 2026-10-09).
-- STATUS: UDKAST — BLOCKED_APPROVAL. Ikke kørt på staging eller prod.
--
-- Fund (prod read-only, scripts/prod-table-write-policies.ts):
--  * case_materials_insert_role / case_other_costs_insert_role: montør må indsætte UDEN rækkebetingelser → via REST på
--    enhver sag og med egne priser/invoice_line_id (appen tjekker scope og nulstiller priser, men kun i action'en).
--  * service_cases_update_role: salg må opdatere ALLE sager (status 'closed' uden lukke-værn, betaler, kontraktsum),
--    selv om appen kun giver salg cases.create (ingen cases.edit/cases.close).
-- Rettelse: montør kun på sager med egen arbejdsordre, priser 0 og ingen fakturabinding (som appen allerede gør);
-- salg kun egne sager (created_by/assigned_to — samme regel som getCaseScope). admin/serviceleder uændret.
--
-- Pre/post: scripts/prod-table-write-policies.ts service_cases case_materials case_other_costs. Persona-test på staging:
-- montør INSERT på fremmed sag / med salgspris → afvist, på egen sag med 0-priser → ok; salg PATCH fremmed sag → 0 rækker,
-- egen sag → ok. UI: montør materialer/udlæg (U11/U30/U34/U40), salg (U7/U8/U13).
-- Rollback: genskab politikkerne fra 00173 (role-only).

BEGIN;

CREATE OR REPLACE FUNCTION public.montor_case_ids_for_current_user()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT wo.case_id FROM work_orders wo
  JOIN employees e ON e.id = wo.assigned_employee_id
  WHERE e.profile_id = auth.uid() AND wo.case_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.montor_case_ids_for_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.montor_case_ids_for_current_user() TO authenticated;

DROP POLICY IF EXISTS case_materials_insert_role ON public.case_materials;
CREATE POLICY case_materials_insert_role ON public.case_materials FOR INSERT TO authenticated WITH CHECK (
  public.user_role() IN ('admin', 'serviceleder')
  OR (public.user_role() = 'montør' AND invoice_line_id IS NULL AND coalesce(unit_cost, 0) = 0 AND coalesce(unit_sales_price, 0) = 0
      AND case_id IN (SELECT public.montor_case_ids_for_current_user()))
);

DROP POLICY IF EXISTS case_other_costs_insert_role ON public.case_other_costs;
CREATE POLICY case_other_costs_insert_role ON public.case_other_costs FOR INSERT TO authenticated WITH CHECK (
  public.user_role() IN ('admin', 'serviceleder')
  OR (public.user_role() = 'montør' AND invoice_line_id IS NULL AND coalesce(unit_cost, 0) = 0 AND coalesce(unit_sales_price, 0) = 0
      AND case_id IN (SELECT public.montor_case_ids_for_current_user()))
);

DROP POLICY IF EXISTS service_cases_update_role ON public.service_cases;
CREATE POLICY service_cases_update_role ON public.service_cases FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder')
         OR (public.user_role() = 'salg' AND (created_by = auth.uid() OR assigned_to = auth.uid())))
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder')
         OR (public.user_role() = 'salg' AND (created_by = auth.uid() OR assigned_to = auth.uid())));

COMMIT;
