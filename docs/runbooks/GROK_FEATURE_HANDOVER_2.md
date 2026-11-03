# Grok feature handover 2

Review prompt: "Gennemgå Groks seneste arbejde."

The tip of this branch is `git rev-parse origin/grok-features-2`. This file cannot name the commit that contains it. Product work ends at parent `294b82cc`. The commit after that is this handover.

Branch: `grok-features-2`. Worktree: `C:\Dev\elta-crm-grok-features`. Not merged to main.

Base main: `3354159555cce6a280f9a05627e3397a804b922b` (`chore(prod): 00245 anvendt i prod`).

`origin/main` has since moved to `2e08a439` (docs only: schema parity and a rewritten telephony proposal called 00246, not applied). That commit is not in this branch. Do not merge it from here.

Push used `git push -u origin grok-features-2`. A command whose text is exactly `git push origin ` is denied locally before git runs.

## DONE

- Callback from the call card is an existing customer task. It is marked `assistant_callback`, assigned to the signed-in user, and `reminder_at` is forced null so the Telegram reminder sweep does not see it. Several open cases must be chosen. An unknown or ambiguous number creates nothing. A unique customer shows the existing communication timeline. The queue shows the assignee. No call, SMS, or webhook registration.
- CRM assistant writes require a second confirmation and a unique case, employee, booked inspection, or mail. A move changes only `due_date` on the booked inspection task and does not send customer mail. Assign changes only `assigned_to`. A note and a mail-to-case link use the existing actions. "Flyt besigtigelse til fredag kl. 10" without a case number stays refused. New reads: jobs tomorrow, unresolved mail without a case plus open callbacks.
- Catalogue screen at `/dashboard/materials/lookup` (`materials.view`). Search by SKU, EAN, or name in the known catalogue. A missing price is unknown. Purchase price is loaded only with `materials.view.cost_prices`, and only `id, cost_price`. A failed price read says it could not be read. One visible case is a link to the existing order page. The screen does not insert a line and does not order.
- Invoice traffic light can take optional purchasing lines: expected quantity, catalogue price, duplicate line, price movement. Unknown and a failed read outrank green. Amounts stay null when the price is missing. Nothing is approved, posted, or paid.
- Office dashboard lists callbacks waiting, mail linked but without a case, open cases missing a power of attorney, supplier invoices in review, employees missing a rate, and jobs today and this week (Monday–Sunday, Europe/Copenhagen). A failed read is Ukendt. Unbilled work that cannot be read is no longer shown as 0. A job row links to the customer page when `customer_id` is set.
- Document suggestion is a pure function. Filename or subject alone sets `readFile` false. It writes nothing and does not create a power of attorney.

## PARTIAL

- Purchasing findings are not shown on the invoice screen. Passing a null expected quantity for every line would turn otherwise green invoices yellow. The loader has no agreed quantity.
- Document suggestion is not mounted on a document page. There is no safe extracted-text pipeline on customer documents. No file was read.
- Call history is customer tasks plus the existing timeline. Calls are not stored in `telephony_events`.
- Mobile change is one customer link on the existing job row. Photos, job alerts, and certificates were not added. The montør flow was not redesigned.
- Choosing a material for a case is a link into Tilføj materiale. This screen does not create the line.
- `getEmployeeRateGapsAction` still ignores a `company_settings` read error. That is pre-existing. An employee-list failure becomes Ukendt. A numeric rate of 0 is still a present rate.
- `createCaseMaterial` still stores unit cost 0 when the user cannot see cost. That stored 0 was not changed.

## BLOCKED

- No migration was applied. Do not apply the telephony draft or main's unapplied 00246.
- Relatel calls, Relatel SMS, Relatel webhook registration, Telegram live sends, e-conomic writes, supplier orders, and new automated customer sends stay off. No secrets were changed.

## Employee capability

- On the CTI card, an employee can save a callback that appears in the callback queue, pick the case when several are open, save a phone note, and see recent communication for one matched customer.
- On the assistant, an employee can confirm a move, an assignment, a customer note, or a mail link, and can ask for today's callbacks, missing powers of attorney, tomorrow's jobs, and unresolved mail and calls.
- An employee with `materials.view` can search known supplier products. A montør does not see purchase prices. A cost role sees the known price, Ukendt, or that the price could not be read.
- The office dashboard shows the exception queues. A montør job row can open the customer.

## Tests

- `node node_modules\tsx\dist\cli.mjs scripts\grok-features-2-test.ts` — ALL PASS
- `node node_modules\tsx\dist\cli.mjs scripts\grok-features-batch-test.ts` — ALL PASS
- `node node_modules\typescript\bin\tsc --noEmit --pretty false --incremental false` — exit 0
- Action-gate strict: 482 writing, 437 gated, 45 exceptions, 0 failures
- Unauth audit: 0 client-exposed failures. The same two pre-existing actions remain (`trackEmailOpen` server-only, `requestPasswordReset` public)
- `action-gate-audit-test.ts` and `assert-server-only-helpers.ts` passed
- `check:rls-matrix` was not run. No migration or RLS change was made
- The new screens were not clicked. This session has no browser

## Migration proposals

None added. This branch still has the older `docs/runbooks/telephony-events-proposal.md`. `origin/main` `2e08a439` rewrote that file and calls the draft 00246. It is not applied. Do not add a numbered file under `supabase/migrations`.

## Feature flags

No new flags. `RELATEL_ENABLED`, `RELATEL_LIVE_CALL_ENABLED`, and `RELATEL_SMS_ENABLED` stay default off. The webhook still answers `persisted: false` when the flag is on and a valid test secret is presented, and 404 when the flag is off. KlarPris live API stays off.

## Security and finance

- Catalogue cost uses the admin client only behind `materials.view.cost_prices`, and only two columns. The user client selects public columns.
- No second finance engine, task engine, or communication history.
- Assistant move does not call `bookBesigtigelse`.
- The client cannot set a free-form `auto_rule`. `callbackQueue` is the only new write switch, and it forces `reminder_at` null.
- Missed-call tasks and Telegram-created reminders were not retargeted.
- Unknown, unreadable, and hidden prices are not shown as 0.

## What Claude must review

- `callbackQueue` on `createCustomerTask` and the forced null reminder
- Confirmed assistant writes: move (`due_date` only), assign (`assigned_to` only), note, `linkEmailToCase`
- Admin cost read on the catalogue screen
- Purchasing thresholds: duplicate line is red, a catalogue price of 0 is not green, movement is 1 kr or 5 percent. These checks are not on the invoice screen
- `no_purchase_order` still does not raise an otherwise green light
- Power-of-attorney count is capped at the 200 newest open cases
- "Mail uden sag" means linked, not archived, and `service_case_id` is null. It is not the requires-response count
- `origin/main` `2e08a439` is not in this branch

## What must not be merged

- Do not merge `grok-features-2` to main without review
- Do not apply the telephony draft or 00246
- Do not enable Relatel, SMS, webhook registration, Telegram sends, e-conomic writes, or supplier ordering
- Do not treat the catalogue screen as a live KlarPris price
- Do not treat a filename suggestion as a document that was read

## Next high-value queue

- Show purchasing lines on an invoice only where a real expected quantity or a real previous price exists
- Mount document suggestion only where extracted text already exists. Do not OCR
- Persist calls only after Henrik approves the telephony migration
- Leave the montør flow alone unless a change is a real job step
