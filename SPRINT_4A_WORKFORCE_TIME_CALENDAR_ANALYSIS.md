# Sprint 4A — Workforce / Time / Kalender Analyse

## TL;DR
- **Schema + service-lag er færdigt:** `employees`, `employee_compensation` (m. generated `real_hourly_cost`), `work_orders` (case_id FK ✓), `time_logs` (auto `hours`/`cost_amount`, partial UNIQUE active-timer index), `work_order_profit` snapshots og RPC-funktioner findes — bygget under fase 7-9 (00086-00089) og udvidet i 00096.
- **Største gap er UI:** ingen `/dashboard/employees`-rute, ingen Start/Stop-knap nogen steder (`startTimeEntry` kaldes aldrig fra `src/`), ingen timesheet-side, ingen approval-flow. Kalenderen viser kun `customer_tasks` filtreret på "besigtigelse" — den ser slet ikke `work_orders.scheduled_date`.
- **Anbefalet sprintform:** 5 sub-sprints (4B Employees CRUD UI → 4C Timer/Timesheet → 4D Calendar redesign → 4E Sag-økonomitab "Faktisk" → 4F Approval/lønbridge). Ingen destruktive DB-ændringer; alle additive felter eller nye tabeller.

## Eksisterende schema

| Tabel | Migration | Vigtigste felter | RLS / triggere |
|---|---|---|---|
| `profiles` | 00001_auth_tables.sql:7 | `id` PK med FK til `auth.users` (CASCADE), `role user_role`, `is_active`, `full_name`, `email` UNIQUE | RLS *not in this file*, `handle_new_user` trigger på `auth.users`. Memory-noten ("ingen FK") er **ukorrekt** for skemaet — der ER FK på id. Men joins fra andre tabeller (fx `customer_tasks.assigned_to`) bruger kun typen UUID uden Postgres FK, derfor `enrichWithProfiles`-mønstret. |
| `employees` | 00086:11, udvidet 00096:22 | `id`, `profile_id` → profiles (SET NULL), `name`, `email` UNIQUE, `role` CHECK (admin/electrician/installer/elektriker/montør/lærling/projektleder/kontor 00096:41), `active`, `hourly_rate` (00087:14), `cost_rate` (00088:16), HR-felter (employee_number/first_name/last_name/address/postal_code/city/phone/hire_date/termination_date/notes) | RLS ON. Policies: `employees_select_admin_or_self` (00096:139), admin-only insert/update/delete. `trg_employees_updated_at` for updated_at. |
| `employee_compensation` | 00096:49 | `employee_id` PK, `hourly_wage`, `internal_cost_rate`, `sales_rate`, %-felter (pension/free_choice/vacation/sh/overhead), `social_costs`, `overtime_rate`, `mileage_rate`, **`real_hourly_cost` GENERATED** (00096:63 `wage*(1+sumPct/100)+social`) STORED | RLS ON: admin write, admin-or-self select. Trigger `trg_employee_compensation_sync` (00096:124) speljler `sales_rate`/`internal_cost_rate` ned i `employees.hourly_rate`/`cost_rate`. |
| `employee_compensation_history` | 00096:82 | append-only snapshot af alle felter + `effective_from`, `changed_by`, `change_reason` | Admin-only select. |
| `work_orders` | 00086:27, ext. 00087/88/89 | `id`, **`case_id` → service_cases (SET NULL)** ✓ Sprint 2, `customer_id`, `title`, `description`, `status` enum (planned/in_progress/done/cancelled, 00086:34), `scheduled_date DATE`, `assigned_employee_id` → employees, `completed_at`, `auto_invoice_on_done` (00087:18), `source_offer_id` → offers (00087:20), `low_profit` (00089:11) | RLS ON ("all_auth"). Triggere: `trg_work_orders_updated_at`, `trg_work_orders_done_snapshot` (00088:267) → snapshot profit ved status→done. State-machine i `src/lib/services/work-orders.ts:12-17` matcher migrationens enum. |
| `time_logs` | 00086:48 | `id`, `employee_id` (RESTRICT), `work_order_id` (RESTRICT), `start_time`, `end_time NULL`, **`hours` GENERATED STORED** (00086:55), `description`, `billable`, `invoice_line_id`, `cost_amount` (00088:20) | RLS ON ("all_auth"). UNIQUE partial idx `uq_time_logs_one_active_per_employee` WHERE end_time IS NULL (00086:71) — én aktiv timer pr. medarbejder. Trigger `trg_time_logs_cost_amount` (00088:46) BEFORE INSERT/UPDATE OF end_time/employee_id, henter `employees.cost_rate` (fallback 400 DKK). |
| `work_order_profit` | 00088:59 | append-only snapshot (revenue, labor_cost, material_cost, profit, margin_percentage, source enum, invoice_id, details JSONB) | RPC `calculate_work_order_profit(uuid)` (00088:86) og `snapshot_work_order_profit(uuid,text)` (00088:201). Trigger på `invoices` INSERT + `work_orders` UPDATE OF status. |
| `time_entries` (legacy) | 00006_projects_module.sql, FULL_MIGRATION.sql:356 | Project-baseret hour card. Refereret fra `projects.ts:621/674/703/954`, `dashboard.ts:87`, `reports.ts:96/327/376` | Bevares — 00086 header siger "0 rows currently but referenced from code". **Ny kode bruger udelukkende `time_logs`** (`from('time_logs')` i 6 service-/action-filer; `from('time_entries')` kun i legacy-projektmodul). |
| `service_cases` | 00062 + 00098 ext. | `case_number SVC-NNNNN`, `customer_id`, `formand_id` → employees (00098:27), `planned_hours`, `contract_sum`, `revised_sum`, `budget`, `start_date/end_date`, `auto_invoice_on_done`, `low_profit`, `source_offer_id` (UNIQUE partial idx 00099:23). | RLS ON, åbne policies for authenticated. |

