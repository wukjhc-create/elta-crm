# 00243: time_logs follow effective permissions (STAGING + PROD applied 2026-10-30)

**Status 2026-10-30:** STAGING applied, then **PROD applied** after Henrik's separate approval ("00243 — APPROVED FOR PROD", 2026-10-30; without the optional anon cleanup). See "Prod record" at the bottom.

**Change since the proposal of 2026-10-29:** the salg branch originally used `my_case_scope_ids()` (F1 scope), which *widened* salg (assigned/D4 cases). Henrik's condition was that "no current standard role gains broader time-log access". The branch now uses exactly 00161's rule (`service_cases.created_by = auth.uid()`), keyed on `invoices.view.own_cases` instead of the role. Widening to F1 is a separate decision.

## Current state (prod, read 2026-10-29)

| | DB (`can_view_time_log` / `can_write_time_log`, 00161/00208) | App (`lib/actions/time-logs.ts`, `my-hours.ts`, `time-approval.ts`) |
|---|---|---|
| Model | `CASE user_role()`: raw role, ignores overrides | `time_logs.view.own/all`, `create`, `edit.own/all`, `approve`, `delete`: effective permissions |
| admin / serviceleder | read and write everything | the same via `view.all` / `edit.all` |
| bogholderi | reads everything, writes nothing | `view.all`; no create |
| montør | reads own rows + rows on work orders assigned to them; writes own rows on own work order | `view.own` + work-order scope (`getWorkOrderEmployeeScope`) |
| salg | reads rows on work orders whose case **they created** (`created_by`) | no `time_logs.view.*` → the app shows nothing (billing reads hours with admin after the scope check) |
| Approval | the trigger `time_logs_approval_guard`: approval fields only via service role; a change resets to pending | `time_logs.approve` only in `time-approval.ts` |
| Cost/payroll | column-level grants (00192/00208): `authenticated` does not read cost columns | `withCostColumns` merges cost for `economy.cost_prices` + `employees.payroll.view` |

**Mismatches** (neither is a leak beyond the role model today; both are an overrides problem):
1. A **revoke** (e.g. `time_logs.view.all` taken from an admin/bogholderi) is not respected by RLS. The user can still read everything via REST.
2. A **grant** (e.g. `time_logs.edit.all` or `view.all` to an Overmontør) is ignored by RLS. The app shows less than the permission promises, and writes are rejected.
3. Salg uses `created_by` instead of the effective case scope (F1/00242). That is narrower and inconsistent with invoice visibility.

## Proposal (SQL in [`mp-00243-draft.sql`](mp-00243-draft.sql))

```
can_view_time_log(emp, wo) =
     time_logs.view.all
  OR (time_logs.view.own AND current_employee_id() IS NOT NULL
      AND (emp = current_employee_id() OR wo is assigned to current_employee_id()))
  OR (invoices.view.own_cases AND wo's case.created_by = auth.uid())          -- salg: exactly as 00161

can_write_time_log(emp, wo) =
     time_logs.edit.all
  OR ((time_logs.create OR time_logs.edit.own) AND current_employee_id() IS NOT NULL
      AND emp = current_employee_id() AND wo is assigned to current_employee_id())
```

**Unchanged:**
- column grants (cost/payroll stay closed);
- the approval guard;
- no DELETE policy (deletion only via the server path `deleteRejectedTimeLogAction`);
- inactive users or a missing profile see nothing (`user_has_permission` is fail-closed).

**Effect per standard role (no overrides):**
- admin, serviceleder, bogholderi and montør: **identical**.
- salg: **identical** ("cases I created"). F1 scope was not chosen; it would widen salg.

**"No colleague time leakage":** a montør sees colleagues' rows only on a work order assigned to themselves, which is the job's hours and the same as today. Rows on other work orders stay hidden. Measured in prod: `kollega_logs_synlige_for_montoer` = 0.

## Test plan (when approved)
1. Staging rollback-only probe (like `mp-00241-00242-sql-probe`), covering: standard roles identical; revoke `view.all` on bogholderi → 0; grant `view.all` / `edit.all` on montør → all / write; salg D4 case → sees hours; inactive → 0; cost columns still 42501.
2. Apply on staging → mp-00239, `prod-time-logs-*` equivalents, UI montør (Mine timer, U11, U142) + economy.
3. Prod: separate approval; dry run → fingerprint → apply → `prod-read-scope-effective` + a time_logs section.

