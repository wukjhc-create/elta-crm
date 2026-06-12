-- =====================================================================
-- 00136: Sprint Ø1.1 commit 1 — rate-snapshots på time_logs
-- =====================================================================
--
-- FORMÅL
--   Forbered frysning af medarbejdersatser pr. timeregistrering, så
--   historisk dækningsbidrag (DB/DB%) ikke ændrer sig bagudrettet når en
--   medarbejders cost_rate/hourly_rate justeres senere.
--
--   I dag er KOST-siden allerede snapshot (time_logs.cost_amount sættes af
--   trigger ved write), men SALGS-siden beregnes LIVE som
--   hours × employees.hourly_rate i sagsøkonomien. Disse kolonner giver
--   plads til at fryse BEGGE satser + det afledte salgsbeløb.
--
-- KOLONNER (additive, alle NULL)
--   time_logs.cost_rate_snapshot  NUMERIC(10,2) NULL
--       Den kostpris/time der lå bag cost_amount (revisionsspor).
--   time_logs.sale_rate_snapshot  NUMERIC(10,2) NULL
--       Den salgspris/time der frøs ved registrering.
--   time_logs.sale_amount         NUMERIC(10,2) NULL
--       Afledt løn-salgsbeløb (= hours × sale_rate_snapshot).
--
-- SCOPE
--   - KUN additive kolonner. Ingen eksisterende rækker ændres.
--   - INGEN backfill (kolonner forbliver NULL på historiske rækker).
--   - INGEN trigger-ændring (cost_amount-triggeren rører ikke disse felter endnu).
--   - INGEN kodeændring (TS-laget læser/skriver dem ikke endnu).
--   Adfærd er derfor 100% uændret efter denne migration.
--
-- ROLLBACK
--   ALTER TABLE time_logs DROP COLUMN IF EXISTS cost_rate_snapshot;
--   ALTER TABLE time_logs DROP COLUMN IF EXISTS sale_rate_snapshot;
--   ALTER TABLE time_logs DROP COLUMN IF EXISTS sale_amount;
--   NOTIFY pgrst, 'reload schema';
-- =====================================================================

BEGIN;

ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS cost_rate_snapshot NUMERIC(10,2);

COMMENT ON COLUMN time_logs.cost_rate_snapshot IS
  'Frosset kostpris/time (kr) bag cost_amount. NULL på historiske rækker (ingen backfill endnu). Revisionsspor — ændres aldrig af senere masterdata-ændring.';

ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS sale_rate_snapshot NUMERIC(10,2);

COMMENT ON COLUMN time_logs.sale_rate_snapshot IS
  'Frosset salgspris/time (kr) ved registrering. NULL på historiske rækker (ingen backfill endnu). Erstatter live employees.hourly_rate i fremtidig sagsøkonomi.';

ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS sale_amount NUMERIC(10,2);

COMMENT ON COLUMN time_logs.sale_amount IS
  'Afledt løn-salgsbeløb (kr) = hours × sale_rate_snapshot. NULL på historiske rækker (ingen backfill endnu). Snapshot — modstykke til cost_amount.';

NOTIFY pgrst, 'reload schema';

COMMIT;