## Eksisterende kode/ruter

**Server-actions / services (klar):**
- `src/lib/actions/employees.ts:43` `requireAdmin()` gate — fuld CRUD: `listEmployeesAction`, `getEmployeeAction`, `getEmployeeProjectImpactAction`, `getCompensationHistoryAction`, `createEmployeeAction`, `updateEmployeeAction`, `setEmployeeActiveAction`, `setEmployeeCompensationAction`. Kalder `revalidatePath('/dashboard/employees')` selvom ruten **ikke findes**.
- `src/lib/actions/work-orders.ts` — `listWorkOrdersForCase`, `createWorkOrderForCase`, `updateWorkOrderPlanning`, `changeWorkOrderStatus`, `deletePlannedWorkOrder` (timer-aware; blokerer done når åben timer findes).
- `src/lib/services/time-tracking.ts` — `startTimeEntry`, `stopTimeEntry`, `createManualTimeEntry`, `getActiveTimerForEmployee`, `getEmployeeStats`. **Ingen wrapper i `src/lib/actions/`** og ingen UI kalder dem (`grep startTimeEntry` → kun definitionen).
- `src/lib/services/profitability.ts` — `calculateWorkOrderProfit`, `getEmployeeProductivity`, snapshot-helpers.
- `src/lib/services/employee-economics.ts` — `calculateRealHourlyCost`, `calculateEmployeeProjectImpact`, `buildCostBreakdown`.
- `src/lib/actions/service-cases.ts:836` `getEmployeesForOrderSelect()` — bruges af planlægnings-tab.

**Ruter / UI (frontend):**
- `src/app/dashboard/orders/[id]/page.tsx` — sag-detalje. Tabs i `order-detail-client.tsx:18-28`: Overblik, Planlægning/Timer (✓), Materialer (kommer), Øvrige omkostninger (kommer), Økonomi (kommer), Aktivitet (✓), Dokumentation (kommer), Fakturakladde (kommer), Handlinger (✓).
- `src/app/dashboard/orders/[id]/order-planning-tab.tsx` — opretter/lister `work_orders` pr. sag, ændrer status. **Indeholder INGEN timer-knapper og INGEN time_log-visning** trods navnet "Planlægning / Timer".
- `src/app/dashboard/settings/team/page.tsx` + `team-settings-client.tsx:36-40` — admin "Brugerstyring": invites, profiles.role-redigering (montør/serviceleder/admin). **Mod profiles, ikke employees** — ingen kobling.
- `src/app/dashboard/tasks/page.tsx` + `tasks-page-client.tsx` — `customer_tasks`-overblik (Sprint 3-kundetask-modul).
- `src/app/dashboard/calendar/page.tsx:9` — kalder `getAllTasks({ search: 'besigtigelse' })`. `calendar-client.tsx` viser kun `customer_tasks` med "besigtigelse" i title. Ingen `work_orders`-binding.
- **Mangler:** ingen `/dashboard/employees`, `/dashboard/employees/[id]`, `/dashboard/timer`, `/dashboard/timesheets`, `/dashboard/payroll` route-mapper. Ingen sidebar-link til medarbejdere (sidebar.tsx checkout viser kun /tasks, /calendar, /service-cases m.fl.).

