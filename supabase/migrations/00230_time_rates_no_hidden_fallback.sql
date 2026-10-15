-- =====================================================
-- Migration 00230: ingen skjult standardpris i tidsregistreringens sats-motor (PR-4b, DB-delen)
--
-- STATUS: GODKENDT af Henrik 2026-10-15 ("00230 GODKENDT TIL PROD").
--
-- Før: compute_time_log_rates() faldt stille tilbage til 495 kr/t (salg) og 400 kr/t (kost) når medarbejderen manglede
-- sats → en afsluttet tidsregistrering blev frosset med en gættet pris.
-- Nu: mangler den sats der faktisk skal bruges, kastes en dansk fejl med medarbejderens navn og hvilken sats der mangler.
--   Intet skrives (ingen 0/400/495). Appen blokerer allerede før (PR-4b, commit 59650486) — dette dækker alle andre
--   skrivestier (SQL, scripts, fremtidig kode).
-- Data: INGEN eksisterende rækker ændres. Triggeren (trg_time_logs_cost_amount) kører kun ved INSERT og ved UPDATE af
--   end_time/employee_id/pay_rate_type/employee_rate_id — godkendelse og fakturabinding genberegner ikke → frosne
--   snapshots røres ikke.
-- Kostbasis (company_settings.time_cost_basis) bevares: real_hourly_cost → real kost, ellers medarbejderens kostpris;
--   internal_cost_rate → kostpris, ellers real kost; fixed_standard_rate → firmaets faste sats, ellers kost/real kost.
--   Kun det sidste skjulte 400-fald fjernes.
-- Overtid/særsatser: en eksplicit sats på employee_overtime_rates bruges som før; ellers basis × multiplikator — mangler
--   basis, fejler det.
-- ACL: compute_time_log_rates kan ikke kaldes direkte af anon/authenticated (ingen sats-lækage via RPC); trigger-funktionen
--   er SECURITY DEFINER (fast search_path) og kalder den som ejer. Triggere fyrer uden EXECUTE-ret.
-- Rollback: genskab compute_time_log_rates fra 00144 (med COALESCE 495/400) — GENÅBN IKKE anon EXECUTE.
-- Pre/post: npx tsx scripts/prod-check-00230.ts
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_time_log_rates(p_employee_id uuid, p_pay_rate_type text, p_employee_rate_id uuid)
 RETURNS TABLE(cost_rate numeric, sale_rate numeric, used_rate_id uuid)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_name          text;
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
  o_cost numeric; o_sale numeric;
BEGIN
  -- Medarbejderens basis-tal — INGEN standardpris (00230)
  SELECT e.name, e.cost_rate, ec.real_hourly_cost, e.hourly_rate
    INTO v_name, v_cost_rate_emp, v_rhc, v_base_sale
    FROM employees e
    LEFT JOIN employee_compensation ec ON ec.employee_id = e.id
   WHERE e.id = p_employee_id;

  -- Firmaindstilling for kostbasis (singleton).
  SELECT cs.time_cost_basis, cs.time_cost_rate INTO v_basis, v_fixed
    FROM company_settings cs ORDER BY cs.created_at NULLS LAST LIMIT 1;
  v_basis := COALESCE(v_basis, 'real_hourly_cost');

  v_base_cost := CASE v_basis
    WHEN 'internal_cost_rate'  THEN COALESCE(v_cost_rate_emp, v_rhc)
    WHEN 'fixed_standard_rate' THEN COALESCE(v_fixed, v_cost_rate_emp, v_rhc)
    ELSE                            COALESCE(v_rhc, v_cost_rate_emp)  -- real_hourly_cost
  END;

  IF v_type = 'normal' THEN
    o_cost := v_base_cost;
    o_sale := v_base_sale;
    r_id := NULL;
  ELSE
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
      o_cost := COALESCE(r_cost, ROUND((v_base_cost * COALESCE(r_mult, v_mult))::numeric, 2));
      o_sale := COALESCE(r_sale, ROUND((v_base_sale * COALESCE(r_mult, v_mult))::numeric, 2));
    ELSE
      o_cost := ROUND((v_base_cost * v_mult)::numeric, 2);
      o_sale := ROUND((v_base_sale * v_mult)::numeric, 2);
    END IF;
  END IF;

  IF o_sale IS NULL THEN
    RAISE EXCEPTION 'Medarbejderen "%" mangler timepris (salg) — sæt den under Medarbejdere, før tiden registreres', COALESCE(v_name, 'ukendt')
      USING ERRCODE = 'P0001', HINT = 'missing_sale_rate';
  END IF;
  IF o_cost IS NULL THEN
    RAISE EXCEPTION 'Medarbejderen "%" mangler kostpris (intern timekost) — sæt den under Medarbejdere, før tiden registreres', COALESCE(v_name, 'ukendt')
      USING ERRCODE = 'P0001', HINT = 'missing_cost_rate';
  END IF;

  RETURN QUERY SELECT o_cost, o_sale, r_id;
END;
$function$;

-- Trigger-funktionen køres som ejer (SECURITY DEFINER, fast search_path), så satserne altid læses korrekt uanset
-- brugerens RLS-synlighed, og så compute_time_log_rates kan lukkes for direkte kald (ingen sats-lækage via RPC).
-- Kroppen er uændret i forhold til prod (00142).
CREATE OR REPLACE FUNCTION public.time_logs_set_cost_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.compute_time_log_rates(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.time_logs_set_cost_amount() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_time_log_rates(uuid, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
