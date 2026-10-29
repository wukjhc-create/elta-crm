# Pilot readiness 2026-10-29: decisions, status and remaining items

Code-only work and read-only audits. **No prod migration was run.** MONTOR_START_JOB_ENABLED, MAIL_AUTOLINK and ECONOMIC_PUSH are unchanged.

## 1. Permissions, app ↔ DB

### A. time_logs: migration proposal 00243 (not applied)
See [mp-00243-time-logs-permission-scope.md](mp-00243-time-logs-permission-scope.md).
- **DB:** `can_view_time_log` and `can_write_time_log` are still `CASE user_role()`.
- **App:** already uses effective permissions.

The fix swaps only the two functions. Standard roles keep the same visibility. Salg moves to F1 scope (hours, never cost). Overrides are then respected in RLS too.

### B. Task list (W-8): done (code)
- `taskListScope()` (`lib/tasks/task-scope.ts`) replaces all `role === 'montør'` checks in the task code: list, counters, customer tab, mail and page.
- It uses the same key as RLS O2:
  - without `customers.view.all`, only tasks assigned to me;
  - without `tasks.view`, own created or assigned;
  - otherwise all.
- Standard roles are unchanged. `check:rbac` asserts this for montør, Elektriker, salg, bogholderi, admin, serviceleder and no-access.
- The Overmontør template (which has `customers.view.all`) now gets "all", matching RLS and the template's own grant.
- Ratchet: role comparisons 57 → **48** (baseline lowered).

### Remaining raw role checks (48)
Inventory by file, with the type of each check:

| Type | Files |
|---|---|
| Role definition (correct) | `lib/auth/roles.ts` (8), `lib/auth/role-guard.ts` (2) |
| Role administration (UI picks a role) | `settings/team/team-settings-client.tsx` (4), `actions/employee-login.ts` (3), `actions/settings.ts` (3), `actions/pilot-setup.ts`, `actions/go-live.ts` |
| Montør UI | `layout/bottom-nav.tsx` (montør menu), `dashboard/page.tsx` (montør → Mine job), `actions/portal.ts` (chat sender label) |
| Other modules | mail-detail (4), incoming-invoices (4), learning (3), offer-followup (2), customer-notes (2), user-activity, employees, agent-inbox, offer-agent-button, sidebar, notification-dropdown, mail-client |

None of them widens access beyond RLS, which now enforces scope. They are candidates for later conversion, module by module.

