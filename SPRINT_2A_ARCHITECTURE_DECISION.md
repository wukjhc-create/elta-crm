# Sprint 2A — Sag/Ordre Architecture Decision

**Date:** 2026-05-03
**Author:** Senior fullstack / system architect
**Status:** Decision document — no code, no DB changes
**Predecessor:** `ELTA_ERP_BUILD_PLAN.md`

---

## TL;DR

The build plan recommended consolidating into `service_cases` and dropping both `work_orders` and `projects`. **A deeper inspection of the actual FK graph + code footprint reveals that recommendation was partially wrong.** `work_orders` has a rich, working dependency graph (time_logs, invoices, work_order_profit, incoming_invoices) that should be preserved. `projects` has the largest code footprint (46 files) but 0 rows and overlaps with both other tables.

**Revised recommendation:** **Option A* (modified)** — keep both `service_cases` AND `work_orders` in a parent/child hierarchy that already exists in the schema. Drop `projects` (0 rows, redundant). This is the safest migration with the lowest risk of breaking working flows.

---

## 1. Schema audit — exact fields

### service_cases (1 row)

```
id (uuid, PK)
case_number (text, NOT NULL)
customer_id (uuid → customers.id ON DELETE SET NULL)
title, description, status_note (text)
status (text CHECK in 'new','in_progress','pending','closed','converted')
priority (text CHECK in 'low','medium','high','urgent')
source (text CHECK in 'email','phone','portal','manual')
source_email_id (uuid → incoming_emails.id, UNIQUE WHERE NOT NULL)
assigned_to (uuid → profiles.id ON DELETE SET NULL)
created_by (uuid → profiles.id ON DELETE SET NULL)
created_at, updated_at, closed_at (timestamptz)

-- Elta-specific physical fields:
address, postal_code, city, floor_door (text)
latitude, longitude (double precision)
ksr_number, ean_number (text)        ← regulatory/billing
contact_phone (text)
checklist (jsonb)                    ← KLS-stub

-- Customer sign-off:
customer_signature (text — base64 image), customer_signature_name, signed_at

-- External system reference:
os_case_id (text), os_synced_at      ← Ordrestyring legacy sync
```

**Indexes:** customer_id, status, priority, created_at DESC, assigned_to, os_case_id (partial), source_email_id (unique partial)
**Trigger:** `service_cases_updated_at`
**FK out:** customer, profiles (assigned_to, created_by), incoming_emails
**FK in:** `case_notes.case_id`, `service_case_attachments.service_case_id`, `work_orders.case_id`

### work_orders (0 rows)

```
id (uuid, PK)
case_id (uuid → service_cases.id ON DELETE SET NULL)   ← already child of service_cases!
customer_id (uuid → customers.id ON DELETE SET NULL)
title, description (text)
status (text CHECK in 'planned','in_progress','done','cancelled')
scheduled_date (date)
assigned_employee_id (uuid → employees.id ON DELETE SET NULL)
completed_at (timestamptz)
created_at, updated_at (timestamptz)
auto_invoice_on_done (boolean DEFAULT false)
source_offer_id (uuid → offers.id ON DELETE SET NULL)
low_profit (boolean DEFAULT false)
```

**Indexes:** status, assigned_employee_id, case_id, scheduled_date, low_profit (partial)
**Triggers:** `trg_work_orders_done_snapshot` (Phase 8 profit auto-snapshot), `trg_work_orders_updated_at`
**FK out:** service_cases (case_id), customers, employees, offers
**FK in:** `time_logs.work_order_id` (RESTRICT), `invoices.work_order_id` (SET NULL, UNIQUE), `incoming_invoices.matched_work_order_id` (SET NULL), `work_order_profit.work_order_id` (CASCADE)

### projects (0 rows)

```
id (uuid, PK)
project_number (text, UNIQUE NOT NULL)
name, description (text)
status (project_status enum)
priority (project_priority enum)
customer_id (uuid → customers.id ON DELETE CASCADE)   ← note: CASCADE
offer_id (uuid → offers.id ON DELETE SET NULL)
start_date, end_date (date)
estimated_hours, actual_hours (numeric(10,2))
budget, actual_cost (numeric(12,2))
project_manager_id (uuid)
assigned_technicians (uuid[])         ← multi-tech array
notes (text)
tags (text[])
custom_fields (jsonb)
created_by, created_at, updated_at
```

