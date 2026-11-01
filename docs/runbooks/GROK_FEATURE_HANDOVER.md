# Grok feature handover

Updated: 2026-11-01. This file on `origin/grok-features` is the review entry. When Henrik says "Gennemgå Groks seneste arbejde", read this file and the commits it names. Do not merge to main from here.

Delivery after each stable feature batch: commit on `grok-features`, push `origin/grok-features`, update this file, and push it with those commits.

## Git

- Branch: `grok-features`
- Latest product commit: `00841d57007e1a87e0395ac239d0b2871063d195` — `feat(crm): confirm mail-card and assistant task actions`
- Branch tip: the handover commit whose parent is `00841d57`. A file cannot contain the hash of the commit that contains the file. Use `git rev-parse origin/grok-features`.
- Base used: `ab2cddfae670f932770b5fc2074ed5b234e2e5cf` — `feat(pilot): P5-pilot klar`
- `origin/main` at this handover: `97ba4000c52e903f03b5fe0423c1258dac40833b`. This branch does not contain these main commits: `9cfd2d44` case-close guard, `97b199f8` handover checklist by case type, `97ba4000` offer case-type draft (00244, not applied).
- Remote: `origin/grok-features` (created 2026-11-01). Never merged to main from here.

Feature commits on the branch:

- `65fb247f` feat(relatel): telephony provider and call ingestion
- `d58fe7ec` feat(inbox): intelligent mail action cards
- `a621d93b` feat(automation): communication preview that never sends
- `96f07b7e` feat(comm): unified communication timeline
- `98e1decd` feat(assistant): shared CRM action engine
- `972eb86d` feat(invoice-control): discrepancy traffic light
- `5b53b6c7` feat(suppliers): known-catalogue price lookup
- `99c13f92` feat(settings): integration status board
- `ccc8409d` test(features): cover the grok-features batch
- `00841d57` feat(crm): confirm mail-card and assistant task actions

## DONE

No roadmap item is fully done. These existing products were left as they are, because they already exist:

- Profit engine (`src/lib/profit/engine.ts`). No second engine.
- Supplier adapters for AO, Solar and Lemvigh-Müller, including catalogue compare.
- Invoice-control engine (`src/lib/invoice-control/engine.ts`). The new traffic light wraps it.
- Existing live reminder crons. The new preview does not send and does not change them.
- Employee job flow, equipment and certificates. Not redesigned.
- Telegram command engine. The new assistant does not replace it and contains no Telegram business logic.

## PARTIAL

Employees can do the following. All of it is inside ELTA CRM.

- **Relatel.** Open Opkald (`/dashboard/cti`), look up a number, see one call card, and after confirmation create a callback task or a phone note on the matched customer. Open the callback queue at `/dashboard/cti/queue` (open tasks with `assistant_missed_call` or `assistant_callback`). A data-free page at `/relatel/cti` links out to the logged-in card. It shows no customer data.
- **Inbox.** On a mail, see a suggestion card: customer, address, likely case, attachment label, and actions. After a second confirmation the card can link the mail to that case, create a review task, or save a note, using the existing customer and mail actions. Ambiguous customers and cases are not chosen. A filename is not saved as a power of attorney. Status is not changed and no case is created.
- **Assistant.** At `/dashboard/assistant`, ask who still needs a callback, which open cases lack a power of attorney, what happened with one named customer, and which follow-ups are due. “Opret opgave for Lars på sag 2309” becomes a proposal. It is created only after confirmation, and only when exactly one visible case and, if a name was given, exactly one active employee match. Moves, sends, approvals and new customers stay refused.
- **Timeline.** On the customer, see one timeline of notes, phone notes, tasks, missed-call tasks, documents (title and type only), email and planning. A failed source is shown as a failure.
- **Suppliers.** Look up a stored catalogue product by EAN or SKU in code (`lookupKnownProducts`). A missing or zero purchase price stays null. No new screen.
- **Invoice control.** On a supplier invoice, see green, yellow, red or unknown, with the discrepancy, the reason and a suggested follow-up. A missing price or a failed read is unknown.
- **Communication preview.** Rules exist for offer follow-up (email, 4 days), inspection (both, 1 day), power of attorney (email, 3 days), missing information (email, 2 days) and callback (SMS, 0 days). Preview supports template, delay, channel, pause and dry run. `wouldSend` is always false.
- **Settings.** `/dashboard/settings/integrations` shows one read-only board: mail, Relatel, click-to-call, SMS, e-conomic writes, agent send, automation, Telegram, invoice reminders, offer reminders, existing power-of-attorney and inspection reminders, the new preview, KlarPris and supplier orders. Modes are off, test, active or error. Secrets are not shown.
- **Documents.** A filename or subject can be labelled power of attorney, supplier quote, invoice, datasheet or inspection report. Anything else stays unknown. File contents are not read.

