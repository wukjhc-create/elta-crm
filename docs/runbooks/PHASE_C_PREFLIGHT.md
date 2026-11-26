# Phase C — præflight: mærkbar tidsbesparelse i kommunikation og kunderegister

Status: **FORSLAG (2026-11-26)** — intet er implementeret, ingen migration er skrevet, intet flag er sat. Hver leverance
nedenfor kræver Henriks særskilte godkendelse (implementering, hver migration og hvert prod-trin for sig).

Faste rammer for hele Phase C:
- **F-1 er HÅRD blokering for portaludvidelser.** Ingen leverance her ændrer kunde-/partnerportalen, `visible_in_portal`,
  `external_publications` eller `external_feed`. Alt i Phase C er internt (personale).
- **Ingen automatisk ekstern kommunikation.** `EXTERNAL_SENDS_ENABLED` forbliver konstant `false`; ingen mail/SMS/opkald,
  intet auto-svar. Nila/Relatel røres ikke.
- **AI foreslår, mennesket beslutter.** AI og deterministiske regler må kun skabe *forslag*; hver koblings-/oprettelses-/
  sammenlægningshandling udføres af en indlogget medarbejder og auditeres. Det følger 00254/00255-værnene (AI-relation kun
  `proposed`, kilde-præcedens manual > deterministic > ai > none, parter oprettes aldrig af AI).
- **Måling før og efter.** Hver leverance har en målbar KPI (minutter/klik/antal manuelle handlinger), så vi kan vise
  tidsbesparelsen og stoppe det, der ikke virker.
- Prod-rækkefølge som altid: KODE → TEST (staging) → PUSH → MIGRATION (kun hvis nødvendig) → POST-CHECK; flag standard FRA.

## 1. Udgangspunkt (hvad findes allerede, og hvor tiden går)

| Byggesten (i prod) | Hvad den giver Phase C |
|---|---|
| Stage A: mail → Henvendelser (`lib/reception/*`, `conversations`/`conversation_items`/`conversation_actions`) | Én indbakke; handlinger `find_customer/case`, `create_customer_proposal`, `create_case_proposal`, `create_task` … allerede som *forslag* (prod 2026-11-26: 109 handlinger, 77 proposed, 32 blocked) |
| Deterministisk identitets-matcher (`lib/reception/identity-match.ts`) | Telefon/mail/kundenr./kontakt → `unique_match`/`ambiguous`/`no_match`; aldrig navne, aldrig fuzzy |
| Leverandørværn (`lib/email/supplier-senders.ts`, S2 2026-11-23) | Kendt leverandørafsender bliver aldrig auto-kunde/auto-kobling |
| K5 mail-autolink (`lib/services/email-autolink.ts`, `MAIL_AUTOLINK_MODE` off/suggest/link) | Kobling-forslag mail→kunde; `suggest` logger kun i `audit_logs` (prod: `off`) |
| Parter (00254/00255, aktiv) | `parties.verified_emails/verified_domains`, relationer med `source='ai_suggestion'` → kun `proposed`, `case_participants` |
| `conversations.source_party_id` / `communication_class` / `_source` (00254) | Kolonnerne findes; alle står `unknown/none` (ingen fase C) — DB-værn håndhæver kilde-præcedens |
| Kommunikationsklasser (`lib/parties/communication-class.ts`, ren, ubrugt) | 12 klasser + deterministisk "familie"-logik; AI må kun forfine inden for familien |
| Dublet-normalisering (`lib/parties/party-dedupe.ts` = SQL `party_normalize_*`), `lib/customers/customer-email.ts` | Navne/CVR/mail-nøgler til dubletsøgning |

Hvor tiden går i dag (målt read-only 2026-11-23, skal genmåles i C0):
- **Kunderegistret forurenes af automatik:** 111 af 126 kunder er auto-oprettet af mail-automatikken (`auto-email`); ca. 12
  er sandsynligvis leverandører/partnere, 43 ukendte. Hver forkert kunde koster oprydning og giver forkerte koblinger.
