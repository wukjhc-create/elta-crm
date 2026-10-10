-- 00212: system_health_log kun læsbar for drift-roller (admin/serviceleder/bogholderi) — samme som system_alerts (00194).
-- Cron-review 2026-10-09 (#7): politikken var USING (true) for alle authenticated; loggen indeholder postkasse-adresser,
-- bank-transaktions-id'er, modtagerlister for admin-alarmer/betalingsrapport og op til 500 tegn af hver crons svar.
-- Skrivning sker kun via service_role (logHealth / createAdminClient) — uændret. Ingen dataændring.
-- Appen: /api/dashboard/stats viser allerede kun driftsdata for de tre roller (kodegate, commit 2026-10-09).

BEGIN;

DROP POLICY IF EXISTS "system_health_select_auth" ON public.system_health_log;
DROP POLICY IF EXISTS system_health_select_ops ON public.system_health_log;
CREATE POLICY system_health_select_ops ON public.system_health_log
  FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- GRANT uændret (SELECT til authenticated; RLS afgør rækkerne)
GRANT SELECT ON public.system_health_log TO authenticated;
GRANT ALL ON public.system_health_log TO service_role;

COMMIT;
