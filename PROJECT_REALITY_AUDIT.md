# Elta CRM — Project Reality Audit

**Snapshot:** 2026-05-03
**Branch / HEAD:** `main` @ `6b552c6` (employees WIP) ← latest commit on `origin/main`
**Audit basis:** live database queries (Supabase Management API), filesystem inspection, build output, RLS policy dump, row counts on every table.

---

## Executive Summary

Elta CRM has **a lot of code shipped** (96 migrations, 95+ pages, 70+ server-action files, 32 API routes) but **production usage is almost zero**. The big modules built in Phases 5–15 (invoices, supplier invoices, e-conomic, autopilot, bank match, time tracking, profit, employees, AI optimization) have **0 rows** in their core tables. They compile, type-check, and pass DB-level smoke tests — but **none of them have been exercised end-to-end with real production data**.

The genuinely live modules — Email intelligence (185 emails, 24 logs), Customers (8 rows), Leads (5), Offers (10), Kalkia/Calculations (70 components, 113 variants), Supplier products mirror (282k rows) — work and have for weeks.

**Two findings deserve immediate attention:**
1. **RLS is disabled** on `customers`, `leads`, `offers`, `projects`, `messages`. These are core business tables and currently open to any authenticated user. (Other 120+ tables have RLS enabled.)
2. **e-conomic credentials are not configured** (`accounting_integration_settings` is empty). Every "sync to e-conomic" code path returns `ECONOMIC_NOT_CONFIGURED` and silently skips. No real invoice has ever been pushed to e-conomic.

The system is **not yet production-live** — go-live blockers from `PRODUCTION_READINESS_REPORT.md` (2026-04-30) are still open. We've shipped Phases 12, 15, 15.1, 15.2, 15.3, 11.1 since that report, but those didn't move the production-readiness bar — they widened the build, not deepened it.

---

## Module Status Matrix