- **Manuel kobling:** mails uden kunde/sag skal kobles i hånden; der gives ingen begrundede forslag i UI'et.
- **Støj:** nyhedsbreve/automatiske mails og leverandørbekræftelser ligger i samme strøm som kundehenvendelser.
- **Spredt historik:** sagens mails, henvendelser, noter, (senere) opkald og deltagere ses forskellige steder.

## 2. Leverancer (små, selvstændige, hver med egen værdi)

Anbefalet rækkefølge: **C0 → C1 → C2 → C3 → C4 → C5 → C6 → C7**. C1, C2 og C4a kræver ingen migration.

### C0 — Baseline og tidsmåling (read-only)
- **Værdi:** gør "mærkbar tidsbesparelse" målbar; vælger de rigtige leverancer først.
- **Funktionalitet:** read-only prod-script + lille internt "Effekt"-kort (kun admin): mails/dag pr. postkasse, andel uden
  kunde/sag, tid fra modtagelse til kobling, manuelle koblinger/dag, auto-oprettede kunder/uge, Stage A-forslag
  (accepteret/afvist/ignoreret), dublet-kandidater. Ingen persondata i output (kun antal/fordelinger).
- **DB/UI:** ingen migration; scriptet `scripts/prod-phase-c-baseline.ts` (SELECT-only); kortet læser samme aggregater.
- **Rettigheder:** kortet kun `settings.view`/admin; scriptet kører med read-only-runneren.
- **Sikkerhed:** lav — aggregater; aldrig emner/afsendere i output.
- **Afhængigheder:** ingen.
- **Test:** fixture-test af aggregeringen; prod-kørsel read-only; tal krydstjekkes mod `prod-stage-a-monitor`.
- **Rollback:** fjern kortet (kode); scriptet er harmløst.

### C1 — Deterministisk klassificering af henvendelser
- **Værdi:** kontoret ser straks hvad der er kunde, leverandør, faktura, automatisk/nyhedsbrev — støj kan filtreres fra
  (forventet: de fleste ordre@-mails er leverandørpost).
- **Funktionalitet:** ved Stage A-indtag sættes `communication_class` + `_source='deterministic'` ud fra *evidens*:
  ELTA-afsender → internal; `incoming_invoices` → supplier_invoice; leverandørværn/leverandør-relation → leverandørfamilien;
  noreply/mailer-daemon/List-Unsubscribe → automatisk/nyhedsbrev; webformular (FormSubmit) → customer_request/lead; aktiv
  partner-/underleverandør-/producentrelation → partner_order/subcontractor/technical_support. Uden evidens: `unknown`.
  Medarbejderen kan rette klassen (kilde `manual`, vinder altid). Filtre i Henvendelser: "Kunder", "Leverandører",
  "Automatisk", "Ukendt". **Klassen styrer aldrig synlighed** (feedet læser den ikke).
- **DB/UI:** ingen migration (kolonner + værn fra 00254). Historiske henvendelser: valgfri kontrolleret engangs-
  klassificering (særskilt godkendelse; kun `deterministic`, overskriver aldrig `manual`). UI: klasse-chip + filter.
- **Rettigheder:** læsning følger henvendelsens scope; manuel klasse kræver `inbox.view` (DB tillader kun brugeren at sætte
  `manual`).
- **Sikkerhed:** fejlklassificering skjuler en kundemail bag et filter → "Ukendt" og "Kunder" vises altid som standard;
  automatik må aldrig arkivere/lukke. Ingen AI i C1.
- **Afhængigheder:** Stage A (aktiv), `communication-class.ts`.
- **Test:** ren test af evidens → klasse (alle 12 klasser + konflikter), staging-probe af DB-præcedensen, UI-test (ny
  U-gruppe) med harness-mails fra leverandør/noreply/webformular; prod read-only fordeling efter aktivering.
