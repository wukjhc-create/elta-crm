-- 00208 — time_logs: kolonne-niveau skriveret + sats-ejerskab (review 2026-10-08, S1).
-- STATUS: UDKAST — BLOCKED_APPROVAL. Ikke kørt på staging eller prod.
--
-- Fund (prod read-only, scripts/prod-time-logs-update-privs.ts): authenticated har UPDATE på ALLE kolonner i time_logs;
-- politikken time_logs_update_by_scope afgrænser kun RÆKKER (can_write_time_log). En montør kan derfor via REST på egne
-- timer sætte sale_amount/cost_amount/cost_rate_snapshot/sale_rate_snapshot/hours (triggeren 00142 genberegner kun ved
-- ændring af end_time/employee_id/pay_rate_type/employee_rate_id), nulstille invoice_line_id (frigiver fakturerede timer)
-- eller vælge en kollegas/inaktiv sats — og godkendelsen nulstilles ikke for disse felter.
--
-- Appen skriver med bruger-klienten KUN: INSERT (work_order_id, employee_id, start_time, end_time, pay_rate_type,
-- employee_rate_id, description, billable) og UPDATE (start_time, end_time, description, billable, pay_rate_type,
-- employee_rate_id) — time-logs.ts. Beløb/timer sættes af triggere; godkendelse og fakturabinding med admin-klienten.
-- Kolonne-grants gælder kun sætninger fra bruger-sessioner, ikke triggeres egne tildelinger.
--
-- Indeholder også 00205's guard-udvidelse (employee_rate_id nulstiller godkendelsen) + ejerskabstjek af satsen.
-- Kører 00205 også, skal 00208 køres EFTER (CREATE OR REPLACE — sidste version vinder; 00208 er en overmængde).
--
-- Pre/post: scripts/prod-time-logs-update-privs.ts (post: kun de 6 UPDATE-kolonner = JA). Persona-test på staging:
-- montør PATCH sale_amount → 42501; montør retter egen sluttid → ok (og godkendelse nulstilles).
-- Rollback: GRANT INSERT, UPDATE ON public.time_logs TO authenticated; genkør guard fra 00185.

BEGIN;

REVOKE INSERT, UPDATE ON public.time_logs FROM authenticated;
GRANT INSERT (work_order_id, employee_id, start_time, end_time, pay_rate_type, employee_rate_id, description, billable)
  ON public.time_logs TO authenticated;
GRANT UPDATE (start_time, end_time, description, billable, pay_rate_type, employee_rate_id)
  ON public.time_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.time_logs_approval_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Service-role (server-action efter tilladelsestjek, cron): ingen begrænsning.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- 00208: satsen skal tilhøre medarbejderen og være aktiv (før kun tjekket i appen — REST kunne vælge en kollegas sats)
  IF NEW.employee_rate_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.employee_rate_id IS DISTINCT FROM OLD.employee_rate_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.employee_overtime_rates r
                    WHERE r.id = NEW.employee_rate_id AND r.employee_id = NEW.employee_id AND COALESCE(r.is_active, true)) THEN
      RAISE EXCEPTION 'Satsen hører ikke til medarbejderen eller er inaktiv' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.approval_status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.rejection_reason := NULL;
    RETURN NEW;
  END IF;
  -- UPDATE fra bruger-session: godkendelsesfelterne er skrivebeskyttede
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION 'Godkendelse af timer kan kun ændres via godkendelsesflowet' USING ERRCODE = '42501';
  END IF;
  -- Ændret registrering på en godkendt/afvist række → skal godkendes igen
  IF OLD.approval_status <> 'pending' AND (
       NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time
       OR NEW.work_order_id IS DISTINCT FROM OLD.work_order_id OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.description IS DISTINCT FROM OLD.description OR NEW.billable IS DISTINCT FROM OLD.billable
       OR NEW.pay_rate_type IS DISTINCT FROM OLD.pay_rate_type
       -- 00205: satsskift ændrer kost/salg (00142-triggeren) → kræver ny godkendelse
       OR NEW.employee_rate_id IS DISTINCT FROM OLD.employee_rate_id) THEN
    NEW.approval_status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.rejection_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
