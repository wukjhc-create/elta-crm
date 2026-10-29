# 00243 (PROPOSAL, NOT APPLIED): time_logs follow effective permissions and case/work-order scope

**Status 2026-10-29:** proposal only. Requires Henrik's approval for staging and, separately, for prod.

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
  OR (invoices.view.own_cases AND wo.case_id ∈ my_case_scope_ids())          -- salg: same rule as F1 invoices

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
- salg: from "cases I created" to "cases in my effective scope" (created, assigned, D4 own offer). This matches the invoices salg can already see. Hours only, not cost.

**"No colleague time leakage":** a montør sees colleagues' rows only on a work order assigned to themselves, which is the job's hours and the same as today. Rows on other work orders stay hidden. Measured in prod: `kollega_logs_synlige_for_montoer` = 0.

## Test plan (when approved)
1. Staging rollback-only probe (like `mp-00241-00242-sql-probe`), covering: standard roles identical; revoke `view.all` on bogholderi → 0; grant `view.all` / `edit.all` on montør → all / write; salg D4 case → sees hours; inactive → 0; cost columns still 42501.
2. Apply on staging → mp-00239, `prod-time-logs-*` equivalents, UI montør (Mine timer, U11, U142) + economy.
3. Prod: separate approval; dry run → fingerprint → apply → `prod-read-scope-effective` + a time_logs section.

## Risk
Low. The functions are swapped in one transaction, the policies are unchanged (they call the functions), and rollback means restoring the 00208 definitions.
