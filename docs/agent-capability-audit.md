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
| A6 | `mail.send_reply` har handler, men **ingen producent** i koden. Prod har 1 historisk række fra Fase 3-test. | Kan kun opstå ved direkte service-role-insert og er hard-blocked. | Ingen (dokumenteret). Næste milepæl (#13) skal beslutte, om den bevares disabled eller får en eksplicit, gated producent. | S2 |
| A7 | `requiredScope` er kun metadata; der findes ingen scope-model. | Ingen i dag. | Designpunkt til #13. | – |
| A8 | Handler-funktioner kaldes kun fra registeret (ingen genvej uden om Executor). | – | Verificeret. | S3 |

## Åbent — kræver DDL (gate)
DB-triggeren `agent_enforce_approval_before_execute` bruger stadig rækkens klasse. Executoren lukker nu hullet i koden. En DB-side hærdning (fx en `CHECK`, der binder kendte capability-nøgler til deres klasse, eller en `agent_capabilities`-tabel, som triggeren slår op i) vil være et ekstra lag. Det er **ikke** lavet, da det er en prod-migration og kræver Henriks godkendelse. Den er ikke nødvendig, så længe kun service-role skriver `agent_actions`, og det gør den i dag (ingen authenticated INSERT/UPDATE-policy).
