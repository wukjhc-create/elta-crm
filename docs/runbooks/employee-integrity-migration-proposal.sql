-- =====================================================================================================================
-- FORSLAG (IKKE NUMMERERET, IKKE ANVENDT NOGEN STEDER): Employee Setup Integrity — databaseværn
-- Hører til CLAUDE_EMPLOYEE_INTEGRITY_HANDOVER.md. Kræver egen godkendelse (nr., formål, risiko, pre/post) før staging.
-- Nummer tildeles først ved godkendelse (Finance Batch 2 kan have brug for 00249).
--
-- App-laget (branch claude-employee-integrity) forhindrer allerede NYE dubletter i alle kendte stier. Dette forslag gør
-- reglerne til database-garantier og lukker de to finansielle SQL-fallbacks, som app'en kun kan værne udenom.
--
-- Prod-tal 2026-11-09 (scripts/prod-employee-integrity.ts, read-only): 2 medarbejderrækker, 0 logins med >1 aktiv
-- række, 0 satser = 0, 1 time (med kost). Punkt 1 kan derfor anvendes uden dataændring.
-- =====================================================================================================================

BEGIN;

-- ---------- 1. Højst ÉN aktiv medarbejderrække pr. login ----------
-- Forudsætning: ingen dubletter i dag (ellers stop — dubletter rettes af et menneske, aldrig automatisk).
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE active AND profile_id IS NOT NULL GROUP BY profile_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'employee-integrity: der findes logins med flere aktive medarbejdere — ret dem manuelt først';
  END IF;
END
$guard$;
CREATE UNIQUE INDEX IF NOT EXISTS employees_one_active_per_profile
  ON public.employees (profile_id) WHERE active AND profile_id IS NOT NULL;

-- ---------- 2. user_employee_id(): deterministisk som current_employee_id() (00242) ----------
-- 00108 bruger LIMIT 1 uden ORDER BY. Med punkt 1 er der højst én aktiv række, men rækkefølgen gøres eksplicit.
-- (Signatur/ACL bevares; kontrollér den aktuelle krop i prod før anvendelse.)
-- CREATE OR REPLACE FUNCTION public.user_employee_id() ... ORDER BY e.created_at, e.id LIMIT 1 ...

-- ---------- 3. create_invoice_from_work_order (00202): frosne beløb, ingen standardsats ----------
-- I dag: COALESCE(e.hourly_rate, p_default_hourly_rate) — nuværende sats (omprisning) og 495/indstilling ved manglende sats.
-- Forslag: linjens pris = time_logs.sale_amount (frosset af 00230); mangler den på en fakturerbar time → RAISE (dansk
-- tekst, HINT missing_frozen_sale). p_default_hourly_rate bevares i signaturen for kompatibilitet, men bruges ikke.
-- App-værnet (src/lib/employees/invoice-rate-guard.ts) kan fjernes, når dette er i prod.

-- ---------- 4. calculate_work_order_profit (seneste: 00248): ukendt timekost er ikke 0 ----------
-- I dag: COALESCE(SUM(cost_amount), 0) — en afsluttet time uden cost_amount tæller 0 kr. i labor/total/profit/margin og
-- gemmes i work_order_profit. Og planlagt omsætning bruger COALESCE(sale_rate_snapshot, e.hourly_rate, 495).
-- Forslag (samme mønster som materialer i 00248):
--   v_labor_unknown := count(*) FILTER (WHERE end_time IS NOT NULL AND approval_status <> 'rejected' AND cost_amount IS NULL)
--   v_sale_unknown  := count(*) FILTER (WHERE billable AND end_time IS NOT NULL AND approval_status <> 'rejected' AND sale_amount IS NULL)
--   v_labor_unknown > 0 → labor_cost/total_cost/profit/margin = NULL; nye nøgler labor_cost_known, labor_unknown_line_count
--   planlagt omsætning: kun sale_amount; v_sale_unknown > 0 → revenue NULL (ingen 495)
-- Bemærk: rører en funktion 00248 lige har ændret → egen migration efter 00248 er stabil i prod; rollback som 00248.

COMMIT;

-- Rollback (punkt 1): DROP INDEX IF EXISTS public.employees_one_active_per_profile;
