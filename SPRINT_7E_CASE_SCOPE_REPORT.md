# Sprint 7E — Case Scope Filter Report

**Skrevet:** 2026-05-08
**Production HEAD:** `153068f`
**Sprint scope:** Server-side scope-filtrering på sager / work_orders / time_logs / materialer / øvrige omkostninger.

---

## 1) Commits (5 commits)

| Commit | Beskrivelse |
|---|---|
| `99736a4` | 7E-1 inspect + document case scope (doc + inspect script) |
| `7a4121f` | 7E-2 scope orders + work_orders |
| `97fd7c8` | 7E-3 scope calendar + time_logs |
| `153068f` | 7E-4 scope materials + other_costs |
| (denne) | 7E-5 report + verify |

---

## 2) Filer ændret

| Fil | Type |
|---|---|
| `src/lib/auth/case-scope.ts` | **NY** — scope-helper |
| `scripts/inspect-7e-schema.mjs` | **NY** — schema-probe (read-only) |
| `SPRINT_7E_SCOPE_MODEL.md` | **NY** — design doc |
| `src/lib/actions/service-cases.ts` | scope getServiceCases + getServiceCase |
| `src/lib/actions/work-orders.ts` | scope listWorkOrdersForCase + listWorkOrdersByDateRange |
| `src/lib/actions/time-logs.ts` | scope alle 4 actions (list + create + update) |
| `src/lib/actions/case-materials.ts` | scope list + create + cost-price stripping |
| `src/lib/actions/case-other-costs.ts` | scope list + create + cost-price stripping |
| `src/app/dashboard/orders/page.tsx` | accept view.assigned + view.all |
| `src/app/dashboard/calendar/page.tsx` | accept view.own + view.all |
| `src/components/layout/sidebar.tsx` | Sager/Kalender til bredere baseline-permissions |
| `src/components/layout/bottom-nav.tsx` | montør Kalender genaktiveret |

**Total:** 12 filer (3 nye + 9 modificerede).

---

## 3) Scope-model (final)

### Path til montør-scope (data-flow)

```
auth.uid()
  ↓
profiles.id
  ↓
employees.profile_id        (1:1 link, NULLABLE)
  ↓
employees.id                (= my_employee_id)
  ↓
work_orders.assigned_employee_id = my_employee_id
  ↓
work_orders.id              (= my work_orders)
  ↓
work_orders.case_id         (= cases jeg har adgang til)
```

### `getCaseScope(ctx)` resultat per rolle

| Rolle | Resultat |
|---|---|
| admin | `{ type: 'all' }` |
| serviceleder | `{ type: 'all' }` |
| bogholderi | `{ type: 'all' }` |
| salg | `{ type: 'specific', caseIds: [created_by/assigned_to=user] }` |
| montør | `{ type: 'specific', caseIds: [via work_orders.assigned_employee_id] }` |
| ukendt | `{ type: 'specific', caseIds: [] }` (fail-safe lock) |

### `getWorkOrderScope(ctx)` resultat per rolle

| Rolle | Resultat |
|---|---|
| admin/serviceleder | `{ type: 'all' }` |
| montør | `{ type: 'specific', workOrderIds, employeeId }` |
| salg/bogholderi | har ikke work_orders.view.* permission → `{ specific, [], null }` |

---

## 4) Hvad montør / serviceleder / bogholderi / salg nu ser

### Montør
- **Sager**: kun sager med ≥1 work_order tildelt deres employee
- **Work orders**: kun assigned_employee_id matcher
- **Kalender**: kun egne work_orders i feed (calendar.view.own + scope)
- **Time logs**: kun egne (employee_id) PÅ egne work_orders
- **Time log create**: kun på egne work_orders med eget employee_id
- **Time log update**: kun egne (samme constraint)
- **Materialer**: kun rows på egne sager + **0 kostpriser** (unit_cost/total_cost = 0)
- **Øvrige omkostninger**: samme

### Serviceleder
- **Sager**: alle (cases.view.all)
- **Work orders**: alle (work_orders.view.all)
- **Kalender**: alle work orders i feed
- **Time logs**: alle, kan create/edit alle
- **Materialer + øvrige**: alle med fulde kostpriser

### Bogholderi
- **Sager**: alle (read)
- **Work orders**: ingen adgang (har ikke work_orders.view.*)
- **Kalender**: ingen feed (har ikke calendar.view.*)
- **Time logs**: alle (read-only via time_logs.view.all)
- **Materialer + øvrige**: alle med kostpriser

### Salg
- **Sager**: kun egne (assigned_to/created_by = user)
- **Work orders**: ingen adgang
- **Kalender**: ingen feed
- **Time logs**: ingen
- **Materialer + øvrige**: ingen

