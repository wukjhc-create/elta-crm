# Phase C — intelligent servicekoordinator (C1a · C2 · C3 · C4 · C5 · C6 · C7 · Stage A)

Status 2026-11-27: **implementeret og testet på branch `claude-phase-c-intelligent`. IKKE i prod.** Alle nye funktioner er
bag flag, som er FRA som standard. Ingen migration. Udviklingslog: `PHASE_C_DEVLOG.md`.

## 1. Brugerrejse (målbillede, implementeret)
```
Mail ind (5-min sync, uændret) → C1 klassifikation → C2 afsender (verificeret/sandsynlig/usikker/ukendt + begrundelse)
 → C3 forslag: kunde (+ sag) · vælg mellem · opret servicesag · opret lead · opret kunde (C4 dubletkontrol) · manuel
 → ARBEJDSKØEN (/dashboard/arbejdsko) eller mailvisningen: Godkend · Vælg andet · Afvis  (1 klik)
 → server udfører via EKSISTERENDE koblingsstier (idempotent, audit) → vises på kunde og sag (C5)
 → Afslut ét sted: henvendelsen lukkes OG mailen arkiveres (samme status i Mail og Henvendelser) → C0 tæller
```

## 2. Moduler
| Del | Kode | Hvad |
|---|---|---|
| C2 afsender | `lib/coordinator/identity.ts`, `identity-signals.ts` | Kunde, kontakt, potentiel kunde, leverandør, partner, medarbejder, automatisk, ukendt. Signaler: e-mail, verificeret part-e-mail/-domæne, CVR, telefon, navn, kontaktperson, adresse, tråd koblet af menneske, tidligere manuelle koblinger, partsrelationer, sagsnummer (verificerer aldrig), tilbudsnummer |
| C3 forslag | `lib/coordinator/suggestions.ts`, `view.ts` | Primært forslag + alternativer, sagsmuligheder, kategori og prioritet |
| C4 dubletter | `lib/coordinator/duplicates.ts`, `lib/actions/customer-dedupe.ts`, `components/coordinator/customer-create-dedupe.tsx` | Opret kunde fra mail med dubletkontrol; "Brug denne" = undgået dublet; read-only dubletrapport (`getDuplicateReportAction`) |
| C4 erstatning | `MAIL_CUSTOMER_AUTOCREATE_MODE=suggest` i `email-intelligence.ts findOrCreateCustomer` | Mail-AI'en opretter ingen kunder; mailen forbliver ukoblet og kommer i køen som "opret kunde" |
| C5 overblik | `lib/actions/communication-timeline.ts` (kunde), `case-communication-timeline.ts` (sag), `lib/timeline/enhanced.ts` | + udgående mails, tilbud, sager, sagsdeltagere, filtre; mail+henvendelse vises ikke dobbelt; ny sagsfane "Kommunikation" |
| C6 AI | `lib/coordinator/ai-assist.ts`, `getAiAssistAction` | Resumé, problem, manglende oplysninger, prioritet, handlinger, opgavetekst, sagsresumé, svarudkast (kun kopiér) |
| C7 kø | `lib/coordinator/queue.ts`, `app/dashboard/arbejdsko/*`, menupunkt med tæller | Tællere pr. kategori, filtre (kræver godkendelse, mine, ikke tildelt, besvaret), søgning, prioritet, ansvarlig ("Tag den"), status, batch for lavrisiko |
| Stage A | `lib/coordinator/handled-sync.ts`, henvendelser-UI | Ét behandlingssted; tilbagekald med ét klik; logstøj skjult (revisionsspor bevaret); kunde-/sagsforslag afsluttes når køen udfører dem |
| C0 | `scripts/test-harness/phase-c-baseline-core.ts` | Nye målepunkter fra audit (accepteret/ændret/afvist, sagskoblinger, undgåede dubletter, handlinger pr. post, tid til afslutning, AI) |

