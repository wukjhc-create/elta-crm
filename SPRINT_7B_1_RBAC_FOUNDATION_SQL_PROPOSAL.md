# Sprint 7B-1 — RBAC Foundation SQL forslag

**Skrevet:** 2026-05-07
**Status:** ⛔ **IKKE KØRT** — kun forslag. Ingen migration leveres før Henrik godkender.
**Migration-nummer:** `00108_rbac_foundation.sql` (planlagt)
**Beslutninger fra Henrik (sprint kickoff):**
- Roller v1: `admin`, `serviceleder`, `montør`, `salg`, `bogholderi`
- Samarbejdspartner + kundeportal: modelleres men ikke fuld-implementeres i 7B
- Serviceleder: ser alle sager (ingen team-restrict endnu)
- Montør: kun egne work_orders + begrænset sagsinfo
- Bogholderi: faktura/kreditnota/kundeinfo/økonomi, **ikke** løn/satser
- Salg: leads/kunder/tilbud/egne sager, **ikke** kostpriser/intern DB/løn
- Portal-lækager fixes sikkert
- Ingen bred RLS-tightening uden særskilt SQL-godkendelse
- Ingen store refactors

---

## 0) Designprincipper for 7B-1

| Princip | Hvordan |
|---|---|
| **Rent additivt** | Tilføj nye tabeller, kolonner, funktioner. Tag ikke noget væk. |
| **Ingen data-mutation** | Ingen `UPDATE` på `profiles.role` i denne migration. Eksisterende rows er urørt. |
| **Ingen CHECK på eksisterende kolonner** | `profiles.role` får IKKE CHECK constraint endnu (kan fejle ved skrald-data) |
| **Ingen DROP af eksisterende RLS** | Eksisterende policies bevares; nye tilføjes ved siden af |
| **Service-role bypass uberørt** | Cron-jobs + admin-tools fortsætter med `service_role` |
| **Helper-funktioner returnerer fail-safe** | Hvis profile ikke findes → returnér default-rolle (montør) for at undgå null-crash |
| **Idempotent** | `IF NOT EXISTS` / `DROP IF EXISTS` overalt; kan re-køres uden skade |

---

## 1) `profiles.role` strategi

**Beslutning:** Behold `profiles.role` som single-role kolonne. **INGEN** `user_roles`-junction.

Begrundelse:
- Henriks decisions kræver kun én rolle per user
- Junction-tabeller er over-engineering nu
- `profiles.role` bruges allerede i 30+ RLS policies — at skifte til junction ville kræve massevis af RLS-rewrites
- Kan altid migrere til junction senere hvis multi-rolle bliver behov

**I 7B-1 gør vi kun:**
- Tilføj `idx_profiles_role` index for RLS-perf
- Tilføj kommentar/dokumentation på kolonnen

**I 7B-2 (separat manual-godkendt SQL) gør vi:**
- Audit eksisterende `profiles.role`-værdier
- Henrik godkender mapping per user
- UPDATE → konsoliderede roller
- Tilføj CHECK-constraint på `role IN ('admin','serviceleder','montør','salg','bogholderi')`

---

## 2) `permissions` + `role_permissions` katalog

**Designvalg:** **Hybrid model** — TS-kode er "source of truth", DB-tabel er **mirror** synced via deploy-script. Det giver:
- Compile-time safety i TS (typed permission keys)
- DB-introspectable (RLS-helpers kan slå op)
- Audit-friendly (admin kan se rolle-permission-matrix uden kode-adgang)

**Tabeller:**

```sql
-- Permission catalog
CREATE TABLE IF NOT EXISTS permissions (
  key          TEXT PRIMARY KEY,
  module       TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

-- Role → permission junction
CREATE TABLE IF NOT EXISTS role_permissions (
  role            TEXT NOT NULL,
  permission_key  TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_key);

-- RLS — hvem må læse?
ALTER TABLE permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Alle authenticated kan læse (offentlig info — gæt på rolle skal ikke kompromittere noget)
CREATE POLICY perm_read_authenticated      ON permissions      FOR SELECT TO authenticated USING (true);
CREATE POLICY role_perm_read_authenticated ON role_permissions FOR SELECT TO authenticated USING (true);

-- Skriv: kun service_role (deploy-script) — ingen authenticated INSERT/UPDATE/DELETE
GRANT SELECT ON permissions      TO authenticated;
GRANT SELECT ON role_permissions TO authenticated;
GRANT ALL    ON permissions      TO service_role;
GRANT ALL    ON role_permissions TO service_role;
```

