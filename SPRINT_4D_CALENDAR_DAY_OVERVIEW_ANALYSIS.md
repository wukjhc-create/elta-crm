# Sprint 4D — Kalender / Dagsoversigt: Analyse

## 1. TL;DR

- **Hvad eksisterer:** En månedsbaseret kalender på `/dashboard/calendar` der KUN viser `customer_tasks` filtreret på title-substring "besigtigelse" (`src/app/dashboard/calendar/page.tsx:9-14`). Klassisk grid-måned + side-panel.
- **Største gap:** `work_orders` ses overhovedet ikke i kalenderen, selvom kolonnerne `scheduled_date` (DATE) og `assigned_employee_id` (FK -> employees, indekseret) eksisterer fra migration 00086 (`supabase/migrations/00086_employees_workorders_timelogs.sql:35-36,43,45`). Der mangler en "medarbejdere som rækker x datoer som kolonner" visning.
- **Anbefalet sprint-form:** Bygges som ny ugevisning side om side med eksisterende månedsvisning (toggle i samme route), drag-drop genbruger HTML5 native pattern fra `leads-kanban.tsx` (ingen ny dependency). 4 sub-sprints (4D-1..4D-4) — ingen migrationer nødvendige.

## 2. Eksisterende kalender

- `src/app/dashboard/calendar/page.tsx` — server component. Henter `getAllTasks({ search: 'besigtigelse' })` og post-filtrerer på title (`page.tsx:9-14`). Sender til client.
- `src/app/dashboard/calendar/calendar-client.tsx` — client. Klassisk månedsgrid `grid-cols-7` (`calendar-client.tsx:140,149`), side-panel med valgt dag + "kommende besigtigelser" (`:204-348`). Ingen URL-state for dato — alt er i `useState(new Date())` (`:32`). Realtime hook abonnerer på `customer_tasks` (`:36-39`) men reloader IKKE — kommentar siger "marked stale".
- Loading-skeleton: `src/app/dashboard/calendar/loading.tsx` — 35 grå celler i `grid-cols-7`.

## 3. Data sources — sammenligning

| Felt | `customer_tasks` | `work_orders` |
|---|---|---|
| "Hvornår" | `due_date` (DATE) | `scheduled_date` (DATE) |
| Tildelt | `assigned_to UUID -> auth.users(id)` (00053:14) | `assigned_employee_id UUID -> employees(id)` (00086:36) |
| Identitetsdomæne | Profile / auth-bruger | HR-medarbejder (separat tabel) |
| Titel | `title` | `title` |
| Relation | `customer_id` | `case_id` + `customer_id` |
| Status | pending / in_progress / done | planned / in_progress / done / cancelled |
| Index på dato | (ingen) | `idx_work_orders_scheduled` (00086:45) |
| Vises i sidebar via | "Opgaver" → `/dashboard/tasks` (sidebar.tsx:138-151) | "Sager" / fra OrderPlanningTab på sag-detalje |

**Vigtig konsekvens:** Tasks og work_orders deler IKKE rækker. En profil ≠ en employee. Der findes intet join mellem `auth.users.id` og `employees.id` (employees har valgfri `profile_id` per `employees.types.ts:23`, men `customer_tasks.assigned_to` er en bruger-id, ikke en profile-id).

## 4. Anbefalet design

- **Default view:** Ugevisning. Rows = aktive employees (sorteret på `name`), cols = 7 dage (Man-Søn). Kolonne-header viser ugedag + dato.
- **Toggle:** dag-view (rows = employees, cols = timer 07-18, render time-blokke fra `time_logs.start_time` + `work_orders.scheduled_date`-bookings øverst i hver employee-række), måned-view (eksisterende layout, men opdateret til at vise work_orders også).
- **URL-state:** `/dashboard/calendar?view=week&date=2026-05-04` hvor `date` = anker-dag (mandag i ugen, eller dagen i dag-view). Brug `useSearchParams` + `router.push` så ←/→ navigation er bookmarkable og refresh-safe. (I dag findes ingen URL-state i `calendar-client.tsx:32-33`.)
- **Cell-styling:** Match `STATUS_COLORS` fra `order-planning-tab.tsx:24-29` — `planned` = blå, `in_progress` = gul, `done` = grøn, `cancelled` = grå. Chip = lille pille med titel + evt. case_number, klikbar → `/dashboard/orders/[case_number]` (route accepterer både UUID og case_number per `orders/[id]/page.tsx:14-39`).
- **Customer tasks-rækker:** Vis som separat sektion ØVERST ("Besigtigelser & opgaver" — én række per assignee-profil) eller bag toggle "Vis kun arbejdsordrer / Vis alt". Anbefaling: separat sektion, da identitetsdomænet er forskelligt.
- **Mobile:** Skjul grid (`hidden md:block`). Vis i stedet vertikal stack kun for "i dag": dato-header + ét kort per employee med dagens chips. Brug eksisterende `md:hidden`-pattern fra `header.tsx:53,60`.