## BLOCKED

- Real Relatel calls, SMS and webhook registration. No HTTP client exists.
- Storing call events. The webhook understands an event and answers `persisted: false` until `telephony_events` is migrated.
- Embedding `/relatel/cti` in Relatel. `vercel.json` still sends `X-Frame-Options: DENY`.
- Official Relatel webhook field list and `GET /calls` fields. Unverified. The parser accepts only our envelope (`canonical`) and a bare call object (`unverified_call`).
- KlarPris API and live supplier prices. No credentials are wired, and no order can be submitted.
- e-conomic writes, invoice approval, posting and payment. Left off.
- New live email or SMS from the preview.
- Dashboard figures for the new operational list (unbilled work, callbacks, invoices awaiting review) were not added, so a failed finance read cannot be shown as zero by this batch.
- Moving an inspection, sending mail or SMS, approving an invoice, and creating a customer or case from the assistant or the mail card.
- Saving a mail attachment as a legal power of attorney. The filename can only create a review task or a note that says the content was not read.

## Important files

- `src/lib/integrations/telephony/` — flags, provider, webhook parse, gate, idempotent ingest, call card, stats
- `src/app/api/integrations/relatel/webhook/route.ts` — ingest gate, no database write
- `src/app/dashboard/cti/` — call card and callback queue
- `src/app/relatel/cti/page.tsx` — data-free iframe target
- `src/lib/actions/customer-tasks.ts` — a non-technician callback stores `service_case_id` only when that case belongs to the customer
- `src/lib/mail/action-card.ts`, `src/lib/mail/action-card-execute.ts`, `src/lib/actions/mail-card-actions.ts`, `src/components/mail/mail-action-card.tsx`
- `src/lib/documents/classify-label.ts`
- `src/lib/timeline/compose.ts`, `src/lib/actions/communication-timeline.ts`
- `src/lib/assistant/crm-questions.ts`, `src/lib/actions/crm-assistant.ts`, `src/app/dashboard/assistant/`
- `src/lib/automation/comm-preview.ts`
- `src/lib/invoice-control/traffic-light.ts`
- `src/lib/suppliers/product-lookup.ts`
- `src/lib/integrations/status-board.ts`
- `scripts/safety-flags.ts`, `scripts/test-harness/ui-e2e.ts`, `src/lib/ops/pilot-health.ts`

## Migration drafts

- `docs/runbooks/telephony-events-proposal.md` — unnumbered, not applied, not placed in `supabase/migrations`.
- Proposed table `telephony_events`. Service role writes. Authenticated users can select only. No anon. Unmatched rows (`customer_id` null) require `customers.view.all`. A matched row also follows `my_customer_scope_ids()`. The webhook must not set `customer_id`.
- Do not add the table to `SELECT_REPLACED` unless it is also added to an RLS wave. 00244–00246 are already used by other drafts. Claude assigns the number.
- No staging or prod migration was run. No prod data was changed.

## Feature flags

Default off. Only the exact trimmed value `true` turns one on.

- `RELATEL_ENABLED` — master. Off means the webhook is 404.
- `RELATEL_LIVE_CALL_ENABLED` — also requires the master. The provider still does not call.
- `RELATEL_SMS_ENABLED` — also requires the master. The provider still does not send SMS.
- `RELATEL_WEBHOOK_SECRET` — required before a turned-on webhook will accept a body. Not a boolean. The UI harness strips it. The value is never displayed.

All three boolean flags are in `MUST_BE_OFF` and are stripped by the UI harness. With every flag on, provider mode is still `test`, never `active`.

Existing flags are only displayed: `ECONOMIC_PUSH_ENABLED`, `AGENT_LIVE_SEND_ENABLED`, `AUTOMATION_RULES_LIVE`, `ASSISTANT_TELEGRAM_ENABLED`, `INVOICE_REMINDERS_LIVE`, `OFFER_REMINDERS_LIVE`, `FOLLOWUP_REMINDERS_PAUSED`. This batch does not turn them on.

