# Pilot v1 Security Foundation — Status Report

**Skrevet:** 2026-05-08
**Sprint:** 7 Pilot (CP2–CP5)
**Production HEAD ved rapport:** `53645f4`
**Snapshot af tidligere sprint:** Sprint 6F-4 + invoice-modul produktionsklart internt (se `INVOICE_MODULE_STATUS_2026-05-06.md`)

---

## 1) Executive summary

Pilot v1 leverer **TS-side permission foundation** + **server-side guards** på de mest kritiske moduler **uden at røre DB, RLS, portal eller auth-flow**. Foundation kan koble på `00108_rbac_foundation.sql` migration når Henrik godkender den.

**Hvad er gated:** invoice/credit/stage actions, employee/payroll actions, settings/team/integrations actions. **24 server actions** har nu eksplicitte permission-checks.

**Hvad er IKKE gated (tilsigtet):** kunder/leads/tilbud/sager/work_orders/time_logs actions, portal-flows, internal webhook-helpers. RLS er fortsat den eneste DB-layer gate på de moduler.

**Kritiske fund undervejs:** `updateCompanySettings` og `getSmtpSettings` (sidstnævnte returnerede SMTP-password plaintext) havde **ingen role-gate** før denne sprint.

---

## 2) Commits

| Commit | Beskrivelse |
|---|---|
| `c624517` | CP2: RBAC TS helpers + permissions matrix |
| `53bd8df` | CP3: gate invoice actions with permissions |
| `83e6b66` | CP4: gate employee and payroll actions |
| `53645f4` | CP4B: gate settings and economic actions |

---

## 3) Filer ændret

| Fil | CP | Type |
|---|---|---|
| `src/types/auth.types.ts` | CP2 | UserRole udvidet |
| `src/lib/auth/roles.ts` | CP2 | ROLES + helpers udvidet |
| `src/lib/auth/permissions.ts` | CP2 | Matrix udvidet til 5 roller × ~80 keys |
| `src/lib/actions/action-helpers.ts` | CP2 | Ny `getAuthenticatedClientWithRole()` |
| `src/lib/actions/invoices.ts` | CP3 | 12 actions gated |
| `src/lib/actions/employees.ts` | CP4 | 8 actions gated + rate-stripping |
| `src/lib/actions/settings.ts` | CP4B | 11 actions gated |
| `src/lib/actions/integrations.ts` | CP4B | 13 actions gated |

**Total:** 8 filer, 4 commits. Working tree clean.

---

## 4) Alle gated actions

### Invoice module (12)
| Action | Permission | Pilot-roller |
|---|---|---|
| `listUnbilledForCaseAction` | `invoices.create` | admin, serviceleder, bogholderi |
| `getInvoiceDetailAction` | `invoices.view.all` | admin, serviceleder, bogholderi |
| `markInvoiceSentAction` | `invoices.send` | admin, serviceleder, bogholderi |
| `markInvoicePaidAction` | `invoices.mark_paid` | **admin, bogholderi** |
| `sendInvoiceEmailAction` | `invoices.send` | admin, serviceleder, bogholderi |
| `deleteInvoiceDraftAction` | `invoices.delete_draft` | **admin, bogholderi** |
| `getCreditedAmountForInvoiceAction` | `invoices.view.all` | admin, serviceleder, bogholderi |
| `createCreditNoteForInvoiceAction` | `invoices.credit` | **admin, bogholderi** |
| `createStageInvoiceAction` | `invoices.create` | admin, serviceleder, bogholderi |
| `createFinalInvoiceAction` | `invoices.create` | admin, serviceleder, bogholderi |
| `listStageInvoicesForCaseAction` | `invoices.view.all` | admin, serviceleder, bogholderi |
| `createInvoiceDraftFromCaseAction` | `invoices.create` | admin, serviceleder, bogholderi |

### Employee/payroll module (8)
| Action | Permission | Pilot-roller |
|---|---|---|
| `listEmployeesAction` | `employees.view` (+ strip rates if no payroll.view) | admin, serviceleder |
| `getEmployeeAction` | `employees.view` (+ strip if no payroll.view) | admin, serviceleder |
| `getEmployeeProjectImpactAction` | `employees.payroll.view` | **admin only** |
| `getCompensationHistoryAction` | `employees.payroll.view` | **admin only** |
| `createEmployeeAction` | `employees.edit` | **admin only** |
| `updateEmployeeAction` | `employees.edit` | **admin only** |
| `setEmployeeActiveAction` | `employees.edit` | **admin only** |
| `setEmployeeCompensationAction` | `employees.payroll.edit` | **admin only** |

