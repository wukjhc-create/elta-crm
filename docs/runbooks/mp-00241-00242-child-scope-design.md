# 00241 / 00242 — read scope on child tables

**Status 2026-10-29: 00240, 00241 and 00242 are APPLIED IN PROD and green** (see "PROD 2026-10-29" below). Staging was applied 2026-10-28.
- 00240 **applied on staging** 2026-10-28 (fingerprint diff = exactly the expected 16 objects, 0 row changes; scope-check 38/38, sql-probe 28/28, f1-check 17/17, mp-00239-rls-check 55/55, child probe 102/102).
- 00241 **applied on staging** 2026-10-28 (fingerprint diff = 5 SELECT policies replaced + `my_case_customer_ids()`, 0 row changes; child probe 102/102, sec-b7 18+12, document/fuldmagt/confirmation/mail-attachment/storage checks green; UI montør+portal-mail 80/80 — U142/U221 fixtures updated: a montør must be related to the customer, a foreign document is now invisible = "Dokument ikke fundet").
- 00242 **applied on staging** 2026-10-28 (fingerprint diff = 9 SELECT policies replaced (work_orders, case_notes, case_materials, case_other_costs, service_case_attachments, customer_tasks, invoices, invoice_lines, invoice_payments), `can_view_case_finance()` and `current_employee_id()` changed, 1 index; customer_tasks columns/FK/index identical, so §0a O5 parity was a no-op). Checks: child probe 102/102, f1-check 17/17 (stage-aware), scope 38/38, mp-00239 55/55, invoice-rls/payment-summary/work-orders-guard/time-logs/rejected-hours/dashboard-stats/cost-lockdown/assistant-case-scope/wo-profit green; UI sales+montør+economy 139/140, where U174 `fil_fjernet` is a test race (storage checked before the action removes the file; the test now checks after the audit row).
  - **Deviation found after apply:** 00242 created `idx_work_orders_assigned_employee`, which duplicates the existing `idx_work_orders_assignee` (00086) on `work_orders(assigned_employee_id)`. Functionally harmless (extra write cost). The line has been **removed** from the 00242 file and draft, so prod does not get the duplicate. Staging still has both until Henrik approves `DROP INDEX IF EXISTS public.idx_work_orders_assigned_employee` on staging.
  - **Staging cleanup (recorded separately, Henrik 2026-10-29):** `npx tsx scripts/test-harness/cli.ts staging-cleanup-00242-dup-index` ran `DROP INDEX IF EXISTS public.idx_work_orders_assigned_employee`. Before: `idx_work_orders_assigned_employee`, `idx_work_orders_assignee`. After: only `idx_work_orders_assignee`. The fingerprint diff was exactly 1 (`- indexes work_orders.idx_work_orders_assigned_employee`).
- Migration files: `supabase/migrations/00240_…`, `00241_…`, `00242_…` (body byte-identical to the tested drafts; 00242 minus the duplicate index, see above).

## PROD 2026-10-29 (Henrik: "00240 — APPROVED FOR PROD"; 00241/00242 conditional on the previous stage being fully green)

The committed files were run (git = HEAD) with these sha256 hashes:
- 00240: `234d524d…cb056`
- 00241: `0e4edcc0…2e108`
- 00242: `9edb8b59…0f32`, the corrected version with no duplicate line.

Each stage ran:
1. pre-fingerprint;
2. `prod:apply-migration -- <nr> --approved-by-henrik --dry-run` (ROLLBACK);
3. fingerprint, **identical**;
4. COMMIT;
5. post-fingerprint;
6. probes;
7. fingerprint again after the probes, **identical** (nothing left behind).

`prod-db-fingerprint.ts` was extended to cover indexes, permission_catalog, role_permission_defaults and child-table rows (incl. user_permission_overrides).

**Results:**

| Stage | Diff (prod) | Rows | Probe `prod-read-scope-effective.ts` |
|---|---|---|---|
| 00240 | = staging's 16 (2 SELECT policies replace 4, 2 functions, 3 indexes, 1 catalogue key, 4 role defaults) | only the 5 permission rows | [NY] 34/34 · [UÆNDRET] 7/7 |
| 00241 | 9 = staging's 11 minus the customer_notes pair (the table does not exist in prod, so no policy and no fallback) | 0 | [NY] 72/72 · [UÆNDRET] 15/15 |
| 00242 | 20 = 9 SELECT policies, `can_view_case_finance()`, `current_employee_id()`, **0 indexes** (only `idx_work_orders_assignee` on the work-order column) | 0 | [NY] 162/162 · [UÆNDRET] 33/33 |

