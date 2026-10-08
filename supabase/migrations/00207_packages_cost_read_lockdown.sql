-- 00207 — Kost-lockdown: packages (total_cost_price, db_amount, db_percentage) kun læsbar for kost-roller (N8-1, 2026-10-08).
-- STATUS: UDKAST — BLOCKED_APPROVAL. Ikke kørt på staging eller prod.
--
-- Fund (kost-lockdown-audit 2026-10-08): package_items blev låst i 00200, men selve `packages` (og den security_invoker
-- visning v_packages_summary) har stadig "Authenticated users can view packages" USING (true) → salg/montør kan læse
-- pakkernes kostpris og dækningsbidrag direkte via REST. Appen skjuler dem allerede.
-- App-forudsætning (deployet 2026-10-08): getPackages læser med admin-klienten for roller uden offers.view.cost_prices
-- (bag gate tools.packages/tools.calculations/offers.edit) og nulstiller kost; alle andre pakke-actions er bag
-- tools.packages (admin/serviceleder). insert_package_into_offer kaldes med admin-klienten.
--
-- Pre/post (read-only): scripts/prod-table-select-policies.ts packages · persona: salg 0 rækker, admin alle.
-- Rollback: DROP POLICY packages_select_cost_roles ON public.packages;
--           CREATE POLICY "Authenticated users can view packages" ON public.packages FOR SELECT TO authenticated USING (true);

BEGIN;

DROP POLICY IF EXISTS "Authenticated users can view packages" ON public.packages;
DROP POLICY IF EXISTS packages_select_authenticated ON public.packages;
DROP POLICY IF EXISTS packages_select_cost_roles ON public.packages;
CREATE POLICY packages_select_cost_roles ON public.packages FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

COMMIT;
