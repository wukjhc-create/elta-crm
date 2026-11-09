# Employee Setup Integrity: handover

**Branch:** `claude-employee-integrity`, based on main `b5c80379`.
**Status:** READY_FOR_REVIEW. Nothing is merged or deployed. No migration is applied anywhere. No production data has been changed.

**Not touched:** Finance Batch 2, e-conomic, `grok-finance-2`, migration 00248, telephony/Relatel, `package.json`, `package-lock.json`.

## 1. Production findings (read-only, 2026-11-09)

Source: `npx tsx scripts/prod-employee-integrity.ts`. It is a new script and prints only role, a pseudonymous number and counts.

**Profiles**

| Login | Employee row | Rates | Time logs / work orders |
|---|---|---|---|
| admin#1 | none | n/a | 0 / 0 |
| admin#2 | none | n/a | 0 / 0 |
| admin#3 | one active row | **hourly rate MISSING, cost rate MISSING** | 0 / 0 |
| montør#1 | **none** | n/a | 0 / 0 |
| montør#2 | one active row | ok | 1 / 3 |

**Employee rows overall**
- There are 2 rows in total, both active and both linked to a login. None is unlinked.
- No login has more than one active row.
- No rate is set to 0.
- There is 1 time log. It is closed and has a cost.

**montør#1 has no employee anywhere to link to.** Nothing in the system matches them:
- There is no unlinked employee with the same e-mail.
- No other login carries an employee with that e-mail.

So linking montør#1 means creating a new row by hand. It cannot be done by matching.

**admin#1 and admin#2** have no employee row. That is normal for office users who don't log time. The new diagnostics do not flag it.

## 2. Root causes

1. **The database does not tie the two tables together.**
   - `employees.profile_id` is nullable, has only a non-unique index, and uses `ON DELETE SET NULL` (00086).
   - Nothing stops a login from having two active rows.
   - No trigger connects `profiles` and `employees`.
   - `handle_new_user` (00150) creates the profile as **montør** by default and never creates an employee row.
2. **Team invites create a montør with no employee.**
   - `inviteTeamMember` only creates the login. With the default role montør, or when the role couldn't be set because the caller lacked `users.edit` or the update failed, the user silently stayed a montør. **This is how montør#1 came about.**
3. **Role changes ignored the employee link.**
   - `updateTeamMember` and `setEmployeeAuthRole` could make anyone a montør without an employee row, or with only an inactive one.
4. **`maybeSingle()` failed silently on duplicates.**
   - In `updateTeamMember`, deactivating a login with 2+ employee rows deactivated none of them, because the lookup errored and `data` came back null.
   - In `linkExistingProfile`, the clash check passed on the same error.
5. **Reactivation and creation could produce two active rows on one login:**
   - `setEmployeeActiveAction`
   - `updateEmployeeAction`, when switching from inactive to active
   - `createEmployeeAction`, when given a `profile_id`
6. **Unordered or arbitrary lookups:**
   - `/api/calendar/my-jobs` and `listCalendarEmployeesAction` used `limit(1)` with no order.
   - The scope code (`current_employee_id`, `getWorkOrderEmployeeScope`) quietly picks the oldest row when there are duplicates.
7. **Misleading empty states.** A montør with no link saw "Ingen planlagte job" and got "Arbejdsordren er ikke tildelt dig" when logging time, rather than "ikke koblet".
8. **Missing rates.**
   - New time logs are protected: the 00230 trigger raises an error and never guesses.
   - Several readers and the autopilot invoice do not protect against missing rates (see section 5).
   - **admin#3 is an example:** an employee row with no rates. Work could still be planned for them, and their time could never be closed.

## 3. Changes in this branch

The work is app-level only (option A), plus a little UI (option B). The database part is a proposal; see section 6.

### New module: `src/lib/employees/setup-integrity.ts`

This is the one place that decides whether a login has a usable employee row.
- **The link is only `employees.profile_id`.** Nothing is ever matched by e-mail or name.
- **States:**
  - `linked`: exactly one active row.
  - `missing`: no row at all.
  - `inactive_only`: only inactive rows.
  - `ambiguous`: more than one active row. **None is chosen.**
- **Rates:** `knownRate` treats null, `''` and NaN as unknown (null), never 0. A rate of exactly 0 is a known value but is flagged separately.
- **A read error throws** `EmployeeSetupReadError`. It never counts as "missing" or "0 conflicts".
- **Helpers:**
  - `loadEmployeeSetup`
  - `countActiveEmployeesForProfile`
  - `activeLinkConflict`
  - `montorRoleChangeError`
  - `assignableEmployeeError`
  - `EMPLOYEE_SETUP_TEXT` / `EMPLOYEE_SETUP_ISSUE` (Danish texts that name no person and no id)
