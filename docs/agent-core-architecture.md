# Agent Core — Arkitektur

> Status: **PLAN / arkitektur-dokument**. Ingen kode, migration eller tabeller er
> oprettet på baggrund af dette dokument endnu. Alle DB-ændringer kræver godkendt
> SQL først (jf. `CLAUDE.md` → Database-regler).
>
> Sidst opdateret: 2026-09-14.

Agent Core er et **"foreslå → godkend → eksekvér"-lag**. Målet er et *sikkert*
agent-fundament — ikke en løs AI-feature. Agenter foreslår typede handlinger;
mennesker godkender alt der har konsekvens; én tvungen Executor er den eneste vej
til en reel side-effekt; alt logges.

---

## 1. Bærende principper (ufravigelige)

1. **Agenter er disabled by default.** `agent_configs.enabled = false` fra start.
2. **`suggest` er default safety-mode.** En ny agent kan kun foreslå — intet eksekverer.
3. **`send_external`, `push_external`, `finance` og `delete` kræver ALTID menneskelig approval** — uanset agent-config. Håndhæves i Executor-kode, ikke kun i config (hård-blok-matrix).
4. **Agenten kalder ALDRIG rå mutatorer direkte.** Den skriver kun `agent_actions`.
5. **Kun Executor udfører side-effekter**, via en whitelistet Capability Registry.
6. **Alle agent-handlinger audit-logges** (100%) via det eksisterende `audit_logs` + `log_audit_event`.
7. **Agent Core aktiverer ALDRIG `AUTO_CREATE_CASES_ENABLED`.** Det er en parallel sti; nødstoppet forbliver slukket (se §4).
8. **Budget fejler lukket (fail-closed) for agenter.** Modsat det nuværende `ai-budget` fail-open.
9. **LLM-output er aldrig en handling i sig selv.** Modellen må kun vælge fra en fast whitelist af typede capabilities; fri tekst bliver aldrig eksekverbar (prompt-injection-forsvar).

---

## 2. Nuværende fundament

**LLM-lag.** Eneste rigtige LLM er **OpenAI `gpt-4o-mini`** (rå `fetch`) i fire filer:
`src/lib/services/email-intelligence.ts`, `src/lib/services/auto-case.ts`,
`src/lib/services/auto-offer.ts`, `src/lib/actions/ai-mail-assistant.ts`.
**Ingen Anthropic.** Alt under `src/lib/ai/*` er heuristisk (regex/opslagstabeller),
trods "AI"-navngivning.

**Cost-guard.** `src/lib/services/ai-budget.ts` — dagligt loft i `ai_usage_daily`
(`AI_DAILY_CAP`, default 2000). **Fail-open** i dag. En anden cap
(`AI_DAILY_CALL_CAP`, default 1000) lever separat i `src/lib/services/system-health.ts`.
→ Konsolideres og gøres fail-closed for agenter.

**Scheduler.** 15 Vercel-crons (alle daglige, region `fra1`, alle med
`timingSafeEqual` CRON_SECRET-guard). Ingen `pg_cron`, ingen worker/dead-letter.
Idempotens sker via DB-dedup-indekser.

**Permissions.** TS-matrix i `src/lib/auth/permissions.ts` — 5 roller
(`admin`, `serviceleder`, `montør`, `salg`, `bogholderi`), ~120 scopes.
Enforcement er **app-lag only** (RLS er `USING(true)` på næsten alt).
`getAuthenticatedClientWithRole()` fail-safe'r til `montør`.

**Side-effekt-choke points** (afgørende for gating):
- **Al udgående mail** → ét punkt: `sendEmailViaGraph` (`src/lib/services/microsoft-graph.ts:607`).
- **Al bogføring** → `src/lib/services/economic-client.ts` (4 funktioner).
- **Generisk outbound HTTP** → kun `src/lib/actions/integrations.ts`.
- **Ingen live SMS** (kun skema `00034` + docs). **Supplier-API'er er read-only** (pris-fetch, ingen PO-push).

---

## 3. Eksisterende agent-primitiver vi genbruger