All 16 scope policies are hash-identical to staging. The cumulative diff for 00240–00242 is 47 objects, and no business rows changed.

**Personas:**
- **Real profiles:** 3 admins and 2 montørs (one without an employee row).
- **Simulated on a montør profile:** salg, serviceleder and bogholderi, using the role's defaults as rollback overrides. These roles are NOT_TESTABLE_PROD as real profiles.
- Elektriker and Overmontør templates; inactive, missing profile and anon.

**Other checks (all green):**
- montør real data matches an independently computed scope (customers 2/2, cases 0/0 and 3/3);
- 0 child rows without a visible parent;
- 0 foreign work orders;
- B rule: write grants never reach hidden rows;
- function ACL authenticated only;
- no `USING (true)` SELECT/ALL policy on the 15 scope tables;
- views over scope tables are security_invoker;
- callable SECURITY DEFINER functions return only booleans or own scope;
- mp-00239 16/16+19/19, sec-b7 11/11+12/12, 00236–00238, 00185 personas, cost lockdown wave 2 post 38/38, rls-effective, waves 1–5 post.

**Script fixes (test expectations, not behaviour):**
- `prod-mp-00239-effective`: the seed case is assigned to the montør (within read scope).
- `prod-rls-effective`: `has_any_column_privilege`. With column-level SELECT, the expectation is the visible rows, not all rows.
- `prod-verify-rls-wave`: expects the replacing read policy instead of the old open one (`SELECT_REPLACED`).

**Generator guard (new):** `SELECT_REPLACED` in `write-matrix.ts`, together with `assertSelectNotReplaced` in `build-migration.ts` and `checkSelectReplacedGuard` in the `check:rls-matrix` gate, stops a regenerated write wave from recreating `<table>_select_authenticated USING (true)` next to the scope or cost policy. The gate also caught that roof_drawings and customer_tasks were missing from the list.

- Drafts: [`mp-00241-draft.sql`](mp-00241-draft.sql) (customer-keyed) and [`mp-00242-draft.sql`](mp-00242-draft.sql) (case-keyed + invoices + parity).
- Both require 00240 ([`mp-00240-draft.sql`](mp-00240-draft.sql)); the helpers `my_customer_scope_ids()` / `my_case_scope_ids()` come from there.
- Each needs its own approval per environment. Order: CODE → TEST → PUSH → MIGRATION → POST-CHECK; 00240 first.

## Approved rules (Henrik 2026-10-27)

