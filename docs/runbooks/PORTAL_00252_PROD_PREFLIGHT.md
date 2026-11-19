# 00252 — produktions-preflight (kundeportal: eksplicit opgavesynlighed)

Status: FORBEREDT. Den permanente migration er IKKE kørt, og koden er IKKE deployet. Kræver Henriks særskilte godkendelse.
Godkendt review: `claude-portal-security-review` @ `6f901e2c3e409704e3f4c4f6c712888f3718637f` (review:
`PORTAL_SECURITY_REVIEW.md`). Prod-main: `4487efd223e5a61730d5fcea0fe86fd42b8c3ba8`. Værktøjet her ligger på
`claude-00252-preflight-tooling` (= review-HEAD + kun scripts/runbook; merges IKKE til main, som 00249/00250-værktøjet).
Alle prod-scripts er read-only eller rollback-only og udskriver kun antal/md5/koder.

## 1. Kildetjek
| Tjek | Resultat |
|---|---|
| origin/main | `4487efd2…` ✔ |
| review-HEAD | `6f901e2c…` ✔ — 0 bag main, 1 foran |
| migrationer i diff | kun `00252_customer_tasks_customer_visible.sql` ✔ |
| package.json / package-lock.json | uændrede ✔ |
| src/migration/rollback-SQL på værktøjsgrenen = review-HEAD | `git diff 6f901e2c -- src supabase docs/runbooks/sql` tom ✔ |

**00251:** nummeret er reserveret til CA-3 (prisfunktioner, kun forslag — ingen fil). 00252 refererer udelukkende
`customer_tasks` (eksisterende kolonner) + `pg_trigger_depth()`/`current_user`; ingen funktion, tabel eller kolonne fra
00251. Bevis: den præcise krop kører rent på prod-skemaet, der ikke har 00251 (§3). 00251 anvendes ikke.

## 2. Produktion før (read-only, `prod-00252-preflight.ts pre`, 2026-11-19)
| | |
|---|---|
| struktur-md5 (public) | `075e5dd6c5910e4746939aae53619f89` |
| `customer_tasks.customer_visible` | findes ikke; ingen 00252-funktion/-trigger |
| opgaver i alt | 28 |
| gammel titelregel ("Besigtigelse hos …" uden auto_rule / "PORTAL: Besigtigelse …") | 6 — alle hos 1 portalkunde; 1 i bookingformat |
| …heraf fremtidige | **0** (ingen kommende besigtigelse forsvinder fra portalen) |
| …rykker-kandidater (afventende + fremtidig) | **0** |
| aktive portal-tokens / portalkunder | 39 / 6 |
| tilbud der sender kost/margin/noter til browseren | **0** (`prod-portal-exposure-current.ts`) |
| tværkunde-eksponering (beskeder/vedhæftninger/dokument-stier) | **0** (2 delte kontrakter uden egen sti → intet link) |
| customer_tasks RLS/grants/triggere | fingeraftryk gemt (pol/grants/rls/other_triggers) |
| data-fingeraftryk | 17 tabeller (opgaver, kunder, sager, tilbud, linjer, underskrifter, dokumenter, beskeder, tokens, fakturaer, profiler, rettigheder, henvendelser) |

## 3. Dry-run i produktion (`prod-00252-dryrun.ts`, ÉN transaktion, ALTID ROLLBACK) — **[NY] 32/32 · [UÆNDRET] 2/2**
- krop kører rent (uden 00251); kolonne `NOT NULL DEFAULT false`; alle 28 eksisterende = false; antal uændret
- værn: BEFORE INSERT OR UPDATE pr. række, slået til, ikke SECURITY DEFINER, fast search_path, ingen EXECUTE til anon/authenticated
- RLS-politikker, tabel-grants, RLS-flag og øvrige triggere på customer_tasks **uændrede**; intet eksisterende indhold ændret (17 fingeraftryk)
- personaer (fixtures i transaktionen på to eksisterende portalkunder, ingen nye kunder): se §5
- tilbudsprojektion over alle 8 portal-tilbud / 9 linjer: ingen kost/margin/noter; salgspris/antal/rabat/linjetotal = databasens
- rykker: 0 rigtige opgaver udvælges; kun kundesynlige, afventende, fremtidige; modtager = opgavens egen kunde
- **rollback-SQL i samme transaktion:** kolonne, funktion og trigger væk; struktur-md5 = `075e5dd6…` (præcis før);
  17 data-fingeraftryk = før; RLS/grants/triggere = før
