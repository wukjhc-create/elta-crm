# Claude review: Grok Finance Batch 2 (creditor remainders)

**Review date:** 2026-11-12.

**Reviewed:** `origin/grok-finance-2` at `a9d609be`, based on main `b5c80379`.

**Fixes:** on branch `claude-finance-2-review`, based on `grok-finance-2`.

**Constraints kept:**
- No migration.
- No live ELTA e-conomic call; production has no e-conomic settings row.
- No external write.
- `ECONOMIC_PUSH_ENABLED` untouched.

## Sources

The official documentation was read on 2026-11-12, with no authenticated call:

- `https://restapi.e-conomic.com/schema/accounting-years.accountingYear.entries.get.schema.json`
  - `entryType` enum (10 values): `customerInvoice`, `customerPayment`, `supplierInvoice`, `supplierPayment`, `financeVoucher`, `reminder`, `openingEntry`, `transferredOpeningEntry`, `systemEntry`, `manualDebtorInvoice`.
  - `supplier`: "The supplier for this entity."
  - `customer`: "The customer for this entity."
  - `remainder`: "The remainder on the entry."
  - Filterable fields include `remainder`, `entryType`, `supplier.supplierNumber` and `customer.customerNumber`. `account.accountNumber` is *not* filterable.
- `restdocs.e-conomic.com`: the maximum page size is 1000.

**What the documentation does not say:**
- That `supplier` is set only on particular entry types.
- Whether an entry in a closed year keeps its remainder after its balance is carried into the next year.
- The sign convention for `remainder`.

## Findings

### S1: creditor total could be understated while shown as a number (fixed)

Grok read only `supplierInvoice`, `supplierPayment`, `openingEntry` and `transferredOpeningEntry`. The request used `filter=entryType$eq:…`, so other types never even reached the code.

The official enum has 10 types. Nothing in the documentation ties a supplier remainder to those four. A supplier remainder posted as `financeVoucher` or `systemEntry` (for example a cash-journal posting to a supplier, or a currency adjustment) was therefore missing from a total that was still shown as known. Completeness was not provable.

**Fix:**
- One read per accounting year with `filter=remainder$ne:0` and **no type filter**.
- Each row is attributed only by its own `supplier` and `customer` reference (see the semantics below).
- Any open item that can't be attributed makes the whole read UNKNOWN.

### S2: possible double count across accounting years (fixed)

The reader adds up remainders from **every** accounting year. The documentation does not say whether an old-year entry keeps its remainder when the balance is carried into the new year as `transferredOpeningEntry` or `openingEntry`. If it does, the same debt is counted twice.

The existing duplicate check, on (year, entryNumber), does not catch this.

**Fix:** if a supplier has an opening-type entry in year Y and an open item in an earlier year, the read is UNKNOWN. It is never a sum of both.

### S2: projected cash could be too optimistic (fixed)

- **Undated debt.** DKK supplier debt with no due date was left out of 30/60/90 with no warning. Projected cash was then higher than the real position, but still a number.
  - **Fix:** if net undated DKK debt is below 0, the 30/60/90 outgoing, and so projected cash, are UNKNOWN, with the reason shown on the page ("uden forfaldsdato"). The total open debt is still shown.
- **Supplier credits.** A credit note or an unmatched payment inside a horizon could make outgoing negative. A supplier credit would then count as money coming in.
  - **Fix:** each horizon's outflow is floored at 0. The open-debt total still shows the true net.

### S3: noted, not changed

- **Sign convention.** The rule that a negative `remainder` means the company owes comes from Grok's reading of the official public demo agreement, not from the documentation.
  - The first real ELTA setup should check it with one known invoice, as a read-only GET.
  - Production has no e-conomic settings row today, so the page shows nothing there.
- **A full last page counts as unknown.** A page with exactly 1000 rows on the last page is unknown. That is strict and correct, and rare.
- **`results` is optional.** When `pagination.results` is missing, only the short-page rule decides.
- **No live verification.** None of this has been checked against ELTA's own books, which aren't connected.

### Reviewed with no finding

