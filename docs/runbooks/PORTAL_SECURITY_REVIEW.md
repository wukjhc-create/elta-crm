# Kundeportal — sikkerhedsreview (2026-11-18)

Branch `claude-portal-security-review` (fra prod-main `4487efd2`). Kommunikations-hub (00249/00250), reception-flag, Nila,
Relatel, mail-indtag, web-chat og retention er IKKE rørt. Ingen prod-ændring; prod er kun læst (read-only).

## 1. Udgangspunkt — hvad de to "fund" faktisk var

Efter 00250-deployet blev to tal rapporteret: "2 åbnede tilbud eksponerer kostpriser" og "1 kunde kan se 2 interne opgaver".
Begge kommer fra ældre read-only-scripts der måler HISTORISK omfang af allerede rettede fejl — ikke nuværende eksponering:

| Script | Måler | Rettet i |
|---|---|---|
| `prod-portal-cost-exposure.ts` (D24) | tilbud åbnet i portalen hvis linjer HAVDE kostdata, da portalen sendte `select('*')`-linjer til browseren | `ccced39c` (2026-10-02) — linjer via eksplicit kolonneliste |
| `prod-portal-tasks-exposure.ts` (D40) | kunder uden besigtigelsesopgave, hvor `getPortalBesigtigelser` faldt tilbage til ALLE opgaver | `71f03a79` + `a608130c` (X4) — ingen fallback |

Scriptene tæller rækker der ville have været eksponeret under den gamle kode; de ændrer sig ikke af en rettelse. Den
nuværende kode er derfor gennemgået fra bunden, og eksponeringen er målt på ny (`scripts/prod-portal-exposure-current.ts`).

## 2. Produktion nu (read-only, kun antal)

| Spørgsmål | Svar |
|---|---|
| Portal-synlige tilbud (sendt/set/accepteret/afvist) | 8 (alle hos 6 aktive portalkunder) |
| …med kostdata i DATABASEN (kostpris/leverandørkost/margin på linjer) | 7 tilbud / 3 kunder — forventet internt; **0 når browseren** (bevist i §5) |
| Tilbud der i dag sender kostfelter til kundens browser | **0** (0 kunder) |
| Opgaver hos portalkunder | 28 |
| Opgaver portalen viste med den gamle titel-regel | 6 hos **1 kunde** — alle med titlen "Besigtigelse hos …"; kun 1 har bookingformatet (kunden fik bekræftelse), 5 er oprettet af medarbejdere i andet format. Alle 6 ligger i fortiden. Til browseren gik kun fast titel "Besigtigelse", dato, status og evt. klokkeslæt — **ingen intern tekst** |
| Interne opgaver (alle andre) | 22 — aldrig vist |
| Efter 00252 + koden her | **0** opgaver vises, indtil serveren eksplicit gør en opgave kundevendt (ingen kommende besigtigelser forsvinder — alle 6 er passerede) |
| Dokumenter i portalen | 15 delte (6 besigtigelse, 4 kontrakt, 4 andet, 1 tilbud); 0 interne; 0 fra mails. 2 kontrakter har en sti uden for kundens mappe → portalen giver dem **intet link** (kun titel) — ingen indholdseksponering |
| Beskeder | 22; 0 knyttet til en anden kundes tilbud; 0 vedhæftninger uden for kundens mappe |
| `document_type='internal'` | findes ikke i prod (00184 aldrig anvendt) — interne dokumenter er `visible_in_portal=false` (standard) eller mail-arkiverede |

## 3. Fund

**S1:** ingen. Ingen kost/margin/avance/interne noter når i dag kundens browser; ingen kunde kan læse en anden kundes data
(tilbud, sag, opgave, dokument, besked, faktura, fuldmagt, PDF) — bevist med rigtig kode mod staging (§5).

**S2 — P-1: opgavesynlighed udledt af titlen.** Portalen viste/bekræftede/ombookede enhver opgave hvis titel begyndte med
"Besigtigelse hos " (uden `auto_rule`). En medarbejder der gav en intern opgave den titel, gjorde den kundesynlig (dato +
status) og bekræftbar for kunden; kunden kunne også få en rykker-mail om den. Prod: 6 opgaver hos 1 kunde, 5 ikke fra
booking-flowet. **Rettet** med eksplicit model (00252) — se §4.

