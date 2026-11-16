# ELTA AI-receptionist — fase 2 FINAL REVIEW og hærdning (2026-11-16)

Status: **klar til særskilt prod-review af 00249** — IKKE godkendt til produktion. Intet er deployet, Nila er uændret,
Relatel-flag og telefoni-persistens er uændret (FRA), intet er sendt (mail/SMS/opkald).

| | |
|---|---|
| Fase 2-branch (pushet) | `claude-ai-receptionist-phase-2` @ `c3b017d5` (origin) |
| Review-branch | `claude-ai-receptionist-phase-2-review` (fra `c3b017d5`; main ikke merget) |
| Base (prod/main) | `a1c173205df47caf881add4270e5bfe4dbe3e6db` |
| Migration | `00249_henvendelser_backbone.sql` — rettet; staging: gammel version rullet tilbage → bevis → rettet version anvendt. PROD: ikke kørt |

## 1. Fund (S1/S2/S3) og rettelser

| # | Sev | Fund | Rettelse |
|---|---|---|---|
| F1 | **S1** | En bruger med `conversations.manage` kunne oprette en henvendelse/et item direkte i tabellerne med en vilkårlig `source_table/source_id`/dedupe-nøgle (fx en andens mail) og dermed "squatte" kilden, så det legitime indtag senere blev en dublet — med forkert kunde, tekst og tidspunkt. | Ét atomisk indtag `reception_ingest(jsonb)` (SECURITY DEFINER). Kildens identitet afledes af kilderækken (`reception_source_identity`); kalderen kan kun bidrage med præsentation og motorens forslag. INSERT på `conversations`/`conversation_items` er fjernet for `authenticated`. Et item-værn (BEFORE INSERT, alle skrivere inkl. service_role) håndhæver samme regler. Et tidligt indtag er derfor identisk med det legitime og kan ikke blokere det. |
| F2 | **S1** | Indtag var to separate PostgREST-kald (henvendelse, så item, så forslag, så audit) — ikke atomisk; samtidige kald kunne ramme orphan-rækker. | Én transaktion: advisory-lås pr. nøgle → dublet-tjek → henvendelse → primært item → AI-forslag → `audit_logs`. Staging: 6 samtidige kald på samme hændelse/mail → 1 `created` + 5 `duplicate`. |
| F3 | **S1** | Ingen baggrundsaktør: nat/weekend-telefon, web-chat og webhooks kunne ikke indtages uden en indlogget medarbejder (eller kun med fri service_role). | Snævret baggrundsaktør (§3): kode-kapabilitet (læs 4 tabeller + én RPC), DB-håndhævet "kun forslag", audit i samme transaktion. |
| F4 | **S1** | L1 (kun opkalds-nummer/afsender-mail) måtte bekræfte kundeforholdet, og L1/L0 svarede forskelligt på "hvornår kommer montøren" (spørgsmålet afslørede, at nummeret tilhører en kunde). | L1 er udadtil = L0. Bekræftelsesspørgsmålet stilles uanset kandidat; fakta uden kandidat tæller som et fejlet forsøg. |
| F5 | **S1** | Sagsnummer ALENE gav L2 (sagsnumre er fortløbende og står på mails/fakturaer). L2 viste sagsnummer + fri-tekst-titel. | L2 kræver to fakta: postnr.+vejnavn ELLER sagsnummer+postnr. L2 viser KUN status-kategorien (fast enum-tekst) for ÉN åben sag — ingen titel/nummer/datoer/navne/beløb. |
| F6 | **S1** | Nød-svaret indeholdt en el-instruktion ("Sluk på hovedafbryderen …") — ikke en godkendt virksomhedsskabelon. | Fast, versioneret nød-politik (`emergency-policy.ts`, §7): gå væk fra faren, ring 112, akut overdragelse. Ingen betjening af installationen; tilføjelser kun via eksplicit godkendt liste (tom). |
| F7 | S2 | Upload-link kunne bruges flere gange indtil kvoten var brugt (ikke engangs); filendelse fra kundens filnavn; HEIC-tjek accepterede enhver MP4/MOV ("ftyp"); filnavn kunne indeholde RTL-override/sti-dele. | `consumed_at` sættes atomisk ved reservation (én afsendelse; replay/race → 0 rækker); frigives kun hvis intet blev gemt. Endelse fra kontrolleret MIME; HEIF-brand-tjek; `safeUploadName` fjerner sti, kontrol- og retningstegn. |
| F8 | S2 | Kunde-sletning efterlod `customer_match_state='confirmed'` uden kunde; en bruger kunne nulstille kunden uden versionslås (undtagelsen gjaldt al "kunde → NULL"). | Værnet genkender en FK-sletning (rækken findes ikke længere) og nulstiller match (`insufficient_information`, sag `none`); en bruger-nulstilling kræver `match_version + 1`. Sag-sletning → `case_match_state='none'`. |
| F9 | S2 | En bruger kunne indsætte AI-handlinger (`actor='ai_receptionist'`) direkte, inkl. falske "udførte". | Brugere kan kun indsætte egne handlinger (`actor='user'`, `decided_by` = sig selv). AI-handlinger kommer kun via `reception_ingest`. service_role kan ikke godkende/udføre et AI-forslag (værn). |
| F10 | S2 | En bekræftet kunde fra en menneskeligt koblet kilde (manuelt koblet mail, portal, bekræftet opkald) kunne skiftes til en anden kunde på henvendelsen. | Værnet afviser kundeskift væk fra kildens kobling (ændr koblingen i kilden i stedet). Sagskandidat skal tilhøre kunden/kandidaten. |
| F11 | S2 | Henvendelser: detaljepanel + 9 kolonner gav vandret rulning ved 1400 px; akut/ubehandlet, kandidat/bekræftet og forslag/udført var svære at skelne. | 5 kolonner (`table-fixed`), panel først ved `xl`; akutte/ubehandlede øverst med farvet kant + badge; "✓ Bekræftet" vs "Kandidat?"; handlinger grupperet: *Afventer godkendelse* / *Godkendt* / *Udført* / *Afvist-blokeret*. |
| F12 | S3 | `upload_requests` manglede indeks på `customer_id` (FK-sletning); `conversations` manglede indeks til retention og kandidat-opslag. | Indeks tilføjet (`upload_requests_customer`, `conversations_created`, `conversations_candidate`). |
| F13 | S3 | Token/udløb/loft på `upload_requests` kunne ændres af service_role-kode ved en fejl. | Værn: `token_hash`, `expires_at`, `max_files`, `created_by` er uforanderlige. |

