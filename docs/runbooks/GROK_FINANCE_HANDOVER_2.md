# Grok finance handover 2

Review prompt: "Gennemgå Groks seneste arbejde." Review `origin/grok-finance-2`.

The tip of this branch is `git rev-parse origin/grok-finance-2`. This file cannot name the commit that contains it. Product work ends at parent `26d7385cdfc73583f59f37871390d6694be5c9dc`.

Branch: `grok-finance-2`. Worktree: `C:\Dev\elta-crm-grok-features`. Not merged to main. Not deployed. No migration applied.

Base main: `b5c803798d1559007370add7785f76929daa6af5` (`fix(finance): 00248-rettelser fra staging-beviset`). The branch was cut from that commit. `origin/grok-finance-1` at `358ebaa6` is not an ancestor of this branch. The reviewed cash-position behaviour from batch 1 is already on this base. Do not commit batch 2 onto `grok-finance-1`.

Push used `git push -u origin grok-finance-2`. A command whose text is exactly `git push origin ` is denied locally before git runs.

Telephony, migration 00247, and Grok feature batch 3 were not touched. `ECONOMIC_PUSH_ENABLED` was not turned on. No e-conomic write was sent. No second e-conomic client was added.

Screens were not clicked. Verification is the unit tests below.

## What this batch adds

A read-only creditor remainder on `/dashboard/finance`. The number is the signed `remainder` on booked e-conomic entries, in the entry currency. It is not the CRM supplier invoice total. The invoice-total table is still on the page and is still labelled as an invoice total. It is not subtracted from projected cash.

Projected 30/60/90 cash becomes a number only when the booked bank balance, the open customer receivables, and this creditor remainder are all usable, and the remainder read is complete and only DKK. Any other case leaves projected cash unknown. Unknown is not rendered as 0 kr. A finished empty remainder is a real 0.

## Endpoints researched and selected

Official source: classic REST docs at `https://restdocs.e-conomic.com/`, read on 2026-11-09. That host matches `ECONOMIC_BASE` (`https://restapi.e-conomic.com`).

Selected:

- `GET /accounting-years` to list years. `year` is `YYYY` or `YYYY/YYYY`.
- `GET /accounting-years/{YYYY}/entries` for each four-digit year.

Query, not part of the path: `pagesize=1000`, `skippages` incremented from 0, and

`filter=entryType$eq:<type>$and:remainder$ne:0`

for each of `supplierInvoice`, `supplierPayment`, `openingEntry`, `transferredOpeningEntry`.

The allowlist is only the path. A query string, a slash year, `/entries/1`, `/totals`, `/periods`, `/vouchers`, and `/booked-entries` are rejected before `fetch`.

Documented entry fields used: `remainder` ("The remainder on the entry"), `currency` (ISO 4217), `dueDate` (`YYYY-MM-DD`), `entryType`, `entryNumber`, `supplier.supplierNumber`, `supplierInvoiceNumber`. The accounting year comes from the year list.

Not used: `amount` ("The total entry amount"), `amountInBaseCurrency`, `remainderInBaseCurrency` ("The remainder in base currency"). There is no base-currency code on the entry. Nothing is converted to DKK.

Rejected:

- `https://apis.e-conomic.com` Booked Entries API. It is a second host and would be a second client. Its schema agrees that `remainder` is the open amount and that `matchedAmount` belongs to a match pair, not to the entry.
- `POST /booked-entries/match`. That is a write.
- `GET /suppliers/{supplierNumber}`. The supplier resource has no remainder.
- `GET /invoices/booked`. That collection is customer open items.
- Journals, drafts, and `nextPage` URLs. Official pagination links are not followed. `skippages` stays on the allowlisted path. Following `nextPage` would be an open redirect.

A public demo GET (headers `demo` / `demo`, not an ELTA agreement) was used while choosing the rule. It is not a production read:

- An unpaid supplier invoice had a negative `remainder` equal to `amount`, with `dueDate` and `supplier.supplierNumber` set. One EUR line had `remainder` -4000 and `remainderInBaseCurrency` -29756.33.
- An unmatched `supplierPayment` had a positive `remainder` equal to `amount`, its own supplier, and no due date. It is not already inside the invoice remainder.
- Matched payment lines and contra lines had `remainder` null and `supplier` null. The filter `remainder$ne:0` still returned those null lines.
- The demo had no row where `remainder` differed from `amount`. The code still uses `remainder`.
- One `openingEntry` request returned HTTP 503. That is a failed read, not an empty set.

