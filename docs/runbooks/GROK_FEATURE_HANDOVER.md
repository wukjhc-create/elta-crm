# Grok feature handover

Updated: 2026-11-01. This file on `origin/grok-features` is the review entry. When Henrik says "Gennemgå Groks seneste arbejde", read this file and the commits it names. Do not merge to main from here.

Delivery after each stable feature batch: commit on `grok-features`, push `origin/grok-features`, update this file, and push it with those commits.

## Git

- Branch: `grok-features`
- Published handover: `fa5dd73a67b5b1b054962a7415869cba43cc2d5f` — `docs(handover): record the grok-features batch for review`
- Product HEAD under that commit: `ccc8409dd91eea13c0b90b8e5da3ea3ab98be333` — `test(features): cover the grok-features batch`
- Branch tip: the child of `fa5dd73a` that only corrects this section. A file cannot contain the hash of the commit that contains the file. Use `git rev-parse origin/grok-features`.
- Base used: `ab2cddfae670f932770b5fc2074ed5b234e2e5cf` — `feat(pilot): P5-pilot klar`
- `origin/main` at handover: `9cfd2d44ef291f6854d6b67ad9a023c191d13518` (1 commit ahead of the base: `fix(cases): aflevering-værn ved lukning`). This branch does not contain that commit.
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
- **Inbox.** On a mail, see a suggestion card: customer, address, likely case, attachment label, and actions such as attach, save a power of attorney, create a task, add a note, or do nothing. The card executes none of those writes. Ambiguous customers and cases are not chosen.
- **Assistant.** At `/dashboard/assistant`, ask who still needs a callback, which open cases lack a power of attorney, what happened with one named customer, and which follow-ups are due. Answers use data the user can already see. Write requests are refused and pointed at the existing screens.
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
- Confirmed execution of mail-card and assistant writes. They suggest or refuse. They do not attach mail, move an inspection, or create a task from the assistant.

## Important files

- `src/lib/integrations/telephony/` — flags, provider, webhook parse, gate, idempotent ingest, call card, stats
- `src/app/api/integrations/relatel/webhook/route.ts` — ingest gate, no database write
- `src/app/dashboard/cti/` — call card and callback queue
- `src/app/relatel/cti/page.tsx` — data-free iframe target
- `src/lib/actions/customer-tasks.ts` — a non-technician callback stores `service_case_id` only when that case belongs to the customer
- `src/lib/mail/action-card.ts`, `src/components/mail/mail-action-card.tsx`
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

- `node node_modules/tsx/dist/cli.mjs scripts/grok-features-batch-test.ts` — ALL PASS (exit 0). Covers flags, webhook statuses 404/503/401/400/413/202, idempotent ingest, call-card ambiguity, null call duration, the DCC Energi / Kjeld Rønnekilde mail card, timeline dedupe, traffic light, preview `wouldSend: false`, assistant write refusal, missing power of attorney, and a null purchase price.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false` — exit 0.
- `node node_modules/tsx/dist/cli.mjs scripts/action-gate-audit.ts --strict` — exit 0. `479 skrivende actions · 434 gatet · 45 bevist undtaget · 0 fejl`.
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
- Phone and mail matching do not guess when more than one customer or case fits.
- Document descriptions are not copied onto the timeline, because a power of attorney can contain civil registration data.
- The traffic light does not approve, post or pay. It does not invent a price. A missing purchase order is listed and does not by itself turn an otherwise green invoice yellow. A duplicate, an overcharge, a missing case, freight, a fee or an uncontrollable line still raises the light.
- A missing catalogue price stays null. It is not treated as 0.
- Cost and margin columns are not newly exposed. The profit engine was not copied.

## Claude must review

- `docs/runbooks/telephony-events-proposal.md` and whether unmatched phone numbers may be visible to `customers.view.all`.
- The `customer-tasks` change: office users now persist `service_case_id` when the case belongs to the customer. A failed case read does not create the task.
- The traffic-light choice that a missing purchase order does not raise a green invoice.
- That the webhook stays `persisted: false` until the migration exists and ingest is deliberately connected.
- The branch is one commit behind `origin/main` (`9cfd2d44`). Rebase or merge is Claude's decision.

## Do not merge as-is

- Do not merge the telephony migration by copying the draft into `supabase/migrations` without a number, RLS review and Henrik's approval.
- Do not turn on `RELATEL_ENABLED`, `RELATEL_LIVE_CALL_ENABLED` or `RELATEL_SMS_ENABLED` by merging.
- Do not register a Relatel webhook, place a call, or send an SMS from this branch.
- Do not treat the communication preview as a sender.
- Do not treat the integration board as a switch. It only reports state.
- Do not merge to main from `grok-features` without the case-close fix that is already on main (`9cfd2d44`) being reconciled.

## Next high-value queue

1. Apply `telephony_events` only after review, then persist webhook events and let a person confirm the customer. Still no live client.
2. Confirm a mail-card action through the existing attach, document and task actions.
3. Let the assistant perform a confirmed write, such as creating a task or moving an inspection, through the existing services.
4. Put stored calls and status changes on the same customer timeline.
5. Add a KlarPris and supplier price provider that still cannot order.
6. Extend invoice control with order, agreed price and freight follow-up. Still no automatic approval.
7. Connect the communication preview to an already approved sender only after an explicit activation.
8. Add dashboard counts for unbilled work, callbacks and invoices awaiting review from the existing profit engine. A failed read must stay a failure.
9. Read document contents only when a real extractor exists. Do not invent document text.
10. Change the mobile job flow only where the current flow is measurably short.
