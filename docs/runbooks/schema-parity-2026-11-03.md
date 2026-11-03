# Skema-paritet staging ↔ prod — 2026-11-03

Efter fundet af `customer_notes` (staging ja / prod nej) er hele `public`-skemaet + storage sammenlignet. Alt read-only:
`scripts/prod-staging-parity.ts` (samme forespørgsler på begge sider, CR normaliseret i funktionskroppe) og
rollback-only anon-prøve. Kode ↔ prod: statisk scanning af `.from()`/`.rpc()`/`.select()`/filtre i `src` mod prods
faktiske tabeller, funktioner og kolonner.

## Overblik

| Område | Prod | Staging | Reelle forskelle |
|---|---|---|---|
| Tabeller/views | 165 | 167 | `assistant_links`, `personal_reminders` kun staging |
| Kolonner | 2560 | 2582 | de to tabeller + `customer_documents.visible_to_customer` kun staging |
| Funktioner | 87 | 87 | krop/secdef/config ens; kun EXECUTE-ACL afviger (uden effekt, se nedenfor) |
| Politikker (public+storage) | 408 | 410 | de to tabeller + `incoming_emails_select` (00186) |
| Grants | 366 | 369 | de to tabeller; 7 forskelle i privilegie-sæt (REFERENCES/TRIGGER, service_role) |
| Indeks / constraints / triggere / views / enums / extensions / buckets | | | kun de staging-only objekter ovenfor |
| Rettighedskatalog / rollestandarder | 114 / 273 | 114 / 273 | ingen |

Migrationshistorik: `supabase_migrations.schema_migrations` findes kun i prod og stopper ved 00055. Kilden til "hvad er
kørt i prod" er `scripts/prod-apply-migration.ts` APPROVED + objekt-tilstedeværelse, ikke historiktabellen.
Ikke-godkendte filer ≥00150 og deres tilstand:

| Migration | Prod | Staging | Kommentar |
|---|---|---|---|
| 00150–00158 | anvendt | anvendt | før APPROVED-listen; objekterne findes begge steder |
| 00184 `customer_documents` type `internal` | ikke | ikke | CHECK tillader ikke 'internal'; koden skriver det ikke (kun læse-tjek) |
| 00186 `incoming_emails` bogholderi-scope | **ikke** | anvendt | se P-1 |
| 00195 `assistant_links` / 00197 `personal_reminders` | ikke | anvendt | Telegram-assistent, se P-2 |
| 00196 `customer_notes` | — | anvendt | erstattet af 00245 (begge steder nu ens) |
| 00233 lead-opfølgning | ikke | ikke | koden bag `LEAD_FOLLOW_UP_ENABLED` (fra) |
| 00071 multi-mailbox (`incoming_emails.mailbox_source`) | ikke | ikke | se P-4 |
| 00046 kalkulations-intelligens (4 tabeller) | ikke | ikke | se P-5 |

Nummerering: dublet `00088` (to filer, historisk, begge anvendt). `grok-features-2` = main (`3354159`), ingen nye
migrationer → næste frie nummer er **00246**.

## Fund

### P-1 — `incoming_emails` SELECT: prod mangler 00186 (bogholderi ser hele postkassen) — **S2 (latent)**
- Funktion: mail/indbakke, kundetidslinje.
- Staging: bogholderi ser kun mails koblet til en kunde eller kilde til en leverandørfaktura (00186).
- Prod: politikken fra 00180 — bogholderi ser ALLE indgående mails (nye henvendelser, private, nyhedsbreve).
- Brugerpåvirkning i dag: ingen — prod har 0 bogholderi-profiler. Første bogholderi-konto i prod får fuld postkasse.
- Risiko: persondata-eksponering ud over Henriks beslutning 2026-10-02 ("ikke hele virksomhedens mailbox").
- Begge versioner bruger rå `user_role()` — ingen af dem følger effektive rettigheder (`customers.emails.view`/
  `inbox.view` + scope). En per-medarbejder-revoke virker derfor ikke på DB-niveau for mails.
- Sikker rettelse: ny migration der erstatter `incoming_emails_select` med effektive rettigheder (`inbox.view` = alle
  mails; `customers.emails.view` = kun mails på kunder i `my_customer_scope_ids()`; faktura-kilde via
  `incoming_invoices.view`; montør-klausulen bevaret). 00186 må ikke køres som den er (rå rolle, ikke ny model).
