# Production Readiness Report

**Snapshot:** 2026-04-30
**Scope:** Phases 5–10 (Invoice → Bank → Accounting → Workforce → Profitability → AI → Autopilot)

---

## 1. What is verified ready

### Database — all 16 new tables present in prod
`invoices`, `invoice_lines`, `invoice_payments`, `invoice_reminder_log`, `invoice_number_counters`, `bank_transactions`, `accounting_integration_settings`, `accounting_sync_log`, `employees`, `work_orders`, `time_logs`, `work_order_profit`, `ai_suggestions`, `automation_rules`, `automation_executions`, `system_health_log`.

### RPCs (8) deployed and tested
`create_invoice_from_offer`, `create_invoice_from_work_order`, `allocate_invoice_number`, `apply_package_to_offer`, `calculate_work_order_profit`, `snapshot_work_order_profit`, `calculate_sale_price`, `get_effective_margin`.

### Migrations applied (00073–00091)
| # | Phase | Status |
|---|---|---|
| 00073–00078 | Phase 4 (materials/packages) | ✅ applied |
| 00079 | apply_package_to_offer RPC | ✅ smoke verified |
| 00080–00082 | Phase 5 invoice + reminders + payments | ✅ smoke verified |
| 00083 | Phase 5.3 bank transactions | ✅ smoke verified |
| 00084 | Phase 5.4 accounting integration | ✅ smoke verified (skip path) |
| 00085 | Phase 6 system_health_log | ✅ smoke verified |
| 00086 | Phase 7 employees / work_orders / time_logs | ✅ smoke verified |
| 00087 | Phase 7.1 invoice_from_work_order | ✅ smoke verified |
| 00088 + fix | Phase 8 payroll + profit + trigger fix | ✅ smoke verified |
| 00089 | Phase 9 AI optimization + low_profit flag | ✅ smoke verified |
| 00090 | Phase 10 autopilot | ✅ smoke verified |
| 00091 | Production hardening (dry_run default) | ✅ applied |

### Code quality gates
- `npm run type-check` → ✅ **0 errors**
- `npm run build` → ✅ exit code 0
- `git grep "TODO\|FIXME\|XXX"` in new modules → **0 hits**
- `git grep "\* 1\.[2345]"` (hardcoded margin multiplier) in src → **0 hits in code**
  - One legacy `* 1.25` SQL fallback in `00044_supplier_credentials.sql:282` (`calculate_sale_price` when no rule found) — agreed-kept

### Safety invariants — all DB-enforced (not just convention)
| Invariant | Mechanism |
|---|---|
| One invoice per offer | `UNIQUE(offer_id)` on `invoices` |
| One invoice per work order | partial `UNIQUE(work_order_id)` on `invoices` |
| Invoice never sent twice | `UPDATE … WHERE status='draft'` race-safe guard in `sendInvoiceEmail` |
| Payment never marks paid twice | `UPDATE … WHERE payment_status<>'paid'` guard in `registerPayment` |
| Bank tx dedup | `UNIQUE(date, amount, COALESCE(reference_text,''))` |
| Bank tx never overwritten | `UPDATE … WHERE matched_invoice_id IS NULL` guard |
| One active timer per employee | partial `UNIQUE(employee_id) WHERE end_time IS NULL` |
| Time logs never billed twice | `time_logs.invoice_line_id` set on bill, `IS NULL` filter on rollup |
| Profit snapshots append-only | No UNIQUE on `work_order_profit.work_order_id` — every event is a new row |
| Automation max 1 execution per (rule, entity) | partial `UNIQUE(rule_id, entity_id) WHERE status='executed'` |
| Customer external id collisions | `UNIQUE(external_provider, external_customer_id)` (same for invoices) |

### Logging
Every critical path emits `console.log` markers + DB rows where appropriate:
- `INVOICE CREATED / SENT / PAID`
- `PAYMENT REGISTERED`
- `MATCHED PAYMENT / PARTIAL PAYMENT / OVERPAYMENT / AMBIGUOUS MATCH / UNMATCHED TRANSACTION`
- `BANK IMPORT`
- `ECONOMIC CUSTOMER CREATED / INVOICE CREATED / PAYMENT REGISTERED / NOT_CONFIGURED`
- `WORK ORDER CREATED / ASSIGNED / STATUS`, `TIME START / STOP / MANUAL`
- `INVOICE FROM WORK ORDER`
- `PROFIT CALCULATED / PROFIT SNAPSHOT`
- `AI SUGGESTION`
- `AUTOMATION EXECUTED`
- `HEALTH OK / WARNING / ERROR`