- **Rollback:** flag `COMM_CLASS_DETERMINISTIC_ENABLED` FRA → nye henvendelser `unknown/none`; satte klasser er harmløse
  (påvirker kun filtre) og kan nulstilles kontrolleret.

### C2 — Automatisk identifikation af kunder og samarbejdspartnere (afsender → part)
- **Værdi:** kendte partnere/leverandører/kunder genkendes næste gang automatisk; ingen gentaget opslag.
- **Funktionalitet:** afsenderens mail/domæne slås op deterministisk: `parties.verified_emails` (eksakt) →
  `verified_domains` (kun ikke-gratis domæner, én liste i `free-mail-domains.ts`) → kunderegister via identity-match →
  leverandørregister. Entydigt fund sætter `conversations.source_party_id` som *forslag-kandidat*, vist som "Afsender:
  KlimaEnergi (samarbejdspartner)". Flertydigt/intet → intet sættes. Knappen **"Husk afsender"** (menneske) tilføjer
  mailen/domænet til partens verificerede felter, så næste mail genkendes.
- **DB/UI:** migration (lille, additiv): ny SECURITY DEFINER-RPC `add_party_verified_contact(party, email|domain)` (samme
  mønster som 00255: ingen direkte skrivning, audit, REVOKE også fra service_role) + GIN-indeks på `verified_emails`/
  `verified_domains`. UI: afsender-linje i henvendelsen + "Husk afsender"/"Ikke denne".
- **Rettigheder:** "Husk afsender" kræver `parties.manage`; visning følger `party_visible_to_me`.
- **Sikkerhed:** afsenderadresser kan forfalskes → en match er altid en *kandidat*, aldrig autentifikation; gratis-domæner
  må aldrig blive verificeret domæne; domæne-match må aldrig give ekstern adgang (F-1 urørt).
- **Afhængigheder:** 00255 (aktiv), C1 (klassen bruger relationen som evidens).
- **Test:** ren test af opslagsrækkefølge/gratis-domæner; staging-probe af RPC (rettigheder, audit, dubletter); U-test
  "ny mail fra kendt partner"; prod-dryrun rollback-only før migration.
- **Rollback:** flag FRA (ingen opslag); RPC kan stå inert; migrationens rollback-sektion bevises på staging.

### C3 — Forslag til kobling: mail → kunde → eksisterende sag
- **Værdi:** den største daglige tidsrøver — kobling bliver ét klik på et begrundet forslag i stedet for søgning.
- **Funktionalitet:** trin a) aktivér K5 `MAIL_AUTOLINK_MODE=suggest` (kun audit, ingen UI-ændring) i ~7 dage og mål
  præcision (`prod-autolink-suggest-eval.ts`). Trin b) forslagskort i mailen/henvendelsen: "Kunde X — grund: kendt mail" og
  "Sag SVC-01006 — grund: sagsnummer i emnet / svar i samme tråd / kundens eneste åbne sag". Godkend = eksisterende
  koblingssti (auditeret); Afvis = forslaget skjules og registreres som feedback. Aldrig auto-kobling i Phase C
  (`link`-tilstanden forbliver FRA).
- **DB/UI:** trin a ingen migration. Trin b: én generisk tabel `communication_suggestions` (kind customer_link/case_link/
  relation/class/duplicate, target, evidens-koder, confidence, status proposed/accepted/rejected/expired, decided_by/at)
  så C3–C6 deler én forslagsmodel i stedet for en tabel pr. funktion. RLS: læsning = mailens/henvendelsens scope; skrivning
  kun via RPC'er (accept/reject), service_role kun til at oprette forslag.
- **Rettigheder:** kundekobling `customers.emails.view` + `customers.edit`; sagskobling `cases.edit` + sagen i scope
  (samme som i dag — forslaget giver ingen ny adgang; skjulte sager foreslås aldrig).
- **Sikkerhed:** forslag må aldrig afsløre en kunde/sag uden for brugerens scope (forslag filtreres med brugerens egen
  klient); forkert kobling = intern fejl, ikke ekstern eksponering (mail-vedhæftninger er altid interne).
