-- 00194 — FORSLAG (IKKE anvendt nogen steder; kræver Henriks godkendelse, staging først)
--
-- Problem (statisk skematjek 2026-10-06): tabellen system_alerts findes ikke i prod/staging (00046 blev aldrig kørt
-- for denne del). Derfor går disse notifikationer tabt i dag — klokken i topbaren er altid tom:
--   - "Fuldmagt underskrevet"      (portal → fuldmagt.ts → createSystemAlertAdmin)
--   - "Besigtigelse bekræftet"     (portal.ts → createSystemAlertAdmin)
--   - prisadvarsler fra cron/intelligence-check og kalkulations-intelligens
-- NB adfærdsændring ved anvendelse: cron/intelligence-check begynder at oprette prisadvarsler i klokken.
--
-- Design (strammere end 00046's USING(true)):
--   - Oprettelse KUN via service_role (createSystemAlertAdmin/cron); authenticated får ingen INSERT/DELETE
--   - Læse + markér læst/afvis: kontor-roller (admin, serviceleder, salg, bogholderi) — montør ser ikke kundenavne her
--   - UPDATE begrænset til status-kolonnerne via kolonne-GRANT
--
-- Rollback: DROP TABLE public.system_alerts;  (ingen andre objekter afhænger af den)

BEGIN;

CREATE TABLE IF NOT EXISTS public.system_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type    text NOT NULL,
  severity      text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title         text NOT NULL,
  message       text NOT NULL,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  entity_type   text,
  entity_id     uuid,
  is_read       boolean NOT NULL DEFAULT false,
  is_dismissed  boolean NOT NULL DEFAULT false,
  read_at       timestamptz,
  dismissed_at  timestamptz,
  dismissed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_open ON public.system_alerts (created_at DESC) WHERE NOT is_dismissed;
CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON public.system_alerts (alert_type);
CREATE INDEX IF NOT EXISTS idx_system_alerts_entity ON public.system_alerts (entity_type, entity_id);

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_alerts_select_office ON public.system_alerts
  FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'salg', 'bogholderi'));

CREATE POLICY system_alerts_update_office ON public.system_alerts
  FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'salg', 'bogholderi'))
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'bogholderi'));

REVOKE ALL ON public.system_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.system_alerts TO authenticated;
GRANT UPDATE (is_read, is_dismissed, read_at, dismissed_at, dismissed_by) ON public.system_alerts TO authenticated;
GRANT ALL ON public.system_alerts TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
