-- =====================================================================
-- Migration 00108_rbac_foundation.sql (Sprint 7B-1A)
--
-- Permission foundation only. INGEN portal-RLS-aendringer.
-- INGEN bred RLS-tightening. INGEN UPDATE paa profiles.
-- INGEN CHECK constraint paa profiles.role.
--
-- Idempotent. Roll-back script i SPRINT_7B_1_RBAC_FOUNDATION_SQL_PROPOSAL.md.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PRE-FLIGHT ASSERTION (admin bootstrap-sikkerhed)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_admin_count
  FROM profiles
  WHERE role = 'admin';

  IF v_admin_count < 1 THEN
    RAISE EXCEPTION
      'ABORT: ingen profile har role=admin. Migration ville efterlade '
      'systemet uden admin-adgang. Bekraft at mindst en admin findes '
      'for retry.';
  END IF;

  RAISE NOTICE 'pre-flight OK: % admin(s) findes', v_admin_count;
END $$;


-- ---------------------------------------------------------------------
-- 1) INDEX paa profiles.role for RLS-perf
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);


-- ---------------------------------------------------------------------
-- 2) PERMISSION CATALOG TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  key          TEXT PRIMARY KEY,
  module       TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perm_read_authenticated ON permissions;
CREATE POLICY perm_read_authenticated
  ON permissions FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON permissions TO authenticated;
GRANT ALL    ON permissions TO service_role;


-- ---------------------------------------------------------------------
-- 3) ROLE -> PERMISSION JUNCTION
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
  role            TEXT NOT NULL,
  permission_key  TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_key);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_perm_read_authenticated ON role_permissions;
CREATE POLICY role_perm_read_authenticated
  ON role_permissions FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON role_permissions TO authenticated;
GRANT ALL    ON role_permissions TO service_role;