Uafhængig review (separat agent, kun kode — ikke mine konklusioner) fandt yderligere S2/S3 — alle S2 rettet, se §11.

## 2. Migration 00249 — ændringer (før/efter)

Ingen eksisterende tabel ændres. 00249 læser kun `incoming_emails`, `portal_messages`, `telephony_calls`,
`customer_documents`, `customers`, `service_cases` og indsætter i `audit_logs` (fra `reception_ingest`).

| Objekt | Fase 2 (c3b017d5) | Final review |
|---|---|---|
| `conversations` | INSERT/UPDATE for authenticated | **kun UPDATE** (INSERT via `reception_ingest`); `intake_actor` (`user`/`ai_receptionist`) + CHECK; indeks `created`, `candidate` |
| `conversation_items` | INSERT for authenticated | **kun SELECT**; `trg_conversation_items_guard` (alle skrivere) |
| `conversation_actions` | INSERT med vilkårlig actor | INSERT kun `actor='user'`; værn: baggrund kan ikke godkende |
| `upload_requests` | flere afsendelser | `consumed_at` + CHECK `(consumed_at IS NULL) = (files_uploaded = 0)`; immutable token/udløb/loft; indeks `customer` |
| Funktioner | 3 værn + `conversation_visible` | + `reception_ingest` (DEFINER, EXECUTE: authenticated + service_role), `reception_source_identity` (DEFINER, intern), `reception_source_visible` (DEFINER, intern), `conversation_items_guard` (DEFINER), `conversation_actions_insert_guard`; `conversations_guard` → DEFINER; `conversation_visible(channel, customer, candidate)` (3 argumenter: ukoblede kræver kildens egne nøgler + kandidat i scope) |
| ACL | | alle nye funktioner `REVOKE … FROM PUBLIC, anon, authenticated`; kun `reception_ingest` og `conversation_visible` grantet |