### C. `case_belongs_to_customer` / `case_is_closed`: decision: NO change
- They are SECURITY DEFINER because the write policies in 00235/00236 use them in WITH CHECK (consistency: does the task's case belong to the customer, is the case closed). A caller-scope check inside them would change write behaviour, so it would be a migration, not an RPC fix.
- Practical risk is negligible:
  - They need two exact UUIDs and return one bit.
  - A user who knows a hidden case's UUID usually got it from a visible row that already carries both `customer_id` and `service_case_id` (e.g. a task salg can see).
  - The only extra fact is "the case is closed" or "the relationship exists".
  - Anon cannot call them (function ACL).
- **Recommendation:** leave as is. If they are ever touched, split them into an internal helper (no EXECUTE for authenticated) that the policies use.

### D. Anon grants on views: decision: no standalone migration
- `v_customer_payment_summary` and `v_customers_with_payment_summary` have anon SELECT.
- Both are `security_invoker` and anon has no grant on `invoices`/`customers`, so anon gets a 42501 error. The grant exposes nothing.
- **Proposal:** `REVOKE SELECT ON public.v_customer_payment_summary, public.v_customers_with_payment_summary FROM anon;` piggybacks on the next approved migration (e.g. 00243). Defence in depth only, no real security value on its own.

## 2. MAIL_AUTOLINK (cron path): recommendation, NOT activated

**Facts (prod read-only 2026-10-29):**
- With the flag OFF, the sync calls the legacy `linkEmail()` on a cookie client:
  - **cron** = anon. `customers` has no anon grant, and `incoming_emails` has no anon policy, so it reads 0 rows and updates 0 rows. A pure no-op.
  - **manual "Sync now"** (go-live, inbox) runs under the clicking user's session, so it links within their RLS scope. The behaviour depends on who triggers the sync.
- Real auto-linking today: email-intelligence (`linked_by = 'auto-ai'`, ~30/month); legacy `auto` 1–2/month (user-triggered actions); the rest manual.
- The K5 engine (`email-autolink.ts`, behind `MAIL_AUTOLINK_ENABLED`) runs on the admin client:
  - exact address, contact or thread → link; domain only or ambiguous → suggestion; FormSubmit or internal sender → never;
  - an existing link is never overwritten (`customer_id IS NULL` condition);
  - audit_logs for every link and suggestion.
- Staging scenario `cli.ts autolink-scenario` passed after 00240–00242. `autolink-policy-test` is green.

**Recommended architecture:**
1. **System identity:** server-only admin client in the sync, never the user's session. The result is then the same whether cron or a person triggers the sync, and normal users' scope is not widened (the client is never exposed).
2. **Suggestion-only first:** a new mode `MAIL_AUTOLINK_MODE=off|suggest|link` (default `off` = today).
   - `suggest`: the K5 decision is written only as a suggestion with audit, never `customer_id`.
   - Run for a week and review the suggestions.
   - Then `link`.
3. **Audit trail:** already in K5 (`email_auto_linked` / `email_link_suggested`).
4. Remove the legacy `linkEmail` from the sync once `link` is approved. Keep it for the user-triggered "Auto-link pending" until then.

**Why not code now:** removing the legacy path changes manual sync (live behaviour). A suggest mode writes rows that users see. Both require Henrik's approval. **Tests ready:** `autolink-policy-test` and `cli.ts autolink-scenario` (staging); a suggest mode is tested with the same scenario.

## 3. Employee pilot readiness: `npx tsx scripts/prod-pilot-readiness.ts` (prod read-only)

| | Role | Login | Employee row | Hourly rate | Cost rate | Open WO | Blocker |
|---|---|---|---|---|---|---|---|
| P1 | admin | yes (used) | no | — | — | — | none (office, logs no hours) |
| P2 | admin | yes (used) | no | — | — | — | none |
| P3 | admin | yes (used) | yes | **MISSING** | **MISSING** | 0 | **Time registration is refused (00230) until Henrik sets the rates** |
| P4 | montør | yes (used) | **no** | — | — | — | **Cannot see jobs or register time: needs an employee row (Henrik: create or link under Employees)** |
| P5 | montør | yes (used) | yes | yes | yes | 3 | none |

No template or override is in use, and there are no duplicate employee rows. Nothing is set automatically.

## 4. Pilot workflow: fixes (code-only)

**Read errors were shown as "nothing".** A sweep of the montør flow found three HIGH cases. All are fixed and now use the existing convention: red box, "Det tælles ikke som …".

| Where | Before | Now |
|---|---|---|
| `getWorkOrderEmployeeScope` / `userCanViewCase` (`lib/auth/case-scope.ts`) | A failed read meant "no access", so Mine job, the planning tab, hours and materials showed "Ingen …" | `ScopeReadError` (Danish message) is thrown; the callers' try/catch returns `success:false` |
| `listTimeLogsForWorkOrder` | A failed work-order lookup gave "Ingen timer registreret" (risk of double registration) | "Kunne ikke hente arbejdsordren" |
| `getDocumentsForCase` + documents/inspection tabs | `[]` on error, shown as "Ingen dokumenter på denne sag" | Throws; the tab shows the error with "Prøv igen" |
| `getCaseNotes` | `success:true, []` gave "Ingen noter endnu" | `success:false` |
| `getEmployeesForOrderSelect` | Empty employee picker, so hours could not be registered, with no explanation | `success:false`, and the dialog shows the error |
| "Mine timer" card | Disappeared silently on a read error | Red box: "Det betyder ikke, at du har 0 timer" |
| Billing status card (case) | Disappeared silently | Shows the read error |

## 5. Pilot day on staging (U231, new): all checks green

Chain: salg's offer → case from the offer (D4) → work order to the montør → hours + material → invoices.
- **Montør (mobile, 375 px):**
  - finds the job in Mine job, and it opens the case;
  - no horizontal scroll;
  - material shown without prices;
  - hours on the correct work order;
  - the customer page opens;
  - a foreign case shows "Siden blev ikke fundet" without its title.
- **Salg:** sees the D4 case and its billing status (F1); the foreign case is rejected.
- **Bogholderi:** sees both invoices in the overview.

Note: `dashboard/loading.tsx` streams the response, so `notFound()` returns HTTP 200. Rejection is verified on content, not status.

## 6. Performance (U232, staging volume, warm measurement)

Server time (TTFB) 113–173 ms on all measured pages. Full load:

| Page | Load |
|---|---|
| Customer list | 0.6 s |
| Customer page | 1.1–1.4 s |
| Case page | 0.5–0.9 s |
| Calendar | 0.8–1.5 s |
| Invoice overview | 0.5 s |
| Mine job | 0.8 s |
| Admin dashboard | **2.6 s** (12 widget actions, including `syncMailIfStaleAction`) |
| Global search | 0.9 s, including debounce |

**Measured problem, fixed:** `useUserRole()` is used in 36 components. Each mount called `getProfile` and `getMyEffectivePermissionsAction` itself: **5–8 duplicate calls each, per page view** (10–16 of 12–22 server actions). Concurrent mounts now share one request (browser only, reused for at most 5 s).

**After (U232 in full regression):** 0 duplicate calls on every measured page.

| Page | Actions before → after | Load before → after |
|---|---|---|
| Customer list (admin) | 16 → 4 | 0.62 → 0.60 s |
| Customer page (admin) | 16 → 6 | 1.14 → 1.10 s |
| Case page (admin) | 18 → 8 | 0.52 → 0.59 s |
| Calendar (admin) | 17 → 5 | 1.45 → 0.81 s |
| Invoice overview | 12 → 4 | 0.55 → 0.56 s |
| Admin dashboard | 22 → 12 | 2.55 → 2.26 s |
| Case page (montør) | 20 → 6 | 0.86 → 1.02 s |
| Calendar (montør) | 17 → 5 | 0.76 → 0.54 s |
| Customer list (salg) | 16 → 4 | 0.67 → 0.76 s |
| Customer page (salg) | 14 → 4 | 1.36 → 1.21 s |

Mine job (montør): 0.80 → 1.16 s, 15 → 7 actions. In the full regression it measured 6.0 s once (cold staging); the standalone rerun gave 1.16 s. Load time on staging fluctuates by ±0.2 s between runs. The clear gain is server load: 55–75 % fewer server actions per page view.

No N+1 was found on the server side of the measured pages. The calls that remain are each called once.
