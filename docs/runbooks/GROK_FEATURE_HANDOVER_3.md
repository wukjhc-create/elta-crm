# Grok feature handover 3

Review prompt: "Gennemgå Groks seneste arbejde."

The tip of this branch is `git rev-parse origin/grok-features-3`. This file cannot name the commit that contains it. Product work ends at parent `8cd01267`.

Branch: `grok-features-3`. Worktree: `C:\Dev\elta-crm-grok-features`. Not merged to main.

Base main: `b3f152b2284608774b18be1ebc702606bae51232` (`chore(prod): Grok batch 2 integreret — deploy 82e8454, prod-smoke 12/12, 00246 intakt`).

Push used `git push -u origin grok-features-3`. A command whose text is exactly `git push origin ` is denied locally before git runs.

Telephony persistence and migration 00247 were not touched.

## DONE

- The incoming-invoice review screen shows purchasing signals from the existing control: duplicate product lines, and a catalogue price that moved at least 5 percent and at least 0.50 kr per unit since the invoice date. One krone on an expensive item does not raise the light. Freight, fees, a missing case, and a missing purchase order stay on the existing light. A missing price is Ukendt, not 0. Nothing is approved, posted, or paid.
- When the supplier invoice has stored extracted text (`incoming_invoices.raw_text`), the review screen shows a document suggestion from that text. The raw text is not printed. An empty text does not use the filename as a read.
- A catalogue row with a known purchase price can be added to a visible case through `createCaseMaterial`. If the case has exactly one open work order, the line is attached to it. Several work orders are not guessed. No supplier order is sent.
- The office dashboard adds overdue tasks, jobs tomorrow, and open cases with no unfinished task and no planned or in-progress work order. A failed read is Ukendt. Counts the user may not see are omitted.
- The assistant answers overdue tasks, jobs today, cases without a next action, and supplier invoices waiting for review. The answers link to the existing screens and do not approve or send.

## PARTIAL

- Expected quantity is not compared. `matched_purchase_order_id` is reserved and there is no purchase-order line table. A missing quantity is not turned into a finding or into 0.
- Document suggestion is mounted only on the supplier-invoice review, and only when `raw_text` is non-empty. Customer documents have no extracted-text column. `description` is not treated as a file read. No OCR.
- A montør can search the catalogue and open the case materials tab. This screen does not create the line for them.

## BLOCKED

- `case_materials.unit_cost` is `NOT NULL DEFAULT 0`, and `total_cost` is generated from it. Unknown cannot be stored without a migration. The new catalogue add refuses a hidden or unknown price. The older Tilføj materiale path still stores 0 for a user who cannot see cost. That path was not changed. No migration was written or applied.
- Do not apply 00246 or 00247 from this branch. No Relatel, SMS, webhook, Telegram send, e-conomic write, or supplier order.

## Employee capability

- A reviewer of a supplier invoice sees duplicate lines, a real price movement, unknown prices, and a text suggestion when the invoice text exists. They still approve elsewhere.
- An employee who may see purchase prices can confirm a quantity and add a known catalogue product onto a case.
- The office dashboard links overdue tasks, idle cases, and tomorrow's jobs.
- The assistant lists those same queues without writing.

## Security findings

- Catalogue cost is still read with the admin client only behind `materials.view.cost_prices`. A user without that permission cannot use the new add action.
- The add checks `materials.add_to_case` and `userCanViewCase` with the caller's effective permissions.
- Invoice text is not rendered. The suggestion is a label.
- Action-gate strict: 483 writing actions, 438 gated, 45 exceptions, 0 failures. The new add action is one of the gated writes.
- Unauth audit: 0 client-exposed failures. The same two pre-existing actions remain.

## Finance findings

- Movement amount is per unit, not a line total.
- A catalogue price of 0 is not a known price and does not become green.
- The new add stores the existing case-material sale and cost from `supplierLinePricingBatch` only when both are greater than 0. Otherwise it does not insert.
- The older montør insert still stores unit cost 0. Profit code can still treat that 0 as a real cost until a migration allows unknown.
- No second finance engine. No automatic approval, posting, or payment.

## Tests

- `node node_modules\tsx\dist\cli.mjs scripts\grok-features-3-test.ts` — all passed
- `node node_modules\tsx\dist\cli.mjs scripts\grok-features-2-test.ts` — all passed
- `node node_modules\tsx\dist\cli.mjs scripts\grok-features-batch-test.ts` — all passed
- `node node_modules\typescript\bin\tsc --noEmit --pretty false --incremental false` — exit 0
- Action-gate strict, unauth, audit test, and server-only helpers passed
- `check:rls-matrix` was not run. No migration or RLS change
- The new screens were not clicked. This session has no browser

## Migrations required

None applied. To stop hidden cost being stored as 0, `case_materials.unit_cost` (and the generated `total_cost`) must be able to represent unknown. That needs Henrik's approval and a new migration number. Do not use 00247 for it. 00247 belongs to Claude's telephony track.

## What Claude must review

- The movement rule: at least 5 percent and at least 0.50 kr per unit. One krone alone does not alarm
- Null expected quantity no longer raises `qty_expected_unknown`
- Duplicate lines are the same supplier product and the same sign of quantity
- `addKnownCatalogueProductToCase` refuses unknown cost and uses the existing pricing function
- Cases without a next action means no open task and no planned or in-progress work order
- Invoice suggestion uses `raw_text` only and does not display it

## What must not be merged

- Do not merge `grok-features-3` to main without review
- Do not apply a migration, including 00246 and 00247
- Do not enable Relatel, SMS, webhooks, Telegram sends, e-conomic writes, or supplier ordering
- Do not treat the catalogue add as a live KlarPris order
- Do not treat a filename as a document that was read

## Next high-value queue

- A migration so case-material cost can be unknown, then stop the older path from writing 0
- Expected quantity only after a real purchase-order line exists
- Document suggestion on a customer file only after a real text column exists
- Leave the montør flow alone apart from that cost fix