**S2 — P-2: ombooking manglede `auto_rule` i opslaget.** `portalRequestReschedule` valgte ikke `auto_rule`, så en
assistent-aftale med titlen "Besigtigelse hos …" kunne ombookes fra portalen (opretter en CRM-opgave). **Rettet**
(kræver nu også `customer_visible`).

**S3 — hærdning (ingen browser-eksponering):**
- P-3 `getPortalOffers`/`getPortalOffer` valgte `offers.*` (interne noter, kilde-mail, afvisnings-IP/user-agent) ind i
  serverens hukommelse; DTO'en var allerede eksplicit. Nu `PORTAL_OFFER_COLUMNS`.
- P-4 portal-PDF valgte `offers.*` + `OFFER_LINE_PUBLIC_COLUMNS` (inkl. linjenoter/leverandørnavn); skabelonen tegnede dem
  ikke. Nu `PORTAL_OFFER_COLUMNS` + `PORTAL_PDF_LINE_COLUMNS`.
- P-5 `getPortalBesigtigelser` spredte opgaverækken (`{...t}` → `customer_id`, `auto_rule` til klienten). Nu eksplicit
  `toPortalTask` (6 felter).
- P-6 rykker-cron'en kunne maile kunden om en opgave hun ikke kan se i portalen. Nu kun `customer_visible`.
- P-7 (ikke rettet, notat) 2 delte kontrakter med sti uden for kundens mappe vises som titel uden link — kontoret bør enten
  flytte filen eller fjerne delingen.

## 4. Rettelser

**Projektioner** — `src/lib/portal/projections.ts` (ren modul, ikke `'use server'`): `PORTAL_OFFER_COLUMNS`,
`PORTAL_LINE_ITEM_COLUMNS` (salgspris, rabat, antal, enhed, linjetotal — aldrig kost/margin/noter), `PORTAL_PDF_LINE_COLUMNS`,
`PORTAL_TASK_COLUMNS`, `toPortalTask`, `PORTAL_FORBIDDEN_KEYS` + `findForbiddenPortalKeys` (bruges af tests).

**Eksplicit opgavesynlighed — migration `00252_customer_tasks_customer_visible.sql`** (00251 er reserveret til CA-3):
- `customer_tasks.customer_visible BOOLEAN NOT NULL DEFAULT false` — alle eksisterende opgaver private, ingen backfill.
- Værn `customer_tasks_visibility_guard` (BEFORE INSERT OR UPDATE): en indlogget bruger (`authenticated`) kan hverken oprette
  en kundesynlig opgave eller ændre flaget (42501). Kun service_role — dvs. serverens kontrollerede stier:
  - `bookBesigtigelse` (gate `customers.edit` + kunde-scope) sætter flaget FØRST efter at bekræftelsesmailen + ICS er sendt
    (eller udfaldet er ukendt — kunden kan have fået den).
  - `portalBookBesigtigelse` (kundens egen anmodning via gyldigt token).
- Portalen viser kun `customer_visible = true` (filter i SQL + klassifikation i kode); bekræft/ombook kræver
  `customer_visible` + booket besigtigelse; rykker-cron kun `customer_visible`.
- Ingen RLS-/grant-ændring; medarbejdere læser kolonnen som før. Admin/serviceleder/bogholderis adgang til kost i CRM er urørt.

**Database-håndhævelse:** portalen har ingen login; anon har INGEN politikker/grants på portal-tabellerne (bevist: anon
→ 42501). Grænsen er serverens tokenvalidering (`validatePortalToken`: aktivt, ikke udløbet token, aktiv kunde) + eksplicit
`customer_id` fra tokenet på hver forespørgsel + eksplicitte kolonner. Flaget for kundesynlighed er DB-håndhævet (værnet).

## 5. Tests

