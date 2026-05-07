# Sprint 7A — RBAC / Permissions / Sag-scope: Komplet analyse

**Skrevet:** 2026-05-07
**HEAD ved analyse:** `67aca82`
**Scope:** Kun analyse + arkitektur-forslag — **ingen kode/migrationer/RLS-ændringer**
**Bygger ovenpå:** Tidligere kortere analyse `SPRINT_7_RBAC_PERMISSIONS_ANALYSIS.md` — denne udvider med kode-audit, sikkerhedsrisici-mapping og opdelt sprint-plan.

---

## Executive summary

ELTA CRM har **store huller** i adgangsstyring:

1. **70 server action-filer bruger `getAuthenticatedClient()`** — der kun tjekker login. **0 filer** bruger `hasPermission()`. Permissions-matricen er udelukkende en sidebar-helper.
2. **RLS er aktiveret på 60+ tabeller** men de fleste post-mig-00060 tabeller bruger `FOR ALL TO authenticated USING (true)` — dvs. *enhver* logget-ind bruger har fuld CRUD på alt.
3. **Sag-scope eksisterer ikke**: en montør med dashboard-adgang kan via direct-URL læse alle service_cases, alle invoices, alle priser, alle medarbejderløn-data.
4. **Portal-messages er offentligt lækage**: `anon` har `SELECT USING (true)` på `portal_messages` — alle der gætter et UUID kan læse beskeder.
5. **Inkonsistente rolle-modeller**: `profiles.role` (TEXT, ingen CHECK, default 'user') vs `employees.role` (CHECK admin/electrician/installer) vs TypeScript `UserRole` (admin/serviceleder/montør). Tre forskellige sandheder.
6. **Salg, bogholderi, samarbejdspartner-roller findes ikke** i nogen form.

Denne analyse leverer **konkrete forslag** til fix uden at lave nogen ændringer endnu.

---

## 1) Current state — fakta

### 1.1 Auth/profile-modellen

**Filer/tabeller:**

| Lag | Lokation | Status |
|---|---|---|
| Auth | Supabase Auth (built-in) | OK — JWT, refresh, password reset virker |
| Profile | `profiles` tabel (mig 00007 + 00047) | `role TEXT DEFAULT 'user'` — ingen CHECK |
| Employee | `employees` tabel (mig 00086) | Separat HR-record, mappes via `profile_id` (nullable!) |
| Type | `src/types/auth.types.ts` | `UserRole = 'admin' \| 'serviceleder' \| 'montør'` |
| Permissions | `src/lib/auth/permissions.ts` | Static matrix m. ~30 keys, 3 roller |
| Middleware | `src/proxy.ts` | Tjekker kun "authenticated", ingen rolle-check |
| Helper | `src/lib/actions/action-helpers.ts` | `getAuthenticatedClient() → { supabase, userId }`, **ingen role** |

**Nøgleobservationer:**

- `profiles.role`-kolonnen kan være `'user'`, `'admin'`, `'employee'` eller hvad som helst — **ingen DB-CHECK constraint**
- `employees.profile_id` er **nullable** → en employee kan eksistere uden login
- `profile_id ↔ employee.id`-mappingen er **1:1 i teorien** men ikke håndhævet
- `UserRole`-typen i TypeScript er **ikke synkroniseret** med hverken `profiles.role`-værdier eller `employees.role`-værdier

### 1.2 Permissions-matrix

`src/lib/auth/permissions.ts` har ~30 permission keys grupperet:
- `leads.*`, `inbox.*`, `offers.*`, `customers.*`, `projects.*`, `service.*`, `tasks.*`
- `time.*` (med `time.view_own`, `time.view_all`, `time.edit_own`, `time.edit_all`)
- `economy.*` (kun admin+serviceleder ser, kun admin redigerer)
- `settings.*`, `users.*`, `employees.*`, `tools.*`, `calendar.*`

**Brug i kodebase:**

| Konsument | Antal filer | Coverage |
|---|---|---|
| UI sidebar | `src/components/layout/sidebar.tsx` | 1 fil — gater menu-items |
| Self-reference | `src/lib/auth/permissions.ts` | 1 fil — selve definitionen |
| Server action | `src/lib/actions/employees.ts` | 1 fil — eneste action der gates |
| **Mangler** | **70 actions, alle dashboard-pages, alle API routes** | **0 %** |

Server actions kalder kun `getAuthenticatedClient()` og **stoler på RLS** — som ofte er åben.

### 1.3 RLS-state efter migration

**Tre forskellige RLS-mønstre:**

**Mønster A — Scoped (mig 00007, leads/offers/customers/messages/projects/time_entries):**
```sql
CREATE POLICY "..." ON leads FOR SELECT USING (
  assigned_to = auth.uid() OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
```
Sund pattern. Bruger `assigned_to`/`created_by`/admin-bypass.

**Mønster B — Wide-open (mig 00062 service_cases, 00080 invoices, 00086 employees+work_orders+time_logs):**
```sql
CREATE POLICY "service_cases_all_auth" ON service_cases
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```
**Alle authenticated har fuld CRUD.** Det er det normale post-mig-60 pattern.