**Admin vs. medarbejder-facing:**
- Admin-only via RLS: alle skrive-paths på `employees` + `employee_compensation`. Settings/team admin-gated via `isAdmin = currentUser?.role === 'admin'` (`team-settings-client.tsx:53`).
- Medarbejder-facing: **findes ikke endnu**. Ingen "min-side" hvor en montør ser sine egne work_orders eller starter timer.

## Mangler

**Ruter:**
- `/dashboard/employees` (admin liste + opret)
- `/dashboard/employees/[id]` (HR + comp + impact-dashboard pr. medarbejder)
- `/dashboard/timer` eller floating timer-widget i header (medarbejder-facing)
- `/dashboard/timesheets` (uge-/månedsoverblik, godkendelse)
- `/dashboard/payroll` (admin: lønperiode-eksport, ud fra `employee_compensation_history`)

**UI-komponenter:**
- `<TimerButton workOrderId>` (start/stop, viser løbende elapsed via `getActiveTimerForEmployee`)
- `<TimeLogList workOrderId>` på sag-detaljens Planlægning/Timer-tab (vis timer pr. medarbejder, hours, cost_amount, billable-toggle)
- `<EmployeeCalendarBoard>` — uge/dag-view med `work_orders.scheduled_date` × `assigned_employee_id` som rækker
- `<TimesheetWeekRow employeeId weekStart>` med approve-knap

**Server-actions (server actions wrapping eksisterende services):**
- `src/lib/actions/time-logs.ts` — `startTimerAction`, `stopTimerAction`, `addManualTimeAction`, `setLogBillableAction`, `approveTimesheetAction` (mangler helt)
- `src/lib/actions/employees.ts` har CRUD men mangler `getMyEmployeeRecord()` (resolver fra `auth.uid()` → `employees.profile_id`)

**Types:**
- `src/types/workforce.types.ts:1-2` har **forældet** `EmployeeRole = 'admin'|'electrician'|'installer'` og **forældet** `WorkOrderRow` uden `auto_invoice_on_done`/`source_offer_id`/`low_profit` (faktisk bruges 00086+87+89-sættet andre steder). Bør harmoniseres med `src/types/employees.types.ts`.

**DB-felter (Sprint 4 anbefales additivt):**
- `service_cases.actual_hours`, `service_cases.actual_labor_cost` (cached, opdateres via trigger på time_logs eller view) — ellers kræver Økonomi-tabben et live aggregat-kald hver render.
- `time_logs.approved_at`, `time_logs.approved_by` (godkendelses-flow)
- evt. `work_orders.scheduled_start_time`/`scheduled_end_time TIME` for kalender-tidsslots (i dag kun DATE)

## Risici

**DB-niveau:**
- `time_logs.cost_amount` er BEFORE-trigger og pulles `employees.cost_rate` ved INSERT/UPDATE. Hvis lønnen ændres efter timer er stoppet, opdateres historiske rows **ikke**. Det er bevidst (immutable cost-snapshot) men UI skal ikke vise "live" beregning på lukkede logs.
- `hours` og `real_hourly_cost` er GENERATED STORED — **kan ikke skrives til**. Forms må aldrig prøve at sende dem.
- Den unikke partial index på `time_logs(employee_id) WHERE end_time IS NULL` kaster `23505`. Service håndterer det (`time-tracking.ts:60`), men UI skal vise pænt budskab.
- `work_orders` FK'er er `ON DELETE RESTRICT` for time_logs → man kan ikke slette en arbejdsordre med tider. Aktion `deletePlannedWorkOrder` checker det.
- 00097_enable_rls_on_open_tables.sql er fejlsikring — verificér at den ikke kasterer `time_logs`-policies om.

