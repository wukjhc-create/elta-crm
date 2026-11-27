# Phase C — udviklingslog (autonom udviklingspakke, Henrik 2026-11-27)

Branch: `claude-phase-c-intelligent` (fra `cbc9116b` = main/prod). **Aldrig push/merge til main, ingen prod-migration,
ingen prod-flag.** Prod read-only undersøgelser må fortsætte (kun SELECT/rollback-only, ingen personværdier ud).
Ved kontekst-komprimering: læs denne fil først, derefter "Næste delopgave".

## Rammer (uforhandlelige)
- Ingen push/merge/deploy til Production, ingen prod-migrationer/-flag/-dataændring, ingen ekstern kommunikation.
- Eksisterende automatisk kundeoprettelse i prod forbliver TIL. Ingen sletning/sammenlægning af kunder.
- F-1 HARD BLOCKER: ingen portaludvidelse. Mail-sync forbliver 5 min.
- Staging-migrationer kun additive + reversible, ingen udvidelse af adgang, ingen sletning — ellers blocker.
- Nye funktioner bag flag, standard FRA. AI foreslår, medarbejder godkender; intet sendes automatisk.
- Commit kun når tsc + check:rbac + check:rls-matrix er grønne. Ingen persondata/mailindhold i logs/commits/docs.

## Plan (rækkefølge)
| # | Delopgave | Status |
|---|---|---|
| 0 | C1a hærdning (gentagelse, rettelser, note-redigering, C0) | ✅ 71910605 |
| 1 | Arkitekturkortlægning (mail, Stage A, kunde/sag, parter, AI) | ✅ |
| 2 | C2 identifikationsmotor (ren kerne + loader) + tests | ✅ f36930ce (bulk f06bd168) |
| 3 | C3 kunde-/sagsforslag + udførelse via eksisterende koblingsstier, audit, idempotens | ✅ f36930ce |
| 4 | C4 dubletkontrol + erstatningsflow for auto-kundeoprettelse (flag) + read-only dubletrapport | ✅ f36930ce/f06bd168 (rapport-UI mangler) |
| 5 | C7 arbejdskø (samler mail + henvendelse + forslag; tællere, filtre, prioritet, ansvarlig, status) | ✅ f36930ce |
| 6 | Stage A-forbedringer (støj, blokerede tilbagekald, ét behandlingssted, statussync) | ✅ 0ad2cdd4 |
| 7 | C5 kommunikationsoverblik på kunde/sag | ✅ f6f5a43b |
| 8 | C6 AI-assistent (genbrug eksisterende integration; prompt-injection-værn) | |
| 9 | C0 udvidede målepunkter | |
| 10 | Samlet brugerrejse-test, regression, build, docs, prod-udrulningsplan | |

## Log
- 2026-11-27: C1a `cbc9116b` deployet til prod inert (efter Henriks godkendelse i forrige besked); alle prod-tjek grønne
  (verify-00255 20/20, aktiverings-smoke 8/8, db-audit 0, Stage A 0/0, portal uændret, 0 feedback-rækker).
- 2026-11-27: C1a-hærdning `71910605` (kun branch).

## Arkitektur-fakta (kortlagt 2026-11-27)
- Mail: `incoming_emails` rummer også SENDTE mails (ingen direction-kolonne; afsender = ELTA-postkasse). linked_by-værdier:
  auto, auto-noise, auto-ai, manual, auto-create, manual-create. Handlinger i `lib/actions/incoming-emails.ts` (gate
  inbox.view): linkEmailToCustomer (→ email-linker.manuallyLinkEmail, kobler tråd; INGEN scope-tjek), linkEmailToCase,
  ignoreIncomingEmail, archiveEmail, createCustomerFromEmail, createLeadFromEmailAction; createServiceCaseFromEmail
  (service-cases.ts). Mailvisning: `app/dashboard/mail/components/mail-detail.tsx`.