## 3. Sikkerhedsregler (håndhævet i kode og test)
- Et svagt signal (domæne, telefon, CVR, auto-kunde-e-mail, formular-e-mail) giver aldrig "verificeret"; to svage = sandsynlig.
- Delt e-mailadresse (flere kunder) → ingen primær, alternativer, højst sandsynlig med ekstra uafhængigt signal.
- Domæne alene → `domainOnly`: ingen kundekobling og ingen sagsforslag.
- Sagsreference verificerer aldrig afsenderen; sag hos anden kunde end afsenderen vises med advarsel.
- Videresendt: den oprindelige afsender identificeres, videresenderen noteres; uden genkendelig oprindelig → ukendt.
- Signatur-signaler kun fra mailens egen tekst (citeret historik og ELTA's egne numre fjernes).
- Ukendt afsender er aldrig kunde; oprettelse kun på klik efter dubletkontrol; stærke match kræver begrundelse.
- Identitet beregnes med service-role, men ALT vist (kandidater, sager, kunder) filtreres med brugerens egen klient (RLS).
- Udførelse kun via eksisterende gatede stier: `linkEmailToCustomer`, `linkEmailToCase`, `createServiceCaseFromEmail`,
  `createLeadFromEmailAction`, `quickCreateCustomer`, `createCallbackFromHenvendelse`, `markHenvendelseHandled`,
  fase B `ensure_register_party`/`update_party` ("Husk afsender", kun `parties.manage`).
- Idempotens: allerede udført → "uændret"; servicesag fra samme mail genbruges; tilbagekald højst ét åbent pr. kunde.
- Audit: `coordinator_decision` (accept/change/reject + foreslået/valgt), `coordinator_completed/_reopened`,
  `coordinator_sender_remembered`, `coordinator_callback_created`, `customer_duplicate_avoided`,
  `customer_created_with_check`, `coordinator_ai_assist`, `coordinator_mails_archived` — kun id'er/koder, aldrig mailindhold.
- C6: mailindhold er ikke-betroet (afgrænset, instruktioner ignoreres), CPR maskeres, output afvises ved ukendte
  sags-/tilbudsnumre eller opfundne e-mails/telefonnumre; ukendte handlinger droppes; intet sendes automatisk.
- Batch kun for automatiske/interne mails uden handling og uden henvendelse (serveren genberegner hver post).
- F-1 urørt: intet nyt bliver eksternt synligt; C5 er kun internt.

## 4. Rettigheder (eksisterende nøgler — ingen nye)
| Handling | Krav |
|---|---|
| Se arbejdskø / forslag i mail | `inbox.view` (+ RLS-scope på mails, kunder, sager) |
| Godkend kunde-/sagskobling | `inbox.view` (som eksisterende manuel kobling) + mål synligt for brugeren |
| Opret servicesag / lead / kunde | `cases.create` / `leads.create` / `customers.create` (eksisterende stier) |
| Afslut post med henvendelse, tildel | `conversations.manage` |
| Husk afsender | `parties.manage` + `PARTIES_UI_ENABLED` |
| Dubletrapport | `customers.view.all` |
| Sagens kommunikation | `cases.view.all` eller `cases.view.assigned` + sagen i scope |
| Tekniske detaljer (regler/koder) | `settings.manage` |

## 5. Feature-flag (alle standard FRA/uændret)
| Flag | Virkning |
|---|---|
| `COORDINATOR_ENABLED` | Arbejdskø, menupunkt+tæller, forslagsboks i mail, C5-udvidelser, sagsfane, Stage A-sammenhæng |
| `COORDINATOR_AI_ENABLED` | C6 (kræver også COORDINATOR_ENABLED) |
| `MAIL_CUSTOMER_AUTOCREATE_MODE` | `auto` (standard = som i dag) · `suggest` (ingen auto-oprettelse) |
| `COORDINATOR_QUEUE_DAYS` | Køens tidsvindue (standard 30 dage; prod har 689 gamle åbne mails → vises som efterslæb) |
| `CLASSIFICATION_FEEDBACK_ENABLED` | C1a (i prod inert, FRA) |

## 6. Database
Ingen migration. Alle statusser bruger eksisterende felter (`incoming_emails.is_archived/link_status/customer_id/
service_case_id`, `conversations.status/handled_at/assigned_profile_id`, `conversation_actions.state`); forslag beregnes
ved visning; afgørelser i `audit_logs`. Mulig senere migration (egen præflight): tildeling af mails uden henvendelse,
`communication_suggestions`-tabel hvis forslag skal gemmes, additiv "husk afsender"-RPC (undgår samtidigheds-tab).

## 7. Arbejdsgang og UX (samlet arbejdsgang, Henrik 2026-11-27)
- **Én indgang:** Arbejdskøen er medarbejderens startside for indgående kommunikation. Mail-modulet og Henvendelser
  findes stadig (søgning, historik, admin), men en post afsluttet ét sted er afsluttet alle steder (D2).
- **Liste:** prioritet (farvekant + mærke), kategori, emne, afsender, genkendt kunde (✓), forslag i ét ord, "Besvaret …",
  ansvarlig/"Tag den". Tællere pr. kategori øverst er også filtre. Ulæste står med fed.
- **Detalje:** afsender med niveau og 2–4 begrundelser i klart sprog → ét forslag med Godkend / Afvis / Andre muligheder
  → kundekort (kontakt, adresse) og åbne sager → AI-resumé (hvis slået til) → status med Afslut / Ikke relevant / Genåbn.
  Ingen regel-id'er; tekniske detaljer kun for admin under en lukket fold.
- **Færrest klik:** kendt kunde + sagsnummer = 1 klik (Godkend kobler både kunde og sag) + 1 klik (Afslut).
  Delt e-mail = 1 klik på det rigtige alternativ. Ukendt = "Opret ny kunde" (forudfyldt, dubletter vist) → "Brug denne".
- **Logstøj:** append_communication vises ikke som forslag (kun som tæller "N logposter skjult"); revisionssporet er urørt.
- **Tilbagekald:** blokerede tilbagekald er nu en gul linje "Kunden ønsker at blive ringet op" med "Opret tilbagekald".

### Outlook og dobbeltbehandling
- Mail-sync henter også ELTA's **sendte** mails. Et svar fra ELTA i samme Graph-tråd efter kundens mail er et pålideligt
  signal: posten viser "Besvaret fra ELTA kl. … (Outlook eller CRM) — afslut hvis sagen er klaret" og filtret
  "Besvaret — mangler afslutning" samler dem. Medarbejderen kan altså svare i Outlook og afslutte med ét klik i CRM.
- Et læst-flag (Outlook eller CRM) tolkes **aldrig** som behandlet. Uden signal står der "Ingen registreret behandling endnu".
- Kendt begrænsning: kun kontakt@ og ordre@ synkes. Svar fra personlige postkasser ses ikke → ingen "besvaret"-signal.
  Anbefaling: svar fra fælles postkassen (eller cc), eller udvid sync til personlige postkasser (kræver godkendelse —
  Graph-rettigheder og persondata).
- Automatisk afslutning ved svar er bevidst IKKE slået til (et svar betyder ikke at sagen er løst).

## 8. Roadmap — anbefalet rækkefølge
1. **Prod: C1a aktivering** (flag) — korrekthed måles på rigtige afgørelser (inert kode er i prod).
2. **Prod: C7+C2+C3+C5 inert deploy** (`COORDINATOR_ENABLED` FRA) → verifikation → **aktivering for admin/serviceleder**
   (flaget er globalt; rettigheden `inbox.view` begrænser i forvejen til admin/serviceleder).
3. Brug i 2–4 uger; mål med C0 (accepteret/ændret/afvist, tid til afslutning, besvaret i Outlook).
4. **C4 suggest-tilstand i prod** (`MAIL_CUSTOMER_AUTOCREATE_MODE=suggest`) først når køen bruges dagligt — ellers bliver
   ukendte afsendere liggende ukoblede. Dubletrapporten gennemgås manuelt før/efter.
5. **C6 AI** i prod efter særskilt godkendelse (dataflow til OpenAI er det eksisterende godkendte; nyt formål).
6. Senere (egne præflights): tildeling af mails uden henvendelse (migration), sagsnummer i udgående emner,
   sync af personlige postkasser, gemte forslag (`communication_suggestions`), aktivt tidsforbrug (anonymiseret).

### Sagsnummer i udgående mails (undersøgt, ikke ændret)
Udgående sagsmails har allerede nummeret i nogle emner (`Serviceopgave ${case_number} oprettet`). Forslag: et fælles
emnehjælpeværktøj `withCaseRef(subject, caseNumber)` → `"… [SVC-01006]"` brugt i `sendQuickReply`/`replyToCustomerEmail`
når mailen er koblet til en sag, bag eget flag. C2/C3 genkender allerede `SVC-\d{5}` i emne og citeret historik, så svar
bærer referencen automatisk. Ikke implementeret (ændrer eksisterende kommunikationsflow → kræver godkendelse).

## 9. Production-udrulning (forslag — kræver Henriks godkendelse pr. trin)
1. Merge `claude-phase-c-intelligent` → main (fast-forward) = prod-deploy med ALLE flag FRA (kode inert).
2. Verifikation: Vercel Ready · `/api/public/version` · prod-verify-00255 `--expect active` · aktiverings-smoke ·
   db-audit · Stage A-ops · portal-eksponering · 0 offentliggørelser · `prod-phase-c-shadow.ts metrics` (uændret) ·
   arbejdskø-URL giver "ikke slået til" · ingen menupunkt.
3. Aktivering (særskilt): `COORDINATOR_ENABLED=true` (Production, gem + redeploy) → smoke: kø indlæses, én reel post
   gennemgås af Henrik, audit-rækker kontrolleres (`coordinator_*`), C0 viser tallene.
4. Senere trin jf. roadmap (C4 suggest, C6, C1a).

## 10. Rollback
- Alt er flag: `COORDINATOR_ENABLED=false` → kø, forslag, C5-udvidelser, Stage A-sammenhæng forsvinder; adfærd = i dag.
- `MAIL_CUSTOMER_AUTOCREATE_MODE` tom/`auto` → automatisk kundeoprettelse som i dag.
- Data: koblinger/arkiveringer medarbejderne har lavet er almindelige manuelle handlinger (kan fjernes/genåbnes i UI).
  Ingen migration at rulle tilbage. Kode-rollback = revert af merge-commit.
