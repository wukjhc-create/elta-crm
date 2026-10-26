-- =====================================================================
-- 00238 — PERM-1 fase 2: lagring af per-medarbejder-rettigheder (basisrolle + GRANT/REVOKE)
--
-- GODKENDT 2026-10-26 TIL STAGING (Henrik). PROD KRÆVER SÆRSKILT GODKENDELSE.
-- Arkitektur: docs/runbooks/per-employee-permissions-architecture.md
-- Forudsætning opfyldt: fase 1 (server-kerne) bevist bagudkompatibel — 0 afvigelser for 5 roller × 112 nøgler uden
-- overrides (scripts/effective-permissions-test.ts) + ui-full 197/197 (2026-10-25).
--
-- Indhold (INGEN eksisterende policies, data eller adfærd ændres):
--   permission_catalog          112 nøgler, genereret fra src/lib/auth/permissions.ts (eneste kilde; CI: build-defaults --check)
--   role_permission_defaults    rollens standardnøgler, genereret fra samme kilde
--   user_permission_overrides   pr. profil og nøgle: grant/revoke, kilde (template/manual), begrundelse, hvem/hvornår
--   profiles.permission_template  valgt skabelon (nullable; ingen backfill)
--   user_has_permission(text)   override- og is_active-bevidst, fail-closed — bruges af INGEN policy endnu (fase 4)
-- Skrivning af overrides sker KUN via server-action (users.manage_roles) med admin-klient + audit — ingen REST-skrivning.
-- Erstatter de ubrugte 00108-tabeller permissions/role_permissions og 00108's user_has_permission (som ignorerede
-- is_active og overrides). De gamle tabeller droppes IKKE her (separat oprydning).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.permission_catalog (
  permission text PRIMARY KEY CHECK (permission ~ '^[a-z_]+(\.[a-z_]+)*$')
);

CREATE TABLE IF NOT EXISTS public.role_permission_defaults (
  role text NOT NULL CHECK (role IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi')),
  permission text NOT NULL REFERENCES public.permission_catalog(permission) ON DELETE CASCADE,
  PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission text NOT NULL REFERENCES public.permission_catalog(permission) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('grant', 'revoke')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('template', 'manual')),
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, permission)
);
CREATE INDEX IF NOT EXISTS idx_upo_profile ON public.user_permission_overrides(profile_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permission_template text
  CHECK (permission_template IS NULL OR permission_template IN ('montor', 'elektriker', 'overmontor', 'salg', 'serviceleder', 'bogholderi'));

-- RLS: læsning = egne overrides + admin; katalog/standarder er offentlige for indloggede. INGEN skrive-politik for
-- authenticated → kun service-role (server-action bag users.manage_roles) kan skrive.
ALTER TABLE public.permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permission_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permission_catalog_select ON public.permission_catalog;
CREATE POLICY permission_catalog_select ON public.permission_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS role_permission_defaults_select ON public.role_permission_defaults;
CREATE POLICY role_permission_defaults_select ON public.role_permission_defaults FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS user_permission_overrides_select ON public.user_permission_overrides;
CREATE POLICY user_permission_overrides_select ON public.user_permission_overrides FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.user_role() = 'admin');
REVOKE ALL ON public.permission_catalog, public.role_permission_defaults, public.user_permission_overrides FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.permission_catalog, public.role_permission_defaults, public.user_permission_overrides FROM authenticated;
GRANT SELECT ON public.permission_catalog, public.role_permission_defaults, public.user_permission_overrides TO authenticated;
-- Server-action (admin-klient bag users.manage_roles) skriver overrides som service_role; nye tabeller arver ikke
-- service_role-rettigheder i dette projekt (staging 2026-10-26: INSERT gav 42501) → eksplicit grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO service_role;
GRANT SELECT ON public.permission_catalog, public.role_permission_defaults TO service_role;

-- 00108's ubrugte user_has_permission(text, uuid DEFAULT auth.uid()) ville gøre et kald med ét argument tvetydigt (to
-- overloads matcher). Prod 2026-10-25 (scripts/prod-fn-references.ts): 0 policies, 0 funktioner, 0 views, 0 app-kald.
DROP FUNCTION IF EXISTS public.user_has_permission(text, uuid);