### Settings module (11)
| Action | Permission | Pilot-roller |
|---|---|---|
| `getCompanySettings` | `settings.view` | admin, serviceleder |
| `updateCompanySettings` | `settings.manage` | **admin only** |
| `getSmtpSettings` | `settings.manage` | **admin only** |
| `uploadCompanyLogo` | `settings.manage` | **admin only** |
| `deleteCompanyLogo` | `settings.manage` | **admin only** |
| `getTeamMembers` | `users.view` | **admin only** |
| `getTeamInvitations` | `users.view` | **admin only** |
| `updateTeamMember` | `users.edit` | **admin only** |
| `inviteTeamMember` | `users.create` | **admin only** |
| `cancelInvitation` | `users.edit` | **admin only** |
| `resendInvitation` | `users.edit` | **admin only** |

### Integrations module (13)
| Action | Permission | Pilot-roller |
|---|---|---|
| `getIntegrations` | `settings.economic` | admin, bogholderi |
| `getIntegration` | `settings.economic` | admin, bogholderi |
| `createIntegration` | `settings.economic` | admin, bogholderi |
| `updateIntegration` | `settings.economic` | admin, bogholderi |
| `deleteIntegration` | `settings.economic` | admin, bogholderi |
| `toggleIntegration` | `settings.economic` | admin, bogholderi |
| `getWebhooks` | `settings.economic` | admin, bogholderi |
| `createWebhook` / `updateWebhook` / `deleteWebhook` | `settings.economic` | admin, bogholderi |
| `getEndpoints` / `createEndpoint` / `updateEndpoint` / `deleteEndpoint` | `settings.economic` | admin, bogholderi |
| `getIntegrationLogs` | `settings.economic` | admin, bogholderi |
| `exportOfferToIntegration` | `settings.economic` | admin, bogholderi |
| `testIntegrationConnection` | `settings.economic` | admin, bogholderi |

**Total: 44 server actions gated** (12 + 8 + 11 + 13).

---

## 5) Roller — hvad kan de gøre i pilot?

| Modul | admin | serviceleder | bogholderi | montør | salg |
|---|---|---|---|---|---|
| Faktura læsning | ✅ alle | ✅ alle | ✅ alle | ❌ | ❌ |
| Faktura oprettelse | ✅ | ✅ | ✅ | ❌ | ❌ |
| Faktura send | ✅ | ✅ | ✅ | ❌ | ❌ |
| Markér betalt | ✅ | ❌ | ✅ | ❌ | ❌ |
| Kreditnota | ✅ | ❌ | ✅ | ❌ | ❌ |
| Slet kladde | ✅ | ❌ | ✅ | ❌ | ❌ |
| Medarbejder-liste | ✅ m. rates | ✅ uden rates | ❌ | ❌ | ❌ |
| Løn / satser læs | ✅ | ❌ | ❌ | ❌ | ❌ |
| Løn / satser redig. | ✅ | ❌ | ❌ | ❌ | ❌ |
| Project impact (cost) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Company settings læs | ✅ | ✅ | ❌ | ❌ | ❌ |
| Company settings redig. | ✅ | ❌ | ❌ | ❌ | ❌ |
| SMTP-data | ✅ | ❌ | ❌ | ❌ | ❌ |
| Team management | ✅ | ❌ | ❌ | ❌ | ❌ |
| Integrations / e-conomic | ✅ | ❌ | ✅ | ❌ | ❌ |

**Henrik's kerneregler verificeret:**
- ✅ admin må alt
- ✅ serviceleder må sagsdrift/planlægning + se medarbejdere uden rates + faktura-oprettelse (men ikke betal/credit/slet)
- ✅ bogholderi må faktura/kreditnota/økonomi/integrations, men IKKE medarbejderløn/satser
- ✅ montør har ingen invoice/employee/settings/integrations adgang (pilot scope)
- ✅ salg har ingen invoice/employee/settings/integrations adgang (pilot scope)

---

## 6) Hvad der STADIG IKKE er sikret

### 6.1 Server actions uden role-gate
Følgende moduler har **fortsat kun authenticated-check** (ikke role-check):

