# Sprint 7 — RBAC, Permissions, Sag-scope: Analyse

**Skrevet:** 2026-05-07
**HEAD ved analyse:** `32edd6a` (post Sprint 6F-4 hardening)
**Scope:** kun analyse + arkitektur-forslag — ingen kode/migrationer leveret endnu.

---

## Executive summary

ELTA CRM har en **delvis** RBAC-infrastruktur i dag: 3 roller defineret i TypeScript, en static permissions-matrix (~30 entries), og RLS aktiveret på 60+ tabeller. **Men sammenhængen er brudt:**

- `profiles.role` har **ingen CHECK constraint** — alle TEXT-værdier accepteres (default 'user', ikke 'employee', ikke 'admin')
- `employees.role` er en **separat role-akse** med andre værdier (`admin`/`electrician`/`installer`)
- RLS-policies bruger kun **`role = 'admin'`** — alt andet er gated samme måde
- Permissions-matrix bruges **næsten ikke** i kode (kun sidebar + employees-side) — server actions er gated per `getAuthenticatedClient()` der ikke ved noget om roller
- **Sag-scope er slet ikke implementeret**: en montør kan se alle sager, alle priser, alle fakturaer hvis han får dashboard-adgang
- Bogholderi/salg/samarbejdspartner-roller findes **ikke** i systemet endnu

**Anbefaling:** Sprint 7 leveres i 4 stages, hvor stage 1 (rolle-konsolidering + CHECK constraint) er en **breaking-fix** der skal landes før noget andet.

---

## 1) Nuværende state — detaljeret

### 1.1 Tabeller og kolonner

```
profiles
  ├── id            UUID PK
  ├── role          TEXT (NO CHECK!)  ← problem #1
  ├── is_active     BOOL
  └── ...

employees                               ← separat tabel
  ├── id            UUID PK
  ├── profile_id    UUID FK profiles(id) (nullable)
  ├── role          TEXT CHECK IN ('admin','electrician','installer')
  └── ...

service_cases
  ├── id            UUID PK
  ├── customer_id   UUID FK customers
  ├── assigned_to   UUID FK profiles  ← sag-ejer
  ├── created_by    UUID FK profiles  ← opretter
  └── ...

work_orders
  ├── id                   UUID PK
  ├── case_id              UUID FK service_cases
  ├── assigned_employee_id UUID FK employees   ← MONTØR (employees, ikke profiles!)
  └── ...

time_logs
  ├── id           UUID PK
  ├── employee_id  UUID FK employees  ← KUN employees, ikke profiles
  └── ...
```

**Inkonsistens:** sag tildeles til `profiles` (assigned_to), men work order tildeles til `employees` (assigned_employee_id). Time logs er kun på `employees`. Det betyder en montør har **ét login** (profiles) og **ét HR-record** (employees) der skal mappes via `employees.profile_id` for at kunne både se egne sager og logge tid.

### 1.2 TypeScript / kode-side

```typescript
// src/types/auth.types.ts
export type UserRole = 'admin' | 'serviceleder' | 'montør'
```

Tre roller. Men:
- `profiles.role` defaulter til `'user'` (migration 00047) — **ikke** `'admin'/'serviceleder'/'montør'`
- Eksisterende rows i prod kan have hvilken-som-helst værdi
- Ingen migration har kørt for at konsolidere

### 1.3 Permissions-matrix

`src/lib/auth/permissions.ts` definerer ~30 permissions med rolle-array:

```typescript
'leads.view':       ['admin', 'serviceleder', 'montør'],
'offers.view':      ['admin', 'serviceleder'],         // ← montør ser IKKE tilbud
'economy.view':     ['admin', 'serviceleder'],
'economy.edit':     ['admin'],
'time.view_own':    ['admin', 'serviceleder', 'montør'],
'time.view_all':    ['admin', 'serviceleder'],
```

Hjælpere: `hasPermission()`, `requirePermission()`, `getUserPermissions()`.

**Problem:** kun **3 filer i produktion** importerer denne matrix:
- `src/components/layout/sidebar.tsx` — gater menu-items
- `src/lib/auth/permissions.ts` — selv
- `src/lib/actions/employees.ts` — én action

Alle andre 50+ server actions kalder kun `getAuthenticatedClient()` som returnerer `{ supabase, userId }` uden rolle-info. Dvs. **enhver authenticated user kan kalde enhver action** — RLS er den eneste reelle gate, og RLS gater kun på admin-only basis.

### 1.4 RLS-state