- **Security still follows effective permissions.** `roleRequiresEmployee` is only a setup rule: a montør must have an employee before they can get jobs or log time.

### Preventing new inconsistent states

| Path | Before | Now |
|---|---|---|
| `inviteTeamMember` (Team) | Montør without an employee; the role silently stayed montør when it couldn't be set | Montør is refused and pointed to the employee card. Without `users.edit` the invite is refused **before** anything is created. If the role can't be set, the login is blocked. The UI disables submit when montør is selected |
| `updateTeamMember`, role **to** montør | Allowed in every case | Requires exactly one active employee; otherwise refused before anything is written |
| `updateTeamMember`, role **away from** montør | Allowed | Allowed. Employee, time logs and work orders are not touched; open jobs trigger a warning |
| `updateTeamMember`, deactivate | `maybeSingle()`: with duplicates nothing was deactivated | **All** active rows are deactivated; history is kept |
| `updateTeamMember`, reactivate a montør | No warning | Warns when setup is incomplete |
| `setEmployeeAuthRole` (employee card), to montør | Allowed | This employee must be the login's only active row |
| `inviteEmployeeLogin` as montør | Also allowed on an inactive employee | Refused for an inactive employee |
| `linkExistingProfile` | `maybeSingle()` clash check passed on duplicates | Counts active rows on the login; a read error refuses |
| `createEmployeeAction` with `profile_id` | No check | Refused if the login already has an active employee |
| `setEmployeeActiveAction` / `updateEmployeeAction`, reactivate | No check | Refused if the login already has another active employee |

### Clear failures instead of misleading empty states

- **Mine job (`MyJobsCard`):**
  - Not linked, only inactive, or ambiguous → the exact message (`data-testid="my-jobs-setup-incomplete"`), replacing "Ingen planlagte job".
  - A failed check shows "Det betyder ikke, at den mangler".
  - New action: `getMyEmployeeSetupAction`, which returns only the user's own data and no rates.
- **Phone calendar (`/api/calendar/my-jobs`):** uses the shared resolver. Missing, only inactive or ambiguous gives a precise message; a read error returns 503, not "not linked".
- **Calendar employee list for a montør:** only the one unambiguous active row, otherwise nothing. The previous `limit(1)` picked an arbitrary row.
- **Time logging, for users who may only log their own time (create and edit):**
  - Missing, only inactive or ambiguous gives a precise message. The old text was "Arbejdsordren er ikke tildelt dig", and with duplicates the oldest row was used silently.
  - A missing sale rate was already caught by the existing pre-check.
  - **A missing cost rate is left to the database** (00230 raises a Danish error). The app does not copy the cost-basis rule, because with the company's fixed standard rate a missing employee cost rate is legitimate.
- **Planning** (`createWorkOrderForCase`, `updateWorkOrderPlanning`, and the planning agent) now refuses:
  - an inactive or terminated employee (as before)
  - **a missing hourly rate**, because that time could never be closed
  - **a login with more than one active employee**, because the montør wouldn't see the job unambiguously
  - The cost rate is not checked, for the same reason as in time logging.
- **Pilot checklist (`pilot-setup`):** uses the classifier. An inactive row no longer counts as linked, and the detail line shows how many logins are in each state.

### Financial fallbacks fixed in this branch

- **`create_invoice_from_work_order` (autopilot invoice).** The SQL prices each hour at the employee's **current** rate and falls back to the settings rate or 495 when it's missing.
  - The new guard `src/lib/employees/invoice-rate-guard.ts` runs before the RPC.
  - It invoices only when every billable hour has a frozen sale amount **and** the employee's current rate equals the frozen rate. Then the SQL's result is exactly the frozen price, and the default rate is never used.
  - Otherwise you get a Danish error with no amount in it, pointing to the case's draft invoice.
- **`calculateEmployeeProjectImpact` (employee impact per project).**
  - Before: revenue was the current `hourly_rate || 0` (a missing rate gave revenue 0 and a false margin), and `cost_amount || 0`.
  - Now: it uses each time log's frozen `sale_amount` and `cost_amount`. A missing value makes that project's revenue, cost or margin **null**, and there are new counters `unknownCostLines` / `unknownSaleLines`.
  - It has no UI consumer today, only the server action.

## 4. Tests

