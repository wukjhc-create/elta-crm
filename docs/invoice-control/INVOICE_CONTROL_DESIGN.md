# Invoice Control pipeline — design (P3 #19)

**Status (2026-09-28):** pipelinen er kortlagt, kontrolmotoren er bygget og testet, og 3 fejl på vejen mod e-conomic er rettet. **Ingen finance-writes, ingen e-conomic-kald, ingen aktivering.**
Kode: `src/lib/invoice-control/engine.ts` · tests `scripts/invoice-control-test.ts`, `npm run harness:invoice-pipeline`.
Benchmark: KlarPris' fakturakontrol ([Installatør](https://www.installator.dk/med-klarpris%c2%92-prissammenligning-og-fakturakontrol-k%c3%b8rer-hele-indk%c3%b8bsprocessen-effektivt-og-nemt)) kontrollerer faktura mod aftale.

## 1. Tilstand i prod (read-only, kun antal)
| Mål | Værdi |
|---|---|
| Leverandørfakturaer | 53 (44 afventer godkendelse med `needs_review`, 6 med fejlet parse, 2 godkendt, 1 afvist) |
| Med fakturalinjer | **3 fakturaer / 9 linjer** |
| Linjer koblet til leverandørprodukt | **0**, så prisdækningen er **0 %** |
| Kræver manuel gennemgang | 51 |
| Bogført i e-conomic | 0 |

**Konklusion:** fakturakontrol er umulig i dag. Det skyldes ikke logikken, men at linjedata mangler.

## 2. Pipeline i dag
1. **Indlæsning**
   - Mail-cron (PDF → `pdf-parse`) og leverandør-API-cron (AO/LM) bruger begge admin-klienten.
   - Manuel upload er ikke koblet til UI'et.
   - XML accepteres kun som filnavn; der er ingen OIOUBL-parsing.
2. **Parsing (tilstand 2026-09-28):** regex giver kun **hoveddata** (nr., datoer, beløb, CVR). Mail/PDF giver **ingen linjer**. Kun API-stien skriver linjer, og den **smider leverandørens varenummer væk** (`supplier_product_id` udfyldes aldrig). Opdatering 2026-10-09: det er lukket i trin 2.
3. **Match:** leverandør via CVR/navn; sag/arbejdsordre via ordre-ref., sagsnr., titel og adresse. Intet match til indkøbsordre.
4. **Godkendelse:** kræver `incoming_invoices.approve` (admin, bogholderi) og **pusher straks til e-conomic**.
5. **Konvertering:** linjer → `case_materials`/`case_other_costs` med `unit_sales_price: 0`.
6. **Priskontrol:** findes ikke.

## 3. Fund
| # | Fund | Risiko | Status |
|---|---|---|---|
| IC1 | **Reparse genåbnede afgjorte fakturaer.** `parseAndMatch` satte altid `awaiting_approval`, så en godkendt eller bogført faktura kunne godkendes igen og **pushes til e-conomic igen**. | dobbelt-bogføring | **Rettet:** låste statusser (`approved/posted/rejected/cancelled`) afvises. Test I3. |
| IC2 | **Godkendelses-race ikke håndhævet.** Den "race-sikre" update tjekkede ikke, om en række blev ramt, så en tabt race gav alligevel "ok" og et e-conomic-forsøg. | dobbelt-bogføring | **Rettet:** 0 ramte rækker giver konflikt, og der er intet push. Test I4 (3 parallelle → 1 vinder, 2 konflikter). |
| IC3 | **Dubletkontrollen fandt altid fakturaen selv** på `file_hash`, så tjekket på leverandør + fakturanummer blev aldrig kørt. | samme faktura to gange | **Rettet:** egen række udelukkes. Test I1/I2. |
| IC4 | `applyEmailKalkiaPriceUpdates` opdaterede Kalkia-materialepriser **uden rettighedstjek** | prisintegritet (P-005-klassen) | **Rettet:** `materials.edit` |
| IC5 | API-fakturaers strukturerede hoveddata **overskrives** af regex-parse af JSON-teksten (nr., beløb, datoer bliver null) | datatab | **Rettet (2026-09-29):** en eksisterende værdi vinder altid over regex, og matcheren bruger strukturerede værdier og leverandør (`knownSupplierId`) plus adapterens ordre-/sagshints. Test I5. |
| IC9 | Leverandørens varenummer blev smidt væk (`raw_line: null`), så **ingen linje kunne matches** | kontrol umulig | **Rettet:** varenummer bevares i `raw_line`. Deterministisk linje→produkt: varenr. → EAN → varenr. i teksten, kun samme leverandør (`line-matcher.ts`). Test I6. |
| IC10 | Matcherens CVR-opslag bruger `suppliers.vat_number`, **som ikke findes** → CVR-match har aldrig virket (fejler stille) | lavere matchgrad | åben — kræver migration (kolonne) |
| IC11 | **Faktura-PDF'en læses aldrig.** Mail-synk gemmer ikke vedhæftninger (`attachment_urls`). Målt i prod (read-only, `scripts/prod-invoice-sources.ts`): 43 af 50 faktura-mails har vedhæftning, men kun 1 har links. Alle 53 fakturaer parses derfor fra mailens brødtekst (44 needs_review, 7 fejlet). | hovedårsag til lav parse-/matchgrad | **Rettet (flag OFF → godkendt TIL):** mail-synk importerer `processEmailAttachments` men kalder den aldrig. `INVOICE_ATTACHMENT_FETCH_ENABLED`. Når flaget er TIL, henter indlæsningen vedhæftninger via Graph (eksisterende `processEmailAttachments` → privat bucket `attachments`) før parsing. Fejl giver fallback til brødtekst. Test I8–I10. Aktivering + backfill af de 43 mails er **Henriks beslutning** (se backlog). |
| IC12 | pdf-parse er v2, men koden kaldte v1-API'et (`default`-funktion) → kastede altid → **ingen PDF er nogensinde blevet læst** (heller ikke uploads) | ingen PDF-parse | **Rettet:** `pdf-text.ts` bruger `PDFParse`. CI-test `test:invoice-pdf` |
| IC13 | Faktura-cron'en tager enhver mail med vedhæftning → **20 af 50 'fakturaer' er kundens egne mails** (billeder/bilag) | støj i godkendelseskøen | **Rettet:** afsender = den koblede kundes e-mail → frasorteres (`isCustomerOwnMail`). Eksisterende 20 rækker er urørte (Henriks beslutning: afvis i bulk?) |
| IC14 | Backfill via `processEmailAttachments` ville arkivere leverandørfakturaer i `customer_documents` → **synlige i kundeportalen (indkøbspriser)** | datalæk-risiko | **Forhindret:** faktura-stien bruger `archiveToCustomer: false`. Test A1–A7 (`harness:invoice-attachments`) |
| IC6 | RLS på `incoming_invoices*` er `USING (true)` for alle indloggede; gates findes kun i server-actions | P-000-klassen | åben, migration (gate) |
| IC7 | Konverterede linjer får `unit_sales_price: 0` og `billable: true` | risiko for underfakturering | BLOCKED_APPROVAL: at sætte en salgspris eller slå `billable` fra ændrer det beløb, kunden faktureres. Henrik skal godkende enten "ikke fakturerbar før kontoret sætter salgspris" eller den salgspris, der må skrives. Koden er ikke ændret. |
| IC8 | Ingen OIOUBL, intet tjek af header-total = sum af linjer, e-conomic-fejl returnerer `ok: true`, fejl kun i audit/log | kvalitet og synlighed | Delvist. 2026-10-09 grok-next: hovedbeløb mod linjesum vises (`headerLineCheck`). Samme dag: `parseOioubl` læser UBL-faktura og kreditnota. `parseAndMatch` bruger felterne og gemmer linjer kun når fakturaen ingen har. Låste fakturaer genåbnes ikke. Godkendelse og e-conomic er urørt. e-conomic `ok: true` ved fejl sidder i bogføringsstien → BLOCKED_APPROVAL: Henrik godkender at røre push-svaret. |