| # | Module | Phase | Status | What works | What's missing | Risk | Recommended next action |
|---|---|---|---|---|---|---|---|
| 1 | **Auth + RLS framework** | 0 | **B** | Supabase auth, login, `proxy.ts` gate, role enum (admin/user/technician/serviceleder/montør), 4 admin profiles | RLS DISABLED on `customers`, `leads`, `offers`, `projects`, `messages`; `emails` has RLS enabled but 0 policies → unreachable | 🔴 **HIGH** — any authenticated user can read/write these | Add RLS policies + enable on the 5 tables |
| 2 | **Customers** | 2 | **B** | Full CRM CRUD, customer card, document upload, email auto-link, 8 customers in prod | RLS off; bulk import; credit limits; segments | 🟠 | Enable RLS first |
| 3 | **Leads** | 2 | **B** | List+detail, 5 leads, lead activities, conversion to customer | RLS off | 🟠 | Enable RLS |
| 4 | **Offers** | 4 | **A** (with caveat) | 10 offers, full lifecycle, branded PDF, e-sign portal, auto-reminders, signatures, activities log, packages | RLS off; no version history | 🟠 | Enable RLS — workflow is otherwise the most mature module |
| 5 | **Projects** | — | **D** | UI exists (list+detail) | **0 rows ever**, no real workflow, no time-link, RLS off, table referenced by `time_logs`/`work_orders` but unused | 🟡 | Decide: build or kill |
| 6 | **Outgoing Invoices (Phase 5)** | 5/5.1/5.2 | **C** | Backend complete: `createInvoiceFromOffer` RPC (00080), reminders (00081), payments (00082), bank-match (00083), `/dashboard/invoices` minimal list page (added today, fe38d73), 1 row in `invoice_number_counters` (one allocated number, then nothing) | **0 rows in `invoices`**, **no create/edit UI**, **no PDF generator** for invoices, no admin actions file (`src/lib/actions/invoices.ts` does not exist), only `incoming-invoices.ts` actions exist | 🔴 — can't actually invoice a customer | Build invoice CRUD UI + PDF route |
| 7 | **Incoming supplier invoices (Phase 15)** | 15/15.1/15.2 | **B** | Tables, RLS, admin queue UI (`/dashboard/incoming-invoices`), parser (Danish heuristic + pdf-parse), matcher with breakdown, audit log, approve/reject flow, `needs_review` threshold, 2 cron routes | **0 rows ever** — never received a real supplier invoice, AO endpoint not configured (`AO_INVOICE_API_NOT_CONFIGURED`), LM SFTP credential present but invoice dir never tested | 🟡 — code looks right but real-world unverified | Test with one real AO/LM invoice |
| 8 | **Bank match (Phase 5.3)** | 5.3 | **B** | DB invariants, CSV parser, matcher (ref/amount/sender), 4 transactions in DB (smoke data), UI at `/dashboard/bank`, cron `/api/cron/bank-match` (now daily) | Never matched a real bank statement to a real invoice (because invoices=0) | 🟢 | Wait until invoices exist |
| 9 | **e-conomic integration (Phase 5.4 + 15)** | 5.4 / 15.3 | **D — placeholder** | Code: `economic-client.ts` with `createCustomer`, `createInvoice`, `markInvoicePaid`, `pushSupplierInvoiceToEconomic`. Settings table + sync log table + UNIQUE indexes on external IDs. | **`accounting_integration_settings` has 0 rows** → every call returns `ECONOMIC_NOT_CONFIGURED`. No live credentials, no OAuth, no token refresh, no test against sandbox, no customer/product sync FROM e-conomic, no error retry logic. **Not verified to work.** | 🔴 | Configure credentials + sandbox test |
| 10 | **Autopilot (Phase 10)** | 10/11 | **B** (dormant) | 4 seeded rules in DB, engine + condition evaluator + action registry, audit table with UNIQUE constraint, Go-Live admin panel, RBAC + audit log + alert system | **All 4 rules `dry_run=true`** (Phase 11 hardening default) → 0 rows in `automation_executions`. Real runs unverified. Customer-creation trigger never wired. | 🟡 | Flip ONE rule live (offer_accepted) and watch for one real cycle |
| 11 | **Workforce / time tracking (Phase 7)** | 7/7.1 | **D** | Tables (employees, time_logs, work_orders, work_order_profit), one-active-timer UNIQUE, cost_amount auto-trigger, `createInvoiceFromWorkOrder` RPC, 1 employee in DB, **employee module DB+actions added today (00096) but no UI** | **0 work_orders, 0 time_logs, no `/dashboard/time` page, no `/dashboard/employees` UI**, montør mobile flow never built | 🔴 | Build employee UI (started in 6b552c6) → then time-entry mobile UI |
| 12 | **Profitability (Phase 8)** | 8 | **D** | Cost trigger, `calculate_work_order_profit` RPC, `snapshot_work_order_profit` RPC, low_profit auto-flag (Phase 9), AI suggestions table | 0 work_order_profit snapshots (because work_orders=0); no UI page consumes the data | 🟢 | Wait for work_orders flow |
| 13 | **AI optimization (Phase 9)** | 9 | **B** | 6 ai_suggestions logged, dashboard insights panel, pricing optimization, employee analytics, forecasting, all read-only | Limited training data (most modules unused), insights are mostly "no data yet" | 🟢 | Re-evaluate after real data flows |
| 14 | **Sales engine — packages + options (Phase 12)** | 12 | **C** | 3 active packages + 9 package_items seeded, `applyPackageWithOptionsToOffer`, admin CRUD at `/dashboard/settings/packages`, `<PackagePicker>` component | **`package_options` empty** (0 rows — operator never created tickable add-ons), `<PackagePicker>` not yet dropped into `/dashboard/offers/[id]/page.tsx` so feature is invisible to actual offer creators | 🟡 | Wire `<PackagePicker>` into offer detail page |
| 15 | **Email intelligence (Phase 1)** | 1 | **A** | **185 incoming_emails**, **24 intelligence_logs**, 5 daily summaries, 3 active mailbox sync states, classifier + extractor + auto-customer | This works. Used in prod. | 🟢 | Leave alone |
| 16 | **Supplier products mirror (Phase 4/7)** | 4/7 | **A** | **282,935 supplier_products** synced from AO + LM, 9 sync logs, 2 supplier_credentials | LM `last_test_status='success'` confirmed; AO never re-tested since 04-29 | 🟢 | Schedule periodic re-test |
| 17 | **Service cases (Phase 6.1)** | 6.1 | **B** | List + detail UI, 1 case in prod, smart fields (address, GPS, KSR, EAN), checklist | Low usage; KLS forms not built (regulatory gap per `ELTA_ORDRESTYRING_GAP_ANALYSIS.md` §14) | 🟠 | Build KLS forms before el-installation usage |
| 18 | **Service kalkulation (Kalkia)** | 4 | **A** | 70 components, 113 variants, 134 variant_materials, 25 rules, 10 global factors, 8 building profiles, 11 complexity factors. Real data, real engine. | None for current scope | 🟢 | Leave alone |
| 19 | **Customer portal + e-sign** | 4 | **A** | 23 portal_access_tokens, 7 portal_messages, public offer view, accept/reject with signature | None for current scope | 🟢 | Leave alone |
| 20 | **Mail bridge (Microsoft Graph)** | 4 | **A** | 3 graph_sync_state rows (multi-mailbox), inbound emails flowing, sent items captured | None for current scope | 🟢 | Leave alone |
| 21 | **System health monitoring (Phase 6)** | 6 | **B** | scanAndAlert + admin alerts (Phase 11.1), 5 dashboard insights | **0 rows in system_health_log** — cron was sub-daily before Hobby-tier fix; with daily schedule, expect 1 row/day going forward. Limited signal. | 🟡 | Watch for first 24h after daily cron lands |
| 22 | **Go-Live admin panel (Phase 11.1)** | 11.1 | **A** | RBAC gating, audit log table, autopilot toggle, integration tests, manual run buttons, `go_live_audit_log` schema | 0 audit rows yet → operator never used the panel | 🟢 | Verify by running each test action once |
| 23 | **Settings (company, suppliers, materials, kalkia, etc.)** | various | **B** | All settings pages exist, company_settings has 1 row, suppliers (2), supplier_settings (2), materials (11), packages (14), package_items (38), kalkia substantial data | Some pages may not have full CRUD; integrations (0 rows in `integrations`/`integration_settings`/`integration_endpoints`/`integration_webhooks`) | 🟢 | Audit individually if used |
| 24 | **Employee module (Phase 16/WIP)** | (new) | **C** | DB + types + Zod + economics + actions committed in `6b552c6`, RLS admin-only, real_hourly_cost generated column, history audit table | **No UI pages built yet** (`/dashboard/employees`, `/new`, `/[id]`, `/edit`) — paused for this audit | 🟡 | Resume UI build OR pause indefinitely |

