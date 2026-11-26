# Phase C0 + C1 — baseline og deterministisk shadow-klassifikation

Status 2026-11-26: **implementeret og testet; shadow-mode kører kun som read-only måling**. Branch `claude-phase-c-c0-c1`,
ikke i prod. Ingen app-adfærd ændret: klassifikatoren bruges ikke af appen, intet skrives, ingen migration, intet flag,
ingen ekstern handling. Prod-deploy kræver Henriks særskilte godkendelse. Grundlag: `PHASE_C_PREFLIGHT.md`.

## C0 — baseline (holdt enkel)
`npx tsx scripts/prod-phase-c-shadow.ts baseline [--since YYYY-MM-DD]` (prod, kun SELECT; standard 30 dage) ·
staging: `npx tsx scripts/test-harness/cli.ts phase-c-shadow baseline`. Én SELECT (`phase-c-baseline-core.ts`), kun antal
og medianer. Effekten måles ved at køre den igen bagefter for en lige så lang periode.

Prod, read-only 2026-11-26:

| Målepunkt | Seneste 30 dage | Siden 2026-02-28 (271 d) |
|---|---|---|
| Mails (kontakt@ / ordre@) | 117 (113 / 4) ≈ 27/uge | 1.001 (741 / 217) |
| Koblet til kunde | 30 (25,6 %) — alle automatisk | 272 (27,2 %) — 267 automatisk, 4 manuelt |
| Koblet til sag | **0** | **0** |
| Uidentificeret / ignoreret | 58 (49,6 %) / 29 | 398 (39,8 %) / 272 |
| Median tid til kobling | 15,6 t | 17,1 t — **forkert tolket første gang:** mail-sync kører hvert 5. min siden 2026-11-22 (Vercel Pro); siden da er medianen 2,2 min til mailen er i CRM og 2,4 min til kobling. De høje tal stammer fra før omlægningen (se MAIL_SYNC_FREQUENCY_REVIEW.md) |
| Kunder oprettet | 11 — **alle** auto-oprettet fra mail | 126 — 113 auto (89,7 %), 15 uden rigtig e-mail |
| Henvendelser (Stage A) | 49 — **0 behandlet**, 0 tildelt | samme |
| Stage A-forslag | 109 — **0 afgjort** (77 proposed, 32 blocked) | samme |

Læsning: kobling sker næsten kun automatisk og aldrig til en sag; halvdelen af mails står uidentificeret; Stage A's
forslag bliver ikke brugt. Det er det rum C1–C3 skal gøre mindre — og det C0 skal vise faldet i.

## C1 — deterministisk klassifikation (shadow)
Kode (ren logik, ingen DB): `src/lib/classification/inquiry-classifier.ts` + `inquiry-text-signals.ts`, version `c1-v1`.
Tre ADSKILTE dimensioner + forslag:

| Dimension | Værdier |
|---|---|
| Afsendertype | eksisterende kunde · leverandør · samarbejdspartner (partner/underleverandør/producent) · intern · automatisk system · hjemmesideformular · ukendt |
| Henvendelsestype | kundehenvendelse · servicehenvendelse · ny salgsforespørgsel · faktura · ordrebekræftelse · automatisk systemmail · intern · ukendt |
| Sagsreference | eksisterende sag (sagsnummer i teksten / tråd koblet til sag) · mulig sag (kundens eneste åbne) · flertydig · ingen · — |
| Foreslået handling | kobl til sag · servicesag-forslag · lead-forslag (aldrig kundeoprettelse) · til kontoret · til bogholderi · match mod indkøb · gennemse leverandør/partner-mail · identificér afsender · ingen · manuel behandling |