## 5. Drag/drop strategi

- **HTML5 native** — ingen ny dependency. Mønsteret findes allerede i `src/components/modules/leads/leads-kanban.tsx:47-80` (handleDragStart/Over/Drop, `dataTransfer.setData('text/plain', id)`).
- Server-action eksisterer: `updateWorkOrderPlanning(workOrderId, { scheduled_date, assigned_employee_id })` i `src/lib/actions/work-orders.ts:177-233`. Validerer at employee er aktiv (`:202-211`).
- Drop-zone = (employeeId, dateKey)-cell. På drop: kald action → `router.refresh()` eller optimistisk update.
- Customer_tasks kan IKKE drag-droppes mellem employees uden ekstra logik (assigned_to er auth.users, ikke employee). For 4D-1 — kun work_orders er drag-bare.

## 6. Risici

| Risiko | Sværhedsgrad | Mitigering |
|---|---|---|
| Identitetsmismatch tasks ↔ work_orders | **Medium** | Hold to sektioner adskilt; map kun i UI hvis `employees.profile_id` er sat. |
| Time-zone i dag-view | **Medium** | `time_logs.start_time` er TIMESTAMPTZ — render via `toLocaleTimeString('da-DK')`. `work_orders.scheduled_date` er DATE (heldagsblok) — vis som sticky chip i toppen af employee-række, ikke time-bound. |
| Cancelled work_orders | Lav | Default: skjul. Tilføj toggle "Vis annullerede" (gråt). |
| Performance | Lav | Single-tenant, <50 employees × 7 dage × <5 WO/celle. Server-side filter på `scheduled_date BETWEEN week_start AND week_end` + `status != cancelled` (default), index på `idx_work_orders_scheduled` allerede til stede. |
| Permission for montør | Medium | `calendar.view` tillader 'admin','serviceleder','montør' (`permissions.ts:84`). Filtrér rows i server-action: hvis user-rolle = montør, vis kun hans egen række (kræver lookup `employees.profile_id = current_user.id`). |
| Realtime kompleksitet | Lav | Ugevisning kan abonnere på `work_orders` UPDATE/INSERT i den valgte uge. Brug eksisterende `useRealtimeTable` (allerede importeret i `calendar-client.tsx:6`). |
| Kompatibilitet med eksisterende besigtigelse-view | Lav | Behold filter-toggle "Kun besigtigelser" så nuværende workflow bevares. |

## 7. Anbefalet sprintplan

- **4D-1: Ugevisning, read-only** — Ny komponent `WeekCalendarGrid` (rows=employees, cols=7 dage). Server-action `getWorkOrdersForWeek(start, end)`. URL `?view=week&date=YYYY-MM-DD`. Chips er klikbare links til `/dashboard/orders/[case_number]`. Filer: `src/app/dashboard/calendar/page.tsx` (refactor til at læse searchParams), ny `week-view.tsx`, ny action i `work-orders.ts`. **Ingen DB-ændringer.**
- **4D-2: View-toggle (week/month/day) + dag-view** — Tabs i header. Day-view: en employee per række, timer som baggrund. Render `time_logs` overlejret (kun for dato = today). Filer: `view-tabs.tsx`, `day-view.tsx`. Afhænger af 4D-1.
- **4D-3: Drag-drop replan** — Træk WO-chip mellem celler → `updateWorkOrderPlanning`. HTML5 native (mønster fra leads-kanban). Optimistisk update + rollback ved fejl. Vis toast. Filer: udvid `week-view.tsx`. Afhænger af 4D-1.
- **4D-4: Mobile + permission-filter** — Mobile vertikal stack for "i dag". Server-side filtrering så montør kun ser sin egen række. Filer: `mobile-day-view.tsx`, opdater action med rolle-check. Afhænger af 4D-1.
- **(Valgfri) 4D-5: Customer_tasks-integration** — Vis tasks som separat top-sektion. Cross-domain mapping via `employees.profile_id ↔ auth.users.id`. Lavere prioritet.

