# Sprint 7E — Sag-scope model: design + schema-bekræftelse

**Skrevet:** 2026-05-08
**Production HEAD ved doc:** `e27eb82`
**Scope:** Kun design + schema-bekræftelse. Ingen kode-ændringer i denne commit.

---

## 1) Schema-inspect resultat (live prod)

### profiles
| Kolonne | Type | Note |
|---|---|---|
| id | uuid | PK (matcher auth.uid) |
| full_name | text | |
| role | text | admin/serviceleder/montør/salg/bogholderi |
| email | text | |
| created_at | timestamptz | |

**⚠️ Bemærk:** Kun 5 kolonner. NO `is_active`, `updated_at`, `avatar_url`, `phone`, `department` i prod-DB. (Existerende TS-`Profile`-interface er bredere — pre-existing tilstand, ikke 7E-scope.)

### employees
| Kolonne | Type | Note |
|---|---|---|
| id | uuid | PK |
| profile_id | uuid | FK profiles, **NULLABLE** |
| name | text | |
| email | text | |
| role | text | admin/electrician/installer (legacy) |
| active | boolean | |

**Real-data state:**
- 0 employees har `profile_id` sat
- 1 employee har `profile_id = NULL`

**Konsekvens:** Pilot-data har endnu ingen montør→user-link. Scope-filter for montør vil returnere tom liste indtil Henrik kobler en user til en employee-row.

### work_orders
| Kolonne | Note |
|---|---|
| id | PK |
| case_id | FK service_cases (NULLABLE) |
| customer_id | FK customers (NULLABLE) |
| assigned_employee_id | FK employees (NULLABLE) |
| status | planned/in_progress/done/cancelled |
| scheduled_date | DATE |

**Real-data:** 2 work orders, begge assigned. ✓

### service_cases
| Kolonne | Note |
|---|---|
| id | PK |
| case_number | TEXT (SVC-XXXXX) |
| customer_id | FK customers |
| assigned_to | FK profiles (NULLABLE) ← case-ejer |
| created_by | FK profiles (NULLABLE) ← opretter |
| status | new/in_progress/pending/closed |

**Real-data:** 4 cases, alle har `assigned_to` + `created_by`. ✓

### time_logs
- `employee_id` (NOT NULL, FK employees)
- `work_order_id` (NOT NULL, FK work_orders)

### case_materials + case_other_costs
- `case_id` (NOT NULL)
- `work_order_id` (NULLABLE)
- `created_by` (NULLABLE FK profiles)

### Eksisterende mig 00108 helper functions
✅ Alle 5 til stede:
- `user_role(uuid)`
- `user_has_role(text[], uuid)`
- `user_has_permission(text, uuid)`
- `user_permissions(uuid)`
- `user_employee_id(uuid)` ← **kerne for scope**

### Schema gaps
- ❌ `service_case_members` — findes ikke
- ❌ `team_members` / `teams` — findes ikke
- ✅ Eksisterende `service_cases.assigned_to` + `work_orders.assigned_employee_id` er nok for pilot-scope

---

## 2) Scope-model — pilot v1 (uden migration)

### Aksen: rolle → scope

| Rolle | Cases scope | Work orders scope | Time logs scope | Materials/Other_costs scope |
|---|---|---|---|---|
| **admin** | alle | alle | alle | alle |
| **serviceleder** | alle | alle | alle | alle |
| **bogholderi** | alle (read-only) | ikke nødvendigt | alle (read) | alle (read) |
| **salg** | egne (created_by/assigned_to=user) | n/a | n/a | n/a |
| **montør** | sager med ≥1 work_order tildelt egen employee | egne (assigned_employee_id=my employee_id) | egne (employee_id=my employee_id, OG work_order_id i mine) | egne work_orders' cases |

### Path til montør-scope

```
auth.uid()                     [from session]
  ↓
profiles.id                    [user_role() → 'montør']
  ↓
employees.profile_id           [user_employee_id() returns employee.id, eller NULL]
  ↓
employees.id                   [my_employee_id]
  ↓
work_orders.assigned_employee_id = my_employee_id
  ↓
work_orders.id                 [mine work_order IDs]
  ↓
work_orders.case_id            [mine case IDs (DISTINCT, NOT NULL)]
```

**Edge case:** Hvis user har `role='montør'` men ingen employee-row med `profile_id` matchende, returnerer `user_employee_id()` NULL. Scope-filter må graceful håndtere det → tom liste, ikke crash.

### Path til salg-scope

```
auth.uid()
  ↓
profiles.id
  ↓
service_cases.created_by = profile.id
  OR
service_cases.assigned_to = profile.id
```

---

## 3) Implementation strategi

### Princip: filter i query-niveau, ikke client-side

For montør med 1000+ work orders må vi ikke loade alle og filtrere i JS. Vi bygger Supabase-query med `.in()` filter.

### Pattern A — server-action skopering

For hver scoped action:
1. Hent rolle via `getAuthenticatedClientWithRole()`
2. Beregn allowed IDs baseret på rolle:
   - admin/serviceleder/bogholderi → no filter
   - salg → filter on `created_by` OR `assigned_to`
   - montør → fetch user's employee_id → fetch their work_orders → filter cases by `id IN (case_ids)`
