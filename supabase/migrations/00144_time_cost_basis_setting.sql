-- =====================================================================
-- 00144: Sprint Ø2.11 — firmastyret kostbasis for timeøkonomi
-- =====================================================================
--
-- BESLUTNING (CTO-prioritet C: firmaindstilling)
--   company_settings får en valgbar kostbasis for rate engine:
--     time_cost_basis ∈ {real_hourly_cost, internal_cost_rate, fixed_standard_rate}
--     time_cost_rate  = fast standardkost (kr/t) brugt ved fixed_standard_rate
--   Default = 'real_hourly_cost' (uændret adfærd ift. Ø2.10).
--
-- RATE ENGINE
--   compute_time_log_rates() vælger base_cost ud fra firmaindstillingen:
--     real_hourly_cost   → COALESCE(real_hourly_cost, cost_rate, 400)
--     internal_cost_rate → COALESCE(cost_rate, real_hourly_cost, 400)
--     fixed_standard_rate→ COALESCE(time_cost_rate, cost_rate, real_hourly_cost, 400)
--   Salgsbasis uændret: employees.hourly_rate (fallback 495).
--
-- HISTORISK IMMUTABILITET
--   Triggeren fyrer kun ved time_log-ændring → eksisterende time_logs'
--   snapshots/økonomi er UÆNDREDE ved skift af kostbasis. Kun nye/redigerede
--   timer bruger den nye basis.
--
-- ROLLBACK: gendan 00143-versionen af compute_time_log_rates; DROP COLUMN
--   time_cost_basis, time_cost_rate. NOTIFY pgrst.
-- =====================================================================

BEGIN;

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS time_cost_basis text NOT NULL DEFAULT 'real_hourly_cost';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS time_cost_rate numeric(10,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_time_cost_basis_chk') THEN
    ALTER TABLE company_settings ADD CONSTRAINT company_settings_time_cost_basis_chk
      CHECK (time_cost_basis IN ('real_hourly_cost','internal_cost_rate','fixed_standard_rate'));
  END IF;
END $$;

COMMENT ON COLUMN company_settings.time_cost_basis IS
  'Kostbasis for time_logs rate engine: real_hourly_cost|internal_cost_rate|fixed_standard_rate.';
COMMENT ON COLUMN company_settings.time_cost_rate IS
  'Fast standard intern timekost (kr/t) brugt når time_cost_basis = fixed_standard_rate.';

CREATE OR REPLACE FUNCTION compute_time_log_rates(
  p_employee_id uuid,
  p_pay_rate_type text,
  p_employee_rate_id uuid
)
RETURNS TABLE(cost_rate numeric, sale_rate numeric, used_rate_id uuid)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_cost_rate_emp numeric(10,2);
  v_rhc           numeric(10,2);
  v_base_cost     numeric(10,2);
  v_base_sale     numeric(10,2);
  v_basis         text;
  v_fixed         numeric(10,2);
  v_type text := COALESCE(p_pay_rate_type, 'normal');
  v_code text;
  v_mult numeric;
  r_cost numeric; r_sale numeric; r_mult numeric; r_id uuid;
BEGIN
  -- Medarbejderens basis-tal.
  SELECT e.cost_rate, ec.real_hourly_cost, COALESCE(e.hourly_rate, 495)
    INTO v_cost_rate_emp, v_rhc, v_base_sale
    FROM employees e
    LEFT JOIN employee_compensation ec ON ec.employee_id = e.id
   WHERE e.id = p_employee_id;
  v_base_sale := COALESCE(v_base_sale, 495);

  -- Firmaindstilling for kostbasis (singleton).
  SELECT cs.time_cost_basis, cs.time_cost_rate INTO v_basis, v_fixed
    FROM company_settings cs ORDER BY cs.created_at NULLS LAST LIMIT 1;
  v_basis := COALESCE(v_basis, 'real_hourly_cost');

  v_base_cost := CASE v_basis
    WHEN 'internal_cost_rate'  THEN COALESCE(v_cost_rate_emp, v_rhc, 400)
    WHEN 'fixed_standard_rate' THEN COALESCE(v_fixed, v_cost_rate_emp, v_rhc, 400)
    ELSE                            COALESCE(v_rhc, v_cost_rate_emp, 400)  -- real_hourly_cost
  END;
  v_base_cost := COALESCE(v_base_cost, 400);

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