**Mønster C — Anon m. token-validering (portal-flows):**
```sql
CREATE POLICY "Anon can view service cases via portal" ON service_cases
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM portal_access_tokens
            WHERE customer_id = service_cases.customer_id AND is_active = true)
  );
```
OK i princippet, men token-validering er **per customer**, ikke per request. Dvs. enhver gyldig token kan læse alle sager for sin egen kunde. Ingen yderligere afgrænsning.

**Konsekvens:**
- Migration 00097 var en delvis lukning (5 dormante tabeller fik RLS aktiveret), men `USING (true)` på de nye tabeller betyder at "RLS er på" reelt = "alle kan alt".

### 1.4 Eksisterende rolle-relaterede DB-data

```
profiles.role-værdier i kode:
  - default: 'user' (fra mig 00047)
  - kontrolleret i RLS: 'admin' (mange policies)
  - i mig 00007: brugt 'role IN ('admin', 'user')' for projects.create

employees.role-værdier (CHECK):
  - 'admin', 'electrician', 'installer'

UserRole TypeScript:
  - 'admin', 'serviceleder', 'montør'

PERMISSIONS-matrix i code:
  - 'admin', 'serviceleder', 'montør'
```

**Tre forskellige rolle-akser, ingen mapping mellem dem.**

### 1.5 Sag-scope state

**service_cases (mig 00062):**
- ✅ Har `assigned_to UUID FK profiles`
- ✅ Har `created_by UUID FK profiles`
- ❌ Ingen team-tildeling
- ❌ Ingen multi-assignee (en sag = én ejer)
- ❌ Ingen scope-tag på pakker (egen/team/alle)

**work_orders (mig 00086):**
- ✅ Har `assigned_employee_id UUID FK employees`
- ❌ Tildelt til **employees**, ikke profiles → en serviceleder kan ikke direkte tildele sig selv en work order uden også at have en employee-record
- ❌ Ingen multi-assignee

**time_logs (mig 00086):**
- ✅ Har `employee_id` (kun employees)
- ❌ Ingen direkte profile-link

**Problem:** Hvis vi vil have montør M1 til at se "egne work orders", er stien:
```
profiles.id (login) → employees.profile_id → work_orders.assigned_employee_id
```
Det er to-hop, og kræver at `employees.profile_id` er udfyldt korrekt. Hvis det er NULL, kan vi ikke matche.

---

## 2) Gaps — hvad mangler

| Gap | Lag | Risiko | Prioritet |
|---|---|---|---|
| **Server actions tjekker ikke role** | Kode | Høj — montør kan kalde admin-only mutations via dev-tools | KRITISK |
| **RLS på mig 00062+ er `USING (true)`** | DB | Høj — direct-URL adgang til alt | KRITISK |
| **Sag-scope ikke implementeret** | DB + kode | Høj — montør ser alle sager | KRITISK |
| **profiles.role uden CHECK** | DB | Mellem — tillader skrald-data | HØJ |
| **Tre rolle-akser usynkroniseret** | DB + TS | Mellem — bug-magnet | HØJ |
| **Salg/bogholderi-roller findes ikke** | Alt | Lav nu, høj senere | MELLEM |
| **employees.profile_id nullable** | DB | Mellem — kan ikke matche login → employee | MELLEM |
| **Ingen team-model** | DB | Lav (Elta har én team pt.) | LAV |
| **Portal_messages anon SELECT USING (true)** | DB | **Høj — offentlig læsning** | KRITISK |
| **Audit-log mangler permission-events** | DB | Mellem — ingen sporbarhed | MELLEM |
| **Samarbejdspartner-koncept findes ikke** | Alt | Lav nu | LAV |

---

## 3) Sikkerhedsrisici — konkret kortlægning

### 3.1 Server-action lækager (UI gates ≠ server gates)

UI'en på `/dashboard/invoices/[id]` skjuler "Markér som betalt" for kreditnotaer, men server-action `markInvoicePaidAction(invoiceId)` har **ingen** check. En montør med login + DevTools kan:
1. Læse invoice IDs (fx via `/api/invoices/test/pdf` 401 → kender route)
2. Kalde `markInvoicePaidAction("uuid-fra-prod")` → action validerer kun `requireAuth()`
3. RLS lader UPDATE igennem fordi `invoices_all_auth` er `USING (true)`

**Konkrete actions med denne risiko (sample):**
- `markInvoicePaidAction`, `markInvoiceSentAction`, `deleteInvoiceDraftAction` (`invoices.ts`)
- `createCreditNoteForInvoice` (`invoice-credit.ts`)
- `deleteServiceCaseAction` (hvis findes — service_cases UPDATE policy er åben)
- `assignWorkOrderAction` (`work-orders.ts`)
- Alle mutations i `customers.ts`, `offers.ts`, `leads.ts` — selvom 00007's RLS er scoped, er det **kun** scoped på SELECT/UPDATE; DELETE i mange tabeller er åbent eller admin-only