| Test | Resultat |
|---|---|
| `scripts/portal-security-test.ts` (projektioner, synlighedsregler, statisk: ingen `select('*')`/spredning i 14 portal-funktioner, token først, PDF, sager, cron, migration) | 72/72 |
| `cli.ts portal-00252-probe` (staging, rollback-only: standard privat, NOT NULL DEFAULT false, admin/salg/montør kan ikke oprette/ændre kundesynlighed (42501), titel/status kan rettes, service_role kan, anon 42501) | 14/14 |
| `cli.ts portal-00252-rollback-proof` (krop + rollback i én transaktion) | struktur-md5 = før, 0 objekter tilbage |
| `cli.ts portal-security-staging` (RIGTIG portalkode mod staging, kunde A/B) | 50/50 |
| `scripts/besigtigelse-task-test.ts` (opdateret: rykker kun kundevendt) | grøn |

`portal-security-staging` dækker: eget tilbud m. salgspris; svar uden kost/margin/noter (sentinel-værdier + nøglesøgning);
B's tilbud via id → afvist; egen kladde via id → afvist; accept/afvis af B's tilbud → afvist, B uændret, ingen underskrift;
kundevendt besigtigelse + egen anmodning vises; intern "Besigtigelse hos"-opgave, almindelig intern opgave, assistent-aftale
og B's opgave vises ikke og kan ikke bekræftes/ombookes via id; egen anmodning kan ikke bekræftes; eget delt dokument vises,
ikke-delt og B's vises ikke; signeret URL til B's fil/sti-traversal → afvist; egne beskeder, ikke B's; besked på B's tilbud
→ afvist, intet gemt; sager/fakturaer/fuldmagter afgrænset; ugyldigt/ukendt/udløbet/deaktiveret token → intet; B ser kun
sit; portal-PDF af B's tilbud → 404, ugyldigt token → 401.

UI (staging, bygget app): U269 (alt browseren modtager — HTML, RSC-payload, server-action-svar — uden kost/noter/intern
opgave; salgspris og kundevendt besigtigelse vist; fremmed PDF 404), U10 (kundens egen accept uden login), U180 (linjer,
rabat, totaler), U256 (accept → sag med type). Resultater: §7.

## 6. Produktionsrækkefølge (kræver Henriks godkendelse af 00252)

Koden KRÆVER kolonnen (forespørgslen filtrerer på den; uden den viser portalen ingen besigtigelser og bookingen fejler).
Kolonnen er additiv med konstant standard, og den nuværende prod-kode ignorerer den → **MIGRATION → PUSH** (som 00244):
1. Read-only før-tjek (`prod-portal-exposure-current.ts` + struktur-md5).
2. Anvend KUN 00252 (`prod-apply-migration.ts 00252 --approved-by-henrik` efter godkendelse). Mellem migration og push viser
   den gamle kode stadig de 6 passerede opgaver (uændret tilstand).
3. Push review-HEAD til main; bekræft Vercel.
4. Efter-tjek: 0 kundesynlige opgaver, portal viser 0 opgaver, `prod-portal-exposure-current.ts`, smokes.
Rollback: `docs/runbooks/sql/00252_rollback.sql` + Vercel "Promote" af forrige deployment (rul begge).

**Beslutning til Henrik:** den ene ægte booking hos kunden (bekræftet, passeret) forsvinder fra portalen — ingen handling
nødvendig. Fremtidige bookinger via "Book besigtigelse" bliver automatisk kundevendte.

## 7. Resultater på review-HEAD

| Kørsel | Resultat |
|---|---|
| tsc · check:rbac · check:rls-matrix | 0 · 0 · 0 |
| UI (staging, bygget app) U269 · U10 · U180 · U256 | PASS alle 4 |
| 165 regressionssuiter (portal, effektive rettigheder, finans 1/2 + reviews, medarbejder, tilbud, faktura, kunde, sag, opgaver/tilbageringning, mail, Relatel/telefoni, materialer/avance, reception 00249/00250) + test:time · test:profit · test:decode | 135 grønne; 30 røde — **præcis de samme 30 med samme antal FAIL pr. suite på uændret prod-main `4487efd2`** (kørt i separat worktree og sammenlignet): forældede statiske UI-tekst-tjek + den kendte `work-order-employee-check-test`. Ingen nye fejl |
| reception-test · reception-hub-test (00249/00250) | 173/173 · 143/143 |
| effective-permissions · employee-setup-integrity (59) · grok-finance-1/-2 + reviews · claude-finance-2-review | grønne |

De 30 forudeksisterende røde suiter bør ryddes op særskilt (opfølgning, ikke del af portal-sikkerhed).