Migration 00097 aktiverede RLS på 5 tabeller der havde dormante policies. Resten af tabellerne (60+ via grep) har RLS allerede. Standard policy-mønster:

```sql
-- Eksempel fra mig 00096
CREATE POLICY ... USING (
  EXISTS (SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin')
);
```

**Gate-niveau:** binær — admin kan, alle andre kan ikke. Der er **ingen** policy der differentierer serviceleder vs montør, og **ingen** policy der scoper "egne sager" vs "alle sager".

### 1.5 Det betyder konkret

I dag er sikkerheds-postur:

| Tilfælde | Konsekvens |
|---|---|
| Montør M1 logger ind | Kan se sidebar-items per `permissions.ts` (ok) |
| Montør M1 navigerer til `/dashboard/customers/X` | RLS lader ham læse alle kunder (alle authenticated kan læse) |
| Montør M1 åbner direct-URL `/dashboard/invoices/Y` | RLS lader ham læse fakturaen — han kan se kostpriser |
| Salgs-rolle "Sara" oprettes | **Findes ikke i systemet** — der er ingen 'salg'-rolle |
| Bogholderi-rolle "Bo" oprettes | **Findes ikke** |
| Samarbejdspartner gives adgang til én sag | **Eksisterer ikke** — ingen "external_partner"-koncept |

---

## 2) Mål for Sprint 7

Defineret efter master roadmap §7 + master roadmap §10 prioritering:

1. **Konsolidér roller** — én sandhed for "hvilken rolle har denne user"
2. **Tilføj manglende roller**: salg, bogholderi, samarbejdspartner, external (kundeportal har sin egen mekanisme)
3. **Implementér sag-scope**: egne / team / alle
4. **Refaktor RLS** så policies differentierer roller og sag-scope
5. **Server-action gating** — alle server actions tjekker permissions, ikke kun authenticated
6. **UI-gating** — skjul knapper/data baseret på rolle
7. **Audit-log** — hvem så hvad / hvornår

---

## 3) Foreslået rolle-arkitektur

### 3.1 Rolle-hierarki

```
admin                    ← fuld adgang, settings, alle moduler
└── serviceleder         ← alle sager + medarbejdere + fakturering
    ├── montør           ← egne work orders + tidsregistrering
    ├── salg             ← tilbud + leads + kunder, IKKE timepriser/faktura
    └── bogholderi       ← faktura + kreditnota + e-conomic, IKKE sag-detaljer
external_partner         ← kun adgang til specifikke sager (read-only + dokumenter)
                            via separat invite-mekanisme (ny `case_collaborators` tabel)
customer (portal)        ← eksisterende portal_access_tokens, ingen ændring
```

**Designvalg:** flad rolle-model med 6 niveauer (5 internal + 1 external). Ikke fuld hierarchical RBAC med arvede permissions — det bliver hurtigt rodet. I stedet bruger vi en **explicit permissions-matrix** per rolle.

### 3.2 Sag-scope

Ortogonal til rolle. Hver rolle har et default-scope, men kan overrides:

| Scope | Definition | Default-rolle |
|---|---|---|
| `own` | service_cases hvor `assigned_to = user.id` ELLER `created_by = user.id` | montør |
| `team` | service_cases hvor `assigned_to` er i samme team som user | serviceleder for et team |
| `all` | Alle service_cases | admin, serviceleder uden team-restrict, bogholderi (læs faktura), salg (læs tilbud) |
| `specific` | Individuelle sager via junction | external_partner |

Implementeres som ny kolonne `profiles.case_scope` enum + helper funktion i Postgres.

---

## 4) Foreslået migration-pipeline

### 4.1 Migration 00108 — `profiles.role` konsolidering

```sql
-- Step 1: Kortlæg eksisterende værdier
SELECT role, COUNT(*) FROM profiles GROUP BY role;
-- Forventet: 'admin', 'user', evt. 'employee', evt. NULL

-- Step 2: Map gamle værdier til nye
UPDATE profiles SET role = 'admin'        WHERE role = 'admin';
UPDATE profiles SET role = 'serviceleder' WHERE role IN ('user','employee') AND ...;
UPDATE profiles SET role = 'montør'       WHERE role = 'employee' AND id IN (
  SELECT profile_id FROM employees WHERE role IN ('electrician','installer')
);

-- Step 3: Tilføj CHECK constraint
ALTER TABLE profiles
  ALTER COLUMN role SET NOT NULL,
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin','serviceleder','montør','salg','bogholderi'));

-- Step 4: Indeks for fremtidig RLS-perf
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
```