### 3.2 RLS-lækager

| Tabel | Lækage | Hvem rammes |
|---|---|---|
| `service_cases` | `FOR ALL TO authenticated USING (true)` | Montør kan læse/redigere alle sager |
| `invoices` | Samme | Montør ser kostpriser, kreditnotaer, bogføring |
| `invoice_lines` | Samme | Inkl. hvilke timer/materialer der er booket |
| `work_orders` | Samme | Montør kan tildele sig selv andres jobs |
| `time_logs` | Samme | Montør kan se andres tider og evt. løn-info |
| `employees` | Samme | Montør kan opdatere andres rolle/status |
| `incoming_invoices` (mig 00094) | Sandsynligvis samme | Bogholderi-data lækker |
| `payroll_*` (mig 00088) | Samme — KRITISK | Lønninger eksponeret |
| `bank_transactions` (mig 00083) | Samme | Banktransaktioner eksponeret |

### 3.3 Portal-lækager

`portal_messages`:
```sql
CREATE POLICY "Portal users can view their messages"
  ON portal_messages FOR SELECT
  TO anon
  USING (true);
```
**ALT er læsbart for anon.** En person der har en gammel/lækket portal-token kan via `/portal/[token]/messages` læse meddelelser fra **alle** kunder, ikke kun sin egen. Kommentaren siger "handled in app layer" — men det er ikke godt nok når Supabase REST endpoints kan tilgås direkte med anon key.

`offer_signatures`:
```sql
CREATE POLICY "Anyone can create signatures"
  ON offer_signatures FOR INSERT TO anon WITH CHECK (true);
```
Anyone kan oprette en signatur for ENHVER offer_id. Hvis nogen kender offer_id, kan de "underskrive" på vegne af kunden.

### 3.4 Direct REST API-lækager

Supabase eksponerer auto-genererede REST endpoints. Hvis RLS er åben, kan klient med anon key (eller authenticated key) hente vilkårlige data udenom UI'en:
```
GET /rest/v1/invoices?select=*  → returnerer alle invoices
GET /rest/v1/employees?select=email,role  → liste alle medarbejdere
```

### 3.5 Cron + service role

Cron-routes (`/api/cron/*`) bruger `service_role` key som bypasser RLS helt. Det er korrekt design, men hvis `CRON_SECRET` lækker, kan en angriber kalde cron-endpoints og dermed forårsage skade (fx mass-rykkere, sync-storms). `timingSafeEqual` er på plads — godt.

---

## 4) Anbefalet permission-model

### 4.1 Roller

7 roller, flad model, eksplicit permission-matrix per rolle (ingen arvet hierarchical RBAC):

```
admin              ← fuld adgang
serviceleder       ← alle/team-sager + planlægning + medarbejdere
montør             ← egne work orders + tidsregistrering
salg               ← leads + tilbud + kunder, ingen kostpriser/faktura
bogholderi         ← faktura + kreditnota + e-conomic + betaling
samarbejdspartner  ← kun tildelte sager (intet system-login)
kundeportal        ← portal_access_tokens (intet profiles-record)
```

`samarbejdspartner` og `kundeportal` har **ikke** `profiles`-rækker — de har egne mekanismer (token + tabel-junction). Resten har profiles-record med rolle.

### 4.2 Foreslåede permission keys

Udvidelse af eksisterende `permissions.ts`. Format: `<modul>.<aktion>[.<scope>]`.