- `src/lib/actions/customers.ts` — kunde CRUD
- `src/lib/actions/leads.ts` — lead CRUD
- `src/lib/actions/offers.ts` — tilbud CRUD (sender via `triggerWebhooks` der er internal helper)
- `src/lib/actions/projects.ts` — projekt CRUD
- `src/lib/actions/service-cases.ts` — sag CRUD
- `src/lib/actions/work-orders.ts` — work order CRUD
- `src/lib/actions/time-logs.ts` — tidsregistrering
- `src/lib/actions/case-materials.ts` — materialer på sag
- `src/lib/actions/case-other-costs.ts` — øvrige omkostninger
- `src/lib/actions/incoming-invoices.ts` — leverandør-fakturaer
- `src/lib/actions/bank-payments.ts` — bank-betalinger
- `src/lib/actions/messages.ts` — interne beskeder
- `src/lib/actions/portal.ts` — kundeportal (separat hardening i 7B-1B)
- ...og ~40 andre actions

### 6.2 RLS er stadig "FOR ALL TO authenticated USING (true)"
Alle de tabeller, server actions skriver til, har stadig åbne RLS-policies. Permission-gates beskytter mod **app-niveau adgang via UI/server actions**, men ikke mod **direkte REST-adgang** med anon/authenticated key. Dette er bevidst — vi rører ikke RLS i pilot.

### 6.3 UI-side gating
Alle pilot gates er **server-side only**. UI (sidebar, knapper, sider) har fortsat kun den eksisterende `permissions.ts`-baserede gating der allerede var der før denne sprint. Det betyder:
- En montør kan stadig SE invoice-detail-knapper i UI'et hvis sidebar tillader det
- Men når montør klikker, returnerer server action `Manglende tilladelse: invoices.view.all`
- Der er ingen "graceful degradation" i UI — gate-fejlene viser blot fejlbeskeden

### 6.4 Side-gating på direct URL
Pages der kan tilgås via direct URL:
- `/dashboard/invoices/[id]` viser fejl i action, men page-shell render
- `/dashboard/employees/*` har sider uden server-side `notFound()`-tjek
- `/dashboard/settings/*` har sider uden side-side rolle-tjek

Page-side gating hører til en senere sprint.

---

## 7) Hvorfor RLS stadig skal strammes senere

- App-niveau gates kan **omgås via direct REST**: Supabase eksponerer `/rest/v1/<table>` med anon-key. Hvis RLS er åben, kan klienten hente data uden at gå via server actions.
- Pilot-fokus var **server-action-niveau** for at undgå at låse Henrik ude eller bryde portal-flows.
- Næste skridt: Sprint 7G (planlagt) — refaktor RLS-policies modulvis, helst efter at kode er testet med strammere gates.
- 7G kræver `00108_rbac_foundation.sql` migration kørt så RLS-helpers (`user_has_role`, `user_has_permission`) er tilgængelige.

---

## 8) Hvorfor portal ikke blev ændret

- **Portal-token-flow er ikke validateret af RLS**, kun i app-kode (se `SPRINT_7B_1_RBAC_FOUNDATION_SQL_PROPOSAL.md` §C)
- Foreslåede portal-RLS-policies (`portal_messages` token-gated SELECT, `offer_signatures` token-gated INSERT) blev **afvist** af Henrik fordi de validerer per kunde, ikke per request
- Den korrekte fix er **server-side proxy med service_role + explicit token check**, hvilket kræver kode-ændringer i 6+ portal-actions samtidig med RLS-ændringer
- Portal-hardening er udskudt til Sprint 7B-1B som separat sprint med eget commit + browser-test

---

## 9) Browser-test guide

### Forudsætning
Henriks egen profile har fortsat `role='admin'`. Pilot-gates blokerer ikke admin på nogen action.

### Test 1 — Admin (skal kunne alt)
1. Log ind som admin
2. Gå til `/dashboard/invoices` — listen skal vise alle fakturaer
3. Åbn en faktura — alle handlinger ("Markér som betalt", "Krediter", "Slet kladde") skal virke
4. Gå til `/dashboard/employees` — liste vises med rates (hourly_rate/cost_rate kolonner)
5. Åbn en medarbejder — kompensation/satser vises
6. Gå til `/dashboard/settings` — alle indstillinger virker
7. Gå til `/dashboard/settings/integrations` — kan oprette/redigere integrationer