**Risiko:** hvis prod har værdier udenfor listen → INSERT fejler. **Stop-the-world**: vis Henrik mappingen FØR migration kører, og lad ham approve manuelt.

### 4.2 Migration 00109 — Sag-scope kolonne

```sql
ALTER TABLE profiles
  ADD COLUMN case_scope TEXT NOT NULL DEFAULT 'own'
    CHECK (case_scope IN ('own','team','all','specific'));

-- Default-mapping efter rolle
UPDATE profiles SET case_scope = 'all'  WHERE role IN ('admin','bogholderi','salg');
UPDATE profiles SET case_scope = 'team' WHERE role = 'serviceleder';
UPDATE profiles SET case_scope = 'own'  WHERE role = 'montør';
```

### 4.3 Migration 00110 — Teams + team_members

```sql
CREATE TABLE teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  leader_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_in_team TEXT NOT NULL DEFAULT 'member' CHECK (role_in_team IN ('leader','member')),
  PRIMARY KEY (team_id, profile_id)
);

-- ALTER service_cases ADD team_id (optional — bruges kun når sag er team-tildelt)
ALTER TABLE service_cases
  ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX idx_service_cases_team_id ON service_cases(team_id);
```

### 4.4 Migration 00111 — case_collaborators (external_partner)

```sql
CREATE TABLE case_collaborators (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  invited_by   UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  permissions  TEXT[] NOT NULL DEFAULT ARRAY['read'],  -- read, comment, document_upload
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ,
  UNIQUE(case_id, email)
);
```

External_partner får **ikke** profiles-record. De får token (lignende portal_access_tokens) eller engangs-mail-link. Implementation kan vente til Sprint 7.X.

### 4.5 Migration 00112 — RLS helper functions

```sql
-- Kerne-funktion: kan denne user se denne sag?
CREATE OR REPLACE FUNCTION user_can_view_case(p_case_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH u AS (
    SELECT role, case_scope FROM profiles WHERE id = p_user_id
  )
  SELECT
    CASE
      WHEN (SELECT case_scope FROM u) = 'all' THEN TRUE
      WHEN (SELECT case_scope FROM u) = 'own' THEN EXISTS (
        SELECT 1 FROM service_cases
        WHERE id = p_case_id AND (assigned_to = p_user_id OR created_by = p_user_id)
      )
      WHEN (SELECT case_scope FROM u) = 'team' THEN EXISTS (
        SELECT 1 FROM service_cases sc
        WHERE sc.id = p_case_id
          AND sc.team_id IN (
            SELECT team_id FROM team_members WHERE profile_id = p_user_id
          )
      )
      ELSE FALSE
    END;
$$;

-- Hjælpe-funktion til admin/role-check
CREATE OR REPLACE FUNCTION user_has_role(p_user_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND role = ANY(p_roles)
  );
$$;
```

### 4.6 Migration 00113–00118 — Refaktor eksisterende policies

Alle eksisterende `role = 'admin'` policies omskrives til at bruge `user_has_role(auth.uid(), ARRAY[...])` med relevante roller. Sag-relaterede tabeller bruger `user_can_view_case()`.

**Strategi:** én migration per modul, så vi kan rulle tilbage hvis én sub-set fejler:
- 00113: customers + leads + offers
- 00114: service_cases + work_orders + time_logs
- 00115: invoices + invoice_lines + invoice_predecessors + invoice_reminders
- 00116: kalkia + suppliers (read for alle authenticated, edit for admin)
- 00117: settings + audit_logs
- 00118: portal_access_tokens + portal_messages (uændret, men cross-check)

---

## 5) Server-action gating

### 5.1 Ny helper

```typescript
// src/lib/actions/action-helpers.ts (udvidelse)
export async function getAuthenticatedClientWithRole(): Promise<{
  supabase: SupabaseClient
  userId: string
  role: UserRole
  caseScope: CaseScope
  hasPermission: (perm: Permission) => boolean
}>
```

Cacher rolle-lookup per request (Next.js `cache()` på server-side).

### 5.2 Pattern for actions

```typescript
'use server'
export async function deleteOfferAction(offerId: string) {
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('offers.delete')) {
    return { ok: false, error: 'Manglende tilladelse' }
  }
  // ... fortsæt
}
```

### 5.3 Coverage-mål

- **Phase 1**: alle mutation-actions (create/update/delete) gates
- **Phase 2**: alle list-actions med scope-filter (montør ser kun egne)
- **Phase 3**: alle detail-actions med scope-filter (montør får 404 på fremmed sag)

Estimeret 80+ filer at opdatere. Kan gøres modulvis.

---

## 6) UI-gating