- Migration: ja (kræver Henriks godkendelse). Indtil da: opret ingen bogholderi-profil i prod.
- **Status 2026-11-03:** rettet med **00246** (`incoming_emails` SELECT efter effektive rettigheder, ingen ny nøgle) —
  anvendt på STAGING og PROD (2026-11-03, efter Henriks godkendelse). Bevis: `docs/runbooks/mp-00246-incoming-emails-scope.md`.

### P-2 — `assistant_links` / `personal_reminders` kun på staging — **S3**
- Funktion: Telegram-kobling (profil), personlige påmindelser (opgaver/kalender).
- Prod: tabellerne findes ikke. Koden tåler det: `getTelegramLinkStatus` skjuler kortet, `getMyPersonalReminders`
  giver `available:false`, Telegram-webhook og påmindelses-cron svarer 404/er ikke planlagt (`ASSISTANT_TELEGRAM_ENABLED`
  fra; prod-svar 404 bekræftet).
- Svaghed: begge behandler ENHVER fejl som "ikke tilgængelig" (samme mønster som kundenoter før 1b002ce4) — en ægte
  RLS-/kolonnefejl ville også blive skjult. Ikke brugerrettet nu.
- 00195/00197 bruger ejer-politikker (`owner_id = auth.uid()`), ingen rå rolle-bypass; skal alligevel gennemgås mod
  nutidens model før prod (som 00196→00245). Ingen handling før Telegram-assistenten skal i prod.
- Migration: først når funktionen skal live.

### P-3 — `customer_documents.visible_to_customer` (+ indeks) kun på staging, uden migrationsfil — **INFO**
- Rest af et tilbagerullet eksperiment (findes i git-historik, ikke i `supabase/migrations`, ikke brugt af `src`).
- Risiko: staging kan skjule en fejl hvis kode igen begynder at bruge kolonnen. Ingen prod-påvirkning.
- Rettelse: ingen nu (ingen spekulativ oprydning). Noteres så den ikke forveksles med en manglende prod-migration.

### P-4 — Mail-sync genbehandling er død kode i begge miljøer (`incoming_emails.mailbox_source` findes ikke) — **S3**
- `email-sync-orchestrator` trin 3b (genbehandling af `pending` mails) filtrerer på `mailbox_source` (00071 aldrig
  anvendt). Forespørgslen fejler stille → ubehandlede mails genoptages aldrig. Indsættelse har fallback og virker.
- Prod i dag: 59 `pending`+ubehandlede mails, 0 inden for genbehandlingsvinduet (14 dage) → ingen aktuel påvirkning.
- Rettelse (kode, ingen migration): fjern `mailbox_source`-filteret eller udled postkassen fra `to_email`; dækkes af
  mail-test. Ikke akut.

### P-5 — Kode der forventer skema, som ingen miljøer har — **S3**
- `calculation-intelligence.ts`: `installation_types`, `component_time_intelligence`, `room_calculations`,
  `calculation_anomalies` (00046 aldrig anvendt) → rumberegner/anomalier fejler (admin/serviceleder, `tools.calculations`).
- `offer_text_templates.sort_order/is_default/template_type` findes ikke → skabelonlister i AI-projekt fejler.
- `ai/componentMatcher.ts`: `supplier_products.is_active` findes ikke (kolonnen hedder `is_available`) → AI-projektets
  materialeopslag bliver altid tomt og falder tilbage til standardpriser.
- RPC'er `increment_quick_job_usage`, `increment`, `increment_counter` findes ikke; alle har fallback.
- Påvirkning: gamle værktøjssider for admin/serviceleder; ingen data- eller sikkerhedsrisiko. Rettelse kræver en
  produktbeslutning (fjern siderne eller byg skemaet) — vent.

### P-6 — anon har tabel-privilegier på 35 objekter (ingen effektiv adgang) — **S3 (forsvar i dybden)**
- Prod og staging ens: anon har SELECT/INSERT/UPDATE/DELETE på bl.a. `employee_compensation`, `invoices`,
  `incoming_emails`, `audit_logs`, `bank_transactions` og 3 views (Supabase-standardgrants der aldrig er trukket).
