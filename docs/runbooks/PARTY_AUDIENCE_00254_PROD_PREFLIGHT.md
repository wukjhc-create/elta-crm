# 00254 parts-/publikumsfundament — PRODUCTION-PRÆFLIGHT (2026-11-25)

Status: **rollback-only præflight gennemført. 00254 er IKKE anvendt i prod. Intet er deployet.** Stage A, leverandørværnet og
00253-lease kører uændret; Stage B er FRA; ingen portalflag er ændret; ingen offentliggørelser findes.

Model og design: `COMMUNICATION_PARTY_AUDIENCE_MODEL.md`. Denne fil er beviset for prod-sikkerheden og den præcise
deploy-/rollback-rækkefølge.

## 1. Kilde

| | |
|---|---|
| origin/main (prod) | `380adb712d3af6c36cce705ebdc474dd4ebd8bcb` (uændret før og efter) |
| Godkendt HEAD | `ef96c3ed483174848f9104c8dddb1176ced2221c` — 0 bag main, 1 foran |
| **Ny HEAD efter præflight** | commit "fix(00254): luk service_role-EXECUTE …" oven på `ef96c3ed` (se afsnit 4) — **Henriks godkendelse skal henvise til den nye HEAD** |
| Migrationer i branchen | kun `00254_party_audience_foundation.sql` |
| package.json / package-lock.json | ikke i branchens commits (de lokale ændringer i arbejdstræet committes aldrig) |
| Prod-værktøj i branchen | kun 00254-relateret: `prod-verify-00254.ts`, `prod-party-audience-map.ts`, `prod-party-00254-baseline.ts`, `prod-00254-dryrun.ts` (alle read-only/rollback-only) |

Migrationsfil efter rettelsen: md5 `4e1a015380fbd6187cedfb8f47c40072`; kroppen mellem `BEGIN;` og `COMMIT;` (399 linjer)
md5 `a7c4b3d7716acea99864d0ed7e04b2ae`. Det er præcis denne tekst der er kørt i prod-præflighten.

## 2. Production-baseline (read-only, før og efter præflighten — identisk)
`npx tsx scripts/prod-party-00254-baseline.ts`, `scripts/prod-db-fingerprint.ts`, `scripts/prod-verify-00254.ts pre`.

- Skemafingeraftryk (hele public: kolonner, constraints, indeks, triggere, funktioner+ACL, politikker, grants): `ea30dc7f911e830246b07e565c763338`
- Rettighedskatalog 120 nøgler · standarder 291 (admin 120, serviceleder 89, bogholderi 36, salg 24, montør 22) · overrides 0
- Profiler: admin 3 (aktive 3), montør 2 (aktiv 1) — **ingen serviceleder/salg/bogholderi-profiler i prod**
- conversations 46 · customers 127 · suppliers 2 · service_cases 8 · customer_documents 18
- Portal-tokens 39 (39 aktive) · partner-tokens 1 (1 aktiv)
- Stage A: status handoff 30 / new 16; kunde unique_match 22 / no_match 24; sag no_open_case 21 / not_applicable 24 / exact 1;
  46 items; handlinger proposed 68 / blocked 31 / **udført 0**; ops-monitor 0 kritiske, 0 advarsler (før og efter)
- Portaleksponering i dag: kundeportal-dokumenter 15; synlige mail-vedhæftninger 0; partnerportal-dokumenter 3;
  **F-1-krydseksponering 0**; sager med betaler ≠ kunde 0; kundesynlige opgaver 0
- 00254-objekter eksplicit fraværende (11/11): parties, party_relationships, case_participants, external_publications,
  conversations.source_party_id / communication_class / communication_class_source, parties.manage, portal.publish,
  de 9 funktioner, de 3 triggere
- prod-db-audit: HØJ 0 · MIDDEL 0 · LAV 0

Før/efter præflighten: alle sektioner af `prod-db-fingerprint` (politikker, funktioner, grants, tabeller, indeks, katalog,
standarder, profilroller) og alle forretningstabellers række-checksummer (inkl. audit_logs, profiles, customers, …) er
**identiske**.

## 3. Migrations-dry-run (prod, ROLLBACK-ONLY)
`npx tsx scripts/prod-00254-dryrun.ts` — ÉN transaktion (REPEATABLE READ, `lock_timeout` 3 s), præcis migrationskrop,
alle prøver i savepoints, godkendt rollback-SQL til sidst og **ROLLBACK af det hele** (scriptet kan ikke udstede COMMIT).
Resultat sidste kørsel: **61/61 PASS** (NY 55/55, UÆNDRET 6/6).