- **Afhængigheder:** K5 (klar), 00246 (mail-scope), Stage A.
- **Test:** K5-scenarier (findes), ny probe for forslagstabellens RLS/RPC, U-test godkend/afvis, prod read-only præcision
  efter trin a (mål: ≥ 90 % korrekte, før trin b).
- **Rollback:** `MAIL_AUTOLINK_MODE=off`; forslagskort bag flag; tabellen kan stå tom/inert.

### C4 — Forebyggelse af dubletkunder
- **Værdi:** stopper forureningen ved kilden (111/126 auto-kunder) og gør kunderegistret pålideligt for koblinger.
- **Funktionalitet:**
  - **C4a (ingen migration):** mail-automatikken opretter ikke længere kunder selv, men laver et `create_customer_proposal`
    (Stage A har handlingen); ved manuel oprettelse vises "Mulige dubletter" (normaliseret mail, telefon, CVR, navn+postnr.)
    før gem — et sted, server-side (ikke kun klient).
  - **C4b (read-only):** dubletrapport over eksisterende kunder (grupper + evidens) til gennemgang; ingen automatisk ændring.
  - **C4c (senere, migration):** kontrolleret sammenlægning via RPC (flyt sager/tilbud/mails/dokumenter, behold audit,
    marker den ene inaktiv) — egen præflight, høj risiko.
- **DB/UI:** C4a/b ingen migration; C4c migration + RPC. UI: dublet-panel i opret-kunde og i kundekortet.
- **Rettigheder:** opret `customers.create`; sammenlægning ny nøgle `customers.merge` (admin/serviceleder).
- **Sikkerhed:** C4a ændrer en eksisterende automatik (mail-flow) → kræver regressionsdækning af email-intelligence og
  webformularer; sammenlægning (C4c) er irreversibel i praksis → kun med fuld revisionsspor og dry-run.
- **Afhængigheder:** Stage A forslagshandlinger; `party-dedupe.ts`/`customer-email.ts`; beslutning fra Henrik om at
  stoppe auto-oprettelse.
- **Test:** fixture-test af dubletnøgler; staging-test af mail-flowet (ingen ny kunde uden godkendelse); U-test dublet-
  advarsel; prod read-only antal auto-kunder/uge før og efter (mål: 0 nye uden godkendelse).
- **Rollback:** flag tilbage til nuværende auto-oprettelse; rapporten er read-only; C4c har egen rollback.

### C5 — Samlet kommunikationsoverblik på sagen
- **Værdi:** én tidslinje pr. sag — ingen jagt på tværs af mail, henvendelser, noter og deltagere før et opkald/besøg.
- **Funktionalitet:** fanen "Kommunikation" på sagen: koblede mails, henvendelses-elementer, interne noter, (senere)
  opkald (00247, flag FRA i dag), deltagerændringer; filter pr. deltager/klasse; tydelig "kun internt"-markering. Kun
  læsning — samme handlinger som i dag via eksisterende knapper.
- **DB/UI:** ingen migration; server-aggregering der læser hver kilde med brugerens egen klient (RLS gælder pr. kilde).
  Evt. senere en view/indeks hvis ydeevnen kræver det (egen godkendelse).
- **Rettigheder:** ingen ny nøgle; hver kilde følger sin eksisterende scope (00240–00247).
- **Sikkerhed:** aggregering må aldrig læse med service_role og vise mere end brugeren ellers ser; portalchat er pr. kunde
  (ikke pr. sag) → vises kun som henvisning; intet af tidslinjen må nå portalen (F-1).
- **Afhængigheder:** 00246/00247/00255; C1/C2 forbedrer filtrene, men er ikke krav.
- **Test:** scope-probe pr. rolle (montør/salg/admin ser præcis det de må), U-test af tidslinjen, ydeevne på største sag.
- **Rollback:** flag FRA → fanen skjules; ingen data ændret.

