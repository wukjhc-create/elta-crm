# Agent capability-audit (backlog P2 #11) — 2026-09-28

Alle registrerede capabilities er gennemgået mod approval/executor-modellen. Testene er `npm run harness:agent-gating` (8/8, staging og statisk) og alle 7 agent-unittests.

## Matrix
| Capability | Ejer (agent) | Klasse | Approval | Hard-block | Producent | Handler |
|---|---|---|---|---|---|---|
| `mail.draft_reply` | mail | read | fri | – | mail-agent.ts | materialiserer udkast (ingen ekstern effekt) |
| `mail.link_customer` | mail | update | kræves | – | mail-agent.ts | linker kun ved én entydig kandidat eller et reviewer-valg blandt kandidaterne |
| `case.propose_from_email` | mail | create | kræves | – | mail-agent.ts | opretter sag som forslag (idempotent, stale-tjek) |
| `mail.send_reply` | mail | send_external | kræves | **ja** | **ingen** | Graph-afsendelse, uvist → needs_verification |
| `offer.propose_draft_from_case` | offer | create | kræves | – | offer-proposal.ts | tomt tilbudsudkast som forslag (UNIQUE pr. sag) |
| `followup.draft_offer_reminder` | followup | read | fri | – | followup-agent.ts | materialiserer udkast |
| `followup.create_task` | followup | create | kræves | – | followup-agent.ts | intern opgave (stale-/dublet-tjek) |

## Fund og rettelser
| # | Fund | Risiko | Rettelse | Test |
|---|---|---|---|---|
| A1 | Executor og DB-trigger brugte **action-rækkens** `side_effect_class`. En række, der fejlagtigt angav en lavere klasse, kunne komme uden om hard-block/approval. | Kræver en kodefejl, da kun service-role skriver rækker. Defense-in-depth-hul. | Executor slår capabilityen op **før** gating og afviser ved klasse-mismatch (fail-closed). | G1 |
| A2 | `requires_approval=false` på rækken kunne fjerne approval for en skrivende capability, fordi config kun kræver approval for hard-blocked klasser. | Samme som A1. | Approval = hard-block ∨ config ∨ **capability-default** ∨ række. Rækken kan kun skærpe. `minApprovals` = max(række, capability). | G3 + positiv kontrol G4 |
| A3 | Ingen binding mellem capability og agent (`allowed_action_types` er tom for alle 7 og bruges ikke). En mail-run kunne udføre en tilbuds-capability. | Samme som A1. | `agentTypes` på hver capability, håndhævet i Executor. | G2 |
| A4 | Vindue mellem approval-tjek og claim: en afvisning, der lander imellem, blev ikke set. | Lille race. | Approvals genverificeres efter claim. Ugyldig → claim frigives, afvist, intet udført. | logik + regression (C1, fase5) |
| A5 | Registrering tillod en skrivende klasse uden approval-default. | Fremtidige capabilities. | `registerCapability` kaster ved ikke-`read` uden `defaultRequiresApproval`, og ved manglende ejer. | S1 |
| A6 | `mail.send_reply` havde handler, men **ingen producent**. Transportlaget blev bygget i Fase 3 (2f94967), og produceren blev bevidst udskudt. Den eneste prod-række er Fase 3-testen 2026-09-20: intern `eltasolar.dk`-modtager, godkendt. | Kunne kun opstå ved direkte service-role-insert. | **Løst (P2-rest B).** Produceren `send-reply-producer.ts` laver et forslag ud fra et *udført, udfyldt* svarudkast og afviser skabelon-udkast. Den giver ét aktivt forslag pr. mail, sætter status awaiting_approval og er hard-blocked. Ny kill-switch `AGENT_LIVE_SEND_ENABLED` (default OFF): Executor afviser al send/push ikke-terminalt, og handleren tjekker det samme. | unit + `harness:send-producer` 5/5, S2 |
| A7 | `requiredScope` er kun metadata; der findes ingen scope-model. | Ingen i dag. | Designpunkt til #13. | – |
| A8 | Handler-funktioner kaldes kun fra registeret (ingen genvej uden om Executor). | – | Verificeret. | S3 |

## DB-side hærdning (P2-rest A) — migration 00163
`agent_capabilities` (spejl af registeret) + triggeren `trg_agent_actions_capability_guard` gør DB'en fail-closed uafhængigt af koden. Se [runbook](runbooks/00163-agent-capability-guard.md). Status: **staging ✅, prod ✅ (2026-09-29, `prod:verify-00163`).** Test: `harness:agent-gating` 13/13.

## P2 #12 — stale-state / idempotens / samtidighed pr. capability

| Capability | Samtidig udførelse | Gentagelse | Stale-state | Samtidig forslags-kørsel | Test |
|---|---|---|---|---|---|
| `mail.draft_reply` | 1 executed, resten noop (claim) | noop | – (kun udkast) | 1 forslag (`mail-reply:<mail>`) | M1, M2 |
| `mail.link_customer` | 1 executed | ok/idempotent (`already_linked`) | **rettet:** overskrev en manuel kobling → nu atomisk betinget UPDATE (`customer_id IS NULL`); anden kunde ⇒ failed, intet ændret | 1 forslag (`mail-link:<mail>`) | M3, M4, unit 8–9 |
| `case.propose_from_email` | 1 executed, præcis 1 sag | genbrug af sag | kundekobling ændret ⇒ afvist (tamper) | 1 forslag (`mail-case:<mail>`) | M5, case_proposal_flow |
| `offer.propose_draft_from_case` | 1 executed (C1) · UNIQUE pr. sag (C3) | noop | sag lukket/ændret ⇒ afvist | 1 aktivt forslag (C2, rettet i P1 #7) | concurrency C1–C3, fase5_offer_flow |
| `followup.draft_offer_reminder` / `followup.create_task` | claim | noop | tilbud besvaret ⇒ afvist | 1 pr. afsendelses-cyklus (C5) | C5, fase5_followup_flow |
| `mail.send_reply` | claim | noop · uvist ⇒ needs_verification (ingen retry) | – | ingen producent (A6) | agent-sendreply unit |

**Hængende udførelse** (proces-crash efter claim): actionen bliver i `executing` og genoptages aldrig automatisk. Det er bevidst, for en sendt mail må aldrig sendes igen. Pilot Health viser nu "Hængende udførelser (>15 min)" som rød (M7).
