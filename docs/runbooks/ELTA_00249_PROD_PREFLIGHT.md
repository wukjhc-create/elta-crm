# 00249 Henvendelser / AI-receptionist — PRODUKTIONS-PREFLIGHT (2026-11-17)

Status: **klar til Henriks særskilte godkendelse**. Intet er deployet, 00249 er IKKE anvendt i produktion (dry-run kørt i
én transaktion med ROLLBACK; prod er bevist byte-identisk med før-tilstanden bagefter). Nila, Relatel-flag og
telefoni-persistens er uændret. Intet er sendt.

## 1. Branch / kilde

| | |
|---|---|
| origin/main (prod) | `a1c173205df47caf881add4270e5bfe4dbe3e6db` ✔ |
| Godkendt review-branch | `claude-ai-receptionist-phase-2-review` @ `56decaaf44ced76a8817de1a350f3ca0e783daf7` ✔ |
| Bagud for main | 0 (3 commits foran: fase 1-doc, fase 2, final review) — fast-forward mulig |
| Migrationer ændret | kun `00249_henvendelser_backbone.sql` (ny) |
| package.json / package-lock.json | ikke ændret på branchen (lokale ændringer er bevidst ikke committet) |
| Nila | ingen kode/konfiguration i branchen rører Nila (kildescan) |
| Relatel/telefoni | ingen ændring i `src/lib/integrations/**` eller webhook-ruten; flag læses som hidtil |

Preflight-værktøj (kun scripts, ikke en del af deployet — ligger på `claude-00249-preflight-tooling`):
`scripts/prod-00249-preflight.ts` (read-only pre/post), `scripts/prod-00249-dryrun.ts` (rollback-only),
`scripts/prod-00249-code-smoke.ts` (HTTP GET + read-only efter deploy).

## 2. Dormant fundament — hvad aktiverer IKKE noget

| Punkt | Bevis |
|---|---|
| `RECEPTION_BACKGROUND_ENABLED` | Nyt flag fra denne branch; standard FRA. Uanset værdi: **intet kalder baggrundsaktøren** — ingen import af `background-actor`/`reception_ingest` uden for `src/lib/reception/**` (grep), ingen cron (15 crons i vercel.json, ingen reception-rute), ingen webhook |
| `RECEPTION_UPLOAD_LINKS_ENABLED` | Standard FRA. Upload-siden og -action afviser med "ikke slået til" FØR nogen DB-læsning; et link kan heller ikke oprettes før 00249 findes. Verificeres efter deploy med `prod-00249-code-smoke.ts` (trin 4) |
| `RECEPTION_LLM_ENABLED` | Standard FRA (kun simulator/baggrund ville bruge den) |
| Receptionist-SMS/-mail | Findes ikke: `EXTERNAL_SENDS_ENABLED` er konstant `false`, ingen env-nøgle; kildescan: ingen afsendere i reception-koden |
| Relatel persistens / live-call / SMS | Uændret (`TELEPHONY_PERSIST_ENABLED`, `RELATEL_LIVE_CALL_ENABLED`, `RELATEL_SMS_ENABLED` læses kun af den eksisterende telefoni-kode; branchen rører dem ikke). Prod: 0 opkald / 0 hændelser |
| Offentlige sider | Kun `/upload/[token]` er ny og offentlig; den opretter aldrig en henvendelse (knytter kun filer til en EKSISTERENDE, bekræftet henvendelse) og er flag-FRA |
| Henvendelser | Kun når et menneske selv bruger siden ("Hent nye" / simulator / bekræft …) |

**Begrænsning:** Vercel-miljøvariablerne kan ikke læses herfra (ingen Vercel-adgang i repoet). Flag-tilstanden bevises
derfor ved adfærd efter deploy (trin 4/9) — Henrik bør desuden se i Vercel → Settings → Environment Variables, at der
IKKE findes `RECEPTION_*`-nøgler i Production.

## 3. Produktions-før-tilstand (read-only, `prod-00249-preflight.ts pre`)