| Area | Assessment |
|---|---|
| Remainder vs invoice total | Only `remainder` is used. `amount` and `remainderInBaseCurrency` are not. The CRM invoice total stays labelled and is never used as debt |
| Partial payments | The invoice's own `remainder`, e.g. −1000 with −400 open counts 400 |
| Unmatched payments | Positive remainder, sign kept; lowers the total. With no due date it does not block the horizons, because it isn't owed |
| Foreign currency | Each currency is summed separately and not converted. One non-DKK remainder makes every DKK figure and projected cash unknown |
| Due dates | Due today is not overdue. Horizons are cumulative. Later than 90 days is outside |
| Pagination | `skippages` on the allowlisted path only; `nextPage` URLs are not followed. Complete only on a short page. A `results` mismatch or hitting the cap is unknown |
| Accounting years | All years listed; a non-4-digit year (YYYY/YYYY) is unknown; a repeated year is unknown |
| Duplicate entries | (year, entryNumber) repeated is unknown |
| Supplier/invoice matching | Exact `external_supplier_id` with provider economic; ambiguous or unknown gives no link. The invoice link needs the matched supplier plus exactly one invoice number. Links never change amounts |
| Permission gates | Page: `economy.view`. Creditor read: `settings.economic` and `incoming_invoices.view`, effective permissions. Serviceleder does not trigger the read. The dashboard tile never calls e-conomic |
| Failure semantics | HTTP error, timeout or thrown error gives error; incomplete gives unknown. Neither becomes 0, and there's no fallback to the invoice total |
| One client, GET only, allowlist | Reads go only through `economicGetWithSettings`, which checks the allowlist (now also `/accounting-years/{YYYY}/entries`) and forces `GET`. `economic-client.ts` is unchanged. No `fetch` or `POST` in the new files |
| No external write, no push flag | Confirmed. Tests delete `ECONOMIC_PUSH_ENABLED` |

## Creditor completeness: exact semantics

Rows are read from all accounting years with `GET /accounting-years/{YYYY}/entries?filter=remainder$ne:0`. All pages must complete.

**Per row:**
- `remainder` null, and no supplier: a matched or contra line, ignored.
- `remainder` null **with** a supplier: UNKNOWN.
- `remainder` not a number: UNKNOWN.
- `remainder` = 0: ignored (settled).
- A supplier object without a positive whole-number `supplierNumber`: UNKNOWN.
- Non-zero remainder with **both** supplier and customer: UNKNOWN.
- Non-zero remainder with **neither**: UNKNOWN. It can't be attributed, so it can't be dropped silently.
- Non-zero remainder, customer only: a receivable, ignored here.
- Non-zero remainder, supplier only:
  - On a customer-side type (`customerInvoice`, `customerPayment`, `reminder`, `manualDebtorInvoice`): contradictory, UNKNOWN.
  - On **any other type**, documented or not: **counted**.
  - An ISO currency is required, a due date must be valid or null, and the entry number must be positive. Otherwise UNKNOWN.

**Across rows:**
- A repeated (year, entryNumber): UNKNOWN.
- An opening-type entry for a supplier in year Y next to that supplier's open items in an earlier year: UNKNOWN.

**Result:**
- **known** only when all of the above pass. The DKK total is a number only when every open remainder is DKK.

## Can projected cash safely be a number?

**Yes, but only when all of these hold:**
- The booked bank balance is known.
- Open customer receivables are loaded.
- The creditor read is **known** under the semantics above.
- Every open remainder is DKK.
- No net DKK supplier debt is undated.

Each horizon's outflow is floored at 0, so supplier credits are never cash coming in. In every other case projected 30/60/90 is UNKNOWN with the reason shown, never 0 and never optimistic.

## Tests

| Test | Result |
|---|---|
| `scripts/grok-finance-2-test.ts` | ok. Six expectations updated to the corrected semantics: customer item, undated ×2, reader filter/calls ×3 |
| `scripts/claude-finance-2-review-test.ts` (new) | 33/33; deliberately broken rules 6/6 caught |
| Finance Batch 1 (`grok-finance-1-test`, `grok-finance-1-review-test` 185/185), Batch 3, `test:profit`, 00248 unknown cost 156/156, `invoice-totals`, `net-invoiced`, `invoice-control` | pass |
| `tsc`, RBAC/action-gate, RLS matrix | all exit 0 |

The new review test pins: entry types `financeVoucher`, `systemEntry`, opening, payment and an unknown future type counted; unattributable, both-parties and malformed rows unknown; the cross-year rule; partial and unmatched payments; undated debt; the credit floor; foreign currency; the reader using one filter per year with no `entryType`; and static checks for no POST and no fetch.

## Verdict

**READY_FOR_STAGING** on `claude-finance-2-review`.

Recommended before production: one read-only GET against ELTA's real agreement, once it is configured, to confirm the sign convention and that no unattributable open items exist. The page shows UNKNOWN until then if they do.