-- ---------------------------------------------------------------------
-- 4) PERMISSION CATALOG SEED
-- ---------------------------------------------------------------------
INSERT INTO permissions (key, module, description) VALUES
  ('customers.view',                'customers', 'Se kunder'),
  ('customers.view.assigned',       'customers', 'Se tildelte kunder (samarbejdspartner)'),
  ('customers.create',              'customers', 'Opret kunde'),
  ('customers.edit',                'customers', 'Rediger kunde'),
  ('customers.delete',              'customers', 'Slet kunde'),
  ('customers.view_economy',        'customers', 'Se kunde-okonomi (saldo, faktureret)'),

  ('leads.view',                    'leads', 'Se leads'),
  ('leads.create',                  'leads', 'Opret lead'),
  ('leads.edit',                    'leads', 'Rediger lead'),
  ('leads.delete',                  'leads', 'Slet lead'),

  ('offers.view',                   'offers', 'Se tilbud'),
  ('offers.view.cost_prices',       'offers', 'Se kostpriser i tilbud'),
  ('offers.create',                 'offers', 'Opret tilbud'),
  ('offers.edit',                   'offers', 'Rediger tilbud'),
  ('offers.send',                   'offers', 'Send tilbud'),
  ('offers.delete',                 'offers', 'Slet tilbud'),

  ('cases.view.all',                'cases', 'Se alle sager'),
  ('cases.view.team',               'cases', 'Se team-sager'),
  ('cases.view.assigned',           'cases', 'Se kun egne tildelte sager'),
  ('cases.create',                  'cases', 'Opret sag'),
  ('cases.edit',                    'cases', 'Rediger sag fuldt'),
  ('cases.edit.own',                'cases', 'Rediger egen sag begraenset (status, beskrivelse)'),
  ('cases.close',                   'cases', 'Luk sag'),
  ('cases.delete',                  'cases', 'Slet sag'),

  ('work_orders.view.all',          'work_orders', 'Se alle work orders'),
  ('work_orders.view.assigned',     'work_orders', 'Se kun tildelte work orders'),
  ('work_orders.plan',              'work_orders', 'Planlaeg/tildel work orders'),
  ('work_orders.edit',              'work_orders', 'Rediger work order'),
  ('work_orders.complete',          'work_orders', 'Markeer work order som faerdig'),
  ('work_orders.delete',            'work_orders', 'Slet work order'),

  ('calendar.view.all',             'calendar', 'Se hele kalender'),
  ('calendar.view.team',            'calendar', 'Se team-kalender'),
  ('calendar.view.own',             'calendar', 'Se egen kalender'),
  ('calendar.plan',                 'calendar', 'Planlaeg i kalender'),

  ('time_logs.view.all',            'time_logs', 'Se alle tidsregistreringer'),
  ('time_logs.view.own',            'time_logs', 'Se egne tidsregistreringer'),
  ('time_logs.create',              'time_logs', 'Registrer tid'),
  ('time_logs.edit.own',            'time_logs', 'Rediger egne tidsregistreringer'),
  ('time_logs.edit.all',            'time_logs', 'Rediger alle tidsregistreringer'),
  ('time_logs.approve',             'time_logs', 'Godkend tidsregistreringer'),
  ('time_logs.delete',              'time_logs', 'Slet tidsregistrering'),

  ('materials.view',                'materials', 'Se materialer paa sag'),
  ('materials.view.cost_prices',    'materials', 'Se kostpriser paa materialer'),
  ('materials.add_to_case',         'materials', 'Tilfoj materiale til sag'),
  ('materials.edit',                'materials', 'Rediger materiale-linje'),
  ('materials.delete',              'materials', 'Slet materiale-linje'),

  ('other_costs.view',              'other_costs', 'Se ovrige omkostninger'),
  ('other_costs.add_to_case',       'other_costs', 'Tilfoj ovrig omkostning'),
  ('other_costs.edit',              'other_costs', 'Rediger ovrig omkostning'),
  ('other_costs.delete',            'other_costs', 'Slet ovrig omkostning'),

  ('invoices.view.all',             'invoices', 'Se alle fakturaer'),
  ('invoices.view.own_cases',       'invoices', 'Se fakturaer paa egne sager'),
  ('invoices.create',               'invoices', 'Opret faktura'),
  ('invoices.send',                 'invoices', 'Send faktura'),
  ('invoices.mark_paid',            'invoices', 'Markeer faktura som betalt'),
  ('invoices.credit',               'invoices', 'Opret kreditnota'),
  ('invoices.delete_draft',         'invoices', 'Slet faktura-kladde'),

  ('economy.view',                  'economy', 'Se okonomi-data (margin, DB)'),
  ('economy.edit',                  'economy', 'Rediger okonomi-indstillinger'),
  ('economy.cost_prices',           'economy', 'Se kostpriser globalt'),

  ('employees.view',                'employees', 'Se medarbejdere'),
  ('employees.edit',                'employees', 'Rediger medarbejder'),
  ('employees.payroll.view',        'employees', 'Se lon-data'),
  ('employees.payroll.edit',        'employees', 'Rediger lon-data'),

  ('reports.view',                  'reports', 'Se rapporter'),
  ('reports.export',                'reports', 'Eksporter rapporter'),

  ('settings.view',                 'settings', 'Se indstillinger'),
  ('settings.manage',               'settings', 'Rediger systemindstillinger'),
  ('settings.suppliers',            'settings', 'Administrer leverandorer'),
  ('settings.economic',             'settings', 'Administrer e-conomic'),

  ('users.view',                    'users', 'Se brugere'),
  ('users.create',                  'users', 'Opret bruger'),
  ('users.edit',                    'users', 'Rediger bruger'),
  ('users.assign_roles',            'users', 'Tildel roller'),
  ('users.delete',                  'users', 'Slet bruger'),

  ('calculations.view',             'calculations', 'Se kalkulationer'),
  ('calculations.create',           'calculations', 'Opret kalkulation'),
  ('packages.view',                 'packages', 'Se pakker'),
  ('packages.edit',                 'packages', 'Rediger pakker'),
  ('products.view',                 'products', 'Se produkter'),
  ('products.view.cost_prices',     'products', 'Se kostpriser paa produkter'),
  ('products.edit',                 'products', 'Rediger produkter'),

  ('documents.view.all',            'documents', 'Se alle dokumenter'),
  ('documents.view.assigned',       'documents', 'Se dokumenter paa egne sager'),
  ('documents.upload',              'documents', 'Upload dokumenter'),
  ('documents.delete',              'documents', 'Slet dokumenter'),

  ('portal.tokens.create',          'portal', 'Opret kundeportal-tokens'),
  ('portal.messages.send',          'portal', 'Send beskeder via portal')
