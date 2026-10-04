-- 00185 — N2: godkendelse af timer (montør registrerer → serviceleder/admin godkender)
--
-- Beslutning (Henrik 2026-10-02): "Ja til time approval: montør registrerer → serviceleder/admin godkender. Design på
-- staging. Ingen payroll/finance-side effects endnu." → kun status + hvem/hvornår; fakturering, løn og e-conomic
-- påvirkes IKKE af godkendelsen (endnu).
--
-- Model:
--   * approval_status 'pending' | 'approved' | 'rejected' (default pending), approved_by/approved_at, rejection_reason.
--   * Eksisterende rækker markeres 'approved' (registreret før godkendelsesflowet; approved_by = NULL) → ingen kø af
--     gamle timer.
--   * Beskyttelse (bruger-session, auth.uid() sat): godkendelsesfelterne kan IKKE sættes/ændres via REST — en montør
--     kan ellers godkende sine egne timer (time_logs_update_by_scope tillader ham at rette egne rækker). INSERT tvinges
--     til 'pending'. Retter en bruger tid/ordre/beskrivelse/fakturerbar på en godkendt/afvist række, sættes den
--     tilbage til 'pending' (skal godkendes igen).
--   * Godkend/afvis sker i server-action med tilladelsen time_logs.approve (admin, serviceleder) og skrives med
--     service-role (auth.uid() er NULL) — triggeren lader den passere.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_time_logs_approval_guard ON public.time_logs;
--   DROP FUNCTION IF EXISTS public.time_logs_approval_guard();
--   DROP INDEX IF EXISTS public.idx_time_logs_approval_pending;
--   ALTER TABLE public.time_logs DROP COLUMN IF EXISTS rejection_reason, DROP COLUMN IF EXISTS approved_at,
--     DROP COLUMN IF EXISTS approved_by, DROP COLUMN IF EXISTS approval_status;

BEGIN;

ALTER TABLE public.time_logs
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_logs_approval_status_check') THEN
    ALTER TABLE public.time_logs ADD CONSTRAINT time_logs_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

COMMENT ON COLUMN public.time_logs.approval_status IS
  'N2: pending/approved/rejected. Sættes kun via server-action (time_logs.approve) med service-role; ingen løn-/finance-effekt endnu.';

-- Historik: alt registreret før flowet regnes som godkendt. Kun ved første kørsel: backfill springes over, så snart
-- én række har været igennem flowet (approved_at sat eller afvist) — en genkørsel godkender ikke nye ventende timer.
UPDATE public.time_logs SET approval_status = 'approved', approved_at = created_at
 WHERE approval_status = 'pending' AND approved_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.time_logs t2 WHERE t2.approved_at IS NOT NULL OR t2.approval_status = 'rejected');

CREATE INDEX IF NOT EXISTS idx_time_logs_approval_pending ON public.time_logs (employee_id, start_time)
  WHERE approval_status = 'pending';

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
       OR NEW.pay_rate_type IS DISTINCT FROM OLD.pay_rate_type) THEN
    NEW.approval_status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.rejection_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.time_logs_approval_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_time_logs_approval_guard ON public.time_logs;
CREATE TRIGGER trg_time_logs_approval_guard
  BEFORE INSERT OR UPDATE ON public.time_logs
  FOR EACH ROW EXECUTE FUNCTION public.time_logs_approval_guard();

NOTIFY pgrst, 'reload schema';
COMMIT;