Objekter efter kroppen: 4 tabeller (RLS slået til), 3 conversations-kolonner, 9 funktioner, 3 triggere, 10 politikker,
2 nøgler; katalog 120→122, standarder 291→296. Alle 46 eksisterende henvendelser = `NULL / unknown / none` (ingen
backfill); 0 rækker i de nye tabeller; alle 20 øvrige data-fingeraftryk uændrede.

Låse: kroppen tager ACCESS EXCLUSIVE på `conversations` og SHARE ROW EXCLUSIVE på de refererede tabeller (customers,
customer_contacts, suppliers, leads, profiles, service_cases, customer_documents). Den rigtige anvendelse varer sekunder;
præflighten holdt låsene ~93 s pr. kørsel (prøverne kører i samme transaktion). Mail-sync ventede i stedet for at fejle:
ops-monitor efter alle kørsler = 0 fejl, 0 lease_error, 0 already_running, største pause 6,0 min, p50/max uændret.

## 4. Fund under præflighten

- **P-1 (rettet i migrationen): service_role havde EXECUTE på `publish_external` og `revoke_external_publication` i prod.**
  Prods default privileges giver nye funktioner EXECUTE til anon, authenticated OG service_role; migrationen lukkede kun
  `PUBLIC, anon, authenticated`. Funktionerne afviste alligevel service_role (tjek `auth.role() = 'authenticated'` +
  `auth.uid()`), så der var ingen udnyttelig vej — men kontrakten "ingen service_role-grant" og `prod-verify-00254 post`
  ville have fejlet. Rettelse: én linje — REVOKE-listen er nu `FROM PUBLIC, anon, authenticated, service_role`; derefter
  gives kun `external_feed` til service_role og publish/revoke + de to synligheds-hjælpere til authenticated.
  **Staging har andre default privileges** (service_role fik aldrig EXECUTE dér), derfor fangede staging det ikke; staging
  er verificeret i samme tilstand (`cli.ts party-00254-acl`). `prod-verify-00254 post` tjekker nu hele funktions-ACL'en.
- **F-6 (måling, ingen sikkerhedsbetydning):** `INSERT … RETURNING` på `parties` afvises for brugere (42501), fordi
  SELECT-politikken `party_visible_to_me(id)` slår rækken op igen og ikke ser den nye række i samme udsagn. Plain INSERT
  virker. Ingen kode kalder det i dag. **Fase B** skal bruge `return=minimal` (klient-genereret id) eller få en inline
  SELECT-politik i en senere migration.
- **D-1 (beslutning til Henrik):** `customers.view.all` (standard: admin, serviceleder, salg, bogholderi) giver læsning af
  hele den interne partsliste (også leverandør/partner/producent-parter). Kun læsning — oprettelse/ændring kræver
  `parties.manage`, offentliggørelse `portal.publish`. Montør ser 0 parter. Kan indsnævres i fase B hvis ønsket.

## 5. Sikkerhedsangreb (prod, rollback-only, rigtige profiler)
Personaer: rigtige prod-profiler. Da prod kun har admin- og montørprofiler, får to admin-profiler basisrollen
serviceleder/salg og den inaktive montør rollen bogholderi (aktiv) INDE i transaktionen — rullet tilbage; profiles-
fingeraftrykket er uændret.

Parter
- anon: læs og skriv afvist (42501)
- salg/montør uden `parties.manage` kan ikke oprette; serviceleder kan ikke oprette i en andens navn
- montør ser 0 af 7 parter, før og efter at alle er koblet til Sag 1; admin/serviceleder 7; salg/bogholderi 7 (D-1)
- kundescope giver ingen portaladgang (feeds tomme uden offentliggørelse)

Relationer
- AI/service_role: `ai_suggestion` kun som `proposed`; aktivering afvist (også med bekræfter-felt og påklistret sub)
- service_role kan ikke fabrikere en aktiv manuel relation eller en register-relation uden kobling
- register-relation kræver ægte kanonisk kobling (M som leverandør / X som kunde afvist)
- aktiv manuel relation kræver den indloggede som bekræfter (anden/ingen bekræfter afvist); bekræfteren registreres
- bruger kræver `parties.manage`; bruger kan ikke oprette `ai_suggestion`; kilde/part/type kan ikke ændres bagefter