---

## 2. What is risky / needs careful go-live

### High-risk integrations — currently dormant or skipped at runtime
| Surface | Status | Action before go-live |
|---|---|---|
| **e-conomic sync** | No `accounting_integration_settings` row exists. Every call returns `ECONOMIC_NOT_CONFIGURED` and skips. | Insert settings row with real `api_token` + `agreement_grant_token` + config (layoutNumber, paymentTermsNumber, vatZoneNumber, defaultProductNumber, cashbookNumber, bankContraAccountNumber). Test customer + invoice creation in e-conomic sandbox first. |
| **Autopilot rules** | All 4 default rules `active=true` but **`dry_run=true` after migration 00091**. They log `dry_run` rows but take no real action. | Operator flips `dry_run=false` per rule via SQL or UI (UI not built yet). |
| **LM SFTP** | Verified once (2026-04-29), `last_test_status=success`. | Schedule periodic re-test or rely on health probe (`/api/admin/test-lm-health`). |
| **Bank import** | No transactions imported yet — health probe will warn for first 7 days. | Either import a real CSV or let the warning ride. |

### Numerical defaults that matter
- Default labor sale rate: `process.env.DEFAULT_HOURLY_RATE` ?? **650 DKK/h** (used by `createInvoiceFromWorkOrder` when employee has no `hourly_rate`)
- Default labor cost rate: hard-coded **400 DKK/h** in `time_logs_set_cost_amount` trigger and profit RPC fallback
- Default fallback margin: **25%** in `calculate_sale_price` when no `supplier_margin_rules` match
- Min profit margin alert threshold: **15%** (auto-flags `work_order.low_profit=true`)
- Payment due days: **14**
- Reminder cooldown: **5 days**
- Reminder cron: **07:00 daily** (Vercel `0 7 * * *`)
- Bank match cron: **06:30 daily**
- System health probe: **every 5 minutes** (`*/5 * * * *`)

### Behaviours only verified via smoke (not real-world tested)
- e-conomic POST endpoints (`/customers`, `/invoices/drafts`, `/invoices/drafts/{n}/book`, `/cash-books/{n}/entries/customer-payments`) — payload shape derived from public docs, **not yet exchanged with a live e-conomic account**.
- `sendEmailViaGraph` for invoice send + reminders — Graph integration is shared with existing email flow which works, but the new templates (`invoice-email.ts`, `invoice-reminder-email.ts`) have not been sent to a real recipient through prod.
- Autopilot rule engine exercised via DB-only smoke. No end-to-end "real offer accepted → real invoice sent → real reminder fired" smoke against prod.

---

## 3. What must be tested manually before live use

### Phase 5 — Invoice
- [ ] Accept a test offer in the portal with a real customer email; verify invoice F-2026-NNNN created and email lands in customer inbox.
- [ ] Confirm invoice number sequence is monotonically increasing.
- [ ] Force `payment_status=paid` via UI/SQL and confirm `paid_at` set.

### Phase 5.1/5.2 — Reminders & payments
- [ ] Force an overdue invoice (back-date `due_date`) and run `/api/cron/invoice-reminders` manually with `Authorization: Bearer $CRON_SECRET`. Confirm reminder email arrives, `last_reminder_at` set, audit row in `invoice_reminder_log`.
- [ ] Insert a real `invoice_payments` row with the SQL snippet in `INVOICE_BANK_REG_NO`/`INVOICE_BANK_ACCOUNT` env vars set. Confirm `amount_paid` updates, `payment_status` transitions, audit row recorded.

### Phase 5.3 — Bank match
- [ ] Import a real bank CSV via `/dashboard/bank` or `parseBankCSV` directly. Confirm dedup works on re-import.
- [ ] Verify `autoMatchTransactions` matches a transaction whose `reference_text` contains an invoice number.
- [ ] Verify ambiguous transactions (multiple amount matches) appear in the UI with candidate count.

### Phase 5.4 — e-conomic
- [ ] Insert real settings row, run a manual `createCustomerInEconomic(customerId)` via a server-action shell. Confirm e-conomic returns customerNumber and our DB stores `external_customer_id`.
- [ ] Same for `createInvoiceInEconomic` — confirm draft + booked numbers.
- [ ] Test `markInvoicePaidInEconomic` only after confirming `cashbookNumber` and `bankContraAccountNumber` map to real ledger accounts.

