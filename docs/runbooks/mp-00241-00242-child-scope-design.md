# 00241 / 00242 — read scope on child tables (DESIGN — no SQL written, nothing applied)

**Status 2026-10-27:** design and inventory only. This follows 00240 (D6: separate migrations).
- Builds on the 00240 helpers `my_customer_scope_ids()` / `my_case_scope_ids()` from [`mp-00240-draft.sql`](mp-00240-draft.sql).
- Those helpers do **not** contain the `*.view.all` branch, so every child-table policy ORs in `user_has_permission('customers.view.all' | 'cases.view.all')` itself.
- Requires 00240 to be applied first.

**Principle:** each RLS predicate **follows the app's existing rule** for the table; it does not invent a new one. Where the app rule is narrower than "parent in scope", the table is marked **NARROWER**.

**Who actually loses rows** (no overrides):
- On customer-keyed tables only montør/Elektriker lose rows, because salg/bogholderi have `customers.view.all`.
- On case-keyed tables, salg and montør both lose rows.

## 00241 — customer-keyed

| Table | Today | Proposed SELECT | App rule / note |
|---|---|---|---|
| `customer_contacts` (customer_id NOT NULL) | `true` (00170) | `customers.view.all OR customer_id = ANY(my_customer_scope_ids())` | Case parties are already in customer scope. Ungated readers `mail-recipients.ts:72`, `mail-route-resolvers.ts:584` and `relatel/lookup.ts:41` will return fewer rows for restricted users (**O6**) |
| `customer_notes` (customer_id NOT NULL) | `true` (00196) | same | Montør cannot write notes, so there is no RETURNING risk |
| `customer_documents` (customer_id NOT NULL, service_case_id nullable) | `true` (00170) | `cases.view.all OR (service_case_id = ANY(my_case_scope_ids())) OR (service_case_id IS NULL AND ((customers.edit AND (customers.view.all OR customer_id = ANY(my_customer_scope_ids()))) OR EXISTS (case in my_case_scope_ids with s.customer_id = customer_documents.customer_id)))` | **NARROWER**. Matches CU-1/SEC-5 (`customer-documents.ts:96-117`, `besigtigelse.ts:36`). CU-1 uses only `service_cases.customer_id` (not the 6 party FKs or D3) (**O3**). `source_email_id` rows are hidden in the app without `customers.emails.view`; RLS optional (**O3**). Fuldmagt masking stays in the app (column level) |
| `roof_drawings` (customer_id NOT NULL, service_case_id nullable) | `true` (00173) | `(service_case_id IS NOT NULL AND (cases.view.all OR service_case_id = ANY(my_case_scope_ids()))) OR (service_case_id IS NULL AND (customers.view.all OR customer_id = ANY(my_customer_scope_ids())))` | Matches F4 plus the 2026-10-27 customer-scope fix (`roof-drawings.ts`). All 5 prod drawings are case-less, so montør keeps them only through customer scope |
| `document_confirmations` (customer_document_id NOT NULL, service_case_id nullable; token column already REVOKEd 00177) | `true` (00173) | `(service_case_id IS NOT NULL AND (cases.view.all OR service_case_id = ANY(my_case_scope_ids()))) OR (service_case_id IS NULL AND EXISTS (SELECT 1 FROM customer_documents d WHERE d.id = customer_document_id))` (the EXISTS runs as invoker, so it inherits the document rule) | Case-less confirmations are **stricter** than today's app gate (`service.view` alone) (**O4**). Portal/token flows use service role and are unaffected |

## 00242 — case-keyed

| Table | Today | Proposed SELECT | App rule / note |
|---|---|---|---|
| `work_orders` (case_id/customer_id nullable, assigned_employee_id) | `true` (00181) | `work_orders.view.all OR cases.view.all OR assigned_employee_id = current_employee_id() OR (NOT work_orders.view.assigned AND case_id = ANY(my_case_scope_ids())) OR (case_id IS NULL AND customer_id = ANY(my_customer_scope_ids()))` | **NARROWER for montør** (only own orders, = `listWorkOrdersForCase` / `getWorkOrderEmployeeScope`). Salg and others without `work_orders.view.*` see orders on cases in scope (the order header count, economy). The negative permission condition needs a decision (**O1**). The montør header badge becomes "my orders" |
| `case_notes` (case_id NOT NULL) | `true` (00073) | `cases.view.all OR case_id = ANY(my_case_scope_ids())` | = `getCaseNotes`. No risk |
| `case_materials`, `case_other_costs` (case_id NOT NULL) | `true` (00173) | same | = `listCaseMaterials` / `listCaseOtherCosts` (no work-order restriction). Salg's unbilled-work and close-readiness counts shrink to scope (consistent) |
| `service_case_attachments` (service_case_id NOT NULL) | `true` (00173) | `cases.view.all OR service_case_id = ANY(my_case_scope_ids())` | All app reads use the admin client behind `handoverAccess`. This only closes the direct-REST hole |
| `customer_tasks` (customer_id NOT NULL, service_case_id, assigned_to, created_by) | `true` (00173) | `assigned_to = auth.uid() OR created_by = auth.uid() OR (tasks.view AND customers.view.all) OR customer_id = ANY(my_customer_scope_ids()) OR (service_case_id IS NOT NULL AND service_case_id = ANY(my_case_scope_ids()))` | **The app rules disagree with each other.** Global list W-8 is role-keyed `role === 'montør'` → assigned only; customer tab TK-5 → all of the customer's tasks; case tab TK-4 → all of the case's tasks; besigtigelse auto-close (`besigtigelse.ts:451`) reads all open tasks on the customer. A strict W-8 in RLS would break three flows (**O2**). `customer_tasks.service_case_id` has schema drift: it is in prod but in no migration file (**O5**) |

## Cross-cutting

- **Embed nulls:** once a task is `done`, D3 no longer grants its customer, so a montør's finished tasks show the customer embed as `null`. UI fallback "Kunde skjult" needed before 00242 (code only).
- **Counts change** (expected, no leak): order header badge, task badge, close-readiness, unbilled work, economy for users without `cases.view.all`.
- **Performance:** each policy evaluates one InitPlan per statement (same mechanism as 00240; probe: <7 ms on staging). Double work where the app already filters (besigtigelse, roof drawings) is harmless.
- **Tests:** extend `mp-00240-sql-probe` with child-table assertions (DB == app rule per table, including the NARROWER cases). Use the same rollback-only DO block.

## Open decisions (Henrik)

- **O1** `work_orders`: should montør see only their own orders (as the app does; needs the condition "without `work_orders.view.assigned`" so salg sees orders on cases in scope), or every order on cases in scope?
- **O2** `customer_tasks`: should RLS follow "own + customer/case in scope" (proposed; matches all current reads), or should a strict W-8 be enforced? Strict W-8 first requires changing the customer tab, the case tab and the besigtigelse auto-close. Also: the montør rule should become a permission, not `role === 'montør'`.
- **O3** Case-less `customer_documents`: keep CU-1 narrow (case customer only), or widen to `my_customer_scope_ids()` (6 party FKs + work order + open task)? Should `source_email_id` hiding also be enforced in RLS?
- **O4** Case-less `document_confirmations`: tighten from `service.view` alone to the document rule?
- **O5** Add an idempotent `ADD COLUMN IF NOT EXISTS customer_tasks.service_case_id` (+ FK) to 00242 so the migrations match prod?
- **O6** Ungated user-client contact readers (mail recipients / route resolver / CTI): accept fewer rows, or move them to the admin client with an explicit scope check?
