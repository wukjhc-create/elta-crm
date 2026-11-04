# Grok finance handover 1

Review prompt: "Gennemgå Groks seneste arbejde."

The tip of this branch is `git rev-parse origin/grok-finance-1`. This file cannot name the commit that contains it. Product work ends at parent `82f0bb51`. The read-only GET client landed in `1def5a6e`.

Branch: `grok-finance-1`. Worktree: `C:\Dev\elta-crm-grok-features`. Not merged to main.

Base main: `b3f152b2284608774b18be1ebc702606bae51232`.

Push used `git push -u origin grok-finance-1`. A command whose text is exactly `git push origin ` is denied locally before git runs.

Telephony, migration 00247, and Grok feature batch 3 were not touched. `grok-features-3` stays at `726f020b`.

No e-conomic write occurred in this batch. `ECONOMIC_PUSH_ENABLED` was not turned on. No customer sync, invoice export, supplier-invoice posting, payment posting, or journal booking was run.

## Existing finance architecture

One client: `src/lib/services/economic-client.ts`. Base `https://restapi.e-conomic.com`. Tokens stay in `accounting_integration_settings`, decrypted only in memory after `settings.economic`. `ECONOMIC_PUSH_ENABLED` must be the exact trimmed lowercase `true` or every non-GET is refused inside `economicFetch`.

Already present GET before this branch: `pingEconomicConnection` calls `/self`.

Already present writes, all behind the kill switch, idempotency claims, and UNCERTAIN locks (network, timeout, 408, 5xx keep the claim; no automatic retry):

- `createCustomerInEconomic` POST `/customers`
- `createInvoiceInEconomic` POST `/invoices/drafts` and book
- `markInvoicePaidInEconomic` POST customer payment on the configured cash book
- `pushSupplierInvoiceToEconomic` POST supplier-invoice draft

Previews build the payload and do not call the network. Draft shapes live in `src/lib/economic/invoice-draft.ts`, `payment-entry.ts`, and `supplier-invoice-draft.ts`.

Sync audit is `accounting_sync_log`. Settings and the manual UNCERTAIN release are `settings.economic` in `src/lib/actions/accounting.ts`. Health counts are `computeAccountingHealthSummary`. That summary can still show 0 when an inner read throws. This batch did not change that. The liquidity page links to `/dashboard/settings/economic` instead of copying those counts.

Open customer balance already exists as `sentOpenAmount` / `computeInvoiceTotals`: sent, not voided, not a credit note, final minus amount paid minus sent/paid credits on that invoice, never below 0, DKK only, overdue only at 0.50 kr or more. The cash position calls those functions. A null amount is classified before `Number(null ?? 0)`.

`incoming_invoices` has no amount-paid column (migrations 00094, 00095, 00102). Statuses are received, awaiting_approval, approved, rejected, posted, cancelled. `bank_transactions` are movements without an opening balance. `bankContraAccountNumber` in the e-conomic config is the only account number this page reads. It is not hardcoded.

The operational dashboard already has `OperationalExceptions` on `/dashboard`. Finance alerts reuse that cell. No new reminder engine, and no SMS, email, or Telegram is sent.

## New employee capability

- An office user with `economy.view` opens Likviditet (`/dashboard/finance`) inside the existing CRM.
- Cards: bogført banksaldo, faktisk banksaldo, tilgodehavender, forfaldne tilgodehavender, kreditorer, forfaldne kreditorer, forventet likviditet +30 / +60 / +90.
- Each horizon shows opening cash, expected incoming, expected outgoing, projected cash, unscheduled receivables, unscheduled payables, and data quality.
- Queues: overdue and upcoming customer invoices, overdue and upcoming supplier invoices. Customer rows link to `/dashboard/invoices/[id]` and `/dashboard/customers/[id]`. Supplier rows link to `/dashboard/incoming-invoices/[id]` and, when a supplier is selected, `/dashboard/settings/suppliers/[id]`.
- Data quality names the source. The last successful e-conomic read is the timestamp of that read in the same request. It is not `last_sync_at`.
- A failed, timed out, missing, or unconfigured figure shows Ukendt. A real zero still shows 0,00 kr.
- The same user's dashboard exception cell "Likviditetsadvarsler" shows the alert count. A failed finance load is Ukendt, not 0 alerts. A successful evaluation with no alerts shows 0.
- Bookkeeping states and a payroll import flow are described in code and are not executable.

## Files changed

Read client and page from `1def5a6e`, extended in `82f0bb51`:

- `src/lib/services/economic-client.ts` — `economicGet`. A timeout is `reason: 'timeout'`.
- `src/lib/economic/read.ts` and `src/lib/economic/read-model.ts` — allowlisted pages and one account balance. A missing balance is unknown.
- `src/lib/finance/position.ts` — CRM open amounts, exclusive windows, and the invoice-total schedule.
- `src/lib/finance/cash-position.ts` — canonical `FinanceCashPosition`.
- `src/lib/actions/finance-position.ts` — server loader. User client for CRM and bank counts. e-conomic only with `settings.economic`.
- `src/app/dashboard/finance/page.tsx` — liquidity screen.
- `src/lib/actions/operational-exceptions.ts` and `src/components/dashboard/operational-exceptions.tsx` — read-only alert count.
- `src/lib/finance/bookkeeping-design.ts` and `src/lib/finance/payroll-design.ts` — design only.
- `scripts/grok-finance-1-test.ts` — pure tests, no network.
- Sidebar and header already link Likviditet for `economy.view`.

## API reads used

`economicGet` is GET only. It does not write `accounting_sync_log` and does not update `last_sync_at`.

Allowlist: `/self`, `/accounting-years`, `/accounting-years/{YYYY}/entries|periods|totals`, `/accounts`, `/accounts/{digits}`, `/customers`, `/suppliers`, `/invoices/booked`. Drafts, payments, and `/customers/1` are rejected.

Mounted on the liquidity load:

- `GET /accounts/{bankContraAccountNumber}` when `settings.economic` is held, credentials are ready, and the configured account number is a positive integer.
- `GET /accounting-years` only as a probe when credentials are ready and no account number is configured. No year total is shown.

Not mounted: accounts list, customers, suppliers, open booked invoices (`remainder$ne:0`), booked entries. A full page (`pagesize` 100 or `pagination.nextPage`) is `complete: false` and is not summed.

Users without `settings.economic` do not call `getEconomicSettings` or `economicGet` from this loader. That includes a serviceleder, who has `economy.view` but not `settings.economic` or `bank.view`.

## Security findings

- Invoice, supplier, and bank reads use the user client, so RLS and OWN/RELATED/ALL scope stay in force. `invoices.view.all` is the full visible set. `invoices.view.own_cases` is labeled as scope, not the whole company. Without the invoice or supplier permission the loader does not query, so an empty RLS result cannot look like zero.
- The page and the exception cell both require `economy.view` before `loadFinanceDesk`. A standard montør has neither `economy.view`, `invoices.view.all`, `invoices.view.own_cases`, `incoming_invoices.view`, `bank.view`, nor `settings.economic`. The pre-existing montør redirect on the dashboard was left as it is.
- Tokens are decrypted only inside the existing settings reader, and only after `settings.economic`. The page receives a qualified amount or a Danish sentence. It does not receive `X-AppSecretToken`, `X-AgreementGrantToken`, or the encrypted token text. There is no client-side e-conomic call.
- `economicGet` rejects any path outside the allowlist.
- Optional `liquidityMinimumDkk` and `overdueReceivablesAlertDkk` are read if they are already finite numbers on the existing jsonb config. They are not written, and they are not added to the settings type.
- Action-gate strict: 482 writing actions, 437 gated, 45 exceptions, 0 failures. The new loader is not a writing action. Unauth: the same two pre-existing actions (`trackEmailOpen` server-only, `requestPasswordReset` intentionally public), 0 client-exposed failures. `assert-server-only-helpers` passed, including the existing raw-role ceilings.
- Inactive or missing profiles still fail closed through `getAuthenticatedClientWithRole`.
- Cost columns and montør cost visibility were not changed.

## Finance correctness findings

- Booked bank balance is the configured general-ledger account. The screen calls it bogført. Actual bank balance is always unavailable. There is no PSD2 or realtime bank figure.
- Missing configuration is `configuration_required`, not 0. A failed probe, a timeout, a failed account read, or a body without a numeric balance is `error`, not 0. Balance 0 with source `economic_ledger` is a real zero.
- Opening cash is that booked balance. Expected incoming is open customer receivables by due date, cumulative through day 30, 60, and 90, including overdue and excluding undated and anything after day 90. Due today is inside 30 days and is not overdue. Under 0.50 kr stays in the overdue inflow and is not listed as an overdue debtor.
- Expected outgoing is not the supplier invoice total. CRM does not store a supplier remainder, and this batch does not call an e-conomic creditor-remainder endpoint. `openPayables`, overdue payables, and every horizon's expected outgoing are `unavailable` when the supplier list loaded, and `error` when it did not. The amount is null. Projected cash is therefore null in production. The formula opening + incoming − outgoing is unit-tested with three known amounts and is not shown from bank plus receivables alone.
- Approved and posted supplier invoice totals remain on the page as fakturabeløb, in a section that says they are not subtracted. Awaiting and received invoices are not cash outflow. Duplicates are excluded. Stored sign is kept. Non-DKK is not added to DKK.
- A missing due date is unscheduled and is outside the 30/60/90 sums.
- A failed CRM read is not passed in as an empty list. Empty and successful is a real zero. A null invoice amount makes receivables unavailable.
- Stale means the in-memory read timestamp is older than 24 hours (`FINANCE_STALE_MS`). A live successful GET in the same request is fresh. The timestamp is not stored.
- Alerts fire only for a booked read error, a stale booked balance, missing bank configuration, projected cash below a configured finite minimum, or overdue receivables above a configured finite threshold. Unknown amounts do not fire the threshold alerts. Unavailable payables do not alert by themselves.
- Bookkeeping design states: draft, pending_approval, approved, booking, booked, plus rejected, failed, cancelled. `failed` does not auto-retry. Later tables, not created: `finance_postings`, `finance_posting_lines`, `finance_posting_approvals`. Audit can reuse `audit_logs` and `accounting_sync_log`. `BOOKKEEPING_WRITES_IN_THIS_BATCH` is false.
- Payroll design steps: import, validation, proposed journal, manual approval, e-conomic. No salary calculation and no salary posting. `PAYROLL_WRITES_IN_THIS_BATCH` is false.
- `wouldWrite` on the page foundation stays false. UNCERTAIN, duplicate-write protection, and the push flag were not weakened.