## Risk
Low. The functions are swapped in one transaction, the policies are unchanged (they call the functions), and rollback means restoring the 00161 definitions.

## Staging result 2026-10-30 (sequence per Henrik)

| Step | Result |
|---|---|
| 1. Pre-fingerprint (`cli.ts mp-00243-fingerprint`) | Taken twice, identical (functions, policies, column/table grants, triggers, rows) |
| 2. Dry run + forced rollback (`cli.ts mp-00243-sql-probe`) | **26/26**: old (00161) and new (draft) installed in ONE aborted transaction, measured per persona |
| 3. Identical fingerprint after the dry run | Yes |
| 4. Apply to staging (`cli.ts migrate-staging 00243`) | OK. Diff = **only** the bodies of `can_view_time_log` + `can_write_time_log`; ACL, policies, grants, triggers and rows unchanged |
| 5. Effective permission matrix (probe again, now post-check) | **26/26** |
| 6. Time registration / approval | `time-logs-grants-check`, `rejected-hours-check` (approval → invoicing), `time-overlap-rejected-check`: green; UI: see the regression |
| 7. Montør Mine timer / job flow | UI groups montor + economy + portal-mail (see the consolidated report) |
| 8. Finance/payroll leakage | `cost-lockdown-check`, `cost-lockdown-2b-check`, `cost-columns-check` (75/75): green; cost columns 42501 for all 12 sessions in the probe |
| Scope regression | `mp-00239-rls-check` 55/55, `mp-00240-scope-check` 38/38, `mp-00240-f1-check` 17/17 |

### Exact time_logs matrix (staging, measured)
Fixture: the montør's own work order (`wo_mine`) and a colleague's work orders on a hidden case, a D4 case and a case created by salg.

Rows:
- `tl_m_own`: the montør's own hours on their own work order;
- `tl_col_on_mine`: a colleague's hours on the montør's work order;
- `tl_m_on_col`: the montør's own hours on a colleague's work order;
- `tl_col_other`, `tl_col_d4`, `tl_col_salgown`: a colleague's hours on the colleague's work orders.