**Indexes:** project_number (unique), customer_id, status, priority, project_manager_id, project_number, created_at DESC
**Triggers:** `update_projects_updated_at`
**FK out:** customers, offers
**FK in:** `calculation_feedback.project_id`, `integration_logs.project_id`, `integration_queue.project_id`, `messages.project_id`, `project_tasks.project_id` (CASCADE), `time_entries.project_id` (CASCADE) — note: legacy `time_entries`, not `time_logs`

---

## 2. Code usage — every file that references each table

### service_cases — 7 files
- `src/app/api/admin/setup-db/route.ts` — schema bootstrap
- `src/app/api/dashboard/stats/route.ts` — open-cases count
- `src/lib/actions/service-cases.ts` — server actions
- `src/lib/services/auto-case.ts` — Phase 1 auto-case-from-email
- `src/lib/services/employee-economics.ts` — case_number lookup for invoice matching
- `src/lib/services/incoming-invoice-matcher.ts` — case_number → work_order match (Phase 15.1)
- `src/lib/services/work-orders.ts` — `createWorkOrderFromCase` (Phase 7)

Plus UI: `/dashboard/service-cases/page.tsx` + `[id]/page.tsx` + `service-case-detail-client.tsx` + completion-checklist component.

### work_orders — 8 files
- `src/lib/actions/incoming-invoices.ts` — matched_work_order_id resolution
- `src/lib/ai/dashboard-insights.ts` — low_profit count
- `src/lib/services/employee-economics.ts` — `calculateEmployeeProjectImpact` joins time_logs.work_order_id
- `src/lib/services/incoming-invoice-matcher.ts` — match by title
- `src/lib/services/invoices.ts` — `createInvoiceFromWorkOrder` (Phase 7.1)
- `src/lib/services/time-tracking.ts` — startTimeEntry, manual entry — uses work_order_id
- `src/lib/services/work-orders.ts` — main service (createWorkOrderFromCase, assign, setStatus)

No UI — the spec page `/dashboard/work-orders` does NOT exist.

### projects — 46 files (the big one)

**API + cron:**
- `src/app/api/admin/setup-db/route.ts`
- `src/app/api/cron/learning-feedback/route.ts`
- `src/app/api/integrations/webhook/[integrationId]/route.ts`

**Pages + clients:**
- `src/app/dashboard/page.tsx`, `src/app/dashboard/projects/page.tsx`, `src/app/dashboard/projects/[id]/page.tsx`, `src/app/dashboard/projects/[id]/project-detail-client.tsx`
- `src/app/dashboard/reports/reports-client.tsx`
- `src/app/dashboard/settings/learning/learning-client.tsx`

**Layout + nav:**
- `src/components/layout/command-palette.tsx`, `src/components/layout/header.tsx`, `src/components/layout/sidebar.tsx`

**Components:** 16 files under `src/components/modules/projects/` + project-related dashboard widgets, message form/thread, customer activity overview, export button, AI learning metrics

**Server actions:** `src/lib/actions/customer-flow.ts`, `src/lib/actions/projects.ts`, `src/lib/actions/auto-project.ts`, `src/lib/actions/learning.ts`, `src/lib/actions/messages.ts`, `src/lib/actions/dashboard.ts`, `src/lib/actions/calculations.ts`, `src/lib/actions/calculation-intelligence.ts`, `src/lib/actions/reports.ts`

**Services:** `src/lib/services/auto-offer.ts`, `src/lib/services/email-intelligence.ts`, `src/lib/services/profitability.ts`, `src/lib/ai/forecasting.ts`, `src/lib/ai/dashboard-insights.ts`

**Types:** `src/types/projects.types.ts`, `src/types/messages.types.ts`

---

## 3. Relations to the rest of the system