## Completeness and pagination

`parseCollection` is unchanged. A page is complete only when `pagination.nextPage` is empty and `collection.length` is strictly less than `pagesize`. A full page of 1000 is not a total. An exactly full last page is therefore unknown.

`pagination.results`, when present and a non-negative integer, must be the same on every page and must equal the number of collected rows. A missing `results` does not by itself fail a short page. A non-integer `results` fails the read.

Caps: 5 pages of years at 100 rows, and 20 pages per entry type per year at 1000 rows. Hitting a cap before the set ends is unknown. The rows already collected are not summed.

A body without `collection` is unknown, not zero rows. An empty finished collection is a real empty set.

A year that is not exactly four digits, including `YYYY/YYYY`, makes the whole creditor read unknown. The year is not skipped and its `self` URL is not opened. A repeated year or a repeated `(year, entryNumber)` is unknown.

## Currency, dates, and partial payments

Sums are per currency, with `roundMoney` on each addition. `dkkToPay` and the 30/60/90 figures are numbers only when every open remainder is `DKK` (or the set is empty). One foreign remainder makes every DKK to-pay figure null. The foreign amount is listed in its own currency. Null or lowercase currency is unreadable, not DKK. Customer invoices still treat a null currency as DKK. Supplier entries do not.

`dueDate` null is allowed and is unscheduled. It is in the open-creditor total and outside 30/60/90. A non-date is unreadable. Due today is not overdue. Horizons are cumulative: overdue + due within N days. Later than 90 days is outside the 90-day outgoing.

A remainder of exactly 0 is settled and ignored. A partial payment is the invoice `remainder`, so an `amount` of -1000 and a `remainder` of -400 contributes 400 still to pay. `remainderInBaseCurrency` is ignored.

The signed sum is what the supplier account still has open. A negative sum means the company owes. The shown "to pay" is `-sum`. An unmatched supplier payment has a positive remainder, lowers that figure, and can make it negative. Do not take the absolute value. A matched payment has no remainder in the demo, so it is not added again.

## Failure semantics

| Situation | Creditor state | Shown amount | Projected 30/60/90 |
| --- | --- | --- | --- |
| Reader not supplied, or credentials missing | not read | previous gap, null | unknown |
| Settings row failed | error | null | unknown |
| HTTP error, timeout, thrown client | error | null | unknown |
| Incomplete page, bad row, bad year, cap, results mismatch | unknown | null | unknown |
| Complete, with a non-DKK remainder | known, not DKK-only | null in DKK; currency list kept | unknown |
| Complete, DKK only, including a real empty set | known | the number, including 0 | number, when bank and receivables are also usable |

A failed read never renders as 0 kr. A failed CRM invoice list does not replace a successful remainder, and a failed remainder does not fall back to the invoice total. The invoice-total column stays on the page either way.

`economic_open_items` is a usable source, ranked after `crm_open_items` and before `economic_ledger`. `formatQualifiedKr` prints kroner only for a usable finite amount.

The dashboard alert tile still does not call e-conomic and still does not judge minimum cash. The finance page can raise the existing minimum-cash alert only when projected cash is a real number.

## Permissions and CRM matching

The creditor GET runs only when the user has `settings.economic` and `incoming_invoices.view`, and the stored credentials are ready. `serviceleder` has `economy.view` and `incoming_invoices.view` and does not have `settings.economic`, so that role does not trigger the GET. The page itself still requires `economy.view`. Reads use `economicGetWithSettings` only. They do not write `accounting_sync_log` or `last_sync_at`.

Supplier link: `suppliers.external_provider === 'economic'` and `external_supplier_id` trimmed equals `String(supplierNumber)`. Zero hits stay on the row as unmatched, with no link. Two hits are ambiguous, with no link. A failed or capped supplier list (200 000 rows) is unknown: no link, and the remainder is unchanged. Names, email, and CVR are not used. `007` does not match supplier 7.