| Test | Result |
|---|---|
| `npx tsx scripts/employee-setup-integrity-test.ts` (pure logic, fake clients, static guards) | **59/59** |
| Deliberately broken rules (ambiguous picks the oldest, missing rate becomes 0, planning without a rate check, count read error returns 0, invoice guard lets a missing rate through, Team invite allows montør, edit time log skips setup check) | **7/7 caught** |
| **U265** on staging (real server actions as admin and montør) | **20/20 sub-checks** |
| `tsc`, RBAC/action-gate, RLS matrix | see section 8 |
| UI regression `montor,economy,pilot-sim` | see section 8 |

**U265 covers each required case:**
- Montør with a valid employee: no message, and can log time.
- Montør without an employee: Mine job shows "ikke koblet", without the misleading "Ingen planlagte job", and time logging gives a clear error.
- Admin/serviceleder without rates: covered by the unit test, plus planning without an hourly rate is refused.
- Role change to montør: refused without an employee, refused with only an inactive one, allowed with one active one.
- Role change away from montør: allowed. The employee, the time log (same cost and sale amounts) and the work-order assignment are unchanged, and you get a warning about open jobs.
- Inactive employee: reactivating one that would duplicate an active row on the same login is refused.
- Duplicate/ambiguous mapping:
  - Mine job shows "flere aktive".
  - Time logging is refused rather than using the oldest row.
  - Planning onto it is refused.
  - Linking it to a login that already has an active row is refused.
- Missing rate never becomes 0: unit test (`knownRate`, classification, invoice guard) plus planning.
- Planning and time logging fail with a clear message when setup is incomplete.
- Historical rows stay intact (see role change away from montør).

## 5. Financial fallbacks: classification

**Safe display fallback**
- `employee-economy.ts:156-166` treats NULL as 0 but counts the rows in `missing_snapshot_count`, which the UI shows as a warning.
- `src/lib/actions/profit.ts:23-50` `resolveHourlyCost` returns `cost: null` with a reason; its `?? 0` is followed by a `> 0` filter.
- `src/lib/cases/offer-vs-actual.ts:88-96` keeps labour as null when cost is null.

**Operational fallback** (the workflow continues; the number is an estimate, not an actual)
- Offer and calculation defaults are visible, editable offer prices, not hidden actuals:
  - `CALC_DEFAULTS.HOURLY_RATES` 495/295/650/350
  - `calculation-settings`
  - `calculations.ts`, `kalkia-*`, `calculationEngine.ts`
  - `calculation-intelligence` (400)
  - `auto-project.ts` (450 stub)
  - The defaults disagree: offers use 495, unbilled and economy use 650, auto-project uses 450.
- `priceTimeLog` (650, `source: 'fallback'`):
  - The invoice writers (`invoice-from-case`, `invoice-stage`) **skip** fallback rows, so these are never billed.
  - It is still counted, unmarked, in `unbilled.ts` (close readiness) and in labour sale in `service-case-economy.ts`. Neither is stored, and `employees_without_rate` flags it partly.
- `rates.ts` accessors (`getStandardSaleRate` 495, `getStandardCostRate` 400, `getEmployeeCostRate`): operational in themselves; unsafe only where a caller treats the result as a real cost (see `getEmployeeProductivity`).
- `calculate_work_order_profit`, planned revenue `COALESCE(sale_rate_snapshot, e.hourly_rate, 495)`:
  - Only reachable for legacy rows without `sale_amount`.
  - Marked `revenue_source='planned'`, but **stored** in `work_order_profit`, so it is in the migration proposal.

**Financially unsafe fallback**

| Place | Problem | Status |
|---|---|---|
| `create_invoice_from_work_order` (00202) | Current rate, plus settings/495 when missing, becomes an **invoice amount** | **App guard in this branch**; SQL fix in the proposal |
| `calculate_work_order_profit` (00248:115) | `COALESCE(SUM(cost_amount), 0)`: a closed hour with no cost counts as 0 kr in labour, profit and margin and is **stored** | Proposal. Prod has 0 such rows; new rows are protected by 00230 |
| `employee-economics.ts` (`calculateEmployeeProjectImpact`) | `hourly_rate \|\| 0`, `cost_amount \|\| 0` | **Fixed in this branch** |
| `profitability.ts` `getEmployeeProductivity` | `cost_amount ?? hours × company/400`, `hourly_rate \|\| 495`, unmarked | Not fixed: **no caller** (dead code). Remove or fix if it gets used |
| Labour cost `?? 0` with no "unknown" flag | NULL becomes 0 in totals | Not fixed: these readers only hit legacy rows with `cost_amount` NULL (prod has 0); same treatment as materials in 00248 is a follow-up |