Write combinations (employee, work order): `w_m_mine` = (montør, own WO), `w_m_col` = (montør, colleague's WO), `w_col_mine` = (colleague, montør's WO), `w_col_col` = (colleague, colleague's WO).

| Persona | Sees hours | May write (employee, work order) | old == new |
|---|---|---|---|
| admin | all 6 | all 4 combinations | yes |
| serviceleder | all 6 | all 4 | yes |
| bogholderi | all 6 | none | yes |
| salg | `tl_col_salgown` only (case they created) | none | yes |
| montør | `tl_m_own`, `tl_col_on_mine`, `tl_m_on_col` | only own hours on own WO | yes |
| Elektriker (template) | as montør | as montør | n/a |
| Overmontør (template) | as montør (the template has `time_logs.approve`, not `view.all`) | as montør | n/a |
| montør + grant `view.all` + `edit.all` | all 6 | all 4 | NEW: grants are respected |
| montør − revoke `view.own`/`create`/`edit.own` | none | none | NEW: revokes are respected |
| bogholderi − revoke `view.all` | none | none | NEW |
| inactive montør | none | none | old also none |
| missing profile / anon | none | none | |

- **Colleague's hours:** no montør variant sees `tl_col_other`, `tl_col_d4` or `tl_col_salgown`.
- **Approval:** `approval_status` cannot be set from any user session (42501, column grant + `time_logs_approval_guard`). `time_logs.approve` gives no view/write rights, and view/write gives no approval.
- **Cost/payroll:** `cost_amount` and `cost_rate_snapshot` give 42501 for every session (old and new). `employees` and rate tables are not touched.

Note (not part of 00243): `anon` has table-level INSERT/UPDATE/DELETE/TRUNCATE on `time_logs` (Supabase default grant). RLS (policies only `TO authenticated`) and no SELECT give anon no rows, and PostgREST exposes no TRUNCATE. A `REVOKE ALL ON public.time_logs FROM anon` is defence in depth and can ride along with the next approved migration, like decision D.

## PROD approval (request to Henrik)
- **Migration:** `supabase/migrations/00243_time_logs_effective_permissions.sql` (SQL body identical to `mp-00243-draft.sql`; only the header comment differs).
- **Purpose:** time_logs RLS uses effective permissions (role ∪ grants − revokes) instead of the raw role, so per-employee rights (templates/overrides) also apply in the database.
- **Changes:** only the bodies of 2 functions. Policies, grants, triggers and data are unchanged.
- **Effect:** identical for all standard roles without overrides (proven old == new). Overrides are respected. Inactive or missing profile = nothing.
- **Risk:** low.
  - **Rollback:** the two 00161 definitions, `CREATE OR REPLACE`.
  - **Pre:** `prod-db-fingerprint`, dry run via `prod-apply-migration --dry-run`, rollback-only probe.
  - **Post:** fingerprint diff (exactly 2 function bodies), `prod-read-scope-effective`, time_logs section, `prod-pilot-readiness`.
- **Not necessary for the pilot:** prod has no overrides today, so behaviour in prod would be identical before and after.

## Prod record 2026-10-30 (Henrik's sequence)
| Step | Result |
|---|---|
| 1. Committed file = staging-tested | Body between `BEGIN;` and `COMMIT;` identical to `mp-00243-draft.sql`; statements: guard + 2× `CREATE OR REPLACE FUNCTION` + NOTIFY (no anon cleanup) |
| 2. Pre-fingerprint (`prod-db-fingerprint`) | Taken twice, identical |
| 3. Dry run, forced rollback (`prod-apply-migration 00243 --dry-run`) | SQL + guard ran without errors, rolled back |
| 4. Fingerprint after dry run | Identical (0 diffs / 2,234 keys) |
| 5. Rollback-only probe (`scripts/prod-mp-00243-effective.ts`) | **[NY] 8/8 · [UÆNDRET] 27/27**; fingerprint identical afterwards |
| 6. Apply (`prod-apply-migration 00243 --approved-by-henrik`) | COMMIT |
| 7. Post-fingerprint | **Exactly 2 diffs:** `can_view_time_log`, `can_write_time_log`. Policies, grants, tables, indexes, permission tables, row counts/checksums unchanged |

- **Function hashes:** prod after apply = staging (view `392b7742…`, write `1fb3090e…`). SECURITY DEFINER and ACL unchanged.
- **Post-apply probe:** 35/35. Current = migration body; old (00161) == new for admin, serviceleder, bogholderi, salg and montør with zero overrides.
- **Personas:** real admin and montør (P5); serviceleder, bogholderi and salg simulated by a rolled-back role change on existing profiles (prod has no such profiles).
- **Override checks (rollback-only):**
  - grant works, revoke works, removing the override restores the role default (montør grant/revoke, bogholderi revoke, salg grant `view.all`);
  - Elektriker/Overmontør templates = montør;
  - inactive / anon / missing profile = nothing.
- **Salg:** a case assigned to salg but not created by salg gives no hours (no F1 widening).
- **Approval and cost:** `approval_status` and the cost columns give 42501 for all 22 sessions.

### Rerun checks after apply
- `prod-read-scope-effective` 162/162 + 33/33.
- `prod-time-logs-colleague`: 0 colleague logs visible to the montør. `prod-time-logs-update-privs` and `prod-time-logs-exposure`: unchanged.
- `prod-cost-column-privs`, `prod-cost-table-read-policies`, `prod-anon-cost-exposure`: closed. `prod-role-check-cost-wave2 post`: 38 as expected. `prod-verify-00185 post`: as expected.
- `prod-flow-check-00198-00202` (rejected hours, rollback): 4/4.
  - The script's fixture employee needed `cost_rate` (00230 requirement); fixture-only change.
- Staging: `time-overlap-rejected-check`, `rejected-hours-check`, `time-logs-grants-check`, both cost-lockdown checks and `cost-columns-check` 75/75: all green.
- `prod-pilot-readiness`: unchanged (exit 2 = the known data blockers for P3 and P4; P5 ready).

**Rollback:** the two 00161 definitions (`CREATE OR REPLACE`), the same text as `oldTimeLogFunctions()` in `scripts/test-harness/mp-00243-sql-probe.ts`.