Vi bygger **ikke** nyt hvor der findes noget brugbart.

| Behov | Genbrug | Note |
|---|---|---|
| Audit-spor | **`audit_logs`** (`00019`) + RPC `log_audit_event` + view `v_recent_audit_logs` | Findes; kun wired i 6 moduler i dag → udvid dækning til 100% for agenter |
| Trigger/action-ramme | **`automation_rules` + `automation_executions`** (`00090`) | Event-drevet, **`dry_run` pr. regel**, idempotens via unik `(rule, entity)` — direkte forlæg for Executor |
| "Foreslå"-mønster | **`ai_suggestions`** (`00089`) med `acted_on`/`acted_at` | Suggest-mode kan mirrores hertil for eksisterende UI |
| Draft-only-mønster | `auto-offer.ts` (opretter kun kladde), `ai-mail-assistant.ts` (sender aldrig) | Den korrekte default-adfærd |
| Budget | `ai-budget.ts` | Genbrug, men **fail-open → fail-closed** + konsolidér de to caps |
| Idempotens | DB-dedup-indekser (`offers.source_email_id`, tasks `auto_rule`, `incoming_invoices.file_hash`) | Kopiér mønstret til `agent_actions.idempotency_key` |
| Send / push | `sendEmailViaGraph`, `economic-client.ts` | Bliver de **eneste** funktioner send/push-capabilities må kalde |

**Bevidst IKKE genbrugt:** `integration_queue` (`00036`) er et komplet kø-skema helt
uden kode — prior art, men forkert form. Vi definerer agent-specifikke tabeller i stedet.

---

## 4. Hvorfor `AUTO_CREATE_CASES_ENABLED` forbliver slukket

**Mail-intelligence i dag** (`src/lib/services/email-intelligence.ts`): klassifikation,
ekstraktion og kunde-link/create **kører altid**. Kun downstream record-oprettelse er gated.

Gaten (`email-intelligence.ts:799`):
```ts
const autoCreateEnabled = process.env.AUTO_CREATE_CASES_ENABLED === 'true'
```
Hvis `true` kæder den: opret case (`createCaseFromEmail`) → smart-tasks →
offer-draft (`createOfferDraftFromCase`) → AI-note. **Default OFF** — et "nødstop"
efter en audit 2026-06-05.

**Den skal blive slukket, fordi** den er et binært, gransløst nødstop der auto-opretter
cases/tilbud fra *untrusted* mail-indhold **uden menneskeligt review** — præcis den
ukontrollerede autonomi Agent Core erstatter med `foreslå → godkend → eksekvér`.
Agent Core er en **parallel sti** der aldrig rører gaten. Når Mailagenten leverer samme
værdi med approval + audit, kan flaget pensioneres permanent.

---

## 5. Risici og modforanstaltninger

| # | Risiko | Modforanstaltning |
|---|---|---|
| R1 | **Admin/service-role-klient bypasser al RLS** — en agent med rå mutator omgår ALLE permission-checks | Agenter holder aldrig rå mutatorer; eneste vej = **Executor + Capability Registry** (§7) |
| R2 | **Prompt-injection fra mail/dokument-indhold** — LLM narres til at "vælge" at sende/betale | LLM må kun foreslå fra fast **whitelist af typede capabilities**; fri tekst bliver aldrig handling; side-effekter kræver menneske |
| R3 | Money/eksternt er **irreversibelt** (mail, e-conomic, faktura) | **Hård-blok-matrix**: send/push/finance/delete kræver ALTID approval — ikke config-overstyrbart. Dual-approval på finans |
| R4 | `ai-budget` **fail-open** → runaway loop | **Fail-closed** for agenter + hård `max_actions_per_run` |
| R5 | Dobbelt-effekt (auto-case/auto-offer kører allerede i pipeline) | Idempotency-key + agenter kobles ikke ind i eksisterende pipeline |
| R6 | Partiel audit (kun 6 moduler) | Executor skriver `audit_logs` for **100%** af agent-handlinger |
| R7 | Ingen worker/dead-letter | Eksplicit run-state-maskine (genbrug `automation_executions`-mønster) |

---

