# Grok finance handover 1

Review prompt: "Gennemgå Groks seneste arbejde."

The tip of this branch is `git rev-parse origin/grok-finance-1`. This file cannot name the commit that contains it. Product work ends at parent `1def5a6e`.

Branch: `grok-finance-1`. Worktree: `C:\Dev\elta-crm-grok-features`. Not merged to main.

Base main: `b3f152b2284608774b18be1ebc702606bae51232`.

Push used `git push -u origin grok-finance-1`. A command whose text is exactly `git push origin ` is denied locally before git runs.

Telephony, migration 00247, and Grok feature batch 3 were not touched. `grok-features-3` stays at `726f020b`.

## Inventory (existing e-conomic, reused)

One client: `src/lib/services/economic-client.ts`. Base `https://restapi.e-conomic.com`. Tokens stay in `accounting_integration_settings`, decrypted only in memory. `ECONOMIC_PUSH_ENABLED` must be the exact trimmed lowercase `true` or every non-GET is refused inside `economicFetch`.

Already present GET: `pingEconomicConnection` calls `/self`.

Already present writes, all behind the kill switch, idempotency claims, and UNCERTAIN locks (network, timeout, 408, 5xx keep the claim; no automatic retry):

- `createCustomerInEconomic` POST `/customers`
- `createInvoiceInEconomic` POST `/invoices/drafts` and book
- `markInvoicePaidInEconomic` POST customer payment on the configured cash book
- `pushSupplierInvoiceToEconomic` POST supplier-invoice draft

Previews (`previewInvoiceForEconomic`, `previewSupplierInvoiceForEconomic`, `previewPaymentForEconomic`) build the payload and do not call the network. Draft shapes live in `src/lib/economic/invoice-draft.ts`, `payment-entry.ts`, and `supplier-invoice-draft.ts`.

Sync audit is `accounting_sync_log`. Settings and the manual UNCERTAIN release are `settings.economic` in `src/lib/actions/accounting.ts`. Health counts are `computeAccountingHealthSummary` in `src/lib/services/accounting-health.ts`. That summary can still show 0 when an inner read throws. This batch did not change that. The new page links to `/dashboard/settings/economic` instead of copying it.

Open customer balance already exists as `sentOpenAmount` / `computeInvoiceTotals`: sent, not voided, not a credit note, final minus amount paid minus sent/paid credits on that invoice, never below 0, DKK only, overdue only at 0.50 kr or more. This batch calls those functions.

`invoices.external_invoice_id` and `customers.external_customer_id` are the existing e-conomic links. `incoming_invoices` has no amount-paid column. `bank_transactions` are movements without an opening balance. `bankContraAccountNumber` in the e-conomic config is the only account this page will read.

## DONE

- `/dashboard/finance` (Likviditet) for `economy.view`. Menu on desktop and mobile.
- Open DKK receivables and a 30/60/90 inflow forecast from the existing open-amount rule. A failed invoice read is Ukendt. An empty successful read is 0. A null amount is Ukendt and is not sent through `Number(null)`.
- Overdue debtors link to the invoice. Due today is not overdue. Under 0.50 kr is not listed as overdue. Another currency is counted and not converted.
- Approved and posted supplier invoices show their invoice total by the same windows. The screen says payment is not stored, so the figure is not a remainder. Awaiting, received, and duplicates stay out of that total.
- Unmatched bank movements, only with `bank.view`. The count is not a cash balance. A failed count is Ukendt.
- Read-only `economicGet` on an allowlist. It does not write the sync log and does not touch `last_sync_at`. The page reads `GET /accounts/{bankContraAccountNumber}` only when `settings.economic` is held and that account number is configured. Balance 0 is kept. A missing balance is Ukendt. Without an account number, one `GET /accounting-years` checks that reading works and no year total is shown.
- Collections for accounts, customers, suppliers, open booked invoices (`remainder$ne:0`), and one year's booked entries exist as single pages. A full page is `complete: false` and is not summed.
- A bookkeeping note states that this page creates no draft. `wouldWrite` is false.

## PARTIAL

