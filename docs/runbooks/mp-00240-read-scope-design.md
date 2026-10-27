# 00240 — Read scope for customers + service_cases (DESIGN / INVENTORY — not written, not applied)

**Status:** DESIGN PROPOSAL 2026-10-27, awaiting Henrik's decisions (§9). No migration file exists yet.
Nothing applied to staging or prod. Order once approved: CODE (§6) → TEST → PUSH → MIGRATION staging → … → prod
(separate approval per migration).

## 1. Current state (staging = prod after 00239)

| Table | SELECT policies today | Effect |
|---|---|---|
| customers | `Users can read their own customers` (created_by = uid), `Users can see their own customers` (true), `Users can view customers` (true) | every `authenticated` incl. **inactive/missing profile** reads all 1.9k (staging) / 117 (prod) customers |
| service_cases | `Authenticated users can view service cases` (true) | same, all cases |

Child tables are also `USING (true)`: work_orders, customer_contacts, customer_documents, customer_notes,
customer_tasks, case_notes, case_materials, case_other_costs, service_case_attachments, offers, offer_line_items,
roof_drawings, email_threads, sms_messages, document_confirmations, projects, leads. (Already scoped: invoices /
invoice_payments via `can_view_case_finance`, incoming_emails via 00180/00186, time_logs via `can_view_time_log`,
calculations/kalkia/quick_jobs = cost roles, employees = admin/serviceleder/self, messages = own.)

**App-layer scope already exists for cases** (`src/lib/auth/case-scope.ts`, ~45 callers):
`cases.view.all` → all; `cases.view.assigned` → `created_by = me OR assigned_to = me OR` a non-cancelled
`work_orders` row with `assigned_employee_id` = my active `employees` row. **There is no customer scope** —
`customers.view` is granted to all five roles and lists/search/counts return the whole register.

Existing SECURITY DEFINER helpers: `user_has_permission` (fail-closed: inactive/missing → false),
`user_role`, `current_employee_id`, `user_can_see_case` (assigned/created/WO — **no permission check, includes
cancelled WOs**; used by incoming_emails), `montor_has_customer_job` (WO on case of the customer),
`can_view_case_finance`, `can_view_time_log`.

Prod data shape (`scripts/prod-read-scope-shape.ts`, aggregates only): 3 admin + 2 montør, 0 overrides,
117 customers (115 created by admin, 2 by montør), 8 cases (all created/assigned admin), 3 work orders (all
planned, all with case, customer = case customer), **3 tasks assigned to montør of which 2 are on customers with
no case/WO relation**, 5 roof drawings — **all without case**, 1 case with a different party customer.

## 2. Schema relationships (real FKs — the only relation sources used)

- `service_cases` → customers: `customer_id`, `site_customer_id`, `payer_customer_id`, `orderer_customer_id`,
  `end_customer_id`, `purchased_from_customer_id`; → profiles: `created_by`, `assigned_to`; → employees: `formand_id`.
- `work_orders`: `case_id`, `customer_id`, `assigned_employee_id` → employees(`profile_id`, `active`), `status`.
- `customer_tasks`: `customer_id`, `service_case_id`, `offer_id`, `assigned_to`, `created_by`.
- `customers.created_by`; `offers.created_by` + `customer_id/payer/orderer/end_customer_id`,
  `converted_case_id`, `source_case_id`.
- Inspections (besigtigelse) are `customer_documents` / `document_confirmations` / `customer_tasks` rows, not a table
  of their own; planned jobs = `work_orders.scheduled_date`. No separate "assignment" table exists.

## 3. Inventory result (≈400 read sites in 107 files; 4 read-only sweeps, full per-site tables in the session log)

Totals by class: **A** user-facing scoped ≈ 55 % · **B** controlled/internal (mostly admin client: cron, portal,
partner, agents, e-conomic, invoices, mail routing) ≈ 30 % · **C** global operational for all-scope roles
(finance, accounting, planning, reports, proposals, purchase operations) ≈ 10 % · **D** accidental broad ≈ 5 %.

### 3.1 Class D today (fixed by 00240)
- Montør/any role lists/searches the full customer register: `getCustomers` (customers.ts:107/112),
  `getCustomersForSelect` (offers.ts:1324, tasks page), `getCustomersForOrderSelect` (service-cases.ts:1269),
  `searchCustomersForSite` (service-case-site.ts:433), Ctrl+K (command-palette.tsx:125), `globalSearch`
  customers (search.ts:42, `count: exact`), `getRelatedEntities` (messages.ts:435), CTI lookup
  (relatel/lookup.ts:40/59 — also open cases of other customers).