| | |
|---|---|
| Katalog / rollestandarder | **117 / 281** |
| 00249-objekter | ingen tabeller/indeks/sekvenser (conversation*/upload_request*), ingen funktioner (inkl. reception_*), ingen triggere, ingen politikker, ingen conversations.*-nøgler |
| Forudsætninger | user_has_permission, my_customer_scope_ids, my_case_scope_ids, auth.role/uid, telephony_calls, incoming_invoices, customer_contacts, 10 nøgler synligheden bruger ✔ |
| Kilde-politikker | incoming_emails = 00246 ✔ · telephony_calls = 00247 ✔ · portal_messages authenticated `true` ✔ (det `reception_source_visible` spejler) |
| Tællinger | kunder 126 · sager 8 · mails 964 (ukoblede 434, manuelt koblede 4, auto-koblede 261, webformular 50) · portal 22 (fra kunder 8, alle med tidsstempel) · opkald 0 · telefoni-hændelser 0 · dokumenter 18 · SMS 0 |
| Aktive profiler | admin 3 · montør 1 (serviceleder/salg/bogholderi prøves ved rolle på montør-profilen i en savepoint) |
| Kollisioner | ingen: nye unikke indeks ligger kun på de nye (tomme) tabeller; ingen navne-/funktions-/indeks-/trigger-kollision; GUC `reception.ingest` ikke sat |
| Struktur-md5 (hele public) | `0e95b41cd3ae1458bac21b5671b92d21` |

## 4. Dry-run i produktion (`prod-00249-dryrun.ts`, ÉN transaktion, ROLLBACK) — **51/51 PASS**

Migrationens PRÆCISE krop (filen uden BEGIN/COMMIT) kørt i prod:
- kører rent; katalog 117/281 → **120/291** (+3/+10; montør får ingen standard)
- **ingen eksisterende rækker ændret**: kunder, sager, mails, portal, opkald, hændelser, dokumenter, opgaver, kontakter,
  profiler, overrides = før (md5 af hele rækken)
- 4 tabeller med RLS; intet til anon/PUBLIC (tabel og kolonne); authenticated ingen INSERT på henvendelser/items,
  `token_hash` ulæselig, kvote ikke skrivbar
- EXECUTE: anon intet; authenticated kun `reception_ingest` + `conversation_visible`; alle DEFINER-funktioner har fast
  `search_path=public`
- service_role: tabel-privilegier KUN på de 4 nye tabeller (ingen nye grants på eksisterende tabeller)

Filens ROLLBACK-blok kørt bagefter i samme transaktion: alle 00249-objekter væk, katalog 117/281, **struktur-md5 =
før (præcis)**, data-fingeraftryk = før. Transaktionen rullet tilbage.

Efter dry-run (read-only igen): katalog, alle data-fingeraftryk og struktur-md5 **identiske** med før-tilstanden.

## 5. Personaer (i dry-run, rigtige prod-profiler, fixtures via `reception_ingest` i transaktionen)

Fixtures: simulator (telefon, ukoblet) · ukoblet mail · auto-koblet mail (kandidat) · manuelt koblet mail (bekræftet) ·
portalbesked (bekræftet) · prøve-opkald (ukoblet) · baggrund web-chat (service_role).

| Persona | Synlige | Bemærkning |
|---|---|---|
| admin | 7/7 | = reglen; synlig mail-/opkalds-henvendelse ⇒ kilden også synlig |
| serviceleder | 7/7 | = reglen (view_unmatched + calls.view_unmatched + mail-ret) |
| salg | 2/7 (kun bekræftede i scope) | ingen ukoblede; kan ikke indtage ukoblet mail (42501) |
| bogholderi | 2/7 (kun bekræftede i scope) | ingen ukoblede, ingen telefon |
| montør | 0/7 | ingen view/manage; `reception_ingest` 42501 |
| anon | — | alle 4 tabeller: læs 42501 + skriv 42501; `reception_ingest` 42501 |

For hver persona sammenlignes de synlige henvendelser med reglen (kanal-ret + kunde-scope; ukoblet kræver kildens egne
ukoblede nøgler + kandidat i scope) — 0 afvigelser — og enhver synlig mail-/opkalds-henvendelse krævede at brugeren
også kunne se kilderækken under kildens RLS. Direkte INSERT (admin) i henvendelser/items og AI-handlinger afvist.

## 6. Baggrundsaktør (sikkerhed)

Bekræftet i kode, test og prod-dry-run: ingen rå admin-klient i aktørens logik (kun læse-allowlist
customers/customer_contacts/leads/service_cases uden relationer + `reception_ingest`); kun forslag (selv ved
auto+execute); kan ikke godkende/udføre (23514); kan ikke tildele personer; kan ikke oprette henvendelser uden om
`reception_ingest` (42501); kan ikke sende mail/SMS/opkald; auditeret `actor=ai_receptionist`, `mode=background`,
`user_id NULL` i samme transaktion. `RECEPTION_BACKGROUND_ENABLED` FRA og ingen kalder.