Staging-forløb (alt read-only/rollback-only undtagen de to markerede):
1. Før: gammel 00249 anvendt (katalog 120/291, md5_core `aabc596c…`).
2. **`reception-00249-rollback-staging --confirm`** → katalog 117/281, tabeller/funktioner væk, md5_core uændret.
3. `reception-00249-rollback-proof` (rollback-only): krop → filens ROLLBACK-blok → struktur-md5 af HELE public-skemaet
   (kolonner, constraints, indeks, triggere, funktioner inkl. ACL, politikker, tabel-/kolonne-grants) = før → **OK**.
4. `reception-00249-probe` (rollback-only): **110/110** (§9). (Første runde 100/100; efter den uafhængige review udvidet og gentaget: staging rullet tilbage igen → bevis → probe → anvendt.)
5. **`migrate-staging 00249`** → tilstand: 4 tabeller, 9 funktioner, `auth_insert_conv_items=0`, `anon_grants=0`,
   `token_hash_readable=false`, `ingest_exec={anon:false, authenticated:true, service_role:true}`, md5_core uændret.
6. `reception-bg-staging` (staging, egne testrækker, ryddet op): **9/9** (§9).

Sletteadfærd: `conversations` har ingen DELETE-grant for brugere; børn kaskaderer fra henvendelsen; kunde/sag slettet →
henvendelsen bevares og match nulstilles; kundens upload-links slettes (CASCADE). Items peger på kilden uden FK
(kildens egen livscyklus) — slettes kilden, viser henvendelsen stadig sin kopi af præsentationsfeltet (≤ 500 tegn).

Retention-klarhed: `conversations_created`-indekset og `transcript_purge_after` gør en senere oprydning (fx afsluttede
henvendelser > N måneder) til én DELETE på `conversations` (kaskaderer). Ingen oprydning er slået til.

ROLLBACK-blokken er bevist eksakt (punkt 3). Efterlader bevidst: `audit_logs`-rækker og kundedokumenter modtaget via
upload-links (de tilhører kunden/sagen).

## 3. Baggrundsaktør `ai_receptionist`

Supabase har kun `service_role` som server-identitet. Aktøren er derfor IKKE "service_role med fuld myndighed", men
snævret ind i tre uafhængige lag:

1. **Kode** (`src/lib/reception/background-actor.ts`): aktøren får aldrig den rå admin-klient, kun en kapabilitet:
   `readPort.from(t).select(…)` for `customers`, `customer_contacts`, `leads`, `service_cases` (deterministisk opslag) og
   `ingest(payload)` = `rpc('reception_ingest')`. Ingen insert/update/delete/upsert, storage, andre RPC'er eller
   afsendere — bevist med kildescan + kapabilitetstest. Flag `RECEPTION_BACKGROUND_ENABLED` (standard FRA). Intet
   kalder modulet endnu (fase 3 kobler webhook/web-chat på).
2. **Database** (`reception_ingest` + værn): service_role-kald får kun `proposed`/`blocked` handlinger (selv ved
   `auto`+`execute`), ingen `assigned_profile_id`, `intake_actor='ai_receptionist'`, `created_by=NULL`; kun
   `manual`-hændelser fra `web_chat`/`voice_bridge` med ASCII-hændelses-id; aldrig simulator; aldrig bekræftet kunde
   uden en menneskeligt koblet kilde. `conversation_actions_guard` afviser at en ikke-bruger godkender/udfører et
   AI-forslag.