| External module | Currently linked to |
|---|---|
| **time_logs** (Phase 7) | `work_orders.id` only — no projects/service_cases link |
| **invoices** (Phase 5) | `work_orders.id` (UNIQUE) — no projects/service_cases link |
| **incoming_invoices** (Phase 15) | `matched_work_order_id` only |
| **work_order_profit** (Phase 8) | `work_orders.id` only |
| **case_notes** (Phase 6.1) | `service_cases.id` only |
| **service_case_attachments** | `service_cases.id` only |
| **legacy time_entries** | `projects.id` (0 rows in this table) |
| **project_tasks** | `projects.id` (0 rows) |
| **messages.project_id** | `projects.id` (0 rows in messages table at all) |
| **calculation_feedback.project_id** | `projects.id` (0 rows) |
| **integration_logs/queue.project_id** | `projects.id` (0 rows) |
| **offers.lead_id** | leads — not project/case |
| **work_orders.source_offer_id** | offers — when offer accepted, WO created |

**Key observation:** the schema **already has a `service_cases → work_orders → time_logs/invoices/profit` parent-child hierarchy.** It just wasn't documented or surfaced in the UI. `projects` is parallel duplicate machinery.

---

## 4. Data status

| Table | Production rows | Notes |
|---|---|---|
| `service_cases` | 1 | One real row, email-converted ("SV: Møllevej, Rønnede" from Louise Würtz, 2026-03-19) — production-active |
| `work_orders` | 0 | Never created in prod |
| `projects` | 0 | Never created in prod |
| `case_notes` | 0 | |
| `service_case_attachments` | 0 | |
| `time_logs` | 0 | |
| `legacy time_entries` | 0 | |
| `project_tasks` | 0 | |
| `work_order_profit` | 0 | |

**Implication:** the only data we cannot lose is **1 row in service_cases**. Everything else is a clean slate.

---

## 5. Three options analysed

### Option A — `service_cases` as canonical, keep `work_orders` as child, drop `projects`

**What stays:**
- `service_cases` (1 row, real Elta data — KSR, EAN, GPS, signature)
- `work_orders` (0 rows, but rich FK ecosystem and triggers — preserved untouched)
- The existing parent-child link `work_orders.case_id → service_cases.id`

**What goes:**
- `projects` (0 rows)
- `legacy time_entries` (0 rows, only references projects)
- `project_tasks` (0 rows)
- `messages.project_id` column (0 rows in messages)
- `calculation_feedback.project_id`, `integration_logs.project_id`, `integration_queue.project_id` columns (all 0 rows)

**What gets extended (additive, no destruction):**
- `service_cases` gains: `project_name`, `type` (enum: solar/service/installation/project/general), `reference`, `requisition`, `formand_id`, `planned_hours`, `contract_sum`, `revised_sum`, `start_date`, `end_date`, `budget`, `auto_invoice_on_done`, `low_profit`
- New tables potentially: `case_materials`, `case_other_costs`, `case_assignments` (calendar-day slots)

**What can break:**
- 46 files referencing `projects` need updating
- `/dashboard/projects/*` UI gets removed/redirected
- Sidebar nav, command palette, dashboard widgets need rewiring
- Several server actions and AI services need refactor

**Risk:** Medium. Touches many files but no production data loss; Option A's strength is that the existing `work_orders → time_logs/invoices/profit` machinery is **untouched**.

### Option B — `projects` as canonical, drop both `service_cases` and `work_orders`

**Pros:** projects has the most complete UI (16 components, project-detail-client, task-board, time-entry-form), clean `project_status`/`project_priority` enums, multi-tech `assigned_technicians[]` field, budget/actual_cost numeric fields.