## 6. Anbefalet database-model

Additiv migration, RLS på alle tabeller, **alle agenter disabled by default**.
Genbrug `audit_logs` (byg ikke nyt audit-bord). SQL vises og godkendes før kørsel.

**`agent_runs`** — én pr. agent-kørsel
`id · agent_type · trigger(cron|manual|event|user) · triggered_by(uuid null) · status(pending|running|awaiting_approval|completed|failed|cancelled) · safety_mode(suggest|approve|auto) · dry_run(bool) · input_context(jsonb) · summary · model · tokens_used · started_at · finished_at · error`

**`agent_tasks`** — påtænkte arbejdsenheder i en run
`id · run_id(fk) · seq · kind · title · rationale · confidence · target_entity_type · target_entity_id · status(proposed|approved|rejected|executed|skipped|failed)`

**`agent_actions`** — den konkrete side-effekt en task vil udføre
`id · task_id(fk) · run_id(fk) · action_type · capability · side_effect_class(read|create|update|delete|send_external|push_external|finance) · payload(jsonb) · requires_approval(bool) · idempotency_key(unique) · status(planned|awaiting_approval|approved|rejected|executing|executed|failed|rolled_back) · result(jsonb) · executed_at · executed_by · error`

**`agent_action_approvals`** — godkendelsesbeslutninger (1 action kan kræve N)
`id · action_id(fk) · decision(approved|rejected|escalated) · decided_by(uuid) · decided_at · reason · channel(ui|email) · expires_at`

**`agent_configs`** — scope & safety pr. agent-type (kernen i sikkerheden)
`agent_type(pk) · enabled(bool default false) · safety_mode(default 'suggest') · allowed_action_types(text[]) · requires_approval_for(side_effect_class[] default {send_external,push_external,finance,delete}) · max_actions_per_run(int) · daily_token_budget(int) · daily_action_budget(int) · updated_by · updated_at`

**Audit.** Hver eksekveret action → `log_audit_event` med `actor='agent:<type>'` og
`run_id`/`action_id` i metadata.

**Scope.** Agenter får et **eget principal** — separate scopes (`agent.mail.draft`,
`agent.offer.draft`, `agent.followup.remind`, …), **ikke** menneske-roller. Det menneske
der godkender, tjekkes mod den eksisterende `hasPermission`-matrix.

---

## 7. Approval-flow & Executor-princip

Én tvungen **Executor** er den eneste vej fra `agent_action` til en reel side-effekt:

1. Load action + task + run + `agent_configs`.
2. **Fail-closed**-tjek: agent `enabled`? budget (tokens + actions) tilbage? ellers afvis.
3. `side_effect_class ∈ requires_approval_for` uden gyldig `agent_action_approvals` → afvis.
4. **Hård-blok-matrix** (config-uafhængig): `send_external` / `push_external` / `finance` / `delete` uden approval → afvis.
5. Håndhæv `idempotency_key` (unik) — ingen dobbelt-kørsel.
6. Kald **capability** (tynd, individuelt reviewet wrapper om en eksisterende funktion — fx `createOfferDraftFromCase`, `sendEmailViaGraph`). Agenten kalder aldrig funktionen direkte.
7. Skriv `audit_logs` + opdatér `action.status`/`result`.

**Approval-UI:** en **Agent-indbakke** (proposals med rationale/confidence →
Godkend / Afvis / Rediger), plus valgfri mail-approval for finans.

---

## 8. Safety modes (håndhæves i kode, ikke kun config)

- **`suggest`** (default): agenten skriver kun `agent_tasks`/`agent_actions` i status `proposed`. **Intet eksekverer.** Menneske reviewer i Agent-indbakken.
- **`approve`** (co-pilot): actions oprettes `awaiting_approval`; menneske godkender (enkeltvis/batch) → Executor kører.
- **`auto`**: kun **read + draft + intern-create** kan køre automatisk. `send_external` / `push_external` / `finance` / `delete` kræver ALTID approval — hård-kodet, ikke config-overstyrbart. "Auto" betyder aldrig "send mail/penge uden menneske".

---

## 9. Capability Registry