ON CONFLICT (key) DO UPDATE SET
  module      = EXCLUDED.module,
  description = EXCLUDED.description;


-- ---------------------------------------------------------------------
-- 5) ROLE -> PERMISSION SEED
-- ---------------------------------------------------------------------

-- ADMIN (faar alle permissions, ogsaa fremtidige der seedes ind)
INSERT INTO role_permissions (role, permission_key)
SELECT 'admin', key FROM permissions
ON CONFLICT DO NOTHING;

-- SERVICELEDER
INSERT INTO role_permissions (role, permission_key) VALUES
  ('serviceleder', 'customers.view'),
  ('serviceleder', 'customers.create'),
  ('serviceleder', 'customers.edit'),
  ('serviceleder', 'customers.view_economy'),
  ('serviceleder', 'leads.view'),
  ('serviceleder', 'leads.create'),
  ('serviceleder', 'leads.edit'),
  ('serviceleder', 'offers.view'),
  ('serviceleder', 'offers.view.cost_prices'),
  ('serviceleder', 'offers.create'),
  ('serviceleder', 'offers.edit'),
  ('serviceleder', 'offers.send'),
  ('serviceleder', 'cases.view.all'),
  ('serviceleder', 'cases.create'),
  ('serviceleder', 'cases.edit'),
  ('serviceleder', 'cases.close'),
  ('serviceleder', 'work_orders.view.all'),
  ('serviceleder', 'work_orders.plan'),
  ('serviceleder', 'work_orders.edit'),
  ('serviceleder', 'work_orders.complete'),
  ('serviceleder', 'work_orders.delete'),
  ('serviceleder', 'calendar.view.all'),
  ('serviceleder', 'calendar.plan'),
  ('serviceleder', 'time_logs.view.all'),
  ('serviceleder', 'time_logs.create'),
  ('serviceleder', 'time_logs.edit.all'),
  ('serviceleder', 'time_logs.approve'),
  ('serviceleder', 'materials.view'),
  ('serviceleder', 'materials.view.cost_prices'),
  ('serviceleder', 'materials.add_to_case'),
  ('serviceleder', 'materials.edit'),
  ('serviceleder', 'materials.delete'),
  ('serviceleder', 'other_costs.view'),
  ('serviceleder', 'other_costs.add_to_case'),
  ('serviceleder', 'other_costs.edit'),
  ('serviceleder', 'other_costs.delete'),
  ('serviceleder', 'invoices.view.all'),
  ('serviceleder', 'invoices.create'),
  ('serviceleder', 'invoices.send'),
  ('serviceleder', 'economy.view'),
  ('serviceleder', 'economy.cost_prices'),
  ('serviceleder', 'employees.view'),
  ('serviceleder', 'reports.view'),
  ('serviceleder', 'settings.view'),
  ('serviceleder', 'calculations.view'),
  ('serviceleder', 'calculations.create'),
  ('serviceleder', 'packages.view'),
  ('serviceleder', 'packages.edit'),
  ('serviceleder', 'products.view'),
  ('serviceleder', 'products.view.cost_prices'),
  ('serviceleder', 'documents.view.all'),
  ('serviceleder', 'documents.upload'),
  ('serviceleder', 'documents.delete'),
  ('serviceleder', 'portal.tokens.create'),
  ('serviceleder', 'portal.messages.send')
ON CONFLICT DO NOTHING;

-- MONTOR
INSERT INTO role_permissions (role, permission_key) VALUES
  ('montør', 'customers.view'),
  ('montør', 'cases.view.assigned'),
  ('montør', 'cases.edit.own'),
  ('montør', 'work_orders.view.assigned'),
  ('montør', 'work_orders.complete'),
  ('montør', 'calendar.view.own'),
  ('montør', 'time_logs.view.own'),
  ('montør', 'time_logs.create'),
  ('montør', 'time_logs.edit.own'),
  ('montør', 'materials.view'),
  ('montør', 'materials.add_to_case'),
  ('montør', 'other_costs.view'),
  ('montør', 'other_costs.add_to_case'),
  ('montør', 'products.view'),
  ('montør', 'documents.view.assigned'),
  ('montør', 'documents.upload')
