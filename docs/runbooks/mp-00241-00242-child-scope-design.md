# 00241 / 00242 — read scope on child tables

**Status 2026-10-28:** Henrik approved 00240 → 00241 → 00242 for **staging** (each only after the previous stage is verified green). **Prod requires separate approval per migration.**
- 00240 **applied on staging** 2026-10-28 (fingerprint diff = exactly the expected 16 objects, 0 row changes; scope-check 38/38, sql-probe 28/28, f1-check 17/17, mp-00239-rls-check 55/55, child probe 102/102).
- Migration files: `supabase/migrations/00240_…`, `00241_…`, `00242_…` (body byte-identical to the tested drafts).

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
- Two indexes: `customer_tasks.assigned_to` and `work_orders.assigned_employee_id`.

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