## Tests and exact results

- `node node_modules/tsx/dist/cli.mjs scripts/grok-features-batch-test.ts` — ALL PASS (exit 0). Covers the earlier telephony, mail, timeline, traffic-light and price checks, plus: an unconfirmed mail action does not run, a filename does not become a power of attorney, a mail already linked to another customer is not moved, an assistant task proposal is not a free write, and two employees named Lars are not chosen.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false` — exit 0.
- `node node_modules/tsx/dist/cli.mjs scripts/action-gate-audit.ts --strict` — exit 0. `481 skrivende actions · 436 gatet · 45 bevist undtaget · 0 fejl`.
- `npm run test:grok-features` runs the same script. It is also appended to `test:time`. The full `test:time` suite was not run.
- The new screens were not clicked. No browser tool was available, and the dev server was not started.

## External API / setup still required

- Relatel access token or OAuth app before any live read. Do not add it in this branch without a separate decision.
- A webhook secret and an explicit decision to register the webhook at Relatel. Registration was not done.
- A header decision before Relatel can frame `/relatel/cti`. Do not weaken `X-Frame-Options` in this branch.
- KlarPris or supplier API credentials, only if live prices are wanted later. No order endpoint is implemented.
- e-conomic write access stays behind the existing flag.

## Security and finance limitations

- New reads use `customers.view` and the existing customer scope. The public iframe page shows no CRM data. `/dashboard` routes stay behind the existing auth proxy.
- Phone, mail, case-number and employee matching do not guess when more than one row fits. Confirmed writes go through `linkEmailToCustomer`, `linkEmailToCase`, `createCustomerTask` and `createCustomerNote`.
- A mail note about a power of attorney says the file was not read and that no power of attorney was created. It does not copy the attachment.
- Document descriptions are not copied onto the timeline, because a power of attorney can contain civil registration data.
- The traffic light does not approve, post or pay. It does not invent a price. A missing purchase order is listed and does not by itself turn an otherwise green invoice yellow. A duplicate, an overcharge, a missing case, freight, a fee or an uncontrollable line still raises the light.
- A missing catalogue price stays null. It is not treated as 0.
- Cost and margin columns are not newly exposed. The profit engine was not copied.

## Claude must review

- `docs/runbooks/telephony-events-proposal.md` and whether unmatched phone numbers may be visible to `customers.view.all`.
- The `customer-tasks` change: office users now persist `service_case_id` when the case belongs to the customer. A failed case read does not create the task.
- The traffic-light choice that a missing purchase order does not raise a green invoice.
- That the webhook stays `persisted: false` until the migration exists and ingest is deliberately connected.
- Confirmed mail linking and assistant task creation: they write only after `confirmed: true`, and only through the existing actions. A montør still follows the existing task rule.
- The branch does not contain `9cfd2d44`, `97b199f8` or `97ba4000` from `origin/main`. Rebase or merge is Claude's decision. 00244 there is a draft, not an applied migration.

## Do not merge as-is

- Do not merge the telephony migration by copying the draft into `supabase/migrations` without a number, RLS review and Henrik's approval.
- Do not turn on `RELATEL_ENABLED`, `RELATEL_LIVE_CALL_ENABLED` or `RELATEL_SMS_ENABLED` by merging.
- Do not register a Relatel webhook, place a call, or send an SMS from this branch.
- Do not treat the communication preview as a sender.
- Do not treat the integration board as a switch. It only reports state.
- Do not merge to main from `grok-features` without reconciling `9cfd2d44`, `97b199f8` and `97ba4000`.

## Next high-value queue

1. Apply `telephony_events` only after review, then persist webhook events and let a person confirm the customer. Still no live client.
2. Put stored calls and status changes on the same customer timeline.
3. Let a confirmed assistant request move an inspection through the existing planning action. Do not invent a second calendar.
4. Add a KlarPris and supplier price provider that still cannot order. Give the known-catalogue lookup a screen.
5. Extend invoice control with order, agreed price and freight follow-up. Still no automatic approval.
6. Connect the communication preview to an already approved sender only after an explicit activation.
7. Add dashboard counts for unbilled work, callbacks and invoices awaiting review from the existing profit engine. A failed read must stay a failure.
8. Read document contents only when a real extractor exists. Do not invent document text.
9. Change the mobile job flow only where the current flow is measurably short.