---

## 3) Permission catalog seed (~80 keys)

**Format:** Henriks beslutninger oversat 1:1 til rolle-mapping.

```sql
-- ----- Permissions katalog -----
INSERT INTO permissions (key, module, description) VALUES
  -- Customers
  ('customers.view',                'customers', 'Se kunder'),
  ('customers.view.assigned',       'customers', 'Se tildelte kunder (samarbejdspartner)'),
  ('customers.create',              'customers', 'Opret kunde'),
  ('customers.edit',                'customers', 'Rediger kunde'),
  ('customers.delete',              'customers', 'Slet kunde'),
  ('customers.view_economy',        'customers', 'Se kunde-økonomi (saldo, faktureret)'),

  -- Leads
  ('leads.view',                    'leads', 'Se leads'),
  ('leads.create',                  'leads', 'Opret lead'),
  ('leads.edit',                    'leads', 'Rediger lead'),
  ('leads.delete',                  'leads', 'Slet lead'),

  -- Offers
  ('offers.view',                   'offers', 'Se tilbud'),
  ('offers.view.cost_prices',       'offers', 'Se kostpriser i tilbud'),
  ('offers.create',                 'offers', 'Opret tilbud'),
  ('offers.edit',                   'offers', 'Rediger tilbud'),
  ('offers.send',                   'offers', 'Send tilbud'),
  ('offers.delete',                 'offers', 'Slet tilbud'),

  -- Service cases
  ('cases.view.all',                'cases', 'Se alle sager'),
  ('cases.view.team',               'cases', 'Se team-sager'),
  ('cases.view.assigned',           'cases', 'Se kun egne tildelte sager'),
  ('cases.create',                  'cases', 'Opret sag'),
  ('cases.edit',                    'cases', 'Rediger sag fuldt'),
  ('cases.edit.own',                'cases', 'Rediger egen sag begrænset (status, beskrivelse)'),
  ('cases.close',                   'cases', 'Luk sag'),
  ('cases.delete',                  'cases', 'Slet sag'),

  -- Work orders
  ('work_orders.view.all',          'work_orders', 'Se alle work orders'),
  ('work_orders.view.assigned',     'work_orders', 'Se kun tildelte work orders'),
  ('work_orders.plan',              'work_orders', 'Planlæg/tildel work orders'),
  ('work_orders.edit',              'work_orders', 'Rediger work order'),
  ('work_orders.complete',          'work_orders', 'Markér work order som færdig'),
  ('work_orders.delete',            'work_orders', 'Slet work order'),

  -- Calendar
  ('calendar.view.all',             'calendar', 'Se hele kalender'),
  ('calendar.view.team',            'calendar', 'Se team-kalender'),
  ('calendar.view.own',             'calendar', 'Se egen kalender'),
  ('calendar.plan',                 'calendar', 'Planlæg i kalender'),

  -- Time logs
  ('time_logs.view.all',            'time_logs', 'Se alle tidsregistreringer'),
  ('time_logs.view.own',            'time_logs', 'Se egne tidsregistreringer'),
  ('time_logs.create',              'time_logs', 'Registrér tid'),
  ('time_logs.edit.own',            'time_logs', 'Rediger egne tidsregistreringer'),
  ('time_logs.edit.all',            'time_logs', 'Rediger alle tidsregistreringer'),
  ('time_logs.approve',             'time_logs', 'Godkend tidsregistreringer'),
  ('time_logs.delete',              'time_logs', 'Slet tidsregistrering'),

  -- Materials
  ('materials.view',                'materials', 'Se materialer på sag'),
  ('materials.view.cost_prices',    'materials', 'Se kostpriser på materialer'),
  ('materials.add_to_case',         'materials', 'Tilføj materiale til sag'),
  ('materials.edit',                'materials', 'Rediger materiale-linje'),
  ('materials.delete',              'materials', 'Slet materiale-linje'),

  -- Other costs
  ('other_costs.view',              'other_costs', 'Se øvrige omkostninger'),
  ('other_costs.add_to_case',       'other_costs', 'Tilføj øvrig omkostning'),
  ('other_costs.edit',              'other_costs', 'Rediger øvrig omkostning'),
  ('other_costs.delete',            'other_costs', 'Slet øvrig omkostning'),

  -- Invoices
  ('invoices.view.all',             'invoices', 'Se alle fakturaer'),
  ('invoices.view.own_cases',       'invoices', 'Se fakturaer på egne sager'),
  ('invoices.create',               'invoices', 'Opret faktura'),
  ('invoices.send',                 'invoices', 'Send faktura'),
  ('invoices.mark_paid',            'invoices', 'Markér faktura som betalt'),
  ('invoices.credit',               'invoices', 'Opret kreditnota'),
  ('invoices.delete_draft',         'invoices', 'Slet faktura-kladde'),

  -- Economy
  ('economy.view',                  'economy', 'Se økonomi-data (margin, DB)'),
  ('economy.edit',                  'economy', 'Rediger økonomi-indstillinger'),
  ('economy.cost_prices',           'economy', 'Se kostpriser globalt'),

  -- Employees
  ('employees.view',                'employees', 'Se medarbejdere'),
  ('employees.edit',                'employees', 'Rediger medarbejder'),
  ('employees.payroll.view',        'employees', 'Se løn-data'),
  ('employees.payroll.edit',        'employees', 'Rediger løn-data'),

  -- Reports
  ('reports.view',                  'reports', 'Se rapporter'),
  ('reports.export',                'reports', 'Eksportér rapporter'),

  -- Settings
  ('settings.view',                 'settings', 'Se indstillinger'),
  ('settings.manage',               'settings', 'Rediger systemindstillinger'),
  ('settings.suppliers',            'settings', 'Administrér leverandører'),
  ('settings.economic',             'settings', 'Administrér e-conomic'),

  -- User management
  ('users.view',                    'users', 'Se brugere'),
  ('users.create',                  'users', 'Opret bruger'),
  ('users.edit',                    'users', 'Rediger bruger'),
  ('users.assign_roles',            'users', 'Tildel roller'),
  ('users.delete',                  'users', 'Slet bruger'),

  -- Calculations / packages / products
  ('calculations.view',             'calculations', 'Se kalkulationer'),
  ('calculations.create',           'calculations', 'Opret kalkulation'),
  ('packages.view',                 'packages', 'Se pakker'),
  ('packages.edit',                 'packages', 'Rediger pakker'),
  ('products.view',                 'products', 'Se produkter'),
  ('products.view.cost_prices',     'products', 'Se kostpriser på produkter'),
  ('products.edit',                 'products', 'Rediger produkter'),

  -- Documents
  ('documents.view.all',            'documents', 'Se alle dokumenter'),
  ('documents.view.assigned',       'documents', 'Se dokumenter på egne sager'),
  ('documents.upload',              'documents', 'Upload dokumenter'),
  ('documents.delete',              'documents', 'Slet dokumenter'),

  -- Customer portal management
  ('portal.tokens.create',          'portal', 'Opret kundeportal-tokens'),
  ('portal.messages.send',          'portal', 'Send beskeder via portal')
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  description = EXCLUDED.description;
```