```typescript
// Customers
'customers.view'                ['admin','serviceleder','montør','salg','bogholderi']
'customers.view.assigned'       ['samarbejdspartner']  // kun tildelte
'customers.create'              ['admin','serviceleder','salg']
'customers.edit'                ['admin','serviceleder','salg']
'customers.delete'              ['admin']
'customers.view_economy'        ['admin','serviceleder','bogholderi']

// Leads
'leads.view'                    ['admin','serviceleder','salg']
'leads.create'                  ['admin','serviceleder','salg']
'leads.edit'                    ['admin','serviceleder','salg']
'leads.delete'                  ['admin']

// Offers (tilbud)
'offers.view'                   ['admin','serviceleder','salg']
'offers.view.cost_prices'       ['admin','serviceleder']  // kostpris-kolonne
'offers.create'                 ['admin','serviceleder','salg']
'offers.edit'                   ['admin','serviceleder','salg']
'offers.send'                   ['admin','serviceleder','salg']
'offers.delete'                 ['admin']

// Service cases (sager)
'cases.view.all'                ['admin','serviceleder','bogholderi']
'cases.view.team'               ['serviceleder']
'cases.view.assigned'           ['montør','samarbejdspartner']
'cases.create'                  ['admin','serviceleder','salg']
'cases.edit'                    ['admin','serviceleder']
'cases.edit.own'                ['montør']  // kan opdatere status, ikke planlægge
'cases.close'                   ['admin','serviceleder']
'cases.delete'                  ['admin']

// Work orders
'work_orders.view.all'          ['admin','serviceleder']
'work_orders.view.assigned'     ['montør','samarbejdspartner']
'work_orders.plan'              ['admin','serviceleder']  // tildele/flytte
'work_orders.edit'              ['admin','serviceleder']
'work_orders.complete'          ['admin','serviceleder','montør']  // markér done
'work_orders.delete'            ['admin','serviceleder']

// Calendar
'calendar.view.all'             ['admin','serviceleder']
'calendar.view.team'            ['serviceleder']
'calendar.view.own'             ['montør']
'calendar.plan'                 ['admin','serviceleder']

// Time logs
'time_logs.view.all'            ['admin','serviceleder','bogholderi']
'time_logs.view.own'            ['montør']
'time_logs.create'              ['admin','serviceleder','montør']
'time_logs.edit.own'            ['montør']
'time_logs.edit.all'            ['admin','serviceleder']
'time_logs.approve'             ['admin','serviceleder']  // godkend før løn
'time_logs.delete'              ['admin']

// Materials
'materials.view'                ['admin','serviceleder','montør','bogholderi']
'materials.view.cost_prices'    ['admin','serviceleder','bogholderi']
'materials.add_to_case'         ['admin','serviceleder','montør']
'materials.edit'                ['admin','serviceleder']
'materials.delete'              ['admin','serviceleder']

// Other costs (km, diæter osv.)
'other_costs.view'              ['admin','serviceleder','montør','bogholderi']
'other_costs.add_to_case'       ['admin','serviceleder','montør']
'other_costs.edit'              ['admin','serviceleder']

// Invoices
'invoices.view.all'             ['admin','serviceleder','bogholderi']
'invoices.view.own_cases'       ['salg']  // kun fakturaer på sælgers egne sager
'invoices.create'               ['admin','serviceleder','bogholderi']
'invoices.send'                 ['admin','serviceleder','bogholderi']
'invoices.mark_paid'            ['admin','bogholderi']
'invoices.credit'               ['admin','bogholderi']
'invoices.delete_draft'         ['admin','bogholderi']

// Economy / margins / cost prices
'economy.view'                  ['admin','serviceleder','bogholderi']
'economy.edit'                  ['admin']
'economy.cost_prices'           ['admin','serviceleder','bogholderi']

// Employees
'employees.view'                ['admin','serviceleder']
'employees.edit'                ['admin']
'employees.payroll.view'        ['admin','bogholderi']
'employees.payroll.edit'        ['admin']

// Reports
'reports.view'                  ['admin','serviceleder','bogholderi']
'reports.export'                ['admin','bogholderi']

// Settings
'settings.view'                 ['admin','serviceleder']
'settings.manage'               ['admin']
'settings.suppliers'            ['admin']
'settings.economic'             ['admin','bogholderi']

// User management
'users.view'                    ['admin']
'users.create'                  ['admin']
'users.edit'                    ['admin']
'users.assign_roles'            ['admin']
'users.delete'                  ['admin']

// Calculations / packages / products
'calculations.view'             ['admin','serviceleder','salg']
'calculations.create'           ['admin','serviceleder','salg']
'packages.view'                 ['admin','serviceleder','salg']
'packages.edit'                 ['admin','serviceleder']
'products.view'                 ['admin','serviceleder','salg','montør']
'products.view.cost_prices'     ['admin','serviceleder','bogholderi']
'products.edit'                 ['admin']

// Documents / files
'documents.view.all'            ['admin','serviceleder']
'documents.view.assigned'       ['montør','samarbejdspartner']
'documents.upload'              ['admin','serviceleder','montør','samarbejdspartner']
'documents.delete'              ['admin','serviceleder']

// Customer portal
'portal.tokens.create'          ['admin','serviceleder','salg']
'portal.messages.send'          ['admin','serviceleder','salg']
```

Total: ~80 permission keys, organiseret i 14 moduler.

### 4.3 UI vs server matching

**Princip:** alle UI-gates skal have et matchende server-gate. Compile-time check ville være ideelt — overvej en TypeScript helper:

```typescript
// IDÉ — ikke implementeret
type Permission = keyof typeof PERMISSIONS
function gateAction<T>(perm: Permission, action: () => Promise<T>): Promise<T>
```

---

## 5) Anbefalet scope-model

Adgang beregnes som **AND** af to akser:

### 5.1 Akse 1 — Permission

User's rolle giver et sæt permissions via `PERMISSIONS[perm].includes(role)`. Hvis rollen ikke har permission → blok.

### 5.2 Akse 2 — Scope (kun for "view" og "edit" på data)

| Scope | Definition | Gælder permissions med suffix |
|---|---|---|
| `all` | Alle rækker | `.view.all`, `.view` (ingen suffix) |
| `team` | Rækker hvor `team_id ∈ user_teams` | `.view.team` |
| `assigned` | Rækker hvor `assigned_to = user.id` ELLER `created_by = user.id` ELLER `assigned_employee_id = user.employee_id` | `.view.assigned`, `.edit.own` |
| `own_cases` | Rækker tilknyttet sager hvor `created_by = user.id` (særligt for salg → fakturaer på egne sager) | `.view.own_cases` |
| `customer` | Rækker tilknyttet kunden hvor `customer_id = portal_token.customer_id` | Kundeportal |
| `partner_assigned` | Rækker hvor `case_id ∈ partner_assignments(user_email)` | Samarbejdspartner |