- Effektivt lukket: RLS er slået til, ingen politik gælder anon/PUBLIC, views har `security_invoker=true`. Bevist med
  rollback-only prøve i prod: anon ser 0 rækker i alle 35 objekter; anon-INSERT afvises (42501).
- 4 tabeller har politikken `Anyone can view … TO anon` (`product_catalog`, `product_categories`,
  `package_categories`, `project_templates`), men anon har ingen grant der → inaktiv. En fremtidig `GRANT … TO anon`
  ville åbne dem (for `product_catalog` inkl. kostkolonner hvis kolonne-grants ikke følger med).
- Rettelse: én migration `REVOKE ALL … FROM anon` på objekter uden anon-behov + fjern de fire anon-politikker. Kræver
  godkendelse; ikke akut (intet eksponeret). Må ikke "genåbne" anon.

### P-7 — EXECUTE-ACL afviger mellem miljøer — **INFO**
- Kroppe, security definer, search_path og volatilitet er identiske for alle 87 funktioner. Forskellen er kun hvem der
  har EXECUTE: prod giver eksplicit service_role (og anon/authenticated på ældre SECURITY INVOKER-funktioner); staging
  har NULL-ACL (= PUBLIC). Ingen SECURITY DEFINER-funktion kan kaldes af anon i prod. `handle_new_user` (trigger) kan
  "kaldes" af authenticated i prod, men triggerfunktioner kan ikke kaldes direkte. Ingen handling.

### P-8 — Øvrigt
- 240 politikker bruger stadig rå `user_role()` (begge miljøer) mod 23 på effektive rettigheder — kendt, migreres
  bølgevis; ikke drift.
- Driftsfund uden for skema: `lemu-sync` (ugentlig LM-prisfil) fejlede 2026-11-02 med HTTP 500 efter 47 s.
  `system_health_log` har kun to lemu-kørsler de seneste 40 dage (ok 2026-09-28, fejl 2026-11-02) — enten logges
  ugerne imellem ikke, eller cron'en kører ikke hver uge. LM-priser kan være forældede. Bør undersøges separat (ingen
  skemaårsag fundet).

## Separate spor (bevidst IKKE i 00246 — Henrik 2026-11-03)

| Spor | Klasse | Status | Næste skridt |
|---|---|---|---|
| anon-privilegier (P-6) | S3 forsvar i dybden, intet aktivt læk | registreret | egen migration (REVOKE + fjern 4 anon-politikker) efter godkendelse |
| Telegram/påmindelser 00195/00197 (P-2) | S3 | kun staging | gennemgå mod nutidens model først når assistenten skal i prod |
| Gamle AI-projekt-/kalkulationstabeller (P-5) | S3 | registreret | produktbeslutning: fjern siderne eller byg skemaet |
| Staging-orphan `customer_documents.visible_to_customer` (P-3) | INFO | registreret | ingen handling |
| Telefoni-persistens | — | design accepteret, låste beslutninger i `telephony-events-proposal.md` | nummer 00247 reserveret (ingen fil, ikke kørt) |
| LM-prissync (nedenfor) | drift | registreret | undersøg separat; ingen reparation i mail-sporet |

### Driftsfund — LM-prissync (`/api/cron/lemu-sync`, mandage 04:00 UTC) — 2026-11-03, prod read-only
- Seneste fejlede kørsel: **2026-11-02 04:01 UTC, HTTP 500** ("Internal server error") efter 46,7 s.
- Seneste kørsel med OK i `system_health_log`: 2026-09-28 (962 opdateret, 309.817 nye; fil LM_CSV_Standard_20260922…).
- Men `supplier_products` for Lemvigh-Müller (328.186 varer) har `last_synced_at` max **2026-10-26 04:01 UTC** → kørslen
  2026-10-26 lykkedes uden at blive logget. Cron-loggen er altså ufuldstændig for lemu-sync (ugerne imellem mangler).
- Forældede priser: LM-priser er senest fra 2026-10-26 (≈ 8 dage); næste planlagte kørsel 2026-11-09. Lav akut risiko,
  men to fejl i træk giver to uger gamle priser i tilbud/kalkulation.
- Sidefund: AO (1.343 varer) har `last_synced_at` max **2026-03-01** — AO-priser er ~8 måneder gamle. Bør med i samme
  undersøgelse.

## Gentag
```
npx tsx scripts/prod-staging-parity.ts --json <fil>
```