Regler (alle navngivne; hver afgørelse bærer sine regel-id'er, `explainClassification()` giver tekst):
- **Afsender** (rækkefølge): ELTA-domæne → intern · FormSubmit → formular (kendt kundes e-mail i formularen → kunde) /
  systemmail → automatisk · bekræftet partnerrelation → samarbejdspartner · leverandørværnets evidens (samme regler som
  `supplier-senders.ts`) eller leverandørrelation → leverandør · noreply/leveringsfejl → automatisk · ENTYDIGT e-mailmatch
  på kunde/kontakt oprettet FØR mailen → kunde · ellers ukendt.
- **Tvivl → ukendt:** leverandørevidens mod en manuelt oprettet kunde, e-mail der matcher flere kunder, service- og
  salgssignal på samme tid (medmindre formularens type-felt afgør det), leverandør/partner-mail uden specifik type,
  faktura-ord fra ukendt afsender uden et andet uafhængigt bevis.
- **Henvendelse:** registreret leverandørfaktura → faktura · leverandør/partner/automatisk + ordrebekræftelses-emne →
  ordrebekræftelse · faktura kræver bilag + ét bevis fra kendt part / to uafhængige beviser fra ukendt · en kundes
  "faktura" er et spørgsmål (kundehenvendelse) · service-/salgsord kun i mailens EGEN tekst (citeret historik og
  ansvarsfraskrivelser tæller ikke; "SV: Tilbud" er en fortsat dialog, ikke en ny forespørgsel; videresendt tekst tæller).
- **Sag:** kun eksplicit sagsnummer eller tråd — "kundens eneste åbne sag" er kun "mulig", aldrig en kobling.

Shadow-mode = `npx tsx scripts/prod-phase-c-shadow.ts shadow [--since …]` (prod, read-only): klassificerer alle mails i
hukommelsen med kontekst som på modtagelsestidspunktet og sammenligner med det de eksisterende arbejdsgange gjorde.
Output: kun antal, andele og regel-id'er (diagnose: kun nøgleord og flag). Staging: `cli.ts phase-c-shadow shadow`.

### Resultat (prod, read-only 2026-11-26, c1-v1)

| | Siden 2026-02-28 (1.001) | Seneste 30 dage (117) |
|---|---|---|
| Afsender ukendt | 66 % | 51 % |
| Henvendelse ukendt | 56 % | 51 % |
| Enighed med mail-AI hvor begge afgør (kunde/leverandør/nyhedsbrev) | 139/170 = 81,8 % | 37/45 = 82,2 % |
| Ny salgsforespørgsel / kundehenvendelse / service | 156 / 50 / 48 | 24 / 12 / 2 |
| Faktura / ordrebekræftelse / automatisk | 62 / 1 / 33 | 4 / 0 / 9 |
| Eksisterende sag | 1 | 0 |

- Ukendt-andelen er høj, fordi de fleste afsendere er nye personer uden deterministisk evidens. Mail-AI'en kalder 359 af
  dem "customer"; klassifikatoren gætter bevidst ikke (Henrik: en ukendt afsender er ikke automatisk kunde). Det er netop
  det, C2 (afsender → part) og C3 (kobling-forslag) skal reducere.
- 37 mails matcher flere kunder på samme e-mail → dubletkunder (input til C4).
- Rettet under shadow-kørslen (v1 → c1-v1 endelig): disclaimers ("modtaget ved en fejl") gav 66 falske servicesager på
  ordre@ (nu 4); citeret historik og svar-emner gav falske salgsforespørgsler; faktura kræver nu navngivne beviser.
- Fakturaer genkendes pålideligt via registreringen (`incoming_invoices`); tekst alene finder kun ~1/3 (20/62 har
  "faktura" i emnet; bilagsnavne findes ikke i databasen) — derfor ingen bredere faktura-regel.
- Sagsreference er næsten altid "ingen": prod har 8 sager, og 0 mails er koblet til en sag.

"Andel korrekt klassificerede" kræver et menneskeligt facit. Shadow giver i dag enighed med eksisterende automatik. Næste
skridt (kræver godkendelse): vis klassifikationen som skjult chip for admin i Henvendelser/mail med "korrekt / forkert"
(gemmes i audit), så korrekthed kan måles på rigtige afgørelser — stadig uden driftskonsekvens.

## C0 — fulde målepunktsliste (Henrik 2026-11-26)
`npx tsx scripts/prod-phase-c-shadow.ts metrics [--since YYYY-MM-DD]` (staging: `cli.ts phase-c-shadow metrics`) viser alle
19 målepunkter. Hvert punkt er enten MÅLT med kilde eller markeret **IKKE MÅLBAR** med hvad der mangler — der opfindes
aldrig tal, og estimeret tidsbesparelse vises aldrig som målt. Ikke målbare i dag: andel korrekt/forkert (kræver C1a-
feedback), faktisk undgåede dubletoprettelser (kræver C4), manuelle handlinger og aktivt tidsforbrug pr. henvendelse
(ingen måling i UI), faktisk og estimeret tidsbesparelse (kræver før/efter-måling hhv. godkendte antagelser).
Brug `--since 2026-11-22` for tidsmålinger (5-min-sync).

## C1a — klassifikationsfeedback (staging; prod kræver særskilt godkendelse)
- Flag `CLASSIFICATION_FEEDBACK_ENABLED` (standard FRA, kun 'true'). Gate: flag + `settings.manage` (standard kun admin).
- Mailvisningen (`/dashboard/mail`) får en diskret, lukket boks "Klassifikation (test — påvirker intet)". Først ved åbning
  beregnes C1-klassifikationen for mailen (samme kontekst-kerne som shadow — `src/lib/classification/inquiry-context.ts`,
  paritet bevist `cli.ts c1a-parity`): de fire dimensioner, begrundelse, regler, version og tidligere vurderinger.
- Vurdering: Korrekt · Delvist korrekt · Forkert · Kan ikke vurderes; ved delvist/forkert angives den korrekte værdi pr.
  dimension (+ valgfri kort note). Serveren klassificerer selv mailen igen ved indsendelse; klientens værdier bruges ikke.
- **Lagring uden migration:** én række i `audit_logs` (action `classification_feedback`, entity `incoming_email`,
  metadata: version, forudsagt, regler, tvivl, vurdering, rettelse, note) via `insertAuditRow` — samme mønster som K5-
  forslag og Henvendelser. Adskilt fra driften: intet skrives i incoming_emails, conversations, kunder eller sager
  (statisk test + UI-test U271 sammenligner mailens og henvendelsens tilstand før/efter). Læsning af audit_logs: kun admin
  (RLS 00019) + egne rækker. En dedikeret tabel kan komme senere (egen migrations-præflight), hvis audit-sporet ikke rækker.
- Tests: `scripts/classification-feedback-test.ts` (32: validering, flag, gate, kun-læsning, kun-audit, mailflowet
  importerer ikke klassifikatoren), `cli.ts c1a-parity` (63/63 enkelt-mail = bulk), UI U271 (gruppe `classification`).

## Tests
- `npx tsx scripts/inquiry-classifier-test.ts` — 108 fixtures (alle dimensioner, tvivl → ukendt, forklaring, determinisme,
  prod-fundene som regressionstest)
- Staging: `cli.ts phase-c-shadow baseline|shadow` (kører hele kæden; staging har kun syntetiske harness-mails, så tallene
  er ikke repræsentative)

## C4a-beslutning (Henrik 2026-11-26)
Automatisk kundeoprettelse fra mail skal på sigt stoppes, men slås **ikke** fra før C2, C3 og erstatningsflowet fra C4 er
klar. En ukendt afsender er ikke automatisk en kunde; systemet skal genkende kunder/leverandører/partnere, foreslå
eksisterende kunde ved mulig dublet, foreslå ny kunde, foreslå sagskobling og sende usikre henvendelser til manuel
behandling — godkendt med få klik. Ingen eksisterende kunder slettes, sammenlægges eller ændres automatisk.
C1's forslagsdimension er bygget efter dette (lead-forslag/identificér afsender i stedet for kundeoprettelse).
