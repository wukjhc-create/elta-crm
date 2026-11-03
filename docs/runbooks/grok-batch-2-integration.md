# Grok batch 2 — integration review (2026-11-03)

Branch `integrate/grok-batch-2` from main `5e3c85eb` (00246 in prod). Grok's 8 commits cherry-picked (no conflicts;
batch 2 touches neither `package.json` nor `telephony-events-proposal.md` — main's proposal and the 00247 reservation
are untouched). No migration, no flags, no external actions.

## Scorecard

| Feature | Verdict | Fixes | Test evidence | User capability |
|---|---|---|---|---|
| 1. Callback / CTI | ACCEPT WITH FIX | Server now enforces what only the client did: explicit case choice with >1 open case, always assigned to the signed-in user (a foreign `assigned_to` is ignored, not validated) | U258 7/7: server refuses without case choice; direct call with foreign assignee + `reminder_at` → assigned to self, `reminder_at` NULL, `assistant_callback`; UI Confirm disabled until a case is chosen; queue shows it; unknown number → no button. Unit 32/32 | Save a callback from the call card into the existing task queue, no Telegram reminder |
| 2. CRM assistant confirmed actions | ACCEPT WITH FIX | (a) Move: the portal reads the time from the description's first "kl." line → it is rewritten together with `due_date` + history line; a customer-confirmed inspection (`in_progress`) is refused (would inherit a confirmation). (b) Assign: name lookup could never find a colleague (profiles RLS = own row) → gated admin lookup (`tasks.create`, id + name, active only); same fix for batch 1's "create task for X" | U259 11/11: proposal and `confirmed:false` write nothing; move hits the one booked inspection (due_date + portal time); confirmed inspection refused; ambiguous name → no proposal; unique name → the one open task assigned to the right person. U257 PASS | Move an unconfirmed inspection, assign the single open task, add a note, link a mail — each after a second confirmation, unique visible target only |
| 3. Materials lookup | ACCEPT | — | U260 5/5: cost role sees price; missing price = "Ukendt" (no 0,00); montør sees "Skjult", page and direct action call carry no cost (`purchasePrice:null`); no order button. Search columns indexed (trgm) | Search known catalogue by SKU/EAN/name; cost only with `materials.view.cost_prices`; link to existing "Tilføj materiale" |
| 4. Operational dashboard exceptions | ACCEPT WITH FIX | Power-of-attorney count read the 200 newest open cases and ≤1,000 contract docs per chunk → undercount (staging: 1,359 open cases) and false "missing" when docs were truncated → now all rows paged; same doc truncation fixed in the assistant's PoA answer | U261 13/13: admin sees all queues, no error page, no cap note; montør does not see mail/invoice/rate queues. Code: every count is ok / Ukendt / hidden — never 0 on error; unbilled → "Ukendt" | Office sees exception queues; a failed read is "Ukendt" |
| 5. Invoice-control purchasing | DEFER (foundation only — merged, not user-facing) | — | Unit: duplicate red, unknown outranks green, missing price null. Existing screen unaffected: U12, U28 PASS | None yet (not shown on the invoice screen) |
| 6. Document suggestion helper | DEFER (foundation only — merged, not mounted) | "Teksten er brugt" only when the type actually came from the text | Unit 32/32 incl. new statement checks | None yet |
| 7. Mobile customer link | ACCEPT | — | Montør regression U11, U21, U231, U232, U233 PASS | Montør job row opens the customer |

## Security / privacy findings
- **Pre-existing prod bug (fixed here):** assigning a task to a colleague always failed ("Den ansvarlige findes ikke
  eller er deaktiveret"). `createCustomerTask`/`updateCustomerTask` looked the assignee up with the user's client;
  profiles RLS shows only the user's own row (prod rollback proof: admin sees 1/5 active profiles). Now
  `assigneeIsActive()` reads only `is_active` for one id via the admin client after the action's own gates. 0 tasks in
  prod were assigned to someone other than their creator in the last 30 days.
- Callback: client-only enforcement of case choice/self-assignment closed on the server.
- Catalogue: no cost leak — `authenticated` has no column grant on `cost_price`; admin read only behind
  `materials.view.cost_prices`, two columns.
- Mail (00246) intact: staging probe 71/71 after the integration.

## Finance findings
- Unbilled work: read error is "Ukendt", not 0 (Grok's fix, kept).
- Purchasing thresholds (not live): movement flags at ≥1 kr OR ≥5 % → very sensitive on expensive lines (1 kr on a
  1,000 kr item); duplicate = red; `no_purchase_order` still does not lift a green light. Revisit before wiring.
- `getEmployeeRateGapsAction` ignores a `company_settings` read error (pre-existing; may miscount "Medarbejdere uden
  sats"). Not changed.

## Gates and tests
- tsc 0 · check:rbac 0 (action-gate strict: 482 writing, 437 gated, 45 proven exceptions, 0 failures) · check:rls-matrix 0
- Unit: `grok-features-2-test.ts` 32/32 (26 Grok + 6 integration), `grok-features-batch-test.ts` ALL PASS
- Staging UI (final code): U258, U259, U260, U261, U257, montør U11/U21/U231/U232/U233, invoice U12/U28, mail
  U53/U64/U121/U122/U129/U131/U133, tasks U44/U62/U97/U100/U119/U143/U175/U201/U226/U228/U229/U230 — all PASS
- 00246 mail persona probe (staging): 71/71

## Prod (2026-11-03) — INTEGRATED

- main fast-forwarded to `82e8454d` and pushed; Vercel served `82e8454` at 13:01 (≈2,5 min after push, `/api/public/version`).
- Routes (unauthenticated): `/dashboard`, `/dashboard/cti`, `/dashboard/cti/queue`, `/dashboard/assistant`,
  `/dashboard/materials/lookup`, `/dashboard/incoming-invoices`, `/dashboard/tasks`, `/dashboard/mail` → 307 to login
  (no 5xx); `/login` 200.
- `scripts/prod-smoke-grok-batch-2.ts` (read-only, real admin/montør sessions): 12/12 — callback queue, assistant
  reads, catalogue public columns, exception counts, montør job/customer link, mail/invoice reads; montør cannot read
  `cost_price` (42501); no migration (catalogue 114/273, 165 relations, no telephony tables); no outgoing rows since
  deploy; no assistant/callback tasks created; no callback with `reminder_at`.
- 00246 intact: `prod-smoke-00246.ts` 11/11, `prod-verify-00246.ts post` 15/15 (fingerprints unchanged),
  `prod-mail-00246-effective.ts` 26/26 (rollback-only).
- Relatel webhook and Telegram endpoint: 404 (off). No calls, SMS, webhook registration, Telegram sends, e-conomic
  writes, supplier orders or migrations.
- Still deferred: purchasing findings not on the invoice screen; document suggestion not mounted; telephony events not
  persisted (00247 reserved only); no live KlarPris.
