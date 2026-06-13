-- =====================================================================
-- 00143: Sprint Ø2.10 — real_hourly_cost som primær kostbasis i rate engine
-- =====================================================================
--
-- BESLUTNING (CTO-prioritet)
--   employee_compensation.real_hourly_cost er en GENERATED STORED kolonne
--   (wage × (1 + Σpct%) + social_costs) — altid beregnet, stabil. Den er den
--   mest korrekte fuldt belastede timekost. Vi gør den til PRIMÆR kostbasis
--   i rate engine; employees.cost_rate (mirror af internal_cost_rate) er
--   fallback; 400 er sidste fallback.
--
--   Salgsbasis er uændret: employees.hourly_rate (fallback 495).
--
-- ÆNDRING
--   KUN compute_time_log_rates() ændres: base_cost = COALESCE(
--     employee_compensation.real_hourly_cost, employees.cost_rate, 400).
--   Trigger + amounts uændret.
--
-- HISTORISK IMMUTABILITET
--   Triggeren fyrer kun ved ændring af time_log-felter (end_time/employee_id/
--   pay_rate_type/employee_rate_id) — ALDRIG ved sats-/kompensationsændring.
--   Eksisterende time_logs' snapshots/økonomi er derfor UÆNDREDE. Kun nye/
--   redigerede timer bruger den nye kostbasis.
--
-- ROLLBACK: gendan 00142-versionen af compute_time_log_rates (base_cost =
--   COALESCE(employees.cost_rate, 400)). NOTIFY pgrst.
-- =====================================================================

BEGIN;

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
  -- Primær kostbasis = real_hourly_cost; fallback cost_rate; fallback 400.
  SELECT COALESCE(ec.real_hourly_cost, e.cost_rate, 400),
         COALESCE(e.hourly_rate, 495)
    INTO v_base_cost, v_base_sale
    FROM employees e
    LEFT JOIN employee_compensation ec ON ec.employee_id = e.id
   WHERE e.id = p_employee_id;
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

NOTIFY pgrst, 'reload schema';

COMMIT;