**Rest-risiko (service_role):** databasen kender kun `service_role`. Værnene (marker kun i `reception_ingest`, INSERT-værn,
godkendelses-værn) gælder også service_role, men en server-kodebase med admin-klienten kan stadig læse/ændre ANDRE tabeller
og kan opdatere de nye tabellers præsentationsfelter. Afbødning: kapabilitets-wrapper + kildescan i test + kodereview.
Fuld DB-isolation kræver en egen Postgres-rolle via signeret JWT (fase 3-vurdering).

## 7. Nød-politik (godkendt ordlyd)

"Gå væk fra faren. Er der fare for liv, brand, røg eller gnister, så ring 112 nu. Jeg giver din henvendelse videre som
akut, så en medarbejder ringer dig op hurtigst muligt." — ingen LLM-kald i nød-tilstand, ingen hovedafbryder/el-betjening,
ingen automatisk udsendelse (`dispatch_emergency` forbudt), kun akut handoff (emergency + handoff, forslag). Test:
`reception-test` (præcis tekst, LLM spørges ikke, kan ikke nedgradere/tilføje udsendelse).

## 8. Upload-link (genbekræftet)

256-bit tilfældigt token · kun SHA-256 gemt, ulæselig for authenticated · udløb ≤ 14 dage (DB) / 7 dage (kode) · ÉN
afsendelse (`consumed_at`, replay/race → afvist) · kunde/sag/henvendelse-binding (værn) · magic-byte-indhold inkl.
HEIF-brand · filnavn-sanering, endelse fra kontrolleret type · ingen kunde-/sagsdata før/efter validering ·
`referrer: no-referrer` · flag FRA i prod. Dækket af `reception-test`, staging-probe og U267.

## 9. Tests på præcis HEAD (`src`/migration = `56decaaf`)

| Test | Resultat |
|---|---|
| reception-test | **173/173** |
| prod dry-run (rollback-only, prod) | **51/51** + prod identisk bagefter |
| staging: rollback af anvendt 00249 → rollback-bevis (struktur = før) → probe → anvend | OK · OK · **110/110** · OK |
| staging baggrund/samtidighed (`reception-bg-staging`) | 9/9 ×3 (én tidligere kørsel: 1 af 6 samtidige kald gav en transport-fejl — se nedenfor) |
| staging kapløb (`reception-race-staging`): 10×8, 25×12, 25×12 m. handlinger | 680 kald: **præcis 1 created pr. runde**, resten duplicate, 0 fejl |
| tsc · check:rbac · check:rls-matrix | 0 · 0 · 0 |
| effective-permissions · employee-setup-integrity (59) | PASS |
| grok-finance-1 (+review 185) · grok-finance-2 · claude-finance-2-review (56) | PASS |
| relatel · relatel-review · telephony-persist | PASS |
| customer-email · free-mail-domains · mail-recipient · email-template-escape | PASS |
| portal-response-guard · portal-sign-label | PASS |
| besigtigelse-task · assistant-callback-reply · customer-task-actions-touch · lead-follow-up | PASS |
| phone-search · customer-csv-import · autolink-policy | PASS |
| case-material-unknown-cost (156) · material-price-plan (00248) · handover-close-guard · offer-case-type | PASS |
| test:time · test:profit · test:decode | PASS |
| UI U267 · U263 · U233 · U255 · U11 (to kørsler pga. RAM) | **PASS** alle |

Transport-fejlen: i én kørsel returnerede ét af 6 samtidige kald `error` (ingen DB-kode) i stedet for `duplicate`; samme
runde havde stadig præcis 1 created (DB-invarianten holdt). Ikke reproducerbar i 680 efterfølgende kapløbskald + 3 gentagne
kørsler. Koden melder fejl (aldrig falsk succes); et nyt forsøg giver `duplicate`.

## 10. Produktions-rækkefølge (kræver Henriks godkendelse — CODE → TEST → PUSH → MIGRATION → POST-CHECK)