**Status legend (per spec):**
- **A** — Production-ready, used in prod with real data
- **B** — Functional but limited polish/test, or unused but technically correct
- **C** — Partially built (DB or backend present but UI/integration missing)
- **D** — UI/placeholder only, or backend present but never connected to real data
- **E** — Broken / risk → none classified E currently. Closest: items in Risk #1 below.

---

## Critical Problems (top 10)

### 1. 🔴 RLS disabled on core business tables
Five tables have `rowsecurity=false`:
- `customers` (8 rows)
- `leads` (5 rows)
- `offers` (10 rows)
- `projects` (0 rows)
- `messages` (0 rows)

Any authenticated user can read/write all customers, leads, offers regardless of role. **This is a hard security gap.**

**Verified by:** `pg_tables` query in audit — 5 of 121 tables have RLS off.
**Recommended fix:** one migration that ALTERs ENABLE ROW LEVEL SECURITY + adds at least an "all_auth" policy (matches existing pattern). 1-day work.

### 2. 🔴 `emails` table has RLS enabled but 0 policies
Table `emails` exists, RLS is on, but no policies — meaning the table is unreachable from authenticated context. If anything writes to `emails` it will silently 23505/permission-deny in prod. (This is a different table from `incoming_emails`/`email_messages`, both of which have policies.)
**Status:** Possibly orphaned table from an early phase. Confirm and either drop or add policies.