### C6 — AI-baserede forslag med godkendelse
- **Værdi:** dækker det deterministiske regler ikke kan: resumé af lange tråde, forslag til næste skridt (opgave/
  tilbagekald/planlægning), forfinet klasse inden for familien, foreslået relation til ny partner.
- **Funktionalitet:** AI-output bliver kun rækker i `communication_suggestions` (C3) med begrundelse og confidence;
  "Forslag"-kø med godkend/afvis/ret (tastatur, batch). Relationer kun `ai_suggestion` → `proposed` (00254-værn). AI må
  aldrig påstå `internal`, oprette parter/kunder, koble, sende eller ændre synlighed. Accept-rate pr. forslagstype måles;
  typer under fx 60 % slås automatisk fra.
- **DB/UI:** genbruger C3-tabellen; ingen ny migration hvis C3 er lagt.
- **Rettigheder:** som målhandlingen (godkend en opgave kræver opgaverettighed osv.).
- **Sikkerhed:** **persondata til AI-udbyder** (mailindhold) → kræver Henriks beslutning om udbyder/databehandleraftale og
  dataminimering (kun nødvendig tekst, ingen vedhæftninger, ingen kost/avance); prompt-injektion i mails → AI-output
  behandles som data, valideres mod skema, kan aldrig udløse handlinger; `RECEPTION_LLM_ENABLED`-mønsteret (flag FRA).
- **Afhængigheder:** C3 (forslagsmodel), C1 (familie), beslutning om AI-udbyder.
- **Test:** skema-validering, injektions-fixtures ("ignorer instruktioner…" → intet ud over forslag), staging-eval på
  anonymiserede harness-mails, accept-rate-måling i prod med flag kun for admin først.
- **Rollback:** flag FRA → ingen nye AI-forslag; eksisterende forslag udløber; intet er udført uden menneske.

### C7 — Mindre manuelt administrativt arbejde (arbejdskø + batch)
- **Værdi:** samler alle forslag og opfølgninger ét sted og gør gentagne beslutninger til ét klik/én tast.
- **Funktionalitet:** "Min kø": forslag (C3/C4/C6), henvendelser der venter på ELTA, ukoblede mails; batch-godkend for
  ens forslag ("alle 6 nyhedsbreve → Automatisk"); intern auto-markering "håndteret" for klassen automatisk/nyhedsbrev KUN
  som forslag (aldrig sletning/arkivering uden menneske); effekt-tal fra C0 vises.
- **DB/UI:** ingen migration ud over C3; UI-side + batch-RPC'er (genbruger accept/reject).
- **Rettigheder:** hver batch-handling tjekker rettighed pr. element (ingen batch-genvej forbi RLS).
- **Sikkerhed:** batch forstærker fejl → max-antal pr. batch, forhåndsvisning, fortryd inden for kort vindue, audit pr.
  element.
- **Afhængigheder:** C1, C3, (C6).
- **Test:** U-test batch med blandede rettigheder; probe at et element uden for scope afvises.
- **Rollback:** flag FRA → køen skjules; ingen data ændret.

## 3. Beslutninger Henrik skal træffe før start
1. Rækkefølge og første leverance (anbefaling: C0 + C1 samtidig — begge uden migration).
2. C4a: må mail-automatikken stoppe med selv at oprette kunder (blive til forslag)? (største enkeltgevinst, ændrer flow).
3. C3a: aktivering af `MAIL_AUTOLINK_MODE=suggest` i prod (egen godkendelse, se `mail-autolink-suggest-activation-proposal.md`).
4. C6: AI-udbyder, databehandleraftale og hvilke data der må sendes.
5. KPI-mål pr. leverance (forslag: kobling ≤ 1 klik for ≥ 80 % af mails; 0 nye auto-kunder uden godkendelse).

## 4. Hvad Phase C IKKE indeholder
Portaludvidelser og offentliggørelser (F-1), ekstern kommunikation/auto-svar, personlige postkasser i Hub'en, automatisk
sammenlægning/sletning af kunder, AI-oprettede parter/kunder, ændring af Nila/Relatel.