**Role → permission mapping** (bygget direkte fra Henriks beslutninger):

```sql
-- ----- Role → permission seed -----
-- ADMIN — alle permissions
INSERT INTO role_permissions (role, permission_key)
SELECT 'admin', key FROM permissions
ON CONFLICT DO NOTHING;

-- SERVICELEDER — alle sager + planlægning + medarbejdere, ikke løn
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

-- MONTØR — kun egne work orders + tidsregistrering, ingen kostpriser/faktura/løn
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

-- SALG — leads/kunder/tilbud + egne sager, ingen kostpriser/intern DB/løn
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

-- BOGHOLDERI — faktura/kreditnota/økonomi, IKKE løn/satser
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
```

**Bemærk:** Henriks regel "bogholderi ikke ser løn" overholdes — bogholderi har **ikke** `employees.payroll.view`. Det er **kun** admin der ser løn-data.

---

## 4) `employees ↔ profiles` link

Henrik har **ikke** eksplicit bedt om at fixe NOT NULL/UNIQUE i 7B-1. Vi gør det ikke nu fordi:
- Det kan fejle hvis prod har NULL `profile_id` på aktive employees
- Påvirker eksisterende employees-CRUD
- Hører bedre til 7C eller 7D efter rolle-konsolidering

**Tilføj kun en hjælpe-funktion (read-only):**