**Beregningsorden:**
1. Hent user's rolle
2. Hent user's permissions for rollen
3. For hver permission med scope-suffix → beregn relevante row-IDs
4. SELECT/UPDATE filtres dynamisk

### 5.3 Konkret eksempel — list invoices

```typescript
// Pseudo-kode for getInvoiceList
const ctx = await getAuthenticatedClientWithRole()

if (ctx.hasPermission('invoices.view.all')) {
  return await supabase.from('invoices').select('*')
}

if (ctx.hasPermission('invoices.view.own_cases')) {
  // Hent user's egne sager
  const { data: caseIds } = await supabase
    .from('service_cases')
    .select('id')
    .eq('created_by', ctx.userId)
  return await supabase.from('invoices').select('*').in('case_id', caseIds.map(c => c.id))
}

return { ok: false, error: 'Manglende tilladelse' }
```

Plus RLS som backup så direct REST-adgang også blokeres.

---

## 6) Foreslåede DB-tabeller / migrations

**Disclaimer: KUN forslag — ingen migration leveres i 7A.**

### 6.1 Konsolidér profiles.role *(mig X1)*

```sql
-- 1. Audit nuværende værdier (Henrik godkender mapping):
SELECT role, COUNT(*), ARRAY_AGG(DISTINCT email) FROM profiles GROUP BY role;

-- 2. Map til ny CHECK
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin','serviceleder','montør','salg','bogholderi'));

-- 3. Indeks for RLS-perf
CREATE INDEX idx_profiles_role ON profiles(role);
```

**Risiko:** kan fejle hvis prod har skrald-værdier. Henrik skal se kortlægning først.

### 6.2 Sag-scope kolonne *(mig X2)*

```sql
ALTER TABLE profiles
  ADD COLUMN case_scope TEXT NOT NULL DEFAULT 'own'
    CHECK (case_scope IN ('own','team','all'));

UPDATE profiles SET case_scope = 'all' WHERE role IN ('admin','bogholderi');
UPDATE profiles SET case_scope = 'team' WHERE role = 'serviceleder';
UPDATE profiles SET case_scope = 'own' WHERE role IN ('montør','salg');
```

### 6.3 Teams *(mig X3, valgfri)*

```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_in_team TEXT NOT NULL DEFAULT 'member' CHECK (role_in_team IN ('leader','member')),
  PRIMARY KEY (team_id, profile_id)
);

ALTER TABLE service_cases
  ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
```

Kan vente til Elta har flere teams.

### 6.4 service_case_members *(mig X4)*

For multi-assignee scenarier (montør M1 + montør M2 begge på samme sag):

```sql
CREATE TABLE service_case_members (
  case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_in_case TEXT NOT NULL DEFAULT 'member' CHECK (role_in_case IN ('lead','member','observer')),
  added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, profile_id)
);

CREATE INDEX idx_service_case_members_profile ON service_case_members(profile_id);
```

Backwards-compat: behold `service_cases.assigned_to` som "primær" lead, men tillad multi-tildelinger via junction.

### 6.5 employee ↔ profile link enforcement *(mig X5)*

```sql
-- Stop NULL profile_id på aktive employees
ALTER TABLE employees
  ADD CONSTRAINT employees_active_must_have_profile
  CHECK (active = false OR profile_id IS NOT NULL);

-- 1:1 mellem profile og employee
CREATE UNIQUE INDEX uq_employees_one_per_profile
  ON employees(profile_id) WHERE profile_id IS NOT NULL;
```

### 6.6 partner_assignments *(mig X6, valgfri)*

