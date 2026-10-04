-- 00189 — Q12/M2 (montør-review 2026-10-04): fakturerede timeregistreringer låses på databaseniveau.
--
-- Problem: låsen fandtes kun i server-action updateTimeLog. RLS (time_logs_update_by_scope) lader en montør opdatere
-- egne rækker direkte via REST (offentlig anon-nøgle + eget login), fx `PATCH time_logs?id=eq.X {"invoice_line_id":null}`
-- → rækken er "ufaktureret" igen og kommer med på næste fakturakladde (dobbeltfakturering); ændret end_time på en
-- faktureret række ændrer sale_amount stille.
--
-- Model (samme mønster som 00185):
--   * Bruger-session (auth.uid() sat): invoice_line_id kan ikke sættes/ændres/fjernes; en række med invoice_line_id
--     kan hverken ændres eller slettes; INSERT med invoice_line_id afvises.
--   * Service-role (auth.uid() IS NULL) passerer uændret: fakturering (invoice-from-case / invoice-stage binder
--     linjer), sletning af fakturakladde (frigiver linjer), godkendelse (time-approval).
--
-- Prod før (read-only 2026-10-04): 1 time_log, 1 montør. Ingen eksisterende rækker ændres.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_time_logs_invoice_lock ON public.time_logs;
--   DROP TRIGGER IF EXISTS trg_time_logs_invoice_lock_delete ON public.time_logs;
--   DROP FUNCTION IF EXISTS public.time_logs_invoice_lock();
--   NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE OR REPLACE FUNCTION public.time_logs_invoice_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- service-role (fakturering, frigivelse ved sletning af kladde, godkendelse) passerer
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_line_id IS NOT NULL THEN
      RAISE EXCEPTION 'invoice_line_id kan kun sættes af faktureringen' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.invoice_line_id IS NOT NULL THEN
    RAISE EXCEPTION 'Timeregistreringen er faktureret og kan ikke ændres eller slettes' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.invoice_line_id IS DISTINCT FROM OLD.invoice_line_id THEN
    RAISE EXCEPTION 'invoice_line_id kan kun sættes af faktureringen' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.time_logs_invoice_lock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_time_logs_invoice_lock ON public.time_logs;
CREATE TRIGGER trg_time_logs_invoice_lock
  BEFORE INSERT OR UPDATE ON public.time_logs
  FOR EACH ROW EXECUTE FUNCTION public.time_logs_invoice_lock();

DROP TRIGGER IF EXISTS trg_time_logs_invoice_lock_delete ON public.time_logs;
CREATE TRIGGER trg_time_logs_invoice_lock_delete
  BEFORE DELETE ON public.time_logs
  FOR EACH ROW EXECUTE FUNCTION public.time_logs_invoice_lock();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verifikation (staging, efter godkendelse):
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.time_logs'::regclass AND tgname LIKE 'trg_time_logs_invoice_lock%';
--   Som montør-session: PATCH en faktureret række → 42501; PATCH invoice_line_id → 42501.
--   Som service-role: fakturér en sag med timer (U32/U35) → linjer bindes som før; slet kladde → frigives (U33).