Sagsdeltagere
- 5 deltagere på Sag 1 → **alle feeds tomme** (deltagelse = nul ekstern læsning)
- læsning følger kun medarbejderrettigheder: admin/serviceleder/bogholderi (cases.view.all) 5; salg (sag uden for scope) og
  montør 0; anon afvist; montør/salg kan ikke tilføje

`external_publications` direkte (14 angreb + forsvar i dybden — alle afvist)
- INSERT som anon / authenticated / authenticated med `elta.publish=on` / service_role / service_role med `elta.publish=on`
  + påklistret sub og authenticated-claims
- UPDATE af tekst og publikum (authenticated), UPDATE af tekst og `revoked_at` (service_role)
- DELETE som anon / authenticated / service_role (ingen DELETE-grant til nogen app-rolle)
- revoke-funktionen som service_role og montør
- selv tabelejeren uden `publish_external` afvises af værnet ved INSERT og indholdsændring
- tilbagetrækning: én gyldig (gentagelse er no-op, 1 audit-række, tidspunkt uændret); kan ikke fortrydes (heller ikke af ejeren)

`publish_external` (13 ugyldige forsøg afvist): Kunde B på Sag 1, partner-type til leverandør, kunde-type til partner,
leverandør på Sag 2, producent-type til underleverandør, urelateret part, tom tekst, montør, bogholderi, salg uden scope,
anon, service_role, service_role med påklistret sub + authenticated-claim. Gyldige: 7 offentliggørelser (serviceleder 6 på
Sag 1; salg 1 på egen sag = `portal.publish`-standarden virker), hver med audit-række og `published_by` = den indloggede.

## 6. Publikumsisolation (Sag 1: Kunde A, Leverandør X, Partner Y, Producent M, Underleverandør S; desuden Kunde B og urelateret U)
Feed-matrix 40 celler (5 publikumstyper × 7 parter + NULL-part):
- Kunde A ser kun sine 3 (status, dokument, besked fra salg); X kun sin; Y kun sin; M kun sin; S kun sin
- Kunde B, U og alle krydskald (forkert type + rigtig part, rigtig type + forkert part, NULL) → tomme
- Alle parter koblet til Sag 1 (B site_contact, U intern, X betaler, Y slutkunde) → feeds uændrede
- Afsluttet relation (M) → M er ikke længere publikum (tomt feed uden tilbagetrækning)

## 7. `external_feed` (kun service_role)
- authenticated og anon kan ikke kalde den
- forkert type / forkert part / urelateret part / NULL → tomt; tilbagetrukket offentliggørelse forsvinder
- projektion: `id, service_case_id, case_number, content_kind, title, body, document_id, document_title,
  document_file_name, document_mime_type, published_at` — aldrig `derived_from_*`, `published_by`, `revoked_*`, `file_url`,
  `customer_id`, publikum
- feeds indeholder aldrig interne originaler (leverandørpris/restordre/intern note/mail-vedhæftning/internt dokument)

**Krav til portalserveren (fase B):** `external_feed` stoler på den part den får. Portalens serverkode SKAL selv løse det
autentificerede token/login til præcis den part (kundeportal: tokenets `customer_id` → `parties.customer_id`; partner-
/leverandørportal: deres egen tokentype → part) og ALDRIG tage part-id eller publikumstype fra klienten.
`readExternalFeed` i `lib/parties/audience.ts` er eneste kaldsted.

## 8. Dokumentsikkerhed
Afvist: mail-vedhæftning (`source_email_id`), dokument fra Kunde B/Sag 2 på Sag 1, Sag 2-dokument til leverandør på Sag 1,
Kunde B-dokument til Kunde A uden sag, Kunde B-dokument til B på Sag 1 (anden parts sag), ikke-eksisterende dokument.
`document_type='internal'` kan slet ikke eksistere i prod (constraint afviser værdien; F-2) — funktion og feed afviser den
desuden. Tilladt dokument eksponerer kun titel/filnavn/mime (ingen URL). Feedet re-tjekker ved læsning: bliver dokumentet
senere en mail-vedhæftning, forsvinder det.