- There is no company cash total. Bank rows have no opening balance, and account balances are not summed across the chart.
- Supplier remainder is unknown. e-conomic open payables were not called. No verified payable collection was added to the allowlist.
- Booked-invoice and booked-entry readers are not mounted. One page would not be a complete ledger.
- Customer documents and e-conomic writes are unchanged.
- `computeAccountingHealthSummary` can still show 0 after a failed inner read. The new page does not repeat those counts.

## BLOCKED

- No e-conomic write, approval, posting, or payment. `ECONOMIC_PUSH_ENABLED` stays off.
- No migration. 00246 and 00247 were not applied.
- No supplier order, Relatel, SMS, webhook, or Telegram send.
- A real payable remainder needs a stored payment or a verified e-conomic payable read. Neither is invented here.

## Employee capability

- An office user with `economy.view` opens Likviditet and sees open DKK invoices, overdue invoices, and the 30/60/90 split, each linked to the underlying invoice when it is in the list.
- A user who may see supplier invoices sees which approved invoices fall due, with unknown payment marked as such.
- A bookkeeper with `settings.economic` and a configured bank account sees that one e-conomic balance. Everyone else does not trigger a token read.

## Security findings

- Invoice, supplier, and bank reads use the user client, so RLS and OWN/RELATED/ALL scope stay in force. `invoices.view.all` is labeled as the full visible set. `invoices.view.own_cases` is labeled as scope, not the whole company.
- A user without the invoice or supplier permission does not get an empty query that would look like zero. The section is hidden.
- e-conomic tokens are still decrypted only after `settings.economic`, inside the existing settings reader. The GET result returned to the page is a balance or a Danish failure text.
- `economicGet` rejects any path outside the allowlist, including drafts and a POST-shaped path.
- Action-gate strict on this branch: 482 writing actions, 437 gated, 45 exceptions, 0 failures. The new loader is not a writing action. Unauth: the same two pre-existing actions, 0 client-exposed failures.
- Inactive or missing profiles still fail closed through `getAuthenticatedClientWithRole`.

## Finance findings

- Open amount is `sentOpenAmount`. Paid status is not an open invoice, including a paid invoice whose `amount_paid` is 0. Credit notes reduce the original. They are not a second negative receivable. A credit with no original is counted and not subtracted.
- Non-DKK amounts are not added to DKK.
- Supplier totals keep the stored sign. A missing supplier amount makes that total Ukendt.
- The forecast does not subtract supplier totals from customer inflows.
- No second finance engine. Invoice-control and profit code were not changed.
- No automatic approval, posting, or payment.

## Tests

- `node node_modules\tsx\dist\cli.mjs scripts\grok-finance-1-test.ts` — ok
- `node node_modules\tsx\dist\cli.mjs scripts\invoice-totals-test.ts` — all passed
- `node node_modules\typescript\bin\tsc --noEmit --pretty false --incremental false` — exit 0
- Action-gate strict and unauth — 0 failures
- `check:rls-matrix` was not run. No migration or RLS change
- The new screen was not clicked. This session has no browser

## Migrations required

None.

## What Claude must review

- Open amount is delegated to `sentOpenAmount` / `creditTotalsByOriginal`. Null amounts on this page become Ukendt before that helper's `Number(null ?? 0)` path.
- Overdue uses the existing 0.50 kr floor. A smaller open amount still sits in the forecast.
- Supplier figures are invoice totals, not remainders.
- `economicGet` allowlist and the single configured bank account.
- A full e-conomic collection page is marked incomplete and is not shown as a company total.
- The old health summary's zero-on-error behavior was left as it is.

## What must not be merged

- Do not merge `grok-finance-1` to main without review
- Do not turn on `ECONOMIC_PUSH_ENABLED`
- Do not treat the supplier total as cash already payable
- Do not sum bank movements into a balance
- Do not apply 00246 or 00247 from this branch
- Do not merge `grok-features-3` as part of this branch

## Next high-value queue

- A verified e-conomic read of open supplier remainders, still GET-only, or a stored payment on the supplier invoice. Until one of those exists, do not show a net cash forecast.
- Mount booked entries only when a full paged read can fail closed instead of summing one page.
- Approval-based bookkeeping on top of the existing preview and export, still behind the kill switch and an explicit confirmation.