- prod efter dry-run (pre igen): struktur, sikkerhed og alle fingeraftryk identiske

Staging (permanent rollback + genanvendelse): `portal-00252-probe --rollback-staging --confirm` gav præcis den oprindelige
struktur `8a6ec86b…`; prøve 14/14; rollback-bevis eksakt; 00252 genanvendt.

## 4. Kompatibilitetsmatrix
| Tilstand | Resultat | Bevis |
|---|---|---|
| **A: gammel kode `4487efd2` + skema MED 00252** | ✔ virker uændret (titelregel som i dag) | rigtig gammel kode (worktree) mod staging m. 00252: tilbud, besigtigelser, kundens portal-booking (gemmes med flag=false, ingen fejl), dokumenter, beskeder — 5/5 (`cli.ts portal-00252-oldcode-staging`); prod-dry-run: gammel portal-forespørgsel, gammel service-insert, gammel authenticated-insert, almindelig redigering |
| **B: ny kode `6f901e2c` + skema MED 00252** | ✔ | `portal-security-staging` 50/50, U269/U10/U180/U256, prod-dry-run personaer |
| ny kode + skema UDEN 00252 | ✘ **ikke understøttet** | portalens opgave-forespørgsel → 42703 i prod (pre-tjek); bookingens flag-opdatering ville fejle |

⇒ **MIGRATION → verificér gammel kode → PUSH.** Rollback i omvendt rækkefølge: **kode først, så skema**.

## 5. Persona-/sikkerhedsresultater
Portalkunde (prod-dry-run + staging med rigtig kode):
- `customer_visible=false` returneres ikke; titlen "Besigtigelse hos …" gør den ikke synlig
- egen `customer_visible=true`-booking returneres (6 felter, ingen interne)
- anden kundes synlige opgave returneres aldrig; direkte id uden for kundens scope → ingen række
- assistent-aftale kan hverken vises, bekræftes eller ombookes (auto_rule nu med i opslaget)
Medarbejder:
- admin ser fortsat alle opgaver (32/32 inkl. fixtures); montør ser uændret kun egne (1 → 1); serviceleder: ingen aktiv
  profil i prod (NOT_TESTABLE_PROD — dækket af staging)
- almindelig redigering (beskrivelse/status/titel) virker; ingen indlogget bruger kan sætte/ændre flaget (42501)

## 6. Hvornår bliver en opgave kundesynlig (`customer_visible=true`)
ALDRIG ved oprettelse via medarbejderklienten (værnet afviser) og ALDRIG pga. titel. Kun:
- **A. Booking bekræftet** — `bookBesigtigelse` (`customer-tasks.ts`): opgaven indsættes privat (`:1022`), dobbeltklik-taberen
  sletter sig selv (`:1048`), bekræftelsesmail + ICS sendes (`:1053`); ved afvist afsendelse slettes opgaven og intet bliver
  synligt (`:1070–1075`); først derefter sættes flaget med service_role bag `customers.edit` + kunde-scope (`:1088`).
- **B. Ukendt udfald** (Graph-timeout, `emailResult.uncertain`): bookingen er committet, opgavens beskrivelse får advarslen
  "ukendt udfald — tjek Sendt post, book ikke igen", og flaget sættes — kunden kan have fået mailen, og portalen er da den
  anden kanal hvor bookingen kan ses/bekræftes. Kontoret ser advarslen i CRM.
- **C. Kundens egen portal-booking** — `portalBookBesigtigelse` (`portal.ts:2120`): indsættes kundesynlig (service_role,
  token-valideret); fejler indsættelsen, oprettes intet.
- Kaster afsendelsen en undtagelse, fanges den; opgaven forbliver PRIVAT (fail closed).

