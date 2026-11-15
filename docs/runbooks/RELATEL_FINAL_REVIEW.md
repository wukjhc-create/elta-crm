# Relatel integration — final review, hardening and activation readiness

Date 2026-11-15 · branch `claude-relatel-final-review` (from production baseline `c5d37945`) · **not merged, not
deployed, Relatel not activated, nothing sent externally, no Relatel account accessed.**

Relatel = telephony provider. ELTA CRM = operating system. All business logic stays in the CRM (task engine,
communication timeline, effective permissions). No second telephony logic layer was added.

Sources: official Relatel API spec v2.1.2 (https://dev.relatel.dk/oas, OpenAPI 3.1.0 embedded in the page), iframe
docs (https://dev.relatel.dk/iframe), webhook customer guide "Webhooks in Relatel" (Aug 2026, linked from
https://www.relatel.dk/supportblog/webhooks), API article (https://www.relatel.dk/supportblog/hent-oplysninger-via-api).
Tags: **[OAS] [IFR] [WH]** documented · **UNKNOWN** not documented · **INFERRED** our reading.

---

## 1. Current implementation map

| Layer | File | Role |
|---|---|---|
| DB (prod since 2026-11-04, migration 00247) | `telephony_calls`, `telephony_events`, `telephony_employee_links` | one row per call; immutable event log (SHA-256 only, no payload); provider-employee → profile link |
| DB functions (service_role only, ACL verified in prod) | `telephony_ingest_event` · `telephony_set_call_match` · `telephony_purge_unconfirmed` · guard triggers | idempotent ingest + monotone merge; human match with optimistic lock + audit in same txn; 90-day purge of unconfirmed |
| Webhook | `app/api/integrations/relatel/webhook/route.ts` → `lib/integrations/telephony/webhook-gate.ts` | flags, size, **auth (now HMAC)**, parse, optional persist + suggestion |
| Parsing | `lib/integrations/telephony/webhook.ts` | **Relatel envelope (new)**, our canonical test envelope, legacy call shape |
| Signature | `lib/integrations/telephony/signature.ts` (new) | Relatel-Signature HMAC-SHA256 verification |
| Persist / suggest | `persist.ts`, `suggest.ts` | RPC call; customer **suggestion only** (one → suggested, many → ambiguous, none → unmatched) |
| Flags | `flags.ts` | `RELATEL_ENABLED`, `RELATEL_LIVE_CALL_ENABLED`, `RELATEL_SMS_ENABLED`, `TELEPHONY_PERSIST_ENABLED`, `TELEPHONY_MATCH_MODE` — all default OFF |
| Provider | `provider.ts`, `relatel/contract.ts` | no HTTP client exists; every call/SMS/list returns a refusal (`placed:false`, `sent:false`) |
| Actions | `lib/actions/telephony-calls.ts` → `lib/telephony/call-actions-core.ts` | list (RLS + column grant), confirm customer, link case, reject, employee link |
| Callback | `callback-plan.ts` + `lib/actions/customer-tasks.ts` (`callbackQueue`) | callback = canonical `customer_tasks` row (`auto_rule='assistant_callback'`); **now idempotent** |
| UI | `/dashboard/cti` (number card + timeline), `/dashboard/cti/queue` (callbacks), **`/dashboard/cti/calls` (new call history)**, `/relatel/cti` (data-less iframe target) | |
| Timeline | `lib/actions/communication-timeline.ts` | **now includes confirmed calls** (kind call / missed_call / voicemail) |
| Retention | `retention.ts` + cron route (NOT scheduled), `retention-policy.ts` (new, proposal only) | |
| Status board | `lib/integrations/status-board.ts` | new row: webhook auth mode (yes/no only) |

Production state (read-only, 2026-11-15): 0 calls, 0 events, 0 employee links, 0 callback tasks; role defaults
admin/serviceleder = view+view_unmatched+match, salg = view+match, **montør = none**; 0 per-user overrides; all five
telephony functions have no EXECUTE for anon/authenticated.

## 2. Official API mapping (Relatel REST v2.1.2)

Base `https://app.relatel.dk/api/v2` [OAS]. Auth `bearerAuth` (HTTP bearer) via OAuth2 authorization-code or a one-off
Access Token created by any switchboard user at app.relatel.dk/account/authorized_applications [OAS][API article].
**No scopes / no read-only token** — a token acts with the creating employee's rights, including writes (INFERRED from
absent scopes). Rate limits: UNKNOWN (only SMS daily cap documented). Errors: only for SMS send. Pagination: `limit` +
timestamp/id range filters (no cursor). Phone format: country code, no `+`/`00` (e.g. `4571999999`) — matches our
`toRelatelNumber`. Timestamps ISO-8601; offset UNKNOWN for REST.

### 2.1 Call → CRM

| Relatel `Call` field [OAS] | Normalized CRM field | Table / timeline |
|---|---|---|
| `call_uuid` | `externalId` → `provider_call_id` | telephony_calls (UNIQUE per provider) |
| `direction` `incoming`/`outgoing` | `inbound`/`outbound` | telephony_calls.direction |
| `from_number`, `to_number` | `from_number_normalized`, `to_number_normalized` (+ generated `external_number_normalized`) | telephony_calls |
| `remote_number` | not used (derivable) | — |
| `started_at` | `started_at` (earliest wins) | telephony_calls |
| `ringing_at` | not stored | — |
| `answered_at` | `answered_at` (earliest wins) | telephony_calls |
| `ended_at` | `ended_at` (latest wins) | telephony_calls |
| `status` `ringing/orphaned/missed/voicemail/answered` | derives event type (missed → `call.missed`, voicemail → voicemail flag) | generated `status`, `missed` |
| `talk_duration` | `duration_seconds` | telephony_calls |
| `waiting_time` | not stored (candidate) | — |
| `answered_by.id` (only reception calls) | `provider_employee_id` → link → `employee_profile_id` | telephony_calls |
| `endpoint`, `endpoint_type`, `endpoint_name` | not stored (UNKNOWN format; INFERRED `Employee#<id>`/`Reception#<id>`) | — |
| `voice_mail` (`id`, `duration`, `sound.url`) | `provider_voicemail_id`, `voicemail_duration_seconds`, `has_voicemail`; **`sound.url` never stored** | telephony_calls |
| `recording` (url, expire_at) | never stored | — |
| `callback_requested` | not mapped yet (candidate for a callback hint; no auto-task) | — |
| `from_contact`/`to_contact` (Relatel phonebook) | ignored — CRM customers are the source of truth | — |
| `status: orphaned` | UNKNOWN meaning → currently treated like "not answered" only if inbound with no answered_at | — |

Other resources [OAS]: `GET /employees` (`id`, `endpoint`, `name`, `email`, `number`, …), `GET /receptions` (main
numbers), `GET /voice_mails` (metadata; `GET /voice_mails/{id}/sound` = MP3 — **never fetched**), `GET /messages`
(SMS in/out on the token-holder's endpoints, newest first, `direction` default `incoming`), `GET /chats`, `GET /contacts`,
`GET /statistics` (1–2 h delay). Call initiation: **`POST /switch/dial`** ("an actual call will be made every time") —
never called; no code references it (asserted in tests). SMS send: `POST /messages`, `/employees/{id}/message` — never
called. Spec defect: "Get a single call by UUID" is declared as `POST /calls` without a `{uuid}` path → real path UNKNOWN.

## 3. Webhook mapping

| Aspect | Relatel [WH] | CRM (after this review) |
|---|---|---|
| Configuration | Admin UI only (Firmaadministration → Webhooks); Contact Center/Unlimited; https only; one webhook per resource | nothing registered; endpoint `POST /api/integrations/relatel/webhook` |
| Event types | main number: `call.created`, `call.ended`, `incoming_message.created`; chat: `chat.new`, `chat.answered`, `chat.ended`; contacts: `contact.created/updated/destroyed`; `webhook.test` | call.* → mapped (UNVERIFIED payload); `webhook.test` → 200 no store; SMS/chat/contact → 202 `ignored`, not stored; any other type → 400 |
| **No** missed/answered/ringing events; no employee/direct-dial scope; no inbound/outbound filter | missed/answered derived from `call.ended` payload status |
| Envelope | `{delivery_id, event_type, occurred_at, payload}` | parsed by `parseRelatelEnvelope` |
| Payload fields | **UNKNOWN** (example is empty) | accepted only if it carries REST `Call` fields (`call_uuid` …); otherwise: persist OFF → 202 + log of field names/types only; persist ON → 422 |
| Idempotency | `Relatel-Delivery-Id` (= `delivery_id`), same on every retry; duplicates possible | key `relatel:delivery:<id>` → `telephony_events` UNIQUE; header/body mismatch → 400 |
| Ordering | **not guaranteed**; use `occurred_at` | DB merge is monotone (earliest start/answer, latest end) — order-independent (proved by staging probe) |
| Retries | success = any 2xx; 30 s timeout; up to 8 attempts over ~3½ days (1 m, 5 m, 25 m, ~2 h, ~10 h, ≤24 h); auto-stop after repeated give-ups (example: 10/hour); paused webhook drops events | DB error → 500 (retry is safe, idempotent); unknown event → 400 (visible in Relatel log) |
| Security | `Relatel-Signature: t=<unix>,v1=<hex>` = HMAC-SHA256(key, `${t}.${raw body}`); reject > 5 min; several `v1=` during 24 h key rotation; optional custom headers (encrypted at rest); IP allowlist UNKNOWN | **implemented**: `signature.ts` (constant-time, 300 s, `Relatel-Timestamp` must equal `t`, current + previous key) |
| Timestamps | header Unix seconds; `occurred_at` ISO-8601 (UTC `Z` in example) | `occurred_at` → event time |

**Call correlation key in payload is UNKNOWN.** `delivery_id` is per event, not per call. If the payload carries
`call_uuid` (as the REST schema), `call.created` + `call.ended` merge into one row; if not, the capture step will show it.

**Known precision limit (open, S2-4):** `telephony_ingest_event` uses the event's `occurred_at` for start/answer/end.
With Relatel's two events only, `answered_at` becomes the `call.ended` time for answered calls, and a lone
`call.ended` sets `started_at` = end time. Fix after capture: pass payload `started_at/answered_at/ended_at` explicitly
(needs a reviewed migration of the ingest function).

## 4. Unresolved documentation gaps

1. Webhook payload contents per event (call, message, chat). 2. Whether `call.created/ended` fire for outbound calls and
direct-dial (non-main-number) calls. 3. REST timestamp offset. 4. Real single-call path. 5. `endpoint` string format.
6. `limit` default/max and sort on `/calls`. 7. Token rights (non-admin vs admin visibility; no read-only token).
8. API error codes / rate limits. 9. `orphaned` status; `CallNode.state/node_type`. 10. Voicemail/recording retention;
whether `sound.url` needs a token. 11. Webhook source IPs. 12. Iframe trigger timing. 13. Danish guide not compared.

## 5. Findings (S1 = activation blocker / wrong behaviour, S2 = operational/integrity gap, S3 = minor)

None of these affected production behaviour: all Relatel flags are OFF in production and nothing is registered.

| ID | Finding | Status |
|---|---|---|
| **S1-1** | Webhook authenticated with a static custom header (`x-elta-webhook-secret`). Relatel's real mechanism is HMAC-SHA256 signing with timestamp; the static approach is not Relatel's and has no replay protection. | **Fixed**: HMAC mode (`RELATEL_WEBHOOK_SIGNING_KEY` [+ `_PREVIOUS`]) with 5-min window and rotation. Static header now `static_legacy`: never used when a signing key exists, and **persistence is refused (503)** unless `RELATEL_WEBHOOK_ALLOW_STATIC_SECRET=true` (staging/test only). |
| **S1-2** | Parser expected our own envelope (`provider`, `event_id`, `call.started/answered/missed`). Real Relatel deliveries (`delivery_id`, `call.created/ended`, …) would be rejected with 400 → 8 retries → webhook auto-stopped. | **Fixed (structure)**: envelope + all documented event types handled; `webhook.test` acknowledged. Call payload mapping is **UNVERIFIED** until capture (§9 step 3). |
| S2-1 | Callback tasks not idempotent: repeated clicks / two colleagues / several events created duplicate callback tasks. | **Fixed**: `createCustomerTask` returns the existing open callback (`existingCallback:true`) — max one open callback per customer; read error creates nothing. Remaining race (two inserts in the same millisecond) → DB proposal P2. |
| S2-2 | Employee-link change ignored audit failure; multi-step without transaction. | **Fixed (detection)**: audit failure now reported (`auditFailed`), never "saved". Atomic version → DB proposal P1. |
| S2-3 | No call-history screen and no way to confirm a suggestion → matched customer/case could never be set in practice; confirmed calls absent from the customer timeline. | **Fixed (minimal)**: `/dashboard/cti/calls` (who/when/answered-missed/voicemail/employee/match/suggestion/case/callback status; confirm suggestion / "wrong customer" via existing audited actions); timeline shows confirmed calls (only with `calls.view`). Still missing: pick a *different* customer and link a case from the UI (actions exist). |
| S2-4 | Timestamp precision with Relatel's two-event model (see §3). | Open — migration after capture. |
| S2-5 | No admin UI for Relatel-employee ↔ profile links (action exists) → calls not attributed to employees. | Open — small admin form or one-off approved script after `GET /employees`. |
| S2-6 | Webhooks exist only per main number; direct-dial/outbound coverage UNKNOWN; a paused webhook loses events. | Open — capture will show coverage; reconciliation via read-only `GET /calls` needs a token (approval). |
| S3-1 | `calls.*` had no permission group (shown under "Administration"; `effective-permissions-test` failed on main). | **Fixed**: grouped under Kunder. |
| S3-2 | Missing telephony tables → 202 `persisted:false` (deliberate, avoids retry loops). Tables exist in all environments now. | Accepted, documented. |
| S3-3 | CTI card shows "Ingen" open cases if that read fails (server re-checks before creating a callback). | Open (cosmetic). |
| S3-4 | Iframe request from Relatel is unsigned (only `?number=`). `/relatel/cti` is data-less and links into the authenticated CRM — correct. `X-Frame-Options: DENY` still blocks embedding (decision pending). | Accepted. |
| S3-5 | Unknown event type → 400 → Relatel retries and may auto-stop the webhook. Chosen deliberately (never silent accept); documented types not ingested get 202 `ignored`. | Accepted. |
| S3-6 | Stale prod smoke `scripts/prod-smoke-grok-batch.ts` still expects "no telephony tables" (pre-00247). | Open (script only). |

## 6. Security findings

* **Credentials**: no Relatel API token is used anywhere (no HTTP client exists). Webhook signing key and legacy secret
  live only in server env; never logged, never returned (status board shows only which mode is configured).
* **Browser exposure**: none. Calls page and actions are server-side; the client component only calls the existing
  server actions with ids. No `NEXT_PUBLIC_` Relatel variable.
* **Logs**: webhook logs carry only messages, idempotency keys, DB error codes and — for unrecognised payloads — field
  names/types (`describePayloadShape`, depth ≤ 2, never values). Error bodies to Relatel are generic.
* **Payload storage**: only SHA-256 of the raw body; no audio, URL, transcript or raw payload columns exist.
* **Unknown ≠ empty**: lookup failure → suggestion `error` (not `no_match`); list read failure → error text; provider
  `listCalls` → refusal, never an empty list; unrecognised call payload with persistence on → 422.
* **No external writes**: flags OFF; provider refuses; contract client throws; tests assert no code references
  `/switch/dial`, SMS endpoints or `app.relatel.dk/api`.
* **Relatel token risk (for later)**: no scopes → any token can place calls and send SMS. Must be created by a
  dedicated low-privilege Relatel user, stored only in the server secret store, and used by a read-only adapter whose
  allowed operations are a fixed GET list.

## 7. Permission findings

Effective permissions only (`user_has_permission` in RLS; `hasPermission` in actions; no raw-role checks in telephony
code). Verified by staging probes `tel-00247-probe` 102/102 (personas, overrides, parallel sessions, column grants) and
`tel-00247-app` 74/74, plus prod read-only defaults:

| Role | Overview | Notes |
|---|---|---|
| admin / serviceleder | all confirmed calls in scope + unmatched (`calls.view_unmatched`) + match | |
| salg | confirmed calls for customers in own scope + match; no unmatched | |
| office/other roles | only via per-user grant | |
| montør | **nothing by default**; a granted `calls.view` shows only confirmed calls for customers in the montør's own/related scope (`my_customer_scope_ids()`) | timeline hides calls without `calls.view` |

Per-user grant/revoke works through `user_permission_overrides` (keys now grouped under Kunder). Suggestions never grant
access: a suggested customer is shown only if the user can already see that customer.

## 8. Employee-link model

Relatel employee id (`answered_by.id` / `GET /employees.id`) → `telephony_employee_links(provider, provider_employee_id
PK, profile_id, is_active)`:
* one provider id → one profile (PK); one **active** link per profile (unique partial index) → duplicates refused (23505);
* ingest resolves only an **active link to an active profile**; unknown/deleted Relatel ids → no employee (never by name);
* a deactivated CRM profile is never linked (refused) and stops resolving at ingest;
* changing a link = explicit admin action (`users.manage_roles`), audited; audit failure is now reported.
* Recommendation: link to `employees` via the profile (Employee Setup Integrity guarantees one active employee per login).

## 9. Callback model

```
call.ended (missed) ─▶ telephony_calls (status missed) ─▶ /dashboard/cti/calls (+ timeline once confirmed)
   ─▶ office confirms customer (suggestion or manual) ─▶ "Opkaldskort / tilbageringning" ─▶ createCustomerTask(callbackQueue)
   ─▶ canonical customer_tasks row (auto_rule assistant_callback, assigned to the clicking employee, no Telegram reminder)
   ─▶ /dashboard/cti/queue ─▶ task done ─▶ status visible on the call list ("ingen åben tilbageringning")
```
* No automatic task from webhooks (locked decision 7–8 of 00247); `processMissedCall` stays deprecated.
* Idempotent: one open callback per customer (code); DB proposal P2 closes the race.
* Unknown number → no callback until one customer is chosen; several open cases → explicit choice.
* No path can place a call: `startCall` refuses regardless of flags (`placed:false`), and no UI exposes dialing.

## 10. SMS / chat read model (design only — nothing activated)

* Sources: webhook `incoming_message.created` (payload UNKNOWN) and REST `GET /messages` (`direction`
  incoming/outgoing/both, `created_at` range, newest first, no `limit`) / `GET /chats`.
* Proposed storage (future migration, own approval): `telephony_messages` mirroring the call model — provider message id
  UNIQUE, direction, endpoint, normalized numbers, `created_at`, match fields with the same human-confirmation trigger,
  **no body by default** (body = personal content; store only after a separate decision), SHA-256 of payload.
* Timeline: kind `sms` already exists in `TimelineKind`; add a `messages` source exactly like `calls` (hidden without a
  new `messages.view` key).
* Sending stays disabled (`RELATEL_SMS_ENABLED`, provider refusal). No test SMS.

## 11. Retention proposal (not scheduled)

| Category | Proposal | Mechanism |
|---|---|---|
| Unconfirmed calls (unknown/suggested/ambiguous/rejected) | 90 days after last activity | exists: `telephony_purge_unconfirmed()`; schedule needs approval (vercel.json, e.g. daily 03:30) |
| Confirmed calls, no case | 36 months (Henrik to decide) | new function (migration) |
| Calls linked to a case | keep while case open; 36 months after closure | new function |
| Raw events (hash only) | 90 days after call end; call row kept | new function |
| Voicemail metadata | follows its call; audio never stored | — |
| SMS/chat metadata (future) | same as calls | — |
| Unknown age | never deleted automatically → review | — |

Pure decision function + tests: `lib/integrations/telephony/retention-policy.ts` (not wired).

## 12. DB proposals (NOT created as migrations — each needs its own approval)

```sql
-- P1: atomic employee link + audit (replaces the multi-step code path)
CREATE FUNCTION public.telephony_set_employee_link(p_provider_employee_id text, p_profile_id uuid, p_actor uuid)
RETURNS TABLE (outcome text) LANGUAGE plpgsql SET search_path = public, pg_temp AS $$ … deactivate other active link of
the profile, upsert/deactivate this link, INSERT audit_logs — one transaction … $$;
REVOKE ALL ON FUNCTION public.telephony_set_employee_link(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telephony_set_employee_link(text, uuid, uuid) TO service_role;

-- P2: at most one open callback per customer (closes the insert race)   [prod today: 0 duplicates]
CREATE UNIQUE INDEX customer_tasks_one_open_callback ON public.customer_tasks (customer_id)
  WHERE auto_rule IN ('assistant_callback', 'assistant_missed_call') AND status <> 'done';

-- P3 (after capture): telephony_ingest_event gets explicit p_started_at/p_answered_at/p_ended_at from the payload.
-- P4 (retention): telephony_purge_confirmed()/telephony_purge_events() per §11, service_role only.
```

## 13. Activation blockers

1. Real webhook payload unknown → capture required (§14 step 3) before persistence can be trusted.
2. Signing key not yet created in Relatel / not set in prod env.
3. Coverage of direct-dial and outbound calls unknown (S2-6).
4. Timestamp precision (S2-4) → P3 after capture.
5. Employee-link admin path (S2-5).
6. Retention scheduling + numbers not approved.
7. Prod activation of any flag not approved.

## 14. Tests

| Test | Result |
|---|---|
| `npx tsx scripts/relatel-review-test.ts` (new) | 107/107 — signature (valid, wrong key, tampered body, stale/future, missing/malformed, timestamp mismatch, rotation), envelope (call.created/ended, missed/answered/outbound/voicemail, unknown payload capture vs 422, SMS/chat ignored, unknown type, delivery-id mismatch), duplicate webhook, repeated events, idempotency by provider id, unmatched / one suggestion / ambiguous / lookup failure, manual match + revoke + stale + hidden case, employee link (permission, name refused, inactive, duplicate, audit failure), callback idempotency, provider refusals, flags OFF, retention, source wiring |
| `scripts/telephony-persist-test.ts` | pass (legacy static mode now opts in explicitly) |
| `scripts/relatel-test.ts` | pass |
| `scripts/grok-features-batch-test.ts` | pass |
| `scripts/effective-permissions-test.ts` | pass (was failing on main: calls.* ungrouped) |
| `assistant-callback-reply-test`, `customer-task-actions-touch-test` | pass |
| employee integrity `employee-setup-integrity-test` | 59/59 |
| finance `claude-finance-2-review-test` 56/56, `grok-finance-1-review-test` 185/185, `grok-finance-2-test`, `net-invoiced-test` | pass |
| staging `cli.ts tel-00247-probe` (DB idempotency, out-of-order merge, guards, retention, personas) | 102/102 |
| staging `cli.ts tel-00247-app` (webhook, suggestion, actions, employees, cleanup) | 74/74 |
| `tsc`, `check:rbac`, `check:rls-matrix` | exit 0 |

## 15. Exact next activation steps (each needs Henrik's explicit approval)

1. **Review + merge/deploy this branch** (dormant: all flags stay OFF).
2. **Relatel admin (Henrik)**: create a webhook on ONE main number → `https://elta-crm.vercel.app/api/integrations/relatel/webhook`;
   copy the signing key once into Vercel prod env `RELATEL_WEBHOOK_SIGNING_KEY` (Claude never sees it). No custom header needed.
3. **Capture (read-only for us)**: set `RELATEL_ENABLED=true`, keep `TELEPHONY_PERSIST_ENABLED` unset. Send `webhook.test`,
   then one inbound call (answered), one missed call, one outbound call. Our endpoint stores nothing and logs only field
   names/types of unrecognised payloads; Relatel's delivery log shows the bodies to Henrik. Then update the mapping.
4. Optional **read-only REST verification** (needs a Relatel Access Token from a dedicated low-privilege user — no scopes
   exist): `GET /api/v2/calls?limit=5`, `GET /api/v2/employees`, `GET /api/v2/voice_mails?limit=1`, `GET /api/v2/employee`.
   Returns phone numbers, contact/employee names and e-mails, recording/voicemail URLs → run only through a script that
   prints field names/types and counts. Documentation alone cannot settle payload fields, `endpoint` format, timestamp
   offset, coverage or token visibility.
5. Migration P3 (+ P1, P2) on staging → staging probes → prod with approval.
6. Employee links (admin path) → `TELEPHONY_PERSIST_ENABLED=true` + `TELEPHONY_MATCH_MODE=suggest` on staging, then prod.
7. Retention: decide numbers; schedule `/api/cron/telephony-retention` in vercel.json.
8. **Never without a separate policy**: `RELATEL_LIVE_CALL_ENABLED`, `RELATEL_SMS_ENABLED`, any automated/AI dialing.