```sql
CREATE TABLE partner_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  partner_email TEXT NOT NULL,
  partner_name TEXT,
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  permissions TEXT[] NOT NULL DEFAULT ARRAY['view','upload_documents'],
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, partner_email)
);

CREATE TABLE partner_access_tokens (
  token TEXT PRIMARY KEY,
  partner_assignment_id UUID NOT NULL REFERENCES partner_assignments(id) ON DELETE CASCADE,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.7 RLS helper functions *(mig X7)*

```sql
CREATE OR REPLACE FUNCTION user_has_role(p_user_id UUID, p_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND role = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION user_can_view_case(p_case_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH u AS (SELECT role, case_scope FROM profiles WHERE id = p_user_id)
  SELECT CASE
    WHEN (SELECT case_scope FROM u) = 'all' THEN TRUE
    WHEN (SELECT case_scope FROM u) = 'own' THEN EXISTS (
      SELECT 1 FROM service_cases sc
      LEFT JOIN service_case_members scm ON scm.case_id = sc.id AND scm.profile_id = p_user_id
      LEFT JOIN employees e ON e.profile_id = p_user_id
      LEFT JOIN work_orders wo ON wo.case_id = sc.id AND wo.assigned_employee_id = e.id
      WHERE sc.id = p_case_id
        AND (sc.assigned_to = p_user_id OR sc.created_by = p_user_id
             OR scm.profile_id IS NOT NULL OR wo.id IS NOT NULL)
    )
    WHEN (SELECT case_scope FROM u) = 'team' THEN EXISTS (
      SELECT 1 FROM service_cases sc
      WHERE sc.id = p_case_id
        AND sc.team_id IN (SELECT team_id FROM team_members WHERE profile_id = p_user_id)
    )
    ELSE FALSE
  END;
$$;
```

### 6.8 audit_logs udvidelse *(mig X8)*

Hvis der ikke allerede findes:
```sql
ALTER TABLE audit_logs
  ADD COLUMN actor_role TEXT,
  ADD COLUMN actor_case_scope TEXT,
  ADD COLUMN denied_reason TEXT;

CREATE INDEX idx_audit_logs_actor_role ON audit_logs(actor_role);
CREATE INDEX idx_audit_logs_action_status ON audit_logs(action, status);
```

---

## 7) Foreslåede helper functions

### 7.1 Server-side: `getAuthenticatedClientWithRole`

```typescript
// src/lib/actions/action-helpers.ts (udvidelse)
import { cache } from 'react'

export const getAuthenticatedClientWithRole = cache(async (): Promise<{
  supabase: SupabaseClient
  userId: string
  role: UserRole
  caseScope: 'own' | 'team' | 'all'
  employeeId: string | null
  hasPermission: (perm: Permission) => boolean
  requirePermission: (perm: Permission) => void  // throws ActionError
}> => {
  const userId = await requireAuth()
  const supabase = await createClient()

  const { data } = await supabase
    .from('profiles')
    .select('role, case_scope')
    .eq('id', userId)
    .maybeSingle()

  const role = (data?.role ?? 'montør') as UserRole
  const caseScope = (data?.case_scope ?? 'own') as 'own'|'team'|'all'

  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle()

  const has = (perm: Permission) => hasPermission(role, perm)
  const req = (perm: Permission) => {
    if (!has(perm)) throw new ActionError(`Manglende tilladelse: ${perm}`, 'PERMISSION_DENIED')
  }

  return {
    supabase, userId, role, caseScope,
    employeeId: emp?.id ?? null,
    hasPermission: has,
    requirePermission: req,
  }
})
```

`cache()` sikrer at samme request kun rammer DB én gang.

### 7.2 Scope-filter helper

```typescript
export async function applyCaseScopeFilter<Q extends PostgrestFilterBuilder<...>>(
  query: Q,
  ctx: { caseScope: 'own'|'team'|'all', userId: string, employeeId: string | null },
  caseIdColumn: string = 'case_id'
): Promise<Q> {
  if (ctx.caseScope === 'all') return query

  let allowedCaseIds: string[] = []

  if (ctx.caseScope === 'own') {
    const supabase = await createClient()
    const [created, assigned, member, viaWorkOrder] = await Promise.all([
      supabase.from('service_cases').select('id').eq('created_by', ctx.userId),
      supabase.from('service_cases').select('id').eq('assigned_to', ctx.userId),
      supabase.from('service_case_members').select('case_id').eq('profile_id', ctx.userId),
      ctx.employeeId
        ? supabase.from('work_orders').select('case_id').eq('assigned_employee_id', ctx.employeeId)
        : Promise.resolve({ data: [] }),
    ])
    allowedCaseIds = unique([
      ...(created.data ?? []).map(r => r.id),
      ...(assigned.data ?? []).map(r => r.id),
      ...(member.data ?? []).map(r => r.case_id),
      ...(viaWorkOrder.data ?? []).map(r => r.case_id).filter(Boolean),
    ])
  }

  // team-scope tilsvarende

  return query.in(caseIdColumn, allowedCaseIds)
}
```

### 7.3 UI-komponent: `<PermissionGate>`

```tsx
'use client'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { hasPermission, type Permission } from '@/lib/auth/permissions'

export function PermissionGate({
  perm,
  children,
  fallback = null,
}: {
  perm: Permission | Permission[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const role = useUserRole()
  const perms = Array.isArray(perm) ? perm : [perm]
  const ok = perms.every((p) => hasPermission(role, p))
  return ok ? <>{children}</> : <>{fallback}</>
}
```

Kun til UI-skjul. Server-side check er stadig påkrævet.

---

## 8) Hvilke filer/routes/actions skal ændres

### 8.1 Kerne-infrastruktur

| Fil | Ændring | Sprint |
|---|---|---|
| `src/types/auth.types.ts` | Udvid `UserRole` med 'salg', 'bogholderi' | 7B |
| `src/lib/auth/permissions.ts` | Udvid matrix til ~80 keys, 5 internal roles | 7B |
| `src/lib/actions/action-helpers.ts` | Tilføj `getAuthenticatedClientWithRole`, `applyCaseScopeFilter` | 7B |
| `src/components/layout/sidebar.tsx` | Verificér gates med ny matrix | 7B |
| Ny: `src/lib/hooks/use-user-role.ts` | Client-side hook for UI-gating | 7C |
| Ny: `src/components/auth/permission-gate.tsx` | UI-komponent | 7C |

### 8.2 Server actions (per modul)

Disse er højest-prioritet for mutation-gating:

| Fil | Antal mutations | Kritikalitet |
|---|---|---|
| `src/lib/actions/invoices.ts` | ~15 | KRITISK (økonomi) |
| `src/lib/actions/invoice-credit.ts` | ~5 | KRITISK |
| `src/lib/actions/invoice-stage.ts` | ~5 | KRITISK |
| `src/lib/actions/service-cases.ts` | ~10 | HØJ |
| `src/lib/actions/work-orders.ts` | ~8 | HØJ |
| `src/lib/actions/time-logs.ts` | ~6 | HØJ |
| `src/lib/actions/case-materials.ts` | ~5 | HØJ |
| `src/lib/actions/case-other-costs.ts` | ~5 | HØJ |
| `src/lib/actions/employees.ts` | ~7 | KRITISK (løn) |
| `src/lib/actions/customers.ts` | ~10 | MELLEM |
| `src/lib/actions/leads.ts` | ~8 | MELLEM |
| `src/lib/actions/offers.ts` | ~12 | MELLEM |
| `src/lib/actions/portal.ts` | ~6 | KRITISK (eksternt) |
| `src/lib/actions/messages.ts` | ~5 | MELLEM |
| `src/lib/actions/incoming-invoices.ts` | ~5 | KRITISK |
| `src/lib/actions/bank-payments.ts` | ~3 | KRITISK |
| `src/lib/actions/sales-engine.ts` | ~6 | MELLEM |
| Andre 50+ actions | ~ | LAV–MELLEM |

### 8.3 Pages med direkte URL-risiko

Pages der ikke gates kan tilgås via direct URL selv hvis sidebar skjuler dem:

- `/dashboard/invoices/[id]` — skal gate `invoices.view.*`
- `/dashboard/orders/[id]` — skal gate `cases.view.*`
- `/dashboard/employees/*` — skal gate `employees.view`
- `/dashboard/incoming-invoices/*` — skal gate `invoices.view.all`
- `/dashboard/settings/*` — skal gate `settings.*`
- `/dashboard/reports/*` — skal gate `reports.view`
- `/dashboard/customers/[id]` — skal gate `customers.view*`
- `/dashboard/calendar` — skal gate `calendar.view.*`

### 8.4 RLS-policies der skal omskrives

Per modul-migration (referencer til mig-numre):
- 00007 (leads, offers, customers, projects, time_entries) — opdater 'admin' → user_has_role + tilføj nye roller
- 00009 (portal) — fix `portal_messages` anon SELECT, tighten signature INSERT
- 00062 (service_cases) — erstat `USING (true)` med `user_can_view_case()`
- 00080 (invoices, invoice_lines) — erstat `USING (true)` med scope + role
- 00081 (invoice_reminders) — samme
- 00082 (invoice_payments) — samme, kun bogholderi+admin
- 00086 (employees, work_orders, time_logs) — scoped policies
- 00088 (payroll) — kun admin+bogholderi
- 00094 (incoming_invoices) — kun admin+bogholderi
- 00100/00101 (case_materials, case_other_costs) — case-scoped
- 00104 (sub-invoice tabeller) — case-scoped
- 00107 (credit notes) — invoice-scoped

---

## 9) Prioriteret implementeringsplan

Sprint 7A er **denne analyse**. Følgende sub-sprints foreslås:

### Sprint 7B — Permission schema + helper functions *(forudsætning)*
**Mål:** Konsolidér grundlaget. Ingen breaking changes endnu.
- Migration: konsolidér `profiles.role` (med Henrik approval på mapping først)
- Udvid `UserRole` TS + permissions matrix
- Tilføj `getAuthenticatedClientWithRole`, `requirePermission` helper
- Tilføj `<PermissionGate>` UI-komponent
- Test: alle eksisterende sider virker stadig (ingen gates aktiveret endnu)
- **Estimat:** 6–8 timer
- **Risiko:** lav — additive, ingen RLS-ændringer

### Sprint 7C — Server action permission gates *(modulvis)*
**Mål:** Alle mutation-actions tjekker permission.
- 7C-1: Invoice + credit + stage actions (KRITISK først)
- 7C-2: Employees + bank-payments + incoming-invoices
- 7C-3: Service cases + work orders + time logs
- 7C-4: Customers + leads + offers
- 7C-5: Resterende actions
- Hver delsprint: type-check + build + smoke-test før commit
- **Estimat:** 2–4 timer per delsprint = 10–20 timer total
- **Risiko:** mellem — kan brække eksisterende actions hvis gates er forkerte

### Sprint 7D — Sag-scope + service_case_members
**Mål:** Implementér scope-baseret data-adgang.
- Migration: `case_scope` kolonne, `service_case_members` tabel, `team_id` på service_cases (uden teams-tabel hvis valgfri)
- RLS helper functions (user_can_view_case)
- Refaktor list-actions til at honourer scope
- Refaktor RLS på service_cases / work_orders / time_logs
- **Estimat:** 8–10 timer
- **Risiko:** høj — RLS-fejl kan låse Henrik ude

### Sprint 7E — Montør-view / egne opgaver
**Mål:** Montør-rolle får begrænset UI.
- Ny side: `/dashboard/me/work-orders` — kun egne work orders
- Skjul kostpriser, faktura-modul fra montør UI
- Server-side page-gating på alle relevante routes
- Test: log ind som montør, verificér adgangsbegrænsning
- **Estimat:** 6–8 timer

### Sprint 7F — Partner / kundeportal hardening
**Mål:** Lukke external-lækager.
- Fix `portal_messages` anon SELECT (gate by token + customer_id)
- Fix `offer_signatures` anon INSERT (kræv valid portal token)
- Migration: `partner_assignments` + `partner_access_tokens` (valgfri)
- Partner-portal UI (kun tildelte sager + dokumenter)
- **Estimat:** 8–10 timer

### Sprint 7G — RLS tightening + audit-log
**Mål:** Erstat alle `USING (true)` policies.
- 7G-1: invoices + invoice_lines + invoice-related (KRITISK)
- 7G-2: service_cases + work_orders + time_logs
- 7G-3: employees + payroll + bank
- 7G-4: case_materials + case_other_costs + invoice_lines junction
- 7G-5: kalkia + suppliers (læs for alle, edit kun admin)
- Audit-log udvidelse: actor_role, denied_reason
- Trigger på følsomme tabeller
- Admin-UI til audit-log
- **Estimat:** 12–15 timer
- **Risiko:** kritisk — test mod staging FØRST

**Total estimat for 7B-7G:** 50–70 timer.

---

## 10) Hvad der IKKE må gøres endnu

- **Ingen migration leveret i 7A** — kun foreslået
- **Ingen RLS-ændringer** — selv "lette" rettelser kan låse Henrik ude
- **Ingen rolle-konsolidering** før Henrik har set audit-output på `profiles.role`
- **Ingen server action-rewrites** før permission helper er testet (7B)
- **Ingen UI-komponent-removal** — gates skal være additive først
- **Ingen `service_role`-misbrug** for at "omgå" — det er bevidst at server-actions ikke har service-role
- **Ingen samarbejdspartner-implementation** før de 7 internal roles er stabile

---

## 11) Beslutninger Henrik skal tage før Sprint 7B

1. **Audit nuværende `profiles.role`-værdier i prod**:
   ```sql
   SELECT role, COUNT(*), ARRAY_AGG(DISTINCT email) FROM profiles GROUP BY role;
   ```
   Hvilke users skal mappes til hvilke nye roller?

2. **Skal salg + bogholderi være med fra dag 1?**
   Hvis Elta pt. kun har admin + montører, kan vi droppe disse i 7B og tilføje senere som ny migration.

3. **Skal team-modellen være obligatorisk?**
   Hvis Elta altid har én team → forenkle ved at dropbe `teams`/`team_members` og lade `serviceleder` se alt.

4. **Skal samarbejdspartner-koncept bygges i 7F eller udskydes?**
   Kompleks (token + invite + begrænset UI). Kan vente.

5. **Skal vi reaktivere `time_entries` (mig 00007) eller migrere helt til `time_logs`?**
   To tabeller med overlap, men kun `time_logs` bruges i prod. RLS på `time_entries` er user-scoped (god) men irrelevant hvis tabellen er død.

6. **Skal montør have read access til kostpriser?**
   Dansk lovgivning kræver det ikke, men nogle el-firmaer ønsker det for at give montøren bedre indkøbs-context. Default-anbefaling: NEJ.

7. **Hvor stramt skal portal-token revokering være?**
   Pt. kan en kunde have flere aktive tokens (eller token kan være "expired_at NULL = aldrig udløber"). Skal vi tvinge expiry?

---

## 12) Sammenfatning

ELTA CRM's nuværende RBAC er **bedre end ingenting** men **utilstrækkeligt for et flere-rolle ERP**. Hovedproblemerne er:

- **70 server actions trust RLS, men RLS er for åben**
- **Sag-scope mangler**, så enhver authenticated bruger kan tilgå alt
- **Portal-anon-policies har lækager**
- **Tre rolle-akser** der ikke synkroniserer

Sprint 7B-7G fixer dette i 6 sub-sprints på i alt 50–70 timer. **7A leverer ingen ændringer** — kun denne analyse + design-grundlag. Henrik skal tage 7 beslutninger før 7B kan startes.

Den vigtigste enkelt-rettelse, hvis kun ét sprint skulle gennemføres, ville være **Sprint 7C-1 (invoice action gates)** kombineret med **7G-1 (invoice RLS)** — det stopper det største angrebsflade (økonomi/kostpriser) først.