## 7. Rykker (offer-reminders cron)
Udvælgelse: `.eq('customer_visible', true)` + titel + `status='pending'` + oprettet før cutoff, derefter
`shouldRemindBesigtigelse` (kundesynlig booket besigtigelse, afventende, fremtidig tid). Modtager via opgavens egen
`customer_id` (join), aktiv kunde med e-mail; mailen indeholder kun kontaktnavn + fast tekst. Prod-dry-run: 0 rigtige
kandidater. Ingen rykker sendt under preflight (intet kald af cron'en).

## 8. Tests på review-koden (src = `6f901e2c`)
| | |
|---|---|
| portal-security-test | **71/71** (review-rapporten sagde 72 — rettelse: 71 tjek efter at en medarbejder-funktion blev taget ud af portal-listen) |
| 00252-prøve (staging, rollback-only) / rollback-bevis | 14/14 / eksakt |
| portal-security-staging (rigtig kode, kunde A/B, id-angreb) | 50/50 |
| gammel kode på nyt skema (tilstand A) | 5/5 |
| UI U269 · U10 · U180 · U256 (staging, bygget app) | PASS alle 4 |
| tsc · check:rbac · check:rls-matrix | 0 · 0 · 0 |
| regressioner: 165 suiter + test:time/profit/decode | 135 grønne; de 30 røde er **identiske (exit + antal FAIL pr. suite) med uændret prod-main `4487efd2`** og rører ikke kode denne gren ændrer — registreret separat (forældede statiske UI-tekst-tjek + kendt `work-order-employee-check-test`). Grønne bl.a.: portal-security, besigtigelse-task, effective-permissions, employee-setup-integrity, grok-finance-1/-2 + reviews, claude-finance-2-review, reception (00249) 173, reception-hub (00250) 143, relatel, relatel-review, telephony-persist, tilbud/faktura/kunde/sag-suiterne |

## 9. Deploy-sekvens (KUN efter Henriks godkendelse af 00252)
1. Baseline: `npx tsx scripts/prod-00252-preflight.ts pre --save pre.json` → alle PASS; `prod-portal-exposure-current.ts`;
   `prod-00252-dryrun.ts` → alle PASS (rollback-only). Notér migrationstid (ISO).
2. Tilføj `'00252': '<godkendelsesdato>'` til APPROVED i lokale `scripts/prod-apply-migration.ts` (committes aldrig);
   `npm run prod:apply-migration -- 00252 --approved-by-henrik` — KUN denne fil.
3. `npx tsx scripts/prod-00252-preflight.ts post --pre pre.json` → kolonne, 0 synlige, værn, RLS/grants = pre, data = pre.
4. Gammel kode på nyt skema: `npx tsx scripts/prod-00252-smoke.ts --stage old --since <migrations-ISO>` → alle PASS
   (portal ukendt token, PDF 401/400, gamle forespørgsler virker, ingen opgave synlig).
5. Fast-forward main: `git push origin 6f901e2c3e409704e3f4c4f6c712888f3718637f:refs/heads/main` (ingen merge/rebase/force).
6. Vent til Vercel Production er `success` for SHA'en; bekræft at den nye kode er live.
7–10. `npx tsx scripts/prod-00252-smoke.ts --stage new --since <deploy-ISO>` (portal, opgavesynlighed, tilbudsprojektion,
   rykker read-only) → alle PASS; `prod-portal-exposure-current.ts` → 0 eksponering, 0 opgaver i portalen.
11. Regression-smokes: `prod-smoke-00247.ts --since`, `prod-verify-00245.ts post`, `prod-smoke-finance-2.ts`,
   `prod-read-scope-effective.ts`, `prod-rls-effective.ts`, `prod-employee-integrity.ts`, `prod-mail-00246-effective.ts`,
   `prod-notes-00245-effective.ts`, `prod-00250-post-dormancy.ts --since` (hub stadig dormant).
Ingen reception-flag ændres (Stage A forbliver FRA). Ingen rigtig kundehandling.

## 10. Rollback-sekvens (rækkefølgen er obligatorisk)
1. Vercel: "Promote" den forrige production-deployment (`4487efd2`).
2. Bekræft at den gamle kode er live (Vercel-status for `4487efd2`; `prod-00252-smoke.ts --stage old` → PASS).
3. Først derefter: kør `docs/runbooks/sql/00252_rollback.sql` (kræver egen godkendelse).
**Drop aldrig `customer_visible`, mens den nye kode er live** — portalen ville fejle (42703) og bookingens flag-opdatering
fejle. Bevist: rollback-SQL genskaber præcis før-struktur (prod-dry-run og permanent på staging).

## 11. Resterende risici
- Den ene ægte (bekræftede, passerede) booking hos 1 kunde forsvinder fra portalen — ingen handling nødvendig.
- Medarbejdere kan ikke manuelt gøre en eksisterende opgave kundesynlig (bevidst — kun via booking). Ønskes det senere,
  skal det være en gated server-handling, aldrig en direkte kolonne-skrivning.
- Ved Graph-timeout (B) kan kunden se en booking i portalen uden at have fået mailen — kontoret ser advarslen i CRM.
- 2 delte kontrakter med sti uden for kundens mappe vises uden link (forudeksisterende; kontoret bør rydde op).
- 30 forudeksisterende røde regressionssuiter (identiske på prod-main) — separat oprydning.

## 12. Prod-deploy 2026-11-19 (godkendt af Henrik)
| Trin | Tid (UTC) | Resultat |
|---|---|---|
| kildetjek | — | main `4487efd2`, review `6f901e2c` (0 bag), kun 00252, package uændret, ingen 00251 |
| baseline | — | struktur `075e5dd6…`; opgaver 28; gammel titelregel 6 (0 fremtidige); rykker-kandidater 0; eksponering 0 |
| sidste dry-run | — | [NY] 32/32 · [UÆNDRET] 2/2, rullet tilbage |
| 00252 anvendt | 07:39:10 | `prod-apply-migration 00252` → COMMIT |
| post-tjek | — | 6/6: kolonne NOT NULL DEFAULT false, 0 synlige, værn, RLS/grants/data = pre; struktur `72bc9f83…` |
| gammel kode på nyt skema | — | `--stage old` 8/8 (prod serverede stadig `4487efd2`) |
| main fast-forward | 07:39:39 | `4487efd2..6f901e2c` (ingen force) |
| Vercel Production | 07:40:29 | deployment `6f901e2c` success |
| ny kode | — | `--stage new` 8/8; personaer (`prod-00252-dryrun.ts --post`) [NY] 28/28 · [UÆNDRET] 1/1; eksponering 0 |
| regression | — | 00247 16, 00245 13, finans-2 14, read-scope 192, rls-effective, mail-00246 26+12, notes 25, 00239 35, SEC-B7 23, medarbejder OK; grok-batch-3 23 PASS + 2 FORÆLDEDE forventninger (før 00248/00249) |
| hub | — | 00250-dormancy 5/5; 32/32/69 henvendelser md5 = 00250-baseline; Stage A og alle RECEPTION_* uændret FRA |

## 12. Produktions-deploy 2026-11-19 (gennemført)
| Trin | Resultat |
|---|---|
| Kildetjek | main `4487efd2`, review `6f901e2c` (0 bag), kun 00252, pakker uændrede, ingen 00251 |
| Baseline | struktur `075e5dd6…`, 28 opgaver, gammel titelregel 6 (0 fremtidige), 0 rykker-kandidater, 0 kost-/tværkunde-eksponering |
| Sidste dry-run | [NY] 32/32 · [UÆNDRET] 2/2, rullet tilbage |
| 00252 anvendt | `prod-apply-migration.ts 00252 --approved-by-henrik` → COMMIT |
| Post-tjek | 6/6 — kolonne NOT NULL DEFAULT false, 0 synlige, værn slået til, RLS/grants = pre, data = pre; struktur `72bc9f83…` |
| Gammel kode på nyt skema (`--stage old`) | 8/8 |
| main fast-forward | `4487efd2..6f901e2c` (ingen merge/rebase/force) |
| Vercel Production | deployment `7907086223` success 07:40:29Z; live side bærer `dpl_DSctcUu8HYT2Q9tkMWVbnut8pBQ5` (= 6f901e2c; før `GHpXG1a3…` = 4487efd2) |
| Ny kode (`--stage new`) | 8/8; post-tjek igen 6/6 |
| Personaer efter deploy (`prod-00252-post-personas.ts`, rollback-only) | [NY] 9/9 · [UÆNDRET] 1/1 |
| Rykker-kandidater | 0 (intet sendt) |
| Eksponering | 0 kost/margin/noter, 0 tværkunde; 0 opgaver kundesynlige (exposure-scriptets "6 i portal" måler den GAMLE titelregel) |
| Hub 00249/00250 | 32/32/69 (48 forslag) uændrede md5; dormancy 5/5; Stage A FRA |
| Regression-smokes | 00247 16/16 (Relatel 401), 00245 13/13, finance-2 14/14, read-scope 192/192, rls-effective, mail-00246 26/26 + 12/12, notes 25/25, mp-00239 35/35, sec-b7 23/23, medarbejder-integritet kørt; grok-batch-3 23 PASS + 2 forældede forventninger (før-00248/00249-skema) |
| CI | GitHub Actions "Lint, Type Check & Build" fejler — identisk på forrige prod-commit `4487efd2` (forudeksisterende, blokerer ikke Vercel) |