1. `git push origin 56decaaf44ced76a8817de1a350f3ca0e783daf7:refs/heads/main` (fast-forward; afvis hvis main er flyttet)
2. Vent til Vercel serverer det nye commit (Vercel → Deployments: Production = `56decaaf`, status Ready)
3. `npx tsx scripts/prod-00249-code-smoke.ts --expect-commit 56decaaf44ced76a8817de1a350f3ca0e783daf7 --migration absent`
   — Henvendelser uden login → login; tabeller fraværende (koden viser "Henvendelser er ikke slået til … migration 00249
   mangler" og kundetidslinjen springer kilden over, `isMissingTableError`)
4. Kode-smoke: samme script → `/upload/<ugyldigt>` = "ikke slået til" (flag FRA); 0 receptionist-audit; telefoni 0/0.
   Log ind som admin: siden Henvendelser viser "ikke slået til", intet andet ændret
5. `npx tsx scripts/prod-00249-preflight.ts pre --save pre.json` — skal give katalog 117/281 og struktur `0e95b41c…`
   (ellers STOP: prod har ændret sig siden preflight → ny dry-run)
6. Anvend KUN 00249: tilføj `'00249': '<godkendelsesdato>'` til APPROVED i `scripts/prod-apply-migration.ts` (først EFTER Henriks godkendelse), derefter `npm run prod:apply-migration -- 00249 --approved-by-henrik` (filen køres uændret som én transaktion)
7. `npx tsx scripts/prod-00249-preflight.ts post` — 4 tabeller m. RLS, 9 funktioner, ACL, 0 rækker, 120/291, data = pre
8. Personaer: `npx tsx scripts/prod-00249-dryrun.ts` er pre-only; efter anvendelse køres persona-delen via
   `prod-00249-code-smoke.ts --migration present` + manuel kontrol: admin ser Henvendelser (tom), montør får "ingen adgang"
9. `prod-00249-code-smoke.ts --migration present`: upload "ikke slået til", 0 rækker, 0 receptionist-audit (intet automatisk)
10. Nila: uændret (ingen ændring i Relatel-routing/Nila; bekræft i Relatel-adminpanelet at routingen er som før)
11. Relatel: `prod-smoke-00247.ts --since <deploy-tid>` — 0 opkald/hændelser, webhook-adfærd som før deploy
12. Regression-smoke: `prod-smoke-finance-2.ts`, `prod-employee-integrity.ts`, `prod-smoke-00247.ts`

Rollback (hvis nødvendigt): filens ROLLBACK-blok (bevist eksakt i prod-dry-run) og/eller Vercel "Promote" af forrige
deployment `a1c17320`. Koden tåler at tabellerne mangler.

## 11. Rest-risici

- service_role-rest-risiko (§6).
- Flag kan ikke læses herfra; tjek Vercel-env + adfærdstest (§2).
- `reception_source_visible` spejler 00246/00247/portal-politikkerne — ændres de, skal funktionen følge med (probe/dry-run
  sammenligner).
- Kopieret præsentationstekst i henvendelser og ukoblede henvendelser efter kundesletning — retention-regel før vækst.
- Prod har kun admin/montør aktive; serviceleder/salg/bogholderi er prøvet ved rolleskift i transaktionen.
- Upload: crash mellem reservation og første fil bruger linket (nyt link). Voice/no-SIP og Relatel-payload er uændrede åbne punkter.

## 11. Produktionskørsel 2026-11-17 (godkendt af Henrik)

- main hurtigspolet a1c17320 → 56decaaf (ingen merge/rebase/force); Vercel Production = 56decaaf (GitHub-deployment "Production", success)
- kode-smoke `--migration absent`: 7/7 · precheck = kendt før-tilstand (117/281, struktur 0e95b41c…)
- `prod:apply-migration -- 00249 --approved-by-henrik` → COMMIT · post 12/12: 120/291, 3 nøgler/10 standarder (ingen montør),
  4 tabeller m. RLS, 9 funktioner, 9 politikker/20 indeks/5 triggere, ingen anon/PUBLIC, alle 13 data-fingeraftryk = før
- personaer efter anvendelse (rollback-only, `prod-00249-dryrun.ts --post`): 45/45
- dormancy (`prod-00249-post-dormancy.ts --since`): 0 kunder/sager/opgaver/SMS/receptionist-audit; 0 rækker i 00249-tabellerne
- Relatel: webhook 401 uden signatur = observationstilstand (§14b i RELATEL_FINAL_REVIEW, uændret); 0 opkald/hændelser
  (`prod-smoke-00247.ts` forventer stadig 404 fra før observationstilstand — forældet forventning, ikke en regression)
