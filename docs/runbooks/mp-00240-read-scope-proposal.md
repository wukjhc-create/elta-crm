# 00240 — FINAL PROPOSAL: read scope for customers + service_cases

**Status (2026-10-27):** PROPOSAL + SQL DRAFT. **Not applied anywhere.** Nothing is in `supabase/migrations`.
- SQL draft: [`mp-00240-draft.sql`](mp-00240-draft.sql)
- Decisions D1–D6: approved by Henrik 2026-10-27
- Inventory and background: [`mp-00240-read-scope-design.md`](mp-00240-read-scope-design.md)
- One semantic model for both the app and RLS: `src/lib/auth/scope-model.ts`

**Order:** CODE (✅ commit 4c543544) → TEST → PUSH → **staging apply (needs approval)** → staging tests + UI → prod
pre-check → **prod apply (separate approval)** → post-check.

## 1. Scope matrix — before → after (no overrides)

| Role / template | customers before | customers after | service_cases before (DB) | service_cases after (DB) |
|---|---|---|---|---|
| admin | all | **ALL** (`customers.view.all`) | all | **ALL** (`cases.view.all`) |
| serviceleder | all | **ALL** | all | **ALL** |
| bogholderi | all | **ALL** | all | **ALL** |
| salg | all | **ALL** (D1) | all (the app showed OWN) | **OWN + RELATED**: created_by / assigned_to me + **D4** (case converted from my own offer) + non-cancelled work order assigned to me |
| montør | all | **OWN + RELATED** | all (the app showed OWN+WO) | **OWN + RELATED** |
| Elektriker (montør + customers.create, cases.create) | all | **OWN + RELATED**. Create permissions do NOT widen read scope; a row I create myself becomes OWN | all | **OWN + RELATED** |
| Overmontør (template) | all | **ALL**. The template gets `customers.view.all` (D5) | all | **ALL** (template already has `cases.view.all`) |
| inactive / missing profile | **all (!)** | **NONE** | **all (!)** | **NONE** |
| anon | none | none (unchanged) | none | none |

**Definitions** (also in `scope-model.ts`):

- **OWN customer** = `customers.view` ∧ `created_by = me`.
- **RELATED customer** = `customers.view` ∧ (any of the following):
  1. the customer is any of the case's 6 party FKs (`customer_id`, `site_customer_id`, `payer_customer_id`, `orderer_customer_id`, `end_customer_id`, `purchased_from_customer_id`) on a case in my case scope;
  2. `work_orders.customer_id` on a work order assigned to my **active** employees row with `status ≠ cancelled`;
  3. `customer_tasks.customer_id` on a task with `assigned_to = me` and `status IN ('pending','in_progress')`.
     - `customer_tasks_status_check` allows only pending | in_progress | done.
     - A done task alone grants nothing (D3).
     - Visibility through a case or work order is unaffected.
- **OWN case** = `cases.view.assigned` ∧ (`created_by = me` ∨ `assigned_to = me`).
- **RELATED case** = `cases.view.assigned` ∧ (any of the following):
  - a non-cancelled work order assigned to my active employees row;
  - D4: `service_cases.source_offer_id` → `offers.created_by = me`. This is the canonical link: UNIQUE `uq_service_cases_source_offer_id`; prod/staging: `offers.converted_case_id` matches 8/8.
- **ALL** = `customers.view.all` / `cases.view.all`, always through `user_has_permission` (role ∪ grants − revokes; inactive/missing → false).

## 2. SQL (draft) — exact objects

**Policies:**

```sql
-- customers (replaces "Users can read their own customers", "Users can see their own customers", "Users can view customers")
CREATE POLICY customers_select_scope ON public.customers FOR SELECT TO authenticated USING (
  (SELECT public.user_has_permission('customers.view.all'))
  OR ((SELECT public.user_has_permission('customers.view')) AND created_by = (SELECT auth.uid()))
  OR id = ANY ((SELECT public.my_customer_scope_ids())::uuid[]));

-- service_cases (replaces "Authenticated users can view service cases")
CREATE POLICY service_cases_select_scope ON public.service_cases FOR SELECT TO authenticated USING (
  (SELECT public.user_has_permission('cases.view.all'))
  OR ((SELECT public.user_has_permission('cases.view.assigned')) AND (created_by = (SELECT auth.uid()) OR assigned_to = (SELECT auth.uid())))
  OR id = ANY ((SELECT public.my_case_scope_ids())::uuid[]));
```