**Cons:**
- **Massive code-side refactor** — every Phase 7/7.1/8/15 service that uses `work_orders` (8 files) AND every Phase 6.1 service that uses `service_cases` (7 files) needs rewiring.
- **Loss of working triggers**: `trg_work_orders_done_snapshot` (Phase 8 profit auto-snapshot) would need recreation. The `time_logs.cost_amount` trigger ecosystem is built on `work_orders`.
- **Loss of Elta-specific fields** unless we add them to projects: KSR, EAN, GPS, customer signature, KLS checklist.
- **Loss of 1 real row** unless we migrate the email-derived `service_cases` row into projects (possible but lossy because most Elta fields don't map).

**Risk:** **HIGH.** Throws away working Phase 7/7.1/8/15 trigger ecosystem and Elta-specific business fields.

### Option C — new unified `cases` (or `orders`) table, drop all three

**Pros:** clean break, design from Ordrestyring screenshots without legacy compromise.
**Cons:** **highest migration risk.** Every FK across 12+ dependent tables needs to point to the new table. Every index, trigger, function needs recreation. Every code reference (61 files combined) needs updating. The 1 real `service_cases` row needs migration with full field mapping. We lose multi-month Phase 7/8 stability.

**Risk:** **VERY HIGH.** Not justified when Option A delivers the same end-state with ~30% of the destruction.

---

## 6. Recommendation

**Option A (modified) — the safest path forward.**

### Why
1. Preserves the parent-child `service_cases → work_orders → time_logs/invoices/profit` hierarchy that already exists and works.
2. Loses only one table (`projects`) that has 0 rows and is structurally redundant.
3. Keeps the 1 real production row (the Møllevej case) intact.
4. Keeps all Phase 7/7.1/8/15 triggers, RPCs, and FK constraints functional — no destabilisation of working code.
5. The code-side migration is large but mechanical (find-and-replace pattern for `projects` → `service_cases` + UI redirect).

### What changes architecturally
- **`service_cases` IS the sag/ordre.** It's the customer-facing unit of work — the centre of the ERP.
- **`work_orders` IS the day/shift execution slot within a sag.** Renamed conceptually (not in DB) to "arbejdsordre" or "kalenderbooking". Phase 7's machinery preserved unchanged.
- **`projects` is dropped.** The existing UI under `/dashboard/projects` is migrated to `/dashboard/orders` and re-pointed at `service_cases`.

### Multi-step migration path (NOT a single big migration)

To minimise risk, this is multi-step over Sprint 2:

#### Step 1 — Extend `service_cases` (additive only) — Migration 00098
Add the project-style fields as nullable, default-friendly columns. **Does not break anything.**
- `project_name`, `type` (text or enum), `reference`, `requisition`, `formand_id` (uuid → employees), `planned_hours`, `contract_sum`, `revised_sum`, `start_date`, `end_date`, `budget`, `auto_invoice_on_done` (default false), `low_profit` (default false)
- Update CHECK on `status` to include `quoted` and `delivered` if needed (otherwise reuse existing enum)

**Risk:** Low. Pure ALTER TABLE ADD COLUMN.

#### Step 2 — Build `/dashboard/orders/[id]` UI (read-only first, on `service_cases`)
- New skeleton page with the 9 tabs (Overblik / Timer / Materialer / Øvrige omkostninger / Økonomi / Aktivitet / Dokumentation / Fakturakladde / Handlinger)
- List page `/dashboard/orders` with status pipeline
- Reads from `service_cases`. Writes go through new server action `src/lib/actions/orders.ts`
- /dashboard/service-cases redirects to /dashboard/orders

**Risk:** Low. New code, no replacement.

#### Step 3 — Migrate `/dashboard/projects` UI to `/dashboard/orders`
- Update sidebar/header/command-palette to point at `/dashboard/orders` instead of `/dashboard/projects`
- Forward `/dashboard/projects` requests to `/dashboard/orders` (Next.js redirect)
- Delete `src/components/modules/projects/*` (16 files) once redirect verified
- Delete `/dashboard/projects/*` pages
- Update 30+ files referencing `projects.*` queries

**Risk:** Medium. 0 rows in `projects` = no data loss. UI rewiring is mechanical.

#### Step 4 — Drop `projects` table + dependents — Migration 00099
- DROP table `project_tasks` (0 rows, projects-only)
- DROP table `legacy time_entries` (0 rows, projects-only)
- ALTER TABLE `messages` DROP COLUMN `project_id` (0 rows in messages anyway)
- ALTER TABLE `calculation_feedback` DROP COLUMN `project_id` (0 rows)
- ALTER TABLE `integration_logs` DROP COLUMN `project_id` (0 rows)
- ALTER TABLE `integration_queue` DROP COLUMN `project_id` (0 rows)
- DROP TYPE `project_status`, `project_priority`
- DROP table `projects`

**Risk:** Low. Only runs after Steps 1–3 verified. All affected tables are 0 rows.

#### Step 5 — Wire `service_cases` ↔ `work_orders` UX
- Create `work_order` rows from `/dashboard/orders/[id]` Schedule action ("Book medarbejder på dag X")
- Display work_orders inside the sag detail (Timer tab + Aktivitet tab)
- Existing Phase 7/8 RPCs untouched — they continue to work on work_order_id

**Risk:** Low. Builds on existing infrastructure.

---

## 7. Migration plan summary

| # | Type | Migration | Effort | Risk | Reversible? |
|---|---|---|---|---|---|
| 1 | DB | 00098 — extend service_cases (additive) | 0.5 day | Low | Yes (DROP COLUMN) |
| 2 | Code | New `/dashboard/orders/[id]` skeleton + list | 2 days | Low | Yes (delete pages) |
| 3 | Code | Migrate /dashboard/projects → /dashboard/orders | 3 days | Medium | Yes (revert PR) |
| 4 | DB | 00099 — drop projects + dependents | 0.25 day | Low | **No** (data lost — but 0 rows so no concern) |
| 5 | Code | Schedule UX (work_order creation from sag) | 1 day | Low | Yes |
| **Total** | | | **~7 days** | | |

---

## 8. Rollback plan

### Per-step rollback
- **Step 1** rollback: `ALTER TABLE service_cases DROP COLUMN <each-field>` — safe because columns are new and unused at this point.
- **Step 2** rollback: delete the new `/dashboard/orders/*` files. `/dashboard/projects/*` still works.
- **Step 3** rollback: revert the PR. Sidebar links restored; project pages still load (because tables still exist post-Step 3).
- **Step 4** rollback: **NOT TRIVIAL.** Once `projects` is dropped, recovery requires re-running the original migration files. Tables are recreated empty. **Do NOT proceed to Step 4 until Step 3 has been live in prod for 7+ days with zero issues.**
- **Step 5** rollback: delete the new code paths.

### Full sprint rollback
If Sprint 2 is abandoned mid-flight (after Steps 1–3 but before Step 4):
- The added `service_cases` columns are nullable and unused → ignore
- `/dashboard/orders` exists in parallel with `/dashboard/projects` → either route works
- No data loss; no broken FK; no broken triggers

After Step 4: rollback requires recreating projects schema and is a real engineering task. **Step 4 is the hard cutover.**

---

## 9. Acceptance criteria

### Step 1 (DB extension)
- [ ] `npm run type-check` clean
- [ ] All new columns exist with NULL defaults
- [ ] Existing 1 row in service_cases unchanged
- [ ] Vercel auto-deploy green

### Step 2 (UI skeleton)
- [ ] `/dashboard/orders` lists `service_cases` with status pipeline
- [ ] `/dashboard/orders/[id]` renders 9 tabs (data may be empty in some)
- [ ] Logged-in user can view the existing Møllevej case via the new UI
- [ ] /dashboard/service-cases redirects to /dashboard/orders

### Step 3 (UI migration)
- [ ] All sidebar / header / command-palette links → `/dashboard/orders`
- [ ] `/dashboard/projects` returns redirect to `/dashboard/orders`
- [ ] No 404 for any internal nav
- [ ] All 30+ updated files build clean
- [ ] No reference to `from('projects')` or `projects.tsx` files remain after migration except the redirect handler

### Step 4 (DB drop)
- [ ] `npm run build` clean before AND after migration
- [ ] No FK constraint errors
- [ ] dropped: `projects`, `project_tasks`, legacy `time_entries`, `messages.project_id`, `calculation_feedback.project_id`, `integration_logs.project_id`, `integration_queue.project_id`, `project_status`, `project_priority`
- [ ] Post-drop: query `SELECT * FROM service_cases LIMIT 1` returns the Møllevej row + new fields
- [ ] No prod errors for 24h after deploy

### Step 5 (Schedule UX)
- [ ] Operator can book a `work_order` from `/dashboard/orders/[id]` with a chosen employee + date
- [ ] Phase 7/8 triggers fire correctly (cost_amount, profit snapshot)

---

## 10. What this report deliberately did NOT do

- No code changes
- No DB changes
- No new features
- No assumption about target without verification — everything cited has a query or grep behind it

The repo is at `0893d8b` on `main`, working tree clean, RLS hardened on the 5 sensitive tables (4fbe6fd).

---

## Decision required

Confirm Option A (modified) as the canonical model. If yes, **next concrete action: Step 1 — Migration 00098 to extend `service_cases` with project-style fields (additive only).** I will write the migration + verify it locally + apply to prod + report. No UI changes in Step 1.

If you want a different option (B or C), or a different sequencing within Option A, say so before Step 1 starts. Once Step 4 fires, projects is gone for good.