3. Applikér filter i query

### Pattern B — helper i action-helpers.ts

```typescript
// Pseudo-kode (ikke leveret i 7E-1)
export async function getCaseScope(role, userId, supabase): Promise<{
  type: 'all' | 'specific'
  caseIds?: string[]   // only when type='specific'
}>
```

Dette undgår at duplikere scope-beregning i hver action.

### Pattern C — graceful fallback

Hvis scope returnerer 0 IDs (montør uden tildelte sager):
- Returnér `{ success: true, data: [] }` ikke fejl
- UI viser tom-state med besked: "Du har ingen tildelte opgaver endnu"

---

## 4) Filer der skal ændres (estimat)

### 7E-2: Orders + work_orders
| Fil | Ændring |
|---|---|
| `service-cases.ts` | `getServiceCases`: scope-filter for salg/montør |
| `service-cases.ts` | `getServiceCase`: tjek user kan se sagen |
| `work-orders.ts` | `listWorkOrdersForCase`: scope montør til assigned only |
| `action-helpers.ts` | Tilføj `getCaseScope()` helper |

### 7E-3: Calendar + time_logs
| Fil | Ændring |
|---|---|
| `work-orders.ts` | `listWorkOrdersByDateRange`: montør → kun egne |
| `time-logs.ts` | `listTimeLogsForWorkOrder`: montør → kun egne |
| `time-logs.ts` | `listTimeLogsForCase`: montør → kun egne på egne work_orders |
| `time-logs.ts` | `createTimeLog`: montør kan kun create på egne |
| `time-logs.ts` | `updateTimeLog`: montør kan kun edit egne |
| `permissions.ts` | Tilføj montør til calendar.view.all? Nej — vi bruger calendar.view.own kun for montør. |
| `calendar/page.tsx` | Allow montør access; vis kun egne work_orders i feed |
| `sidebar.tsx` | Genaktiver Kalender for montør |
| `bottom-nav.tsx` | Genaktiver Kalender for montør |

### 7E-4: Materials + other_costs
| Fil | Ændring |
|---|---|
| `case-materials.ts` | `listCaseMaterials`: montør → kun på egne sager |
| `case-other-costs.ts` | `listCaseOtherCosts`: montør → kun på egne sager |
| `case-materials.ts` | `createCaseMaterial`: montør kan kun create på egne sager |
| `case-other-costs.ts` | `createCaseOtherCost`: samme |
| (read for montør) | Skjul `unit_cost` / `total_cost` i list-output (kostpriser) |

---

## 5) Hvad der IKKE er med i 7E

- ❌ DB migration / nye tabeller (`service_case_members` ikke nødvendig)
- ❌ RLS-tightening (Sprint 7G)
- ❌ Portal flow (Sprint 7B-1B)
- ❌ Side-effects på faktura/kreditnota (de er allerede gated til admin/serviceleder/bogholderi i CP3)
- ❌ Tasks-modul scope (`/dashboard/tasks` — ikke i 7E-spec)
- ❌ Customers/leads scope (Henrik's pilot: alle med leads.view ser alle)

---

## 6) Risici og caveats

| Risiko | Niveau | Mitigation |
|---|---|---|
| `employees.profile_id = NULL` for alle nuværende employees | **Høj** for praktisk pilot-test | Henrik skal manuelt linke en test-bruger til en employee-row før montør-scope kan testes meningsfuldt |
| montør med 0 sager ser tom liste — kan virke som bug | Lav | UI viser "ingen tildelte opgaver"-besked |
| Scope-beregning kan blive langsom hvis montør har 100+ sager | Lav | `.in()` med UUID array er fint op til 1000 |
| Direct REST via anon key omgår scope (RLS er stadig åben) | **Mellem** | App-niveau scope er ikke nok mod direct REST. Sprint 7G fixer dette med RLS |
| Page-guards i 7D bruger `cases.view.all` — montør får NoAccess på `/dashboard/orders` selv hvis han har egne sager | Skal håndteres | 7E-2 vil tilføje fallback: hvis user har `cases.view.assigned` (montør) + scope returnerer non-empty, allow page |
| Salg har `cases.view.assigned` men list-action bruger `cases.view.all` permission-check → 7E-2 må tilføje OR-logik | Skal håndteres | Refactor til `cases.view.all` || `cases.view.assigned` i list-action |

---

## 7) Plan for sub-commits

| Commit | Indhold |
|---|---|
| **7E-1 (denne)** | Doc + scope-model design |
| **7E-2** | Scope orders + work_orders. Helper i action-helpers.ts |
| **7E-3** | Scope calendar + time_logs. Genaktivér montør-kalender |
| **7E-4** | Scope materials + other_costs. Skjul kostpriser for montør |
| **7E-5** | Report + verify |

---

## 8) Konklusion

**Schema er tilstrækkeligt for pilot-scope uden migration.** Helper-funktionerne fra mig 00108 dækker behovet (`user_employee_id()` er kernen). Implementation er rent server-action-side filter, ingen DB/RLS ændringer.

**Next:** 7E-2 starter implementation. Stop-regler: enhver opdagelse af manglende kolonne / RLS-blokering / portal-konflikt → stop og rapportér.