**Helpers:** `my_case_scope_ids() → uuid[]` and `my_customer_scope_ids() → uuid[]`. Full bodies are in the draft. Their properties:
- `STABLE SECURITY DEFINER SET search_path = public, pg_temp`
- `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO authenticated`
- They return only ids the caller is allowed to see, so calling them via RPC leaks nothing.

**Catalog:**
- `permission_catalog += customers.view.all`
- defaults: admin, bogholderi, salg, serviceleder (= `permissions.ts`)
- Overmontør gets the key through its template overrides (D5).

**Indexes:**
- `idx_service_cases_created_by`, `idx_customers_created_by`, `idx_work_orders_customer_id` (missing today)
- Already present: `service_cases(assigned_to)`, `source_offer_id`, the 5 party FKs + `customer_id`; `work_orders(assigned_employee_id)`, `(case_id)`; `customer_tasks(assigned_to)`; `offers(created_by)`; `employees(profile_id)`.

**Guard:**
- The draft aborts unless the 3 prerequisite keys exist and there are **exactly** the 4 known SELECT policies.
- The 00239 write policies are untouched.

## 3. SECURITY DEFINER analysis

- **Owner and recursion.** Owner = `postgres` (`rolbypassrls = true`), and none of the tables have `FORCE ROW LEVEL SECURITY` (checked on staging: customers, service_cases, work_orders, customer_tasks, offers, employees, profiles, overrides, role_permission_defaults). The helpers therefore read without RLS, so there is **no policy recursion** when the service_cases policy calls a function that reads service_cases.
- **search_path.** Fixed to `public, pg_temp`, so the functions can't be hijacked through a temp schema or `search_path`.
- **Input.** No arguments; the only input is `auth.uid()` from the JWT. No SQL injection surface, and no possibility of asking about another user's scope.
- **Fail-closed.**
  - Missing or inactive profile: `user_has_permission` → false, so the CASE returns `'{}'`.
  - `auth.uid()` NULL: all comparisons are false.
  - No active employees row: `current_employee_id()` NULL, so the work-order branch is empty.
- **Function ACL** follows the established practice (memory: Supabase function ACL): REVOKE from PUBLIC/anon/authenticated, then explicit GRANT to authenticated, which policy evaluation needs.

## 4. Search, counts and inference

**User-client paths become scoped automatically**, because they all run with the user's session (verified by the 4 inventory sweeps and the scope audit 2026-10-27). That covers:
- lists, search (`globalSearch` with `count: exact`), Ctrl+K (browser client), autocomplete;
- customer pickers (`getCustomersForSelect`, `getCustomersForOrderSelect`, `searchCustomersForSite`, offer form);
- dashboard counts (`dashboard.ts`, `api/dashboard/stats`, `customers.ts:42`) and the CTI lookup;
- embeds (`customer:customers(...)`, `service_cases(...)`).

For restricted users, `count(*)` therefore equals their own scope size. The rollback probe checks that count(*) == the size of the helper set.

**Global lookups no longer leak, because they go through controlled server paths (commit 4c543544):**
- customer number: global max+1, returns only the number;
- duplicate on email or name: a hidden match is returned without name, email or id, and linking to it is refused;
- offer→case: only the case number is revealed;
- the error texts contain no customer name.

**Admin-client paths acting on behalf of a user** check scope explicitly:
- Telegram (customer search, open-case count, call button);
- `getCustomerForQuote`, `sendQuoteAction`;
- `sendBesigtigelsePdf`;
- roof drawings.

**Known residual (inference) until 00241/00242:**
- Child tables are still `USING (true)` (§7). A restricted user can, via direct REST, read contacts, documents, notes and tasks for hidden customers and thereby infer their existence.
- 00240 closes **customers/service_cases** themselves, plus the counts on them.

## 5. Performance (measured in the rollback probe — see §8)

- **ALL roles:** `(SELECT user_has_permission(...))` is an InitPlan evaluated once per query. The remaining OR branches are not evaluated when it is true.
- **Restricted roles:** one InitPlan builds the scope array once per query (index lookups on `created_by` / `assigned_to` / `assigned_employee_id` / `offers.created_by` / `customer_tasks.assigned_to`). The per-row cost is then array membership (`= ANY`). That is O(n·k) with a small k (montør: tens of ids).
  - Salg with many of its own cases could have hundreds of ids. That is still cheap at today's volume (staging 1.3k cases).
  - Watch item: above ~10k ids per user, switch to an `EXISTS` join against a materialised set.
- **Overmontør without `customers.view.all`** (only through a manual override/revoke) would compute the party customers of ALL cases. That is acceptable (one sequential scan of service_cases) and is not the default.

