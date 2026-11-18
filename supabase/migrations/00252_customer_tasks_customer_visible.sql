-- =====================================================================
-- 00252: eksplicit kundesynlighed for kundeopgaver (portal-sikkerhedsreview 2026-11-18)
-- Runbook: docs/runbooks/PORTAL_SECURITY_REVIEW.md. (00251 er reserveret til CA-3-forslaget — ikke brugt her.)
--
-- Før: kundeportalen udledte synlighed af TITLEN ("Besigtigelse hos …" uden auto_rule). En intern opgave med den titel
-- blev vist (dato + status) og kunne bekræftes/ombookes af kunden. Nu: en opgave er kun kundevendt, når serveren
-- eksplicit har markeret den — efter at kunden faktisk har fået booking-bekræftelsen (bookBesigtigelse), eller når
-- kunden selv har oprettet den (portalBookBesigtigelse).
--
--  * customer_visible BOOLEAN NOT NULL DEFAULT false — ALLE eksisterende opgaver bliver private (ingen backfill).
--    Konstant standardværdi ⇒ ingen tabelomskrivning.
--  * Værn (BEFORE INSERT OR UPDATE): en indlogget bruger (REST som `authenticated`) kan hverken oprette en kundesynlig
--    opgave eller ændre flaget. Kun service_role (serverens kontrollerede stier bag deres egne rettighedstjek) kan.
--    Samme mønster som customer_tasks_write_guard (00235): indlejrede triggere og service-role er uberørte.
--  * Ingen RLS-/grant-ændring: kolonnen følger customer_tasks' eksisterende politikker (medarbejdere læser den som før).
--
-- Rollback (bevist på staging, docs/runbooks/sql/00252_rollback.sql):
--   DROP TRIGGER IF EXISTS trg_customer_tasks_visibility_guard ON public.customer_tasks;
--   DROP FUNCTION IF EXISTS public.customer_tasks_visibility_guard();
--   ALTER TABLE public.customer_tasks DROP COLUMN IF EXISTS customer_visible;
-- =====================================================================
BEGIN;

ALTER TABLE public.customer_tasks ADD COLUMN IF NOT EXISTS customer_visible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customer_tasks.customer_visible IS
  'Kundevendt (vises i kundeportalen). Standard false = intern. Sættes kun af serveren (service_role): efter afsendt booking-bekræftelse eller ved kundens egen portal-anmodning.';

CREATE OR REPLACE FUNCTION public.customer_tasks_visibility_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- kun brugerens egne REST-skrivninger; service_role/cron og indlejrede triggere er uberørte
  IF pg_trigger_depth() > 1 OR current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.customer_visible THEN
    RAISE EXCEPTION 'Kundesynlighed sættes kun af serveren' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.customer_visible IS DISTINCT FROM OLD.customer_visible THEN
    RAISE EXCEPTION 'Kundesynlighed kan ikke ændres direkte' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.customer_tasks_visibility_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_customer_tasks_visibility_guard ON public.customer_tasks;
CREATE TRIGGER trg_customer_tasks_visibility_guard
  BEFORE INSERT OR UPDATE ON public.customer_tasks
  FOR EACH ROW EXECUTE FUNCTION public.customer_tasks_visibility_guard();

COMMIT;