```sql
-- Slå employee_id op fra profile_id
CREATE OR REPLACE FUNCTION user_employee_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM employees WHERE profile_id = p_user_id AND active = true LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION user_employee_id(uuid) TO authenticated;
```

Bruges senere i sag-scope check for montør.

---

## 5) Helper functions (RLS-grundlag)

```sql
-- Returnér rollen for en bruger (default 'montør' så nye users ikke crash'er auth)
CREATE OR REPLACE FUNCTION user_role(p_user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(role, 'montør') FROM profiles WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION user_role(uuid) TO authenticated;

-- Tjek om bruger har én af de angivne roller
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

-- Tjek om bruger har en bestemt permission via role_permissions
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

-- Convenience: returnér ARRAY af alle permissions for en bruger
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
```

**Sikkerhedsnoter:**
- Alle funktioner er `SECURITY DEFINER` med `SET search_path = public` (forhindrer search_path-attacks)
- Funktionerne bruges KUN af RLS-policies og server-actions; aldrig direkte af UI
- Default-rolle 'montør' i `user_role()` betyder: hvis profile-rækken mangler, låses brugeren ud af alt fordi montør har minimal adgang. **Forsigtighedsregel.**
- Service-role bypasser alt — cron-jobs upåvirket

---

## 6) Indexes

```sql
-- For RLS-perf når policies kalder user_has_role
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Allerede eksisterende — verificér:
-- idx_employees_profile (mig 00086 line 24) ← OK, bruges af user_employee_id
```

---

## 7) Portal-leak fixes (sikre, additive)

### 7.1 `portal_messages` anon SELECT

**Nuværende:**
```sql
CREATE POLICY "Portal users can view their messages"
  ON portal_messages FOR SELECT TO anon USING (true);
```
**Konsekvens:** Alle med supabase anon key kan læse alle portal-beskeder.

**Foreslået fix (drop + replace):**

```sql
DROP POLICY IF EXISTS "Portal users can view their messages" ON portal_messages;

CREATE POLICY "Anon read portal messages with active token for customer"
  ON portal_messages
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM portal_access_tokens pat
      WHERE pat.customer_id = portal_messages.customer_id
        AND pat.is_active = true
        AND (pat.expires_at IS NULL OR pat.expires_at > NOW())
    )
  );
```

**Hvad denne policy IKKE løser:** den begrænser adgang til **kun** kunder der har en aktiv token. En anon-bruger der allerede har én gyldig token kan stadig se beskeder for andre kunder hvis de også har aktive tokens.

**Hvorfor vi gør det alligevel:** Det er **væsentlig forbedring** vs. `USING (true)`. Fuld request-bound token-validering kræver ændring af klient-flow (f.eks. via RPC + `set_config`), som hører til 7F (portal hardening).

### 7.2 `offer_signatures` anon INSERT

**Nuværende:**
```sql
CREATE POLICY "Anyone can create signatures"
  ON offer_signatures FOR INSERT TO anon WITH CHECK (true);
```
**Konsekvens:** Enhver med kendskab til en `offer_id` kan oprette en signatur som "kundens accept".

**Foreslået fix:**

```sql
DROP POLICY IF EXISTS "Anyone can create signatures" ON offer_signatures;

CREATE POLICY "Anon create signature for offer with active customer token"
  ON offer_signatures
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM offers o
      JOIN portal_access_tokens pat ON pat.customer_id = o.customer_id
      WHERE o.id = offer_signatures.offer_id
        AND pat.is_active = true
        AND (pat.expires_at IS NULL OR pat.expires_at > NOW())
    )
  );
```

**Begrænsning:** Hvis en angriber har kompromitteret én portal-token til samme kunde, kan de stadig signere dén kundes andre tilbud. Men det er **dramatisk forbedring** vs. nuværende.

### 7.3 Hvad vi IKKE rører i 7B-1

- `portal_access_tokens FOR SELECT TO anon USING (is_active = true AND ...)` — er allerede gated
- `portal_messages FOR INSERT TO anon WITH CHECK (sender_type = 'customer')` — beholdes, kunden skal kunne svare
- Andre RLS-policies på service_cases, invoices, offers — INGEN ændring i 7B-1

---

## 8) Strategi for at undgå at låse Henrik ude

### 8.1 Konkrete safety-mekanismer