Capabilities er den **eneste** kode Executor må kalde. Hver registreres eksplicit:

```
{
  key: 'offer.draft_from_case',
  side_effect_class: 'create',
  required_scope: 'agent.offer.draft',
  wraps: createOfferDraftFromCase,   // eksisterende, reviewet funktion
}
```

Regler:
- Én capability = én tynd wrapper om én eksisterende funktion. Ingen ny forretningslogik i registry.
- `side_effect_class` afgør gating (approval + hård-blok).
- MVP registrerer **kun** read/draft/intern-create. `send_external` / `push_external` /
  `finance` tilføjes senere, hver bag obligatorisk approval, og må kun pege på
  choke points (`sendEmailViaGraph`, `economic-client`).
- Ukendt/uregistreret `capability` på en action → Executor afviser.

---

## 10. Agent-rækkefølge (stigende eksekverings-risiko)

| # | Agent | Intro-mode | Profil | Begrundelse |
|---|---|---|---|---|
| 1 | **Mailagent** | suggest | draft-only | Sikrest, størst værdi, afløser AUTO_CREATE |
| 2 | **Tilbudsagent** | approve | offer-**drafts** (aldrig send) | `auto-offer` drafter allerede; intern-create |
| 3 | **Opfølgningsagent** | approve | foreslår reminders (mail gated) | Genbruger offer/invoice-reminder-logik som forslag |
| 4 | **Planlægningsagent** | approve→auto | **interne** work-order/scheduling-mutationer | Ingen ekstern/penge-effekt → første autonomi-kandidat |
| 5 | **Indkøbsagent** | suggest/advisory | pris-analyse (supplier-API read-only) | Ingen PO-push muligt → rådgivende |
| 6 | **Økonomiagent** | approve + **dual-approval** | invoices/betaling/e-conomic | Højest risiko → aldrig auto |
| 7 | **Direktøragent** | read/aggregation | KPI/oversigt på tværs | Meta-lag; afhænger af de øvrige |

---

## 11. Mailagent MVP

**Mailagent i `suggest`-mode + Agent-indbakke.** Første leverance.

Omfang:
- Migration: de 5 tabeller (§6), alt disabled.
- Executor + registry med **kun** read/draft-capabilities: `draft_reply`, `propose_case`, `propose_offer_draft`, `link_customer`.
- **Agent-indbakke UI**: proposals med rationale/confidence → Godkend / Afvis / Rediger.
- Approve-eksekvering for draft/intern-create med fuld audit. **Send + finance hård-blokeret.**
- Trigger: manuelt / pr-mail først (ingen cron-autonomi endnu).

Mailagenten læser den klassifikation der **allerede kører** i mail-pipelinen og
foreslår handlinger — uden at røre `AUTO_CREATE_CASES_ENABLED`.

---

## 12. Hvad der ABSOLUT ikke må automatiseres endnu

Kræver **altid** menneskelig approval — uanset agent-config, håndhævet i Executor-kode:

1. **Udgående mail til kunde/tredjepart** (`sendEmailViaGraph` og alle callers).
2. **Al bogføring / e-conomic-push** (`economic-client.ts`: create/book invoice, mark paid, push supplier invoice).
3. **Fakturering, kreditnotaer & betalings-registrering** (`invoices.ts`, `bank-payments.ts`, `incoming-invoices` approve/convert).
4. **Sletning** af enhver forretningsrecord eller storage-fil.
5. **Generiske webhooks / integration-eksport** (`integrations.ts`).
6. **Portal/partner-token-udstedelse** (giver ekstern adgang).
7. **Genaktivering af `AUTO_CREATE_CASES_ENABLED`** eller enhver auto-oprettelse fra untrusted mail uden review.
8. **LLM-opfundne priser, datoer eller bindende løfter** (system-prompten i `ai-mail-assistant` forbyder det allerede — bevar den grænse).

---

## 13. Trin-for-trin roadmap