## 4. Reel dækning (målt)
`src/lib/invoice-control/coverage.ts` (ren; samme kode på staging og read-only i prod): `npx tsx scripts/prod-invoice-coverage.ts` og Pilot Health → Integrationer → *Fakturakontrol-dækning*. **Prod 2026-09-29: 0 % (0 af 9 linjer; 3 af 53 fakturaer har linjer)**. Nye API-fakturaer får nu varenummer og match, så tallet kan stige, men det kræver, at API-importen køres (i dag inaktiv/ukonfigureret, gate). Test I7: 75 % dækning og 100 kr merbetaling målt korrekt på en probe-faktura. Fra 2026-10-09 (grok-next) sammenligner både Pilot Health og det read-only prod-script med kostprisen på fakturadatoen, samme tilbagerulning som fakturapanelet (X1 #14). Scriptet er kun SELECT og køres ikke herfra.

## 5. Kontrolmotor (implementeret, ren)
`controlInvoice(lines, tolerance)` returnerer pr. linje `ok | overcharge | undercharge | not_controllable` (med årsag), og pr. faktura `ok | deviation | partially_controlled | not_controllable`. Den giver også **dækning i %** og **merbetaling i kr**.
- Tolerance: afvigelsen skal overstige **både** 2 % og 0,50 kr pr. enhed (afrunding giver ikke falske alarmer).
- En faktura uden kontrollerbare linjer bliver **aldrig** `ok`. Manglende data vises ærligt som manglende dækning.
- Forventet pris på fakturaen og i Pilot Health er `supplier_products.cost_price` rullet tilbage til fakturadatoen via `price_history` (første ændring efter datoen). Uden dato bruges dagens pris. En ændring uden kendt gammel pris gør linjen ukontrollerbar. Grossistaftaler (`supplier_agreements`, Profit Engine #18) er ikke koblet på.

## 6. Målbillede (trin; hver er en gate)
1. ✅ Kontrolmotor + fejlrettelser IC1–IC4.
2. **Linjedata:** DONE.
   - API-stien `ingestFromSupplierAPI` bevarer varenummer i `raw_line` og sætter `supplier_product_id` via `resolveLineProducts` (varenr. → EAN → varenr. i teksten, samme leverandør).
   - IC5 er rettet: en eksisterende værdi vinder over regex.
   - OIOUBL er leveret på grok-next og bruger samme opslag, kun når fakturaen ingen linjer har.
3. **Skygge-kontrol:** DONE. Motoren kører på fakturaer med linjer. Dækning og afvigelser vises i Pilot Health og på fakturaen. Kun visning, ingen blokering. Prisen er kostprisen på fakturadatoen.
4. **Kontrol i godkendelsen:** afvigelse > tolerance kræver eksplicit bekræftelse (som `requires_manual_review`). Godkendelse og bogføring forbliver menneskelige handlinger (finance er hard-blocked for agenter). BLOCKED_APPROVAL: den bekræftelse skal sidde i `approveInvoice`, som pusher til e-conomic. Funktionen er ikke ændret. `requires_manual_review` har allerede `acknowledgeReview`. Mangler: Henrik godkender at røre bogføringsstien.
5. **Efterkalkulation:** faktiske indkøb mod tilbuddets `profit_snapshots` (#18) pr. sag.
6. **Adskil godkendelse og bogføring:** e-conomic-push som særskilt, idempotent trin med synlig fejlstatus (IC8).