### Phase 7 — Time tracking
- [ ] Start a timer on an assigned work order from a montør account; verify second start raises "already has active timer".
- [ ] Stop the timer; verify hours computed correctly (generated column).
- [ ] Manually create overlapping entry; verify rejection.

### Phase 7.1 — Invoice from work order
- [ ] Set a work order to `done` with `auto_invoice_on_done=true`; verify invoice created with time + material lines, time logs marked `invoice_line_id`.

### Phase 8 — Profitability
- [ ] Verify `work_order.low_profit` flag flips on a snapshot with margin <15%.
- [ ] Verify dashboard panel shows "low_profit" insight.

### Phase 10 — Autopilot
- [ ] **Critical:** verify `dry_run=true` is honoured — `automation_executions` rows for `offer_accepted` should show status='dry_run', NOT 'executed', until operator opts in.
- [ ] Flip ONE rule (`offer_accepted`) to `dry_run=false`; accept a test offer; verify ONE invoice created and second accept of same offer is skipped (idempotent).
- [ ] Confirm health probe cron lands `health_check` rows every 5 min after deploy.

---

## 4. Recommended go-live checklist

### T-7 days
1. Provision e-conomic credentials. Insert `accounting_integration_settings` row with `active=false` first; smoke-test a customer create against e-conomic sandbox.
2. Set `INVOICE_BANK_REG_NO` and `INVOICE_BANK_ACCOUNT` env vars in Vercel so invoice emails contain bank info.
3. Set `DEFAULT_HOURLY_RATE` env var if 650 is wrong for the business.
4. Run `npm run build` locally and against the Vercel preview branch — confirm green.
5. Verify cron entries in `vercel.json` are honoured by Vercel (deploy and check Functions → Cron tab).

### T-3 days
6. Set per-employee `hourly_rate` and `cost_rate` in the `employees` table for every active tech.
7. Decide which automation rules to enable. Default state after 00091 is **all dry_run**.
8. Run `getOverdueInvoices()` to see what's pending pre-go-live; resolve manually.
9. Manually re-run `node scripts/test-lm-ftp-direct.mjs` to confirm LM SFTP cred is fresh.

### T-1 day (pre-flight)
10. Re-run `npm run type-check` and `npm run build`.
11. Verify all 16 tables exist (use the audit query in §1).
12. Hit `/api/cron/system-health-check` manually — confirm overall='ok'.
13. Confirm `accounting_integration_settings.active=true` if e-conomic is in scope; otherwise leave `active=false` and verify `ECONOMIC_NOT_CONFIGURED` in logs.
14. Backup DB or take a snapshot of current state.

### Go-live
15. Flip ONE autopilot rule live at a time. Watch `automation_executions` for 24h before enabling the next.
16. Monitor `/dashboard` operational panel — refresh every 30s; expect zero `system_errors_last_hour` in the first hour.
17. Review `/dashboard/bank` for any ambiguous matches accumulated.

### Rollback plan
- All migrations are additive; rollback = drop the new tables in reverse order or set `active=false` on settings rows.
- `automation_rules` rows can be set `active=false` to instantly halt the rule engine.
- e-conomic sync can be paused by clearing `api_token` (gates fail safely with `ECONOMIC_NOT_CONFIGURED`).

---

## 5. Outstanding — explicitly deferred

These were spec'd in Phase 7+ but require post-go-live work:
- Manual employee timer UI (server actions exist, no `/dashboard/time` page yet).
- E-conomic mark-paid voucher flow validation against a real `cashbookNumber` + `bankContraAccountNumber`.
- `new_customer` autopilot trigger is **not wired** to any creation path yet — customers are created from many places (mail bridge, manual UI, public portal, email intelligence). Add the call when a single canonical creation path is established.
- Autopilot UI (currently DB-only — operators must use SQL or manage rules through Supabase Studio).
- Forecast and AI insights are read-only; no scheduled refresh — they re-compute on every dashboard fetch.

---

## 6. Open known issues

- **Legacy `time_entries` table** (project-based timesheet, 0 rows, but referenced by `dashboard.ts`/`projects.ts`/`reports.ts`). Phase 7 added a separate `time_logs` table to avoid breaking the legacy module. Consolidate later.
- 109 uncommitted files at audit time — committed in this hardening pass.