### Test 2 — Serviceleder (begrænset økonomi)
**Henrik kan oprette en test-bruger og sætte `role='serviceleder'` via Supabase Dashboard.**
1. Log ind som serviceleder
2. Gå til `/dashboard/invoices` — listen vises
3. Åbn faktura — "Markér som betalt" giver fejl "Manglende tilladelse: invoices.mark_paid"
4. "Krediter faktura" giver fejl "Manglende tilladelse: invoices.credit"
5. "Slet kladde" giver fejl "Manglende tilladelse: invoices.delete_draft"
6. Gå til `/dashboard/employees` — liste vises men hourly_rate/cost_rate er **null**
7. Åbn medarbejder — compensation-felt er null, rates er null
8. Gå til `/dashboard/settings` — basis-side virker, men "Gem" giver fejl "Manglende tilladelse: settings.manage"

### Test 3 — Bogholderi (faktura+økonomi, ingen løn)
1. Log ind som bogholderi (manuelt sat via Supabase Dashboard)
2. Gå til `/dashboard/invoices` — alle handlinger virker (mark_paid, credit, delete_draft)
3. Gå til `/dashboard/employees` — `Manglende tilladelse: employees.view` (bogholderi har det IKKE)
4. Hvis side viser sig: liste tom (action returnerer `[]`)
5. Gå til `/dashboard/settings/integrations` — kan oprette/redigere e-conomic
6. Forsøg `updateCompanySettings` — fejl `Manglende tilladelse: settings.manage`

### Test 4 — Smoke test (curl mod produktion)
- `/dashboard/invoices` → HTTP 307 (redirect til login)
- `/dashboard/orders` → HTTP 307
- `/dashboard/calendar` → HTTP 307
- `/api/invoices/test/pdf` → HTTP 401

### Test 5 — Verificér ingen breakage
- Eksisterende invoice-flow fra sag → fakturakladde → send → betal — som admin skal alt virke uændret
- Eksisterende kreditnota-flow — uændret
- Eksisterende portal: kunden kan stadig se tilbud + signere (portal er IKKE rørt)

---

## 10) Anbefalet næste sprint

**Sprint 7B-1A — Permission foundation migration** (afventer Henrik's SQL-approval)
- Kør `00108_rbac_foundation.sql` der etablerer DB-side `permissions` + `role_permissions` tabeller + helper-functions
- Backwards-compatible med pilot — TS-matrix er stadig source of truth, DB er mirror

**Sprint 7B-1B — Portal hardening** (separat, kræver kode + RLS i samme commit)
- Skift portal server actions fra `createAnonClient()` til `createAdminClient()` med token-validation
- DROP portal_messages anon SELECT + offer_signatures anon INSERT policies
- Browser-test alle portal-flows

**Sprint 7C — Resterende action-gates**
- service_cases, work_orders, time_logs, customers, leads, offers, case_materials, case_other_costs
- Modulvis med små commits

**Sprint 7D — Side-gating + UI-graceful**
- Server-side `notFound()` på pages baseret på rolle
- UI-knapper skjules før server-fejl

**Sprint 7G — RLS tightening** (kritisk men risikabelt)
- Erstat `FOR ALL USING (true)` policies modulvis
- Kræver staging-test FØRST

---

## 11) Kendte risici

| Risiko | Niveau | Mitigation |
|---|---|---|
| Sidebar viser knapper for moduler montør/salg ikke har adgang til | Lav | Server returnerer fejlbesked; brugeren ser bare fejl |
| Direct REST-adgang via anon key kan stadig læse data | Mellem | Pilot fix er server-action-only; RLS-fix kommer i 7G |
| Portal_messages anon SELECT er stadig `USING (true)` | Mellem | 7B-1B vil fixe |
| Kreditnota-mail subject ændres ikke for serviceleder fordi de ikke kan kalde `invoices.credit` action | Lav | Forventet — de skal bruge bogholderi-rolle |
| getAuthenticatedClientWithRole defaulter til 'montør' ved DB-fejl → over-restriktiv lockout, men ikke privilege-eskalation | Lav | Korrekt fail-safe |
| Bogholderi har `economy.cost_prices` men IKKE `employees.payroll.view` — kan se produkt-kostpriser men ikke løn | Designet | Matcher Henrik's regler |

---

## 12) Type-check + build status

- `npx tsc --noEmit` — **clean** efter hver commit
- `npx next build` — **clean** efter hver commit
- Smoke tests (curl mod produktion) — alle 4 routes returnerer forventede HTTP-koder