-- Effektiv rettighed: (rollens standard ∪ grants) − revokes; manglende/inaktiv profil = false (fail-closed, som 00237)
CREATE OR REPLACE FUNCTION public.user_has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (SELECT id, role FROM public.profiles WHERE id = auth.uid() AND is_active)
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM me) THEN false
    WHEN EXISTS (SELECT 1 FROM public.user_permission_overrides o JOIN me ON o.profile_id = me.id
                 WHERE o.permission = p_permission AND o.effect = 'revoke') THEN false
    WHEN EXISTS (SELECT 1 FROM public.user_permission_overrides o JOIN me ON o.profile_id = me.id
                 WHERE o.permission = p_permission AND o.effect = 'grant') THEN true
    ELSE EXISTS (SELECT 1 FROM public.role_permission_defaults d JOIN me ON d.role = me.role
                 WHERE d.permission = p_permission)
  END;
$$;
REVOKE ALL ON FUNCTION public.user_has_permission(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(text) TO authenticated;

-- >>> GENERERET SEED (scripts/permissions/build-defaults.ts) — ret ikke manuelt
INSERT INTO public.permission_catalog (permission) VALUES
  ('absences.manage'),
  ('absences.view'),
  ('bank.edit'),
  ('bank.view'),
  ('calendar.plan'),
  ('calendar.view'),
  ('calendar.view.all'),
  ('calendar.view.own'),
  ('calendar.view.team'),
  ('cases.close'),
  ('cases.create'),
  ('cases.delete'),
  ('cases.edit'),
  ('cases.edit.own'),
  ('cases.view.all'),
  ('cases.view.assigned'),
  ('customers.create'),
  ('customers.delete'),
  ('customers.edit'),
  ('customers.emails.view'),
  ('customers.view'),
  ('documents.delete'),
  ('economy.cost_prices'),
  ('economy.edit'),
  ('economy.view'),
  ('employees.edit'),
  ('employees.payroll.edit'),
  ('employees.payroll.view'),
  ('employees.view'),
  ('inbox.delete'),
  ('inbox.send'),
  ('inbox.view'),
  ('incoming_invoices.approve'),
  ('incoming_invoices.edit'),
  ('incoming_invoices.view'),
  ('invoices.create'),
  ('invoices.credit'),
  ('invoices.delete_draft'),
  ('invoices.mark_paid'),
  ('invoices.send'),
  ('invoices.view.all'),
  ('invoices.view.own_cases'),
  ('leads.create'),
  ('leads.delete'),
  ('leads.edit'),
  ('leads.view'),
  ('materials.add_to_case'),
  ('materials.delete'),
  ('materials.edit'),
  ('materials.view'),
  ('materials.view.cost_prices'),
  ('offers.approve'),
  ('offers.create'),
  ('offers.delete'),
  ('offers.edit'),
  ('offers.send'),
  ('offers.view'),
  ('offers.view.all'),
  ('offers.view.cost_prices'),
  ('other_costs.add_to_case'),
  ('other_costs.delete'),
  ('other_costs.edit'),
  ('other_costs.view'),
  ('products.view.cost_prices'),
  ('reports.export'),
  ('reports.view'),
  ('service.close'),
  ('service.create'),
  ('service.delete'),
  ('service.edit'),
  ('service.view'),
  ('settings.economic'),
  ('settings.manage'),
  ('settings.suppliers'),
  ('settings.view'),
  ('suppliers.credentials'),
  ('tasks.create'),
  ('tasks.delete'),
  ('tasks.edit'),
  ('tasks.menu'),
  ('tasks.view'),
  ('time.delete'),
  ('time.edit_all'),
  ('time.edit_own'),
  ('time.log'),
  ('time.view_all'),
  ('time.view_own'),
  ('time_logs.approve'),
  ('time_logs.create'),
  ('time_logs.delete'),
  ('time_logs.edit.all'),
  ('time_logs.edit.own'),
  ('time_logs.view.all'),
  ('time_logs.view.own'),
  ('tools.ai_project'),
  ('tools.calculations'),
  ('tools.packages'),
  ('tools.pricing'),
  ('tools.products'),
  ('tools.reports'),
  ('tools.solar_calc'),
  ('users.create'),
  ('users.delete'),
  ('users.edit'),
  ('users.manage_roles'),
  ('users.view'),
  ('work_orders.complete'),
  ('work_orders.delete'),
  ('work_orders.edit'),
  ('work_orders.plan'),
  ('work_orders.view.all'),
  ('work_orders.view.assigned')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_defaults (role, permission) VALUES
  ('admin', 'absences.manage'),
  ('serviceleder', 'absences.manage'),
  ('admin', 'absences.view'),
  ('bogholderi', 'absences.view'),
  ('serviceleder', 'absences.view'),
  ('admin', 'bank.edit'),
  ('bogholderi', 'bank.edit'),
  ('admin', 'bank.view'),
  ('bogholderi', 'bank.view'),
  ('admin', 'calendar.plan'),
  ('serviceleder', 'calendar.plan'),
  ('admin', 'calendar.view'),
  ('montør', 'calendar.view'),
  ('serviceleder', 'calendar.view'),
  ('admin', 'calendar.view.all'),
  ('serviceleder', 'calendar.view.all'),
  ('admin', 'calendar.view.own'),
  ('montør', 'calendar.view.own'),
  ('serviceleder', 'calendar.view.own'),
  ('admin', 'calendar.view.team'),
  ('serviceleder', 'calendar.view.team'),
  ('admin', 'cases.close'),
  ('serviceleder', 'cases.close'),
  ('admin', 'cases.create'),
  ('salg', 'cases.create'),
  ('serviceleder', 'cases.create'),
  ('admin', 'cases.delete'),
  ('admin', 'cases.edit'),
  ('serviceleder', 'cases.edit'),
  ('admin', 'cases.edit.own'),
  ('montør', 'cases.edit.own'),
  ('serviceleder', 'cases.edit.own'),
  ('admin', 'cases.view.all'),
  ('bogholderi', 'cases.view.all'),
  ('serviceleder', 'cases.view.all'),
  ('admin', 'cases.view.assigned'),
  ('bogholderi', 'cases.view.assigned'),
  ('montør', 'cases.view.assigned'),
  ('salg', 'cases.view.assigned'),
  ('serviceleder', 'cases.view.assigned'),
  ('admin', 'customers.create'),
  ('salg', 'customers.create'),
  ('serviceleder', 'customers.create'),
  ('admin', 'customers.delete'),
  ('admin', 'customers.edit'),
  ('salg', 'customers.edit'),
  ('serviceleder', 'customers.edit'),
  ('admin', 'customers.emails.view'),
  ('bogholderi', 'customers.emails.view'),
  ('salg', 'customers.emails.view'),
  ('serviceleder', 'customers.emails.view'),
  ('admin', 'customers.view'),
  ('bogholderi', 'customers.view'),
  ('montør', 'customers.view'),
  ('salg', 'customers.view'),
  ('serviceleder', 'customers.view'),
  ('admin', 'documents.delete'),
  ('serviceleder', 'documents.delete'),
  ('admin', 'economy.cost_prices'),
  ('bogholderi', 'economy.cost_prices'),
  ('serviceleder', 'economy.cost_prices'),
  ('admin', 'economy.edit'),
  ('admin', 'economy.view'),
  ('bogholderi', 'economy.view'),
  ('serviceleder', 'economy.view'),
  ('admin', 'employees.edit'),
  ('admin', 'employees.payroll.edit'),
  ('admin', 'employees.payroll.view'),
  ('admin', 'employees.view'),
  ('serviceleder', 'employees.view'),
  ('admin', 'inbox.delete'),
  ('admin', 'inbox.send'),
  ('serviceleder', 'inbox.send'),
  ('admin', 'inbox.view'),
  ('serviceleder', 'inbox.view'),
  ('admin', 'incoming_invoices.approve'),
  ('bogholderi', 'incoming_invoices.approve'),
  ('admin', 'incoming_invoices.edit'),
  ('bogholderi', 'incoming_invoices.edit'),
  ('admin', 'incoming_invoices.view'),
  ('bogholderi', 'incoming_invoices.view'),
  ('serviceleder', 'incoming_invoices.view'),
  ('admin', 'invoices.create'),
  ('bogholderi', 'invoices.create'),
  ('serviceleder', 'invoices.create'),
  ('admin', 'invoices.credit'),
  ('bogholderi', 'invoices.credit'),
  ('admin', 'invoices.delete_draft'),
  ('bogholderi', 'invoices.delete_draft'),
  ('admin', 'invoices.mark_paid'),
  ('bogholderi', 'invoices.mark_paid'),
  ('admin', 'invoices.send'),
  ('bogholderi', 'invoices.send'),
  ('serviceleder', 'invoices.send'),
  ('admin', 'invoices.view.all'),
  ('bogholderi', 'invoices.view.all'),
  ('serviceleder', 'invoices.view.all'),
  ('admin', 'invoices.view.own_cases'),
  ('bogholderi', 'invoices.view.own_cases'),
  ('salg', 'invoices.view.own_cases'),
  ('serviceleder', 'invoices.view.own_cases'),
  ('admin', 'leads.create'),
  ('salg', 'leads.create'),
  ('serviceleder', 'leads.create'),
  ('admin', 'leads.delete'),
  ('admin', 'leads.edit'),
  ('salg', 'leads.edit'),
  ('serviceleder', 'leads.edit'),
  ('admin', 'leads.view'),
  ('salg', 'leads.view'),
  ('serviceleder', 'leads.view'),
  ('admin', 'materials.add_to_case'),
  ('montør', 'materials.add_to_case'),
  ('serviceleder', 'materials.add_to_case'),
  ('admin', 'materials.delete'),
  ('serviceleder', 'materials.delete'),
  ('admin', 'materials.edit'),
  ('serviceleder', 'materials.edit'),
  ('admin', 'materials.view'),
  ('bogholderi', 'materials.view'),
  ('montør', 'materials.view'),
  ('serviceleder', 'materials.view'),
  ('admin', 'materials.view.cost_prices'),
  ('bogholderi', 'materials.view.cost_prices'),
  ('serviceleder', 'materials.view.cost_prices'),
  ('admin', 'offers.approve'),
  ('admin', 'offers.create'),
  ('salg', 'offers.create'),
  ('serviceleder', 'offers.create'),
  ('admin', 'offers.delete'),
  ('admin', 'offers.edit'),
  ('salg', 'offers.edit'),
  ('serviceleder', 'offers.edit'),
  ('admin', 'offers.send'),
  ('salg', 'offers.send'),
  ('serviceleder', 'offers.send'),
  ('admin', 'offers.view'),
  ('salg', 'offers.view'),
  ('serviceleder', 'offers.view'),
  ('admin', 'offers.view.all'),
  ('serviceleder', 'offers.view.all'),
  ('admin', 'offers.view.cost_prices'),
  ('bogholderi', 'offers.view.cost_prices'),
  ('serviceleder', 'offers.view.cost_prices'),
  ('admin', 'other_costs.add_to_case'),
  ('montør', 'other_costs.add_to_case'),
  ('serviceleder', 'other_costs.add_to_case'),
  ('admin', 'other_costs.delete'),
  ('serviceleder', 'other_costs.delete'),
  ('admin', 'other_costs.edit'),
  ('serviceleder', 'other_costs.edit'),
  ('admin', 'other_costs.view'),
  ('bogholderi', 'other_costs.view'),
  ('montør', 'other_costs.view'),
  ('serviceleder', 'other_costs.view'),
  ('admin', 'products.view.cost_prices'),
  ('bogholderi', 'products.view.cost_prices'),
  ('serviceleder', 'products.view.cost_prices'),
  ('admin', 'reports.export'),
  ('bogholderi', 'reports.export'),
  ('admin', 'reports.view'),
  ('bogholderi', 'reports.view'),
  ('serviceleder', 'reports.view'),
  ('admin', 'service.close'),
  ('serviceleder', 'service.close'),
  ('admin', 'service.create'),
  ('salg', 'service.create'),
  ('serviceleder', 'service.create'),
  ('admin', 'service.delete'),
  ('admin', 'service.edit'),
  ('montør', 'service.edit'),
  ('serviceleder', 'service.edit'),
  ('admin', 'service.view'),
  ('bogholderi', 'service.view'),
  ('montør', 'service.view'),
  ('serviceleder', 'service.view'),
  ('admin', 'settings.economic'),
  ('bogholderi', 'settings.economic'),
  ('admin', 'settings.manage'),
  ('admin', 'settings.suppliers'),
  ('admin', 'settings.view'),
  ('serviceleder', 'settings.view'),
  ('admin', 'suppliers.credentials'),
  ('admin', 'tasks.create'),
  ('bogholderi', 'tasks.create'),
  ('salg', 'tasks.create'),
  ('serviceleder', 'tasks.create'),
  ('admin', 'tasks.delete'),
  ('serviceleder', 'tasks.delete'),
  ('admin', 'tasks.edit'),
  ('montør', 'tasks.edit'),
  ('serviceleder', 'tasks.edit'),
  ('admin', 'tasks.menu'),
  ('bogholderi', 'tasks.menu'),
  ('montør', 'tasks.menu'),
  ('salg', 'tasks.menu'),
  ('serviceleder', 'tasks.menu'),
  ('admin', 'tasks.view'),
  ('montør', 'tasks.view'),
  ('serviceleder', 'tasks.view'),
  ('admin', 'time.delete'),
  ('admin', 'time.edit_all'),
  ('admin', 'time.edit_own'),
  ('montør', 'time.edit_own'),
  ('serviceleder', 'time.edit_own'),
  ('admin', 'time.log'),
  ('montør', 'time.log'),
  ('serviceleder', 'time.log'),
  ('admin', 'time.view_all'),
  ('bogholderi', 'time.view_all'),
  ('serviceleder', 'time.view_all'),
  ('admin', 'time.view_own'),
  ('montør', 'time.view_own'),
  ('serviceleder', 'time.view_own'),
  ('admin', 'time_logs.approve'),
  ('serviceleder', 'time_logs.approve'),
  ('admin', 'time_logs.create'),
  ('montør', 'time_logs.create'),
  ('serviceleder', 'time_logs.create'),
  ('admin', 'time_logs.delete'),
  ('admin', 'time_logs.edit.all'),
  ('serviceleder', 'time_logs.edit.all'),
  ('admin', 'time_logs.edit.own'),
  ('montør', 'time_logs.edit.own'),
  ('serviceleder', 'time_logs.edit.own'),
  ('admin', 'time_logs.view.all'),
  ('bogholderi', 'time_logs.view.all'),
  ('serviceleder', 'time_logs.view.all'),
  ('admin', 'time_logs.view.own'),
  ('montør', 'time_logs.view.own'),
  ('serviceleder', 'time_logs.view.own'),
  ('admin', 'tools.ai_project'),
  ('serviceleder', 'tools.ai_project'),
  ('admin', 'tools.calculations'),
  ('serviceleder', 'tools.calculations'),
  ('admin', 'tools.packages'),
  ('serviceleder', 'tools.packages'),
  ('admin', 'tools.pricing'),
  ('serviceleder', 'tools.pricing'),
  ('admin', 'tools.products'),
  ('salg', 'tools.products'),
  ('serviceleder', 'tools.products'),
  ('admin', 'tools.reports'),
  ('bogholderi', 'tools.reports'),
  ('serviceleder', 'tools.reports'),
  ('admin', 'tools.solar_calc'),
  ('salg', 'tools.solar_calc'),
  ('serviceleder', 'tools.solar_calc'),
  ('admin', 'users.create'),
  ('admin', 'users.delete'),
  ('admin', 'users.edit'),
  ('admin', 'users.manage_roles'),
  ('admin', 'users.view'),
  ('admin', 'work_orders.complete'),
  ('montør', 'work_orders.complete'),
  ('serviceleder', 'work_orders.complete'),
  ('admin', 'work_orders.delete'),
  ('serviceleder', 'work_orders.delete'),
  ('admin', 'work_orders.edit'),
  ('serviceleder', 'work_orders.edit'),
  ('admin', 'work_orders.plan'),
  ('serviceleder', 'work_orders.plan'),
  ('admin', 'work_orders.view.all'),
  ('serviceleder', 'work_orders.view.all'),
  ('admin', 'work_orders.view.assigned'),
  ('montør', 'work_orders.view.assigned'),
  ('serviceleder', 'work_orders.view.assigned')
ON CONFLICT DO NOTHING;
-- <<< GENERERET SEED

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- ROLLBACK (kun ved reel regression — ingen policies afhænger af objekterne endnu)
-- =====================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.user_has_permission(text);
-- -- 00108's oprindelige user_has_permission(text, uuid) genskabes ikke automatisk (ubrugt; ignorerede is_active og overrides)
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS permission_template;
-- DROP TABLE IF EXISTS public.user_permission_overrides;
-- DROP TABLE IF EXISTS public.role_permission_defaults;
-- DROP TABLE IF EXISTS public.permission_catalog;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