**UI-niveau:**
- `time_entries` (legacy, projekt-baseret) er stadig brugt af `src/lib/actions/projects.ts`, `dashboard.ts`, `reports.ts` — **kommer til at vise afvigende tal** ift. `time_logs`. Sprint 4 bør beslutte: migrér disse rapporter til `time_logs`, eller afgrænse dem til /projects-modulet, der efter Sprint 2/3 sandsynligvis udfases.
- `workforce.types.ts` er forældet (kun 3 roles); kalender/UI baseret på den vil mangle de 5 nye danske roles.
- Kalender-redesign skal bevare den eksisterende besigtigelse-visning fra `customer_tasks` (kunderelations-flow) — ikke erstattes blindt af work_orders.

**Migrations-niveau:**
- Næste ledige migrationsnummer: **00100**. Alle Sprint 4-migrations skal være additive (ALTER TABLE … ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, nye tabeller).
- Hvis vi vil have `actual_hours` cached på `service_cases`, skal trigger på `time_logs` joine via `work_orders.case_id` — tre-niveau-trigger; alternativt VIEW. Anbefaling: **start med VIEW** (`v_service_case_economics`), opgrader til materialiseret kolonne hvis perf bliver et problem.

## Anbefalet sprintplan

**Sprint 4B — Employees admin-CRUD UI** *(no DB changes)*
- Scope: ny rute `/dashboard/employees` + `[id]`. Liste med filter (active/role), opret-form, comp-form med live `calculateRealHourlyCost`-preview, comp-history-panel.
- Filer: `src/app/dashboard/employees/page.tsx`, `[id]/page.tsx`, `[id]/employee-form.tsx`, `[id]/compensation-form.tsx`, `[id]/comp-history.tsx`, sidebar-link.
- Afhænger af: ingenting (alle actions findes).

**Sprint 4C — Timer + timesheet UI** *(additive DB: `time_logs.approved_at/approved_by` + indexes)*
- Scope: `src/lib/actions/time-logs.ts` (wrappers), `<TimerButton>` på `order-planning-tab.tsx`, `<TimeLogList>` med billable-toggle og slet-egne-aktive-logs, `/dashboard/timesheets` uge-view.
- Filer: ny migration `00100_time_logs_approval.sql`, ny actions-fil, integration i eksisterende planning-tab.
- Afhænger af: 4B (for "min medarbejder-id" lookup via profile_id).

**Sprint 4D — Kalender redesign (work_orders + tasks)** *(additive DB: optional `work_orders.scheduled_start_time/end_time`)*
- Scope: erstat `calendar/page.tsx` med dual-source: `customer_tasks` (besigtigelser) **og** `work_orders.scheduled_date` med `assigned_employee_id`. Uge-view med medarbejder-rækker. Drag-to-reschedule (kalder `updateWorkOrderPlanning`).
- Filer: `src/app/dashboard/calendar/page.tsx` (redesign), nyt `<CalendarWeekBoard>`-komponent, ny migration `00101_work_orders_scheduled_times.sql` (kun hvis tidsslot ønskes).
- Afhænger af: 4C (timer-context for "i gang nu" markører).

**Sprint 4E — Sag-økonomitab "Faktisk vs. Planlagt"** *(additive DB: VIEW `v_service_case_economics`)*
- Scope: aktivér Økonomi-tabben i `order-detail-client.tsx:23` (currently `ready: false`). Vis `service_cases.planned_hours/contract_sum` mod aggregeret `time_logs.hours/cost_amount` joined via `work_orders.case_id`. Knap "Genberegn DB" → `snapshotWorkOrderProfit` pr. WO på sagen.
- Filer: ny migration `00102_v_service_case_economics.sql`, `src/lib/actions/case-economics.ts`, `[id]/order-economy-tab.tsx`.
- Afhænger af: 4C (skal være timer-data at vise).