## 9. F-1 — HÅRD BLOKERING for portaludvidelse
`customer_documents.visible_in_portal` er ét flag som både kundeportalen og partnerportalen respekterer. Nuværende
prod-eksponering: **0 krydseksponerede dokumenter** (0 sager med betaler ≠ kunde; 3 partnerportal-dokumenter på partnerens
egne sager). 00254 ændrer ingen portal-læsevej. **Før fase B eller nogen udvidelse af partner-/leverandørportal skal den
gamle synlighedsvej erstattes af part-scoped offentliggørelser/feed.** Det er en blokering, ikke en valgfri oprydning.

## 10. Klassepræcedens (manual > deterministic > ai > none)
Med rigtig `reception_ingest`-henvendelse: server ai → deterministic ok; ai over deterministic, none over deterministic og
server-sat manual afvist (også med påklistret sub); bruger kan kun sætte manual (deterministic/ai afvist); server kan ikke
overskrive manual (deterministic/ai afvist). Klasse + kilde-part = Kunde B (manuelt) giver 0 offentliggørelser og intet i
B's feed. (En falsk "authenticated"-identitet kræver en signeret bruger-JWT — PostgREST sætter DB-rollen ud fra JWT'ens
rolle; staging `party-00254-app` beviser vejen gennem det rigtige API.)

## 11. Stage A-kompatibilitet (med 00254 midlertidigt anvendt)
Rigtig `reception_ingest` som service_role: ny mail → created (NULL/unknown/none); samme levering → duplicate; svar i
tråd → samme henvendelse (2 items); AI-handling "auto+execute" forbliver `proposed`; auto-koblet mail → kun kandidat.
Henvendelser-handlinger med appens præcise UPDATE-former (bekræft kunde, bekræft sag, tildel, afslut, genåbn) virker.
00253-lease (holder/optaget/frigivelse) uændret. 5-min-sync, leverandørværn (kode), tråde, kandidater og no-send er
uberørt; triggeren returnerer straks når klasse/kilde/part ikke ændres. Staging: `stage-a-staging` 40/40,
`supplier-guard-staging` 14/14.

## 12. Rettigheder
Standarder præcis: `parties.manage` = admin, serviceleder; `portal.publish` = admin, serviceleder, salg; ingen montør/
bogholderi. Effektivt: admin M+P, serviceleder M+P, salg P, montør –, bogholderi –. Ingen rå rolle-tjek (`user_role()`) i
00254-funktioner/-politikker. Overrides virker: montør+parties.manage kan oprette part; salg−portal.publish kan ikke
offentliggøre; serviceleder−parties.manage kan ikke oprette; bogholderi+portal.publish får nøglen.

## 13. Rollback-bevis (prod, i samme transaktion)
`docs/runbooks/sql/00254_rollback.sql` = den kommenterede ROLLBACK-blok i migrationen (linje for linje). Efter kørsel:
4 tabeller, 3 kolonner, 9 funktioner, 3 triggere, politikker og 2 nøgler væk; katalog/standarder 120/291; **struktur-md5
af hele public = før (bit-for-bit)**; alle 22 data-fingeraftryk = før. Staging `party-00254-rollback-proof` 4/4.

## 14. Kompatibilitetsmatrix

| Kode \ Skema | Uden 00254 (prod i dag) | Med 00254 |
|---|---|---|
| **Gammel** (main `380adb71`) | i drift | **Kompatibel** — bevist i prod-dry-run: reception_ingest, tråde, kandidater, henvendelser-UPDATEs og lease virker; DB-nøglerne bruges ikke af gammel kode (effektive rettigheder beregnes fra koden; ukendte override-nøgler ignoreres) |
| **Ny** (branch) | **Kompatibel** — `lib/parties/*` importeres ikke af nogen app-modul (kun scripts) → ingen kald til 00254-objekter; de 2 nye nøgler i koden har intet kaldsted; et admin-forsøg på at sætte en override på dem før migrationen afvises rent af FK'en ("Rettigheden kunne ikke gemmes", intet ændret) | **Kompatibel** — staging (00254 anvendt): 37/37 SQL-prøve, 15/15 via rigtigt API, Stage A 40/40 |

Begge rækkefølger er sikre. Anbefalet (husets regel): **kode → migration**.