---

## 5) Type-check / build status

- `npx tsc --noEmit` — **clean** efter alle 4 kode-commits
- `npx next build` — **clean** efter alle 4 kode-commits

---

## 6) Vercel verify

| | Værdi |
|---|---|
| Production HEAD | `153068f` |
| Latest deployment | `elta-nnuysw86f-...` ● Building |
| Forrige Ready (kode) | tidligere 7E commits er deployed |
| Working tree | clean |

---

## 7) Curl smoke-resultater

| Route | HTTP | Forventet | Match |
|---|---|---|---|
| `/dashboard/orders` | 307 | 307 | ✅ |
| `/dashboard/calendar` | 307 | 307 | ✅ |
| `/dashboard/invoices` | 307 | 307 | ✅ |
| `/dashboard/employees` | 307 | 307 | ✅ |
| `/api/invoices/test/pdf` | 401 | 401 | ✅ |

---

## 8) Kendte caveats

| Caveat | Niveau | Note |
|---|---|---|
| **`employees.profile_id` er NULL for alle nuværende employees i prod** | **Vigtigt for test** | Henrik skal manuelt linke en testbruger til en employee-row før montør-scope kan testes meningsfuldt. SQL: `UPDATE employees SET profile_id='<test-user-uuid>' WHERE id='<employee-uuid>'` |
| Direct REST via anon key kan stadig læse uden scope-filter | Mellem | RLS er stadig åben på de fleste tabeller. Sprint 7G fixer dette. |
| Scope-beregning kører 1-3 ekstra DB-queries per gated action | Lav | Acceptabelt for pilot; cache-strategi kan komme senere |
| Tasks-modul (/dashboard/tasks) er ikke scope-filtreret | Lav | Henrik's pilot-spec inkluderer ikke tasks |
| Customers/leads/offers IKKE scope-filtreret | Mellem | Henrik's pilot-spec: salg ser alle leads/kunder; ikke opgave for 7E |

---

## 9) Browser-test guide

### Forudsætning før montør-test
Henrik skal i Supabase Dashboard SQL Editor køre:
```sql
-- Find en aktiv employee
SELECT id, name, profile_id FROM employees WHERE active = true LIMIT 5;

-- Find en testbruger (montør-rolle)
SELECT id, email, role FROM profiles WHERE role = 'montør';

-- Link dem
UPDATE employees SET profile_id = '<profile.id>' WHERE id = '<employee.id>';

-- Verificér link
SELECT user_employee_id('<profile.id>'::uuid);
-- skal returnere employee.id
```

### Test 1 — Admin
- Skal se alle sager, alle work orders, fuld kalender, alle time_logs, fulde kostpriser

### Test 2 — Serviceleder
- Som admin (alle ting). Bemærk INGEN forskel for serviceleder i 7E.

### Test 3 — Bogholderi
- Skal se alle sager (read), alle time_logs (read)
- Ingen kalender, ingen work_orders adgang
- Fulde kostpriser i materialer/øvrige

### Test 4 — Montør (efter SQL-link ovenfor)
- Login som montør-bruger
- `/dashboard/orders` skal vise KUN sager hvor montør er work_order-assignee
- Åbn en sag — `Materialer` viser rows med `Intern kost` = 0 (stripped). `Salgspris` viser ægte beløb
- Åbn en sag montør IKKE er på via direct URL → "Sagen er ikke tildelt dig"
- `/dashboard/calendar` viser KUN egne work_orders
- Forsøg createTimeLog med fremmed employee_id → "Du kan kun registrere tid på din egen medarbejder-konto"

### Test 5 — Salg
- `/dashboard/orders` viser kun cases hvor salg er created_by/assigned_to
- Hvis salg ikke har oprettet/tildelt sager: tom liste

---

## 10) Anbefalet næste sprint

**Sprint 7F — Portal hardening** (separat track)
- Skift portal server actions fra anon → service_role + token-validation
- DROP åbne anon-policies på portal_messages + offer_signatures

**Sprint 7G — RLS tightening**
- Erstat `FOR ALL TO authenticated USING (true)` på service_cases / work_orders / time_logs / case_materials / case_other_costs / invoices med scope-baserede policies
- Bruge `user_can_view_case()` DB-helper (skal evt. tilføjes i ny migration)
- Test mod staging FØRST

**Sprint 7H — UI-polish af scope-empty-states**
- Tom-state besked: "Du har ingen tildelte opgaver endnu"
- Bedre fejlbeskeder i UI når scope-filter giver tom liste

**Sprint 7I — Customers/leads scope** (hvis ønsket)
- Salg får måske kun customers/leads hvor de er created_by
- Not in Henrik's pilot-spec, men relevant senere
