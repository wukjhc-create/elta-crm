-- =====================================================================
-- 00142: Sprint Ø2.9 — time_logs rate engine / overtidsberegning
-- =====================================================================
--
-- ARKITEKTUR
--   time_logs skrives 13+ steder (actions + services). Den ENESTE konsistente
--   placering for sats-/overtidsberegning er DB-triggeren der allerede
--   snapshotter kost/salg (00137). Vi UDVIDER den til at anvende
--   pay_rate_type + overtidssatser — så ALLE skrivesteder automatisk får
--   korrekt og immutabelt snapshot. INTET dobbelt system.
--
-- HISTORISK IMMUTABILITET (ERP-regel)
--   Triggeren fyrer KUN ved ændring af time_log-felterne (end_time,
--   employee_id, pay_rate_type, employee_rate_id). Den fyrer ALDRIG når en
--   medarbejders sats ændres → eksisterende time_logs' økonomi er uændret.
--
-- pay_rate_type-vokabular (CHECK udvidet med 'standby'):
--   normal | ot1 | ot2 | weekend | holiday | standby | other
-- Mapping til employee_overtime_rates.code:
--   ot1→ot50, ot2→ot100, weekend→weekend, holiday→holiday, standby→standby,
--   other→(ingen; normal-satser). Fallback-multiplikator når der ikke findes
--   en satsrække: ot1=1.5, ot2=2.0, weekend=2.0, holiday=2.0, standby=1.0.
--
-- BEREGNING (lukket timer):
--   cost_rate_snapshot/sale_rate_snapshot = compute_time_log_rates(...)
--   cost_amount = hours * cost_rate_snapshot
--   sale_amount = hours * sale_rate_snapshot
--   employee_rate_id auto-sættes hvis en satsrække anvendes og feltet var null.
--
-- ROLLBACK: gendan 00137-funktionen + trigger (BEFORE INSERT OR UPDATE OF
--   end_time, employee_id), DROP FUNCTION compute_time_log_rates,
--   gendan CHECK uden 'standby'. NOTIFY pgrst.
-- =====================================================================

BEGIN;

-- 1) Udvid CHECK med 'standby'
ALTER TABLE time_logs DROP CONSTRAINT IF EXISTS time_logs_pay_rate_type_chk;
ALTER TABLE time_logs ADD CONSTRAINT time_logs_pay_rate_type_chk
  CHECK (pay_rate_type IN ('normal','ot1','ot2','weekend','holiday','standby','other'));

-- 2) Helper: beregn effektive kost-/salgssatser for en timeregistrering
CREATE OR REPLACE FUNCTION compute_time_log_rates(
  p_employee_id uuid,
  p_pay_rate_type text,
  p_employee_rate_id uuid
)
RETURNS TABLE(cost_rate numeric, sale_rate numeric, used_rate_id uuid)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_base_cost numeric(10,2);
  v_base_sale numeric(10,2);
  v_type text := COALESCE(p_pay_rate_type, 'normal');
  v_code text;
  v_mult numeric;
  r_cost numeric; r_sale numeric; r_mult numeric; r_id uuid;
BEGIN
  SELECT COALESCE(e.cost_rate, 400), COALESCE(e.hourly_rate, 495)
    INTO v_base_cost, v_base_sale
    FROM employees e WHERE e.id = p_employee_id;
  v_base_cost := COALESCE(v_base_cost, 400);
  v_base_sale := COALESCE(v_base_sale, 495);

  IF v_type = 'normal' THEN
    RETURN QUERY SELECT v_base_cost, v_base_sale, NULL::uuid; RETURN;
  END IF;

  v_code := CASE v_type
    WHEN 'ot1' THEN 'ot50' WHEN 'ot2' THEN 'ot100'
    WHEN 'weekend' THEN 'weekend' WHEN 'holiday' THEN 'holiday'
    WHEN 'standby' THEN 'standby' ELSE NULL END;
  v_mult := CASE v_type
    WHEN 'ot1' THEN 1.5 WHEN 'ot2' THEN 2.0
    WHEN 'weekend' THEN 2.0 WHEN 'holiday' THEN 2.0
    WHEN 'standby' THEN 1.0 ELSE 1.0 END;

  IF p_employee_rate_id IS NOT NULL THEN
    SELECT r.cost_rate, r.sale_rate, r.multiplier, r.id
      INTO r_cost, r_sale, r_mult, r_id
      FROM employee_overtime_rates r WHERE r.id = p_employee_rate_id;
  END IF;
  IF r_id IS NULL AND v_code IS NOT NULL THEN
    SELECT r.cost_rate, r.sale_rate, r.multiplier, r.id
      INTO r_cost, r_sale, r_mult, r_id
      FROM employee_overtime_rates r
      WHERE r.employee_id = p_employee_id AND r.code = v_code AND r.is_active
      ORDER BY r.sort_order LIMIT 1;
  END IF;

  IF r_id IS NOT NULL THEN
    RETURN QUERY SELECT
      COALESCE(r_cost, ROUND((v_base_cost * COALESCE(r_mult, v_mult))::numeric, 2)),
      COALESCE(r_sale, ROUND((v_base_sale * COALESCE(r_mult, v_mult))::numeric, 2)),
      r_id;
  ELSE
    RETURN QUERY SELECT
      ROUND((v_base_cost * v_mult)::numeric, 2),
      ROUND((v_base_sale * v_mult)::numeric, 2),
      NULL::uuid;
  END IF;
END;
$$;

-- 3) Udvid snapshot-triggerfunktionen til at bruge satstypen
CREATE OR REPLACE FUNCTION time_logs_set_cost_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_hours   numeric(10,2);
  v_cost    numeric(10,2);
  v_sale    numeric(10,2);
  v_rate_id uuid;
BEGIN
  IF NEW.end_time IS NULL THEN
    NEW.cost_amount := NULL; NEW.sale_amount := NULL;
    NEW.cost_rate_snapshot := NULL; NEW.sale_rate_snapshot := NULL;
    RETURN NEW;
  END IF;

  NEW.pay_rate_type := COALESCE(NEW.pay_rate_type, 'normal');
  v_hours := ROUND((EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0)::numeric, 2);

  SELECT c.cost_rate, c.sale_rate, c.used_rate_id
    INTO v_cost, v_sale, v_rate_id
    FROM compute_time_log_rates(NEW.employee_id, NEW.pay_rate_type, NEW.employee_rate_id) c;

  NEW.cost_rate_snapshot := v_cost;
  NEW.sale_rate_snapshot := v_sale;
  IF NEW.employee_rate_id IS NULL AND v_rate_id IS NOT NULL THEN
    NEW.employee_rate_id := v_rate_id;
  END IF;

  NEW.cost_amount := ROUND((GREATEST(v_hours, 0) * NEW.cost_rate_snapshot)::numeric, 2);
  NEW.sale_amount := ROUND((GREATEST(v_hours, 0) * NEW.sale_rate_snapshot)::numeric, 2);
  RETURN NEW;
END;
$$;

-- 4) Genskab triggeren så den OGSÅ fyrer ved sats-type-/rate-id-ændring
DROP TRIGGER IF EXISTS trg_time_logs_cost_amount ON time_logs;
CREATE TRIGGER trg_time_logs_cost_amount
  BEFORE INSERT OR UPDATE OF end_time, employee_id, pay_rate_type, employee_rate_id
  ON time_logs FOR EACH ROW EXECUTE FUNCTION time_logs_set_cost_amount();

NOTIFY pgrst, 'reload schema';

COMMIT;