ON CONFLICT DO NOTHING;

-- SALG
INSERT INTO role_permissions (role, permission_key) VALUES
  ('salg', 'customers.view'),
  ('salg', 'customers.create'),
  ('salg', 'customers.edit'),
  ('salg', 'leads.view'),
  ('salg', 'leads.create'),
  ('salg', 'leads.edit'),
  ('salg', 'offers.view'),
  ('salg', 'offers.create'),
  ('salg', 'offers.edit'),
  ('salg', 'offers.send'),
  ('salg', 'cases.view.assigned'),
  ('salg', 'cases.create'),
  ('salg', 'invoices.view.own_cases'),
  ('salg', 'calculations.view'),
  ('salg', 'calculations.create'),
  ('salg', 'packages.view'),
  ('salg', 'products.view'),
  ('salg', 'documents.view.assigned'),
  ('salg', 'documents.upload'),
  ('salg', 'portal.tokens.create'),
  ('salg', 'portal.messages.send')
ON CONFLICT DO NOTHING;

-- BOGHOLDERI (IKKE lon/satser)
INSERT INTO role_permissions (role, permission_key) VALUES
  ('bogholderi', 'customers.view'),
  ('bogholderi', 'customers.view_economy'),
  ('bogholderi', 'cases.view.all'),
  ('bogholderi', 'invoices.view.all'),
  ('bogholderi', 'invoices.create'),
  ('bogholderi', 'invoices.send'),
  ('bogholderi', 'invoices.mark_paid'),
  ('bogholderi', 'invoices.credit'),
  ('bogholderi', 'invoices.delete_draft'),
  ('bogholderi', 'economy.view'),
  ('bogholderi', 'economy.cost_prices'),
  ('bogholderi', 'materials.view'),
  ('bogholderi', 'materials.view.cost_prices'),
  ('bogholderi', 'other_costs.view'),
  ('bogholderi', 'time_logs.view.all'),
  ('bogholderi', 'reports.view'),
  ('bogholderi', 'reports.export'),
  ('bogholderi', 'settings.economic'),
  ('bogholderi', 'products.view'),
  ('bogholderi', 'products.view.cost_prices'),
  ('bogholderi', 'documents.view.all')
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------
-- 6) HELPER FUNCTIONS
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION user_role(p_user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM profiles WHERE id = p_user_id),
    'montør'
  );
$$;

GRANT EXECUTE ON FUNCTION user_role(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION user_has_role(p_roles text[], p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND role = ANY(p_roles)
  );
$$;

GRANT EXECUTE ON FUNCTION user_has_role(text[], uuid) TO authenticated;


CREATE OR REPLACE FUNCTION user_has_permission(p_perm text, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN role_permissions rp ON rp.role = p.role
    WHERE p.id = p_user_id
      AND rp.permission_key = p_perm
  );
$$;

GRANT EXECUTE ON FUNCTION user_has_permission(text, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION user_permissions(p_user_id uuid DEFAULT auth.uid())
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY_AGG(rp.permission_key ORDER BY rp.permission_key), ARRAY[]::text[])
  FROM profiles p
  LEFT JOIN role_permissions rp ON rp.role = p.role
  WHERE p.id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION user_permissions(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION user_employee_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM employees
  WHERE profile_id = p_user_id AND active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION user_employee_id(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- POST-MIGRATION ASSERTION (admin har alle permissions)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_admin_perms INTEGER;
  v_total_perms INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_perms FROM permissions;
  SELECT COUNT(*) INTO v_admin_perms FROM role_permissions WHERE role = 'admin';

  IF v_admin_perms < v_total_perms THEN
    RAISE EXCEPTION
      'ABORT: admin-rollen har % af % permissions efter seed — '
      'forventede ALLE. Migration afbrudt.',
      v_admin_perms, v_total_perms;
  END IF;

  RAISE NOTICE 'post-migration OK: admin har alle % permissions',
    v_admin_perms;
END $$;

COMMIT;