### 6.1 Eksisterende infrastruktur

Sidebar.tsx bruger allerede `hasPermission()`. Mønster kan udbredes:

```tsx
// Eksisterende pattern (sidebar)
{hasPermission(role, 'offers.view') && <SidebarItem href="/dashboard/offers" />}

// Nyt pattern for action-buttons
<button
  disabled={!hasPermission(role, 'offers.delete')}
  className="..."
  title={!hasPermission(role, 'offers.delete') ? 'Manglende tilladelse' : undefined}
>
```

### 6.2 Foreslåede UI-ændringer

| Side | Gating |
|---|---|
| `/dashboard/customers/[id]` | Skjul "Slet kunde" for alle <admin |
| `/dashboard/offers/[id]` | Skjul kostpris-kolonne for salg-rolle |
| `/dashboard/invoices/[id]` | Skjul faktura-detail for montør (ikke i sidebar, men URL-direct) |
| `/dashboard/orders/[id]` Fakturakladde-tab | Skjul tab for salg-rolle |
| `/dashboard/employees/*` | Hele modulet kun for admin/serviceleder |
| `/dashboard/settings/*` | Kun admin (allerede gated) |

### 6.3 Server-side rendering side-gating

Pages skal **også** redirect/404 hvis URL åbnes direkte:

```typescript
// src/app/dashboard/employees/page.tsx
export default async function EmployeesPage() {
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('employees.view')) {
    notFound() // eller redirect('/dashboard')
  }
  // ...
}
```

Det skal **ikke** være en client-side check kun (kan omgås via dev-tools).

---

## 7) Sag-scope — konkret implementation

### 7.1 Liste-views (montør ser kun egne)

```typescript
// src/lib/actions/service-cases.ts
export async function listServiceCases() {
  const ctx = await getAuthenticatedClientWithRole()

  let query = ctx.supabase.from('service_cases').select('*')

  if (ctx.caseScope === 'own') {
    query = query.or(`assigned_to.eq.${ctx.userId},created_by.eq.${ctx.userId}`)
  } else if (ctx.caseScope === 'team') {
    const { data: teams } = await ctx.supabase
      .from('team_members')
      .select('team_id')
      .eq('profile_id', ctx.userId)
    const teamIds = (teams ?? []).map((t) => t.team_id)
    query = query.in('team_id', teamIds)
  }
  // 'all' = no filter

  return await query.order('created_at', { ascending: false })
}
```

### 7.2 RLS som backup

Selv hvis frontend glemmer at filtrere, sikrer RLS at montør **ikke** kan læse fremmede sager via direct-URL eller crafted query:

```sql
CREATE POLICY service_cases_select_scoped ON service_cases
  FOR SELECT TO authenticated
  USING (user_can_view_case(id, auth.uid()));
```

### 7.3 Cross-table konsistens

Work orders + time logs + invoices arver scope fra deres parent service_case:

```sql
CREATE POLICY work_orders_select_scoped ON work_orders
  FOR SELECT TO authenticated
  USING (user_can_view_case(case_id, auth.uid()));

CREATE POLICY invoices_select_scoped ON invoices
  FOR SELECT TO authenticated
  USING (
    case_id IS NULL  -- non-case invoices kun for admin/bogholderi
      OR user_can_view_case(case_id, auth.uid())
  )
  AND (
    case_id IS NOT NULL
      OR user_has_role(auth.uid(), ARRAY['admin','bogholderi'])
  );
```

---

## 8) Audit-log

### 8.1 Eksisterende `audit_logs` tabel

Migration 00019 introducerede en `audit_logs` tabel. Skal vi bruge den eller bygge ny?

**Anbefaling:** udvid eksisterende. Tilføj kolonner:
- `actor_role` — snapshot af rolle ved hændelsen
- `actor_case_scope` — snapshot af scope
- `denied_reason` — hvis det var et afvist forsøg

### 8.2 Auto-log via trigger

Følsomme tabeller (invoices, customers, offers) får triggers der INSERT'er audit-rækker ved INSERT/UPDATE/DELETE.

### 8.3 Action-side logging

For server actions med permission-check, log både succes og denials:

```typescript
if (!ctx.hasPermission('invoices.delete')) {
  await logAudit({
    action: 'invoices.delete',
    entity_id: invoiceId,
    actor_id: ctx.userId,
    actor_role: ctx.role,
    status: 'denied',
    denied_reason: 'permission missing',
  })
  return { ok: false, error: 'Manglende tilladelse' }
}
```

---

## 9) Foreslået sprint-opdeling