## 6. Rollback

- The rollback SQL is in the draft's comment block. It restores the 4 old SELECT policies **verbatim**, drops the 2 helpers, and deletes the key, its defaults and its overrides.
- **It never touches anon.** The broad authenticated read (including inactive profiles) comes back exactly as before. That is a known regression, accepted only during a rollback.
- The app code needs no rollback: `customers.view.all` in `permissions.ts` then only controls the app layer, and the controlled global paths work regardless of RLS.

## 7. Known child-table exposure — deferred to 00241/00242 (D6)

These are still `USING (true)` for `authenticated`:
- **00241 (customer-related):** `customer_contacts`, `customer_notes`, `customer_documents` (incl. case-less documents/inspection reports), `roof_drawings` (all 5 in prod are case-less), `document_confirmations`.
- **00242 (case-related):** `work_orders`, `case_notes`, `case_materials`, `case_other_costs`, `service_case_attachments`, `customer_tasks`.
- **Separate wave (offer scope, API-2):** `offers`, `offer_line_items`, `leads`, `email_threads`, `sms_messages`, `projects`.

Already scoped:
- `invoices` / `invoice_payments` via `can_view_case_finance`. **NB:** that helper's salg branch is role-keyed and `created_by` only — see §9 F1.
- `incoming_emails`, `time_logs`, the cost tables, `employees`, `messages`.

## 8. Staging test matrix

**Personas and inputs:**
- Real staging personas: admin, serviceleder, bogholderi, salg.
- Temporary montør with an active employees row; a temporary salg with its own offer.
- Elektriker and Overmontør are tested as overrides on the montør.
- Inactive; missing profile (random uid); anon.
- Fixtures: own / work order / site party / case customer / open task / done task / cancelled work order / unrelated / salg D4.

**Before apply (done):**

| Test | Result |
|---|---|
| `mp-00240-scope-check` (app scope engine + controlled paths + fail-closed guards, real sessions) | **38/38 PASS** |
| `mp-00240-sql-probe` (draft in a DO block that always aborts; DB = app parity per persona; count == scope; INSERT RETURNING; inactive/missing/anon = 0; EXPLAIN times; before/after fingerprint identical) | **27/27 PASS**. Bug found and fixed in the draft: `= ANY ((SELECT f()))` is a sub-query (uuid = uuid[]) → `::uuid[]` cast. Montør count(*) 6.8 ms, salg 3.6 ms, admin 1.7 ms |
| assistant-commands / assistant-case-scope / telegram / assistant-run / assistant-resolve | PASS |
| `harness:ui-full -- sales,montor` | **NOT RUN**: `next build` hangs (the machine has 29 MB free RAM; `mc-fw-host` holds ~4.2 GB). Must run before push/apply |

**After staging apply (requires approval):**
1. `db-fingerprint` before/after; diff = exactly 2 policies dropped/created (4 → 2 SELECT), 2 functions, 1 catalog row + 4 defaults, 3 indexes.
2. `mp-00240-sql-probe` mode "applied", with the same assertions against the live policies.
3. `mp-00240-scope-check`.
4. `mp-00239-rls-check`. **NB:** its R check "SELECT unchanged" must be updated to the new expectation.
5. `harness:ui-full -- sales,montor` + U228/U229/U230.
6. A targeted UI pass for montør: Mine job → case → customer → tasks → inspection → roof drawing.

**Prod:**
- Pre-check: read-only shape (`prod-read-scope-shape.ts`): 3 admin + 2 montør, 0 overrides, 2 customers created by montør, 3 tasks (2 without relation, and they stay visible only while they are open).
- Then a rollback-only probe with the real admin + montør.

## 9. Findings that require Henrik's decision (not part of 00240)

- **F1 — `can_view_case_finance`** (invoices/invoice_payments RLS):
  - Role-keyed (`user_role()`), with salg = `created_by` only.
  - After 00240, salg sees cases through `assigned_to` and D4, but not their invoices. `getBillingFollowupSummaryAction` then counts such closed cases as "not invoiced".
  - Proposal (its own migration): `can_view_case_finance` = `invoices.view.all` ∨ (`invoices.view.own_cases` ∧ case ∈ `my_case_scope_ids()`).
  - This **widens** salg's invoice read to include assigned/D4 cases, so it needs a decision. Until then, the code fix restricts the billing follow-up to the same set (see the handover).
- **F2:** `generate_customer_number()` (INVOKER, unused by the app after 4c543544) can be dropped later.