3. **Audit**: `audit_logs` i samme transaktion (`actor=ai_receptionist`, `mode=background`, `user_id NULL`).

Må automatisk: indtage · deterministisk kunde-/kontaktopslag · oprette henvendelsens tilstand · foreslå opgave/
tilbageringning · foreslå kunde/sag (efter politikken) · markere hastegrad · bede om menneskelig gennemgang (handoff).
Må ikke: love pris/dato · afgøre garanti/compliance · ændre faktura · annullere · sende nødpersonale · sende ekstern
kommunikation (der findes ingen afsender; `EXTERNAL_SENDS_ENABLED` er konstant `false`).

## 4. Oplysningsmatrix L0–L3 (deterministisk — `disclosure.ts`; modellen bestemmer intet)

| Niveau | Krav | Må oplyses til afsenderen | Aldrig |
|---|---|---|---|
| **L0** | ukendt/tvetydig/skjult nummer, læsefejl, ≥ 2 fejlede forsøg | Firmaviden: åbningstider, serviceområde, ydelser, standardproces. Bekræfter ALDRIG om personen er kunde | alt kundespecifikt |
| **L1** | én kandidat via opkalds-nummer, afsender-mail eller oplyst kundenummer | **Som L0.** Internt: kandidaten bruges til opslag og bekræftelsesspørgsmål | alt kundespecifikt |
| **L2** | L1 + to fakta der passer: postnr.+vejnavn ELLER sagsnr.+postnr. | + at kundeforholdet findes · status-KATEGORI (fast tekst fra `SERVICE_CASE_STATUS_LABELS`) for præcis ÉN åben sag; flere åbne sager → "en medarbejder vender tilbage" | sagsnummer, sagstitel/beskrivelse, adresse, datoer, medarbejdernavne, beløb, dokumenter, kontaktdata |
| **L3** | gyldigt portal-token (kunden er logget ind) eller fremtidig engangskode | L2 + sagsnumre på åbne sager + planlagt besøgsdato som INFORMATION (aldrig løfte) | kontaktdata, beløb/fakturaer/saldi, dokumenter, sagsdetaljer, medarbejdernavne (henvises til portal/medarbejder) |

Telefonnummer og afsender-mail er ALTID højst en kandidat (spoofbare). Ingen adgangskoder/sikkerhedsspørgsmål.
Svarene bygges kun af faste skabeloner (`engine.composeReply`); `replyViolations` er sidste værn.

Udfordringer besvaret: (a) *sagsnummer alene* er ikke nok — fortløbende og står på papirer → kræver også postnr.;
(b) *postnr.+vejnavn* er semi-offentligt → derfor giver L2 kun en status-kategori (lav følsomhed), aldrig detaljer;
(c) *nummer/mail* tæller aldrig mere end kandidat — og L1 er udadtil identisk med L0.

## 5. Nød-politik (`emergency-policy.ts`, version `emergency-v1-2026-11-16`)

Svaret er PRÆCIS: *"Gå væk fra faren. Er der fare for liv, brand, røg eller gnister, så ring 112 nu. Jeg giver din
henvendelse videre som akut, så en medarbejder ringer dig op hurtigst muligt."* — intet andet (ingen sagsstatus,
ingen bekræftelsesspørgsmål, ingen fejlsøgning). LLM'en kaldes ikke i nød-tilstand og kan hverken nedgradere hastegraden
eller tilføje handlinger. Henvendelsen: `urgency=emergency`, `status=handoff`, team service, næste skridt "Ring kunden
op NU". `dispatch_emergency` er forbudt for AI. Instruktioner om at betjene installationen (fx hovedafbryderen) er
fjernet og må kun komme tilbage som en eksplicit godkendt fast tilføjelse (`APPROVED_EMERGENCY_ADDITIONS`, tom).
Test: ingen svar i nogen scenarie matcher `UNAPPROVED_SAFETY_INSTRUCTION`.

**Kræver Henriks godkendelse af ordlyden** før den bruges over for kunder (fase 3, stemme/web-chat).