- Company-wide counts for any role: dashboard.ts:105-107, api/dashboard/stats:121, customers.ts:42.
- `customer-flow.ts:78` shows status of all the customer's cases (no case filter).
- `quote-actions.ts:289 getCustomerForQuote` has **no permission gate** (any login reads any customer's contact data).
- `exportPaymentFollowupAction` (invoices.ts:2427, salg) exports all customers' payment state via the
  security_invoker view; `getBillingFollowupSummaryAction` (service-case-economy.ts:1076) counts all closed cases.
- `invoices.ts:1434 listCaseInvoicesAction` / `:2241` accept any caseId/customerId for salg (no scope check).
- `besigtigelse.ts:534 sendBesigtigelsePdf`: case-less document → any customer.

### 3.2 Global lookups on the USER client (must move to a controlled path BEFORE scoping a creator)
1. **Customer number** `generateNextCustomerNumber` (customer-number.ts:55, top-20 visible C-numbers) +
   UNIQUE `customers_customer_number_key` → a scoped creator recomputes the same number on every retry →
   all 10 attempts 23505 → "Kunne ikke oprette kunde". Callers: createCustomer, quickCreateCustomer,
   quickCreateCustomerAndOffer, convertLeadToCustomer, import, createCustomerFromEmail, create-from-email.
2. **Email/phone/name dedupe**: `findCustomerByEmail` (customer-email.ts:46), insert race re-check
   (customer-number.ts:170), `checkDuplicateCustomer` (customers.ts:399), import (customer-import.ts:34/125),
   lead dedupe (lead-duplicates.ts:40/53/66), leads.ts:715/740, updateCustomer (customers.ts:743) → silent
   duplicates (there is no unique index on email).
3. **Offer → case idempotency**: services/offer-to-case.ts:39/176 and actions/offer-to-case.ts:50/132 look up
   `source_offer_id` (UNIQUE `uq_service_cases_source_offer_id`) → a case converted by someone else is invisible →
   UI offers "Opret sag" again → 23505 → "Kunne ikke oprette sag".
4. Email → customer matching: service-cases.ts:638 (createServiceCaseFromEmail), quote-actions.ts:184,
   customer-mailbox.ts:80, mail-detail.tsx:208, customer-link-dialog, email-linker (inbox roles only today).

### 3.3 Fail-OPEN guards that rely on an embed/row being visible (must become fail-closed first)
- `time-approval.ts:141` caseClosed() on a null `case` embed → approves time on closed cases.
- `work-orders.ts:384` closed/proposal guard; `time-logs.ts:266/470` case status embed.
- `cases/cost-row-guards.ts:18` caseIsClosed → "not closed" when invisible.
- `invoices/vat-guard.ts:43` (admin client today — safe, but treats invisible as 25 %).

### 3.4 Flows that break if montør SELECT were restricted TODAY with a naïve rule (`case.customer_id` only)
- **Case parties**: case detail party panel (service-cases.ts:208-215, 5 embeds), `resolveCaseParties`
  (services/case-parties.ts:137) → besigtigelse report signer/payer/site address, signer summary, sequential send,
  fuldmagt (fuldmagt.ts:72 "Kunde ikke fundet"), besigtigelse recipients/sends (besigtigelse.ts:841-844, 1080,
  1142), mail recipients site customer (mail-recipients.ts:141). → **RELATED must include all 6 party FKs.**
- **Tasks assigned to montør** on customers without case/WO (prod: 2 of 3): task list / reminders / dashboard
  lose customer name, phone, address; customer link 404s (customer-tasks.ts:256/427, dashboard-overview.ts:258/674,
  dashboard.ts:372).
- **Customers the montør created** (prod: 2) → card 404 unless `created_by = me` is included.
- **Roof drawings**: all 5 prod drawings are case-less → montør (customers.view + roof read) sees the drawing
  but not its customer. (roof_drawings SELECT is still `true`.)
- Cancelled work orders still in calendar/my-hours ranges: case label blank (my-hours.ts:42, work-orders.ts:710) —
  cosmetic, matches FW-11 (cancelled WO gives no access).
- **Mine job / planning / tasks / inspections**: OK under the rule below (WO-assigned cases + their parties).

### 3.5 Flows that break if SALG customers were restricted to own+related (decisive for §4)
- Sending its own offers: `sendOfferEmail` (email.ts:755 → "Kunde har ingen e-mail adresse"),
  `resolveOfferMailRoute` (mail-route-resolvers.ts:439), preview (email.ts:600), offer PDF recipient block
  (api/offers/[id]/pdf:57), webhook/order export payload (webhook-dispatch.ts:184), vat_mode inheritance
  (offer-number.ts:70, offers.ts:677 — silently 25 %).
- Pickers: offer form customer picker (customers.ts:1194), offer parties (offer-parties.ts:449 "Valgt kunde findes
  ikke"), new-case picker, lead linking, dashboard "new customers" card (dashboard-overview.ts:633/647).
- Every dedupe in §3.2 → duplicates.
Salg legitimately works across the register (web/auto-created leads → customers created by the system, offers on
customers others created). → **Recommendation: salg customers = ALL.**

## 4. Proposed scope definitions

Every predicate goes through `user_has_permission` (effective: role ∪ grants − revokes; inactive/missing → false).
**Nothing is keyed on `profiles.role`** (Overmontør = montør + grants must work).

**ALL (cases)** = `user_has_permission('cases.view.all')` (existing key).
**ALL (customers)** = `user_has_permission('customers.view.all')` (**new key**, §5).

**OWN case** = `cases.view.assigned` AND (`created_by = auth.uid()` OR `assigned_to = auth.uid()`).
**RELATED case** = `cases.view.assigned` AND EXISTS non-cancelled `work_orders` on the case with
`assigned_employee_id = current_employee_id()` (active employee row). = exactly today's `getCaseScope`.
(Optional D4: `source_offer_id` ∈ offers created by me — salg's offer converted by serviceleder.)

**OWN customer** = `customers.view` AND `created_by = auth.uid()`.
**RELATED customer** = `customers.view` AND any of:
1. the customer is one of the 6 party columns of a case in my case scope (OWN ∪ RELATED case);
2. `work_orders.customer_id` of a non-cancelled WO assigned to my employee row;
3. (D3) `customer_tasks.customer_id` of a task with `assigned_to = auth.uid()` (open tasks only? see §9).
Proposals (`is_proposal`) follow the same rules (they are created by service-role → admin/serviceleder only).

Fail-closed: no `customers.view` / `cases.view.assigned` → nothing; inactive or missing profile → nothing; anon → no
policy (and no GRANT change).

## 5. Recommended role / template matrix (no overrides)

| Base role / template | customers | service_cases | Keys (after 00240) |
|---|---|---|---|
| admin | ALL | ALL | customers.view.all, cases.view.all |
| serviceleder | ALL | ALL | same |
| bogholderi | ALL (finance/e-conomic/accounting names, payment views) | ALL (existing cases.view.all) | same |
| salg | **ALL** (§3.5) | **OWN (+ D4)** — = today's app scope; DB now matches | customers.view.all; cases.view.assigned |
| montør | OWN + RELATED | OWN + RELATED (WO) | customers.view, cases.view.assigned |
| Elektriker (montør + customers.create, cases.create) | OWN + RELATED — creating does **not** broaden reading beyond rows it created itself | OWN + RELATED | unchanged |
| Overmontør (template already grants cases.view.all, work_orders.plan, calendar.view.all, time_logs.approve) | **ALL** — proposed: add `customers.view.all` to the template (planning backlog/picker embeds customers of all cases) | ALL (existing grant) | template +customers.view.all |

`customers.view.all` is not matched by `SENSITIVE_PERMISSION_PATTERNS`; catalogue change = 1 new key
(catalog row + 4 role defaults: admin, serviceleder, bogholderi, salg) — shown to Henrik before writing.
Net change vs today: **only montør (and Elektriker) lose rows**; salg loses only cases outside its own scope
(the app already hides them); admin/serviceleder/bogholderi/Overmontør unchanged.

## 6. Code changes required BEFORE the migration (CODE → TEST → PUSH, then 00240)

1. **Customer number** → `next_customer_number()` SECURITY DEFINER (returns only the next C-number; EXECUTE for
   authenticated gated inside by `user_has_permission('customers.create')`; REVOKE PUBLIC/anon) — or a sequence.
   `generateNextCustomerNumber` calls it for user clients.
2. **Dedupe** → one server-side `findCustomerDuplicate(...)` on the admin client behind `customers.create`/
   `customers.edit`; for callers without `customers.view.all` it returns only `{ exists, customer_number }`
   (no name/contact leak). Used by findCustomerByEmail, race re-check, checkDuplicateCustomer, import, lead
   dedupe, leads convert, updateCustomer.
3. **Offer → case idempotency** (services/offer-to-case.ts:39/176, actions/offer-to-case.ts:50/132) → admin lookup
   by `source_offer_id`, after the existing offer-scope check; return "already converted (case X)" when invisible.
4. **Fail-closed guards** §3.3: null/invisible case → deny ("Sagen findes ikke eller er ikke i dit scope").
5. **App-layer customer scope** `src/lib/auth/customer-scope.ts` (`getCustomerScope`, `userCanViewCustomer`) mirroring
   the DB predicate — used where the admin client reads customers for a user (Telegram assistant
   resolve-target/run-command:197 count, handle-update:103) and in `quote-actions.ts:289` (add gate).
6. Scope-check the D-class finance paths (invoices.ts:1434/2241 → userCanViewCase / customer scope).
7. Email→customer matching for case-from-email (service-cases.ts:638) → controlled lookup (inbox roles only).
No change needed (verified A under the rule): getCaseScope/userCanViewCase (rows in scope by definition), Mine job
(api/calendar/my-jobs → work-orders), planning (cases.view.all/work_orders.plan), invoices/accounting (all-scope
roles), portal/partner/cron/agents/e-conomic (admin client), INSERT … RETURNING (created_by = me is OWN).

## 7. Migration design (00240, single transaction)

1. Guard: `customers.view.all`, `customers.view`, `cases.view.all`, `cases.view.assigned` exist in
   `permission_catalog`; abort otherwise.
2. Catalogue: insert `customers.view.all` + role defaults (admin, serviceleder, bogholderi, salg).
3. Helpers (SECURITY DEFINER, STABLE, `SET search_path = public, pg_temp`, REVOKE ALL FROM PUBLIC, anon,
   authenticated; GRANT EXECUTE TO authenticated):
   - `case_in_my_scope(p_case_id uuid, p_created_by uuid, p_assigned_to uuid) → boolean` (OWN ∪ RELATED; no
     row re-read for OWN; WO EXISTS via `current_employee_id()`).
   - `customer_in_my_scope(p_customer_id uuid, p_created_by uuid) → boolean` (OWN ∪ RELATED 1–3).
4. Policies:
   - customers: DROP the 3 SELECT policies; CREATE `customers_select_scope` FOR SELECT TO authenticated USING
     `(SELECT user_has_permission('customers.view.all')) OR customer_in_my_scope(id, created_by)`.
   - service_cases: DROP `Authenticated users can view service cases`; CREATE `service_cases_select_scope` USING
     `(SELECT user_has_permission('cases.view.all')) OR case_in_my_scope(id, created_by, assigned_to)`.
   (Write policies from 00239 unchanged. UPDATE/DELETE now additionally require visibility — admin/serviceleder
   have ALL, so no effect.)
5. Indexes if missing (checked at write time): `work_orders(assigned_employee_id, case_id)`,
   `work_orders(customer_id)`, `service_cases(created_by)`, `(assigned_to)`, the party FK columns,
   `customer_tasks(assigned_to)`.
6. `NOTIFY pgrst, 'reload schema'`; COMMIT.

**Rollback** (comment block in the file): drop the two new policies; recreate the 4 old SELECT policies verbatim;
drop the 2 helpers; delete the `customers.view.all` catalog/default rows (+ any overrides of it). Rollback restores
the previous broad `authenticated` read (incl. inactive profiles) — it never touches anon.

**Out of 00240 (requirement 3 caveat):** child tables in §1 stay `USING (true)`. A montør could still read a hidden
customer's contacts/documents/notes/work orders via REST. Proposed follow-up waves using the same helpers:
00241 customer_contacts + customer_notes + customer_documents + roof_drawings; 00242 work_orders + case_notes +
case_materials/other_costs + service_case_attachments + customer_tasks; offers/leads with the offer scope (API-2).

## 8. Tests

- `mp-00240-rls-check` (staging, real sessions): personas admin/serviceleder/bogholderi/salg/montør + temp montør
  with: WO assigned (planned/done/**cancelled**), case as each of 6 party roles, created customer, assigned task,
  nothing; inactive; missing profile; anon. Per persona: row visibility for SELECT by id, list, `count: exact`
  (head) = expected related count (no count leak), embeds from offers/work_orders/tasks return null for hidden
  rows, INSERT…RETURNING of own new row works. Overrides: grant customers.view.all / cases.view.all → ALL;
  revoke → back; Elektriker template → no broader read; Overmontør template → ALL; revoke customers.view → none.
- Code-path tests: customer number with a scoped Elektriker session (no 23505 loop), dedupe finds hidden duplicate
  without leaking its name, offer→case on an already-converted offer, fail-closed guards.
- UI: `harness:ui-full -- sales,montor` + new U-tests: montør Mine job, task list with customer, case detail
  parties, besigtigelse send/fuldmagt, Ctrl+K/search/pickers show only scoped; salg create customer/offer/send.
- Prod: rollback-only effective probe (like prod-mp-00239-effective) with real admin + montør; serviceleder/salg/
  bogholderi NOT_TESTABLE_PROD.

## 9. Decisions needed from Henrik

- **D1** Salg customers = ALL (recommended) vs own+related (breaks §3.5 unless every offer path is re-routed).
- **D2** New key `customers.view.all` (admin, serviceleder, bogholderi, salg) — approve catalogue change.
- **D3** Customers of tasks assigned to me count as RELATED (recommended; prod 2 of 3 montør tasks) — all tasks or
  only open (`status <> 'done'`)?
- **D4** Salg case scope: keep today's OWN, or add cases converted from offers salg created.
- **D5** Overmontør template + `customers.view.all` (recommended).
- **D6** Child-table waves (00241/00242) after 00240, or bundle into 00240 (bigger blast radius; not recommended).