| Mekanisme | Beskrivelse |
|---|---|
| **Ingen UPDATE på profiles.role** | Hvis Henrik er 'admin' i dag, er han 'admin' efter migration |
| **Ingen DROP eksisterende policies på authenticated** | Eksisterende admin-policies (`role = 'admin'`) bevares 1:1 |
| **Ingen CHECK på profiles.role** | Skrald-værdier bevares — kan stadig logge ind |
| **Helper-funktioner returnerer fail-safe** | `user_role()` returnerer 'montør' hvis profile mangler — det er **lock-out**, men det forhindrer SQL-fejl der ville bryde alle policies |
| **service_role bypasser alt** | Alle cron-jobs + admin-tools fortsætter |
| **Kun 2 policies fjernes** (portal_messages SELECT, offer_signatures INSERT) | Begge anon-policies. Authenticated adgang er uberørt |
| **Backup-strategi før migration** | Henrik kører `pg_dump` på profiles + portal_messages + offer_signatures FØRST |

### 8.2 Pre-migration tjekliste (Henrik kører)

```sql
-- Tjek 1: Er Henriks profile-record OK?
SELECT id, email, role, is_active FROM profiles WHERE email = '<din email>';
-- Forventet: role = 'admin'. Hvis ikke → STOP.

-- Tjek 2: Er der nogen unique 'role'-værdier?
SELECT role, COUNT(*) FROM profiles GROUP BY role;
-- Henrik godkender at hver værdi er forventet inden migration.

-- Tjek 3: Backup
pg_dump -h <host> -U <user> -t profiles -t portal_messages -t offer_signatures \
  -t portal_access_tokens > rbac_pre_7b1_backup.sql

-- Tjek 4: Test rollback-script (se §10)
```

### 8.3 Hvad sker hvis migration fejler midt-vejs

Migration kører i **én** transaction (Supabase migration tooling default). Ved fejl rolles ALT tilbage automatisk. Eneste eksterne side-effekt er hvis migration når `DROP POLICY` før `CREATE POLICY` — men da DROP+CREATE er i samme transaction, er der ingen vindue hvor anon kan exploit'e.

### 8.4 Hvis admin-rolle bliver kompromitteret efter migration

Backup-plan: Henrik kan altid via Supabase Dashboard SQL editor køre:
```sql
UPDATE profiles SET role = 'admin' WHERE email = '<din email>';
```
Den kører som service_role og bypasser RLS.

---

## 9) Påvirkede flows i 7B-1

| Flow | Påvirkning | Forventet adfærd |
|---|---|---|
| Login | Ingen | Uændret |
| Dashboard load | Ingen | Sidebar bruger fortsat code-side `permissions.ts` |
| Eksisterende server actions | Ingen | Bruger fortsat `getAuthenticatedClient()` uden role-check |
| Eksisterende RLS-policies | Ingen | `role = 'admin'` policies fungerer som før |
| Kundeportal SELECT messages | **Ja** | Skifter fra `USING (true)` til token-gated. Test: åbn `/portal/[gyldig-token]` → beskeder skal stadig synlige. Hvis fejl → rollback policy |
| Kundeportal accept tilbud | **Ja** | Signatur-INSERT kræver nu aktiv token. Test: signér et tilbud via portal → skal virke. Hvis fejl → rollback policy |
| Cron-jobs | Ingen | Service_role bypass |
| Admin-tools (Supabase Dashboard) | Ingen | Service_role bypass |
| Nye user permissions-funktioner | Tilgængelige | Endnu ingen kode der kalder dem |

**Konklusion:** Eneste faktiske runtime-ændringer er de to portal-policies. Resten er passiv infrastruktur.

---

## 10) Rollback-script

Hvis noget går galt efter migration kørt:

```sql
-- Rollback for migration 00108_rbac_foundation.sql

-- 1. Genskab portal_messages anon SELECT (gammel adfærd)
DROP POLICY IF EXISTS "Anon read portal messages with active token for customer" ON portal_messages;
CREATE POLICY "Portal users can view their messages"
  ON portal_messages FOR SELECT TO anon USING (true);

-- 2. Genskab offer_signatures anon INSERT (gammel adfærd)
DROP POLICY IF EXISTS "Anon create signature for offer with active customer token" ON offer_signatures;
CREATE POLICY "Anyone can create signatures"
  ON offer_signatures FOR INSERT TO anon WITH CHECK (true);

-- 3. Drop nye helper-funktioner (kun hvis ingen kode bruger dem endnu)
DROP FUNCTION IF EXISTS user_permissions(uuid);
DROP FUNCTION IF EXISTS user_has_permission(text, uuid);
DROP FUNCTION IF EXISTS user_has_role(text[], uuid);
DROP FUNCTION IF EXISTS user_role(uuid);
DROP FUNCTION IF EXISTS user_employee_id(uuid);

-- 4. Drop nye tabeller (kun hvis ingen kode bruger dem endnu)
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;

-- 5. Drop ny index
DROP INDEX IF EXISTS idx_profiles_role;
```