## 6. Upload-link (re-review)

| Krav | Status |
|---|---|
| Entropi | 32 tilfældige bytes (256 bit), base64url (43 tegn); formatet tjekkes før opslag |
| Lagring | kun SHA-256 (hex) i `token_hash`; authenticated kan ikke læse kolonnen (kolonne-grant); hurtig hash er tilstrækkelig ved 256-bit entropi |
| Engangs | `consumed_at` sættes atomisk ved reservation; replay/samtidigt kald → 0 rækker → "allerede brugt"; frigives kun hvis intet blev gemt |
| Udløb | 7 dage (kode), ≤ 14 dage (DB-CHECK); tjekkes ved validering OG i reservations-UPDATE |
| Binding | kunde (NOT NULL) + evt. sag (værn: sag ∈ kunde) + evt. henvendelse (værn: henvendelsens bekræftede kunde = linkets); kundeskift lukker åbne links |
| Størrelse | ≤ 9 MB pr. fil og samlet (server-action-grænse 10 MB), ≤ `max_files` (≤ 20) |
| Indhold | magic bytes: JPEG, PNG, WEBP, PDF, HEIC/HEIF (med HEIF-brand); SVG/HTML/EXE kan ikke accepteres |
| Filnavn | sti-dele, kontrol- og retningstegn fjernes; endelse fra kontrolleret type; lagersti genereres af serveren |
| Eksekverbart | ingen eksekverbare typer; filer er INTERNE dokumenter (ikke portal); PDF med JavaScript er en accepteret restrisiko (åbnes kun af medarbejdere) |
| Lækage | siden viser intet om kunde/sag før eller efter validering (kun "kan bruges"/antal); filer knyttes kun til henvendelsen hvis kunden stadig matcher |
| Flag | `RECEPTION_UPLOAD_LINKS_ENABLED` forbliver FRA (kun harness-serveren slår det til) |

## 7. Én kontrakt for alle kanaler

Mail, portal, telefoni (00247-model) og SMS (fundament) mapper alle til `InboundCommunication` (adapters.ts) og
indtages gennem SAMME `buildIngestPayload` → `reception_ingest`. Dedupe-nøglerne er identiske med databasens afledning
(`mail:incoming_emails:<id>`, `portal:portal_messages:<id>`, `<provider>:telephony_calls:<id>`). SMS afvises af databasen
(`0A000`) indtil indgående SMS findes. Ingen kanal har egen forretningslogik; kunde-/sagstidslinjen er den eksisterende
(`communication-timeline.ts`, kilde `inquiries`) — ingen ny tidslinje.

## 8. Ingen ekstern afsendelse (bevis)

Kildescan i `scripts/reception-test.ts` over hele `src/lib/reception/**`, `henvendelser.ts` og `upload-links-public.ts`:
ingen afsender-funktioner (mail/SMS/Graph/quick-reply), ingen `createServiceCase` (sender kundemail), ingen egne
`fetch` (kun via `ai-client`), ingen Relatel-/telefoni-moduler ud over ren nummer-normalisering, ingen `RELATEL_*`/
`TELEPHONY_*`, intet om Nila/routing/opkald, og kun egne `RECEPTION_*`-flag læses. U267: antal rækker i `email_messages`
og `sms_messages` er uændret efter hele forløbet.

## 9. Tests