- **Fase 0** — Audit ✅ (dette dokument).
- **Fase 1** — Skema-migration (5 tabeller, RLS, alt disabled). *Vis SQL, vent på godkendelse* (jf. `CLAUDE.md`). Ingen eksekvering.
- **Fase 2** — Executor + Capability Registry (kun read/draft), fail-closed budget, hård-blok-matrix, idempotens, dry-run-sti + tests.
- **Fase 3** — Mailagent (suggest) + Agent-indbakke UI.
- **Fase 4** — Approve-eksekvering for draft/intern-create (fuld audit). Stadig ingen send/finance.
- **Fase 5** — Tilbuds- + Opfølgningsagent; introducér send-capability bag obligatorisk approval.
- **Fase 6** — Planlægningsagent (intern autonomi-pilot).
- **Fase 7** — Indkøbsagent (advisory).
- **Fase 8** — Økonomiagent (approve + dual-approval; finans hård-gated).
- **Fase 9** — Direktøragent (oversigt).
- **Tværgående:** global + pr-agent kill-switch; observability-dashboard; konsolidér AI-caps (fail-closed); pr-agent config-UI; migrér nødstoppede `auto-case`/`auto-offer` ind under Agent Core og pensionér `AUTO_CREATE_CASES_ENABLED`.

---

## Implementeringsstatus

- **Fase 0 — Audit:** ✅ (dette dokument).
- **Fase 1 — Skema:** ✅ skrevet + committet i `supabase/migrations/00156_agent_core.sql`. **Endnu IKKE kørt mod prod** (afventer godkendt migration-gate). Indeholder de 5 tabeller, hard-block-CHECK + execute-trigger, immutable approvals, composite run/task/action-FK, admin-only RLS, restriktive function-privileges, seed af 7 disabled agenter.
- **Fase 2 — Executor + Capability Registry (kode):** ✅ skrevet, `tsc` + `next build` grønne, sikkerheds-logik enhedstestet (13/13 pass i `scripts/agent-core-logic-test.ts`). Filer:
  - `src/types/agent-core.types.ts` — typer + `HARD_BLOCKED_CLASSES`.
  - `src/lib/agents/approvals.ts` — app-side spejl af DB-approval-reglerne.
  - `src/lib/agents/capability-registry.ts` — registry-ramme + Mailagent-MVP-metadata (handlers endnu ikke wired → fail-safe).
  - `src/lib/agents/budget.ts` — **fail-closed** budget-guard.
  - `src/lib/agents/audit.ts` — agent-audit via `log_audit_event`.
  - `src/lib/agents/executor.ts` — den tvungne, gatede Executor.
  - Verifikation klar til gaten: `scripts/verify-00156.ts` (read-only pre/post), `scripts/test-00156-guards.sql` (negative guard-tests i rollback-transaktion).
- **Fase 3+ (mangler):** wiring af capability-handlers til konkrete draft-funktioner, Agent-indbakke-UI, server-action-lag, per-agent aktivering. Ingen agent er aktiveret; alt kører suggest/disabled.

## Appendiks: kildehenvisninger (audit)

- Mail-intelligence + gate: `src/lib/services/email-intelligence.ts:799`
- Proto-agenter: `src/lib/services/auto-case.ts`, `src/lib/services/auto-offer.ts`, `src/lib/actions/ai-mail-assistant.ts`
- Budget: `src/lib/services/ai-budget.ts` (fail-open), `src/lib/services/system-health.ts:248`
- Mail choke point: `src/lib/services/microsoft-graph.ts:607` (`sendEmailViaGraph`)
- Bogførings choke point: `src/lib/services/economic-client.ts`
- Outbound HTTP: `src/lib/actions/integrations.ts`
- Permissions: `src/lib/auth/permissions.ts`, `src/lib/actions/action-helpers.ts`
- Audit: `supabase/migrations/00019_audit_logs.sql`, `src/lib/actions/audit.ts`
- Autopilot: `supabase/migrations/00090_autopilot.sql`, `src/lib/automation/rule-engine.ts`
- Suggestions: `supabase/migrations/00089_ai_optimization.sql`, `src/lib/ai/suggestion-log.ts`
- Ubrugt kø: `supabase/migrations/00036_external_integrations.sql` (`integration_queue`)