### 3. 🔴 e-conomic integration is unconfigured and unverified
- `accounting_integration_settings` has **0 rows** — no `api_token`, no `agreement_grant_token`, no `cashbookNumber`, no `costAccountNumber`, no `layoutNumber`.
- Every code path calling e-conomic logs `ECONOMIC_NOT_CONFIGURED` and returns `{ status: 'skipped' }`.
- The HTTP request shape (`/customers`, `/invoices/drafts`, `/cash-books/{n}/entries/customer-payments`, `/supplier-invoices/drafts`) is **derived from public docs and never tested against a real e-conomic agreement**. The cashbook payment voucher API is particularly fragile — its required fields differ between agreement configurations.

**Implication:** an entire shipped phase (5.4) is functionally a placeholder.

### 4. 🔴 Outgoing invoice has no UI to create one
- `/dashboard/invoices/page.tsx` (added today, fe38d73) is a **read-only list** — no create button, no edit, no delete, no detail page (`/dashboard/invoices/[id]/page.tsx` does not exist).
- No `src/lib/actions/invoices.ts` server action file. Only `incoming-invoices.ts` exists.
- No `/api/invoices/[id]/pdf/route.ts`. Only offers have PDF (`/api/offers/[id]/pdf`).
- Invoices are created via the autopilot rule `offer_accepted → create_invoice_from_offer` (currently `dry_run=true`) — meaning the only way to create an invoice today is to flip the rule live. Manual invoice creation is impossible from the UI.