## 15. Regression (branch, efter rettelsen)
tsc 0 · check:rbac 0 · check:rls-matrix 0 · party-audience 66 · stage-a-email-ingest · supplier-guard · sync-lease ·
reception-hub 143 · reception 173 · portal-security · effective-permissions · employee-setup-integrity 59 ·
security-static · scope-model · handover-close-guard · offer-case-type · case-revenue · finans (grok-finance-1/-2,
-1-review 185, claude-finance-2-review 56, net-invoiced, invoice-totals, invoice-control) · mail/autolink (autolink-policy,
free-mail-domains, sender-domain, website-inquiry, forwarded-sender/-detect, customer-unlinked-link) · telephony-persist ·
strip-portal-links · portal-response-guard · case-material-unknown-cost 156 · test:time · test:profit — alle grønne.
Kendt fejl: `work-order-employee-check-test` (8 FAIL) — læser kun `src/lib/actions/work-orders.ts`, som er
blob-identisk med main (`050de9e9`) → identisk fejl på main, uafhængig af 00254.
Staging: party-00254-probe 37/37 · party-00254-app 15/15 · party-00254-rollback-proof 4/4 · party-00254-acl PASS ·
stage-a-staging 40/40 · supplier-guard-staging 14/14.

## 16. Anbefalet deploy-rækkefølge (hvert trin kræver Henriks godkendelse af den NYE HEAD)
1. Godkend branch `claude-party-audience` @ ny HEAD (inkl. ACL-rettelsen) og 00254-SQL'en.
2. **Kode:** merge til main (fast-forward) og push → Vercel prod. Verificér GitHub-deployment med environment
   **Production** for SHA'en (ikke Preview). Smoke: `npx tsx scripts/prod-stage-a-ops.ts` (0 kritiske),
   `npx tsx scripts/prod-verify-00254.ts pre` (stadig 2/2 — koden rører intet).
3. **Før migration:** `prod-party-00254-baseline.ts`, `prod-db-fingerprint.ts > før.json`, `prod-verify-00254.ts pre`.
   Start lige efter en mail-sync er færdig (lease frigivet), så låsen ikke rammer en kørsel.
4. **Migration:** tilføj `'00254'` til `APPROVED` i `scripts/prod-apply-migration.ts` (lokal, med godkendelsesdato/citat) og
   kør `npm run prod:apply-migration -- 00254 --approved-by-henrik`.
5. **Efter:** `prod-verify-00254.ts post` (struktur, funktions-ACL, grants, 0 rækker, alle henvendelser unknown/none),
   `prod-db-audit.ts` (HØJ 0), `prod-db-fingerprint.ts > efter.json` (kun 00254-objekter + katalog/standarder ændret),
   `prod-stage-a-ops.ts` efter næste sync (0 kritiske), `prod-party-00254-baseline.ts` (portaleksponering uændret).
6. Opdatér CLAUDE.md-noten (00254 i prod). Fase B (UI, portal-feed, F-1, F-6) kræver egen godkendelse.

## 17. Rollback-rækkefølge
- Kun kode (før migration): revert merge-commit på main og push → Vercel prod (inert kode, ingen DB-afhængighed).
- Migration: kør `docs/runbooks/sql/00254_rollback.sql` (egen godkendelse). Fjerner kun det nye; parter/relationer/
  deltagere/offentliggørelser går tabt (0 i dag); audit_logs-rækker `external_publication_*` bliver. Derefter
  `prod-verify-00254.ts pre` (2/2) og `prod-db-fingerprint` = før-filen. Gammel og ny kode virker begge uden 00254.
- Rækkefølge ved fuld tilbagerulning: migration-rollback → derefter evt. kode-revert (begge rækkefølger er kompatible).

## 18. Resterende risici
- Låse under anvendelse (sekunder): conversations ACCESS EXCLUSIVE + skrive-låse på kunde-/sagstabeller — kør efter en sync.
- F-1 (hård blokering for portaludvidelse), F-6 (fase B insert-mønster), D-1 (partsliste-læsning via customers.view.all).
- Staging/prod-forskel i default privileges: fremtidige funktioner skal altid revoke'es fra service_role eksplicit og
  ACL'en verificeres i prod (prod-db-audit / prod-verify).
- Fuld PostgREST-vej kan kun bevises på staging (prod-prøven er SQL-niveau med samme roller/claims som PostgREST sætter).
- Historiske auto-oprettede leverandør-/partnerkunder (12) er urørte; kræver separat beslutning.