| Test | Resultat |
|---|---|
| `scripts/reception-test.ts` (ren; inkl. adversariale tests: race/replay på upload, forfalsket payload, kapabilitets-misbrug, L0≡L1, nød, kildescan) | **173/173** |
| `reception-00249-probe` (staging, rollback-only, 5 personaer + anon + service_role) | **110/110** |
| `reception-00249-rollback-proof` (struktur-md5 af hele public = før) | **OK** (`69e870a4…` = staging før 00249) |
| `reception-bg-staging` (rigtig DB: 6 samtidige indtag ×2, baggrund-nød, audit, service_role kan ikke godkende) | **9/9** |
| tsc · check:rbac (action-gate strict/unauth/server-only) · check:rls-matrix | **0 · 0 · 0** |
| U267 (UI, staging): Henvendelser, simulator, kandidat→bekræft, auto-opgave, upload-link (forklædt fil, filnavn-sanering, replay, brugt link), 1400 px uden vandret rulning, kandidat/forslag tydelige, tidslinje, salg/montør, intet sendt | **PASS** (alle delchecks) |
| effective-permissions · employee-setup-integrity (59) | PASS |
| grok-finance-1 (+review 185) · grok-finance-2 · claude-finance-2-review (56) | PASS |
| relatel · relatel-review · telephony-persist | PASS |
| customer-email · free-mail-domains · mail-recipient · email-template-escape | PASS |
| portal-response-guard · portal-sign-label | PASS |
| besigtigelse-task · assistant-callback-reply · customer-task-actions-touch · lead-follow-up | PASS |
| phone-search · customer-csv-import · autolink-policy (dublet-/kundematch) | PASS |
| case-material-unknown-cost (156) · material-price-plan (00248) · handover-close-guard · offer-case-type | PASS |
| npm test:time · test:profit · test:decode | PASS |
| UI-regression montør/økonomi: U263 (finans) · U233 (montør-pilotkæde) · U255 (aflevering-værn) (+ U11 afhængighed) | **PASS** |

Simulator (`scripts/reception-simulator.ts`): nød-scenariet svarer nu KUN med den godkendte nød-tekst; "hvornår kommer
montøren" med kun nummer → bekræftelsesspørgsmål (samme som for ukendt nummer); bekræftet → kun status-kategori.

## 10. Resterende risici

| Risiko | Vurdering / afbødning |
|---|---|
| Baggrundsaktøren kører som service_role i databasen | Snævret i kode (kapabilitet) + DB (kun forslag, marker-værn på INSERT, ingen godkendelse) + audit. En fremtidig udvikler med admin-klienten kan stadig skrive direkte i `conversation_actions` med `actor='user'` — kodereview + kildescan. En egen Postgres-rolle via JWT kræver signeringsnøgle-opsætning (fase 3-vurdering). |
| `reception_source_visible` er en kopi af kildernes SELECT-politikker | Probe sammenligner pr. persona (12 kombinationer = eq). Ændres 00246/00247/portal-politikken, SKAL funktionen følge med. |
| Præsentationstekst (titel/resumé/preview) kopieres ind i henvendelsen og opdateres ikke, hvis kilden ændres/ignoreres; en slettet kunde efterlader en ukoblet henvendelse | Synlig kun for view_unmatched-indehavere (admin/serviceleder). Kræver en retention-/sletteregel før volumen vokser (indeks klar). |
| Nød-ordlyden er ikke godkendt af virksomheden | Bruges ikke over for kunder i fase 2 (intet sendes). Kræver Henriks godkendelse før stemme/web-chat. |
| Upload: et crash mellem reservation og første fil efterlader linket brugt | Kontoret laver et nyt link. Token ligger i URL-stien → `referrer: no-referrer` på siden; adgangslogs bør ikke gemmes med fuld sti. PDF kan indeholde JavaScript (interne dokumenter, åbnes af medarbejdere). |
| L3 (portal-token) er defineret men ikke koblet til en kanal | Ingen kanal sætter `strongVerification` endnu; L3 kan kun opnås, når portal-chat kobles på i fase 3. |
| Sager i en bekræftet kundes henvendelse: `service_case_id` vises som id; sagsnummer læses med brugerens klient | En bruger med kunde- men ikke sags-scope ser "Sag" uden nummer — ingen lækage af sagsindhold. |
| Voice/no-SIP, Relatel call-payload ikke modtaget, 00249 prod | Uændret fra fase 2 — særskilte godkendelser. |

## 11. Uafhængig review (separat agent; kun kodelæsning)

Ingen S1. Fund og håndtering:

| # | Sev | Fund | Status |
|---|---|---|---|
| R1 | S2 | Første indtager bestemmer indhold/hastegrad; et senere nød-indtag (baggrund) blev en ren dublet → nødsignal tabt. Kalder kunne vælge vilkårlig kandidat. | **Rettet**: dublet kan HÆVE hastegrad, kræve handoff og tilføje forslag (aldrig sænke/udføre), auditeret som `conversation_ingest_merged`. Medarbejderens kandidat skal findes og være i scope, ellers ignoreres den. Probe: 4 nye tjek. |
| R2 | S2 | Ukoblede henvendelser var mindre beskyttede end kilderne (telefon: calls.view vs calls.view_unmatched; mail: emails.view vs 00246's ukoblede regel); kandidatens indhold læsbart uden kandidat-scope. | **Rettet**: `conversation_visible(channel, customer, candidate)` kræver kildens ukoblede nøgler og kandidat i scope. |
| R3 | S2 | En bruger kunne sætte et AI-forslag til udført direkte uden beslutter. | **Rettet**: enhver brugers tilstandsændring/egne indsættelse kræver `decided_by = auth.uid()` + `decided_at`. |
| R4 | S2 | L0/L1 kunne skelnes via svaret ved tvetydigt nummer/læsefejl. | **Rettet**: identitets-årsager styrer kun internt handoff; svaret er identisk med ukendt nummer (test). |
| R5 | S3 | Eksistens-orakel (kilde fandtes vs skjult). | **Rettet**: synlighed tjekkes først, én neutral fejl. |
| R6 | S3 | Dublet udleverede item-id for skjult henvendelse. | **Rettet**: intet id ved skjult henvendelse. |
| R7 | S3 | Simulator kan oprette "telefon"-henvendelser (admin/serviceleder); bruger kunne indsætte udførte handlinger af vilkårlig type. | Delvist: egne handlinger kræver beslutter; AI-handlinger kun via ingest. Simulator er bevidst admin/serviceleder-værktøj og markeret `provider=simulator`. |
| R8 | S3 | service_role-kode kunne indsætte henvendelser/AI-handlinger uden om ingest (squat af dedupe-nøgle). | **Rettet**: transaktions-markør sat KUN inde i `reception_ingest`; INSERT-værn på henvendelser og AI-handlinger (probe: service_role direkte → 42501). |
| R9 | S3 | Læse-porten tillod indlejrede relationer (`*, incoming_emails(*)`). | **Rettet**: parenteser afvises (test). |
| R10 | S3 | `contact_id` ikke tjekket mod kunden; kilde-bundet kunde kunne fjernes. | **Rettet** (probe: begge 23514). |
| R11 | S3 | Kopieret indhold overlever kilde-ændring/kundesletning. | Accepteret, §10 (retention-regel før vækst). |
| R12 | S3 | Upload: crash efter reservation; token i URL; sags-scope ved oprettelse. | Delvist: `referrer: no-referrer`; resten §10 (sagen er henvendelsens bekræftede sag, som brugeren selv har valgt). |

Reviewer kunne ikke bryde: kilde-afledt identitet, afvisning af forkert kunde/sag, idempotens/lås, baggrund = kun forslag,
værn (immutable/version/sag∈kunde/sletning), upload-token/engangs/udløb/indhold/filnavn/ingen kundedata, nød-skabelon,
ingen afsendelse, search_path + EXECUTE-ACL på alle DEFINER-funktioner, ingen dynamisk SQL, komplet rollback.

## 12. Fase 3 — anbefaling (uændret rækkefølge)
1. Særskilt prod-godkendelse af 00249 (rækkefølge: PUSH kode → MIGRATION → POST-CHECK; koden tåler at tabellerne mangler).
2. Godkend nød-ordlyden; kobl baggrundsaktøren på web-chat (staging) bag `RECEPTION_BACKGROUND_ENABLED`.
3. Voice-PoC (mulighed A) på Relatel-testnummer; Relatel `call_uuid`-korrelation.
4. Retention-regel for henvendelser; udgående svar kun bag egne flag + skabeloner + godkendelse.