## Tests

Run from the worktree. No browser. The new screen was not clicked.

- `node node_modules\tsx\dist\cli.mjs scripts\grok-finance-1-test.ts` — ok. Covers complete data, missing bank configuration, missing due date, a real zero balance, a failed read, a timeout outcome, no credentials, no economic permission, stale data, permission refusal for montør, and Ukendt instead of 0 kr on failure.
- `node node_modules\tsx\dist\cli.mjs scripts\invoice-totals-test.ts` — all passed
- `node node_modules\tsx\dist\cli.mjs scripts\invoice-preview-load-test.ts` — ok. The preview slice does not include `economicGet`.
- `node node_modules\tsx\dist\cli.mjs scripts\economic-timeout-test.ts` — ok. Fetch is mocked. The kill switch still blocks a write with no call. No live e-conomic write.
- `node node_modules\typescript\bin\tsc --noEmit --pretty false --incremental false` — exit 0
- Action-gate strict: 482 writing, 437 gated, 45 exceptions, 0 failures
- Action-gate unauth: 0 client-exposed failures
- `scripts/action-gate-audit-test.ts` and `scripts/assert-server-only-helpers.ts` — passed
- `check:rls-matrix` was not run. No migration or RLS change

## Migrations needed later

None in this batch. No file was added under `supabase/migrations`.

When approval-based bookkeeping is implemented, it will need new tables for `finance_postings`, `finance_posting_lines`, and `finance_posting_approvals`, with RLS, grants, and an audit path that keeps `accounting_sync_log` and the UNCERTAIN claim. That SQL must be shown and approved before it is created. Payroll import may need its own staging table later. Do not reuse `case_materials` or migration 00247 for either.

A supplier remainder still needs either a stored payment column or a verified e-conomic payable read. That is a later product decision, not a migration in this batch.

## What Claude must review

- Projected cash is unavailable on purpose. Supplier invoice totals are not open liabilities and are not subtracted. Do not "fix" that by treating the invoice total as a remainder.
- Open amount is delegated to `sentOpenAmount` / `creditTotalsByOriginal`. Null amounts become unavailable before that helper's `Number(null ?? 0)` path.
- Overdue uses the existing 0.50 kr floor. A smaller open amount still sits in the cumulative incoming.
- Booked balance is one configured ledger account. Actual bank balance is a constant unavailable value.
- `economicGet` allowlist, the timeout reason, and the rule that a full collection page is not a company total.
- The dashboard cell calls `loadFinanceDesk` for every `economy.view` user. Only `settings.economic` reaches e-conomic, so a bookkeeper can wait on the 10 second read timeout. A serviceleder does not.
- Alert thresholds are read from config keys that are not in the typed settings object. No default minimum was invented.
- The old health summary's zero-on-error behavior was left as it is.
- Bookkeeping and payroll modules must stay unwired to HTTP until a later approved batch.

## What remains blocked

- No e-conomic write, approval, posting, payment, or payroll amount. `ECONOMIC_PUSH_ENABLED` stays off.
- No migration. 00246 and 00247 were not applied.
- No supplier order, Relatel, SMS, webhook, or Telegram send.
- No verified open-payable remainder, so no numeric cash forecast in the product path.
- Booked-invoice and booked-entry readers stay unmounted.
- No persisted finance-read timestamp and no new cash-minimum setting.
- Screens were not clicked in this session.

## What must not be merged

- Do not merge `grok-finance-1` to main without review
- Do not turn on `ECONOMIC_PUSH_ENABLED`
- Do not treat the supplier total as cash already payable
- Do not call the booked ledger balance a live bank balance
- Do not sum bank movements into a balance
- Do not render a failed read as 0 kr
- Do not apply 00246 or 00247 from this branch
- Do not merge `grok-features-3` as part of this branch

## Next high-value queue

- A verified e-conomic GET of open supplier remainders, with fail-closed paging, or a stored payment on the supplier invoice. Until one of those exists, keep projected cash unknown.
- Mount booked entries only when a full paged read can fail closed instead of summing one page.
- Approval-based bookkeeping on the design states, still behind the kill switch, an explicit confirmation, and a migration Henrik has approved.