**Rollback-risiko:**
- Lav for trin 1-2 (genskab existerende policy = stadig fungerer)
- Lav for trin 3-5 fordi disse er nye og endnu IKKE brugt af nogen kode (det er pointen med 7B-1: foundation only)
- Hvis senere sprints (7C-7G) er deployed der bruger funktionerne/tabellerne, kan de IKKE droppes uden også at rollback senere migrationer. **Rollback er kun "safe" indtil næste sprint.**

---

## 11) Hvad jeg vil køre i 7B-1 (efter Henriks SQL-godkendelse)

**Når Henrik har approveret denne SQL og pre-migration-tjeklisten er kørt:**

1. **Opret migration-fil:** `supabase/migrations/00108_rbac_foundation.sql` med alt fra §2, §3, §4, §5, §6, §7
2. **Verificér lokalt:** Hvis Henrik har en lokal Supabase-instans, kør migration mod den først
3. **Push til produktion:** Henrik kører migrationen via Supabase CLI eller Dashboard SQL Editor
4. **Sanity-tjek post-migration:**
   ```sql
   -- Forvent: 80+ rows
   SELECT COUNT(*) FROM permissions;

   -- Forvent: 5 unique roles, ~80 admin perms, ~50 serviceleder, ~16 montør, ~22 salg, ~21 bogholderi
   SELECT role, COUNT(*) FROM role_permissions GROUP BY role;

   -- Forvent: din egen rolle
   SELECT user_role();

   -- Forvent: TRUE
   SELECT user_has_role(ARRAY['admin']);

   -- Forvent: liste af ~80 perms
   SELECT user_permissions();

   -- Test portal: åbn /portal/[gyldig-token] → beskeder skal være synlige
   -- Test offer-accept: signér et tilbud via portal → skal virke
   ```
5. **Hvis fejl:** kør rollback-scriptet fra §10 ved Henrik's beslutning

**Efter 7B-1 leveret:**
- Foundation klar
- Ingen kode bruger det endnu
- 7B-2 (TS-side) kan starte: udvid `UserRole`, udvid `permissions.ts` matrix, byg `getAuthenticatedClientWithRole`, sync `permissions`-tabel fra TS via deploy-script

---

## 12) Hvad der IKKE er med i 7B-1

- ❌ CHECK constraint på `profiles.role` (kommer i 7B-2 efter audit)
- ❌ Mapping/rename af eksisterende `profiles.role`-værdier (Henrik godkender per row)
- ❌ NOT NULL / UNIQUE på `employees.profile_id` (kommer i 7C eller senere)
- ❌ Ny tabel `service_case_members` (kommer i 7D)
- ❌ Ny tabel `teams`/`team_members` (besluttet udskudt)
- ❌ Ny tabel `partner_assignments` (kommer i 7F)
- ❌ Bred RLS-tightening på service_cases/invoices/work_orders (kommer i 7G med separat godkendelse)
- ❌ Server-action gating (kommer i 7C, kræver TS-side først i 7B-2)
- ❌ UI-komponent `<PermissionGate>` (kommer i 7B-2)
- ❌ Audit-log udvidelse (kommer i 7G)

---

## 13) Næste skridt

1. **Henrik læser denne SQL grundigt**
2. **Henrik kører pre-migration-tjeklisten (§8.2)**
3. **Henrik godkender SQL'en eller beder om ændringer**
4. **Når approved:** jeg opretter `00108_rbac_foundation.sql` med præcis dette indhold + commits den (men kører den IKKE)
5. **Henrik kører migration manuelt** via Supabase CLI eller Dashboard
6. **Henrik bekræfter sanity-tjek (§11)**
7. **7B-2 starter:** TS-side helpers + `getAuthenticatedClientWithRole`

**Stopper her som specificeret.** Venter på Henriks SQL-approval før 00108_rbac_foundation.sql skrives.
