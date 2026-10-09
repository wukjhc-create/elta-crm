# Deterministisk opfølgningsmotor — design (P3 #16)

**Status (2026-09-28):** design + ren motor bygget og testet, read-only skygge-kørsel mod prod. **Intet er koblet på drift.** De eksisterende rykker-crons kører uændret; motoren sender og skriver intet.
Kode: `src/lib/followup/{calendar,engine}.ts` · tests `scripts/followup-engine-test.ts` · skygge `npx tsx scripts/prod-followup-shadow.ts`.

## 1. Nuværende tilstand (kortlagt)
Der er ti tidsdrevne regler. De vigtigste:

| # | Regel | Hvad | Kilde |
|---|---|---|---|
| 1 | offer-reminders-cron | kundemail på sendt tilbud efter 3 d, hver 3. d, max 3 | `api/cron/offer-reminders` + company_settings |
| 2–3 | samme cron: fuldmagt/besigtigelse | kundemail én gang | JSON i `description`; besigtigelse findes via **titel-søgning** |
| 4 | invoice-reminders-cron | L1 ≥3 d · L2 ≥10 d · L3 ≥20 d (manuel), 5 d cooldown | `services/invoices.ts` |
| 5 | autopilot `invoice_overdue` | samme funktion som #4 (dry-run i prod) | `automation_rules` |
| 7 | opfølgningsagent (manuel) | forslag efter 7 d | `agents/followup-agent.ts` |
| 8 | unanswered-mails-cron | intern opgave efter 24 t | `actions/auto-tasks.ts` |
| 10 | dashboard "følg op" | vises efter 7 d fra **`created_at`** | `dashboard-overview.ts` |

### Konflikter og ikke-determinisme
- **Samme tilbud to steder.** #1 mailer kunden fra dag 3, og #7 foreslår opfølgning fra dag 7 uden at se `reminder_count`.
- **Tre forskellige aldersbegreber.** #1 og #7 regner fra `sent_at`, #10 fra `created_at`.
- **Tre udløbstolkninger.** #1 bruger UTC-midnat, #7 bruger lokal 23:59:59.
- **Tid.** Crons kører i UTC, selvom kommentarerne siger København. Datomatematikken bruger servertid, millisekund-floor og UTC-cutoff.
- **Rækkefølge og loft.** Ubegrænsede eller uordnede forespørgsler (`limit(2000)` uden `order`) giver vilkårlig dækning. Der er intet loft over kundemails pr. kunde pr. dag.
- **Samtidighed.** #1–#3 læser, sender og opdaterer uden lås. Et overlappende kørsel eller retry kan sende to gange.
- **#5 er redundant med #4.** Den UNIQUE-regel, der skulle forhindre dobbelt-kørsel, blokerer i praksis L2/L3 via reglen.

### Nyt fund fra skygge-kørslen (prod, read-only)
- **Fakturarykkere har aldrig virket i prod.** `resolveInvoiceMailRoute` ligger i en `'use server'`-fil og bruger cookie-klienten. Under cron er den anon, så RLS skjuler fakturaen. Resultatet er `skipped` / "Faktura ikke fundet" hver dag siden 2026-07-10 (80 rækker, samme faktura). Det er samme rodårsag som P-003.
- Motoren vurderer samme faktura som forfalden til L1: den er **83 dage over forfald, og der er sendt 0 rykkere**. **Hvis cron-klienten rettes, sendes der straks en rykker til kunden.** Det skal indgå i beslutningen om kundemail-crons.
- Dashboardet viser 2 tilbud som "følg op" (målt fra `created_at`), men hverken cron eller agent ville gøre noget ved dem.

## 2. Designprincipper for motoren
1. **Ren funktion.** Den tager snapshot + dag + konfiguration og returnerer "forfalden"-liste. Ingen DB, ingen netværk, intet LLM, ingen side-effekter.
2. **Dansk kalender.** Alt regnes i hele kalenderdage i Europe/Copenhagen (`calendar.ts`), så hvornår cron'en kører og sommertid er ligegyldigt. Gyldig "til og med" sidste dag.
3. **Determinisme.** Stabil sortering (regel → alder → nøgle) og stabil nøgle pr. cyklus (fx `offer.customer_reminder:<id>:<sent_at>:<n>`). Samme input giver samme output, og det er testet med blandet rækkefølge.
4. **Én regel pr. situation.** Sælger-opgaven kommer først, når kundepåmindelserne er brugt op eller slået fra, ikke parallelt.
5. **Loft.** Højst én kundepåmindelse pr. kunde pr. dag. Faktura går før tilbud, og resten udskydes med begrundelse.
6. **Beslutning ≠ udførelse.** Motoren udsender handlinger (`customer_reminder`, `internal_task`, `manual_review`). Udførelse går via eksisterende gates: interne opgaver som Agent Core-forslag, kundemails kun bag approval + `AGENT_LIVE_SEND_ENABLED`.

## 3. Regler i motoren (standard = nuværende værdier)
| Regel | Betingelse | Handling |
|---|---|---|
| `offer.customer_reminder` | sendt/set, ikke forslag, har kunde, gyldig i dag, ≥ interval dage siden afsendelse/sidste påmindelse, antal < max | kundepåmindelse n/max |
| `offer.seller_task` | påmindelser brugt op eller slået fra, ≥7 d siden afsendelse, ingen åben opgave | intern opgave (high ved ≥14 d) |
| `invoice.customer_reminder` | sendt, ikke kreditnota/annulleret, beløb > 0, næste ikke-sendte niveau opfyldt, cooldown 5 kalenderdage | rykker L1/L2 |
| `invoice.manual_review` | næste niveau er L3 (≥20 d) | manuel vurdering, ingen mail |
| `mail.reply_task` | kundetråd, sidste indgående > sidste udgående, ≥1 kalenderdag, ingen åben opgave | intern opgave (high ≥2 d, urgent ≥7 d) |

## 4. Indfasning (hvert trin er en beslutning)
| Trin | Indhold | Effekt |
|---|---|---|
| 0 ✅ | Motor + tests + read-only skygge mod prod | ingen |
| 1 | Daglig skygge-rapport i Pilot Health: "motor vs. nuværende regler" (kun antal) | DONE på grok-next 2026-10-09. `followupShadowReport` i Crons → "Opfølgning (skygge)". Sender intet. Mail-tråde er ikke med (trin 2). |
| 2 | Opfølgningsagenten bruger motoren (`offer.seller_task`, `mail.reply_task`) som kilde til forslag. Det fjerner parallel-konflikten og dashboard-afvigelsen. | BLOCKED_APPROVAL — samme beslutning som X4d. Sælger-opgaven venter til kundepåmindelser er brugt op, men cronen sender ikke. Et skift nu fjerner de interne forslag uden at kunden får påmindelsen. |
| 3 | Kundepåmindelser (tilbud/faktura) flyttes fra crons til motor → forslag → approval → afsendelse. Kræver `AGENT_LIVE_SEND_ENABLED` + beslutning om kundemail-crons. | **ekstern** |
| 4 | Fuldmagt/besigtigelse: erstat titel-søgning og JSON-i-description med eksplicit status/`reminder_sent_at` | kræver migration |

## 5. Hvad der mangler (BLOCKED)
- Henriks beslutning om kundemail-crons, inkl. konsekvensen ovenfor (83 dage forfalden faktura).
- `mail.reply_task`-snapshot kræver tråd-data fra mail-pipelinen. I dag bestemmes det af cookie-klient-koden i `auto-tasks.ts` (stille no-op under cron, CRON_DISCOVERY F3). Snapshot-bygning for tråde laves sammen med trin 2.
