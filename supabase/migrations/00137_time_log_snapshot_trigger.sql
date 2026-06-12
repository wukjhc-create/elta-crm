-- =====================================================================
-- 00137: Sprint Ø1.1 commit 2 — fryses kost+salg i time_logs-trigger
-- =====================================================================
--
-- FORMÅL
--   Udvid time_logs_set_cost_amount() så nye/redigerede time_logs får
--   frosset BÅDE kost- og salgsdata i de snapshot-kolonner der blev
--   tilføjet i 00136. Dermed bliver løn-salgsprisen et snapshot (i stedet
--   for live employees.hourly_rate), og historisk DB ændrer sig ikke når
--   medarbejdersatser justeres senere.
--
-- ÆNDRING
--   CREATE OR REPLACE FUNCTION time_logs_set_cost_amount() — samme navn,
--   samme trigger (trg_time_logs_cost_amount uændret, røres ikke).
--   Funktionen sætter nu ved lukket timer (end_time NOT NULL):
--     cost_rate_snapshot = COALESCE(employees.cost_rate,   400)
--     sale_rate_snapshot = COALESCE(employees.hourly_rate, 495)
--     cost_amount        = ROUND(GREATEST(hours,0) * cost_rate_snapshot, 2)
--     sale_amount        = ROUND(GREATEST(hours,0) * sale_rate_snapshot, 2)
--   Ved åben timer (end_time IS NULL) sættes alle fire til NULL (uændret
--   adfærd for cost_amount; nye kolonner følger samme princip).
--
--   0 accepteres som gyldig sats: COALESCE rammer kun ved NULL (manglende
--   medarbejder/rate), så en eksplicit 0-sats bevares som 0 — ikke fallback.
--
-- SCOPE
--   - KUN funktionsændring. Ingen trigger-redefinition, ingen ny kolonne.
--   - INGEN backfill (historiske rækker beholder NULL i snapshot-felter;
--     cost_amount på gamle rækker er urørt). Backfill = separat commit.
--   - INGEN JS-/UI-ændring. Sagsøkonomien læser endnu ikke sale_amount.
--   Effekt: kun time_logs der INSERT'es eller UPDATE'es (af end_time/
--   employee_id) EFTER kørsel får de nye snapshot-felter udfyldt.
--   cost_amount-værdien for en given række er numerisk uændret (samme
--   formel/fallback 400 som før) — kun nye felter tilføjes.
--
-- ROLLBACK (gendan 00088-versionen af funktionen)
--   CREATE OR REPLACE FUNCTION time_logs_set_cost_amount()
--   RETURNS TRIGGER LANGUAGE plpgsql AS $$
--   DECLARE
--     v_rate    NUMERIC(10,2);
--     v_hours   NUMERIC(10,2);
--     v_default NUMERIC(10,2) := 400;
--   BEGIN
--     IF NEW.end_time IS NULL THEN
--       NEW.cost_amount := NULL;
--       RETURN NEW;
--     END IF;
--     v_hours := ROUND((EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0)::numeric, 2);
--     SELECT cost_rate INTO v_rate FROM employees WHERE id = NEW.employee_id;
--     NEW.cost_amount := ROUND((GREATEST(v_hours, 0) * COALESCE(v_rate, v_default))::numeric, 2);
--     RETURN NEW;
--   END;
--   $$;
--   -- (snapshot-kolonner fra 00136 forbliver i schema; rolles tilbage i 00136)
--   NOTIFY pgrst, 'reload schema';
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION time_logs_set_cost_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cost_rate    NUMERIC(10,2);
  v_sale_rate    NUMERIC(10,2);
  v_hours        NUMERIC(10,2);
  v_cost_default NUMERIC(10,2) := 400;   -- conservative cost fallback
  v_sale_default NUMERIC(10,2) := 495;   -- canonical sale fallback (Sprint 2D)
BEGIN
  -- Only freeze when the timer is closed (end_time NOT NULL).
  IF NEW.end_time IS NULL THEN
    NEW.cost_amount        := NULL;
    NEW.sale_amount        := NULL;
    NEW.cost_rate_snapshot := NULL;
    NEW.sale_rate_snapshot := NULL;
    RETURN NEW;
  END IF;

  v_hours := ROUND((EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0)::numeric, 2);

  -- One lookup for both sides. Missing employee/row -> NULL -> COALESCE fallback.
  SELECT cost_rate, hourly_rate
    INTO v_cost_rate, v_sale_rate
    FROM employees
   WHERE id = NEW.employee_id;

  -- COALESCE (not truthy): an explicit 0-rate is kept as 0, only NULL falls back.
  NEW.cost_rate_snapshot := COALESCE(v_cost_rate, v_cost_default);
  NEW.sale_rate_snapshot := COALESCE(v_sale_rate, v_sale_default);

  NEW.cost_amount := ROUND((GREATEST(v_hours, 0) * NEW.cost_rate_snapshot)::numeric, 2);
  NEW.sale_amount := ROUND((GREATEST(v_hours, 0) * NEW.sale_rate_snapshot)::numeric, 2);

  RETURN NEW;
END;
$$;

-- Trigger trg_time_logs_cost_amount (00088) peger allerede på denne funktion
-- og redefineres bevidst IKKE (BEFORE INSERT OR UPDATE OF end_time, employee_id).

NOTIFY pgrst, 'reload schema';

COMMIT;