Incoming-invoice link: only after a unique supplier match, and only when exactly one `incoming_invoices` row has the same `supplier_id`, `external_provider === 'economic'`, and trimmed `external_invoice_id` equal to `supplierInvoiceNumber`. No invoice number means no document link. An invoice-number match without the supplier is not used. A failed invoice read removes the link and keeps the remainder.

Columns used, from migrations 00043 and 00094 and the existing selects: `suppliers.id`, `name`, `external_supplier_id`, `external_provider`; `incoming_invoices.id`, `supplier_id`, `external_invoice_id`, `external_provider`. The user client and `fetchAllRows` are used. No new table.

## Files changed

Product parent `26d7385c`:

- `src/lib/economic/read-model.ts` — allow `GET /accounting-years/{YYYY}/entries`
- `src/lib/economic/supplier-remainder.ts` — classify, sum, and match. No HTTP
- `src/lib/economic/read.ts` — `readOpenSupplierRemainders`
- `src/lib/finance/cash-position.ts` — optional creditor input; projected cash uses it only when complete and DKK-only
- `src/lib/finance/finance-desk.ts` — permission gate, reader, conservative links
- `src/app/dashboard/finance/page.tsx` — source label, remainder section, currency on a queue row
- `scripts/grok-finance-2-test.ts`
- `scripts/grok-finance-1-review-test.ts` — allowlist and the POST scan include the new files

`src/lib/services/economic-client.ts` was not changed. `ECONOMIC_PUSH_ENABLED` was not changed.

## Tests

- `node node_modules/tsx/dist/cli.mjs scripts/grok-finance-2-test.ts` — ok
- `node node_modules/tsx/dist/cli.mjs scripts/grok-finance-1-test.ts` — ok
- `node node_modules/tsx/dist/cli.mjs scripts/grok-finance-1-review-test.ts` — ok, 185
- `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false` — exit 0. The same command without a larger heap ran out of memory. That was the process heap, not a type error.
- `scripts/action-gate-audit.ts --strict` — 484 writing, 439 gated, 45 exceptions, 0 failures
- `scripts/action-gate-audit.ts --unauth` — 0 client-exposed failures
- `scripts/action-gate-audit-test.ts` — pass
- `scripts/assert-server-only-helpers.ts` — pass

`check:rls-matrix` was not run. No RLS change. No live ELTA e-conomic call. No browser pass.

The batch 2 script covers: remainder instead of amount, base currency ignored, contra line ignored, partial page unknown, results mismatch unknown, page cap unknown, slash year unknown, empty set is 0 kr, HTTP 503 and timeout and network failure are errors and not 0, foreign currency keeps projected cash unknown, missing due date stays out of the horizons, due today is not overdue, unmatched payment keeps its sign, ambiguous supplier is not linked, a failed supplier or invoice list keeps the amount, serviceleder does not call the reader, missing credentials do not call it, a failed read does not fall back to the 999 invoice total, and the dashboard tile function does not call the reader.

## Known limitations

- An accounting year stored as `YYYY/YYYY` cannot be requested. The whole remainder is then unknown rather than a partial sum.
- An entry type outside the four above is ignored. A `financeVoucher` or `systemEntry` with a supplier remainder is not in the total. If ELTA posts supplier debt that way, the page can understate it while still showing a number. That has not been checked against ELTA's books.
- The demo filter returns null-remainder lines. A line with a supplier and no numeric remainder fails the whole read. A line with neither is ignored. If ELTA keeps the supplier on a matched line whose remainder is null, the page stays unknown instead of showing a sum.
- An unmatched supplier payment is included with its sign. The booked bank balance already includes that payment. A dated positive remainder can therefore make projected cash higher. The figure is the open supplier-account net. It is not a forecast that the supplier will refund the money. Matching the payment later does not move cash.
- Creditor lines do not use the customer 0.50 kr overdue threshold. A remainder of 0.01 counts.
- The supplier and invoice match is exact after trim. It is not case-folded.
- The dashboard tile still cannot see this remainder, because it must not call e-conomic on every dashboard load.
- The public demo is not ELTA. This batch did not read ELTA's agreement.
