-- 00213: montør må via REST kun ændre STATUS (+ completed_at) på egne arbejdsordrer, og kun fra planned/in_progress.
-- Planlægnings-review 2026-10-09 (#2, S2): politikken work_orders_update_role (00181) tjekker kun at rækken er tildelt
-- montørens medarbejder og at ny status er in_progress/done — ingen kolonnebegrænsning og intet krav til gammel status.
-- En montør kunne med anon-nøgle + egen JWT flytte case_id til en anden (også lukket) sag (timernes kost/fakturering
-- følger med), gøre en annulleret ordre 'done' (udløser profit-snapshot uden overgangs-/timer-tjek) eller ændre
-- dato/titel/kunde/auto_invoice_on_done/low_profit.
--
-- Appen skriver som montør KUN { status, completed_at } (changeWorkOrderStatus, compare-and-set på status) — kompatibel.
-- Admin/serviceleder og service_role er uændrede. Interne trigger-opdateringer (low_profit fra profit-snapshot, der
-- kører i montørens session når en ordre afsluttes) undtages via pg_trigger_depth().
-- Ingen dataændring. Kolonne-grants (som 00208) er fravalgt, fordi admin/serviceleder skriver mange kolonner via samme
-- 'authenticated'-rolle.

BEGIN;

CREATE OR REPLACE FUNCTION public.work_orders_montor_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Indlejrede opdateringer fra andre triggere (fx low_profit efter snapshot) er ikke brugerens egne skrivninger
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF current_user <> 'authenticated' OR public.user_role() IS DISTINCT FROM 'montør' THEN
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('planned', 'in_progress') THEN
    RAISE EXCEPTION 'Arbejdsordren er afsluttet eller annulleret og kan ikke ændres' USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['status', 'completed_at', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'completed_at', 'updated_at']) THEN
    RAISE EXCEPTION 'Montør må kun ændre status på egne arbejdsordrer' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_orders_montor_update_guard ON public.work_orders;
CREATE TRIGGER trg_work_orders_montor_update_guard
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.work_orders_montor_update_guard();

COMMIT;
