-- =====================================================================
-- 00138: Sprint Ø1.2 commit 2 — backfill historiske time_log snapshots
-- =====================================================================
--
-- FORMÅL
--   00136/00137 tilføjede snapshot-kolonner + trigger, men UDEN backfill —
--   historiske (allerede lukkede) time_logs har derfor NULL i
--   cost_rate_snapshot/sale_rate_snapshot/sale_amount. Sagsøkonomien falder
--   for disse rækker tilbage til LIVE-beregning (hours × employees.hourly_rate),
--   som ændrer sig hvis en medarbejders sats justeres senere.
--
--   Denne migration fryser de tre snapshotfelter for de historiske rækker,
--   så historisk dækningsbidrag bliver reproducerbart og ikke flytter sig
--   bagudrettet. Salgsbeløbet der fryses er IDENTISK med det live-fallbacken
--   viser i dag (hours × nuværende hourly_rate) — visningen ændrer sig ikke,
--   tallet bliver blot frosset.
--
-- FORMEL (spejler 00137-triggeren NØJAGTIGT — samme COALESCE-fallbacks)
--   cost_rate_snapshot = COALESCE(e.cost_rate,   400)
--   sale_rate_snapshot = COALESCE(e.hourly_rate, 495)
--   hours              = ROUND(EXTRACT(EPOCH FROM (end_time - start_time))/3600, 2)
--   sale_amount        = ROUND(GREATEST(hours,0) * sale_rate_snapshot, 2)
--
-- SCOPE / GARANTIER
--   - Rammer KUN lukkede rækker (end_time IS NOT NULL) hvor mindst ét
--     snapshotfelt er NULL. Åbne timere røres ikke.
--   - JOIN employees → rækker uden gyldig medarbejder (orphan / NULL
--     employee_id) udelukkes bevidst og forbliver NULL frem for at få en
--     gætteret sats. (Prod p.t.: 0 sådanne rækker.)
--   - IDEMPOTENT: WHERE-prædikatet kræver mindst ét NULL snapshotfelt, så
--     gentagne kørsler er no-ops; allerede-frosne rækker (fx trigger-satte
--     nye timer) røres aldrig.
--   - INGEN cost_amount-ÆNDRING: kun de tre snapshotfelter sættes.
--     cost_amount bevares som historisk værdi. (Verificeret i prod:
--     cost_amount = cost_rate × hours allerede, så cost_rate_snapshot er
--     konsistent med den uændrede cost_amount.)
--   - INGEN schema-/trigger-ændring → NOTIFY pgrst er IKKE relevant
--     (ren data-UPDATE, PostgREST-cachen påvirkes ikke) og udeladt bevidst.
--
-- FORVENTET EFFEKT (prod-data: 1 historisk række, jf. Ø1.2 commit 1 datacheck)
--   Række id=5c9d467a-2648-404f-8117-36fde57ef469 (employee cost_rate=450,
--   hourly_rate=685, hours=14.05):
--     cost_rate_snapshot -> 450.00
--     sale_rate_snapshot -> 685.00
--     sale_amount        -> 9624.25   (= 14.05 × 685)
--     cost_amount        -> 6322.50   (UÆNDRET)
--
-- ROLLBACK (BØR være id-pinned — en naiv "SET NULL WHERE end_time IS NOT NULL"
-- ville også nulstille snapshots som triggeren har sat på NYE timer):
--   UPDATE time_logs
--      SET cost_rate_snapshot = NULL,
--          sale_rate_snapshot = NULL,
--          sale_amount        = NULL
--    WHERE id = '5c9d467a-2648-404f-8117-36fde57ef469';
--   -- (Hvis fremtidige kørsler rammer flere rækker: pin de konkrete id'er
--   --  fra migrationens output i stedet for at scope på end_time.)
-- =====================================================================

BEGIN;

UPDATE time_logs t
SET
  cost_rate_snapshot = COALESCE(e.cost_rate, 400),
  sale_rate_snapshot = COALESCE(e.hourly_rate, 495),
  sale_amount = ROUND(
    (GREATEST(ROUND((EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0)::numeric, 2), 0)
     * COALESCE(e.hourly_rate, 495))::numeric, 2)
FROM employees e
WHERE e.id = t.employee_id
  AND t.end_time IS NOT NULL
  AND (t.cost_rate_snapshot IS NULL
       OR t.sale_rate_snapshot IS NULL
       OR t.sale_amount IS NULL);

COMMIT;