- Auto-kundeoprettelse: `email-intelligence.ts findOrCreateCustomer` (:536), loft 25/døgn, tag auto-email, intet flag.
- Stage A: conversations/items/actions (00249/00250). Guard-trigger: proposed→enhver tilstand af bruger (decided_by=auth.uid);
  executed kræver executed_ref; blocked/executed/rejected låst. markHenvendelseHandled/confirm/assign i
  `lib/actions/henvendelser.ts` (conversations.manage). Manuel mailkobling → trigger 00250:890 kobler henvendelsen.
  Kun create_task/callback udføres ved godkendelse; customer/case-forslag bliver "approved" for evigt.
- Kunde: `customer-detail-client.tsx` (Oversigt har allerede `CustomerCommunicationTimeline` via
  `lib/actions/communication-timeline.ts` + `lib/timeline/compose.ts`). Sag: `/dashboard/orders/[id]` (faner).
- Dubletter: `customer-duplicates.ts findCustomerMatchesByEmailOrName`, `checkDuplicateCustomer`; parties RPC'er 00255.
- AI: OpenAI gpt-4o-mini via `lib/ai/ai-client.ts` (aiChat/aiStructured, AI_TASKS), budget `ai-budget.ts`.
- Rettigheder: `lib/auth/permissions.ts`; effektivt via getAuthenticatedClientWithRole().hasPermission; scope
  userCanViewCustomer/userCanViewCase. Flag-mønster: lib/**/feature-flag.ts, env === 'true'.

## Beslutninger
- D1 Ingen migration i v1: behandlingsstatus = eksisterende felter (conversations.status/handled_at, incoming_emails
  is_archived/link_status); forslag beregnes ved visning; valg/afvisning/rettelse = audit_logs (`coordinator_*`).
- D2 Ét behandlingssted: arbejdskøen (C7) samler mail + henvendelse; "Afslut" lukker henvendelsen (markHenvendelseHandled)
  OG arkiverer mailen — mail-siden og Henvendelser viser derfor samme status.
- D3 Outlook: et svar sendt fra ELTA i samme Graph-tråd (synkede sendte mails) = pålideligt "besvaret"-signal → vises og
  tilbydes som ét-klik afslutning; læst-flag tolkes ALDRIG som behandlet; uden signal står "Ingen registreret behandling".
- D4 Flag (alle standard FRA/uændret): COORDINATOR_ENABLED (C2/C3/C5-sag/C7/Stage A-visning), COORDINATOR_AI_ENABLED (C6),
  MAIL_CUSTOMER_AUTOCREATE_MODE = auto (standard, som i dag) | suggest (C4-erstatning: ingen auto-oprettelse; forslag i køen).
- D5 Identitet beregnes med service-role, men kandidater/sager vises KUN hvis brugerens egen klient kan læse dem.

## Testresultater (løbende)
- Rene: identitet 29/29, forslag+signaler 26/26, dubletter+tidslinje 27/27, C1a 50/50, C1 108/108
- Staging `cli.ts coordinator-probe 40`: 0 fejl, paritet C1 40/40, invarianter OK, kø 80 poster 3,5 s (før bulk 35 s)

## Kendte fejl / blockers
- Tildeling (ansvarlig) findes kun for poster med Stage A-henvendelse (conversations.assigned_profile_id); mails uden
  henvendelse kan ikke tildeles uden migration (mangler kolonne). Stage A indtager alle egnede kundemails, så det er få.
- Sidebar-tælleren tæller åbne mails (HEAD) og kan være lidt højere end listen (mails hvis henvendelse er håndteret
  men mailen ikke arkiveret tælles; listen skjuler dem).

- 2026-11-27: C6 `857c4b92` (AI-værn: fund under test — sagsnummer fra selve mailen blev godtaget; rettet: kun KENDTE
  sags-/tilbudsnumre). C0 + køvindue `96ff1f11` (prod read-only: 689 åbne uarkiverede mails → COORDINATOR_QUEUE_DAYS=30).
- Hoveddokument: `PHASE_C_INTELLIGENT_CRM.md` (moduler, sikkerhed, rettigheder, flag, UX/Outlook, roadmap, udrulning, rollback)

## Næste delopgave
UI-harness U272/U274/U275 (flag TIL) + U272 flag FRA → regression (reception, parties, classification, portal-security,
smoke) med flag TIL → statiske suiter → slutrapport. Testdata ryddes af testene selv.