**Ingen migrationer i nogen sub-sprint** — alle nødvendige kolonner findes (00086 + 00053).

## 8. Acceptkriterier

- [ ] `/dashboard/calendar` åbner i ugevisning som default; viser nuværende uge (Man-Søn).
- [ ] Hver række = én aktiv employee (fra `employees` WHERE active=true, sorteret på `name`).
- [ ] Hver celle viser work_orders for den employee + dato med farve per status (matcher OrderPlanningTab).
- [ ] Klik på WO-chip navigerer til `/dashboard/orders/[case_number]`.
- [ ] Pile ←/→ skifter uge; URL opdateres til `?view=week&date=YYYY-MM-DD`; refresh bevarer ugen.
- [ ] Toggle til day-view viser timekolonner 07-18 og rendrer aktive `time_logs` for dagen.
- [ ] Drag af WO-chip fra (employee A, mandag) til (employee B, onsdag) opdaterer DB og bekræfter med toast.
- [ ] På mobil: stack af employee-kort for "i dag", scroll-bar.
- [ ] Bruger med rolle `montør` ser kun sin egen række.
- [ ] Cancelled work_orders er skjult som default; toggle "Vis annullerede" gør dem synlige (grå).

## 9. Beslutninger Henrik skal tage før 4D-1

1. **Skal customer_tasks blive på samme side eller flyttes til /dashboard/tasks?** (Anbefaling: behold på kalender bag toggle, men adskilt sektion.)
2. **Default view: week eller day?** (Anbefaling: week — bedre til planlægning.)
3. **Skal montør kunne flytte sine egne work_orders, eller kun se?** (Anbefaling: kun se — replanlægning er serviceleder-job.)
4. **Skal day-view tidsblokken styres af `time_logs.start_time` (faktisk arbejde) eller en ny `scheduled_start_time` på work_orders?** (Anbefaling: foreløbig kun heldagsblokke fra `scheduled_date` — udskyd timeslots til evt. 4E.)
5. **Hvad sker der med work_orders uden assigned_employee_id?** (Forslag: separat "Ikke tildelt"-række øverst, drag herfra ud i grid for at tildele.)

## 10. Kritiske filer

- `C:\Users\henri\elta-crm\src\app\dashboard\calendar\page.tsx`
- `C:\Users\henri\elta-crm\src\app\dashboard\calendar\calendar-client.tsx`
- `C:\Users\henri\elta-crm\src\app\dashboard\calendar\loading.tsx`
- `C:\Users\henri\elta-crm\src\app\dashboard\orders\[id]\order-planning-tab.tsx`
- `C:\Users\henri\elta-crm\src\app\dashboard\orders\[id]\work-order-time-logs.tsx`
- `C:\Users\henri\elta-crm\src\app\dashboard\orders\[id]\page.tsx` (case_number routing reference)
- `C:\Users\henri\elta-crm\src\lib\actions\work-orders.ts` (`updateWorkOrderPlanning` :177)
- `C:\Users\henri\elta-crm\src\lib\actions\service-cases.ts` (`getEmployeesForOrderSelect` :836)
- `C:\Users\henri\elta-crm\src\types\workforce.types.ts`
- `C:\Users\henri\elta-crm\src\types\employees.types.ts`
- `C:\Users\henri\elta-crm\src\types\customer-tasks.types.ts`
- `C:\Users\henri\elta-crm\src\lib\auth\permissions.ts` (`calendar.view` :84)
- `C:\Users\henri\elta-crm\src\components\layout\sidebar.tsx` (kalender-link :153-166)
- `C:\Users\henri\elta-crm\src\components\layout\header.tsx` (mobile-pattern :122-131)
- `C:\Users\henri\elta-crm\src\components\modules\leads\leads-kanban.tsx` (HTML5 drag-drop reference :47-80)
- `C:\Users\henri\elta-crm\supabase\migrations\00086_employees_workorders_timelogs.sql` (work_orders schema + index)
- `C:\Users\henri\elta-crm\supabase\migrations\00053_customer_tasks.sql` (customer_tasks schema)