| Area | Rule | Where in SQL |
|---|---|---|
| **O1** work orders | Montør/Elektriker: **only their own** (assigned to their own employee row), even when they can see the case. Overmontør (`work_orders.view.all`), admin and serviceleder: all. Roles without `work_orders.view.*` (salg, bogholderi): orders on cases in their case scope. Bogholderi has `cases.view.all`, so it sees all, including case-less orders. | 00242 §1 |
| **O2** tasks | Own tasks (assigned/created; requires `tasks.menu`, so inactive users see nothing). Tasks on a case in my scope (the case's task tab). `customers.view.all` sees all, as through the customer tab today. Montør gets **no** global task list. D3: only an OPEN task creates a customer relation (00240). | 00242 §3 |
| **O3** documents | On a case: case scope. Without a case: `customers.view` + customer in scope + CU-1 (`cases.view.all` \| `customers.edit` \| the customer has a case in my scope). A mail attachment additionally requires `customers.emails.view`. `customer_id` is NOT NULL, so "neither customer nor case" cannot occur. | 00241 §4 |
| **O4** confirmations | On a case: case scope. Without a case: the document must be visible (EXISTS as invoker). An unknown parent is denied (fail-closed). | 00241 §6; app: `document-confirmations.ts` |
| **O5** parity | `customer_tasks.service_case_id` is identical in prod and staging: uuid NULL, FK `→ service_cases(id) ON DELETE SET NULL`, partial index `idx_customer_tasks_service_case`. Rows set: prod 6/28, staging 48/120. It is in **no** migration file. 00242 §0a is idempotent: a no-op where it matches, and the guard stops on a different type or FK. Old migrations are not rewritten. | 00242 §0a |
| **O6** contacts | Follow the parent customer's effective scope. Montør/Elektriker: only contacts of customers they can currently see. Salg/admin/serviceleder/bogholderi: all (`customers.view.all`). No hidden global directory: the readers (mail recipients, route resolver, CTI lookup, contact picker) stay on the user client, so RLS limits them. | 00241 §2 |
| **F1** invoices | `invoices.view.all` → all. `invoices.view.own_cases` → only invoices on cases in my **effective** case scope (D4 included). Case-less invoices only with view.all. Lines and payments follow the invoice. `can_view_case_finance()` follows the same rule. Never cost, margin, payroll or purchase price (invoice tables have none). | 00242 §4; app: `lib/invoices/invoice-scope.ts` |

Additionally in 00242:
- `current_employee_id()` becomes deterministic (oldest active row, the same as the app's scope engine). Before, it was `LIMIT 1` without `ORDER BY`. Prod has 0 profiles with duplicate active rows, so the issue is latent.
- One index: `customer_tasks.assigned_to` (already in prod under the same name, so a no-op there). `work_orders.assigned_employee_id` is already covered by `idx_work_orders_assignee` (00086).

## Test: `mp-00241-00242-sql-probe` (staging, rollback-only) — 101/101

- 00240, 00241 and 00242 run in **one** DO block that always aborts.
- Child fixtures are created inside the block. Fingerprint (policies, functions, indexes, column) identical before and after.
- Personas: admin, bogholderi, salg (D4), montør, Elektriker, Overmontør, inactive, anon.
- 12 tables: contacts, customer notes, documents, roof drawings, confirmations, work orders, case notes, case attachments, tasks, invoices, invoice lines, payments.
- Every persona sees **exactly** the expected fixture rows.
- **PARITY:** montør's documents in RLS == the app's `customerDocumentReadDenied` (7/7).
- **Performance** (count(*) over the whole table):
  - montør: documents 13.5 ms, contacts 5.3 ms, tasks 3.2 ms.
  - salg: ≤ 6.9 ms.
  - admin, documents: 139 ms. That is the full scan of a large staging document table, not the policy; admin's branches are InitPlans.

## App prerequisites (done, commit 8097cf71 + follow-up)

- **F1:** case invoice list and history, customer invoice overview, payment status, portfolio, billing follow-up and dashboard numbers. All use own_cases + scope. Admin reads only after the scope check, limited to the scope's cases. The PDF route's API-1 RLS check was removed, since the lists now show the same invoices.
- **L1 (leak):** task and inbox mail could attach any of the customer's documents. Now `customerDocumentReadDenied` is checked per document.
- **O4:** case-less confirmations check the document's customer scope (before: no scope check).
- **Reads RLS would cut:**
  - besigtigelse auto-close and the customer flow read tasks/documents with admin after the scope check (status only out).
  - The customer flow also got a customer scope check.
  - Mine timer looks up the job name for your own hours (on a colleague's order).
- **P6:** besigtigelse booking (`customers.edit`) and document delete (`documents.delete`) also check scope (PERM-1 grants).

## Known differences/follow-ups (not blockers for 00241/00242)

1. **Customer list with payment columns + CSV export** (`v_customers_with_payment_summary`, security_invoker): salg sees invoices only on cases salg created until 00242 changes `invoices` RLS. After 00242 this is correct with no app change. It shows fewer, never more.
2. **`time_logs`** (`can_view_time_log`: salg = created_by, role-keyed): not part of 00242. Salg's billing status reads hours with admin after the scope check. Direct REST still follows the old rule (narrower, not a leak).
3. **audit_logs invoice history:** RLS shows non-admin users only their own events. Unchanged (not widened).
4. **Email linker on the cron path** (`email-sync-orchestrator` → `linkEmail` with `createClient()` without a session = anon) when `MAIL_AUTOLINK` is off. It finds no customers and is already broken today, independent of 00240. Should use the admin client (system matching that returns nothing to a user). Not changed, because it is live mail logic.
5. **Task list W-8** decides montør's scope with `role === 'montør'`, not a permission. Elektriker/Overmontør (base role montør) get only their own tasks in the list. RLS (O2) is wider, so it drops nothing.

## Order / readiness

1. Push code (requires a green UI regression, currently blocked by RAM on the development PC).
2. 00240 staging: fingerprint → dry run (ROLLBACK) → apply → post-check. **Approved for staging when the conditions are met.**
3. 00241 + 00242 staging: **requires Henrik's separate approval.** Run `mp-00241-00242-sql-probe` again right before.
4. Prod for each migration: separate approval.