**Sprint 4F — Approval + lønbridge** *(additive DB: evt. `payroll_periods`-tabel)*
- Scope: admin `/dashboard/payroll` med periodevælger, godkend timesheets per medarbejder, eksportér løn-CSV (timer × `compensation.hourly_wage`/overtime, kørsel via `mileage_rate`).
- Filer: `src/app/dashboard/payroll/`, `src/lib/services/payroll.ts`, evt. ny migration `00103_payroll_periods.sql`.
- Afhænger af: 4C+4E.

## Acceptkriterier (fuld Sprint 4)

End-to-end flow der beviser at hele lagen virker:
1. Admin opretter medarbejder Henrik på `/dashboard/employees/new` med `hourly_wage=200`, `internal_cost_rate=350`, `sales_rate=650`. `real_hourly_cost`-feltet i UI viser samme tal som `employee_compensation.real_hourly_cost`-generated-værdien efter save.
2. Admin opretter sag SVC-01010 med `planned_hours=8`, `contract_sum=12000`. Opretter work_order WO-A med `scheduled_date=i morgen`, assigned=Henrik.
3. Henrik logger ind → ser sin WO på `/dashboard/calendar` (uge-view, hans række, korrekt dag) og på `/dashboard/orders/SVC-01010` planlægnings-tab.
4. Henrik trykker **Start** → row i `time_logs` med `start_time=now()`, `end_time=null`, partial-unique virker (kan ikke starte to). WO går automatisk fra `planned`→`in_progress` (`time-tracking.ts:68-74`).
5. 3 timer senere trykker Stop → `end_time` sættes, `hours=3.00` (generated), `cost_amount=1050` (3 × 350, BEFORE-trigger).
6. På sag SVC-01010 viser **Økonomi-tab**: Planlagt 8t / 12 000 kr · Faktisk 3t / 1 050 kr / billable revenue 1 950 kr · DB 900 kr (38 %).
7. Admin sætter WO-A → `done`. `trg_work_orders_done_snapshot` indsætter row i `work_order_profit` med `source='work_order_done'`. `low_profit` flippes IKKE (margin > 15 %). 
8. Admin trykker "Opret faktura" → `create_invoice_from_work_order` returnerer invoice-id; `time_logs.invoice_line_id` sat → samme log kan ikke faktureres igen. Invoice-trigger `trg_invoices_snapshot_profit` indsætter ny snapshot med `source='invoice_created'`.
9. Admin på `/dashboard/payroll` ser Henrik med 3 timer i perioden, eksporterer CSV.

## Beslutninger Henrik skal tage

1. **Skal `time_entries` (legacy, projekt-baseret) udfases helt i Sprint 4?** Den bruges stadig af `dashboard.ts`, `reports.ts`, `projects.ts`. Alternativt: lade rapporter pege mod en VIEW der UNION'er begge tabeller.
2. **Profile ↔ Employee: 1-til-1 eller løs kobling?** I dag er `employees.profile_id` nullable. Skal en medarbejder oprettes, før profilen inviteres, eller efter? Påvirker UI-flow i 4B og auth-resolver i 4C.
3. **Tidsslots i kalenderen: kun dato (DATE) eller dato+tid (TIME)?** Tilfører `scheduled_start_time/end_time`. Påvirker 4D-design — uge-grid eller dag-grid med timeslots?
4. **Approval-flow: pr. dag, pr. uge eller pr. sag?** Påvirker tabel-design i 4F (`payroll_periods` vs. `time_logs.approved_at` alene).
5. **Hvem ser hvad?** RLS på `time_logs` er i dag åben for authenticated (`time_logs_all_auth`, 00086:92). Skal en montør kun kunne se egne logs? Det betyder ny policy + en `auth.uid() → employees.id` mapping.
6. **Mileage / kørsel: separate logs eller del af time_logs?** `compensation.mileage_rate` findes, men ingen `mileage_logs`-tabel. Skal mileage tracking ind i Sprint 4 eller gemmes til Sprint 5?
7. **"Min side" for medarbejder: separat layout eller bare role-aware version af dashboard?** Påvirker arkitektur i 4C/4D — om vi bygger `/dashboard/me/...` eller filtrerer eksisterende sider på rolle.