Sprint 7 er **stort** (estimeret 30–50 timer). Bør opdeles:

### Sprint 7A — Rolle-konsolidering + CHECK constraint *(BREAKING)*
- Migration 00108: profiles.role konsolidering med Henriks approval på mapping
- Opdater TypeScript: udvid `UserRole` type (admin/serviceleder/montør/salg/bogholderi)
- Udvid PERMISSIONS-matrix med salg + bogholderi
- Opdater register-flow: ny user defaulter til 'salg' eller minimum-rolle
- **Estimat: 4–6 timer**

### Sprint 7B — Server-action gating
- Ny `getAuthenticatedClientWithRole()` helper
- Refaktor mutation-actions (offers, customers, leads) til at bruge `hasPermission()`
- Refaktor faktura-actions til at gates economy.* permissions
- **Estimat: 8–12 timer**

### Sprint 7C — Sag-scope + teams
- Migration 00109: profiles.case_scope kolonne
- Migration 00110: teams + team_members + service_cases.team_id
- Migration 00112: RLS helper functions
- Refaktor list-actions til at honourer scope
- **Estimat: 8–10 timer**

### Sprint 7D — RLS-refaktor + UI-gating
- Migrationer 00113–00118: alle eksisterende RLS-policies opgraderes
- UI-gating på alle relevante sider + buttons
- Server-side rendering side-gates
- **Estimat: 10–15 timer**

### Sprint 7E — Audit-log
- Audit-table-udvidelse
- Triggers på følsomme tabeller
- Action-side denial-logging
- Admin-UI til at læse audit-log
- **Estimat: 4–6 timer**

### Sprint 7F — External_partner *(valgfri)*
- Migration 00111: case_collaborators
- Token-baseret invite-flow
- Begrænset case-detail-side for external
- **Estimat: 6–8 timer**

---

## 10) Risici

| Risiko | Sandsynlighed | Konsekvens | Mitigation |
|---|---|---|---|
| Migration 00108 fejler pga. unmappede roller | Høj | Stop-the-world, rollback nødvendig | Vis Henrik mapping FØR run; lav backup-script først |
| Eksisterende RLS-policies kollapser | Mellem | User locked out af systemet | Rolle 'admin' beskyttes mod ændring; test mod staging først |
| Performance-degradation pga. RLS-functions | Mellem | Langsommere lister | STABLE marker + indeks; benchmark mod sample data |
| Sag-scope filter forglemmes i nye actions | Høj | Privacy-leak | Lint-rule eller code-review-tjekliste |
| Montør får read access til faktura via URL-direct | Mellem | Montør ser kostpriser | RLS skal være vandtæt; ikke kun frontend-gate |
| Audit-log fylder DB | Lav | Performance / cost | Partition by month; auto-purge efter 12 måneder |
| External_partner mister adgang inde i en sag | Lav | UX | Token-revoke flow + email-notif |

---

## 11) Hvad denne analyse IKKE besluttede

- **Custom permissions per user** (override default fra rolle) — ikke i scope; alle users har deres roles default permissions
- **Multi-tenant** (flere virksomheder i samme database) — ikke relevant for Elta-only setup
- **API-tokens / personal access tokens** for integrationer — adskilt fra user-RBAC
- **2FA / SSO** — separat sikkerheds-track
- **Service accounts** for cron-jobs — eksisterer allerede via service_role-key, ingen ændring

---

## 12) Anbefalet næste skridt

**Inden Sprint 7A startes:**

1. **Audit nuværende `profiles.role`-værdier i prod**
   ```sql
   SELECT role, COUNT(*), ARRAY_AGG(email) AS emails
   FROM profiles
   GROUP BY role;
   ```
   Henrik skal se outputtet og bekræfte hvor hver user skal mappes til ny rolle.

2. **Beslut om "salg"-rollen skal eksistere fra dag 1** eller udskydes
   Hvis Elta pt. kun har admin + montører, kan vi droppe salg/bogholderi i Sprint 7A og tilføje dem senere som ny migration. Det reducerer scope.

3. **Beslut om team-modellen skal være obligatorisk eller optional**
   Hvis serviceleder altid er for én team, så skal `profiles.team_id` evt. erstatte `team_members`-junction. Junction er mere fleksibel men mere kode.

4. **Beslut om external_partner skal med i Sprint 7 eller udskydes til Sprint 8+**
   Det er det mest komplekse stykke (token + invite-flow + begrænset UI). Kan udskydes uden at blokere intern RBAC.

Når disse 4 beslutninger er truffet, kan Sprint 7A starte med fokus alene på rolle-konsolidering.