### 5. 🔴 Workforce module: 1 employee, 0 time logs, 0 work orders
- `employees`: 1 row (smoke data from Phase 7 testing)
- `work_orders`: 0
- `time_logs`: 0
- `work_order_profit`: 0
- `time_entries` (legacy): 0
- `/dashboard/employees` page does not exist (today's WIP `6b552c6` added DB+actions but no UI)
- `/dashboard/time` mobile UI never built (deferred since Master Plan)

**Implication:** the entire Phase 7/7.1/8 backend (one-active-timer index, cost_amount trigger, profit snapshot RPC, invoice-from-WO, billable rollup) is theoretical.

### 6. 🟠 Autopilot is fully dry-run
- All 4 rules `active=true`, `dry_run=true` (Phase 11 hardening default).
- 0 rows in `automation_executions` — engine has never run a real action.
- The smoke test in Phase 10 verified the DB constraint, not the action handlers in production.

### 7. 🟠 KLS forms missing (regulatory gap)
Per `ELTA_ORDRESTYRING_GAP_ANALYSIS.md` §14 (2026-04-30): KLS (Kvalitets-Ledelses-System) forms are required by law for el-installatør operations. Current `service_cases.checklist` jsonb is too thin. **Risk:** SikkerhedsStyrelsen audit non-compliance.

### 8. 🟠 GDPR endpoints missing
No `data_export_requests` or `data_deletion_requests` table. No "right to be forgotten" workflow. Per gap analysis §20 — €20M / 4% revenue penalty exposure if a customer requests their data and we can't comply.

### 9. 🟡 Vercel Hobby tier limits health-check cron to daily
- `system-health-check` was every 5 min before — added in Phase 6
- Downgraded to daily (`0 9 * * *`) on 2026-05-03 to satisfy Hobby tier (commit `5c74519`)
- Same applies to `incoming-invoices` (was hourly → now daily) and `incoming-invoices-api` (was every 6h → now daily)
- **Implication:** alerts lag by up to 24h; supplier invoice email ingest happens once a day

### 10. 🟡 Package options + sales engine never used
- `offer_packages`: 3 rows (Phase 4)
- `package_options`: 0 rows (Phase 12 admin UI built but operator never added options)
- `<PackagePicker>` component exists but is **not dropped into `/dashboard/offers/[id]/page.tsx`** — the feature is invisible to actual offer authors

---

## All Loose Ends (categorised)

### Code on disk, no UI to access
- `src/lib/services/employee-economics.ts` (Phase 16 WIP — no `/dashboard/employees` page)
- `src/lib/actions/employees.ts` (same)
- `src/components/modules/sales/package-picker.tsx` (built Phase 12, never embedded)
- `src/lib/services/profitability.ts` (no `/dashboard/work-orders/[id]/profit` page)
- `src/lib/services/economic-client.ts` (no settings UI to enter credentials — must INSERT directly via SQL)

### Tables with 0 rows that have shipped backends
- `invoices`, `invoice_lines`, `invoice_payments`, `invoice_reminder_log`
- `incoming_invoices`, `incoming_invoice_lines`, `incoming_invoice_audit_log`
- `accounting_integration_settings`, `accounting_sync_log`
- `automation_executions`
- `work_orders`, `time_logs`, `work_order_profit`
- `employee_compensation`, `employee_compensation_history`
- `system_health_log`
- `go_live_audit_log`
- `package_options`
- `customer_supplier_prices`, `customer_product_prices`
- `supplier_margin_rules`
- `service_case_attachments`
- `case_notes`
- `risk_assessments`
- `room_templates`
- `email_intelligence_logs` has 24 rows but `email_intelligence_daily_summary` has only 5 rows (4 days of summaries despite 185 emails received — summary cron may be incomplete)

### "Shipped" features that are not wired to real flow
- e-conomic outgoing invoice push (`createInvoiceInEconomic`) — wired into `sendInvoiceEmail` but never fires because settings empty
- e-conomic mark-paid (`markInvoicePaidInEconomic`) — wired into `registerPayment` but never fires
- e-conomic supplier invoice push (`pushSupplierInvoiceToEconomic`) — wired into `approveInvoice` but never fires
- Autopilot rules (4 dry_run)
- Bank match auto-trigger (cron daily, 4 transactions in DB are from smoke test)
- Profit snapshots (no work_orders means no triggers fire)
- Low-profit margin alert (no profit data)
- AI insights forecasting (insufficient data)
- Cron `incoming-invoices` (no email-ingested invoices)
- Cron `incoming-invoices-api` (no AO/LM endpoint configured)
- Cron `lemu-sync` (works for product data; not invoice data)

### Diagnostic / debug routes still in repo
- None remaining. Removed `/dashboard/test123` and `/api/debug` in `1bdc376`.

### Documentation gaps
- `ELTA_MASTER_PLAN.md` describes phases up to 7 but stops there
- `PRODUCTION_READINESS_REPORT.md` from 2026-04-30 lists 6 pre-go-live blockers — none of them have been closed in the 3 days since
- `ELTA_ORDRESTYRING_GAP_ANALYSIS.md` from 2026-05-02 maps 21 areas — items 13.6 (time mobile UI), 13.7 (time approval), 13.8 (invoice PDF), 13.10 (e-conomic config), 16 (KLS), 18 (GDPR) are still all open
- No `README.md` covering "how to run setup-db", "how to configure e-conomic", "how to onboard a montør"

---

## Database / Security Audit Detail

### Tables totals
- **121 tables** in `public` schema
- **5 tables with RLS DISABLED** (see Critical #1)
- **1 table with RLS but 0 policies** (`emails` — see Critical #2)
- **115 tables with RLS + ≥1 policy** — generally healthy

### Auth model
- 4 profiles total, **all 4 are role='admin'** (no other roles assigned in prod yet)
- RBAC enum: `admin, user, technician, serviceleder, montør`
- `proxy.ts` correctly gates `/dashboard/*` and redirects `/login` for authenticated users
- No root `middleware.ts` — Next.js 16 `proxy.ts` is the equivalent

### Cron schedules (post-Hobby-tier fix)
| Cron | Schedule | Purpose |
|---|---|---|
| supplier-sync | `0 2 * * *` | nightly product catalog refresh |
| lemu-sync | `0 4 * * 1` | weekly LM full sync |
| intelligence-check | `0 3 * * *` | daily AI quality check |
| learning-feedback | `0 4 * * *` | daily learning feedback |
| email-sync | `0 5 * * *` | **daily** (was implicitly more frequent — investigate) |
| offer-reminders | `0 8 * * *` | daily |
| email-intelligence-summary | `30 0 * * *` | daily |
| invoice-reminders | `0 7 * * *` | daily |
| bank-match | `30 6 * * *` | daily |
| **system-health-check** | `0 9 * * *` | **was every 5 min — daily now (Hobby fix)** |
| **incoming-invoices** | `15 9 * * *` | **was hourly — daily now** |
| **incoming-invoices-api** | `30 9 * * *` | **was every 6h — daily now** |

---

## Recommended Completion Sequence

### Tier 1 — Block / Security (do FIRST, 1 week)
1. **Fix RLS on customers/leads/offers/projects/messages.** One migration. Critical security gap.
2. **Audit `emails` table.** Either drop or add policies.
3. **Configure e-conomic credentials in production.** Insert real `accounting_integration_settings` row, validate against e-conomic sandbox, test customer + invoice + cashbook entry. Without this, Phase 5.4 is wasted code.

### Tier 2 — Make existing code reachable (1–2 weeks)
4. **Build `/dashboard/invoices` CRUD UI** — list, detail, create, edit, status flow buttons, PDF generator (`/api/invoices/[id]/pdf` using `@react-pdf/renderer` already installed). Add `src/lib/actions/invoices.ts` admin actions.
5. **Build `/dashboard/employees` UI** — finish the WIP from `6b552c6`. List + filter, profile detail with rate breakdown, edit form, compensation history view.
6. **Build `/dashboard/time` mobile UI** — start/stop timer, manual entry, day/week summary. Per gap analysis 13.6.
7. **Wire `<PackagePicker>` into `/dashboard/offers/[id]/page.tsx`** — Phase 12 feature is invisible without this 1-line embed.

### Tier 3 — Verify what's already shipped (1 week)
8. **Flip ONE autopilot rule live.** Pick `offer_accepted → create_invoice_from_offer`. Watch for 24h. Verify the entire pipeline works end-to-end with real data.
9. **Send one real test invoice.** Manually create offer → accept → invoice should auto-generate → email lands → mark paid → bank match → e-conomic push. End-to-end smoke against prod.
10. **Process one real supplier invoice.** Forward an AO/LM PDF to the configured mailbox, watch the cron pick it up, verify parser confidence + matcher result + UI presentation.

### Tier 4 — Regulatory + GDPR (must close before live use)
11. **KLS forms.** Per gap analysis §14. Required by Danish law for el-installatør.
12. **GDPR endpoints.** Per gap analysis §20. `data_export_requests` + `data_deletion_requests` + admin handling UI.

### Tier 5 — Operational maturity (3–4 weeks, lower urgency)
13. Time approval workflow (gap analysis §8)
14. Calendar dispatcher (drag-drop multi-resource)
15. Inventory / stock module
16. Per-role dashboards (admin / serviceleder / montør)
17. Vercel Pro upgrade → restore sub-daily cron schedules

---

## Stop / Go Decisions

### STOP (don't build more on these until Tier 1-3 closed)
- New phases (no Phase 16 yet — pause employee module after audit unless specifically prioritised)
- Additional integrations (Relatel CTI, AO order placement, LM order placement)
- Intranet / knowledge base
- Multi-version offer revisions
- AI optimization deeper dives

### CONTINUE (already partially done; finish them)
- Employee module UI (`6b552c6` + Tier 2 #5)
- Invoice CRUD UI (Tier 2 #4)
- e-conomic configuration (Tier 1 #3)
- RLS hardening (Tier 1 #1)
- Sales engine PackagePicker embed (Tier 2 #7)

### CAN WAIT (cosmetic / nice-to-have, not blocking)
- Per-WO profit page UI
- Autopilot per-rule detail page
- AI insights polish
- Document central index
- Supplier health re-test cron
- Calendar dispatcher (huge build, defer)

---

## Recommended Next 5 Concrete Tasks

In strict order. Don't skip; don't parallelise across operators.

| # | Task | Effort | Why first |
|---|---|---|---|
| 1 | **Fix RLS on customers/leads/offers/projects/messages** (one migration, ENABLE + admin-or-self policies) | 0.5 day | Security gap. Anyone authenticated can read/write business data. Cheap fix. |
| 2 | **Insert real `accounting_integration_settings` row + validate against e-conomic sandbox** (no code change — DB INSERT + manual test of `createCustomerInEconomic` against a sandbox agreement) | 1 day | Unblocks Phase 5.4 + 15.3. Without this, the entire accounting integration is theoretical. |
| 3 | **Build `/dashboard/invoices` create + detail + PDF** (3 pages + 1 server action file + 1 API route for PDF) | 3 days | Without this, no operator can actually invoice a customer. |
| 4 | **Finish `/dashboard/employees` UI** (resume `6b552c6`: list + new + detail + edit pages, ~400 lines) | 2 days | Backend is done. UI is the only blocker. Quick win. |
| 5 | **Flip 1 autopilot rule live + run end-to-end smoke** (offer_accepted → create_invoice_from_offer in production with a real offer, real customer, real invoice, real e-conomic push) | 0.5 day | The single most important verification — proves the whole Phase 5/10/11/12 stack actually works in prod. Not just "compiles". |

**Total: ~7 working days** to take Elta CRM from "lots of shipped code with 0 rows" to "real invoice + real e-conomic + real RLS + real workforce in prod."

---

## What this audit deliberately did NOT do

- No code changes
- No DB changes
- No new features
- No refactor
- No tests
- No assumptions about what "should" exist — only verified via direct query / file inspection / build output

The repo is at `6b552c6` on `main`, identical to `origin/main`, working tree clean. Nothing was modified during this audit.

---

## Appendix: data points cited

| Source | Value |
|---|---|
| Total tables in `public` | 121 |
| Tables with RLS disabled | 5 (`customers`, `leads`, `offers`, `projects`, `messages`) |
| Tables with RLS but 0 policies | 1 (`emails`) |
| Total dashboard page.tsx files | 65 |
| Total api/route.ts files | 32 |
| Total server-action files | 70 |
| Total migrations | 96 (00001 → 00096) |
| Customers in DB | 8 |
| Leads | 5 |
| Offers | 10 |
| **Invoices** | **0** |
| **Incoming invoices** | **0** |
| **Work orders** | **0** |
| **Time logs** | **0** |
| Employees | 1 |
| Bank transactions | 4 |
| Service cases | 1 |
| Profiles | 4 (all role='admin') |
| Autopilot rules | 4 (all dry_run=true, active=true) |
| Autopilot executions | 0 |
| Accounting integration settings rows | 0 |
| System health log rows | 0 |
| Go-Live audit log rows | 0 |
| Package options | 0 |
| Email intelligence logs | 24 |
| Incoming emails | 185 |
| Supplier products mirror | 282,935 |
| Kalkia variants | 113 |
| Kalkia variant materials | 36 |
| Calc components | 70 |
