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
2. **Parsing:** regex giver kun **hoveddata** (nr., datoer, beløb, CVR). Mail/PDF giver **ingen linjer**. Kun API-stien skriver linjer, og den **smider leverandørens varenummer væk** (`supplier_product_id` udfyldes aldrig).
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
| IC5 | API-fakturaers strukturerede hoveddata **overskrives** af regex-parse af JSON-teksten (nr., beløb, datoer bliver null) | datatab | åben, backlog |
| IC6 | RLS på `incoming_invoices*` er `USING (true)` for alle indloggede; gates findes kun i server-actions | P-000-klassen | åben, migration (gate) |
| IC7 | Konverterede linjer får `unit_sales_price: 0` og `billable: true` | risiko for underfakturering | åben, Profit Engine (#18) |
| IC8 | Ingen OIOUBL, intet tjek af header-total = sum af linjer, e-conomic-fejl returnerer `ok: true`, fejl kun i audit/log | kvalitet og synlighed | åben |

## 4. Kontrolmotor (implementeret, ren)
`controlInvoice(lines, tolerance)` returnerer pr. linje `ok | overcharge | undercharge | not_controllable` (med årsag), og pr. faktura `ok | deviation | partially_controlled | not_controllable`. Den giver også **dækning i %** og **merbetaling i kr**.
- Tolerance: afvigelsen skal overstige **både** 2 % og 0,50 kr pr. enhed (afrunding giver ikke falske alarmer).
- En faktura uden kontrollerbare linjer bliver **aldrig** `ok`. Manglende data vises ærligt som manglende dækning.
- Forventet pris er nettoprisen på fakturadatoen fra grossistaftalen (Profit Engine #18: `supplier_agreements`) eller `supplier_products.cost_price`.

## 5. Målbillede (trin; hver er en gate)
1. ✅ Kontrolmotor + fejlrettelser IC1–IC4.
2. **Linjedata:**
   - behold leverandørens varenummer/EAN fra API-stien og slå op til `supplier_product_id`,
   - ret IC5,
   - tilføj OIOUBL-parsing (e-faktura giver strukturerede linjer uden OCR).
3. **Skygge-kontrol:** kør motoren på alle fakturaer med linjer, og vis dækning og afvigelser i Pilot Health og på fakturaen. Kun visning, ingen blokering.
4. **Kontrol i godkendelsen:** afvigelse > tolerance kræver eksplicit bekræftelse (som `requires_manual_review`). Godkendelse og bogføring forbliver menneskelige handlinger (finance er hard-blocked for agenter).
5. **Efterkalkulation:** faktiske indkøb mod tilbuddets `profit_snapshots` (#18) pr. sag.
6. **Adskil godkendelse og bogføring:** e-conomic-push som særskilt, idempotent trin med synlig fejlstatus (IC8).