The labour-cost `?? 0` readers in the last row are:
- `service-case-economy.ts:295`
- `time-logs.ts:788`
- `case-offer-vs-actual.ts:86-87`
- `reports.ts:553`
- `work-order-time-logs.tsx:298`
- `order-planning-tab.tsx:145`

## 6. Migration requirement

**No migration is required for this branch.** All rules are enforced at app level and tested.

A **proposal** is in `docs/runbooks/employee-integrity-migration-proposal.sql`. It is unnumbered and has not been applied anywhere:
1. A unique partial index `employees(profile_id) WHERE active AND profile_id IS NOT NULL`, guarded by a check that no duplicates exist (production has 0). This makes "one active employee per login" a database guarantee, including for future paths and the admin client.
2. `user_employee_id()` with an explicit `ORDER BY`.
3. `create_invoice_from_work_order` using frozen `sale_amount` and no default rate. The app guard can then be removed.
4. `calculate_work_order_profit` with an unknown-labour count, as for materials in 00248, and no planned revenue at 495. This touches a function 00248 just changed, so it should be its own later migration.

Each part needs its own approval (number, purpose, risk, pre/post checks) before it goes to staging.

## 7. Proposed remediation for the two production users

Nothing is done automatically and nothing is matched.

**montør#1: active montør login with no employee row** (no time logs, no work orders, no e-mail candidates)
1. Henrik decides whether this person should work as a montør.
2. **If yes:** create the employee under **Medarbejdere → Ny medarbejder** with the **real** hourly and cost rate, then link the login under **Login → Knyt eksisterende bruger**. After this branch, linking refuses if the login already has another active employee.
3. **If no:** change the role in Team to the right office role, or deactivate the login. The role change away from montør is always allowed.
4. Verify with `npx tsx scripts/prod-employee-integrity.ts`; montør#1 should show "én aktiv medarbejderrække · timepris ok · kostpris ok".

**admin#3: active employee row without hourly or cost rate** (no time logs, no work orders)
1. Henrik decides whether admin#3 should log time or be planned.
2. **If yes:** enter the **real** rates on the employee card under **Økonomi & løn**. Never a placeholder.
3. **If no:** deactivate the employee row (*not* the login) under Medarbejdere → Aktiv. This branch's planning check already prevents them being planned without an hourly rate.
4. Verify with the same script.

## 8. Verification (gates and regression)

| Check | Result |
|---|---|
| `tsc`, RBAC/action-gate, RLS matrix | all exit 0 |
| `employee-setup-integrity-test` | 59/59; mutations 7/7 caught |
| `test:profit`, Finance Batch 1 review (174/174), Batch 3, 00248 unknown cost (156/156) | pass |
| `invoice-line-snapshot`, `invoice-totals`, `net-invoiced`, `invoice-control`, `billing-materials-mobile`, `handover-close-guard` | pass |
| U265 (staging) | 20/20 sub-checks |
| UI regression `montor,economy,pilot-sim` (staging, ui-full) | **86/86 green** |

**About the UI regression run:**
- ui-full reported `PASS=84 FAIL=0 TIMEOUT=2`. The two timeouts, U248 and U254, are pilot-sim tests cut off by the harness's 15-minute batch cap and 30-minute round cap; each one runs 6 role workflows of 40–120 s.
- Run directly without the caps, they passed: 19/19 UI checks, `UI_E2E_ONLY=U248,U254`.
- U254 includes the duplicate-employee case (`m1b_dublet_medarbejder_job_vist=ja`). Read scope deliberately behaves as before; only the new write paths refuse ambiguity.

## 9. Remaining risks

- **No database guarantee for "one active employee per login"** until proposal item 1 is applied. The app guards cover every known path, but a direct admin-client or SQL write could still create a duplicate.
- **The scope code (`current_employee_id`, `getWorkOrderEmployeeScope`) still picks the oldest row with duplicates.** Reading stays consistent with RLS. The new write paths (time logging, planning) refuse ambiguity, and diagnostics and Mine job show it. Production has 0 duplicates.
- **The autopilot invoice is now stricter.** A work order with a changed employee rate can no longer be invoiced this way; use the case's draft invoice. This is intended: the old path repriced the hours.
- **Planning now requires an hourly rate.** Employees without rates (admin#3) can no longer be planned until the rates are set. This is intended, since the time could never have been closed.
- **Team invite can no longer create a montør.** Montør invites go through the employee card. The UI says so.
- **The legacy labour `?? 0` readers and `getEmployeeProductivity` (dead)** are classified, not changed; see section 5.
- **Not tested in production.** Only read-only analysis has run there.
